// ============================================================
// Misc Routes — Reviews, Messages, Notifications, Calendar,
// Exports, Reporting, Audit, iCal, Invitations, QR Check-In
// ============================================================

import { Router } from '../router'
import { validate, CreateReviewSchema, SendMessageSchema, CreateExportSchema } from '../../lib/schemas'
import { requireAuth, invalidateAuthCache } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import {
  ReviewService, MessageService, NotificationService, CalendarService,
  ExportService, ReportingService, AuditService, ActivityService,
  ProviderService, AttendanceService,
} from '../../services'
import { safeParseInt, rateLimit, getClientIp } from './helpers'

export function registerMiscRoutes(router: Router) {

  // ============================================================
  // REVIEWS
  // ============================================================

  router.get('/api/activities/:activityId/reviews', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const reviews = await ReviewService.listByActivity(req.params.activityId)
    const avg = await ReviewService.getAverageRating(req.params.activityId)
    res.json({ data: reviews, average: avg.average, count: avg.count })
  })

  router.get('/api/providers/:providerId/reviews', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const reviews = await ReviewService.listByProvider(auth.providerId)
    const rating = await ReviewService.getProviderRating(auth.providerId)
    const distribution = await ReviewService.getRatingDistribution(auth.providerId)
    res.json({ data: reviews, rating, distribution })
  })

  router.post('/api/reviews', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateReviewSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await ReviewService.create(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  // ============================================================
  // MESSAGES
  // ============================================================

  router.get('/api/providers/:providerId/messages', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const messages = await MessageService.getInbox(auth.providerId, {
      unreadOnly: req.query.unread === 'true',
      type: req.query.type as any,
    })
    const unreadCount = await MessageService.getUnreadCount(auth.providerId)
    res.json({ data: messages, unreadCount })
  })

  router.get('/api/messages/conversation/:providerId/:parentId', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const messages = await MessageService.getConversation(auth.providerId, req.params.parentId)
    res.json({ data: messages })
  })

  router.post('/api/messages', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(SendMessageSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const message = await MessageService.send(parsed.data as any)
    res.status(201).json({ data: message })
  })

  router.post('/api/messages/broadcast', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { activityId, subject, body } = req.body as any
    if (!activityId || !body) return res.error(400, 'activityId und body erforderlich')
    // Limit field lengths
    const safeSubject = subject ? String(subject).slice(0, 200) : ''
    const safeBody = String(body).slice(0, 5000)
    const messages = await MessageService.broadcast(auth.providerId, activityId, safeSubject, safeBody)
    res.status(201).json({ data: messages, count: messages.length })
  })

  router.post('/api/messages/:id/read', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const message = await MessageService.markAsRead(req.params.id)
    if (!message) return res.error(404, 'Nachricht nicht gefunden')
    res.json({ data: message })
  })

  // ============================================================
  // NOTIFICATIONS
  // ============================================================

  router.get('/api/notifications/:recipientId', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const notifications = await NotificationService.getByRecipient(auth.providerId, {
      unread: req.query.unread === 'true',
      type: req.query.type as any,
    })
    const unreadCount = await NotificationService.getUnreadCount(auth.providerId)
    res.json({ data: notifications, unreadCount })
  })

  router.post('/api/notifications/:id/read', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const notification = await NotificationService.markAsRead(req.params.id, auth.providerId)
    if (!notification) return res.error(404, 'Benachrichtigung nicht gefunden')
    res.json({ data: notification })
  })

  router.post('/api/notifications/:recipientId/read-all', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const count = await NotificationService.markAllAsRead(auth.providerId)
    res.json({ data: { markedAsRead: count } })
  })

  // ============================================================
  // CALENDAR
  // ============================================================

  router.get('/api/providers/:providerId/calendar', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { start, end } = req.query
    if (!start || !end) return res.error(400, 'start und end Parameter erforderlich')
    const events = await CalendarService.getByDateRange(auth.providerId, start, end)
    const conflicts = await CalendarService.detectConflictsInRange(auth.providerId, start, end)
    res.json({ data: events, conflicts, count: events.length })
  })

  router.get('/api/providers/:providerId/calendar/ical', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { start, end } = req.query
    if (!start || !end) return res.error(400, 'start und end Parameter erforderlich')
    const ical = await CalendarService.generateICalFeed(auth.providerId, start, end)
    res.json({ data: ical, contentType: 'text/calendar' })
  })

  router.post('/api/providers/:providerId/calendar/sync', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const events = await CalendarService.syncActivitiesToCalendar(auth.providerId)
    res.json({ data: events, count: events.length })
  })

  // ============================================================
  // EXPORTS
  // ============================================================

  router.post('/api/providers/:providerId/export', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { type, format } = req.body as { type: string; format: string }
    if (!type || !format) return res.error(400, 'type und format sind erforderlich')

    const sb = getServiceClient()

    if (type === 'bookings') {
      const { data: bookings } = await sb.from('provider_bookings')
        .select('id, activity_id, parent_id, child_info, status, payment_status, payment_method, amount_paid, currency, created_at')
        .eq('provider_id', auth.providerId).order('created_at', { ascending: false })
      const { data: activities } = await sb.from('activities').select('id, title').eq('provider_id', auth.providerId)
      const { data: parents } = await sb.from('parents').select('id, name, email')
      const actMap = new Map((activities ?? []).map((a: any) => [a.id, a.title]))
      const parMap = new Map((parents ?? []).map((p: any) => [p.id, { name: p.name, email: p.email }]))

      if (format === 'datev') {
        // DATEV Buchungsstapel
        let csv = '"Umsatz";"Soll/Haben";"Konto";"Gegenkonto";"Buchungstext";"Belegdatum"\r\n'
        for (const b of bookings ?? []) {
          if (b.payment_status !== 'paid') continue
          const date = new Date(b.created_at)
          const dateStr = String(date.getDate()).padStart(2,'0') + String(date.getMonth()+1).padStart(2,'0')
          const ci = b.child_info as any
          const courseName = actMap.get(b.activity_id) || 'Kurs'
          csv += `"${(b.amount_paid || 0).toFixed(2).replace('.',',')}";"S";"1200";"8400";"${courseName} - ${ci?.firstName || ''} ${ci?.lastName || ''}";"${dateStr}"\r\n`
        }
        return res.json({ data: { content: csv, filename: 'buchungen_datev_' + new Date().toISOString().slice(0,10) + '.csv' } })
      }

      // CSV
      let csv = 'Datum;Kurs;Kind;Elternteil;E-Mail;Status;Zahlung;Betrag;Währung\r\n'
      for (const b of bookings ?? []) {
        const ci = b.child_info as any
        const par = parMap.get(b.parent_id)
        const date = new Date(b.created_at).toLocaleDateString('de-DE')
        csv += `"${date}";"${actMap.get(b.activity_id) || ''}";"${ci?.firstName || ''} ${ci?.lastName || ''}";"${par?.name || ''}";"${par?.email || ''}";"${b.status}";"${b.payment_status}";"${(b.amount_paid || 0).toFixed(2).replace('.',',')}";"${b.currency}"\r\n`
      }
      return res.json({ data: { content: csv, filename: 'buchungen_' + new Date().toISOString().slice(0,10) + '.csv' } })
    }

    if (type === 'invoices') {
      const { data: invoices } = await sb.from('invoices')
        .select('id, number, status, subtotal, tax, total, currency, issued_at, due_date, paid_at, line_items')
        .eq('provider_id', auth.providerId).order('issued_at', { ascending: false })

      if (format === 'datev') {
        let csv = '"Umsatz";"Soll/Haben";"Konto";"Gegenkonto";"Buchungstext";"Belegdatum";"Belegnummer"\r\n'
        for (const inv of invoices ?? []) {
          if (inv.status === 'cancelled') continue
          const date = new Date(inv.issued_at)
          const dateStr = String(date.getDate()).padStart(2,'0') + String(date.getMonth()+1).padStart(2,'0')
          csv += `"${(inv.total || 0).toFixed(2).replace('.',',')}";"S";"1200";"8400";"Rechnung ${inv.number}";"${dateStr}";"${inv.number}"\r\n`
        }
        return res.json({ data: { content: csv, filename: 'rechnungen_datev_' + new Date().toISOString().slice(0,10) + '.csv' } })
      }

      let csv = 'Rechnungsnr;Status;Netto;MwSt;Brutto;Währung;Erstellt;Fällig;Bezahlt\r\n'
      for (const inv of invoices ?? []) {
        const issued = inv.issued_at ? new Date(inv.issued_at).toLocaleDateString('de-DE') : ''
        const due = inv.due_date ? new Date(inv.due_date).toLocaleDateString('de-DE') : ''
        const paid = inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('de-DE') : ''
        csv += `"${inv.number}";"${inv.status}";"${(inv.subtotal || 0).toFixed(2).replace('.',',')}";"${(inv.tax || 0).toFixed(2).replace('.',',')}";"${(inv.total || 0).toFixed(2).replace('.',',')}";"${inv.currency}";"${issued}";"${due}";"${paid}"\r\n`
      }
      return res.json({ data: { content: csv, filename: 'rechnungen_' + new Date().toISOString().slice(0,10) + '.csv' } })
    }

    res.error(400, 'Unbekannter Export-Typ: ' + type)
  })

  // ============================================================
  // REPORTING
  // ============================================================

  router.get('/api/providers/:providerId/dashboard', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const summary = await ReportingService.getDashboardSummary(auth.providerId)
    res.json({ data: summary })
  })

  router.get('/api/providers/:providerId/reports/revenue/:period', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const report = await ReportingService.getRevenueReport(auth.providerId, req.params.period)
    res.json({ data: report })
  })

  router.get('/api/providers/:providerId/reports/occupancy', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const occupancy = await ReportingService.getOccupancyByActivity(auth.providerId)
    res.json({ data: occupancy })
  })

  router.get('/api/providers/:providerId/reports/clv', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const clv = await ReportingService.getCustomerLifetimeValue(auth.providerId)
    res.json({ data: clv })
  })

  router.get('/api/providers/:providerId/reports/churn', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const months = safeParseInt(req.query.months, 3)
    const churn = await ReportingService.getChurnRate(auth.providerId, months)
    res.json({ data: churn })
  })

  router.get('/api/providers/:providerId/reports/trials', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const trials = await ReportingService.getTrialConversionByActivity(auth.providerId)
    res.json({ data: trials })
  })

  router.get('/api/providers/:providerId/reports/staff', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const staff = await ReportingService.getStaffUtilization(auth.providerId)
    res.json({ data: staff })
  })

  // ============================================================
  // AUDIT LOG
  // ============================================================

  router.get('/api/providers/:providerId/audit', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const entries = await AuditService.getByProvider(auth.providerId, {
      action: req.query.action,
      entityType: req.query.entityType,
    })
    res.json({ data: entries })
  })

  router.get('/api/providers/:providerId/audit/recent', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const limit = safeParseInt(req.query.limit, 20)
    const entries = await AuditService.getRecentActivity(auth.providerId, limit)
    res.json({ data: entries })
  })

  // ============================================================
  // ICAL FEED (Public — for parents to subscribe)
  // ============================================================

  router.get('/api/public/calendar/:providerId.ics', async (req, res) => {
    const sb = getServiceClient()
    const { data: provider } = await sb.from('providers').select('company_name').eq('id', req.params.providerId).maybeSingle()
    if (!provider) return res.error(404, 'Provider nicht gefunden')

    const { data: activities } = await sb.from('activities')
      .select('id, title, schedule, duration_minutes, category')
      .eq('provider_id', req.params.providerId).eq('status', 'published')

    const dayToNum: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
    const now = new Date()
    const weeks = 12 // Generate events for next 12 weeks

    let ical = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Urban Kids Club//Dashboard//DE\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:' + (provider.company_name || 'Kurse') + '\r\nX-WR-TIMEZONE:Europe/Berlin\r\n'

    for (const act of activities ?? []) {
      const sched = act.schedule as any
      const slots = Array.isArray(sched) ? sched : (sched?.slots ?? [])
      const startDate = sched?.startDate ? new Date(sched.startDate) : now
      const endDate = sched?.endDate ? new Date(sched.endDate) : new Date(now.getTime() + weeks * 7 * 86400000)

      for (const slot of slots) {
        const targetDay = dayToNum[slot.day?.toUpperCase()]
        if (targetDay === undefined) continue

        // Find first occurrence
        let d = new Date(startDate)
        while (d.getDay() !== targetDay && d <= endDate) d.setDate(d.getDate() + 1)

        // Generate weekly events
        while (d <= endDate) {
          const [sh, sm] = (slot.startTime || '00:00').split(':').map(Number)
          const [eh, em] = (slot.endTime || '01:00').split(':').map(Number)
          const dtStart = new Date(d); dtStart.setHours(sh, sm, 0, 0)
          const dtEnd = new Date(d); dtEnd.setHours(eh, em, 0, 0)

          const fmtDt = (dt: Date) => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

          ical += 'BEGIN:VEVENT\r\n'
          ical += 'UID:' + act.id + '-' + d.toISOString().slice(0,10) + '@urbankids.club\r\n'
          ical += 'DTSTART;TZID=Europe/Berlin:' + fmtDt(dtStart).slice(0, -1) + '\r\n'
          ical += 'DTEND;TZID=Europe/Berlin:' + fmtDt(dtEnd).slice(0, -1) + '\r\n'
          ical += 'SUMMARY:' + act.title + '\r\n'
          ical += 'DESCRIPTION:' + (act.category || '') + ' – ' + (provider.company_name || '') + '\r\n'
          ical += 'END:VEVENT\r\n'

          d.setDate(d.getDate() + 7)
        }
      }
    }

    ical += 'END:VCALENDAR\r\n'

    // Use raw response for proper content-type
    const raw = (req as any).raw
    if (raw?.res) {
      raw.res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="kurse.ics"' })
      raw.res.end(ical)
    } else {
      res.json({ data: ical })
    }
  })

  // ============================================================
  // COURSE INVITATIONS (Kurs-Einladungen)
  // ============================================================

  // Find parents with children matching an activity's age range + category
  router.get('/api/activities/:activityId/matching-parents', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data: activity } = await sb.from('activities')
      .select('id, title, category, age_group_min, age_group_max')
      .eq('id', req.params.activityId).eq('provider_id', auth.providerId).maybeSingle()
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')

    // Get all parents who have booked with this provider
    const { data: bookings } = await sb.from('provider_bookings')
      .select('parent_id, child_info, activity_id').eq('provider_id', auth.providerId)
      .in('status', ['confirmed', 'completed'])
    const { data: parents } = await sb.from('parents').select('id, name, email, children')

    const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p]))
    const currentYear = new Date().getFullYear()

    // Score parents: age match + category match
    const matches: Array<{ parentId: string; name: string; email: string; childName: string; childAge: number; score: number; previousBookings: number; categoryMatch: boolean }> = []
    const seen = new Set<string>()

    for (const b of bookings ?? []) {
      const parent = parentMap.get(b.parent_id)
      if (!parent || seen.has(parent.id)) continue

      const ci = b.child_info as any
      const birthYear = ci?.birthYear
      if (!birthYear) continue
      const age = currentYear - birthYear

      // Check age range
      if (age >= (activity.age_group_min || 0) && age <= (activity.age_group_max || 99)) {
        seen.add(parent.id)

        // Count previous bookings + check category match
        const parentBookings = (bookings ?? []).filter((pb: any) => pb.parent_id === parent.id)
        const { data: prevActivities } = await sb.from('activities').select('category').in('id', parentBookings.map((pb: any) => pb.activity_id))
        const categoryMatch = (prevActivities ?? []).some((a: any) => a.category === activity.category)

        matches.push({
          parentId: parent.id,
          name: parent.name,
          email: parent.email,
          childName: ci.firstName ? `${ci.firstName} ${ci.lastName || ''}`.trim() : 'Kind',
          childAge: age,
          score: (categoryMatch ? 10 : 0) + Math.min(parentBookings.length, 5),
          previousBookings: parentBookings.length,
          categoryMatch,
        })
      }
    }

    // Sort by score (best matches first)
    matches.sort((a, b) => b.score - a.score)
    res.json({ data: matches })
  })

  // Send course invitations to selected parents
  router.post('/api/activities/:activityId/invite', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { parentIds, couponCode } = req.body as { parentIds: string[]; couponCode?: string }
    if (!parentIds?.length) return res.error(400, 'Keine Eltern ausgewählt')

    const sb = getServiceClient()
    const { data: activity } = await sb.from('activities')
      .select('id, title, category, age_group_min, age_group_max, schedule, pricing')
      .eq('id', req.params.activityId).eq('provider_id', auth.providerId).maybeSingle()
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')

    const { data: provider } = await sb.from('providers').select('company_name, slug').eq('id', auth.providerId).maybeSingle()
    const { data: parents } = await sb.from('parents').select('id, name, email, children').in('id', parentIds)

    const { EmailService } = await import('../../lib/email')
    const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
    const bookingUrl = `${origin}/widget/${provider?.slug || ''}`
    const currentYear = new Date().getFullYear()

    // Build course details string
    const sched = activity.schedule as any
    const slots = sched?.slots || []
    const dayLabels: Record<string, string> = { MO: 'Mo', TU: 'Di', WE: 'Mi', TH: 'Do', FR: 'Fr', SA: 'Sa', SU: 'So' }
    const scheduleStr = slots.map((s: any) => `${dayLabels[s.day] || s.day} ${s.startTime}–${s.endTime}`).join(', ')
    const pricing = (activity.pricing as any[])?.[0]
    const priceStr = pricing ? `${pricing.amount}€ (${pricing.label})` : ''
    const courseDetails = `${activity.age_group_min}–${activity.age_group_max} Jahre · ${scheduleStr}${priceStr ? ' · ' + priceStr : ''}`

    let sent = 0
    for (const parent of parents ?? []) {
      // Find matching child name
      const children = parent.children as any[] || []
      const matchChild = children.find((c: any) => {
        const age = currentYear - (c.birthYear || 0)
        return age >= (activity.age_group_min || 0) && age <= (activity.age_group_max || 99)
      })
      const childName = matchChild ? `${matchChild.firstName} ${matchChild.lastName || ''}`.trim() : 'Ihr Kind'

      try {
        await EmailService.sendCourseInvitation(parent.email, {
          parentName: parent.name,
          childName,
          courseName: activity.title,
          providerName: provider?.company_name || '',
          courseDetails,
          bookingUrl,
          couponCode,
        })
        sent++
      } catch (e) { console.error('[Invite] Email failed:', e) }
    }

    console.log(`[Invite] Sent ${sent} invitations for "${activity.title}"`)
    res.json({ data: { sent, total: parentIds.length } })
  })

  // ============================================================
  // QR CHECK-IN (public – no auth)
  // ============================================================

  // Step 1: Lookup — email → list of children/courses for today
  router.post('/api/public/checkin/lookup', async (req, res) => {
    const { providerId, email } = req.body as { providerId?: string; email?: string }
    if (!providerId || !email) return res.error(400, 'providerId und email sind erforderlich')
    // Rate limit: 10 lookups per IP per 15 minutes
    const ip = getClientIp(req)
    if (!rateLimit(`checkin-lookup:${ip}`, 10, 15 * 60 * 1000)) return res.error(429, 'Zu viele Anfragen. Bitte warten.')
    // Validate UUID format to prevent enumeration
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId)) return res.error(400, 'Ungültige Provider-ID')
    const provider = await ProviderService.getById(providerId)
    if (!provider) return res.error(404, 'Anbieter nicht gefunden')
    const result = await AttendanceService.qrLookup(providerId, email)
    res.json({ data: result })
  })

  // Step 2: Check in selected bookings
  router.post('/api/public/checkin', async (req, res) => {
    const { providerId, email, bookingIds } = req.body as { providerId?: string; email?: string; bookingIds?: string[] }
    if (!providerId || !email) return res.error(400, 'providerId und email sind erforderlich')
    // Rate limit: 20 check-ins per IP per 15 minutes
    const ip = getClientIp(req)
    if (!rateLimit(`checkin:${ip}`, 20, 15 * 60 * 1000)) return res.error(429, 'Zu viele Anfragen. Bitte warten.')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId)) return res.error(400, 'Ungültige Provider-ID')
    const provider = await ProviderService.getById(providerId)
    if (!provider) return res.error(404, 'Anbieter nicht gefunden')

    const result = await AttendanceService.qrCheckIn(providerId, email, bookingIds)

    const sb = getServiceClient()
    const { data: provData } = await sb.from('providers')
      .select('checkin_redirect_url').eq('id', providerId).maybeSingle()
    const redirectUrl = provData?.checkin_redirect_url || null

    res.json({ data: { ...result, redirectUrl } })
  })

  // Today's check-in overview for dashboard
  router.get('/api/attendance/today', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const overview = await AttendanceService.getTodayOverview(auth.providerId)
    res.json({ data: overview })
  })

  // ============================================================
  // AUTH CACHE INVALIDATION
  // ============================================================

  router.post('/api/auth/invalidate-cache', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Only owner/admin can invalidate cache
    if (auth.role !== 'owner' && auth.role !== 'admin') {
      return res.error(403, 'Nur Owner/Admin können den Auth-Cache leeren')
    }
    const { email } = req.body as { email?: string }
    if (email) {
      invalidateAuthCache(email)
    } else {
      // Invalidate own cache
      invalidateAuthCache(auth.email)
    }
    res.json({ success: true })
  })
}
