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

    // Send Magic Link via Supabase Auth OTP
    const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: `${origin}/portal/` },
    })
    if (signInError) {
      console.error('[Portal] Magic link email failed:', signInError)
    }

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
    const calSecret = process.env.CALENDAR_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'ukc-calendar-default'
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
    const calSecret = process.env.CALENDAR_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'ukc-calendar-default'
    const calendarToken = createHmac('sha256', calSecret).update(auth.parentId).digest('hex').slice(0, 32)
    res.json({ data: { ...parent, calendarToken } })
  })

  // ── iCal Feed for parent's booked sessions ───────────────
  // Public endpoint using HMAC token (calendar apps can't send auth headers)
  // URL format: /api/portal/calendar/:token.ics
  // Token = HMAC-SHA256(parentId, secret).slice(0,32) — not guessable from UUID
  router.get('/api/portal/calendar/:token.ics', async (req, res) => {
    const token = req.params.token
    if (!token || token.length < 16) return res.error(400, 'Ungültiger Kalender-Token')

    const sb = getServiceClient()

    // Look up parent by HMAC token: iterate parents and compare HMAC
    // For scalability, a calendar_token column could be added to the parents table
    const { createHmac } = await import('node:crypto')
    const calSecret = process.env.CALENDAR_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'ukc-calendar-default'

    const { data: allParents } = await sb.from('parents').select('id, name, email')
    if (!allParents || allParents.length === 0) return res.error(404, 'Nicht gefunden')

    const parent = allParents.find((p: any) => {
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

    // Enrich with activity titles + provider names
    const actIds = [...new Set((bookings ?? []).map((b: any) => b.activity_id))]
    const provIds = [...new Set((bookings ?? []).map((b: any) => b.provider_id))]
    const { data: acts } = actIds.length ? await sb.from('activities').select('id, title, schedule').in('id', actIds) : { data: [] }
    const { data: provs } = provIds.length ? await sb.from('providers').select('id, company_name').in('id', provIds) : { data: [] }
    const actMap = new Map((acts ?? []).map((a: any) => [a.id, a]))
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, p.company_name]))

    const enriched = (bookings ?? []).map((b: any) => ({
      ...b,
      activityTitle: actMap.get(b.activity_id)?.title || 'Kurs',
      providerName: provMap.get(b.provider_id) || 'Anbieter',
      schedule: actMap.get(b.activity_id)?.schedule || null,
    }))
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
      .select('id, provider_id, sender_type, content, read_at, created_at')
      .eq('parent_id', auth.parentId).order('created_at', { ascending: false }).limit(200)

    // Get provider names
    const provIds = [...new Set((data ?? []).map((m: any) => m.provider_id))]
    const { data: provs } = provIds.length ? await sb.from('providers').select('id, company_name').in('id', provIds) : { data: [] }
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, p.company_name]))

    const enriched = (data ?? []).map((m: any) => ({ ...m, providerName: provMap.get(m.provider_id) || '' }))
    res.json({ data: enriched })
  })

  // Get conversation with a specific provider
  router.get('/api/portal/messages/:providerId', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data } = await sb.from('messages')
      .select('id, provider_id, sender_type, content, read_at, created_at')
      .eq('parent_id', auth.parentId).eq('provider_id', req.params.providerId)
      .order('created_at', { ascending: true }).limit(100)

    // Get provider name
    const { data: prov } = await sb.from('providers').select('company_name').eq('id', req.params.providerId).maybeSingle()

    // Auto-mark provider messages as read
    await sb.from('messages').update({ read_at: new Date().toISOString() })
      .eq('parent_id', auth.parentId).eq('provider_id', req.params.providerId)
      .eq('sender_type', 'provider').is('read_at', null)

    const enriched = (data ?? []).map((m: any) => ({ ...m, providerName: prov?.company_name || '' }))
    res.json({ data: enriched })
  })

  // Mark messages as read (must be registered before :providerId to avoid route conflict)
  router.post('/api/portal/messages/mark-read', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const { messageIds, providerId } = req.body as { messageIds?: string[]; providerId?: string }
    const sb = getServiceClient()
    let q = sb.from('messages').update({ read_at: new Date().toISOString() })
      .eq('parent_id', auth.parentId).eq('sender_type', 'provider').is('read_at', null)
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
      sender_type: 'parent', content: content.trim(),
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
      sender_type: 'parent', content: content.trim(),
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
      .order('created_at', { ascending: true })
    // Mark unread messages as read
    await sb.from('messages').update({ read_at: new Date().toISOString() })
      .eq('provider_id', auth.providerId).eq('parent_id', req.params.parentId)
      .eq('sender_type', 'parent').is('read_at', null)
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
      sender_type: 'provider', content: content.trim(),
    }).select().single()
    if (error) throw error
    res.status(201).json({ data })
  })
}
