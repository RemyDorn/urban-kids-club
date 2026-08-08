/**
 * Push-Notification Service — VAPID scaffold
 *
 * Status: SCAFFOLDED, NOT WIRED INTO SERVICE LIFECYCLE
 *
 * Phase-1.5 (after PWA roll-out):
 *   1. Generate VAPID key pair → store as env vars on server
 *   2. Wire endpoints below into server.ts
 *   3. Update portal-pwa-banner.js to ask for Notification permission
 *      after the Mama opens the portal 3+ times (avoid permission-spam)
 *   4. Server emits push events on:
 *        - booking confirmation (5 sec after creation)
 *        - waitlist match (immediate)
 *        - 24h before lesson reminder
 *        - course cancellation (immediate)
 *
 * Storage:
 *   parent_push_subscriptions (parent_id, provider_id, endpoint, p256dh, auth, ua)
 *   See migrations/007_parent_push_subscriptions.sql (TODO — write together with apply 006)
 */
import type { IncomingMessage, ServerResponse } from 'http'

export interface PushSubscriptionRecord {
  parent_id: string
  provider_id: string
  endpoint: string                      // unique per device
  p256dh: string                        // base64 client public key
  auth: string                          // base64 auth secret
  user_agent?: string
  created_at: string
  last_seen_at: string
}

export interface PushPayload {
  title: string
  body: string
  url?: string                          // click target inside portal
  tag?: string                          // dedup key (e.g. booking_id)
  badge?: number                        // unread count
  silent?: boolean
}

/* -------------------------------------------------------------------------- */
/*  In-memory stub. Swap for Supabase repo once 007 migration exists.         */
/* -------------------------------------------------------------------------- */
class PushRepo {
  private store = new Map<string, PushSubscriptionRecord>()  // key: endpoint

  upsert(rec: PushSubscriptionRecord) {
    this.store.set(rec.endpoint, rec)
  }
  remove(endpoint: string) {
    this.store.delete(endpoint)
  }
  listForParent(parentId: string, providerId: string) {
    const out: PushSubscriptionRecord[] = []
    for (const r of this.store.values()) {
      if (r.parent_id === parentId && r.provider_id === providerId) out.push(r)
    }
    return out
  }
  count() { return this.store.size }
}

const repo = new PushRepo()

/* -------------------------------------------------------------------------- */
/*  VAPID key handling                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Generate a VAPID key pair. Run once, store output in env:
 *   UKC_VAPID_PUBLIC_KEY   = <publicKey>
 *   UKC_VAPID_PRIVATE_KEY  = <privateKey>
 *
 * To run:
 *   tsx -e "import('./push.service').then(m => console.log(m.generateVapidKeys()))"
 *
 * Note: this scaffold imports `web-push` lazily. If the package is not yet
 * installed, generation throws a clear error message.
 */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  try {
    // Lazy import keeps the rest of the service usable without the dep yet
    const webpush = await import('web-push').catch(() => null)
    if (!webpush) throw new Error('web-push not installed: run `bun add web-push @types/web-push`')
    return webpush.generateVAPIDKeys()
  } catch (err) {
    throw err
  }
}

function getVapidConfig() {
  const pub = process.env.UKC_VAPID_PUBLIC_KEY
  const priv = process.env.UKC_VAPID_PRIVATE_KEY
  const subject = process.env.UKC_VAPID_SUBJECT || 'mailto:hi@urbankids.club'
  if (!pub || !priv) {
    throw new Error('VAPID keys missing. Run generateVapidKeys() and set UKC_VAPID_PUBLIC_KEY + UKC_VAPID_PRIVATE_KEY in env.')
  }
  return { publicKey: pub, privateKey: priv, subject }
}

/* -------------------------------------------------------------------------- */
/*  Send notification                                                          */
/* -------------------------------------------------------------------------- */

export async function sendPush(parentId: string, providerId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const subs = repo.listForParent(parentId, providerId)
  if (subs.length === 0) return { sent: 0, failed: 0 }

  const webpush = await import('web-push').catch(() => null)
  if (!webpush) {
    console.warn('[push] web-push not installed — would have sent', payload, 'to', subs.length, 'subscriptions')
    return { sent: 0, failed: subs.length }
  }
  const cfg = getVapidConfig()
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey)

  let sent = 0, failed = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      )
      sent++
    } catch (err: unknown) {
      failed++
      // 410 Gone = subscription invalid → remove
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 410 || status === 404) repo.remove(s.endpoint)
    }
  }
  return { sent, failed }
}

/* -------------------------------------------------------------------------- */
/*  HTTP handlers                                                              */
/* -------------------------------------------------------------------------- */

interface Session { parentId: string; providerId: string }

/**
 * GET  /api/parent/push/public-key       returns the VAPID public key
 * POST /api/parent/push/subscribe        body: { endpoint, keys: { p256dh, auth } }
 * POST /api/parent/push/unsubscribe      body: { endpoint }
 *
 * `getSession` is injected so this module doesn't import auth directly.
 */
export async function handlePushRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  getSession: (req: IncomingMessage) => Session | null
): Promise<boolean> {
  const path = url.pathname
  const method = req.method ?? 'GET'

  if (path === '/api/parent/push/public-key' && method === 'GET') {
    try {
      const { publicKey } = getVapidConfig()
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ publicKey }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown_error'
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: msg }))
    }
    return true
  }

  if (path === '/api/parent/push/subscribe' && method === 'POST') {
    const session = getSession(req)
    if (!session) {
      res.statusCode = 401
      res.end(JSON.stringify({ error: 'not_authenticated' }))
      return true
    }
    const chunks: Buffer[] = []
    await new Promise<void>((resolve) => {
      req.on('data', c => chunks.push(c))
      req.on('end', () => resolve())
    })
    const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'invalid_subscription' }))
      return true
    }
    const now = new Date().toISOString()
    repo.upsert({
      parent_id: session.parentId,
      provider_id: session.providerId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: req.headers['user-agent'],
      created_at: now,
      last_seen_at: now,
    })
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: true }))
    return true
  }

  if (path === '/api/parent/push/unsubscribe' && method === 'POST') {
    const chunks: Buffer[] = []
    await new Promise<void>((resolve) => {
      req.on('data', c => chunks.push(c))
      req.on('end', () => resolve())
    })
    const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
    if (body.endpoint) repo.remove(body.endpoint)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: true }))
    return true
  }

  return false
}

/* Stats — handy for /api/admin/push/stats */
export function pushStats() { return { totalSubscriptions: repo.count() } }
