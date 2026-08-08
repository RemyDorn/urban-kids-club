/**
 * Parent Auth Routes — Phase-2 Magic-Link API
 *
 * Routes:
 *   POST /api/parent/magic-link            { email, providerId, displayName? }
 *   GET  /portal/:slug/auth?token=...      → consume + redirect to /portal/:slug
 *   GET  /api/parent/me                    (cookie-auth) returns parent + own provider link
 *   POST /api/parent/logout                clears cookie
 *
 * Cookie-Format:
 *   ukc_parent_session=<parentId>:<providerId>:<HMAC>
 *   HttpOnly, Secure, SameSite=Lax, 30 days
 *
 * Status: STUBBED. Once migration 006 is applied + supabase repo wired,
 * these routes work against real data without code changes.
 */
import { createHmac } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'http'
import { issueMagicLink, consumeMagicLink, inspectMagicLink } from './magic-link.service'
import { getParentRepo } from './parent.service'

const SESSION_COOKIE = 'ukc_parent_session'
const SESSION_TTL_DAYS = 30
// IMPORTANT: Replace with env-var SESSION_SECRET in production. The stub uses
// a deterministic local key so dev cookies survive restarts.
const SESSION_SECRET = process.env.UKC_PARENT_SESSION_SECRET || 'dev-secret-rotate-me'

function signSession(parentId: string, providerId: string): string {
  const payload = `${parentId}:${providerId}`
  const hmac = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex').slice(0, 24)
  return `${payload}:${hmac}`
}

function verifySession(cookie: string | undefined): { parentId: string; providerId: string } | null {
  if (!cookie) return null
  const parts = cookie.split(':')
  if (parts.length !== 3) return null
  const [parentId, providerId, sig] = parts
  const expected = signSession(parentId, providerId)
  return expected === cookie ? { parentId, providerId } : null
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers.cookie
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

function setCookie(res: ServerResponse, value: string, ttlDays = SESSION_TTL_DAYS) {
  const maxAge = ttlDays * 86400
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  )
}

function clearCookie(res: ServerResponse) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`)
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * Returns true if the request was handled.
 * Wire this in server.ts before generic 404 handling.
 */
export async function handleParentAuth(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const path = url.pathname
  const method = req.method ?? 'GET'

  /* ---- POST /api/parent/magic-link ---- */
  if (path === '/api/parent/magic-link' && method === 'POST') {
    try {
      const raw = await readBody(req)
      const { email, providerId, displayName } = JSON.parse(raw || '{}')
      if (!email || !providerId) {
        return json(res, 400, { error: 'email_and_providerId_required' }), true
      }
      const origin = `${url.protocol}//${url.host}`
      const result = await issueMagicLink({
        email: String(email).trim(),
        providerId: String(providerId).trim(),
        origin,
        ip: (req.socket.remoteAddress || '').toString(),
        userAgent: req.headers['user-agent'],
        display_name: displayName,
      })
      // In production: send email here. In dev: return URL so QA can click it.
      const dev = process.env.NODE_ENV !== 'production'
      json(res, 200, {
        ok: true,
        emailKnownGlobally: result.emailKnownGlobally,
        alreadyKnown: result.alreadyKnown,
        expiresAt: result.expiresAt,
        ...(dev ? { devUrl: result.url, devToken: result.token } : {}),
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown_error'
      const code = msg.startsWith('rate_limited') ? 429 : 500
      json(res, code, { error: msg })
    }
    return true
  }

  /* ---- GET /portal/:slug/auth?token=... ---- */
  const authMatch = path.match(/^\/portal\/([a-z0-9-]+)\/auth$/i)
  if (authMatch && method === 'GET') {
    const slug = authMatch[1]
    const token = url.searchParams.get('token') || ''
    if (!token) {
      res.statusCode = 400
      res.end('missing token')
      return true
    }
    const result = await consumeMagicLink({ token, providerId: slug })
    if (!result.authenticated) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(`<html><body style="font-family:sans-serif;padding:40px;max-width:540px;margin:0 auto"><h2>Magic-Link nicht gültig</h2><p>Grund: <code>${result.reason}</code></p><p>Bitte fordere einen neuen Link an. Magic-Links gelten 15 Minuten und nur einmal.</p><a href="/portal/${slug}">← Zurück zum Portal</a></body></html>`)
      return true
    }
    setCookie(res, signSession(result.parentId, result.providerId))
    res.statusCode = 302
    res.setHeader('Location', `/portal/${slug}?welcome=1`)
    res.end()
    return true
  }

  /* ---- GET /api/parent/me ---- */
  if (path === '/api/parent/me' && method === 'GET') {
    const session = verifySession(readCookie(req, SESSION_COOKIE))
    if (!session) {
      json(res, 401, { error: 'not_authenticated' })
      return true
    }
    const repo = getParentRepo()
    const parent = await repo.findById(session.parentId, { requestingProviderId: session.providerId })
    if (!parent) {
      clearCookie(res)
      json(res, 401, { error: 'parent_not_found_or_unlinked' })
      return true
    }
    const links = await repo.listLinksForParent(session.parentId, { onlyActive: true })
    const ownLink = links.find(l => l.provider_id === session.providerId)
    json(res, 200, {
      parent: { id: parent.id, email: parent.email, display_name: parent.display_name, locale: parent.locale },
      currentProvider: ownLink,
      // Other links are EXCLUDED unless the master view (Phase-2) calls.
    })
    return true
  }

  /* ---- POST /api/parent/logout ---- */
  if (path === '/api/parent/logout' && method === 'POST') {
    clearCookie(res)
    json(res, 200, { ok: true })
    return true
  }

  /* ---- Phase-2 only: GET /api/parent/me/federated  ---- */
  /* ---- (keep behind a feature flag — DO NOT enable in white-label portals) ---- */
  if (path === '/api/parent/me/federated' && method === 'GET') {
    if (process.env.UKC_FEDERATION_ENABLED !== 'true') {
      json(res, 404, { error: 'federation_disabled' })
      return true
    }
    const session = verifySession(readCookie(req, SESSION_COOKIE))
    if (!session) {
      json(res, 401, { error: 'not_authenticated' })
      return true
    }
    const repo = getParentRepo()
    const all = await repo.listLinksForParent(session.parentId, { onlyActive: true })
    const sharable = all.filter(l => l.share_with_other_providers)
    json(res, 200, { providers: sharable })
    return true
  }

  /* ---- Dev helper: GET /api/parent/inspect-token?token=... ---- */
  if (path === '/api/parent/inspect-token' && method === 'GET') {
    if (process.env.NODE_ENV === 'production') {
      json(res, 404, { error: 'not_in_production' })
      return true
    }
    const token = url.searchParams.get('token') || ''
    json(res, 200, await inspectMagicLink(token))
    return true
  }

  return false
}
