// ============================================================
// Parent Portal (Eltern-Portal) Routes
// ============================================================
// Auth: Supabase Auth Magic Link for parents.
// Parents are identified by email matching `parents.email` in DB.
// Supabase handles token generation, email sending, and JWT verification.
// Legacy custom token flow kept as fallback for backward compatibility.
// ============================================================

import { Router } from '../router'
import { requireAuth } from '../../lib/auth-middleware'
import { getServiceClient, supabase } from '../../lib/supabase'
import { rateLimit, getClientIp } from './helpers'
import { EmailService } from '../../lib/email'
import type { ParsedRequest, ApiResponse } from '../router'

function _portalEsc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function renderPortalMagicLinkEmail(actionLink: string): string {
  return `
<div style="font-family:'Inter','Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#3C2225">
  <div style="background:linear-gradient(135deg,#D4956A,#B5533A);padding:32px;border-radius:16px 16px 0 0;text-align:center">
    <div style="font-size:38px;margin-bottom:8px">🔑</div>
    <h1 style="color:white;margin:0;font-size:22px;font-weight:700">Dein Login zum Eltern-Portal</h1>
  </div>
  <div style="padding:32px;background:#FFF9F5;border-radius:0 0 16px 16px">
    <p style="font-size:15px;margin:0 0 12px">Hi!</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 18px">Klicke auf den Button, um dich beim <strong>Urban Kids Club</strong> Eltern-Portal anzumelden. Dort siehst du deine Buchungen, dein Guthaben, dein Postfach und kannst deine Stammdaten verwalten.</p>
    <div style="text-align:center;margin:28px 0">
      <a href="${_portalEsc(actionLink)}" style="display:inline-block;background:#B5533A;color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:15px">Zum Eltern-Portal →</a>
    </div>
    <p style="font-size:13px;color:#64748b;line-height:1.6;margin:0 0 12px">Dieser Link ist <strong>60 Minuten</strong> gültig und kann nur <strong>einmal</strong> verwendet werden.</p>
    <p style="font-size:11px;color:#94a3b8;margin-top:18px;line-height:1.5">Falls der Button nicht funktioniert, kopiere diese URL in deinen Browser:<br><span style="word-break:break-all;color:#64748b">${_portalEsc(actionLink)}</span></p>
    <hr style="border:none;border-top:1px solid #F2E6E2;margin:24px 0">
    <p style="color:#94a3b8;font-size:11px;text-align:center;line-height:1.5">Du hast diesen Login nicht angefordert? Du kannst die E-Mail ignorieren — es passiert nichts.<br><br>Powered by Urban Kids Club</p>
  </div>
</div>
  `
}

// ── Exported parent auth middleware ─────────────────────────
// Verify parent JWT from Supabase Auth or legacy session token.
// Resolves the Supabase user -> looks up parent by email.
// Apply to all /api/portal/* routes except auth routes.
export async function authenticateParent(req: ParsedRequest, res: ApiResponse): Promise<{ parentId: string; email: string } | null> {
  const authHeader = req.raw?.headers?.authorization || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) { res.error(401, 'Nicht eingeloggt'); return null }

  // Try Supabase Auth JWT first
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (!error && user?.email) {
      const sb = getServiceClient()
      const { data: parent } = await sb.from('parents').select('id').ilike('email', user.email).maybeSingle()
      if (parent) return { parentId: parent.id, email: user.email }
    }
  } catch {
    // Not a valid Supabase JWT — try legacy token below
  }

  // Fallback: legacy session token (parent_sessions table)
  const sb = getServiceClient()
  const { data: session } = await sb.from('parent_sessions')
    .select('parent_id, expires_at').eq('session_token', token).maybeSingle()
  if (session && new Date(session.expires_at) >= new Date()) {
    return { parentId: session.parent_id, email: '' }
  }

  res.error(401, 'Sitzung abgelaufen oder ungueltig')
  return null
}

