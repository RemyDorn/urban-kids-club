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
    const booking = await BookingService.cancel(req.params.id, auth.providerId)
    if (!booking) return res.error(400, 'Buchung konnte nicht storniert werden')
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
    const result = await InvoiceService.createFromBooking(req.params.bookingId, auth.providerId)
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

  router.get('/api/providers/:providerId/invoices/outstanding', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const outstanding = await InvoiceService.getOutstandingTotal(auth.providerId)
    res.json({ data: outstanding })
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
    res.json({ data: customers, segments, count: customers.length })
  })

  router.get('/api/providers/:providerId/customers/:parentId', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const profile = await CrmService.getExtendedProfile(req.params.parentId, auth.providerId)
    if (!profile) return res.error(404, 'Kundenprofil nicht gefunden')
    res.json({ data: profile })
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
    const auth = await requireAuth(req, res)
    if (!auth) return
    const result = await BackgroundJobs.runDaily()
    res.json({ data: result })
  })

  router.post('/api/admin/jobs/weekly', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const result = await BackgroundJobs.runWeekly()
    res.json({ data: result })
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
    const session = await CourseBlockService.getSession(req.params.id)
    if (!session) return res.error(404, 'Session nicht gefunden')
    // Update the session date
    if (req.body.date) {
      ;(session as any).date = req.body.date
    }
    res.json({ data: session })
  })

  // --- Block Cancel / Update Status (PATCH) ---

  router.patch('/api/course-blocks/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const block = await CourseBlockService.getBlock(req.params.id)
    if (!block) return res.error(404, 'Block nicht gefunden')
    if (req.body.status) {
      ;(block as any).status = req.body.status
      // If cancelling, also cancel all future scheduled sessions
      if (req.body.status === 'cancelled') {
        const sessions = await CourseBlockService.getSessionsByBlock(req.params.id)
        const today = new Date().toISOString().slice(0, 10)
        for (const sess of sessions) {
          if (sess.status === 'scheduled' && sess.date >= today) {
            ;(sess as any).status = 'cancelled_by_provider'
          }
        }
      }
    }
    res.json({ data: block })
  })

  // --- Block Enrollments ---

  router.post('/api/course-blocks/:id/enroll', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
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
    // Only return public-safe fields
    const safe = activities.map((a: any) => ({
      id: a.id, title: a.title, description: a.description, category: a.category,
      ageRange: a.ageRange || { min: a.age_group_min, max: a.age_group_max },
      duration: a.duration || a.duration_minutes, schedule: a.schedule,
      pricing: a.pricing, status: a.status, color: a.color, images: a.images,
    }))
    res.json({ data: safe, count: safe.length })
  })

  // Public: Booking inquiry from embed widget (creates a lead/notification)
  router.post('/api/widget/booking-inquiry', async (req, res) => {
    const { slug, course, date, time, name, email, phone, message } = req.body as any
    if (!slug || !name || !email) return res.error(400, 'Name und E-Mail erforderlich')
    const provider = await ProviderService.getBySlug(slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    const db = getServiceClient()
    await db.from('booking_inquiries').insert({
      provider_id: provider.id,
      course_name: course || '',
      preferred_date: date || '',
      preferred_time: time || '',
      parent_name: name,
      parent_email: email,
      parent_phone: phone || '',
      message: message || '',
      status: 'new',
    }).then(() => {}).catch(() => {})
    res.json({ success: true })
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
  // OPENAPI SPEC
  // ============================================================

  router.get('/api/openapi.json', async (_req, res) => {
    const { openApiSpec } = await import('./openapi')
    res.json(openApiSpec)
  })
}
