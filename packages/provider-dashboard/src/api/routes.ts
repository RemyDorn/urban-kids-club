// ============================================================
// API Routes – REST Endpoints für das Provider Dashboard
// ============================================================

import { Router } from './router'
import { validate, CreateProviderSchema, UpdateProviderSchema, CreateActivitySchema, CreateBookingSchema, CreateParentSchema, UpdateParentSchema, CreateTeamMemberSchema, CreateInvoiceSchema, CreatePaymentSchema, CreateSepaMandateSchema, CreateCouponSchema, CreateTrialSchema, AddToWaitlistSchema, CreateConsentSchema, SendMessageSchema, CreateReviewSchema, CreateLocationSchema, CreateSeasonSchema, CreateHolidaySchema, CreateContractSchema, CreateBuTVoucherSchema, CreateDocumentSchema, CheckInSchema, GenerateEInvoiceSchema, CreateExportSchema, CreateWidgetSchema } from '../lib/schemas'
import { authenticate, authenticateProvider, authenticateAdmin } from '../lib/auth'
import { requireAuth } from '../lib/auth-middleware'
import { supabase, getServiceClient } from '../lib/supabase'
import {
  ProviderService,
  ActivityService,
  BookingService,
  AttendanceService,
  LocationService,
  TeamService,
  ParentService,
  ReviewService,
  MessageService,
  WaitlistService,
  CouponService,
  CalendarService,
  TrialService,
  NotificationService,
  PaymentService,
  SepaMandateService,
  InvoiceService,
  DocumentService,
  ConsentService,
  SeasonService,
  HolidayService,
  AuditService,
  WidgetService,
  CrmService,
  ExportService,
  ReportingService,
  EInvoiceService,
  BuTVoucherService,
  ContractService,
  CourseBlockService,
  SessionCreditService,
  MakeupBookingService,
} from '../services'
import { TrialConversionWorkflow, WaitlistConversionWorkflow, BackgroundJobs } from '../services/workflows'

// --- Input-Validierung: parseInt mit NaN-Schutz ---
function safeParseInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

// Helper: escape HTML to prevent XSS
function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
// Helper: render a branded HTML page (for confirm/decline/error pages)
function successPageWithRedirect(title: string, message: string, redirectUrl?: string | null) {
  const redirect = redirectUrl ? `<meta http-equiv="refresh" content="5;url=${escHtml(redirectUrl)}">` : ''
  const redirectNote = redirectUrl ? '<p style="color:#94a3b8;font-size:12px;margin-top:16px;">Du wirst in 5 Sekunden weitergeleitet...</p>' : ''
  return htmlPage('✓', title, message + redirectNote, '#059669', redirect)
}

