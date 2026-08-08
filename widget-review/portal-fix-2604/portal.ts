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
import type { ParsedRequest, ApiResponse } from '../router'

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

  // ── Helper: Resolve portal origin (prefers prod app subdomain) ─
  function resolvePortalOrigin(req: any): string {
    if (process.env.APP_PUBLIC_URL) return process.env.APP_PUBLIC_URL
    const host = req?.raw?.headers?.host || req?.headers?.host
    if (host) return `https://${host}`
    return 'https://app.urbankids.club'
  }

  // ── Send brand-styled magic-link via Resend (signup / login / reset) ──
  async function sendFallbackMagicLink(
    parent: { id: string; name: string },
    email: string,
    origin: string,
    intent: 'login' | 'signup' | 'reset' = 'login',
  ): Promise<boolean> {
    try {
      const sb = getServiceClient()
      const { randomBytes } = await import('node:crypto')
      const token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
      const { error: insertErr } = await sb.from('parent_auth_tokens').insert({ parent_id: parent.id, token, expires_at: expiresAt })
      if (insertErr) {
        console.error('[Portal] parent_auth_tokens insert failed:', insertErr.message || insertErr)
        return false
      }

      const { EmailService } = await import('../../lib/email')
      const COPY: Record<string, { subject: string; heading: string; intro: string; cta: string }> = {
        signup: {
          subject: 'Willkommen bei Urban Kids Club',
          heading: 'Willkommen!',
          intro: `Schön, dass du da bist, ${parent.name}.<br>Klick auf den Button um dein Konto zu aktivieren und ein Passwort zu setzen.`,
          cta: 'Konto aktivieren',
        },
        reset: {
          subject: 'Neues Passwort setzen — Urban Kids Club',
          heading: 'Neues Passwort',
          intro: `Hi ${parent.name}, klick auf den Button um ein neues Passwort zu setzen.`,
          cta: 'Passwort zurücksetzen',
        },
        login: {
          subject: 'Dein Login-Link — Urban Kids Club',
          heading: 'Dein Login-Link',
          intro: `Hi ${parent.name}, klick auf den Button um dich einzuloggen.`,
          cta: 'Zum Eltern-Portal',
        },
      }
      const c = COPY[intent] || COPY.login

      const result = await EmailService.send({
        to: email,
        subject: c.subject,
        html: `
          <div style="font-family:'Bricolage Grotesque',Inter,sans-serif;max-width:560px;margin:0 auto;color:#1F1D18;background:#FBF5EA;padding:0">
            <div style="padding:32px;">
              <h1 style="font-size:24px;letter-spacing:-0.01em;margin:0 0 12px">${c.heading}</h1>
              <p style="font-size:15px;line-height:1.55;color:#1F1D18;margin:0 0 24px">${c.intro}</p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${origin}/portal/?token=${token}&intent=${intent}" style="display:inline-block;background:#D96C45;color:#FBF5EA;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px;">${c.cta}</a>
              </div>
              <p style="font-size:12px;color:#67625A;margin:24px 0 0">Dieser Link ist 30 Minuten gültig. Falls du das nicht warst, ignoriere diese Mail einfach.</p>
              <p style="font-size:11px;color:#67625A;margin:18px 0 0;border-top:1px solid rgba(31,29,24,0.08);padding-top:14px">Powered by Urban Kids Club</p>
            </div>
          </div>
        `,
      })
      if (result && result.success === false) {
        console.error(`[Portal] EmailService failed (intent=${intent}):`, result.error)
        return false
      }
      console.info(`[Portal] Magic-link mail sent (intent=${intent}, to=${email})`)
      return true
    } catch (e) {
      console.error('[Portal] sendFallbackMagicLink threw:', e)
      return false
    }
  }

  // ── Helper: find Supabase auth user by email (paginated listUsers) ──
  async function findAuthUserByEmail(emailLower: string) {
    const sb = getServiceClient()
    let page = 1
    while (page <= 20) { // hard cap: 20 pages × 200 = 4000 users
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
      if (error) { console.error('[Portal] listUsers error:', error); return null }
      const users = data?.users || []
      const found = users.find((u: any) => (u.email || '').toLowerCase() === emailLower)
      if (found) return found
      if (users.length < 200) return null
      page++
    }
    return null
  }

  // ── Magic Link via Resend (= signup/activation flow) ───────
  router.post('/api/portal/auth/magic-link', async (req, res) => {
    const { email, intent } = req.body as { email?: string; intent?: 'login' | 'signup' }
    if (!email) return res.error(400, 'E-Mail ist erforderlich')

    const normalizedEmail = email.toLowerCase().trim()
    if (!rateLimit(`portal-login:${normalizedEmail}`, 5, 60 * 60 * 1000)) {
      return res.error(429, 'Zu viele Versuche. Bitte später erneut probieren.')
    }

    const sb = getServiceClient()
    const { data: parent } = await sb.from('parents').select('id, name').ilike('email', normalizedEmail).maybeSingle()
    const linkIntent: 'login' | 'signup' = intent === 'signup' ? 'signup' : 'login'

    // Parent not found → klare Fehlermeldung (UKC ist closed system, Eltern werden vom Provider angelegt)
    if (!parent) {
      console.info(`[Portal] ${linkIntent}: E-Mail unbekannt: ${normalizedEmail}`)
      return res.error(404, 'Wir kennen diese E-Mail nicht. Frag dein Studio nach einer Einladung.')
    }

    // Ensure Supabase Auth user exists for this parent (idempotent)
    const { error: createError } = await sb.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: { role: 'parent', parent_id: parent.id },
    })
    if (createError && !createError.message?.includes('already been registered')) {
      console.error('[Portal] Failed to create auth user for parent:', createError)
    }

    // For signup-intent: check if already activated → tell user to login/reset instead
    if (linkIntent === 'signup') {
      const authUser = await findAuthUserByEmail(normalizedEmail)
      const alreadyActivated = !!(authUser?.user_metadata?.password_set === true)
      if (alreadyActivated) {
        console.info(`[Portal] signup attempted for already-activated user: ${normalizedEmail}`)
        return res.error(409, 'Diese E-Mail ist bereits aktiviert. Bitte logge dich ein oder setze dein Passwort zurück.')
      }
    }

    // Send via Resend with our own token (Supabase OTP is unreliable on shared SMTP)
    const origin = resolvePortalOrigin(req)
    const sent = await sendFallbackMagicLink(parent, normalizedEmail, origin, linkIntent)

    if (!sent) {
      console.error(`[Portal] Resend magic-link failed for ${normalizedEmail}`)
      return res.error(500, 'Mail-Versand fehlgeschlagen. Bitte erneut versuchen.')
    }

    console.info(`[Portal] Magic-link sent via Resend (intent=${linkIntent}) to ${normalizedEmail}`)
    res.json({ success: true })
  })

  // ── Sprechender Alias: Signup (= Magic-Link mit signup-Intent) ──
  // ── Login mit E-Mail + Passwort ──────────────────────────
  router.post('/api/portal/auth/login', async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string }
    if (!email || !password) return res.error(400, 'E-Mail und Passwort sind erforderlich')

    const normalizedEmail = email.toLowerCase().trim()
    if (!rateLimit(`portal-login-pw:${normalizedEmail}`, 8, 15 * 60 * 1000)) {
      return res.error(429, 'Zu viele Login-Versuche. Bitte 15 Minuten warten.')
    }

    const sb = getServiceClient()
    const { data: parent } = await sb.from('parents').select('id, name, email').ilike('email', normalizedEmail).maybeSingle()

    if (!parent) {
      // No parent record — keep error generic
      return res.error(401, 'E-Mail oder Passwort falsch.')
    }

    // Use anon Supabase client for password sign-in (public flow)
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

  // ── Passwort-Reset anfordern (über Resend, gleicher Flow wie signup) ─
  router.post('/api/portal/auth/reset-password', async (req, res) => {
    const { email } = req.body as { email?: string }
    if (!email) return res.error(400, 'E-Mail ist erforderlich')

    const normalizedEmail = email.toLowerCase().trim()
    if (!rateLimit(`portal-pwreset:${normalizedEmail}`, 3, 60 * 60 * 1000)) {
      return res.error(429, 'Zu viele Reset-Anfragen. Bitte später erneut probieren.')
    }

    const sb = getServiceClient()
    const { data: parent } = await sb.from('parents').select('id, name').ilike('email', normalizedEmail).maybeSingle()

    if (!parent) {
      console.info(`[Portal] Reset-PW für unbekannte E-Mail: ${normalizedEmail}`)
      return res.error(404, 'Wir kennen diese E-Mail nicht.')
    }

    const origin = resolvePortalOrigin(req)
    const sent = await sendFallbackMagicLink(parent, normalizedEmail, origin, 'reset' as any)
    if (!sent) {
      console.error(`[Portal] Resend reset-link failed for ${normalizedEmail}`)
      return res.error(500, 'Mail-Versand fehlgeschlagen.')
    }
    console.info(`[Portal] Reset-Link via Resend gesendet an ${normalizedEmail}`)
    res.json({ success: true })
  })

  // ── Passwort setzen (nach Magic-Link / Reset-Link) ──────
  // Accepts either:
  //   { sessionToken, password } — legacy session from /api/portal/verify
  //   { accessToken, password }  — Supabase access token (recovery flow)
  router.post('/api/portal/auth/set-password', async (req, res) => {
    const { sessionToken, accessToken, password } = req.body as {
      sessionToken?: string; accessToken?: string; password?: string
    }
    if (!password) return res.error(400, 'Passwort ist erforderlich')
    if (password.length < 8) return res.error(400, 'Passwort muss mindestens 8 Zeichen lang sein')

    const sb = getServiceClient()
    let parentEmail: string | null = null
    let parentId: string | null = null

    // Path A: legacy session token (from Resend magic-link → /api/portal/verify)
    if (sessionToken) {
      const { data: session } = await sb.from('parent_sessions')
        .select('parent_id, expires_at').eq('session_token', sessionToken).maybeSingle()
      if (session && new Date(session.expires_at) >= new Date()) {
        parentId = session.parent_id
        const { data: p } = await sb.from('parents').select('email').eq('id', session.parent_id).single()
        parentEmail = p?.email || null
      }
    }

    // Path B: Supabase access token (Supabase recovery / magiclink)
    if (!parentEmail && accessToken) {
      const { createClient } = await import('@supabase/supabase-js')
      const sbUrl = process.env.SUPABASE_URL || ''
      const sbAnon = process.env.SUPABASE_ANON_KEY || ''
      if (sbUrl && sbAnon) {
        const sbAuth = createClient(sbUrl, sbAnon, { auth: { persistSession: false } })
        const { data: userResp } = await sbAuth.auth.getUser(accessToken)
        if (userResp?.user?.email) {
          parentEmail = userResp.user.email
          const { data: p } = await sb.from('parents').select('id').ilike('email', parentEmail).maybeSingle()
          parentId = p?.id || null
        }
      }
    }

    if (!parentEmail || !parentId) {
      return res.error(401, 'Ungültiges oder abgelaufenes Token.')
    }

    // Find Supabase auth user
    const authUser = await findAuthUserByEmail(parentEmail.toLowerCase())
    if (!authUser) {
      return res.error(404, 'Auth-User nicht gefunden.')
    }

    // Update password + mark as activated
    const { error: updErr } = await sb.auth.admin.updateUserById(authUser.id, {
      password,
      user_metadata: { ...(authUser.user_metadata || {}), password_set: true, activated_at: new Date().toISOString() },
    })
    if (updErr) {
      console.error('[Portal] set-password admin.updateUserById failed:', updErr.message || updErr)
      return res.error(500, 'Passwort konnte nicht gesetzt werden.')
    }

    console.info(`[Portal] Passwort gesetzt für ${parentEmail} (parent ${parentId})`)
    res.json({ success: true, data: { parentId } })
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
    res.json({ data: { loggedIn: true, parent, calendarToken } })
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
    const origin = resolvePortalOrigin(req)
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



  // ── Activity feed for the provider bell ──
  router.get('/api/activity-feed', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const events: any[] = []

    // 1) Recent bookings
    const { data: bookings } = await sb.from('provider_bookings')
      .select('id, parent_id, activity_id, child_info, status, created_at')
      .eq('provider_id', auth.providerId).gte('created_at', since)
      .order('created_at', { ascending: false }).limit(20)
    const parentIds = [...new Set((bookings ?? []).map((b: any) => b.parent_id))]
    const actIds = [...new Set((bookings ?? []).map((b: any) => b.activity_id))]
    const { data: parents } = parentIds.length ? await sb.from('parents').select('id, name').in('id', parentIds) : { data: [] }
    const { data: acts } = actIds.length ? await sb.from('activities').select('id, title').in('id', actIds) : { data: [] }
    const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p.name]))
    const actMap = new Map((acts ?? []).map((a: any) => [a.id, a.title]))
    for (const b of bookings ?? []) {
      events.push({
        kind: b.status === 'cancelled' ? 'booking_cancelled' : 'booking_new',
        kicker: b.status === 'cancelled' ? 'Stornierung' : 'Neue Buchung',
        title: parentMap.get(b.parent_id) || 'Eltern',
        sub: '→ ' + (actMap.get(b.activity_id) || 'Kurs') + ((b.child_info as any)?.firstName ? ' · ' + (b.child_info as any).firstName : ''),
        at: b.created_at,
        type: 'booking',
      })
    }

    // 2) Cancelled sessions from this provider's blocks (provider-cancelled = important)
    const { data: blocks } = await sb.from('course_blocks').select('id').eq('provider_id', auth.providerId)
    const blockIds = (blocks ?? []).map((b: any) => b.id)
    if (blockIds.length) {
      const { data: cancSessions } = await sb.from('block_sessions')
        .select('id, block_id, date, start_time, status').in('block_id', blockIds)
        .eq('status', 'cancelled_by_provider').gte('date', new Date().toISOString().slice(0,10))
        .order('date', { ascending: false }).limit(10)
      for (const s of cancSessions ?? []) {
        events.push({
          kind: 'session_cancelled',
          kicker: 'Termin abgesagt',
          title: 'Stunde am ' + new Date(s.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }),
          sub: 'Studio-seitig storniert · ' + (s.start_time || '').slice(0,5),
          at: s.date + 'T' + (s.start_time || '00:00'),
          type: 'session',
        })
      }
    }

    // 3) Credits issued (provider's customers)
    const { data: credits } = await sb.from('session_credits')
      .select('id, parent_id, reason, original_session_date, created_at')
      .eq('provider_id', auth.providerId).gte('created_at', since)
      .order('created_at', { ascending: false }).limit(15)
    for (const c of credits ?? []) {
      const reasonLabel = c.reason === 'parent_cancellation' ? 'Krankmeldung'
        : c.reason === 'provider_cancellation' ? 'Provider-Absage'
        : 'Credit ausgestellt'
      events.push({
        kind: 'credit_issued',
        kicker: reasonLabel,
        title: parentMap.get(c.parent_id) || 'Eltern',
        sub: 'Credit für ' + new Date(c.original_session_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }),
        at: c.created_at,
        type: 'credit',
      })
    }

    // 4) Recent waitlist entries
    const { data: waitlist } = await sb.from('waitlist_entries')
      .select('id, parent_id, activity_id, created_at, status')
      .eq('provider_id', auth.providerId).gte('created_at', since)
      .order('created_at', { ascending: false }).limit(10)
    for (const w of waitlist ?? []) {
      events.push({
        kind: w.status === 'offered' ? 'waitlist_offer' : 'waitlist_join',
        kicker: w.status === 'offered' ? 'Warteliste-Match' : 'Warteliste',
        title: w.status === 'offered' ? 'Platz freigeworden' : (parentMap.get(w.parent_id) || 'Eltern'),
        sub: actMap.get(w.activity_id) || 'Kurs',
        at: w.created_at,
        type: 'waitlist',
      })
    }

    // 5) Recent reviews
    const { data: reviews } = await sb.from('reviews')
      .select('id, parent_id, activity_id, rating, comment, created_at')
      .eq('provider_id', auth.providerId).gte('created_at', since)
      .order('created_at', { ascending: false }).limit(10)
    for (const r of reviews ?? []) {
      events.push({
        kind: 'review_new',
        kicker: 'Neue Bewertung',
        title: '★'.repeat(r.rating) + ' von ' + (parentMap.get(r.parent_id) || 'Eltern'),
        sub: r.comment ? '„' + String(r.comment).slice(0, 80) + '"' : (actMap.get(r.activity_id) || 'Kurs'),
        at: r.created_at,
        type: 'review',
      })
    }

    // 6) Share-invite conversions (mom-graph)
    const { data: invites } = await sb.from('parent_share_invites')
      .select('id, sharer_parent_id, recipient_name, status, converted_at')
      .eq('provider_id', auth.providerId).eq('status', 'converted')
      .gte('converted_at', since).order('converted_at', { ascending: false }).limit(10)
    for (const i of invites ?? []) {
      events.push({
        kind: 'mom_graph_conversion',
        kicker: 'Mom-Graph',
        title: (parentMap.get(i.sharer_parent_id) || 'Eltern') + ' hat geworben',
        sub: (i.recipient_name || 'Kontakt') + ' hat gebucht',
        at: i.converted_at,
        type: 'mom_graph',
      })
    }

    // Sort newest first
    events.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
    res.json({ data: events.slice(0, 50) })
  })

  // ── Provider Settings (cancel cutoff, addup slots, credit expiry) ──
  router.get('/api/providers/:id/settings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
    const sb = getServiceClient()
    const { data } = await sb.from('providers')
      .select('cancel_cutoff_hours, default_addup_slots, credit_expiry_months, makeup_enabled')
      .eq('id', auth.providerId).single()
    res.json({ data: data || {} })
  })

  router.patch('/api/providers/:id/settings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
    const body = req.body as { cancelCutoffHours?: number; defaultAddupSlots?: number; creditExpiryMonths?: number; makeupEnabled?: boolean }
    const update: any = {}
    if (typeof body.cancelCutoffHours === 'number' && body.cancelCutoffHours >= 0 && body.cancelCutoffHours <= 168) update.cancel_cutoff_hours = body.cancelCutoffHours
    if (typeof body.defaultAddupSlots === 'number' && body.defaultAddupSlots >= 0 && body.defaultAddupSlots <= 50) update.default_addup_slots = body.defaultAddupSlots
    if (typeof body.creditExpiryMonths === 'number' && body.creditExpiryMonths >= 1 && body.creditExpiryMonths <= 24) update.credit_expiry_months = body.creditExpiryMonths
    if (typeof body.makeupEnabled === 'boolean') update.makeup_enabled = body.makeupEnabled
    if (Object.keys(update).length === 0) return res.error(400, 'Keine gültigen Werte')
    const sb = getServiceClient()
    const { data, error } = await sb.from('providers').update(update).eq('id', auth.providerId).select('cancel_cutoff_hours, default_addup_slots, credit_expiry_months, makeup_enabled').single()
    if (error) return res.error(500, error.message)
    res.json({ data })
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
    const { data: provs } = await sb.from('providers').select('id, company_name').in('id', provIds)
    const actMap = new Map((acts ?? []).map((a: any) => [a.id, a]))
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, p.company_name]))

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

    if (!bookings?.length) return res.json({ data: [] })

    // Enrich with activity titles + provider names + display_name
    const actIds = [...new Set(bookings.map((b: any) => b.activity_id))]
    const provIds = [...new Set(bookings.map((b: any) => b.provider_id))]
    const { data: acts } = actIds.length ? await sb.from('activities').select('id, title, schedule, duration_minutes').in('id', actIds) : { data: [] }
    const { data: provs } = provIds.length ? await sb.from('providers').select('id, company_name, display_name').in('id', provIds) : { data: [] }
    const actMap = new Map((acts ?? []).map((a: any) => [a.id, a]))
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, (p.display_name || p.company_name)]))

    // Load enrollments via booking_id (correct schema), then blocks + sessions + counts
    const bookingIds = bookings.map((b: any) => b.id)
    const { data: enrollments } = bookingIds.length
      ? await sb.from('block_enrollments').select('id, block_id, booking_id, status').in('booking_id', bookingIds)
      : { data: [] }
    const blockIds = [...new Set((enrollments ?? []).map((e: any) => e.block_id).filter(Boolean))]

    // Sessions for these blocks
    const { data: blockSessions } = blockIds.length
      ? await sb.from('block_sessions').select('id, block_id, date, start_time, end_time, status').in('block_id', blockIds).order('date')
      : { data: [] }
    const sessionsByBlock = new Map<string, any[]>()
    for (const s of blockSessions ?? []) {
      if (!sessionsByBlock.has(s.block_id)) sessionsByBlock.set(s.block_id, [])
      sessionsByBlock.get(s.block_id)!.push(s)
    }

    // Block-level info: capacity + total_sessions
    const { data: blocks } = blockIds.length
      ? await sb.from('course_blocks').select('id, capacity, makeup_capacity, total_sessions, start_date, end_date').in('id', blockIds)
      : { data: [] }
    const blockMap = new Map((blocks ?? []).map((b: any) => [b.id, b]))

    // Count active enrollments per block (for capacity display)
    const { data: allEnr } = blockIds.length
      ? await sb.from('block_enrollments').select('block_id, status').in('block_id', blockIds)
      : { data: [] }
    const enrolledCountByBlock = new Map<string, number>()
    for (const e of allEnr ?? []) {
      if (e.status === 'active' || e.status === 'confirmed' || e.status === 'pending') {
        enrolledCountByBlock.set(e.block_id, (enrolledCountByBlock.get(e.block_id) || 0) + 1)
      }
    }

    // Attendance records (filter by enrollment_id since the table has no parent_id)
    const sessionIds = (blockSessions ?? []).map((s: any) => s.id)
    const enrollmentIdList = (enrollments ?? []).map((e: any) => e.id)
    const { data: attendance } = (sessionIds.length && enrollmentIdList.length)
      ? await sb.from('session_attendance_records').select('session_id, enrollment_id, status, is_makeup').in('session_id', sessionIds).in('enrollment_id', enrollmentIdList)
      : { data: [] }
    // Prefer NON-makeup record per session (= the parent's actual attendance state for the original session)
    const attendanceBySession = new Map<string, string>()
    for (const a of attendance ?? []) {
      const existing = attendanceBySession.get(a.session_id)
      if (!existing || a.is_makeup === false) {
        attendanceBySession.set(a.session_id, a.status)
      }
    }

    // Map booking_id → enrollment
    const enrByBooking = new Map((enrollments ?? []).map((e: any) => [e.booking_id, e]))

    const enriched = bookings.map((b: any) => {
      const enr = enrByBooking.get(b.id)
      const blockId = enr?.block_id || null
      const enrollmentId = enr?.id || null
      const block = blockId ? blockMap.get(blockId) : null
      const sessions = blockId ? (sessionsByBlock.get(blockId) || []) : []
      const sessionsWithAttendance = sessions.map((s: any) => ({
        ...s,
        attendance_status: attendanceBySession.get(s.id) || null,
      }))
      return {
        ...b,
        activityTitle: actMap.get(b.activity_id)?.title || 'Kurs',
        durationMinutes: actMap.get(b.activity_id)?.duration_minutes || 60,
        providerName: provMap.get(b.provider_id) || 'Anbieter',
        schedule: actMap.get(b.activity_id)?.schedule || null,
        sessions: sessionsWithAttendance,
        blockId,
        enrollmentId,
        block: block ? {
          id: block.id,
          capacity: block.capacity,
          makeupCapacity: block.makeup_capacity,
          totalSessions: block.total_sessions,
          enrolledCount: enrolledCountByBlock.get(blockId) || 0,
          startDate: block.start_date,
          endDate: block.end_date,
        } : null,
      }
    })
    res.json({ data: enriched })
  })

  // ── Discover: Active activities from providers the parent has bookings with ──
  router.get('/api/portal/discover', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()

    // Find providers the parent has any booking with
    const { data: bookings } = await sb.from('provider_bookings')
      .select('provider_id, activity_id')
      .eq('parent_id', auth.parentId)
    const providerIds = [...new Set((bookings ?? []).map((b: any) => b.provider_id))]
    const bookedActIds = new Set((bookings ?? []).map((b: any) => b.activity_id))

    // If no bookings yet, fall back to all active providers (limit to top 10)
    let provFilter = providerIds
    if (!provFilter.length) {
      const { data: allProvs } = await sb.from('providers').select('id').limit(10)
      provFilter = (allProvs ?? []).map((p: any) => p.id)
    }
    if (!provFilter.length) return res.json({ data: [] })

    const { data: providers } = await sb.from('providers')
      .select('id, company_name, display_name, address, slug')
      .in('id', provFilter)
    const provMap = new Map((providers ?? []).map((p: any) => [p.id, p]))

    const { data: activities } = await sb.from('activities')
      .select('id, title, description, category, age_range, schedule, duration_minutes, capacity, price, status, provider_id')
      .in('provider_id', provFilter)
      .eq('status', 'active')
      .limit(50)

    const enriched = (activities ?? []).map((a: any) => {
      const prov = provMap.get(a.provider_id) || {}
      return {
        ...a,
        providerName: prov.display_name || prov.company_name || 'Anbieter',
        providerSlug: prov.slug || null,
        providerAddress: prov.address || null,
        alreadyBooked: bookedActIds.has(a.id),
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
    const { data: provider } = await sb.from('providers').select('id, company_name').eq('id', booking.provider_id).maybeSingle()

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
      providerName: provider?.company_name || 'Anbieter',
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

  // ── Credit-Request: Eltern sagen Termin ab → bekommen Credit ──
  router.post('/api/portal/credits/request', async (req, res) => {
    const parent = await authenticateParent(req, res)
    if (!parent) return

    const { enrollmentId, sessionId, reason } = req.body as {
      enrollmentId: string
      sessionId: string
      reason?: string
    }
    if (!enrollmentId || !sessionId) return res.error(400, 'enrollmentId und sessionId erforderlich')

    const sb = getServiceClient()

    // Verify enrollment belongs to this parent
    const { data: enrollment } = await sb.from('block_enrollments')
      .select('id, block_id, parent_id, child_id, child_name, credits_earned')
      .eq('id', enrollmentId).eq('parent_id', parent.parentId).eq('status', 'active')
      .maybeSingle()
    if (!enrollment) return res.error(404, 'Einschreibung nicht gefunden')

    // Verify session belongs to this block and is in the future
    const { data: session } = await sb.from('block_sessions')
      .select('id, block_id, date, start_time, status')
      .eq('id', sessionId).eq('block_id', enrollment.block_id).eq('status', 'scheduled')
      .maybeSingle()
    if (!session) return res.error(404, 'Termin nicht gefunden oder bereits abgesagt')

    const sessionDate = new Date(session.date + 'T' + (session.start_time || '23:59') + ':00')
    if (sessionDate < new Date()) return res.error(400, 'Vergangene Termine können nicht abgesagt werden')

    // Load block + provider in one go
    const { data: block } = await sb.from('course_blocks')
      .select('provider_id, activity_type, end_date, extended_end_date')
      .eq('id', enrollment.block_id).single()
    const { data: provider } = await sb.from('providers')
      .select('makeup_enabled, company_name, cancel_cutoff_hours, credit_expiry_months')
      .eq('id', block.provider_id).single()

    if (!provider?.makeup_enabled) {
      return res.error(400, 'Das Guthaben-System ist bei diesem Anbieter nicht aktiviert')
    }

    // Provider-defined cancel cutoff (default 24h)
    const cutoffHours = provider.cancel_cutoff_hours ?? 24

    // Check minimum notice
    const hoursUntil = (sessionDate.getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntil < cutoffHours) return res.error(400, `Absage muss mindestens ${cutoffHours} Stunden vorher erfolgen`)

    // Check for duplicate credit (same enrollment + session)
    const { data: existing } = await sb.from('session_credits')
      .select('id').eq('enrollment_id', enrollmentId).eq('original_session_id', sessionId)
      .maybeSingle()
    if (existing) return res.error(400, 'Für diesen Termin wurde bereits ein Guthaben erstellt')

    // Issue credit
    const validUntil = block.extended_end_date ?? block.end_date ?? session.date
    const { data: credit, error } = await sb.from('session_credits').insert({
      enrollment_id: enrollmentId,
      block_id: enrollment.block_id,
      provider_id: block.provider_id,
      parent_id: parent.parentId,
      child_id: enrollment.child_id,
      activity_type: block.activity_type ?? 'course',
      reason: 'parent_cancellation',
      is_provider_cancellation: false,
      original_session_id: sessionId,
      original_session_date: session.date,
      status: 'available',
      valid_until: validUntil,
    }).select().single()

    if (error) {
      console.error('[Credit-Request] Insert failed:', error)
      return res.error(500, 'Guthaben konnte nicht erstellt werden')
    }

    // Update enrollment credits_earned
    await sb.from('block_enrollments')
      .update({ credits_earned: (enrollment.credits_earned ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', enrollmentId)

    // Mark session-attendance as cancelled (so the Eltern-Strip + Provider-Dashboard show it)
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

    // Notify provider via messages table (so it appears in their parent-postfach)
    try {
      const sessionDateLabel = new Date(session.date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
      const childRefName = enrollment.child_name || 'Ihr Kind'
      const reasonText = (req.body as any).reason ? ` Grund: ${(req.body as any).reason}.` : ''
      await sb.from('messages').insert({
        provider_id: block.provider_id,
        parent_id: parent.parentId,
        type: 'system',
        body: `Krankmeldung: ${childRefName} kann am ${sessionDateLabel} (${session.start_time?.slice(0,5) || ''}) nicht teilnehmen.${reasonText} Add-Up-Credit wurde automatisch gutgeschrieben.`,
      })
    } catch (msgErr) {
      console.error('[Credit-Request] Provider message failed:', msgErr)
    }

    // State-aware credit email: first time = full explanation, subsequent = short
    try {
      const { data: parentRow } = await sb.from('parents').select('name, email').eq('id', parent.parentId).single()
      const authUser = await findAuthUserByEmail((parentRow?.email || '').toLowerCase())
      const sentCount = Number(authUser?.user_metadata?.credit_emails_sent || 0)
      const isFirstTime = sentCount === 0
      const sbAdmin = getServiceClient()
      const { EmailService } = await import('../../lib/email')

      if (parentRow?.email) {
        const portalUrl = (process.env.APP_PUBLIC_URL || 'https://app.urbankids.club') + '/portal/'
        const sessionDateLabel = new Date(session.date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
        const validUntilLabel = new Date(validUntil).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
        const childName = enrollment.child_name || 'dein Kind'
        const firstName = (parentRow.name || '').split(' ')[0] || ''

        const subject = isFirstTime
          ? `Dein erstes Add-Up-Credit ist da — Urban Kids Club`
          : `Add-Up-Credit gutgeschrieben`

        const body = isFirstTime ? `
          <div style="font-family:'Bricolage Grotesque',Inter,sans-serif;max-width:560px;margin:0 auto;color:#1F1D18;background:#FBF5EA">
            <div style="padding:32px">
              <h1 style="font-size:24px;letter-spacing:-0.01em;margin:0 0 12px">Dein erstes Credit ist da.</h1>
              <p style="font-size:15px;line-height:1.55;margin:0 0 16px">Hi ${firstName}, wir haben deine Absage für ${childName} am <strong>${sessionDateLabel}</strong> notiert. Weil du rechtzeitig Bescheid gegeben hast, bekommst du <strong>1 Add-Up-Credit</strong> gutgeschrieben.</p>
              <div style="background:#F4E9D1;padding:16px 18px;border-radius:14px;margin:18px 0">
                <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#67625A;margin-bottom:8px">So geht's weiter</div>
                <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6">
                  <li><strong>Im Eltern-Portal sehen</strong>: alle Credits, gültig bis ${validUntilLabel}</li>
                  <li><strong>Add-Up buchen</strong>: ein anderes Kurstermin im Studio nutzen</li>
                  <li><strong>Block-Bonus</strong>: alternativ als Bonus zum nächsten Block einlösen</li>
                </ul>
              </div>
              <div style="text-align:center;margin:28px 0">
                <a href="${portalUrl}" style="display:inline-block;background:#D96C45;color:#FBF5EA;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px">Zum Eltern-Portal →</a>
              </div>
              <p style="font-size:12px;color:#67625A;margin:18px 0 0;border-top:1px solid rgba(31,29,24,0.08);padding-top:14px">Powered by Urban Kids Club</p>
            </div>
          </div>
        ` : `
          <div style="font-family:'Bricolage Grotesque',Inter,sans-serif;max-width:560px;margin:0 auto;color:#1F1D18;background:#FBF5EA">
            <div style="padding:28px">
              <p style="font-size:15px;line-height:1.55;margin:0 0 12px">Hi ${firstName},</p>
              <p style="font-size:15px;line-height:1.55;margin:0 0 18px">deine Absage für ${childName} am <strong>${sessionDateLabel}</strong> ist gespeichert. <strong>1 Credit</strong> ist auf deinem Konto, gültig bis ${validUntilLabel}.</p>
              <div style="text-align:center;margin:18px 0">
                <a href="${portalUrl}" style="display:inline-block;background:#D96C45;color:#FBF5EA;padding:11px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Zum Portal →</a>
              </div>
              <p style="font-size:11.5px;color:#67625A;margin:14px 0 0">Powered by Urban Kids Club</p>
            </div>
          </div>
        `

        await EmailService.send({ to: parentRow.email, subject, html: body })

        // Increment counter so next email uses short variant
        if (authUser) {
          await sbAdmin.auth.admin.updateUserById(authUser.id, {
            user_metadata: { ...(authUser.user_metadata || {}), credit_emails_sent: sentCount + 1 },
          })
        }
        console.info(`[Credit-Email] sent (firstTime=${isFirstTime}) to ${parentRow.email}`)
      }
    } catch (emailErr) {
      console.error('[Credit-Request] Email failed:', emailErr)
    }

    console.log('[Credit-Request] Credit issued for parent ' + parent.parentId + ', session ' + sessionId)
    res.status(201).json({ data: { creditId: credit.id, status: 'available', validUntil } })
  })


  // ── List available Add-Up slots for redemption ──
  // Returns future sessions in any block of providers parent has bookings with,
  // where makeup_capacity > already-redeemed-count.
  router.get('/api/portal/addup-slots', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()

    // Provider IDs the parent has bookings with
    const { data: bookings } = await sb.from('provider_bookings')
      .select('provider_id, activity_id').eq('parent_id', auth.parentId)
    const providerIds = [...new Set((bookings ?? []).map((b: any) => b.provider_id))]
    if (!providerIds.length) return res.json({ data: [] })

    // Original sessions for this parent's available credits (to exclude from picker)
    const { data: parentCredits } = await sb.from('session_credits')
      .select('original_session_id').eq('parent_id', auth.parentId).eq('status', 'available')
    const blockedSessionIds = new Set((parentCredits ?? []).map((c: any) => c.original_session_id).filter(Boolean))

    // Active blocks from these providers
    const { data: blocks } = await sb.from('course_blocks')
      .select('id, activity_id, provider_id, capacity, makeup_capacity, end_date, extended_end_date, start_date')
      .in('provider_id', providerIds)
      .gte('end_date', new Date().toISOString().slice(0, 10))
    if (!blocks?.length) return res.json({ data: [] })

    const blockIds = blocks.map((b: any) => b.id)

    // Future sessions
    const todayY = new Date().toISOString().slice(0, 10)
    const { data: sessions } = await sb.from('block_sessions')
      .select('id, block_id, date, start_time, end_time, status')
      .in('block_id', blockIds)
      .gte('date', todayY)
      .neq('status', 'cancelled')
      .order('date', { ascending: true })
      .limit(200)
    if (!sessions?.length) return res.json({ data: [] })

    // Count makeup-attendance per session
    const sessionIds = sessions.map((s: any) => s.id)
    const { data: attendance } = sessionIds.length
      ? await sb.from('session_attendance_records').select('session_id, is_makeup, status').in('session_id', sessionIds)
      : { data: [] }
    const makeupCountBySession = new Map<string, number>()
    for (const a of attendance ?? []) {
      if (a.is_makeup && (a.status === 'attended' || a.status === 'reserved')) {
        makeupCountBySession.set(a.session_id, (makeupCountBySession.get(a.session_id) || 0) + 1)
      }
    }

    // Activities + providers for labels
    const actIds = [...new Set(blocks.map((b: any) => b.activity_id))]
    const { data: acts } = actIds.length ? await sb.from('activities').select('id, title, schedule, age_range, category').in('id', actIds) : { data: [] }
    const { data: provs } = providerIds.length ? await sb.from('providers').select('id, company_name, display_name').in('id', providerIds) : { data: [] }
    const actMap = new Map((acts ?? []).map((a: any) => [a.id, a]))
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, (p.display_name || p.company_name)]))
    const blockMap = new Map(blocks.map((b: any) => [b.id, b]))

    const slots = sessions.flatMap((s: any) => {
      if (blockedSessionIds.has(s.id)) return []  // Don't allow redeeming for the same session you cancelled
      const block = blockMap.get(s.block_id)
      if (!block) return []
      const remaining = (block.makeup_capacity || 0) - (makeupCountBySession.get(s.id) || 0)
      if (remaining <= 0) return []
      const activity = actMap.get(block.activity_id) || {}
      const providerName = provMap.get(block.provider_id) || 'Studio'
      return [{
        sessionId: s.id,
        blockId: s.block_id,
        activityId: block.activity_id,
        activityTitle: activity.title || 'Kurs',
        providerName,
        date: s.date,
        startTime: s.start_time,
        endTime: s.end_time,
        addUpSlotsRemaining: remaining,
        ageRange: activity.age_range || null,
        category: activity.category || null,
      }]
    })

    res.json({ data: slots })
  })

  // ── Redeem a credit for an Add-Up slot ──
  router.post('/api/portal/credits/:creditId/redeem', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { sessionId } = req.body as { sessionId?: string }
    if (!sessionId) return res.error(400, 'sessionId ist erforderlich')

    // Verify credit
    const { data: credit } = await sb.from('session_credits')
      .select('id, parent_id, status, valid_until, child_id, enrollment_id, block_id, original_session_id')
      .eq('id', req.params.creditId).eq('parent_id', auth.parentId).maybeSingle()
    if (!credit) return res.error(404, 'Credit nicht gefunden')
    if (credit.status !== 'available') return res.error(400, 'Credit ist nicht verfügbar')
    if (credit.valid_until && new Date(credit.valid_until) < new Date()) {
      return res.error(400, 'Credit ist abgelaufen')
    }
    if (credit.original_session_id === sessionId) {
      return res.error(400, 'Der Credit kann nicht für den gleichen Termin eingelöst werden, den du abgesagt hast. Bitte wähl einen anderen Add-Up-Termin.')
    }

    // Verify session
    const { data: session } = await sb.from('block_sessions')
      .select('id, block_id, date, start_time, status').eq('id', sessionId).maybeSingle()
    if (!session) return res.error(404, 'Termin nicht gefunden')
    if (session.status === 'cancelled') return res.error(400, 'Termin wurde abgesagt')
    if (new Date(session.date + 'T' + (session.start_time || '00:00')) < new Date()) {
      return res.error(400, 'Termin ist vergangen')
    }

    // Verify block has makeup capacity left
    const { data: block } = await sb.from('course_blocks').select('id, makeup_capacity, provider_id').eq('id', session.block_id).single()
    if (!block) return res.error(404, 'Kursblock nicht gefunden')
    const { data: existingMakeups } = await sb.from('session_attendance_records')
      .select('id').eq('session_id', sessionId).eq('is_makeup', true).in('status', ['attended', 'reserved'])
    const used = (existingMakeups || []).length
    if (used >= (block.makeup_capacity || 0)) return res.error(400, 'Keine Add-Up-Plätze mehr frei')

    // Check duplicate: same parent already redeemed for this session?
    const { data: dupCheck } = await sb.from('session_attendance_records')
      .select('id').eq('session_id', sessionId).eq('makeup_credit_id', credit.id).maybeSingle()
    if (dupCheck) return res.error(400, 'Dieser Credit wurde bereits eingelöst')

    // Insert attendance record + mark credit as used
    const { error: insErr } = await sb.from('session_attendance_records').insert({
      session_id: sessionId,
      block_id: session.block_id,
      enrollment_id: credit.enrollment_id,
      child_id: credit.child_id,
      status: 'reserved',
      is_makeup: true,
      makeup_credit_id: credit.id,
    })
    if (insErr) {
      console.error('[Redeem] attendance insert failed:', insErr)
      return res.error(500, 'Konnte Add-Up nicht buchen')
    }
    await sb.from('session_credits').update({
      status: 'used', used_in_session_id: sessionId, used_at: new Date().toISOString(),
    }).eq('id', credit.id)

    // Notify provider via system message
    try {
      const { data: parentRow } = await sb.from('parents').select('name').eq('id', auth.parentId).single()
      const dateLabel = new Date(session.date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
      await sb.from('messages').insert({
        provider_id: block.provider_id,
        parent_id: auth.parentId,
        type: 'system',
        body: `Add-Up-Buchung: ${parentRow?.name || 'Eltern'} hat einen Credit für ${dateLabel} (${(session.start_time || '').slice(0,5)}) eingelöst.`,
      })
    } catch (e) { console.error('[Redeem] provider notify failed:', e) }

    // Email confirmation to parent
    try {
      const { data: parentRow } = await sb.from('parents').select('name, email').eq('id', auth.parentId).single()
      const { data: activity } = await sb.from('activities').select('title').eq('id', (await sb.from('course_blocks').select('activity_id').eq('id', session.block_id).single()).data?.activity_id || '').single()
      const dateLabel = new Date(session.date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
      const timeLabel = (session.start_time || '').slice(0,5)
      const courseName = activity?.title || 'Kurs'
      const portalUrl = (process.env.APP_PUBLIC_URL || 'https://app.urbankids.club') + '/portal/'
      const firstName = (parentRow?.name || '').split(' ')[0] || ''

      if (parentRow?.email) {
        const { EmailService } = await import('../../lib/email')
        await EmailService.send({
          to: parentRow.email,
          subject: `Add-Up gebucht: ${courseName} am ${dateLabel}`,
          html: `
            <div style="font-family:'Bricolage Grotesque',Inter,sans-serif;max-width:560px;margin:0 auto;color:#1F1D18;background:#FBF5EA">
              <div style="padding:32px">
                <h1 style="font-size:22px;letter-spacing:-0.01em;margin:0 0 12px">Dein Add-Up steht.</h1>
                <p style="font-size:15px;line-height:1.55;margin:0 0 16px">Hi ${firstName}, wir haben deinen Credit für folgenden Termin eingelöst:</p>
                <div style="background:#F4E9D1;padding:16px 18px;border-radius:14px;margin:18px 0">
                  <div style="font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:18px;color:#D96C45;margin-bottom:4px">${courseName}</div>
                  <div style="font-size:14px;color:#1F1D18">${dateLabel} · ${timeLabel} Uhr</div>
                </div>
                <p style="font-size:14px;line-height:1.55;color:#67625A;margin:0 0 18px">Dein Studio wurde informiert. Bei Fragen kannst du dich direkt an dein Studio wenden.</p>
                <div style="text-align:center;margin:26px 0">
                  <a href="${portalUrl}" style="display:inline-block;background:#D96C45;color:#FBF5EA;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Im Portal sehen →</a>
                </div>
                <p style="font-size:11.5px;color:#67625A;margin:14px 0 0;border-top:1px solid rgba(31,29,24,0.08);padding-top:12px">Powered by Urban Kids Club</p>
              </div>
            </div>
          `,
        })
        console.info(`[Redeem] confirmation email sent to ${parentRow.email}`)
      }
    } catch (emailErr) {
      console.error('[Redeem] email failed:', emailErr)
    }

    console.info(`[Redeem] credit ${credit.id} → session ${sessionId} for parent ${auth.parentId}`)
    res.json({ data: { success: true, creditId: credit.id, sessionId } })
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
    const { data: provs } = provIds.length ? await sb.from('providers').select('id, company_name').in('id', provIds) : { data: [] }
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, p.company_name]))

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
      .eq('parent_id', auth.parentId).order('sent_at', { ascending: false }).limit(200)

    const provIds = [...new Set((data ?? []).map((m: any) => m.provider_id))]
    const { data: provs } = provIds.length ? await sb.from('providers').select('id, company_name, display_name').in('id', provIds) : { data: [] }
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, (p.display_name || p.company_name)]))

    // Alias fields for frontend convenience
    const enriched = (data ?? []).map((m: any) => ({
      ...m,
      providerName: provMap.get(m.provider_id) || '',
      sender_type: m.type,
      read_at: m.read ? m.sent_at : null,
      created_at: m.sent_at,
    }))
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
      .order('sent_at', { ascending: true }).limit(100)

    // Get provider name
    const { data: prov } = await sb.from('providers').select('company_name').eq('id', req.params.providerId).maybeSingle()

    // Auto-mark provider messages as read
    await sb.from('messages').update({ read: true })
      .eq('parent_id', auth.parentId).eq('provider_id', req.params.providerId)
      .eq('type', 'provider').eq('read', false)

    const enriched = (data ?? []).map((m: any) => ({ ...m, providerName: prov?.company_name || '' }))
    res.json({ data: enriched })
  })

  // Mark messages as read (must be registered before :providerId to avoid route conflict)
  router.post('/api/portal/messages/mark-read', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const { messageIds, providerId } = req.body as { messageIds?: string[]; providerId?: string }
    const sb = getServiceClient()
    let q = sb.from('messages').update({ read: true })
      .eq('parent_id', auth.parentId).eq('type', 'provider').eq('read', false)
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
      .order('sent_at', { ascending: true })
    // Mark unread messages as read
    await sb.from('messages').update({ read: true })
      .eq('provider_id', auth.providerId).eq('parent_id', req.params.parentId)
      .eq('type', 'parent').eq('read', false)
    res.json({ data: data ?? [] })
  })

  // Provider: list ALL message threads grouped by parent
  router.get('/api/messages/threads', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()

    // Pull all messages for this provider in last 90 days (column is sent_at)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data: msgs, error: msgsErr } = await sb.from('messages')
      .select('id, parent_id, type, subject, body, read, sent_at')
      .eq('provider_id', auth.providerId)
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })

    if (msgsErr) {
      console.error('[messages/threads] fetch failed:', msgsErr)
      return res.error(500, 'Konnte Nachrichten nicht laden')
    }
    if (!msgs?.length) return res.json({ data: [] })

    // Group by parent_id
    const byParent = new Map<string, any[]>()
    for (const m of msgs) {
      if (!m.parent_id) continue
      if (!byParent.has(m.parent_id)) byParent.set(m.parent_id, [])
      byParent.get(m.parent_id)!.push(m)
    }

    const parentIds = Array.from(byParent.keys())
    if (!parentIds.length) return res.json({ data: [] })

    const { data: parents } = await sb.from('parents').select('id, name, email, children').in('id', parentIds)
    const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p]))

    const threads = parentIds.map(pid => {
      const parent: any = parentMap.get(pid) || { id: pid, name: 'Unbekannt', email: '', children: [] }
      const messages = byParent.get(pid)!.map((m: any) => ({
        ...m,
        // alias for frontend convenience
        created_at: m.sent_at,
      }))
      const unread = messages.filter((m: any) => m.type === 'parent' && !m.read).length
      const latest = messages[0]
      return {
        parentId: pid,
        parentName: parent.name || 'Unbekannt',
        parentEmail: parent.email || '',
        children: parent.children || [],
        messages,
        unread,
        latestAt: latest?.sent_at,
        latestPreview: (latest?.body || '').slice(0, 140),
        latestType: latest?.type,
      }
    }).sort((a, b) => (b.latestAt || '').localeCompare(a.latestAt || ''))

    res.json({ data: threads })
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
}
