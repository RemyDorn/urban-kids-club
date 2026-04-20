// ============================================================
// Course Blocks, Sessions, Enrollments, Credits & Makeup Routes
// ============================================================

import { Router } from '../router'
import { requireAuth } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { ActivityService, CourseBlockService, SessionCreditService, MakeupBookingService } from '../../services'
import { requireAdmin } from './helpers'

export function registerCourseBlockRoutes(router: Router) {

  // --- Course Blocks ---

  router.post('/api/course-blocks', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const body = req.body as any
    // Basic validation
    if (!body.activityId) return res.error(400, 'activityId erforderlich')
    if (!body.startDate || !body.totalSessions) return res.error(400, 'startDate und totalSessions erforderlich')
    if (body.totalSessions < 1 || body.totalSessions > 52) return res.error(400, 'totalSessions muss zwischen 1 und 52 liegen')
    if (body.capacity && (body.capacity < 1 || body.capacity > 200)) return res.error(400, 'Ungültige Kapazität')
    // Ensure provider owns the activity
    const act = await ActivityService.getById(body.activityId)
    if (!act || act.providerId !== auth.providerId) return res.error(403, 'Kurs nicht gefunden oder kein Zugriff')
    const result = await CourseBlockService.createBlock(body)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.get('/api/course-blocks/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const block = await CourseBlockService.getBlock(req.params.id, auth.providerId)
    if (!block) return res.error(404, 'Block nicht gefunden')
    res.json({ data: block })
  })

  router.get('/api/providers/:id/course-blocks', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const blocks = await CourseBlockService.getBlocksByProvider(auth.providerId)
    res.json({ data: blocks, count: blocks.length })
  })

  router.get('/api/course-blocks/by-type/:activityType', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const activeOnly = req.query.activeOnly === 'true'
    const blocks = await CourseBlockService.getBlocksByActivityType(req.params.activityType, activeOnly)
    res.json({ data: blocks, count: blocks.length })
  })

  // --- Block Sessions ---

  router.get('/api/course-blocks/:id/sessions', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const sessions = await CourseBlockService.getSessionsByBlock(req.params.id)
    res.json({ data: sessions, count: sessions.length })
  })

  router.get('/api/sessions/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const session = await CourseBlockService.getSession(req.params.id)
    if (!session) return res.error(404, 'Session nicht gefunden')
    res.json({ data: session })
  })

  router.post('/api/sessions/:id/cancel', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Ownership check: verify session belongs to provider's block
    const db = getServiceClient()
    const { data: sess } = await db.from('block_sessions').select('block_id, date, start_time').eq('id', req.params.id).maybeSingle()
    if (!sess) return res.error(404, 'Session nicht gefunden')
    // Past-event locking: prevent cancelling sessions that already happened
    const sessionDate = new Date(sess.date + 'T' + (sess.start_time || '00:00') + ':00')
    if (sessionDate < new Date()) return res.error(400, 'Vergangene Termine können nicht mehr geändert werden.')
    const { data: block } = await db.from('course_blocks').select('provider_id').eq('id', sess.block_id).maybeSingle()
    if (!block || block.provider_id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    const result = await CourseBlockService.cancelSession({
      sessionId: req.params.id,
      reason: req.body.reason,
      compensation: req.body.compensation,
      cancelledBy: req.body.cancelledBy ?? 'provider',
    })
    if (!result || 'error' in result) return res.error(400, (result as any)?.error ?? 'Fehler')
    res.json({ data: result })
  })

  // --- Session Reschedule (PATCH) ---

  router.patch('/api/sessions/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const db = getServiceClient()
    // Verify session exists and belongs to this provider's block
    const { data: session, error: sessErr } = await db.from('block_sessions').select('*, block:course_blocks!inner(provider_id)').eq('id', req.params.id).single()
    if (sessErr || !session) return res.error(404, 'Session nicht gefunden')
    if ((session as any).block?.provider_id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    // Past-event locking
    const sessDate = new Date(session.date + 'T' + (session.start_time || '00:00') + ':00')
    if (sessDate < new Date()) return res.error(400, 'Vergangene Termine können nicht mehr verschoben werden.')
    // Validate date
    const newDate = req.body.date
    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return res.error(400, 'Ungültiges Datum')
    const today = new Date().toISOString().slice(0, 10)
    if (newDate < today) return res.error(400, 'Datum darf nicht in der Vergangenheit liegen')
    // Update in DB
    const oldDate = session.date
    const { data: updated, error } = await db.from('block_sessions').update({ date: newDate }).eq('id', req.params.id).select().single()
    if (error) return res.error(500, error.message)

    // Notify all enrolled parents about the reschedule
    try {
      const blockId = session.block_id
      const { data: block } = await db.from('course_blocks').select('activity_id, recurring_time').eq('id', blockId).single()
      const { data: activity } = await db.from('activities').select('title, schedule').eq('id', block?.activity_id).single()
      const { data: enrollments } = await db.from('block_enrollments')
        .select('parent_id, child_name').eq('block_id', blockId).eq('status', 'active')
      const { data: provider } = await db.from('providers').select('company_name').eq('id', auth.providerId).single()

      const courseName = activity?.title || 'Kurs'
      const rawTime = block?.recurring_time || activity?.schedule?.slots?.[0]?.startTime || ''
      const time = rawTime.split(':').slice(0, 2).join(':')
      const dayNames: Record<string, string> = { '0': 'Sonntag', '1': 'Montag', '2': 'Dienstag', '3': 'Mittwoch', '4': 'Donnerstag', '5': 'Freitag', '6': 'Samstag' }
      const fmtDE = (d: string) => { const p = d.split('-'); return `${p[2]}.${p[1]}.${p[0]}` }
      const newDayName = dayNames[String(new Date(newDate + 'T12:00:00').getDay())] || ''
      const oldDateFmt = fmtDE(oldDate)
      const newDateFmt = fmtDE(newDate)
      const providerName = provider?.company_name || ''

      // Get unique parent emails
      const parentIds = [...new Set((enrollments || []).map((e: any) => e.parent_id))]
      for (const parentId of parentIds) {
        const { data: parent } = await db.from('parents').select('name, email').eq('id', parentId).single()
        if (!parent?.email) continue
        const childNames = (enrollments || []).filter((e: any) => e.parent_id === parentId).map((e: any) => e.child_name).join(', ')

        // Send email
        try {
          const { EmailService } = await import('../../lib/email')
          await EmailService.send({
            to: parent.email,
            subject: `Terminänderung: ${courseName} — neuer Termin am ${newDateFmt}`,
            html: `
              <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #3C2225;">
                <div style="background: linear-gradient(135deg, #B5533A, #8B3A28); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
                  <div style="font-size: 48px; margin-bottom: 8px;">📅</div>
                  <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">Termin verschoben</h1>
                </div>
                <div style="padding: 32px; background: #FFF9F5; border-radius: 0 0 16px 16px;">
                  <p style="font-size: 16px;">Hallo ${parent.name?.split(' ')[0] || 'Hallo'},</p>
                  <p>der folgende Termin von <strong>${childNames}</strong> wurde verschoben:</p>
                  <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid #f59e0b; margin: 20px 0;">
                    <div style="font-weight: 700; font-size: 16px;">${courseName}</div>
                    <div style="color: #dc2626; margin-top: 8px; text-decoration: line-through;">❌ ${oldDateFmt} um ${time} Uhr</div>
                    <div style="color: #059669; margin-top: 4px; font-weight: 600;">✅ Neuer Termin: ${newDayName}, ${newDateFmt} um ${time} Uhr</div>
                  </div>
                  <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; font-size: 14px; color: #92400e;">
                    <strong>Keine Sorge — dein Termin fällt nicht aus!</strong> Er wird lediglich ans Ende des Kurszeitraums angehängt, damit du keine Stunde verpasst. Du bekommst weiterhin alle gebuchten Termine.
                  </div>
                  <p>Falls der neue Termin trotzdem nicht passt, melde dich einfach bei uns — wir finden eine Lösung!</p>
                  <p style="margin-top: 24px; color: #64748b; font-size: 14px;">Liebe Grüße,<br><strong>${providerName}</strong></p>
                  <hr style="border: none; border-top: 1px solid #F2E6E2; margin: 24px 0;">
                  <p style="color: #94a3b8; font-size: 12px; text-align: center;">Powered by Urban Kids Club</p>
                </div>
              </div>
            `,
            text: `Terminänderung: ${courseName} für ${childNames}. Alter Termin: ${oldDateFmt} ${time} Uhr. Neuer Termin: ${newDateFmt} ${time} Uhr. Bei Fragen melde dich bei ${providerName}.`,
          })
        } catch (emailErr) {
          console.error(`[Reschedule] Email to ${parent.email} failed:`, emailErr)
        }

        // In-app notification
        await db.from('notifications').insert({
          recipient_type: 'parent', recipient_id: parentId,
          type: 'session_rescheduled', channel: 'in_app',
          title: 'Termin verschoben',
          body: `${courseName}: ${oldDateFmt} → ${newDateFmt}`,
          data: { sessionId: req.params.id, oldDate, newDate, blockId },
        }).catch(() => {})
      }
      console.log(`[Reschedule] Notified ${parentIds.length} parents about session ${req.params.id}: ${oldDate} → ${newDate}`)
    } catch (notifyErr) {
      console.error('[Reschedule] Notification failed (non-blocking):', notifyErr)
    }

    res.json({ data: updated })
  })

  // --- Block Cancel / Update Status (PATCH) ---

  router.patch('/api/course-blocks/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const db = getServiceClient()
    // Verify block belongs to this provider
    const { data: block, error: blkErr } = await db.from('course_blocks').select('*').eq('id', req.params.id).eq('provider_id', auth.providerId).single()
    if (blkErr || !block) return res.error(404, 'Block nicht gefunden')
    const newStatus = req.body.status
    if (!newStatus || !['active', 'cancelled', 'completed', 'upcoming'].includes(newStatus)) return res.error(400, 'Ungültiger Status')
    // Update block status in DB
    const { data: updated, error } = await db.from('course_blocks').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single()
    if (error) return res.error(500, error.message)
    // If cancelling, cancel all future scheduled sessions
    if (newStatus === 'cancelled') {
      const today = new Date().toISOString().slice(0, 10)
      await db.from('block_sessions').update({ status: 'cancelled_by_provider' }).eq('block_id', req.params.id).eq('status', 'scheduled').gte('date', today)
    }
    res.json({ data: updated })
  })

  // --- Block Enrollments ---

  router.post('/api/course-blocks/:id/enroll', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const db = getServiceClient()
    const { data: block } = await db.from('course_blocks').select('provider_id').eq('id', req.params.id).maybeSingle()
    if (!block || block.provider_id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    const result = await CourseBlockService.enrollChild({
      blockId: req.params.id,
      ...req.body,
    })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.get('/api/course-blocks/:id/enrollments', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const db = getServiceClient()
    const { data: block } = await db.from('course_blocks').select('provider_id').eq('id', req.params.id).maybeSingle()
    if (!block || block.provider_id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    const enrollments = await CourseBlockService.getEnrollmentsByBlock(req.params.id)
    res.json({ data: enrollments, count: enrollments.length })
  })

  router.get('/api/parents/:id/enrollments', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const enrollments = await CourseBlockService.getEnrollmentsByParent(req.params.id)
    res.json({ data: enrollments, count: enrollments.length })
  })

  router.get('/api/children/:id/enrollments', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const enrollments = await CourseBlockService.getEnrollmentsByChild(req.params.id)
    // Filter to only enrollments in this provider's activities
    const providerActivities = await ActivityService.listByProvider(auth.providerId)
    const providerActivityIds = new Set(providerActivities.map(a => a.id))
    const filtered = enrollments.filter((e: any) => providerActivityIds.has(e.activityId))
    res.json({ data: filtered, count: filtered.length })
  })

  // --- Session Attendance ---

  // Helper: verify session belongs to provider (session → block → activity → provider)
  async function verifySessionOwnership(sessionId: string, providerId: string): Promise<boolean> {
    const db = getServiceClient()
    const { data: session } = await db.from('block_sessions').select('block_id').eq('id', sessionId).maybeSingle()
    if (!session) return false
    const { data: block } = await db.from('course_blocks').select('activity_id').eq('id', session.block_id).maybeSingle()
    if (!block) return false
    const { data: activity } = await db.from('activities').select('provider_id').eq('id', block.activity_id).maybeSingle()
    return activity?.provider_id === providerId
  }

  router.get('/api/sessions/:id/attendance', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!await verifySessionOwnership(req.params.id, auth.providerId)) return res.error(403, 'Kein Zugriff')
    const attendance = await CourseBlockService.getAttendanceBySession(req.params.id)
    res.json({ data: attendance, count: attendance.length })
  })

  router.post('/api/sessions/:id/mark-attendance', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!await verifySessionOwnership(req.params.id, auth.providerId)) return res.error(403, 'Kein Zugriff')
    const result = await CourseBlockService.markAttendance(req.body.attendanceId, req.body.status)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  // --- Eltern-Absage (triggert Credit-Prüfung) ---

  router.post('/api/attendance/:id/cancel', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Verify attendance record belongs to provider
    const db = getServiceClient()
    const { data: att } = await db.from('session_attendance_records').select('session_id').eq('id', req.params.id).maybeSingle()
    if (!att || !await verifySessionOwnership(att.session_id, auth.providerId)) return res.error(403, 'Kein Zugriff')
    const result = await SessionCreditService.handleParentCancellation(req.params.id)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  // --- Session Credits ---

  router.get('/api/children/:id/credits', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const status = req.query.status as any
    const credits = await SessionCreditService.getCreditsByChild(req.params.id, status)
    // Filter to only credits from this provider's blocks
    const providerActivities = await ActivityService.listByProvider(auth.providerId)
    const providerActivityIds = new Set(providerActivities.map(a => a.id))
    const filtered = credits.filter((c: any) => providerActivityIds.has(c.activityId))
    res.json({ data: filtered, count: filtered.length })
  })

  router.get('/api/parents/:id/credits', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const status = req.query.status as any
    const credits = await SessionCreditService.getCreditsByParent(req.params.id, status)
    // Filter to only credits from this provider's activities
    const providerActivities = await ActivityService.listByProvider(auth.providerId)
    const providerActivityIds = new Set(providerActivities.map(a => a.id))
    const filtered = credits.filter((c: any) => providerActivityIds.has(c.activityId))
    res.json({ data: filtered, count: filtered.length })
  })

  router.get('/api/credits/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const credit = await SessionCreditService.getCredit(req.params.id, auth.providerId)
    if (!credit) return res.error(404, 'Guthaben nicht gefunden')
    res.json({ data: credit })
  })

  // Verfügbare Nachhol-Slots für ein Guthaben
  router.get('/api/credits/:id/available-slots', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const credit = await SessionCreditService.getCredit(req.params.id, auth.providerId)
    if (!credit) return res.error(404, 'Guthaben nicht gefunden')
    if (credit.status !== 'available') return res.error(400, 'Guthaben ist nicht verfügbar')
    const slots = await CourseBlockService.getAvailableMakeupSlots(
      credit.activityType,
      credit.validUntil,
      credit.blockId
    )
    res.json({ data: slots, count: slots.length })
  })

  // Manuell Credit ausstellen (Admin / Kulanz)
  router.post('/api/credits/manual', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { enrollmentId, reason } = req.body as any
    if (!enrollmentId) return res.error(400, 'enrollmentId erforderlich')
    if (!reason || typeof reason !== 'string') return res.error(400, 'Grund erforderlich')
    const result = await (SessionCreditService as any).issueManualCredit({ enrollmentId, reason: reason.slice(0, 500) })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  // --- Makeup Bookings ---

  router.post('/api/credits/:id/book-makeup', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const result = await MakeupBookingService.bookMakeup({
      creditId: req.params.id,
      targetSessionId: req.body.targetSessionId,
      bookedBy: req.body.bookedBy ?? 'parent',
      overrideCapacity: req.body.overrideCapacity,
    })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.delete('/api/makeup-bookings/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const cancelledBy = (req.query.cancelledBy as 'parent' | 'provider') ?? 'parent'
    const result = await MakeupBookingService.cancelMakeup(req.params.id, cancelledBy, auth.providerId)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.post('/api/makeup-bookings/:id/attendance', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const result = await (MakeupBookingService as any).markMakeupAttendance(req.params.id, req.body.status, auth.providerId)
    if (result && 'error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.get('/api/children/:id/makeup-bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const makeups = await MakeupBookingService.getMakeupsByChild(req.params.id)
    // Filter to only makeups from this provider's activities
    const providerActivities = await ActivityService.listByProvider(auth.providerId)
    const providerActivityIds = new Set(providerActivities.map(a => a.id))
    const filtered = makeups.filter((m: any) => providerActivityIds.has(m.activityId))
    res.json({ data: filtered, count: filtered.length })
  })

  router.get('/api/parents/:id/makeup-bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const makeups = await MakeupBookingService.getMakeupsByParent(req.params.id)
    // Filter to only makeups from this provider's activities
    const providerActivities = await ActivityService.listByProvider(auth.providerId)
    const providerActivityIds = new Set(providerActivities.map(a => a.id))
    const filtered = makeups.filter((m: any) => providerActivityIds.has(m.activityId))
    res.json({ data: filtered, count: filtered.length })
  })

  router.get('/api/makeup-bookings/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const makeup = await MakeupBookingService.getMakeup(req.params.id, auth.providerId)
    if (!makeup) return res.error(404, 'Nachholtermin nicht gefunden')
    res.json({ data: makeup })
  })

  // --- Background Jobs (Cronjobs) ---

  router.post('/api/admin/blocks/update-statuses', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const result = await CourseBlockService.updateBlockStatuses()
    res.json({ data: result })
  })

  router.post('/api/admin/credits/expire', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const expired = await SessionCreditService.expireCredits()
    res.json({ data: { expired } })
  })

  router.post('/api/admin/credits/send-reminders', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const sent = await SessionCreditService.sendExpiryReminders()
    res.json({ data: { sent } })
  })

  // --- Block Extension (Provider verlängert Block manuell) ---

  router.post('/api/course-blocks/:id/extend', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const additionalSessions = req.body.additionalSessions ?? 1
    const result = await CourseBlockService.extendBlock(req.params.id, additionalSessions, auth.providerId)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result, count: result.length })
  })
}
