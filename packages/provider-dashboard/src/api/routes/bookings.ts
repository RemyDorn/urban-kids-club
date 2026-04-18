// ============================================================
// Bookings & Attendance Routes
// ============================================================

import { Router } from '../router'
import { validate, CreateBookingSchema, CheckInSchema } from '../../lib/schemas'
import { requireAuth } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { BookingService, AttendanceService, ActivityService } from '../../services'

export function registerBookingRoutes(router: Router) {

  // ============================================================
  // BOOKINGS
  // ============================================================

  router.get('/api/providers/:providerId/bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const bookings = await BookingService.listByProvider(auth.providerId, {
      status: req.query.status as any,
      paymentStatus: req.query.paymentStatus as any,
    })
    res.json({ data: bookings, count: bookings.length })
  })

  router.get('/api/activities/:activityId/bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Verify activity belongs to this provider
    const act = await ActivityService.getById(req.params.activityId)
    if (!act || act.providerId !== auth.providerId) return res.error(404, 'Aktivität nicht gefunden')
    const bookings = await BookingService.listByActivity(req.params.activityId)
    res.json({ data: bookings, count: bookings.length })
  })

  router.get('/api/parents/:parentId/bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Verify parent belongs to this provider (has bookings with provider's activities)
    const allBookings = await BookingService.listByParent(req.params.parentId)
    const providerActivities = await ActivityService.listByProvider(auth.providerId)
    const providerActivityIds = new Set(providerActivities.map(a => a.id))
    const bookings = allBookings.filter(b => providerActivityIds.has(b.activityId))
    res.json({ data: bookings })
  })

  router.post('/api/bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateBookingSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await BookingService.create(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/bookings/:id/cancel', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const db = getServiceClient()

    // Fetch booking details before cancelling (for refund + email)
    const { data: bookingRow } = await db.from('provider_bookings')
      .select('*, parents!inner(name, email), activities!inner(title)')
      .eq('id', req.params.id).eq('provider_id', auth.providerId).maybeSingle()

    const booking = await (BookingService as any).cancel(req.params.id, auth.providerId)
    if (!booking) return res.error(400, 'Buchung konnte nicht storniert werden')

    // Deactivate block enrollments for this booking
    try {
      await db.from('block_enrollments')
        .update({ status: 'cancelled' })
        .eq('booking_id', req.params.id)
      console.log('[Cancel] Block enrollments deactivated for booking ' + req.params.id)
    } catch (enrollErr) {
      console.error('[Cancel] Failed to deactivate enrollments:', enrollErr)
    }

    // Stripe refund if paid via Stripe
    let refundInfo = ''
    if (bookingRow?.payment_method === 'stripe' && bookingRow?.payment_status === 'paid' && bookingRow?.stripe_session_id) {
      try {
        const { stripe } = await import('../../lib/stripe')
        if (stripe) {
          // Get payment intent from session
          const session = await stripe.checkout.sessions.retrieve(bookingRow.stripe_session_id)
          if (session.payment_intent) {
            await stripe.refunds.create({ payment_intent: session.payment_intent as string })
            await db.from('provider_bookings').update({ payment_status: 'refunded' }).eq('id', req.params.id)
            refundInfo = 'Der Betrag von ' + Number(bookingRow.amount_paid).toFixed(2).replace('.', ',') + ' € wird auf dein Zahlungsmittel zurückerstattet. Dies kann 5-10 Werktage dauern.'
            console.log('[Cancel] Stripe refund initiated for booking ' + req.params.id)
          }
        }
      } catch (refundErr) {
        console.error('[Cancel] Stripe refund failed:', refundErr)
        refundInfo = 'Die Rückerstattung konnte nicht automatisch verarbeitet werden. Bitte kontaktiere den Anbieter.'
      }
    }

    // Send cancellation email
    try {
      const { EmailService } = await import('../../lib/email')
      const parent = (bookingRow as any)?.parents
      const activity = (bookingRow as any)?.activities
      const ci = bookingRow?.child_info as any
      const { data: provider } = await db.from('providers').select('company_name').eq('id', auth.providerId).single()
      if (parent?.email) {
        await EmailService.sendCancellation(parent.email, {
          parentName: parent.name?.split(' ')[0] || '',
          childName: ci?.firstName ? (ci.firstName + ' ' + (ci.lastName || '')).trim() : '',
          courseName: activity?.title || 'Kurs',
          providerName: provider?.company_name || '',
          refundInfo: refundInfo || undefined,
        })
      }
    } catch (emailErr) {
      console.error('[Cancel] Email failed:', emailErr)
    }

    res.json({ data: booking })
  })

  router.post('/api/bookings/:id/complete', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const booking = await BookingService.complete(req.params.id, auth.providerId)
    if (!booking) return res.error(400, 'Buchung konnte nicht abgeschlossen werden')
    res.json({ data: booking })
  })

  router.post('/api/bookings/:id/pay', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { amount } = req.body as { amount: number }
    if (typeof amount !== 'number' || amount < 0 || amount > 100000) return res.error(400, 'Ungültiger Betrag')
    const booking = await (BookingService as any).markPaid(req.params.id, amount, auth.providerId)
    if (!booking) return res.error(404, 'Buchung nicht gefunden')
    res.json({ data: booking })
  })

  router.get('/api/providers/:providerId/bookings/stats', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const stats = await BookingService.getStats(auth.providerId)
    res.json({ data: stats })
  })

  // ============================================================
  // ATTENDANCE
  // ============================================================

  router.get('/api/activities/:activityId/attendance/:date', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const records = await AttendanceService.getByActivityAndDate(req.params.activityId, req.params.date)
    res.json({ data: records })
  })

  router.post('/api/attendance/checkin', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CheckInSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const { bookingId, activityId, date, checkedInBy } = parsed.data as any
    const result = await AttendanceService.checkIn(bookingId, activityId, date, checkedInBy)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/attendance/absent', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CheckInSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const { bookingId, activityId, date, note } = parsed.data as any
    const result = await AttendanceService.markAbsent(bookingId, activityId, date, note)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.get('/api/activities/:activityId/attendance/rate', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const rate = await AttendanceService.getAttendanceRate(req.params.activityId)
    res.json({ data: rate })
  })
}