export function registerPortalRoutes(router: Router) {

  // ── Supabase Auth: Send Magic Link ────────────────────────
  router.post('/api/portal/auth/magic-link', async (req, res) => {
    const { email } = req.body as { email?: string }
    if (!email) return res.error(400, 'E-Mail ist erforderlich')

    const normalizedEmail = email.toLowerCase().trim()
    // Rate limit: 5 login attempts per email per hour
    if (!rateLimit(`portal-login:${normalizedEmail}`, 5, 60 * 60 * 1000)) {
      return res.error(429, 'Zu viele Login-Versuche. Bitte spaeter erneut probieren.')
    }

    const sb = getServiceClient()
    // Verify email exists in parents table
    const { data: parent } = await sb.from('parents').select('id, name').ilike('email', normalizedEmail).maybeSingle()

    // Always return success (don't leak whether email exists)
    if (!parent) return res.json({ success: true })

    // Ensure Supabase Auth user exists for this parent email.
    // Parents don't register themselves — they are added by providers.
    // Try to create; if already exists, that's fine (idempotent).
    const { error: createError } = await sb.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: { role: 'parent', parent_id: parent.id },
    })
    if (createError && !createError.message?.includes('already been registered')) {
      console.error('[Portal] Failed to create auth user for parent:', createError)
      // Continue anyway — the user might already exist
    }

    // Branded Magic-Link via Resend (umgeht Supabase-Default-Email + Gmail-Filter-Issues)
    const origin = process.env.APP_PUBLIC_URL || 'https://app.urbankids.club'
    const redirectTo = `${origin}/portal/`
    console.log('[Portal-MagicLink] Start send for:', normalizedEmail, 'redirectTo:', redirectTo)
    let actionLink: string | null = null
    try {
      const result = await (sb.auth as any).admin.generateLink({
        type: 'magiclink',
        email: normalizedEmail,
        options: { redirectTo },
      })
      actionLink = result?.data?.properties?.action_link || result?.data?.action_link || null
      console.log('[Portal-MagicLink] generateLink ok, link length:', actionLink?.length)
    } catch (e: any) {
      console.error('[Portal-MagicLink] generateLink failed:', e?.message || e)
    }
    if (actionLink) {
      try {
        console.log('[Portal-MagicLink] Calling EmailService.send to:', normalizedEmail)
        const sendResult = await EmailService.send({
          to: normalizedEmail,
          subject: 'Dein Login zum Urban Kids Club Eltern-Portal',
          html: renderPortalMagicLinkEmail(actionLink),
          text: `Dein Login-Link für das Urban Kids Club Eltern-Portal:\n\n${actionLink}\n\nDer Link ist 60 Minuten gültig und kann nur einmal verwendet werden.\n\nDu hast diesen Login nicht angefordert? Einfach ignorieren — es passiert nichts.`,
        })
        console.log('[Portal-MagicLink] EmailService.send result:', JSON.stringify(sendResult))
      } catch (mailErr: any) {
        console.error('[Portal-MagicLink] Magic link email send failed:', mailErr?.message || mailErr)
      }
    } else {
      console.warn('[Portal-MagicLink] No actionLink — skipping email')
    }

    res.json({ success: true })
  })

  // ── Helper: find Supabase auth user by email (paginated listUsers)
  async function findAuthUserByEmail(emailLower: string): Promise<any> {
    const sb = getServiceClient()
    // listUsers paginated; first 200 should cover all parents in pilot phase
    try {
      const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 })
      return (data?.users || []).find((u: any) => (u.email || '').toLowerCase() === emailLower) || null
    } catch (e: any) {
      console.warn('[Portal] findAuthUserByEmail listUsers failed:', e?.message)
      return null
    }
  }

  // ── Login mit E-Mail + Passwort ─────────────────────────────
  router.post('/api/portal/auth/login', async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string }
    if (!email || !password) return res.error(400, 'E-Mail und Passwort sind erforderlich')

    const normalizedEmail = email.toLowerCase().trim()
    if (!rateLimit(`portal-login-pw:${normalizedEmail}`, 8, 15 * 60 * 1000)) {
      return res.error(429, 'Zu viele Login-Versuche. Bitte 15 Minuten warten.')
    }

    const sb = getServiceClient()
    const { data: parent } = await sb.from('parents').select('id, name, email').ilike('email', normalizedEmail).maybeSingle()
    if (!parent) return res.error(401, 'E-Mail oder Passwort falsch.')

    const { createClient } = await import('@supabase/supabase-js')
    const sbUrl = process.env.SUPABASE_URL || ''
    const sbAnon = process.env.SUPABASE_ANON_KEY || ''
    if (!sbUrl || !sbAnon) return res.error(500, 'Auth nicht konfiguriert.')
    const sbAuth = createClient(sbUrl, sbAnon, { auth: { persistSession: false } })

    const { data, error } = await sbAuth.auth.signInWithPassword({ email: normalizedEmail, password })
    if (error || !data?.session) {
      console.info(`[Portal] PW-Login fehlgeschlagen für ${normalizedEmail}: ${error?.message || 'no session'}`)
      return res.error(401, 'E-Mail oder Passwort falsch.')
    }

    res.json({
      data: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        parent: { id: parent.id, name: parent.name, email: parent.email },
      },
    })
  })

  // ── Passwort setzen (nach Magic-Link / Reset-Link) ─────────
  // Akzeptiert { accessToken, password } — der accessToken kommt vom Magic-Link Login.
  // Markiert User als password_set=true → Frontend zeigt danach Email/PW-Login statt Magic-Link.
  router.post('/api/portal/auth/set-password', async (req, res) => {
    const { accessToken, password } = req.body as { accessToken?: string; password?: string }
    if (!password) return res.error(400, 'Passwort ist erforderlich')
    if (password.length < 8) return res.error(400, 'Passwort muss mindestens 8 Zeichen lang sein')
    if (!accessToken) return res.error(400, 'Token fehlt')

    const sb = getServiceClient()
    const { createClient } = await import('@supabase/supabase-js')
    const sbUrl = process.env.SUPABASE_URL || ''
    const sbAnon = process.env.SUPABASE_ANON_KEY || ''
    if (!sbUrl || !sbAnon) return res.error(500, 'Auth nicht konfiguriert.')

    const sbAuth = createClient(sbUrl, sbAnon, { auth: { persistSession: false } })
    const { data: userResp } = await sbAuth.auth.getUser(accessToken)
    const parentEmail = userResp?.user?.email || ''
    if (!parentEmail) return res.error(401, 'Ungültiges oder abgelaufenes Token.')

    const { data: parent } = await sb.from('parents').select('id').ilike('email', parentEmail).maybeSingle()
    if (!parent) return res.error(404, 'Eltern-Account nicht gefunden.')

    const authUser = await findAuthUserByEmail(parentEmail.toLowerCase())
    if (!authUser) return res.error(404, 'Auth-User nicht gefunden.')

    const { error: updErr } = await sb.auth.admin.updateUserById(authUser.id, {
      password,
      user_metadata: { ...(authUser.user_metadata || {}), password_set: true, activated_at: new Date().toISOString() },
    })
    if (updErr) {
      console.error('[Portal] set-password admin.updateUserById failed:', updErr.message || updErr)
      return res.error(500, 'Passwort konnte nicht gesetzt werden.')
    }

    console.info(`[Portal] Passwort gesetzt für ${parentEmail} (parent ${parent.id})`)
    res.json({ success: true, data: { parentId: parent.id } })
  })

  // ── Passwort-Reset anfordern (sendet Magic-Link, danach setpw-Step) ─
  router.post('/api/portal/auth/reset-password', async (req, res) => {
    const { email } = req.body as { email?: string }
    if (!email) return res.error(400, 'E-Mail ist erforderlich')

    const normalizedEmail = email.toLowerCase().trim()
    if (!rateLimit(`portal-pwreset:${normalizedEmail}`, 3, 60 * 60 * 1000)) {
      return res.error(429, 'Zu viele Reset-Anfragen. Bitte später erneut probieren.')
    }

    const sb = getServiceClient()
    const { data: parent } = await sb.from('parents').select('id, name').ilike('email', normalizedEmail).maybeSingle()
    if (!parent) return res.error(404, 'Wir kennen diese E-Mail nicht.')

    const origin = process.env.APP_PUBLIC_URL || 'https://app.urbankids.club'
    const redirectTo = `${origin}/portal/?intent=reset`

    let actionLink: string | null = null
    try {
      const result = await (sb.auth as any).admin.generateLink({
        type: 'magiclink',
        email: normalizedEmail,
        options: { redirectTo },
      })
      actionLink = result?.data?.properties?.action_link || result?.data?.action_link || null
    } catch (e: any) {
      console.error('[Portal] reset-password generateLink failed:', e?.message)
    }

    if (!actionLink) return res.error(500, 'Reset-Link konnte nicht erzeugt werden.')

    try {
      await EmailService.send({
        to: normalizedEmail,
        subject: 'Passwort zurücksetzen — Urban Kids Club Eltern-Portal',
        html: renderPortalMagicLinkEmail(actionLink),
        text: `Passwort zurücksetzen: ${actionLink}\n\nNach dem Klick kannst du ein neues Passwort vergeben. Der Link ist 60 Minuten gültig.`,
      })
    } catch (e: any) {
      console.error('[Portal] reset-password mail send failed:', e?.message)
      return res.error(500, 'Mail-Versand fehlgeschlagen.')
    }

    console.info(`[Portal] Reset-Link gesendet an ${normalizedEmail}`)
    res.json({ success: true })
  })

  // ── Supabase Auth: Check session ──────────────────────────
  router.get('/api/portal/auth/session', async (req, res) => {
    const auth = await authenticateParent(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data: parent } = await sb.from('parents').select('id, name, email, phone, children').eq('id', auth.parentId).single()
    // Generate HMAC calendar token for iCal subscription URL
    const { createHmac } = await import('node:crypto')
    const calSecret = process.env.CALENDAR_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    const calendarToken = createHmac('sha256', calSecret).update(auth.parentId).digest('hex').slice(0, 32)
    // password_set Flag: Frontend zeigt setpw-Pane wenn false (nach erstem Magic-Link Login)
    let passwordSet = false
    try {
      const authUser = await findAuthUserByEmail((parent?.email || '').toLowerCase())
      passwordSet = !!(authUser?.user_metadata?.password_set === true)
    } catch {}
    res.json({ data: { loggedIn: true, parent, calendarToken, passwordSet } })
  })

  // ── Supabase Auth: Logout ─────────────────────────────────
  router.post('/api/portal/auth/logout', async (req, res) => {
    const authHeader = req.raw?.headers?.authorization || ''
    const token = authHeader.replace('Bearer ', '')
    if (token) {
      // Clean up legacy session if it was one
      const sb = getServiceClient()
      await sb.from('parent_sessions').delete().eq('session_token', token)
      // Note: Supabase client-side auth sessions are managed in the browser.
      // Server-side signOut is not needed since the client clears its own session.
    }
    res.json({ success: true })
  })

  // ── Legacy: send login email (uses Supabase Auth now) ─────
  router.post('/api/portal/login', async (req, res) => {
    const { email } = req.body as { email?: string }
    if (!email) return res.error(400, 'E-Mail ist erforderlich')
    const normalizedEmail = email.toLowerCase().trim()
    if (!rateLimit(`portal-login:${normalizedEmail}`, 5, 60 * 60 * 1000)) return res.error(429, 'Zu viele Login-Versuche. Bitte spaeter erneut probieren.')

    const sb = getServiceClient()
    const { data: parent } = await sb.from('parents').select('id, name').ilike('email', normalizedEmail).maybeSingle()
    if (!parent) return res.json({ success: true })

    // Ensure Supabase Auth user exists (idempotent create)
    await sb.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: { role: 'parent', parent_id: parent.id },
    })

    // Send Magic Link via Supabase Auth
    const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: `${origin}/portal/` },
    })

    if (signInError) {
      console.error('[Portal] Magic link email failed, using fallback:', signInError)
      // Fallback to custom email with custom token
      const { randomBytes } = await import('node:crypto')
      const token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      await sb.from('parent_auth_tokens').insert({ parent_id: parent.id, token, expires_at: expiresAt })
      try {
        const { EmailService } = await import('../../lib/email')
        await EmailService.send({
          to: normalizedEmail,
          subject: 'Dein Login-Link — Urban Kids Club',
          html: `
            <div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;color:#3C2225;">
              <div style="background:linear-gradient(135deg,#D4956A,#c4854a);padding:32px;border-radius:16px 16px 0 0;text-align:center;">
                <h1 style="color:white;margin:0;font-size:24px;">Dein Login-Link</h1>
              </div>
              <div style="padding:32px;background:#FFF9F5;border-radius:0 0 16px 16px;">
                <p>Hey ${parent.name},</p>
                <p>klicke auf den Button um dich einzuloggen:</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${origin}/portal/?token=${token}" style="display:inline-block;background:#D4956A;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;">Zum Eltern-Portal</a>
                </div>
                <p style="color:#94a3b8;font-size:12px;">Dieser Link ist 15 Minuten gueltig.</p>
              </div>
            </div>
          `,
        })
      } catch (e) { console.error('[Portal] Fallback login email failed:', e) }
    }

    res.json({ success: true })
  })

  // Legacy: verify magic link token -> create session
  router.post('/api/portal/verify', async (req, res) => {
    const { token } = req.body as { token?: string }
    if (!token) return res.error(400, 'Token fehlt')
    const ip = getClientIp(req)
    if (!rateLimit(`portal-verify:${ip}`, 10, 15 * 60 * 1000)) return res.error(429, 'Zu viele Versuche. Bitte warten.')
    const sb = getServiceClient()
    const { data: authToken } = await sb.from('parent_auth_tokens')
      .select('id, parent_id, expires_at, used_at')
      .eq('token', token).maybeSingle()

    if (!authToken || authToken.used_at) return res.error(401, 'Ungueltiger oder bereits verwendeter Link')
    if (new Date(authToken.expires_at) < new Date()) return res.error(401, 'Link abgelaufen — bitte fordere einen neuen an')

    await sb.from('parent_auth_tokens').update({ used_at: new Date().toISOString() }).eq('id', authToken.id)

    const { randomBytes } = await import('node:crypto')
    const sessionToken = randomBytes(32).toString('hex')
    await sb.from('parent_sessions').insert({
      parent_id: authToken.parent_id,
      session_token: sessionToken,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })

    const { data: parent } = await sb.from('parents').select('id, name, email, children').eq('id', authToken.parent_id).single()
    res.json({ data: { sessionToken, parent } })
  })

  // Helper: authenticate parent (delegates to exported authenticateParent)
  async function requireParentAuth(req: any, res: any): Promise<{ parentId: string } | null> {
    return authenticateParent(req, res)
  }

  // Get parent profile
  router.get('/api/portal/me', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data: parent } = await sb.from('parents').select('id, name, email, phone, children').eq('id', auth.parentId).single()
    // Generate HMAC calendar token for iCal subscription URL
    const { createHmac } = await import('node:crypto')
    const calSecret = process.env.CALENDAR_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    const calendarToken = createHmac('sha256', calSecret).update(auth.parentId).digest('hex').slice(0, 32)
    res.json({ data: { ...parent, calendarToken } })
  })

  // Cascade-Helper: Kind-Korrektur in alle bookings.child_info des Parents propagieren (DSGVO Recht auf Berichtigung)
  async function _portalCascadeChildToBookings(parentId: string, oldChild: any, newChild: any) {
    try {
      const db = getServiceClient()
      const oldFirst = String(oldChild?.firstName || '').toLowerCase().trim()
      const oldYear = oldChild?.birthYear ? parseInt(String(oldChild.birthYear)) : null
      if (!oldFirst && !oldYear) return
      const { data: bookings } = await db.from('provider_bookings').select('id, child_info').eq('parent_id', parentId)
      if (!bookings) return
      for (const b of bookings as any[]) {
        const ci = b.child_info || {}
        const ciFirst = String(ci.firstName || '').toLowerCase().trim()
        const ciYear = ci.birthYear ? parseInt(String(ci.birthYear)) : null
        const matches = (oldFirst ? ciFirst === oldFirst : true) && (oldYear ? ciYear === oldYear : true)
        if (!matches) continue
        const newCi = { ...ci }
        if (newChild.firstName) newCi.firstName = newChild.firstName
        if (newChild.lastName !== undefined) newCi.lastName = newChild.lastName
        if (newChild.birthYear) newCi.birthYear = newChild.birthYear
        if (newChild.name) newCi.name = newChild.name
        await db.from('provider_bookings').update({ child_info: newCi }).eq('id', b.id)
      }
    } catch (err) {
      console.warn('[portalCascadeChildToBookings] failed:', err)
    }
  }

  // GET /api/portal/me/children — Liste (für Edit-UI im Eltern-Portal)
  router.get('/api/portal/me/children', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data: parent } = await sb.from('parents').select('children').eq('id', auth.parentId).single()
    res.json({ data: parent?.children || [] })
  })

  // POST /api/portal/me/children — Kind anlegen (z.B. Stammdaten aus alter Buchung übernehmen + korrigieren)
  router.post('/api/portal/me/children', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const body = req.body as any || {}
    if (!body.firstName?.trim()) return res.error(400, 'Vorname erforderlich')
    if (body.birthYear && (body.birthYear < 2005 || body.birthYear > new Date().getFullYear())) return res.error(400, 'Ungültiges Geburtsjahr')
    const { data: parent } = await sb.from('parents').select('children').eq('id', auth.parentId).single()
    const list = (parent?.children || []) as any[]
    const newChild: any = {
      firstName: body.firstName.trim(),
      lastName: typeof body.lastName === 'string' ? body.lastName.trim() : '',
      birthYear: body.birthYear || null,
    }
    newChild.name = body.name || ((newChild.firstName || '') + ' ' + (newChild.lastName || '')).trim()
    const updated = [...list, newChild]
    const { error } = await sb.from('parents').update({ children: updated }).eq('id', auth.parentId)
    if (error) return res.error(500, error.message)
    if (body.matchOld && (body.matchOld.firstName || body.matchOld.birthYear)) {
      await _portalCascadeChildToBookings(auth.parentId, body.matchOld, newChild)
    }
    res.json({ data: { children: updated } })
  })

  // PUT /api/portal/me/children/:index — Kind editieren (Vorname, Nachname, Geburtsjahr)
  router.put('/api/portal/me/children/:index', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const idx = parseInt(req.params.index)
    const { data: parent } = await sb.from('parents').select('children').eq('id', auth.parentId).single()
    const list = (parent?.children || []) as any[]
    if (isNaN(idx) || idx < 0 || idx >= list.length) return res.error(404, 'Kind nicht gefunden')
    const old = list[idx]
    const body = req.body as any || {}
    const updated = { ...old }
    if (typeof body.firstName === 'string' && body.firstName.trim()) updated.firstName = body.firstName.trim()
    if (typeof body.lastName === 'string') updated.lastName = body.lastName.trim()
    if (body.birthYear !== undefined && body.birthYear !== null) {
      const y = parseInt(String(body.birthYear))
      if (!isNaN(y) && y >= 2005 && y <= new Date().getFullYear()) updated.birthYear = y
    }
    if (typeof body.name === 'string' && body.name.trim()) updated.name = body.name.trim()
    if (!updated.name && (updated.firstName || updated.lastName)) {
      updated.name = ((updated.firstName || '') + ' ' + (updated.lastName || '')).trim()
    }
    const newChildren = list.slice(); newChildren[idx] = updated
    const { error } = await sb.from('parents').update({ children: newChildren }).eq('id', auth.parentId)
    if (error) return res.error(500, error.message)
    await _portalCascadeChildToBookings(auth.parentId, old, updated)
    res.json({ data: { children: newChildren } })
  })

  // DELETE /api/portal/me/children/:index — Kind aus Stammdaten entfernen (Buchungen bleiben für Audit)
  router.delete('/api/portal/me/children/:index', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const idx = parseInt(req.params.index)
    const { data: parent } = await sb.from('parents').select('children').eq('id', auth.parentId).single()
    const list = (parent?.children || []) as any[]
    if (isNaN(idx) || idx < 0 || idx >= list.length) return res.error(404, 'Kind nicht gefunden')
    const newChildren = list.filter((_, i) => i !== idx)
    const { error } = await sb.from('parents').update({ children: newChildren }).eq('id', auth.parentId)
    if (error) return res.error(500, error.message)
    res.json({ data: { children: newChildren } })
  })

  // ── iCal Feed for parent's booked sessions ───────────────
  // Public endpoint using HMAC token (calendar apps can't send auth headers)
  // URL format: /api/portal/calendar/:token.ics
  // Token = HMAC-SHA256(parentId, secret).slice(0,32) — not guessable from UUID
  router.get('/api/portal/calendar/:token.ics', async (req, res) => {
    const token = req.params.token
    if (!token || token.length < 16) return res.error(400, 'Ungültiger Kalender-Token')

    const sb = getServiceClient()

    // Look up parent by calendar token
    const { createHmac } = await import('node:crypto')
    const calSecret = process.env.CALENDAR_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!calSecret) return res.error(500, 'Kalender nicht konfiguriert')

    // Query parents with a limit to avoid loading entire table, check token per batch
    const { data: parents } = await sb.from('parents').select('id, name, email').limit(500)
    if (!parents || parents.length === 0) return res.error(404, 'Nicht gefunden')

    const parent = parents.find((p: any) => {
      const expectedToken = createHmac('sha256', calSecret).update(p.id).digest('hex').slice(0, 32)
      return expectedToken === token
    })
    if (!parent) return res.error(404, 'Nicht gefunden')
    const parentId = parent.id

    // Get all active bookings for this parent
    const { data: bookings } = await sb.from('provider_bookings')
      .select('id, activity_id, provider_id, child_info, status')
      .eq('parent_id', parentId).in('status', ['confirmed', 'pending'])

    if (!bookings?.length) {
      const emptyIcal = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Urban Kids Club//Eltern-Portal//DE\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:Meine Kurse\r\nX-WR-TIMEZONE:Europe/Berlin\r\nEND:VCALENDAR\r\n'
      const raw = (req as any).raw
      if (raw?.res) {
        raw.res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="meine-kurse.ics"' })
        raw.res.end(emptyIcal)
      } else {
        res.json({ data: emptyIcal })
      }
      return
    }

    // Load activities + providers + block sessions
    const actIds = [...new Set(bookings.map((b: any) => b.activity_id))]
    const provIds = [...new Set(bookings.map((b: any) => b.provider_id))]
    const { data: acts } = await sb.from('activities').select('id, title, schedule, duration_minutes, category').in('id', actIds)
    const { data: provs } = await sb.from('providers').select('id, company_name, display_name').in('id', provIds)
    const actMap = new Map((acts ?? []).map((a: any) => [a.id, a]))
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, p.display_name || p.company_name]))

    // Get block sessions for enrolled courses
    const { data: enrollments } = await sb.from('block_enrollments')
      .select('id, block_id, activity_id')
      .eq('parent_id', parentId)
    const blockIds = [...new Set((enrollments ?? []).map((e: any) => e.block_id))]
    const { data: blockSessions } = blockIds.length
      ? await sb.from('block_sessions').select('id, block_id, date, start_time, end_time, status').in('block_id', blockIds).order('date')
      : { data: [] }
    const enrollmentByActivity = new Map((enrollments ?? []).map((e: any) => [e.activity_id, e.block_id]))
    const sessionsByBlock = new Map<string, any[]>()
    for (const s of blockSessions ?? []) {
      if (!sessionsByBlock.has(s.block_id)) sessionsByBlock.set(s.block_id, [])
      sessionsByBlock.get(s.block_id)!.push(s)
    }

    const dayToNum: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
    const now = new Date()
    const weeks = 12

    let ical = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Urban Kids Club//Eltern-Portal//DE\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:Meine Kurse\r\nX-WR-TIMEZONE:Europe/Berlin\r\nMETHOD:PUBLISH\r\n'

    const fmtDt = (dt: Date) => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const escIcal = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

    for (const booking of bookings) {
      const act = actMap.get(booking.activity_id)
      if (!act) continue
      const provName = provMap.get(booking.provider_id) || ''
      const ci = booking.child_info as any
      const childName = ci?.firstName ? `${ci.firstName} ${ci.lastName || ''}`.trim() : ''
      const desc = childName ? `${childName} – ${provName}` : provName

      // If booking has block sessions, use those specific dates
      const blockId = enrollmentByActivity.get(booking.activity_id)
      if (blockId && sessionsByBlock.has(blockId)) {
        for (const s of sessionsByBlock.get(blockId)!) {
          if (s.status === 'cancelled') continue
          const [sh, sm] = (s.start_time || '00:00').split(':').map(Number)
          const [eh, em] = (s.end_time || '01:00').split(':').map(Number)
          const dtStart = new Date(s.date + 'T00:00:00'); dtStart.setHours(sh, sm, 0, 0)
          const dtEnd = new Date(s.date + 'T00:00:00'); dtEnd.setHours(eh, em, 0, 0)

          ical += 'BEGIN:VEVENT\r\n'
          ical += `UID:${booking.id}-${s.date}@urbankids.club\r\n`
          ical += `DTSTART;TZID=Europe/Berlin:${fmtDt(dtStart).slice(0, -1)}\r\n`
          ical += `DTEND;TZID=Europe/Berlin:${fmtDt(dtEnd).slice(0, -1)}\r\n`
          ical += `SUMMARY:${escIcal(act.title)}\r\n`
          ical += `DESCRIPTION:${escIcal(desc)}\r\n`
          ical += 'END:VEVENT\r\n'
        }
        continue
      }

      // Otherwise generate from recurring schedule
      const sched = act.schedule as any
      const slots = Array.isArray(sched) ? sched : (sched?.slots ?? [])
      const startDate = sched?.startDate ? new Date(sched.startDate) : now
      const endDate = sched?.endDate ? new Date(sched.endDate) : new Date(now.getTime() + weeks * 7 * 86400000)

      for (const slot of slots) {
        const targetDay = dayToNum[slot.day?.toUpperCase()]
        if (targetDay === undefined) continue

        let d = new Date(startDate)
        while (d.getDay() !== targetDay && d <= endDate) d.setDate(d.getDate() + 1)

        while (d <= endDate) {
          const [sh, sm] = (slot.startTime || '00:00').split(':').map(Number)
          const [eh, em] = (slot.endTime || '01:00').split(':').map(Number)
          const dtStart = new Date(d); dtStart.setHours(sh, sm, 0, 0)
          const dtEnd = new Date(d); dtEnd.setHours(eh, em, 0, 0)

          ical += 'BEGIN:VEVENT\r\n'
          ical += `UID:${booking.id}-${d.toISOString().slice(0, 10)}@urbankids.club\r\n`
          ical += `DTSTART;TZID=Europe/Berlin:${fmtDt(dtStart).slice(0, -1)}\r\n`
          ical += `DTEND;TZID=Europe/Berlin:${fmtDt(dtEnd).slice(0, -1)}\r\n`
          ical += `SUMMARY:${escIcal(act.title)}\r\n`
          ical += `DESCRIPTION:${escIcal(desc)}\r\n`
          ical += 'END:VEVENT\r\n'

          d.setDate(d.getDate() + 7)
        }
      }
    }

    ical += 'END:VCALENDAR\r\n'

    const raw = (req as any).raw
    if (raw?.res) {
      raw.res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="meine-kurse.ics"' })
      raw.res.end(ical)
    } else {
      res.json({ data: ical })
    }
  })

  // Get parent's bookings across all providers
  router.get('/api/portal/bookings', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data: bookings } = await sb.from('provider_bookings')
      .select('id, activity_id, provider_id, child_info, status, payment_status, payment_method, amount_paid, currency, created_at')
      .eq('parent_id', auth.parentId).order('created_at', { ascending: false })

    // Enrich with activity titles + provider names
    const actIds = [...new Set((bookings ?? []).map((b: any) => b.activity_id))]
    const provIds = [...new Set((bookings ?? []).map((b: any) => b.provider_id))]
    const { data: acts } = actIds.length ? await sb.from('activities').select('id, title, schedule').in('id', actIds) : { data: [] }
    const { data: provs } = provIds.length ? await sb.from('providers').select('id, company_name, display_name').in('id', provIds) : { data: [] }
    const actMap = new Map((acts ?? []).map((a: any) => [a.id, a]))
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, p.display_name || p.company_name]))

    // Enrollments → Block + Sessions joinen (My-Courses-Card erwartet b.sessions + b.block)
    // Hinweis: block_enrollments hat KEINE activity_id Spalte (nur block_id + booking_id).
    // Activity-Resolution geht via course_blocks.activity_id, daher hier nur booking_id-Matching.
    const { data: enrollments } = await sb.from('block_enrollments')
      .select('id, block_id, booking_id, child_id, status')
      .eq('parent_id', auth.parentId)
    const enrByBooking = new Map<string, any>()
    for (const e of (enrollments ?? [])) {
      if (e.booking_id) enrByBooking.set(e.booking_id, e)
    }
    const blockIds = [...new Set((enrollments ?? []).map((e: any) => e.block_id).filter(Boolean))]
    const { data: blocksData } = blockIds.length
      ? await sb.from('course_blocks').select('id, total_sessions, capacity, recurring_day, recurring_time, start_date, end_date').in('id', blockIds)
      : { data: [] }
    const blockMap = new Map((blocksData ?? []).map((b: any) => [b.id, b]))
    const { data: blockSessionRows } = blockIds.length
      ? await sb.from('block_sessions')
          .select('id, block_id, session_number, date, start_time, end_time, status')
          .in('block_id', blockIds)
          .order('session_number', { ascending: true })
      : { data: [] }
    const sessionsByBlock = new Map<string, any[]>()
    for (const s of (blockSessionRows ?? [])) {
      if (!sessionsByBlock.has(s.block_id)) sessionsByBlock.set(s.block_id, [])
      sessionsByBlock.get(s.block_id)!.push(s)
    }

    // Attendance-Records: Map (enrollmentId|sessionId) → status
    // Damit das Frontend pro Session "da/krank/eingecheckt" anzeigen kann
    const enrollmentIds = (enrollments ?? []).map((e: any) => e.id).filter(Boolean)
    const { data: attendanceRows } = enrollmentIds.length
      ? await sb.from('session_attendance_records')
          .select('session_id, enrollment_id, status')
          .in('enrollment_id', enrollmentIds)
      : { data: [] }
    const attByKey = new Map<string, string>()
    for (const a of (attendanceRows ?? [])) {
      attByKey.set(a.enrollment_id + '|' + a.session_id, a.status)
    }

    // EnrolledCount pro Block (für Auslastungs-Anzeige)
    const enrolledCountByBlock = new Map<string, number>()
    if (blockIds.length) {
      const { data: enrCounts } = await sb.from('block_enrollments')
        .select('block_id')
        .in('block_id', blockIds)
        .eq('status', 'active')
      for (const e of (enrCounts ?? [])) {
        enrolledCountByBlock.set(e.block_id, (enrolledCountByBlock.get(e.block_id) || 0) + 1)
      }
    }

    const enriched = (bookings ?? []).map((b: any) => {
      const enr = enrByBooking.get(b.id) || null
      const blk = enr ? blockMap.get(enr.block_id) : null
      // Sessions mit attendance_status pro Enrollment anreichern
      const sess = enr
        ? (sessionsByBlock.get(enr.block_id) || []).map((s: any) => ({
            ...s,
            attendance_status: attByKey.get(enr.id + '|' + s.id) || null,
          }))
        : []
      return {
        ...b,
        activityTitle: actMap.get(b.activity_id)?.title || 'Kurs',
        providerName: provMap.get(b.provider_id) || 'Anbieter',
        schedule: actMap.get(b.activity_id)?.schedule || null,
        enrollmentId: enr?.id || null,
        block: blk
          ? {
              id: blk.id,
              totalSessions: blk.total_sessions,
              capacity: blk.capacity,
              enrolledCount: enrolledCountByBlock.get(blk.id) || 0,
              startDate: blk.start_date,
              endDate: blk.end_date,
            }
          : null,
        sessions: sess,
      }
    })
    res.json({ data: enriched })
  })

  // Get single booking detail (with sessions)
  router.get('/api/portal/bookings/:id', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data: booking } = await sb.from('provider_bookings')
      .select('*')
      .eq('id', req.params.id).eq('parent_id', auth.parentId).maybeSingle()
    if (!booking) return res.error(404, 'Buchung nicht gefunden')

    // Get activity + provider
    const { data: activity } = await sb.from('activities').select('id, title, schedule').eq('id', booking.activity_id).maybeSingle()
    const { data: provider } = await sb.from('providers').select('id, company_name, display_name').eq('id', booking.provider_id).maybeSingle()

    // Get enrollment + block sessions if this booking has an enrollment
    let sessions: any[] = []
    const { data: enrollment } = await sb.from('block_enrollments')
      .select('id, block_id')
      .eq('parent_id', auth.parentId).eq('activity_id', booking.activity_id)
      .maybeSingle()
    if (enrollment) {
      const { data: blockSessions } = await sb.from('block_sessions')
        .select('id, date, start_time, end_time, status')
        .eq('block_id', enrollment.block_id)
        .order('date', { ascending: true })
      sessions = blockSessions ?? []
    }

    res.json({ data: {
      ...booking,
      activityTitle: activity?.title || 'Kurs',
      providerName: provider?.display_name || provider?.company_name || 'Anbieter',
      schedule: activity?.schedule || null,
      sessions,
    }})
  })

  // Get credit balance per child
  router.get('/api/portal/credits', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()

    // Get parent's children info
    const { data: parent } = await sb.from('parents').select('children').eq('id', auth.parentId).single()
    const children: Array<{ id: string; firstName: string; lastName?: string }> = parent?.children ?? []

    // Get all credits for this parent
    const { data: credits } = await sb.from('session_credits')
      .select('id, child_id, status, activity_type, valid_until, reason, original_session_date, created_at, used_at')
      .eq('parent_id', auth.parentId)
      .order('created_at', { ascending: false })

    // Group by child
    const childMap = new Map(children.map((c: any) => [c.id, c]))
    const perChild: Record<string, { childName: string; available: number; used: number; expired: number; credits: any[] }> = {}

    for (const c of children) {
      const name = (c.firstName + ' ' + (c.lastName || '')).trim()
      perChild[c.id] = { childName: name, available: 0, used: 0, expired: 0, credits: [] }
    }

    for (const cr of (credits ?? [])) {
      if (!perChild[cr.child_id]) {
        perChild[cr.child_id] = { childName: 'Kind', available: 0, used: 0, expired: 0, credits: [] }
      }
      const entry = perChild[cr.child_id]
      if (cr.status === 'available') entry.available++
      else if (cr.status === 'used') entry.used++
      else if (cr.status === 'expired') entry.expired++
      entry.credits.push(cr)
    }

    res.json({ data: perChild })
  })

  // Get credit transaction history
  router.get('/api/portal/credits/history', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()

    const { data: credits } = await sb.from('session_credits')
      .select('id, child_id, status, activity_type, reason, is_provider_cancellation, original_session_date, valid_until, used_at, created_at')
      .eq('parent_id', auth.parentId)
      .order('created_at', { ascending: false })
      .limit(100)

    // Get children names
    const { data: parent } = await sb.from('parents').select('children').eq('id', auth.parentId).single()
    const children: Array<{ id: string; firstName: string; lastName?: string }> = parent?.children ?? []
    const childMap = new Map(children.map((c: any) => [c.id, (c.firstName + ' ' + (c.lastName || '')).trim()]))

    const enriched = (credits ?? []).map((cr: any) => ({
      ...cr,
      childName: childMap.get(cr.child_id) || 'Kind',
    }))

    res.json({ data: enriched })
  })

  // Get parent's invoices (with optional status filter)
  router.get('/api/portal/invoices', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const statusFilter = req.query?.status as string | undefined
    let query = sb.from('invoices')
      .select('id, number, status, total, currency, issued_at, due_date, paid_at, provider_id')
      .eq('parent_id', auth.parentId).order('issued_at', { ascending: false })
    if (statusFilter && ['draft', 'sent', 'paid', 'cancelled'].includes(statusFilter)) {
      query = query.eq('status', statusFilter)
    }
    const { data } = await query

    // Enrich with provider names
    const provIds = [...new Set((data ?? []).map((inv: any) => inv.provider_id))]
    const { data: provs } = provIds.length ? await sb.from('providers').select('id, company_name, display_name').in('id', provIds) : { data: [] }
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, p.display_name || p.company_name]))

    const enriched = (data ?? []).map((inv: any) => ({
      ...inv,
      providerName: provMap.get(inv.provider_id) || 'Anbieter',
      // Mark overdue: sent + due_date in past
      isOverdue: inv.status === 'sent' && inv.due_date && new Date(inv.due_date) < new Date(),
    }))
    res.json({ data: enriched })
  })

  // Get invoice detail/view — returns URL to the actual view route
  router.get('/api/portal/invoices/:id/view', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    // Verify invoice belongs to parent
    const { data: invoice } = await sb.from('invoices')
      .select('id').eq('id', req.params.id).eq('parent_id', auth.parentId).maybeSingle()
    if (!invoice) return res.error(404, 'Rechnung nicht gefunden')
    const authHeader = req.raw?.headers?.authorization || ''
    const token = authHeader.replace('Bearer ', '')
    const viewUrl = '/api/invoices/' + req.params.id + '/view?token=' + encodeURIComponent(token)
    // Use raw response for 302 redirect since router has no redirect method
    const raw = (res as any)._raw || (req as any).raw?.socket
    if (req.raw && req.raw.socket) {
      req.raw.socket.writable // just checking availability
    }
    // Return the URL as JSON; the frontend already uses direct links
    res.json({ data: { viewUrl } })
  })

  // Get parent's messages (all, for inbox grouping)
  router.get('/api/portal/messages', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data } = await sb.from('messages')
      .select('id, provider_id, type, body, read, sent_at')
      .eq('parent_id', auth.parentId).order('sent_at', { ascending: false, nullsFirst: false }).limit(200)

    // Get provider names
    const provIds = [...new Set((data ?? []).map((m: any) => m.provider_id))]
    const { data: provs } = provIds.length ? await sb.from('providers').select('id, company_name, display_name').in('id', provIds) : { data: [] }
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, p.display_name || p.company_name]))

    const enriched = (data ?? []).map((m: any) => ({ ...m, providerName: provMap.get(m.provider_id) || '' }))
    res.json({ data: enriched })
  })

  // Get conversation with a specific provider
  router.get('/api/portal/messages/:providerId', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data } = await sb.from('messages')
      .select('id, provider_id, type, body, read, sent_at')
      .eq('parent_id', auth.parentId).eq('provider_id', req.params.providerId)
      .order('sent_at', { ascending: true, nullsFirst: true }).limit(100)

    // Get provider name (display_name = Brand wie "Socialy", company_name = juristisch wie "Urban Kids GmbH")
    const { data: prov } = await sb.from('providers').select('company_name, display_name').eq('id', req.params.providerId).maybeSingle()

    // Auto-mark provider/direct/system messages (everything not from parent) as read
    await sb.from('messages').update({ read: true })
      .eq('parent_id', auth.parentId).eq('provider_id', req.params.providerId)
      .in('type', ['provider', 'direct', 'system']).eq('read', false)

    const enriched = (data ?? []).map((m: any) => ({ ...m, providerName: prov?.display_name || prov?.company_name || '' }))
    res.json({ data: enriched })
  })

  // Mark messages as read (must be registered before :providerId to avoid route conflict)
  router.post('/api/portal/messages/mark-read', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const { messageIds, providerId } = req.body as { messageIds?: string[]; providerId?: string }
    const sb = getServiceClient()
    let q = sb.from('messages').update({ read: true })
      .eq('parent_id', auth.parentId).in('type', ['provider', 'direct', 'system']).eq('read', false)
    if (providerId) q = q.eq('provider_id', providerId)
    if (messageIds?.length) q = q.in('id', messageIds)
    const { error } = await q
    if (error) throw error
    res.json({ data: { success: true } })
  })

  // Send message from parent to provider (legacy route for backward compat)
  router.post('/api/portal/messages', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const { providerId, content } = req.body as { providerId?: string; content?: string }
    if (!providerId || !content?.trim()) return res.error(400, 'Provider und Nachricht sind erforderlich')
    const sb = getServiceClient()
    const { data, error } = await sb.from('messages').insert({
      provider_id: providerId, parent_id: auth.parentId,
      type: 'parent', body: content.trim(),
    }).select().single()
    if (error) throw error
    res.status(201).json({ data })
  })

  // Send message from parent to provider (with providerId in path)
  router.post('/api/portal/messages/:providerId', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const providerId = req.params.providerId
    const { content } = req.body as { content?: string }
    if (!content?.trim()) return res.error(400, 'Nachricht ist erforderlich')
    const sb = getServiceClient()
    const { data, error } = await sb.from('messages').insert({
      provider_id: providerId, parent_id: auth.parentId,
      type: 'parent', body: content.trim(),
    }).select().single()
    if (error) throw error
    res.status(201).json({ data })
  })

  // Provider: get messages for a parent
  router.get('/api/parents/:parentId/messages', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data } = await sb.from('messages')
      .select('*').eq('provider_id', auth.providerId).eq('parent_id', req.params.parentId)
      .order('sent_at', { ascending: true, nullsFirst: true })
    // Mark unread messages as read
    await sb.from('messages').update({ read: true })
      .eq('provider_id', auth.providerId).eq('parent_id', req.params.parentId)
      .eq('type', 'parent').eq('read', false)
    res.json({ data: data ?? [] })
  })

  // Provider: send message to parent
  router.post('/api/parents/:parentId/messages', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { content } = req.body as { content?: string }
    if (!content?.trim()) return res.error(400, 'Nachricht ist erforderlich')
    const sb = getServiceClient()
    const { data, error } = await sb.from('messages').insert({
      provider_id: auth.providerId, parent_id: req.params.parentId,
      type: 'provider', body: content.trim(),
    }).select().single()
    if (error) throw error
    res.status(201).json({ data })
  })

  // ============================================================
  // CANCEL/SICK ENDPOINTS — Eltern melden Termin als krank ab
  // ============================================================
  // Drei Pfade je nach Vorlaufzeit + Buchungstyp:
  //   1. POST /api/portal/credits/request       — Block-Session, ≥24h vorher → Credit + cancelled_excused
  //   2. POST /api/portal/sessions/cancel-late  — Block-Session, <24h vorher → kein Credit + cancelled_late
  //   3. POST /api/portal/bookings/:id/cancel   — Single-Booking (ohne Block-Enrollment)
  //
  // Frontend (portal.html submitCancellation) wählt automatisch je nach hoursUntil + sessionId.

  // Helper: Provider sowohl im Postfach (messages) als auch in der Glocke (notifications) benachrichtigen
  async function notifyProviderCancellation(
    sb: any,
    providerId: string,
    parentId: string,
    childName: string,
    sessionDate: string,
    sessionStartTime: string | null,
    isLate: boolean,
    reason?: string,
    activityTitle?: string,
    sessionId?: string,
    activityId?: string,
  ) {
    const dateLabel = new Date(sessionDate).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
    const timeLabel = sessionStartTime ? ` (${String(sessionStartTime).slice(0, 5)})` : ''
    const lateLabel = isLate ? ' (kurzfristig)' : ''
    const reasonText = reason ? ` Grund: ${reason}.` : ''
    const courseLabel = activityTitle ? ` (${activityTitle})` : ''
    const fullBody = `Krankmeldung${lateLabel}: ${childName || 'Kind'} kann am ${dateLabel}${timeLabel}${courseLabel} nicht teilnehmen.${reasonText}`

    // 1. Postfach-Eintrag (messages)
    try {
      await sb.from('messages').insert({
        provider_id: providerId,
        parent_id: parentId,
        type: 'system',
        body: fullBody,
      })
    } catch (e) { console.error('[Cancel] messages.insert failed:', e) }

    // 2. Glocke-Notification (notifications) — mit Deep-Link-IDs für Shortcut
    try {
      await sb.from('notifications').insert({
        recipient_type: 'provider',
        recipient_id: providerId,
        type: isLate ? 'cancellation_late' : 'cancellation_excused',
        channel: 'in_app',
        title: `${childName || 'Kind'} hat sich krank gemeldet${lateLabel}`,
        body: `${dateLabel}${timeLabel}${courseLabel}${isLate ? ' — kurzfristig, kein Add-Up-Slot frei.' : ' — Add-Up-Slot ist jetzt verfügbar.'}`,
        data: {
          parentId,
          sessionId: sessionId || null,
          activityId: activityId || null,
          sessionDate,
          isLate,
          reason: reason || null,
          activityTitle: activityTitle || null,
        },
        read: false,
      })
    } catch (e) { console.error('[Cancel] notifications.insert failed:', e) }
  }

  // ── 1. Cancel mit Credit (≥24h vor Termin) ─────────────────
  router.post('/api/portal/credits/request', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const { enrollmentId, sessionId, reason } = req.body as { enrollmentId?: string; sessionId?: string; reason?: string }
    if (!enrollmentId || !sessionId) return res.error(400, 'enrollmentId und sessionId erforderlich')

    const sb = getServiceClient()

    // Verify enrollment belongs to this parent
    const { data: enrollment } = await sb.from('block_enrollments')
      .select('id, block_id, parent_id, child_id, child_name, credits_earned')
      .eq('id', enrollmentId).eq('parent_id', auth.parentId).eq('status', 'active')
      .maybeSingle()
    if (!enrollment) return res.error(404, 'Einschreibung nicht gefunden')

    // Verify session belongs to this block + future
    const { data: session } = await sb.from('block_sessions')
      .select('id, block_id, date, start_time, status')
      .eq('id', sessionId).eq('block_id', enrollment.block_id).eq('status', 'scheduled')
      .maybeSingle()
    if (!session) return res.error(404, 'Termin nicht gefunden oder bereits abgesagt')

    const sessionDateTime = new Date(session.date + 'T' + (session.start_time || '23:59') + ':00')
    if (sessionDateTime < new Date()) return res.error(400, 'Vergangene Termine können nicht abgesagt werden')

    // Block + Provider + Activity-Title laden
    const { data: block } = await sb.from('course_blocks')
      .select('provider_id, activity_id, activity_type, end_date, extended_end_date')
      .eq('id', enrollment.block_id).single()
    const { data: provider } = await sb.from('providers')
      .select('cancel_cutoff_hours')
      .eq('id', block?.provider_id).maybeSingle()
    const { data: activity } = block?.activity_id
      ? await sb.from('activities').select('title').eq('id', block.activity_id).maybeSingle()
      : { data: null }

    const cutoffHours = provider?.cancel_cutoff_hours ?? 24
    const hoursUntil = (sessionDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntil < cutoffHours) {
      return res.error(400, `Absage muss mindestens ${cutoffHours} Stunden vorher erfolgen — bitte stattdessen "Krank?" mit kurzfristiger Absage nutzen.`)
    }

    // Duplicate-Check: nicht zweimal Credit für selben Termin
    const { data: existingCredit } = await sb.from('session_credits')
      .select('id').eq('enrollment_id', enrollmentId).eq('original_session_id', sessionId)
      .maybeSingle()
    if (existingCredit) return res.error(400, 'Für diesen Termin wurde bereits ein Guthaben erstellt')

    // Attendance-Record (cancelled_excused) — färbt Pattern als "krank"
    const minutesBefore = Math.round(hoursUntil * 60)
    await sb.from('session_attendance_records').insert({
      session_id: sessionId,
      block_id: enrollment.block_id,
      enrollment_id: enrollmentId,
      child_id: enrollment.child_id,
      status: 'cancelled_excused',
      cancelled_at: new Date().toISOString(),
      cancelled_minutes_before: minutesBefore,
      credit_issued: true,
    })

    // Credit IMMER bei rechtzeitiger Krankmeldung (≥cutoffHours), unabhängig von makeup_enabled
    // makeup_enabled steuert nur die EINLÖSE-Möglichkeit, nicht die Credit-Vergabe
    const validUntil = block?.extended_end_date ?? block?.end_date ?? session.date
    const { data: credit, error: creditErr } = await sb.from('session_credits').insert({
      enrollment_id: enrollmentId,
      block_id: enrollment.block_id,
      provider_id: block?.provider_id,
      parent_id: auth.parentId,
      child_id: enrollment.child_id,
      activity_type: block?.activity_type ?? 'course',
      reason: 'parent_cancellation',
      is_provider_cancellation: false,
      original_session_id: sessionId,
      original_session_date: session.date,
      status: 'available',
      valid_until: validUntil,
    }).select('id').single()
    if (creditErr) {
      console.error('[Credit-Request] Credit-Insert failed:', creditErr)
      return res.error(500, 'Guthaben konnte nicht erstellt werden')
    }

    await sb.from('block_enrollments')
      .update({ credits_earned: (enrollment.credits_earned ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', enrollmentId)

    // Notify provider (Postfach + Glocke) — mit sessionId für Deep-Link
    await notifyProviderCancellation(sb, block?.provider_id, auth.parentId, enrollment.child_name || '', session.date, session.start_time, false, reason, activity?.title, sessionId, block?.activity_id)

    res.status(201).json({ data: { creditId: credit?.id || null, status: 'cancelled_excused', validUntil } })
  })

  // ── 2. Late-Cancel (<24h vor Termin) ───────────────────────
  router.post('/api/portal/sessions/cancel-late', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const { enrollmentId, sessionId, reason, note } = req.body as { enrollmentId?: string; sessionId?: string; reason?: string; note?: string }
    if (!enrollmentId || !sessionId) return res.error(400, 'enrollmentId und sessionId erforderlich')

    const sb = getServiceClient()
    const { data: enrollment } = await sb.from('block_enrollments')
      .select('id, block_id, parent_id, child_id, child_name')
      .eq('id', enrollmentId).eq('parent_id', auth.parentId).eq('status', 'active')
      .maybeSingle()
    if (!enrollment) return res.error(404, 'Einschreibung nicht gefunden')

    const { data: session } = await sb.from('block_sessions')
      .select('id, block_id, date, start_time, status')
      .eq('id', sessionId).eq('block_id', enrollment.block_id).eq('status', 'scheduled')
      .maybeSingle()
    if (!session) return res.error(404, 'Termin nicht gefunden oder bereits abgesagt')

    const sessionDateTime = new Date(session.date + 'T' + (session.start_time || '23:59') + ':00')
    if (sessionDateTime < new Date()) return res.error(400, 'Vergangene Termine können nicht abgesagt werden')

    const hoursUntil = (sessionDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
    const minutesBefore = Math.max(0, Math.round(hoursUntil * 60))

    // Attendance-Record (cancelled_late) — färbt Pattern als "fehlt"
    const { error: attErr } = await sb.from('session_attendance_records').insert({
      session_id: sessionId,
      block_id: enrollment.block_id,
      enrollment_id: enrollmentId,
      child_id: enrollment.child_id,
      status: 'cancelled_late',
      cancelled_at: new Date().toISOString(),
      cancelled_minutes_before: minutesBefore,
      credit_issued: false,
    })
    if (attErr) return res.error(500, 'Absage konnte nicht gespeichert werden')

    // Provider + Activity-Title für notify
    const { data: block } = await sb.from('course_blocks')
      .select('provider_id, activity_id').eq('id', enrollment.block_id).single()
    const { data: activity } = block?.activity_id
      ? await sb.from('activities').select('title').eq('id', block.activity_id).maybeSingle()
      : { data: null }
    await notifyProviderCancellation(sb, block?.provider_id, auth.parentId, enrollment.child_name || '', session.date, session.start_time, true, reason || note, activity?.title, sessionId, block?.activity_id)

    res.status(201).json({ data: { status: 'cancelled_late' } })
  })

  // ── 3. Single-Booking-Cancel (Probestunden / one-off ohne Block-Enrollment) ─
  router.post('/api/portal/bookings/:id/cancel', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const { reason, note } = req.body as { reason?: string; note?: string }
    const sb = getServiceClient()

    const { data: booking } = await sb.from('provider_bookings')
      .select('id, parent_id, provider_id, activity_id, status, child_info, created_at')
      .eq('id', req.params.id).eq('parent_id', auth.parentId)
      .maybeSingle()
    if (!booking) return res.error(404, 'Buchung nicht gefunden')
    if (booking.status === 'cancelled') return res.error(400, 'Buchung bereits storniert')

    // Safety: wenn diese Buchung ein aktives Block-Enrollment hat, blockieren — Eltern müssen einzelne
    // Termine via /credits/request bzw. /sessions/cancel-late stornieren, nicht den ganzen Block.
    const { data: linkedEnroll } = await sb.from('block_enrollments')
      .select('id, status').eq('booking_id', booking.id).eq('status', 'active').maybeSingle()
    if (linkedEnroll) {
      return res.error(400, 'Diese Buchung gehört zu einem Kursblock. Bitte sage einzelne Termine ab oder kontaktiere den Anbieter für eine komplette Stornierung.')
    }

    const { error: updErr } = await sb.from('provider_bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString(), notes: reason ? `Storno: ${reason}${note ? ' · ' + note : ''}` : booking.status })
      .eq('id', booking.id)
    if (updErr) return res.error(500, 'Stornierung fehlgeschlagen')

    // Notify provider
    const childName = (booking.child_info as any)?.firstName || 'Kind'
    try {
      await sb.from('messages').insert({
        provider_id: booking.provider_id,
        parent_id: auth.parentId,
        type: 'system',
        body: `Buchung storniert: ${childName}.${reason ? ' Grund: ' + reason + '.' : ''}${note ? ' ' + note : ''}`,
      })
    } catch (e) { console.error('[CancelBooking] Notify failed:', e) }

    res.json({ data: { status: 'cancelled' } })
  })
}