function htmlPage(icon: string, title: string, message: string, color = '#059669', extraHead = '') {
  const safeTitle = escHtml(title)
  // message is trusted HTML from our own code (contains <strong>, <a>, <br> etc.)
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${extraHead}
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#faf9f8}
.card{text-align:center;background:#fff;padding:48px 40px;border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:480px;width:90%}
.icon{width:72px;height:72px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 20px;animation:pop .4s ease}
@keyframes pop{0%{transform:scale(0)}50%{transform:scale(1.2)}100%{transform:scale(1)}}
h2{color:#1f2937;font-size:22px;margin-bottom:12px}
.msg{color:#64748b;font-size:14px;line-height:1.7;margin-bottom:20px}
.msg strong{color:#1f2937}
.msg a{display:inline-block;margin-top:12px}
.footer{font-size:11px;color:#94a3b8;margin-top:24px}
</style></head><body><div class="card"><div class="icon">${icon}</div><h2>${safeTitle}</h2><div class="msg">${message}</div><div class="footer">Powered by Urban Kids Club</div></div></body></html>`
}

export function registerRoutes(router: Router) {

  // ============================================================
  // HEALTH CHECK (public – no auth)
  // ============================================================

  router.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      mode: process.env.USE_SUPABASE === 'true' ? 'supabase' : 'memory',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    })
  })

  // Public config endpoint — frontend uses this to init Supabase client
  router.get('/api/config', (_req, res) => {
    res.json({
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
      environment: process.env.NODE_ENV || 'development',
    })
  })

  // ============================================================
  // PROVIDERS
  // ============================================================

  router.get('/api/providers', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Return only the authenticated provider's data — never list all providers
    const provider = await ProviderService.getById(auth.providerId)
    const providers = provider ? [provider] : []
    res.json({ data: providers, count: providers.length })
  })

  router.get('/api/providers/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (req.params.id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    const provider = await ProviderService.getById(auth.providerId)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    res.json({ data: provider })
  })

  router.get('/api/providers/slug/:slug', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const provider = await ProviderService.getBySlug(req.params.slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    if (provider.id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    res.json({ data: provider })
  })

  router.post('/api/providers', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateProviderSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const provider = await ProviderService.create(parsed.data as any)
    res.status(201).json({ data: provider })
  })

  router.put('/api/providers/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (req.params.id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    const parsed = validate(UpdateProviderSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const provider = await ProviderService.update(auth.providerId, parsed.data as any)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    res.json({ data: provider })
  })

  router.post('/api/providers/:id/activate', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (req.params.id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    const provider = await ProviderService.activate(auth.providerId)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    res.json({ data: provider })
  })

  router.post('/api/providers/:id/change-plan', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (req.params.id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    const { plan } = req.body as { plan: string }
    const provider = await ProviderService.changePlan(auth.providerId, plan as any)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    res.json({ data: provider })
  })

  // ============================================================
  // LOCATIONS
  // ============================================================

  router.get('/api/providers/:providerId/locations', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const locations = await LocationService.listByProvider(auth.providerId)
    res.json({ data: locations })
  })

  router.post('/api/providers/:providerId/locations', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateLocationSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const location = await LocationService.create({ ...parsed.data as any, providerId: auth.providerId })
    res.status(201).json({ data: location })
  })

  router.put('/api/locations/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const location = await LocationService.update(req.params.id, req.body as any, auth.providerId)
    if (!location) return res.error(404, 'Standort nicht gefunden')
    res.json({ data: location })
  })

  // ============================================================
  // TEAM
  // ============================================================

  router.get('/api/providers/:providerId/team', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const members = await TeamService.listByProvider(auth.providerId, {
      role: req.query.role as any,
      active: req.query.active ? req.query.active === 'true' : undefined,
    })
    res.json({ data: members })
  })

  router.post('/api/providers/:providerId/team', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateTeamMemberSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await TeamService.create({ ...parsed.data as any, providerId: auth.providerId })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.put('/api/team/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Verify team member belongs to this provider
    const existing = await TeamService.getById(req.params.id)
    if (!existing || existing.providerId !== auth.providerId) return res.error(404, 'Teammitglied nicht gefunden')
    const member = await TeamService.update(req.params.id, req.body as any)
    if (!member) return res.error(404, 'Teammitglied nicht gefunden')
    res.json({ data: member })
  })

  router.get('/api/team/:id/workload', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const workload = await TeamService.getWorkload(req.params.id)
    res.json({ data: workload })
  })

  // ============================================================
  // ACTIVITIES
  // ============================================================

  router.get('/api/providers/:providerId/activities', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const activities = await ActivityService.listByProvider(auth.providerId)
    res.json({ data: activities, count: activities.length })
  })

  router.get('/api/activities/search', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const activities = await ActivityService.search({
      category: req.query.category,
      ageMin: req.query.ageMin ? safeParseInt(req.query.ageMin, 0) : undefined,
      ageMax: req.query.ageMax ? safeParseInt(req.query.ageMax, 18) : undefined,
      providerId: auth.providerId,
      status: req.query.status as any,
      query: req.query.q,
    })
    res.json({ data: activities, count: activities.length })
  })

  router.get('/api/activities/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const activity = await ActivityService.getById(req.params.id, auth.providerId)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')
    const spots = await ActivityService.getAvailableSpots(req.params.id)
    res.json({ data: { ...activity, availableSpots: spots } })
  })

  router.post('/api/activities', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateActivitySchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const activity = await ActivityService.create({ ...parsed.data as any, providerId: auth.providerId })
    res.status(201).json({ data: activity })
  })

  router.put('/api/activities/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const activity = await ActivityService.update(req.params.id, req.body as any, auth.providerId)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')
    res.json({ data: activity })
  })

  router.post('/api/activities/:id/publish', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const result = await ActivityService.publish(req.params.id, auth.providerId)
    if (!result) return res.error(400, 'Aktivität konnte nicht veröffentlicht werden')
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.post('/api/activities/:id/duplicate', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const activity = await ActivityService.duplicate(req.params.id, auth.providerId)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')
    res.status(201).json({ data: activity })
  })

  router.post('/api/activities/:id/archive', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const activity = await ActivityService.archive(req.params.id, auth.providerId)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')
    res.json({ data: activity })
  })

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
    const bookings = await BookingService.listByParent(req.params.parentId)
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

    const booking = await BookingService.cancel(req.params.id, auth.providerId)
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
        const { stripe } = await import('../lib/stripe')
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
      const { EmailService } = await import('../lib/email')
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
    const booking = await BookingService.markPaid(req.params.id, amount, auth.providerId)
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

  // ============================================================
  // PARENTS
  // ============================================================

  router.get('/api/parents', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parents = await ParentService.list({ query: req.query.q, providerId: auth.providerId })
    res.json({ data: parents, count: parents.length })
  })

  router.get('/api/parents/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parent = await ParentService.getById(req.params.id, auth.providerId)
    if (!parent) return res.error(404, 'Elternteil nicht gefunden')
    res.json({ data: parent })
  })

  router.post('/api/parents', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateParentSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await ParentService.create(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.put('/api/parents/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(UpdateParentSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    // Verify parent belongs to this provider before updating
    const existingParent = await ParentService.getById(req.params.id, auth.providerId)
    if (!existingParent) return res.error(404, 'Elternteil nicht gefunden')
    const parent = await ParentService.update(req.params.id, parsed.data as any)
    if (!parent) return res.error(404, 'Elternteil nicht gefunden')
    res.json({ data: parent })
  })

  router.post('/api/parents/:id/children', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Verify parent belongs to this provider before modifying
    const existingParentForChild = await ParentService.getById(req.params.id, auth.providerId)
    if (!existingParentForChild) return res.error(404, 'Elternteil nicht gefunden')
    const parent = await ParentService.addChild(req.params.id, req.body as any)
    if (!parent) return res.error(404, 'Elternteil nicht gefunden')
    res.json({ data: parent })
  })

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
    const messages = await MessageService.broadcast(auth.providerId, activityId, subject, body)
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
  // WAITLIST
  // ============================================================

  router.get('/api/activities/:activityId/waitlist', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const entries = await WaitlistService.listByActivity(req.params.activityId)
    res.json({ data: entries, count: entries.length })
  })

  router.post('/api/waitlist', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(AddToWaitlistSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await WaitlistService.add(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  // Public: Confirm or decline waitlist offer (linked from email)
  router.get('/api/waitlist/:id/confirm', async (_req, res) => {
    const db = getServiceClient()
    const token = _req.query.token
    const { data: entry } = await db.from('waitlist_entries')
      .select('*, parents!inner(name, email), activities!inner(title, provider_id, capacity, pricing, payment_online, payment_onsite)')
      .eq('id', _req.params.id).eq('status', 'offered').maybeSingle()

    if (!entry) {
      return res.html(htmlPage('⚠️', 'Nicht mehr gültig', 'Dieses Angebot wurde bereits bestätigt, abgelehnt oder ist abgelaufen.', '#f59e0b'))
    }

    // Verify token (mandatory)
    if (!token || !entry.confirm_token || token !== entry.confirm_token) {
      return res.html(htmlPage('🔒', 'Ungültiger Link', 'Dieser Bestätigungslink ist ungültig oder abgelaufen.', '#ef4444'))
    }

    // Check if expired
    if (entry.expires_at && new Date(entry.expires_at) < new Date()) {
      await db.from('waitlist_entries').update({ status: 'expired' }).eq('id', _req.params.id)
      return res.html(htmlPage('⏰', 'Leider abgelaufen', 'Das Angebot ist abgelaufen. Bitte kontaktiere den Anbieter für einen neuen Termin.', '#ef4444'))
    }

    const activity = (entry as any).activities
    const parent = (entry as any).parents
    const courseName = escHtml(activity?.title || 'den Kurs')
    // If online payment is available, always redirect to Stripe (customer pays first)
    const requiresOnlinePayment = !!activity?.payment_online

    // If online-only course → show payment page with Stripe checkout
    if (requiresOnlinePayment) {
      const pricing = activity.pricing as any[] | undefined
      const price = pricing?.[0]?.amount ?? pricing?.[0]?.price ?? 0
      const { data: provider } = await db.from('providers').select('company_name, slug').eq('id', activity.provider_id).single()

      // Create Stripe checkout session
      let checkoutUrl = ''
      try {
        const { stripe } = await import('../lib/stripe')
        if (stripe) {
          const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
              price_data: {
                currency: 'eur',
                product_data: { name: activity.title || 'Kurs' },
                unit_amount: Math.round(price * 100), // Stripe expects cents
              },
              quantity: 1,
            }],
            mode: 'payment',
            success_url: origin + '/api/waitlist/' + _req.params.id + '/payment-success?session_id={CHECKOUT_SESSION_ID}&token=' + token,
            cancel_url: origin + '/api/waitlist/' + _req.params.id + '/confirm?token=' + token,
            customer_email: parent.email,
            metadata: {
              waitlistId: _req.params.id,
              activityId: entry.activity_id,
              providerId: activity.provider_id,
              parentId: entry.parent_id,
            },
          })
          checkoutUrl = session.url || ''
        }
      } catch (stripeErr) {
        console.error('[Waitlist] Stripe checkout creation failed:', stripeErr)
      }

      if (checkoutUrl) {
        // Redirect directly to Stripe checkout
        return res.html('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=' + checkoutUrl + '"></head><body><p>Weiterleitung zur Zahlung...</p></body></html>')
      }

      // Stripe not available — show info page
      return res.html(htmlPage(
        '💳',
        'Fast geschafft!',
        '<strong>' + courseName + '</strong> kostet <strong>' + Number(price).toFixed(2).replace('.', ',') + ' €</strong> und muss vor der Teilnahme bezahlt werden.<br><br>' +
        'Bitte kontaktiere <strong>' + escHtml(provider?.company_name || '') + '</strong> direkt für die Zahlungsabwicklung.',
        '#B5533A'
      ))
    }

    // Onsite payment → create booking directly
    try {
      const { CheckoutService } = await import('../services/supabase/checkout.service')
      await CheckoutService.createBooking({
        providerId: activity.provider_id,
        activityId: entry.activity_id,
        skipBlockCheck: true,
        childFirstName: entry.child_info?.firstName || '',
        childLastName: entry.child_info?.lastName || '',
        childBirthYear: entry.child_info?.birthYear || 2020,
        parentFirstName: parent.name.split(' ')[0],
        parentLastName: parent.name.split(' ').slice(1).join(' '),
        parentEmail: parent.email,
        parentPhone: '',
        paymentMethod: 'onsite',
        amount: 0,
        currency: 'EUR',
      })
    } catch (bookErr: any) {
      console.error('[Waitlist] Booking creation failed:', bookErr)
      return res.html(htmlPage('❌', 'Buchung fehlgeschlagen', escHtml(bookErr.message || 'Bitte kontaktiere den Anbieter.'), '#ef4444'))
    }

    // Booking succeeded — now mark waitlist entry as accepted
    await db.from('waitlist_entries').update({ status: 'accepted' }).eq('id', _req.params.id)

    // Check for redirect URL
    const { data: provRedir } = await db.from('providers').select('redirect_after_booking, booking_redirect_url').eq('id', activity.provider_id).single()
    const redirectUrl = provRedir?.redirect_after_booking || provRedir?.booking_redirect_url || null

    res.html(successPageWithRedirect('Buchung bestätigt!', 'Dein Platz für <strong>' + courseName + '</strong> ist reserviert. Du erhältst eine Bestätigung per E-Mail.', redirectUrl))
  })

  // Payment success callback after Stripe checkout for waitlist confirmations
  router.get('/api/waitlist/:id/payment-success', async (_req, res) => {
    const db = getServiceClient()
    const token = _req.query.token
    const sessionId = _req.query.session_id

    const { data: entry } = await db.from('waitlist_entries')
      .select('*, parents!inner(name, email), activities!inner(title, provider_id, pricing)')
      .eq('id', _req.params.id).maybeSingle()

    if (!entry) {
      return res.html(htmlPage('⚠️', 'Nicht gefunden', 'Wartelisten-Eintrag nicht gefunden.', '#f59e0b'))
    }
    if (!token || entry.confirm_token !== token) {
      return res.html(htmlPage('🔒', 'Ungültiger Link', 'Dieser Link ist ungültig.', '#ef4444'))
    }

    const activity = (entry as any).activities
    const parent = (entry as any).parents
    const pricing = activity.pricing as any[] | undefined
    const price = pricing?.[0]?.amount ?? 0

    // Create the booking with payment info
    try {
      const { CheckoutService } = await import('../services/supabase/checkout.service')
      await CheckoutService.createBooking({
        providerId: activity.provider_id,
        activityId: entry.activity_id,
        skipBlockCheck: true,
        childFirstName: entry.child_info?.firstName || '',
        childLastName: entry.child_info?.lastName || '',
        childBirthYear: entry.child_info?.birthYear || 2020,
        parentFirstName: parent.name.split(' ')[0],
        parentLastName: parent.name.split(' ').slice(1).join(' '),
        parentEmail: parent.email,
        parentPhone: '',
        paymentMethod: 'stripe',
        amount: Math.round(price * 100), // cents for checkout service
        currency: 'EUR',
        stripeSessionId: sessionId as string || undefined,
      })
    } catch (bookErr: any) {
      console.error('[Waitlist] Payment-success booking failed:', bookErr)
      return res.html(htmlPage('❌', 'Buchung fehlgeschlagen', escHtml(bookErr.message || 'Bitte kontaktiere den Anbieter.'), '#ef4444'))
    }

    await db.from('waitlist_entries').update({ status: 'accepted' }).eq('id', _req.params.id)

    // Check for redirect URL
    const { data: provRedir } = await db.from('providers').select('redirect_after_booking, booking_redirect_url').eq('id', activity.provider_id).single()
    const redirectUrl = provRedir?.redirect_after_booking || provRedir?.booking_redirect_url || null

    const courseName = escHtml(activity?.title || 'den Kurs')
    res.html(successPageWithRedirect('Zahlung erfolgreich!', 'Dein Platz für <strong>' + courseName + '</strong> ist bestätigt und bezahlt. Du erhältst eine Bestätigung per E-Mail. 🎉', redirectUrl))
  })

  router.get('/api/waitlist/:id/decline-offer', async (_req, res) => {
    const db = getServiceClient()
    const token = _req.query.token
    const { data: entry } = await db.from('waitlist_entries')
      .select('activity_id, position, confirm_token').eq('id', _req.params.id).eq('status', 'offered').maybeSingle()

    if (!entry) {
      return res.html(htmlPage('⚠️', 'Nicht mehr gültig', 'Dieses Angebot ist nicht mehr verfügbar.', '#f59e0b'))
    }

    // Verify token (mandatory)
    if (!token || !entry.confirm_token || token !== entry.confirm_token) {
      return res.html(htmlPage('🔒', 'Ungültiger Link', 'Dieser Link ist ungültig oder abgelaufen.', '#ef4444'))
    }

    await db.from('waitlist_entries').update({ status: 'declined' }).eq('id', _req.params.id)

    // Auto-offer to next person on waitlist
    const { data: nextEntry } = await db.from('waitlist_entries')
      .select('id').eq('activity_id', entry.activity_id).eq('status', 'waiting')
      .order('position', { ascending: true }).limit(1).maybeSingle()

    if (nextEntry) {
      console.log('[Waitlist] Auto-offering to next entry:', nextEntry.id)
    }

    res.html(htmlPage('👋', 'Schade!', 'Du hast den Platz abgelehnt. Wir hoffen, dich beim nächsten Mal dabei zu haben!', '#6b7280'))
  })

  // Offer waitlist spot to parent (changes status, sends email)
  router.post('/api/waitlist/:id/offer', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const db = getServiceClient()

    // Get waitlist entry with parent + activity info
    const { data: entry } = await db.from('waitlist_entries')
      .select('*, parents!inner(name, email), activities!inner(title, pricing, payment_online, payment_onsite)')
      .eq('id', req.params.id).in('status', ['waiting', 'offered', 'expired']).single()
    if (!entry) return res.error(404, 'Wartelisten-Eintrag nicht gefunden')

    // Generate secure token for confirm/decline links
    const { randomBytes } = await import('node:crypto')
    const confirmToken = randomBytes(24).toString('hex')

    // Update status to "offered" with token
    await db.from('waitlist_entries')
      .update({ status: 'offered', notified_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        confirm_token: confirmToken })
      .eq('id', req.params.id)

    // Send notification email
    try {
      const { EmailService } = await import('../lib/email')
      const parent = (entry as any).parents
      const activity = (entry as any).activities
      const { data: provider } = await db.from('providers').select('company_name, slug').eq('id', auth.providerId).single()

      const childName = entry.child_info?.firstName ? (entry.child_info.firstName + ' ' + (entry.child_info.lastName || '')) : 'Ihr Kind'
      const hasOnlinePayment = activity?.payment_online

      // Build confirm/decline links with token
      const origin = process.env.APP_PUBLIC_URL || (req.raw.headers.host ? 'https://' + req.raw.headers.host : 'https://dev.urbankids.club')
      const confirmLink = origin + '/api/waitlist/' + req.params.id + '/confirm?token=' + confirmToken
      const declineLink = origin + '/api/waitlist/' + req.params.id + '/decline-offer?token=' + confirmToken

      await EmailService.sendWaitlistOffer(parent.email, {
        parentName: parent.name.split(' ')[0],
        childName,
        courseName: activity?.title || 'Kurs',
        providerName: provider?.company_name || '',
        confirmLink,
        declineLink,
      })
      console.log('[Waitlist] Offer email sent to ' + parent.email)
    } catch (emailErr) {
      console.error('[Waitlist] Email failed:', emailErr)
    }

    res.json({ data: { id: req.params.id, status: 'offered' } })
  })

  router.post('/api/waitlist/:id/accept', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { pricingOptionId } = req.body as { pricingOptionId: string }
    const result = await WaitlistConversionWorkflow.acceptAndBook(req.params.id, pricingOptionId)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.post('/api/waitlist/:id/decline', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const entry = await WaitlistService.decline(req.params.id)
    if (!entry) return res.error(400, 'Konnte nicht abgelehnt werden')
    res.json({ data: entry })
  })

  // ============================================================
  // COUPONS
  // ============================================================

  router.get('/api/providers/:providerId/coupons', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const coupons = await CouponService.listByProvider(auth.providerId, {
      active: req.query.active ? req.query.active === 'true' : undefined,
    })
    res.json({ data: coupons })
  })

  router.post('/api/coupons', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateCouponSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await CouponService.create({ ...parsed.data as any, providerId: auth.providerId })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/coupons/validate', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { code, activityId, amount } = req.body as any
    const result = await CouponService.validate(code, activityId, amount)
    res.json({ data: result })
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
  // TRIALS
  // ============================================================

  router.get('/api/providers/:providerId/trials', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const trials = await TrialService.listByProvider(auth.providerId, {
      status: req.query.status as any,
    })
    res.json({ data: trials })
  })

  router.post('/api/trials', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateTrialSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await TrialService.create({ ...parsed.data as any, providerId: auth.providerId })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/trials/:id/complete', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { feedback } = req.body as { feedback?: string }
    const trial = await TrialService.complete(req.params.id, feedback)
    if (!trial) return res.error(400, 'Probestunde konnte nicht abgeschlossen werden')
    res.json({ data: trial })
  })

  router.post('/api/trials/:id/convert', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { pricingOptionId } = req.body as { pricingOptionId: string }
    const result = await TrialConversionWorkflow.convert(req.params.id, pricingOptionId)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.get('/api/providers/:providerId/trials/stats', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const stats = await TrialService.getConversionStats(auth.providerId)
    res.json({ data: stats })
  })

  // ============================================================
  // INVOICES
  // ============================================================

  router.get('/api/providers/:providerId/invoices', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const invoices = await InvoiceService.listByProvider(auth.providerId, {
      status: req.query.status as any,
    })
    res.json({ data: invoices })
  })

  router.post('/api/invoices', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateInvoiceSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await InvoiceService.create({ ...parsed.data as any, providerId: auth.providerId })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/invoices/from-booking/:bookingId', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const vatRate = req.body?.vatRate !== undefined ? Number(req.body.vatRate) : undefined
    const result = await InvoiceService.createFromBooking(req.params.bookingId, auth.providerId, vatRate)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/invoices/:id/send', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const invoice = await InvoiceService.send(req.params.id, auth.providerId)
    if (!invoice) return res.error(400, 'Rechnung konnte nicht versendet werden')
    res.json({ data: invoice })
  })

  router.post('/api/invoices/:id/pay', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const invoice = await InvoiceService.markPaid(req.params.id, auth.providerId)
    if (!invoice) return res.error(404, 'Rechnung nicht gefunden')
    res.json({ data: invoice })
  })

  router.post('/api/invoices/:id/cancel', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const invoice = await InvoiceService.cancel(req.params.id, auth.providerId)
    if (!invoice) return res.error(400, 'Rechnung konnte nicht storniert werden (bereits bezahlt oder nicht gefunden)')
    res.json({ data: invoice })
  })

  router.get('/api/providers/:providerId/invoices/outstanding', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const outstanding = await InvoiceService.getOutstandingTotal(auth.providerId)
    res.json({ data: outstanding })
  })

  // Invoice PDF view (renders HTML template for printing)
  router.get('/api/invoices/:id/view', async (req, res) => {
    const db = getServiceClient()

    // Public endpoint — invoice ID is the access token (UUID is unguessable)
    const { data: invoice } = await db.from('invoices').select('*').eq('id', req.params.id).maybeSingle()
    if (!invoice) return res.error(404, 'Rechnung nicht gefunden')

    const { data: provider } = await db.from('providers').select('*').eq('id', invoice.provider_id).single()
    const { data: parent } = await db.from('parents').select('*').eq('id', invoice.parent_id).single()

    const lineItems = (invoice.line_items || []) as Array<{ description: string; quantity: number; unitPrice: number; vatRate: number; total: number }>
    const isKleinunternehmer = provider?.kleinunternehmer || false
    const vatPercent = isKleinunternehmer ? 0 : Math.round((lineItems[0]?.vatRate || 0.19) * 100)

    const fmt = (n: number) => Number(n).toFixed(2).replace('.', ',')
    const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('de-DE') : ''
    const statusLabels: Record<string, string> = { draft: 'Entwurf', sent: 'Versendet', paid: 'Bezahlt', overdue: 'Überfällig', cancelled: 'Storniert' }

    const lineItemsHtml = lineItems.map((item, i) =>
      `<tr><td>${i + 1}</td><td>${item.description}</td><td>${fmt(item.unitPrice)} &euro;</td><td>${isKleinunternehmer ? 'entf.' : (Math.round(item.vatRate * 100) + '%')}</td><td>${fmt(item.total)} &euro;</td></tr>`
    ).join('')

    // Read template and replace placeholders
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    let template: string
    try {
      template = await fs.readFile(path.join(currentDir, '../frontend/invoice-template.html'), 'utf-8')
    } catch {
      // Fallback: try relative to cwd
      template = await fs.readFile(path.resolve('src/frontend/invoice-template.html'), 'utf-8')
    }

    const replacements: Record<string, string> = {
      '{{invoiceNumber}}': invoice.number,
      '{{invoiceDate}}': fmtDate(invoice.issued_at),
      '{{dueDate}}': fmtDate(invoice.due_date),
      '{{status}}': statusLabels[invoice.status] || invoice.status,
      '{{providerName}}': provider?.company_name || '',
      '{{providerLegalForm}}': provider?.legal_form || '',
      '{{providerStreet}}': provider?.address_street || '',
      '{{providerZip}}': provider?.address_zip || '',
      '{{providerCity}}': provider?.address_city || '',
      '{{providerEmail}}': provider?.email || '',
      '{{providerPhone}}': provider?.phone || '',
      '{{providerTaxId}}': provider?.tax_id || '',
      '{{providerVatId}}': provider?.vat_id || '',
      '{{logoUrl}}': provider?.logo_url || '',
      '{{parentName}}': parent?.name || '',
      '{{parentEmail}}': parent?.email || '',
      '{{lineItemsHtml}}': lineItemsHtml,
      '{{subtotal}}': fmt(invoice.subtotal),
      '{{tax}}': fmt(invoice.tax),
      '{{total}}': fmt(invoice.total),
      '{{vatPercent}}': String(vatPercent),
      '{{bankHolder}}': provider?.bank_holder || provider?.company_name || '',
      '{{bankIban}}': provider?.bank_iban || '',
      '{{bankBic}}': provider?.bank_bic || '',
    }

    // Handle conditional blocks
    for (const [key, val] of Object.entries(replacements)) {
      template = template.replaceAll(key, val)
    }

    // Handle {{#if ...}} blocks (with optional {{else}}) — non-greedy, one block at a time
    const ifBlock = (flag: boolean, name: string) => {
      // Process each occurrence individually to avoid greedy cross-block matching
      let result = template
      const openTag = `{{#if ${name}}}`
      const closeTag = `{{/if}}`
      const elseTag = `{{else}}`
      let idx = result.indexOf(openTag)
      while (idx !== -1) {
        const afterOpen = idx + openTag.length
        // Find the NEXT {{/if}} (not a distant one)
        const closeIdx = result.indexOf(closeTag, afterOpen)
        if (closeIdx === -1) break
        const inner = result.substring(afterOpen, closeIdx)
        const elseIdx = inner.indexOf(elseTag)
        let replacement = ''
        if (elseIdx !== -1) {
          replacement = flag ? inner.substring(0, elseIdx) : inner.substring(elseIdx + elseTag.length)
        } else {
          replacement = flag ? inner : ''
        }
        result = result.substring(0, idx) + replacement + result.substring(closeIdx + closeTag.length)
        idx = result.indexOf(openTag)
      }
      template = result
    }
    ifBlock(!!provider?.logo_url, 'logoUrl')
    ifBlock(isKleinunternehmer, 'isKleinunternehmer')
    ifBlock(!!provider?.tax_id, 'providerTaxId')
    ifBlock(!!provider?.vat_id, 'providerVatId')
    ifBlock(!!provider?.bank_holder, 'bankHolder')
    ifBlock(!!provider?.bank_iban, 'bankIban')
    ifBlock(!!provider?.bank_bic, 'bankBic')

    res.html(template)
  })

  router.get('/api/providers/:providerId/invoices/vat-summary/:year', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const year = safeParseInt(req.params.year, new Date().getFullYear())
    const summary = await InvoiceService.getVatSummary(auth.providerId, year)
    res.json({ data: summary })
  })

  // ============================================================
  // E-INVOICES
  // ============================================================

  router.post('/api/einvoices/generate', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(GenerateEInvoiceSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await EInvoiceService.generate(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.get('/api/invoices/:invoiceId/einvoice', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const eInvoice = await EInvoiceService.getByInvoice(req.params.invoiceId)
    if (!eInvoice) return res.error(404, 'Keine E-Rechnung vorhanden')
    res.json({ data: eInvoice })
  })

  // ============================================================
  // PAYMENTS & SEPA
  // ============================================================

  router.get('/api/providers/:providerId/payments', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const payments = await PaymentService.listByProvider(auth.providerId, {
      method: req.query.method as any,
      status: req.query.status,
    })
    res.json({ data: payments })
  })

  router.post('/api/payments', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreatePaymentSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await PaymentService.create({ ...parsed.data as any, providerId: auth.providerId })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/payments/:id/complete', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const payment = await PaymentService.markCompleted(req.params.id, auth.providerId)
    if (!payment) return res.error(400, 'Zahlung konnte nicht abgeschlossen werden')
    res.json({ data: payment })
  })

  router.get('/api/providers/:providerId/payments/summary', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const summary = await PaymentService.getRevenueSummary(auth.providerId)
    res.json({ data: summary })
  })

  router.post('/api/providers/:providerId/sepa/collect', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const payments = await PaymentService.runSepaCollection(auth.providerId)
    res.json({ data: payments, count: payments.length })
  })

  router.get('/api/providers/:providerId/sepa/mandates', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const mandates = await SepaMandateService.listByProvider(auth.providerId)
    res.json({ data: mandates })
  })

  router.post('/api/sepa/mandates', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateSepaMandateSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const mandate = await SepaMandateService.create({ ...parsed.data as any, providerId: auth.providerId })
    res.status(201).json({ data: mandate })
  })

  // ============================================================
  // DOCUMENTS & COMPLIANCE
  // ============================================================

  router.get('/api/providers/:providerId/documents', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const docs = await DocumentService.listByProvider(auth.providerId, {
      type: req.query.type as any,
      status: req.query.status as any,
    })
    res.json({ data: docs })
  })

  router.post('/api/documents', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateDocumentSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const doc = await DocumentService.create({ ...parsed.data as any, providerId: auth.providerId })
    res.status(201).json({ data: doc })
  })

  router.get('/api/providers/:providerId/compliance', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const status = await DocumentService.getComplianceStatus(auth.providerId)
    res.json({ data: status })
  })

  router.post('/api/consent', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateConsentSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const consent = await ConsentService.giveConsent(parsed.data as any)
    res.status(201).json({ data: consent })
  })

  router.get('/api/parents/:parentId/data-export', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const data = await ConsentService.exportParentData(req.params.parentId)
    res.json({ data })
  })

  // ============================================================
  // SEASONS & HOLIDAYS
  // ============================================================

  router.get('/api/providers/:providerId/seasons', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const seasons = await SeasonService.listByProvider(auth.providerId)
    const current = await SeasonService.getCurrentSeason(auth.providerId)
    res.json({ data: seasons, currentSeason: current })
  })

  router.post('/api/seasons', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateSeasonSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const season = await SeasonService.create({ ...parsed.data as any, providerId: auth.providerId })
    res.status(201).json({ data: season })
  })

  router.get('/api/providers/:providerId/holidays', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const holidays = await HolidayService.listByProvider(auth.providerId)
    res.json({ data: holidays })
  })

  router.post('/api/holidays', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateHolidaySchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const holiday = await HolidayService.create({ ...parsed.data as any, providerId: auth.providerId })
    res.status(201).json({ data: holiday })
  })

  router.post('/api/providers/:providerId/holidays/import', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { region } = req.body as { region?: string }
    const holidays = await HolidayService.importGermanHolidays(auth.providerId, region)
    res.status(201).json({ data: holidays, count: holidays.length })
  })

  router.get('/api/holidays/bundeslaender', async (_req, res) => {
    const laender = await HolidayService.getAvailableBundeslaender()
    res.json({ data: laender })
  })

  // ============================================================
  // CONTRACTS (Scheinselbständigkeit)
  // ============================================================

  router.get('/api/providers/:providerId/contracts', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const contracts = await ContractService.listByProvider(auth.providerId, {
      type: req.query.type as any,
      status: req.query.status as any,
    })
    res.json({ data: contracts })
  })

  router.post('/api/contracts', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateContractSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const contract = await ContractService.create({ ...parsed.data as any, providerId: auth.providerId })
    res.status(201).json({ data: contract })
  })

  router.get('/api/contracts/:id/risk', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const risk = await ContractService.assessFreelanceRisk(req.params.id)
    res.json({ data: risk })
  })

  router.get('/api/providers/:providerId/contracts/risk-overview', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const overview = await ContractService.getProviderRiskOverview(auth.providerId)
    const deadline = await ContractService.getTransitionDeadlineWarning()
    res.json({ data: overview, deadline })
  })

  // ============================================================
  // BuT VOUCHERS
  // ============================================================

  router.get('/api/providers/:providerId/but-vouchers', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const vouchers = await BuTVoucherService.listByProvider(auth.providerId, {
      status: req.query.status as any,
    })
    const stats = await BuTVoucherService.getStats(auth.providerId)
    res.json({ data: vouchers, stats })
  })

  router.post('/api/but-vouchers', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateBuTVoucherSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const voucher = await BuTVoucherService.create({ ...parsed.data as any, providerId: auth.providerId })
    res.status(201).json({ data: voucher })
  })

  // ============================================================
  // WIDGETS
  // ============================================================

  router.get('/api/providers/:providerId/widgets', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const widgets = await WidgetService.listByProvider(auth.providerId)
    res.json({ data: widgets })
  })

  router.post('/api/widgets', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateWidgetSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const widget = await WidgetService.create({ ...parsed.data as any, providerId: auth.providerId })
    res.status(201).json({ data: widget })
  })

  // ============================================================
  // CRM
  // ============================================================

  router.get('/api/providers/:providerId/customers', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const customers = await CrmService.listCustomers(auth.providerId, {
      tag: req.query.tag as any,
      minSpent: req.query.minSpent ? parseFloat(req.query.minSpent) : undefined,
      query: req.query.q,
    })
    const segments = await CrmService.getSegments(auth.providerId)
    const db = getServiceClient()

    // Fetch child info from bookings + waitlist to merge into each customer
    const { data: allBookings } = await db.from('provider_bookings')
      .select('parent_id, child_info').eq('provider_id', auth.providerId)
    const { data: provActs } = await db.from('activities').select('id').eq('provider_id', auth.providerId)
    const actIds = (provActs ?? []).map((a: { id: string }) => a.id)
    let allWaitlist: any[] = []
    if (actIds.length > 0) {
      const { data: wl } = await db.from('waitlist_entries')
        .select('parent_id, child_info').in('activity_id', actIds)
      allWaitlist = wl ?? []
    }

    // Flatten parent data for frontend consumption
    const flat = customers.map((c: any) => {
      const childMap: Record<string, { name: string; age: number }> = {}
      for (const ch of c.parent.children ?? []) {
        if (ch.name) childMap[ch.name] = { name: ch.name, age: ch.age ?? 0 }
      }
      for (const b of allBookings ?? []) {
        if (b.parent_id !== c.parent.id) continue
        const ci = b.child_info ?? {}
        const name = ci.firstName ? (ci.firstName + ' ' + (ci.lastName || '')).trim() : ''
        if (name && !childMap[name]) {
          childMap[name] = { name, age: ci.birthYear ? new Date().getFullYear() - ci.birthYear : 0 }
        }
      }
      for (const w of allWaitlist) {
        if (w.parent_id !== c.parent.id) continue
        const ci = w.child_info ?? {}
        const name = ci.firstName ? (ci.firstName + ' ' + (ci.lastName || '')).trim() : ''
        if (name && !childMap[name]) {
          childMap[name] = { name, age: ci.birthYear ? new Date().getFullYear() - ci.birthYear : 0 }
        }
      }
      return {
        id: c.parent.id, name: c.parent.name, email: c.parent.email, phone: c.parent.phone,
        children: Object.values(childMap),
        bookingCount: c.bookingCount, totalSpent: c.totalSpent, lastBookingAt: c.lastBookingAt,
      }
    })
    res.json({ data: flat, segments, count: flat.length })
  })

  router.get('/api/providers/:providerId/customers/:parentId', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const profile = await CrmService.getExtendedProfile(req.params.parentId, auth.providerId)
    if (!profile) return res.error(404, 'Kundenprofil nicht gefunden')
    const p = profile.parent as any
    const db = getServiceClient()

    // Merge children from: parents.children + bookings.child_info + waitlist.child_info
    const childMap: Record<string, { name: string; age: number }> = {}
    for (const ch of p.children ?? []) {
      if (ch.name) childMap[ch.name] = { name: ch.name, age: ch.age ?? 0 }
    }
    for (const b of (profile.bookings as any[]) ?? []) {
      const ci = b.child_info ?? {}
      const name = ci.firstName ? (ci.firstName + ' ' + (ci.lastName || '')).trim() : ''
      if (name && !childMap[name]) {
        childMap[name] = { name, age: ci.birthYear ? new Date().getFullYear() - ci.birthYear : 0 }
      }
    }
    // Check waitlist entries for this parent
    const { data: provActs } = await db.from('activities').select('id').eq('provider_id', auth.providerId)
    const actIds = (provActs ?? []).map((a: { id: string }) => a.id)
    if (actIds.length > 0) {
      const { data: wlEntries } = await db.from('waitlist_entries')
        .select('child_info').eq('parent_id', req.params.parentId).in('activity_id', actIds)
      for (const w of wlEntries ?? []) {
        const ci = w.child_info ?? {}
        const name = ci.firstName ? (ci.firstName + ' ' + (ci.lastName || '')).trim() : ''
        if (name && !childMap[name]) {
          childMap[name] = { name, age: ci.birthYear ? new Date().getFullYear() - ci.birthYear : 0 }
        }
      }
    }

    res.json({ data: {
      id: p.id, name: p.name, email: p.email, phone: p.phone,
      children: Object.values(childMap),
      bookingCount: (profile.bookings as any[])?.length ?? 0,
      totalSpent: profile.totalSpent,
      bookings: profile.bookings,
      notes: profile.notes,
    } })
  })

  router.post('/api/providers/:providerId/customers/:parentId/notes', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { content, authorId } = req.body as { content: string; authorId: string }
    const note = await CrmService.addNote({
      parentId: req.params.parentId,
      providerId: auth.providerId,
      authorId,
      content,
    })
    res.status(201).json({ data: note })
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
  // EXPORTS
  // ============================================================

  router.post('/api/providers/:providerId/export', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateExportSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const { type, format, dateRange } = parsed.data as any
    const request = await ExportService.createExport({
      providerId: auth.providerId,
      type,
      format,
      dateRange,
    })
    res.json({ data: request })
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
  // BACKGROUND JOBS (Admin-Trigger)
  // ============================================================

  router.post('/api/admin/jobs/daily', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const result = await BackgroundJobs.runDaily()
    res.json({ data: result })
  })

  router.post('/api/admin/jobs/weekly', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const result = await BackgroundJobs.runWeekly()
    res.json({ data: result })
  })

  // Auto-expire waitlist offers and offer to next person (call via cron/n8n every 15min)
  router.post('/api/admin/jobs/expire-waitlist', async (req, res) => {
    const db = getServiceClient()
    const now = new Date().toISOString()

    // Find all expired offers
    const { data: expired } = await db.from('waitlist_entries')
      .select('id, activity_id, parent_id, child_info, confirm_token')
      .eq('status', 'offered')
      .lt('expires_at', now)

    let expiredCount = 0, offeredCount = 0
    for (const entry of expired ?? []) {
      // Mark as expired
      await db.from('waitlist_entries').update({ status: 'expired' }).eq('id', entry.id)
      expiredCount++

      // Auto-offer to next person in line
      const { data: nextEntry } = await db.from('waitlist_entries')
        .select('id, parent_id, child_info, activity_id')
        .eq('activity_id', entry.activity_id).eq('status', 'waiting')
        .order('position', { ascending: true }).limit(1).maybeSingle()

      if (nextEntry) {
        // Generate new token and offer
        const { randomBytes } = await import('node:crypto')
        const token = randomBytes(24).toString('hex')
        await db.from('waitlist_entries').update({
          status: 'offered',
          notified_at: now,
          expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
          confirm_token: token,
        }).eq('id', nextEntry.id)

        // Send offer email
        try {
          const { EmailService } = await import('../lib/email')
          const { data: parent } = await db.from('parents').select('name, email').eq('id', nextEntry.parent_id).single()
          const { data: activity } = await db.from('activities').select('title, provider_id').eq('id', nextEntry.activity_id).single()
          const { data: provider } = await db.from('providers').select('company_name').eq('id', activity?.provider_id).single()
          if (parent?.email) {
            const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
            const childName = nextEntry.child_info?.firstName ? (nextEntry.child_info.firstName + ' ' + (nextEntry.child_info.lastName || '')) : 'Ihr Kind'
            await EmailService.sendWaitlistOffer(parent.email, {
              parentName: parent.name?.split(' ')[0] || '',
              childName,
              courseName: activity?.title || 'Kurs',
              providerName: provider?.company_name || '',
              confirmLink: origin + '/api/waitlist/' + nextEntry.id + '/confirm?token=' + token,
              declineLink: origin + '/api/waitlist/' + nextEntry.id + '/decline-offer?token=' + token,
            })
            offeredCount++
            console.log('[AutoOffer] Offered to next person: ' + parent.email + ' for ' + activity?.title)
          }
        } catch (emailErr) {
          console.error('[AutoOffer] Email failed:', emailErr)
        }
      }
    }
    res.json({ data: { expired: expiredCount, offered: offeredCount } })
  })

  // ============================================================
  // AUTH
  // ============================================================

  router.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body as { email: string; password: string }
    if (!email || !password) return res.error(400, 'E-Mail und Passwort erforderlich')
    const { loginProvider } = await import('../lib/auth')
    const result = await loginProvider(email, password)
    if ('error' in result) return res.error(401, result.error)
    res.json({ data: result })
  })

  router.post('/api/auth/register', async (req, res) => {
    const { email, password, displayName, companyName, legalForm, contactName, phone, street, zip, city } = req.body as any

    if (!email || !password || !displayName || !companyName || !legalForm || !contactName || !phone || !street || !zip || !city) {
      return res.error(400, 'Alle Felder sind erforderlich')
    }
    if (password.length < 6) {
      return res.error(400, 'Passwort muss mindestens 6 Zeichen lang sein')
    }

    const db = getServiceClient()

    // 1. Deduplicate slug
    let slug = displayName.toLowerCase()
      .replace(/[äöüß]/g, (c: string) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' } as Record<string, string>)[c] ?? c)
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const { data: existingSlugs } = await db.from('providers').select('slug').like('slug', `${slug}%`)
    if (existingSlugs && existingSlugs.length > 0) {
      const taken = new Set(existingSlugs.map((r: any) => r.slug))
      let i = 2
      const base = slug
      while (taken.has(slug)) { slug = `${base}-${i++}` }
    }

    // 2. Create auth user (email_confirm: false — admin must approve)
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
    })
    if (authError) {
      if (authError.message.includes('already been registered')) {
        return res.error(409, 'Diese E-Mail-Adresse ist bereits registriert')
      }
      return res.error(500, 'Registrierung fehlgeschlagen: ' + authError.message)
    }

    // 3. Create provider record

    const { data: provider, error: provError } = await db
      .from('providers')
      .insert({
        display_name: displayName,
        company_name: companyName,
        legal_form: legalForm,
        contact_name: contactName,
        email: email,
        phone: phone,
        address_street: street,
        address_zip: zip,
        address_city: city,
        latitude: 0,
        longitude: 0,
        login_email: email,
        slug: slug,
        status: 'onboarding',
        subscription: 'free',
      })
      .select()
      .single()

    if (provError) {
      // Rollback: delete auth user
      await db.auth.admin.deleteUser(authData.user.id)
      return res.error(500, 'Provider-Erstellung fehlgeschlagen: ' + provError.message)
    }

    // 4. Set provider_id in user metadata for auth middleware
    await db.auth.admin.updateUserById(authData.user.id, {
      user_metadata: { provider_id: provider.id }
    })

    // 5. Create lead entry for admin pipeline tracking
    await db.from('provider_leads').insert({
      company_name: companyName,
      contact_name: contactName,
      email: email,
      phone: phone,
      address_street: street,
      address_zip: zip,
      address_city: city,
      description: `Selbst-Registrierung über Provider Dashboard. Anzeigename: ${displayName}, Rechtsform: ${legalForm}`,
      status: 'onboarding',
      converted_provider_id: provider.id,
    }).then(() => {}).catch(() => {}) // Non-critical, don't fail registration

    res.json({ success: true, provider })
  })

  // ============================================================
  // COURSE BLOCKS & GUTHABEN-SYSTEM
  // ============================================================

  // --- Course Blocks ---

  router.post('/api/course-blocks', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const result = await CourseBlockService.createBlock(req.body)
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
    if ('error' in result) return res.error(400, result.error)
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
    const { data: updated, error } = await db.from('block_sessions').update({ date: newDate, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single()
    if (error) return res.error(500, error.message)
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
      await db.from('block_sessions').update({ status: 'cancelled_by_provider', updated_at: new Date().toISOString() }).eq('block_id', req.params.id).eq('status', 'scheduled').gte('date', today)
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
    res.json({ data: enrollments, count: enrollments.length })
  })

  // --- Session Attendance ---

  router.get('/api/sessions/:id/attendance', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const attendance = await CourseBlockService.getAttendanceBySession(req.params.id)
    res.json({ data: attendance, count: attendance.length })
  })

  router.post('/api/sessions/:id/mark-attendance', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const result = await CourseBlockService.markAttendance(req.body.attendanceId, req.body.status)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  // --- Eltern-Absage (triggert Credit-Prüfung) ---

  router.post('/api/attendance/:id/cancel', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
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
    res.json({ data: credits, count: credits.length })
  })

  router.get('/api/parents/:id/credits', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const status = req.query.status as any
    const credits = await SessionCreditService.getCreditsByParent(req.params.id, status)
    res.json({ data: credits, count: credits.length })
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
    const result = await SessionCreditService.issueManualCredit(req.body)
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
    const result = await MakeupBookingService.markMakeupAttendance(req.params.id, req.body.status, auth.providerId)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.get('/api/children/:id/makeup-bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const makeups = await MakeupBookingService.getMakeupsByChild(req.params.id)
    res.json({ data: makeups, count: makeups.length })
  })

  router.get('/api/parents/:id/makeup-bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const makeups = await MakeupBookingService.getMakeupsByParent(req.params.id)
    res.json({ data: makeups, count: makeups.length })
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

  // ============================================================
  // PUBLIC EMBED ENDPOINTS (kein Auth – für iframe-Widgets)
  // ============================================================

  // Public: Activities by provider slug (for embed calendar/course list)
  router.get('/api/providers/by-slug/:slug/activities', async (req, res) => {
    const provider = await ProviderService.getBySlug(req.params.slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    const activities = await ActivityService.listByProvider(provider.id)
    // Check which activities have active blocks
    const db = getServiceClient()
    const activityIds = activities.map((a: any) => a.id)
    const { data: activeBlocks } = await db.from('course_blocks')
      .select('activity_id, start_date, end_date').in('activity_id', activityIds).in('status', ['active', 'upcoming'])
    // Build map: activity_id → [{start_date, end_date}]
    const blockDateRanges: Record<string, Array<{start: string, end: string}>> = {}
    for (const b of activeBlocks ?? []) {
      if (!blockDateRanges[b.activity_id]) blockDateRanges[b.activity_id] = []
      blockDateRanges[b.activity_id].push({ start: b.start_date, end: b.end_date })
    }
    // Only return public-safe fields + block date ranges for per-date checking
    const safe = activities.map((a: any) => ({
      id: a.id, title: a.title, description: a.description, category: a.category,
      ageRange: a.ageRange || { min: a.age_group_min, max: a.age_group_max },
      duration: a.duration || a.duration_minutes, schedule: a.schedule,
      pricing: a.pricing, status: a.status, color: a.color, images: a.images,
      hasActiveBlock: !!blockDateRanges[a.id]?.length,
      blockDateRanges: blockDateRanges[a.id] || [],
    }))
    res.json({ data: safe, count: safe.length })
  })

  // Public: Waitlist registration (no auth needed — for embed widget)
  router.post('/api/widget/waitlist', async (req, res) => {
    const { slug, activityId, child, parent: parentData } = req.body as any
    if (!slug || !activityId) return res.error(400, 'Pflichtfelder fehlen')
    if (!child?.firstName || !child?.lastName || !child?.birthYear) return res.error(400, 'Kind-Daten unvollständig')
    if (!parentData?.firstName || !parentData?.lastName || !parentData?.email) return res.error(400, 'Eltern-Daten unvollständig')

    const db = getServiceClient()
    const provider = await ProviderService.getBySlug(slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')

    // Find or create parent
    let { data: existingParent } = await db.from('parents').select('id').eq('email', parentData.email).maybeSingle()
    if (!existingParent) {
      const { data: newParent } = await db.from('parents').insert({
        name: (parentData.firstName + ' ' + parentData.lastName).trim(),
        email: parentData.email,
        phone: parentData.phone || null,
      }).select('id').single()
      existingParent = newParent
    }
    if (!existingParent) return res.error(500, 'Eltern konnten nicht erstellt werden')

    // Check if this specific child is already on waitlist (not just same parent)
    const { data: parentWaitlist } = await db.from('waitlist_entries')
      .select('id, child_info').eq('activity_id', activityId).eq('parent_id', existingParent.id)
      .in('status', ['waiting', 'offered'])
    const existing = (parentWaitlist || []).find(function(e: any) {
      const ci = e.child_info || {}
      return (ci.firstName || '').toLowerCase() === (child.firstName || '').toLowerCase()
        && (ci.lastName || '').toLowerCase() === (child.lastName || '').toLowerCase()
    })
    if (existing) return res.json({ success: true, message: 'Bereits auf der Warteliste', alreadyExists: true })

    // Get next position
    const { count } = await db.from('waitlist_entries')
      .select('*', { count: 'exact', head: true })
      .eq('activity_id', activityId).in('status', ['waiting', 'offered'])

    // Find active block for block-scoped waitlist
    const { data: wlBlock } = await db.from('course_blocks')
      .select('id').eq('activity_id', activityId).in('status', ['active', 'upcoming'])
      .order('start_date', { ascending: true }).limit(1).maybeSingle()

    // Add to waitlist (scoped to block if available)
    await db.from('waitlist_entries').insert({
      activity_id: activityId,
      block_id: wlBlock?.id || null,
      parent_id: existingParent.id,
      child_info: { firstName: child.firstName, lastName: child.lastName, birthYear: child.birthYear },
      position: (count ?? 0) + 1,
      priority: 'normal',
      status: 'waiting',
    })

    // Notify provider
    await db.from('notifications').insert({
      recipient_type: 'provider',
      recipient_id: provider.id,
      type: 'waitlist_entry',
      channel: 'in_app',
      title: 'Neue Wartelisten-Anmeldung!',
      body: child.firstName + ' ' + child.lastName + ' möchte am Kurs teilnehmen.',
      data: { activityId, parentId: existingParent.id },
    })

    // Send waitlist confirmation email to parent
    try {
      const { EmailService } = await import('../lib/email')
      const { data: activity } = await db.from('activities').select('title').eq('id', activityId).maybeSingle()
      await EmailService.sendWaitlistConfirmation(parentData.email, {
        parentName: parentData.firstName,
        childName: (child.firstName + ' ' + child.lastName).trim(),
        courseName: activity?.title || 'Kurs',
        providerName: provider.companyName || provider.name || '',
      })
    } catch (emailErr) {
      console.error('[Waitlist] Confirmation email failed:', emailErr)
    }

    res.json({ success: true, message: 'Erfolgreich auf die Warteliste eingetragen!' })
  })

  // Public: Booking inquiry from embed widget (creates a lead/notification)
  router.post('/api/widget/booking-inquiry', async (req, res) => {
    const { slug, course, date, time, name, email, phone, message } = req.body as any
    if (!slug || !name || !email) return res.error(400, 'Name und E-Mail erforderlich')
    const provider = await ProviderService.getBySlug(slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    const db = getServiceClient()
    const { error } = await db.from('booking_inquiries').insert({
      provider_id: provider.id,
      course_name: course || '',
      preferred_date: date || '',
      preferred_time: time || '',
      parent_name: name,
      parent_email: email,
      parent_phone: phone || '',
      message: message || '',
      status: 'new',
    })
    if (error) return res.error(500, 'Anfrage konnte nicht gespeichert werden')
    res.json({ success: true })
  })

  // ============================================================
  // PUBLIC CHECKOUT (no auth — called from embed widget)
  // ============================================================

  router.post('/api/checkout/create-session', async (req, res) => {
    const { slug, activityId, blockId, child, parent, paymentMethod, bookedDate } = req.body as any

    // Server-side validation
    if (!slug || !activityId || !paymentMethod) return res.error(400, 'Pflichtfelder fehlen')
    if (!child?.firstName?.trim() || !child?.lastName?.trim()) return res.error(400, 'Vor- und Nachname des Kindes erforderlich')
    if (!child.birthYear || child.birthYear < 2005 || child.birthYear > new Date().getFullYear()) return res.error(400, 'Ungültiges Geburtsjahr')
    if (!parent?.firstName?.trim() || !parent?.lastName?.trim()) return res.error(400, 'Vor- und Nachname des Elternteils erforderlich')
    if (!parent?.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email)) return res.error(400, 'Ungültige E-Mail-Adresse')
    if (!['stripe', 'paypal', 'onsite'].includes(paymentMethod)) return res.error(400, 'Ungültige Zahlungsart')

    const db = getServiceClient()
    const provider = await ProviderService.getBySlug(slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    // Fetch extra fields not in Provider mapper
    const { data: provExtra } = await db.from('providers')
      .select('booking_redirect_url, stripe_account_id').eq('id', provider.id).single()

    const { data: activity } = await db.from('activities').select('*').eq('id', activityId).single()
    if (!activity) return res.error(404, 'Kurs nicht gefunden')
    if (activity.provider_id !== provider.id) return res.error(400, 'Kurs gehört nicht zu diesem Provider')

    // Validate payment method is enabled for this activity
    if (paymentMethod === 'onsite' && activity.payment_onsite === false) {
      return res.error(400, 'Vor-Ort-Zahlung ist für diesen Kurs nicht aktiviert')
    }
    if ((paymentMethod === 'stripe' || paymentMethod === 'paypal') && activity.payment_online === false) {
      return res.error(400, 'Online-Zahlung ist für diesen Kurs nicht aktiviert')
    }

    // Find active block for this activity (for block-scoped capacity + waitlist)
    const { data: activeBlock } = await db.from('course_blocks')
      .select('id, capacity, makeup_capacity')
      .eq('activity_id', activityId).in('status', ['active', 'upcoming'])
      .order('start_date', { ascending: true }).limit(1).maybeSingle()

    // Soft pre-check: count enrollments in active block (not total bookings)
    // This is NOT the authoritative gate — create_booking_atomic RPC does the real atomic check
    let currentCount = 0
    if (activeBlock) {
      const { count: enrollCount } = await db.from('block_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('block_id', activeBlock.id).eq('status', 'active')
      currentCount = enrollCount ?? 0
    } else {
      const { count: bookingCount } = await db.from('provider_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('activity_id', activityId).in('status', ['confirmed', 'pending'])
      currentCount = bookingCount ?? 0
    }

    const effectiveCapacity = activeBlock?.capacity || activity.capacity || 0
    if (currentCount >= effectiveCapacity) {
      // Course full → auto-add to waitlist (scoped to block if available)
      let parentId = ''
      const { data: existingParent } = await db.from('parents').select('id').eq('email', parent.email).maybeSingle()
      if (existingParent) {
        parentId = existingParent.id
      } else {
        const { data: newParent } = await db.from('parents').insert({
          name: (parent.firstName + ' ' + parent.lastName).trim(),
          email: parent.email, phone: parent.phone || null,
        }).select('id').single()
        parentId = newParent?.id || ''
      }
      if (parentId) {
        const { data: parentWl } = await db.from('waitlist_entries')
          .select('id, child_info').eq('activity_id', activityId).eq('parent_id', parentId)
          .in('status', ['waiting', 'offered'])
        const existingWl = (parentWl || []).find(function(e: any) {
          const ci = e.child_info || {}
          return (ci.firstName || '').toLowerCase() === (child.firstName || '').toLowerCase()
            && (ci.lastName || '').toLowerCase() === (child.lastName || '').toLowerCase()
        })
        if (!existingWl) {
          const { count: wlCount } = await db.from('waitlist_entries')
            .select('*', { count: 'exact', head: true })
            .eq('activity_id', activityId).in('status', ['waiting', 'offered'])
          await db.from('waitlist_entries').insert({
            activity_id: activityId, parent_id: parentId,
            block_id: activeBlock?.id || null,
            child_info: { firstName: child.firstName, lastName: child.lastName, birthYear: child.birthYear },
            position: (wlCount ?? 0) + 1, priority: 'normal', status: 'waiting',
          })
          // Notify provider
          await db.from('notifications').insert({
            recipient_type: 'provider', recipient_id: provider.id,
            type: 'waitlist_entry', channel: 'in_app',
            title: 'Neue Wartelisten-Anmeldung!',
            body: child.firstName + ' ' + child.lastName + ' möchte am Kurs teilnehmen.',
            data: { activityId, parentId },
          })
          // Send waitlist email
          try {
            const { EmailService } = await import('../lib/email')
            await EmailService.sendWaitlistConfirmation(parent.email, {
              parentName: parent.firstName,
              childName: (child.firstName + ' ' + child.lastName).trim(),
              courseName: activity.title || 'Kurs',
              providerName: provider.companyName || provider.name || '',
            })
          } catch(e) {}
        }
      }
      return res.error(400, 'Tut uns leid — da war leider jemand schneller! 😅 Aber keine Sorge, wir haben ' + child.firstName + ' auf die Warteliste gesetzt. Sobald ein Platz frei wird, melden wir uns sofort bei dir!')
    }

    // Duplicate check — same child (first+last name) for same activity, not just same parent
    if (parent.email && child.firstName && child.lastName) {
      const { data: existingParent2 } = await db.from('parents').select('id').eq('email', parent.email).maybeSingle()
      if (existingParent2) {
        const { data: parentBookings } = await db.from('provider_bookings')
          .select('id, child_info').eq('activity_id', activityId).eq('parent_id', existingParent2.id)
          .in('status', ['confirmed', 'pending'])
        const isDuplicate = (parentBookings || []).some(function(b: any) {
          const ci = b.child_info || {}
          return (ci.firstName || '').toLowerCase() === child.firstName.toLowerCase()
            && (ci.lastName || '').toLowerCase() === child.lastName.toLowerCase()
        })
        if (isDuplicate) {
          return res.error(400, child.firstName + ' ' + child.lastName + ' ist bereits für diesen Kurs angemeldet.')
        }
      }
    }

    // Price + sibling discount
    let priceEur = activity.pricing?.[0]?.amount || 0
    const siblingDiscount = activity.pricing?.[0]?.siblingDiscount || 0
    let appliedDiscount = 0

    // Check if parent already has another child in this course → sibling discount
    if (siblingDiscount > 0 && parent.email) {
      const { data: siblingParent } = await db.from('parents').select('id').eq('email', parent.email).maybeSingle()
      if (siblingParent) {
        const { count: siblingBookings } = await db.from('provider_bookings')
          .select('*', { count: 'exact', head: true })
          .eq('activity_id', activityId).eq('parent_id', siblingParent.id)
          .in('status', ['confirmed', 'pending'])
        if ((siblingBookings ?? 0) > 0) {
          appliedDiscount = siblingDiscount
          priceEur = Math.round(priceEur * (1 - siblingDiscount / 100) * 100) / 100
          console.log(`[Checkout] Sibling discount ${siblingDiscount}% applied: ${activity.pricing?.[0]?.amount}€ → ${priceEur}€`)
        }
      }
    }
    const price = Math.round(priceEur * 100) // Stripe expects cents

    // If sibling discount makes price 0 → treat as free booking (skip Stripe)
    if (price <= 0 && (paymentMethod === 'stripe' || paymentMethod === 'paypal')) {
      try {
        const { CheckoutService } = await import('../services/supabase/checkout.service')
        const booking = await CheckoutService.createBooking({
          providerId: provider.id, activityId, blockId,
          childFirstName: child.firstName, childLastName: child.lastName, childBirthYear: child.birthYear,
          parentFirstName: parent.firstName, parentLastName: parent.lastName,
          parentEmail: parent.email, parentPhone: parent.phone || '',
          bookedDate: bookedDate || undefined,
          paymentMethod: 'onsite', amount: 0, currency: 'EUR',
        })
        return res.json({ success: true, bookingId: booking.id, redirect: provExtra?.booking_redirect_url || null })
      } catch (bookingErr: any) {
        return res.error(400, bookingErr.message || 'Buchung fehlgeschlagen')
      }
    }

    if (paymentMethod === 'onsite') {
      try {
        const { CheckoutService } = await import('../services/supabase/checkout.service')
        const booking = await CheckoutService.createBooking({
          providerId: provider.id, activityId, blockId,
          childFirstName: child.firstName, childLastName: child.lastName, childBirthYear: child.birthYear,
          parentFirstName: parent.firstName, parentLastName: parent.lastName,
          parentEmail: parent.email, parentPhone: parent.phone || '',
          bookedDate: bookedDate || undefined,
          paymentMethod: 'onsite', amount: price, currency: 'EUR',
        })
        return res.json({ success: true, bookingId: booking.id, redirect: provExtra?.booking_redirect_url || null })
      } catch (bookingErr: any) {
        return res.error(400, bookingErr.message || 'Buchung fehlgeschlagen')
      }
    }

    if (paymentMethod === 'stripe') {
      const { stripe: stripeClient, createCheckoutSession } = await import('../lib/stripe')
      if (!stripeClient) return res.error(500, 'Stripe ist nicht konfiguriert')
      const origin = req.raw.headers.origin || (req.raw.headers.host ? `https://${req.raw.headers.host}` : 'https://app.urbankids.club')
      const defaultSuccess = `${origin}/embed/${slug}/booking-success?session_id={CHECKOUT_SESSION_ID}`
      const redirectUrl = provExtra?.booking_redirect_url
      const successUrl = (redirectUrl && (redirectUrl.startsWith('https://') || redirectUrl.startsWith('http://'))) ? redirectUrl : defaultSuccess
      const url = await createCheckoutSession({
        stripeAccountId: provExtra?.stripe_account_id || undefined,
        amount: price, currency: 'EUR', courseName: activity.title,
        successUrl,
        cancelUrl: `${origin}/embed/${slug}/calendar`,
        metadata: {
          provider_id: provider.id, activity_id: activityId, block_id: blockId || '',
          child_first: child.firstName, child_last: child.lastName, child_year: String(child.birthYear),
          parent_first: parent.firstName, parent_last: parent.lastName,
          parent_email: parent.email, parent_phone: parent.phone || '',
          booked_date: bookedDate || '',
        },
      })
      return res.json({ success: true, redirect: url })
    }

    if (paymentMethod === 'paypal') {
      // PayPal integration is not yet complete (no capture/webhook for booking creation)
      // Disable until properly implemented to prevent orphaned orders
      return res.error(400, 'PayPal-Zahlung ist derzeit nicht verfügbar. Bitte wählen Sie Kartenzahlung oder Vor-Ort-Zahlung.')
    }

    res.error(400, 'Ungueltige Zahlungsart')
  })

  // Stripe Webhook
  router.post('/api/webhooks/stripe', async (req, res) => {
    const { stripe: stripeClient } = await import('../lib/stripe')
    if (!stripeClient) return res.error(500, 'Stripe not configured')

    // 1. Verify webhook signature
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    let event: any
    if (webhookSecret && req.rawBody) {
      try {
        const sig = req.raw.headers['stripe-signature'] as string
        event = stripeClient.webhooks.constructEvent(req.rawBody, sig, webhookSecret)
      } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message)
        return res.error(400, 'Invalid signature')
      }
    } else if (process.env.NODE_ENV !== 'production') {
      // Fallback for dev/test only — never accept unverified webhooks in production
      console.warn('WARNING: Webhook signature not verified (no STRIPE_WEBHOOK_SECRET set)')
      event = req.body
    } else {
      console.error('STRIPE_WEBHOOK_SECRET not configured in production!')
      return res.error(500, 'Webhook not configured')
    }

    if (event?.type === 'checkout.session.completed') {
      const session = event.data.object
      const meta = session.metadata || {}
      const db = getServiceClient()

      // 2. Idempotency: check if booking already exists for this session
      const { data: existing } = await db.from('provider_bookings')
        .select('id').eq('stripe_session_id', session.id).maybeSingle()
      if (existing) {
        return res.json({ received: true, duplicate: true })
      }

      // 2b. Re-check capacity at webhook time (race condition protection)
      if (meta.activity_id) {
        const { data: act } = await db.from('activities').select('capacity').eq('id', meta.activity_id).single()
        const maxCap = act?.capacity || 12
        const { count } = await db.from('provider_bookings')
          .select('id', { count: 'exact', head: true })
          .eq('activity_id', meta.activity_id)
          .eq('status', 'confirmed')
        if (count !== null && count >= maxCap) {
          console.warn(`Webhook: course ${meta.activity_id} full at payment time (${count}/${maxCap}). Booking created anyway — refund may be needed.`)
          // Still create the booking but log warning — manual refund needed
        }
      }

      // 3. Create booking with correct status
      try {
        const { CheckoutService } = await import('../services/supabase/checkout.service')
        await CheckoutService.createBooking({
          providerId: meta.provider_id, activityId: meta.activity_id, blockId: meta.block_id || undefined,
          childFirstName: meta.child_first, childLastName: meta.child_last,
          childBirthYear: parseInt(meta.child_year) || 2020,
          parentFirstName: meta.parent_first, parentLastName: meta.parent_last,
          parentEmail: meta.parent_email, parentPhone: meta.parent_phone || '',
          bookedDate: meta.booked_date || undefined,
          paymentMethod: 'stripe', amount: session.amount_total || 0,
          currency: session.currency || 'eur', stripeSessionId: session.id,
        })
      } catch (err: any) {
        // 4. Return 500 so Stripe retries
        console.error('Webhook booking creation failed:', err.message)
        return res.error(500, 'Booking creation failed')
      }
    }
    res.json({ received: true })
  })

  // Public: Get activity details + payment config for checkout form
  router.get('/api/checkout/activity/:activityId', async (req, res) => {
    const db = getServiceClient()
    const { data: activity } = await db.from('activities').select('id, title, category, pricing, payment_online, payment_onsite, provider_id').eq('id', req.params.activityId).single()
    if (!activity) return res.error(404, 'Kurs nicht gefunden')
    // Get provider payment config
    const { data: provider } = await db.from('providers').select('stripe_connected, paypal_connected').eq('id', activity.provider_id).single()
    // Get cancellation policy
    const { data: policy } = await db.from('cancellation_policies').select('*').eq('provider_id', activity.provider_id).single()
    res.json({
      activity: { id: activity.id, title: activity.title, category: activity.category, pricing: activity.pricing, paymentOnline: activity.payment_online, paymentOnsite: activity.payment_onsite },
      provider: { stripeConnected: provider?.stripe_connected || !!process.env.STRIPE_SECRET_KEY, paypalConnected: provider?.paypal_connected || false },
      cancellation: policy || { fee_type: 'fixed', fee_value: 0, deadline_hours: 48, custom_text: '' },
    })
  })

  // ============================================================
  // PUBLIC WIDGET ENDPOINTS (kein Auth – für Eltern-Widget auf Squarespace)
  // ============================================================
  // Diese Endpoints liefern angereicherte Daten für das eingebettete Widget.
  // Keine sensiblen Provider-Daten – nur öffentliche Kursinfos + elternbezogene Daten.

  // Öffentlich: Kursblöcke eines Providers mit Enrollment-Count + Activity-Titel
  router.get('/api/widget/providers/:slug/course-blocks', async (req, res) => {
    const slug = req.params.slug
    // Provider by slug
    const provider = await ProviderService.getBySlug(slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    const providerId = provider.id

    const blocks = await CourseBlockService.getBlocksByProvider(providerId)
    const enriched = await Promise.all(blocks.map(async (block: any) => {
      const activity = await ActivityService.getById(block.activityId)
      return {
        ...block,
        _activityTitle: activity?.title ?? block.activityType,
        _enrollmentCount: 0, // TODO: add enrollment count query to service
      }
    }))

    res.json({ data: enriched, count: enriched.length })
  })

  // Eltern: Enrollments mit Block-Info (auth required)
  router.get('/api/widget/enrollments/parent/:parentId', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const enrollments = await CourseBlockService.getEnrollmentsByParent(req.params.parentId)
    res.json({ data: enrollments, count: enrollments.length })
  })

  // Eltern: Credits (auth required)
  router.get('/api/widget/credits/parent/:parentId', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const credits = await SessionCreditService.getCreditsByParent(req.params.parentId)
    res.json({ data: credits, count: credits.length })
  })

  // Eltern: Makeup-Bookings mit Session-Infos angereichert (auth required)
  router.get('/api/widget/makeup-bookings/parent/:parentId', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const makeups = await MakeupBookingService.getMakeupsByParent(req.params.parentId)
    res.json({ data: makeups, count: makeups.length })
  })

  // Eltern: Verfügbare Makeup-Slots (auth required)
  router.get('/api/widget/credits/:id/available-slots', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const credit = await SessionCreditService.getCredit(req.params.id)
    if (!credit) return res.error(404, 'Guthaben nicht gefunden')
    if (credit.status !== 'available') return res.error(400, 'Guthaben ist nicht verfügbar')

    const slots = await CourseBlockService.getAvailableMakeupSlots(
      credit.activityType,
      credit.validUntil,
      credit.blockId
    )
    res.json({ data: slots, count: slots.length })
  })

  // ============================================================
  // ADMIN ENDPOINTS
  // ============================================================

  const ADMIN_EMAILS = ['remy.dostal@gmail.com']

  // Lightweight admin auth – validates JWT and checks admin email
  // Does NOT require a provider record (unlike requireAuth)
  async function requireAdmin(req: import('../api/router').ParsedRequest, res: import('../api/router').ApiResponse): Promise<{ userId: string; email: string } | null> {
    const token = req.raw.headers.authorization?.replace('Bearer ', '')
    if (!token) { res.error(401, 'Nicht authentifiziert'); return null }
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user || !user.email) { res.error(401, 'Token ungültig oder abgelaufen'); return null }
    if (!ADMIN_EMAILS.includes(user.email)) { res.error(403, 'Kein Admin-Zugang'); return null }
    return { userId: user.id, email: user.email }
  }

  router.get('/api/admin/check', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    res.json({ admin: true, email: admin.email })
  })

  router.get('/api/admin/providers', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const db = getServiceClient()
    const { data, error } = await db.from('providers').select('*').order('created_at', { ascending: false })
    if (error) return res.error(500, error.message)
    res.json({ data, count: data!.length })
  })

  router.post('/api/admin/providers/:id/status', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const { status } = req.body as any
    if (!['active', 'suspended', 'onboarding'].includes(status)) {
      return res.error(400, 'Ungültiger Status')
    }
    const db = getServiceClient()
    const { data, error } = await db.from('providers').update({ status, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single()
    if (error) return res.error(500, error.message)
    res.json({ data })
  })

  // Archive provider (soft delete — sets status to 'archived', keeps all data)
  router.post('/api/admin/providers/:id/archive', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const db = getServiceClient()
    const { data, error } = await db.from('providers')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single()
    if (error) return res.error(500, error.message)
    res.json({ data })
  })

  // Create provider (admin creates account directly, skipping self-registration)
  router.post('/api/admin/providers', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const { email, password, displayName, companyName, legalForm, contactName, phone, street, zip, city, status } = req.body as any

    if (!email || !password || !displayName || !companyName || !contactName) {
      return res.error(400, 'Pflichtfelder: E-Mail, Passwort, Anzeigename, Firmenname, Kontaktperson')
    }

    const db = getServiceClient()

    // Create auth user
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (authError) return res.error(500, authError.message)

    // Create provider
    const slug = (displayName || companyName).toLowerCase()
      .replace(/[äöüß]/g, (c: string) => ({ä:'ae',ö:'oe',ü:'ue',ß:'ss'} as any)[c] ?? c)
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    const { data: provider, error: provError } = await db.from('providers').insert({
      display_name: displayName || '',
      company_name: companyName,
      legal_form: legalForm || '',
      contact_name: contactName,
      email, phone: phone || '',
      address_street: street || '', address_zip: zip || '', address_city: city || '',
      latitude: 0, longitude: 0,
      login_email: email, slug,
      status: status || 'active',
      subscription: 'free',
    }).select().single()

    if (provError) {
      await db.auth.admin.deleteUser(authData.user.id)
      return res.error(500, provError.message)
    }
    res.json({ data: provider })
  })

  // Delete provider auth user (disable login when archiving)
  router.post('/api/admin/providers/:id/delete-auth', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const db = getServiceClient()
    // Get provider email
    const { data: provider } = await db.from('providers').select('login_email').eq('id', req.params.id).single()
    if (!provider?.login_email) return res.error(404, 'Provider nicht gefunden')
    // Find and disable auth user
    const { data: { users } } = await db.auth.admin.listUsers()
    const authUser = users.find((u: any) => u.email === provider.login_email)
    if (authUser) {
      await db.auth.admin.updateUserById(authUser.id, { ban_duration: '876000h' }) // ban for 100 years
    }
    res.json({ success: true })
  })

  // ============================================================
  // STRIPE CONNECT
  // ============================================================

  router.post('/api/providers/:id/stripe-connect', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
    const { getConnectAuthUrl } = await import('../lib/stripe')
    const returnUrl = `${req.raw.headers.origin || 'https://app.urbankids.club'}/api/stripe/callback`
    const url = getConnectAuthUrl(req.params.id, returnUrl)
    res.json({ url })
  })

  router.get('/api/stripe/callback', async (req, res) => {
    const code = req.query.code as string
    const state = req.query.state as string
    if (!code || !state) { res.error(400, 'Missing code or state'); return }
    try {
      const { verifyConnectState, completeConnect } = await import('../lib/stripe')
      const { providerId } = verifyConnectState(state)
      const accountId = await completeConnect(code)
      const db = getServiceClient()
      await db.from('providers').update({
        stripe_account_id: accountId,
        stripe_connected: true,
        updated_at: new Date().toISOString()
      }).eq('id', providerId)
      res.writeHead(302, { Location: '/?page=settings&tab=finance&stripe=connected' })
      res.end()
    } catch (err: any) {
      res.error(500, 'Stripe-Verbindung fehlgeschlagen: ' + err.message)
    }
  })

  // ============================================================
  // PAYPAL CONNECT
  // ============================================================

  router.put('/api/providers/:id/paypal-config', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
    const { clientId, secret } = req.body as any
    if (!clientId || !secret) return res.error(400, 'Client ID und Secret erforderlich')
    const db = getServiceClient()
    const { error } = await db.from('providers').update({
      paypal_client_id: clientId,
      paypal_secret: secret,
      paypal_connected: true,
      updated_at: new Date().toISOString()
    }).eq('id', auth.providerId)
    if (error) return res.error(500, error.message)
    res.json({ success: true })
  })

  // ============================================================
  // PAYMENT CONFIG
  // ============================================================

  router.get('/api/providers/:id/payment-config', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
    const db = getServiceClient()
    const { data } = await db.from('providers').select('stripe_account_id, stripe_connected, paypal_client_id, paypal_connected').eq('id', auth.providerId).single()
    // Stripe is available if provider has connected account OR platform has keys configured
    const stripeAvailable = data?.stripe_connected || !!process.env.STRIPE_SECRET_KEY
    res.json({ data: { ...data, stripe_connected: stripeAvailable, paypal_client_id: data?.paypal_client_id ? '***' + data.paypal_client_id.slice(-4) : null } })
  })

  // ============================================================
  // CANCELLATION POLICY
  // ============================================================

  router.get('/api/providers/:id/cancellation-policy', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const db = getServiceClient()
    const { data } = await db.from('cancellation_policies').select('*').eq('provider_id', auth.providerId).single()
    res.json({ data: data || { fee_type: 'fixed', fee_value: 0, deadline_hours: 48, custom_text: '' } })
  })

  router.put('/api/providers/:id/cancellation-policy', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { feeType, feeValue, deadlineHours, customText } = req.body as any
    const db = getServiceClient()
    const { error } = await db.from('cancellation_policies').upsert({
      provider_id: auth.providerId,
      fee_type: feeType || 'fixed',
      fee_value: parseFloat(feeValue) || 0,
      deadline_hours: parseInt(deadlineHours) || 48,
      custom_text: customText || '',
      updated_at: new Date().toISOString()
    }, { onConflict: 'provider_id' })
    if (error) return res.error(500, error.message)
    res.json({ success: true })
  })

  // ============================================================
  // QR CHECK-IN (public – no auth)
  // ============================================================

  router.post('/api/public/checkin', async (req, res) => {
    const { providerId, email } = req.body as { providerId?: string; email?: string }
    if (!providerId || !email) return res.error(400, 'providerId und email sind erforderlich')

    // Verify provider exists
    const provider = await ProviderService.getById(providerId)
    if (!provider) return res.error(404, 'Anbieter nicht gefunden')

    const result = await AttendanceService.qrCheckIn(providerId, email)

    // Add redirect URL from provider (if configured)
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
  // OPENAPI SPEC
  // ============================================================

  router.get('/api/openapi.json', async (_req, res) => {
    const { openApiSpec } = await import('./openapi')
    res.json(openApiSpec)
  })
}
