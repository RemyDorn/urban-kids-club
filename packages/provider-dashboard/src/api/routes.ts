// ============================================================
// API Routes – REST Endpoints für das Provider Dashboard
// ============================================================

import { Router } from './router'
import { validate, CreateProviderSchema, UpdateProviderSchema, CreateActivitySchema, CreateBookingSchema, CreateParentSchema, UpdateParentSchema, CreateTeamMemberSchema, CreateInvoiceSchema, CreatePaymentSchema, CreateSepaMandateSchema, CreateCouponSchema, CreateTrialSchema, AddToWaitlistSchema, CreateConsentSchema, SendMessageSchema, CreateReviewSchema, CreateLocationSchema, CreateSeasonSchema, CreateHolidaySchema, CreateContractSchema, CreateBuTVoucherSchema, CreateDocumentSchema, CheckInSchema, GenerateEInvoiceSchema, CreateExportSchema, CreateWidgetSchema } from '../lib/schemas'
import { authenticate, authenticateProvider, authenticateAdmin } from '../lib/auth'
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

// --- Auth-Middleware (Platzhalter – in Produktion durch JWT/Session ersetzen) ---
// WICHTIG: Alle Endpoints sind aktuell NICHT authentifiziert!
// Vor Produktionsdeployment MUSS eine Auth-Middleware implementiert werden.
// z.B. JWT-Verifizierung, Session-Cookies, oder API-Keys.

function requireAuth(_req: import('./router').ParsedRequest, _res: import('./router').ApiResponse): boolean {
  // TODO: Implementiere Auth-Prüfung
  // const token = req.raw.headers.authorization?.replace('Bearer ', '')
  // if (!token) { res.error(401, 'Nicht authentifiziert'); return false }
  // const user = verifyToken(token)
  // if (!user) { res.error(401, 'Token ungültig'); return false }
  // req.userId = user.id
  return true
}

// --- Input-Validierung: parseInt mit NaN-Schutz ---
function safeParseInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

export function registerRoutes(router: Router) {

  // HINWEIS: Alle Endpoints benötigen Auth-Middleware vor Produktionsdeployment.
  // requireAuth() ist ein Platzhalter – gibt aktuell immer true zurück.

  // ============================================================
  // PROVIDERS
  // ============================================================

  router.get('/api/providers', (req, res) => {
    const providers = ProviderService.list({
      status: req.query.status as any,
      category: req.query.category,
    })
    res.json({ data: providers, count: providers.length })
  })

  router.get('/api/providers/:id', (req, res) => {
    const provider = ProviderService.getById(req.params.id)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    res.json({ data: provider })
  })

  router.get('/api/providers/slug/:slug', (req, res) => {
    const provider = ProviderService.getBySlug(req.params.slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    res.json({ data: provider })
  })

  router.post('/api/providers', async (req, res) => {
    const parsed = validate(CreateProviderSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const provider = ProviderService.create(parsed.data as any)
    res.status(201).json({ data: provider })
  })

  router.put('/api/providers/:id', async (req, res) => {
    const parsed = validate(UpdateProviderSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const provider = ProviderService.update(req.params.id, parsed.data as any)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    res.json({ data: provider })
  })

  router.post('/api/providers/:id/activate', (req, res) => {
    const provider = ProviderService.activate(req.params.id)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    res.json({ data: provider })
  })

  router.post('/api/providers/:id/change-plan', (req, res) => {
    const { plan } = req.body as { plan: string }
    const provider = ProviderService.changePlan(req.params.id, plan as any)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    res.json({ data: provider })
  })

  // ============================================================
  // LOCATIONS
  // ============================================================

  router.get('/api/providers/:providerId/locations', (req, res) => {
    const locations = LocationService.listByProvider(req.params.providerId)
    res.json({ data: locations })
  })

  router.post('/api/providers/:providerId/locations', async (req, res) => {
    const parsed = validate(CreateLocationSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const location = LocationService.create({ ...parsed.data as any, providerId: req.params.providerId })
    res.status(201).json({ data: location })
  })

  router.put('/api/locations/:id', (req, res) => {
    const location = LocationService.update(req.params.id, req.body as any)
    if (!location) return res.error(404, 'Standort nicht gefunden')
    res.json({ data: location })
  })

  // ============================================================
  // TEAM
  // ============================================================

  router.get('/api/providers/:providerId/team', (req, res) => {
    const members = TeamService.listByProvider(req.params.providerId, {
      role: req.query.role as any,
      active: req.query.active ? req.query.active === 'true' : undefined,
    })
    res.json({ data: members })
  })

  router.post('/api/providers/:providerId/team', async (req, res) => {
    const parsed = validate(CreateTeamMemberSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = TeamService.create({ ...parsed.data as any, providerId: req.params.providerId })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.put('/api/team/:id', (req, res) => {
    const member = TeamService.update(req.params.id, req.body as any)
    if (!member) return res.error(404, 'Teammitglied nicht gefunden')
    res.json({ data: member })
  })

  router.get('/api/team/:id/workload', (req, res) => {
    const workload = TeamService.getWorkload(req.params.id)
    res.json({ data: workload })
  })

  // ============================================================
  // ACTIVITIES
  // ============================================================

  router.get('/api/providers/:providerId/activities', (req, res) => {
    const activities = ActivityService.listByProvider(req.params.providerId)
    res.json({ data: activities, count: activities.length })
  })

  router.get('/api/activities/search', (req, res) => {
    const activities = ActivityService.search({
      category: req.query.category,
      ageMin: req.query.ageMin ? safeParseInt(req.query.ageMin, 0) : undefined,
      ageMax: req.query.ageMax ? safeParseInt(req.query.ageMax, 18) : undefined,
      providerId: req.query.providerId,
      status: req.query.status as any,
      query: req.query.q,
    })
    res.json({ data: activities, count: activities.length })
  })

  router.get('/api/activities/:id', (req, res) => {
    const activity = ActivityService.getById(req.params.id)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')
    const spots = ActivityService.getAvailableSpots(req.params.id)
    res.json({ data: { ...activity, availableSpots: spots } })
  })

  router.post('/api/activities', async (req, res) => {
    const parsed = validate(CreateActivitySchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const activity = ActivityService.create(parsed.data as any)
    res.status(201).json({ data: activity })
  })

  router.put('/api/activities/:id', (req, res) => {
    const activity = ActivityService.update(req.params.id, req.body as any)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')
    res.json({ data: activity })
  })

  router.post('/api/activities/:id/publish', (req, res) => {
    const result = ActivityService.publish(req.params.id)
    if (!result) return res.error(400, 'Aktivität konnte nicht veröffentlicht werden')
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.post('/api/activities/:id/duplicate', (req, res) => {
    const activity = ActivityService.duplicate(req.params.id)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')
    res.status(201).json({ data: activity })
  })

  router.post('/api/activities/:id/archive', (req, res) => {
    const activity = ActivityService.archive(req.params.id)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')
    res.json({ data: activity })
  })

  // ============================================================
  // BOOKINGS
  // ============================================================

  router.get('/api/providers/:providerId/bookings', (req, res) => {
    const bookings = BookingService.listByProvider(req.params.providerId, {
      status: req.query.status as any,
      paymentStatus: req.query.paymentStatus as any,
    })
    res.json({ data: bookings, count: bookings.length })
  })

  router.get('/api/activities/:activityId/bookings', (req, res) => {
    const bookings = BookingService.listByActivity(req.params.activityId)
    res.json({ data: bookings, count: bookings.length })
  })

  router.get('/api/parents/:parentId/bookings', (req, res) => {
    const bookings = BookingService.listByParent(req.params.parentId)
    res.json({ data: bookings })
  })

  router.post('/api/bookings', async (req, res) => {
    const parsed = validate(CreateBookingSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = BookingService.create(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/bookings/:id/cancel', (req, res) => {
    const booking = BookingService.cancel(req.params.id, req.body as any)
    if (!booking) return res.error(400, 'Buchung konnte nicht storniert werden')
    res.json({ data: booking })
  })

  router.post('/api/bookings/:id/complete', (req, res) => {
    const booking = BookingService.complete(req.params.id)
    if (!booking) return res.error(400, 'Buchung konnte nicht abgeschlossen werden')
    res.json({ data: booking })
  })

  router.post('/api/bookings/:id/pay', (req, res) => {
    const { amount } = req.body as { amount: number }
    const booking = BookingService.markPaid(req.params.id, amount)
    if (!booking) return res.error(404, 'Buchung nicht gefunden')
    res.json({ data: booking })
  })

  router.get('/api/providers/:providerId/bookings/stats', (req, res) => {
    const stats = BookingService.getStats(req.params.providerId)
    res.json({ data: stats })
  })

  // ============================================================
  // ATTENDANCE
  // ============================================================

  router.get('/api/activities/:activityId/attendance/:date', (req, res) => {
    const records = AttendanceService.getByActivityAndDate(req.params.activityId, req.params.date)
    res.json({ data: records })
  })

  router.post('/api/attendance/checkin', async (req, res) => {
    const parsed = validate(CheckInSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const { bookingId, activityId, date, checkedInBy } = parsed.data as any
    const result = AttendanceService.checkIn(bookingId, activityId, date, checkedInBy)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/attendance/absent', async (req, res) => {
    const parsed = validate(CheckInSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const { bookingId, activityId, date, note } = parsed.data as any
    const result = AttendanceService.markAbsent(bookingId, activityId, date, note)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.get('/api/activities/:activityId/attendance/rate', (req, res) => {
    const rate = AttendanceService.getAttendanceRate(req.params.activityId)
    res.json({ data: rate })
  })

  // ============================================================
  // PARENTS
  // ============================================================

  router.get('/api/parents', (req, res) => {
    const parents = ParentService.list({ query: req.query.q })
    res.json({ data: parents, count: parents.length })
  })

  router.get('/api/parents/:id', (req, res) => {
    const parent = ParentService.getById(req.params.id)
    if (!parent) return res.error(404, 'Elternteil nicht gefunden')
    res.json({ data: parent })
  })

  router.post('/api/parents', async (req, res) => {
    const parsed = validate(CreateParentSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = ParentService.create(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.put('/api/parents/:id', async (req, res) => {
    const parsed = validate(UpdateParentSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const parent = ParentService.update(req.params.id, parsed.data as any)
    if (!parent) return res.error(404, 'Elternteil nicht gefunden')
    res.json({ data: parent })
  })

  router.post('/api/parents/:id/children', (req, res) => {
    const parent = ParentService.addChild(req.params.id, req.body as any)
    if (!parent) return res.error(404, 'Elternteil nicht gefunden')
    res.json({ data: parent })
  })

  // ============================================================
  // REVIEWS
  // ============================================================

  router.get('/api/activities/:activityId/reviews', (req, res) => {
    const reviews = ReviewService.listByActivity(req.params.activityId)
    const avg = ReviewService.getAverageRating(req.params.activityId)
    res.json({ data: reviews, average: avg.average, count: avg.count })
  })

  router.get('/api/providers/:providerId/reviews', (req, res) => {
    const reviews = ReviewService.listByProvider(req.params.providerId)
    const rating = ReviewService.getProviderRating(req.params.providerId)
    const distribution = ReviewService.getRatingDistribution(req.params.providerId)
    res.json({ data: reviews, rating, distribution })
  })

  router.post('/api/reviews', async (req, res) => {
    const parsed = validate(CreateReviewSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = ReviewService.create(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  // ============================================================
  // MESSAGES
  // ============================================================

  router.get('/api/providers/:providerId/messages', (req, res) => {
    const messages = MessageService.getInbox(req.params.providerId, {
      unreadOnly: req.query.unread === 'true',
      type: req.query.type as any,
    })
    const unreadCount = MessageService.getUnreadCount(req.params.providerId)
    res.json({ data: messages, unreadCount })
  })

  router.get('/api/messages/conversation/:providerId/:parentId', (req, res) => {
    const messages = MessageService.getConversation(req.params.providerId, req.params.parentId)
    res.json({ data: messages })
  })

  router.post('/api/messages', async (req, res) => {
    const parsed = validate(SendMessageSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const message = MessageService.send(parsed.data as any)
    res.status(201).json({ data: message })
  })

  router.post('/api/messages/broadcast', (req, res) => {
    const { providerId, activityId, subject, body } = req.body as any
    const messages = MessageService.broadcast(providerId, activityId, subject, body)
    res.status(201).json({ data: messages, count: messages.length })
  })

  router.post('/api/messages/:id/read', (req, res) => {
    const message = MessageService.markAsRead(req.params.id)
    if (!message) return res.error(404, 'Nachricht nicht gefunden')
    res.json({ data: message })
  })

  // ============================================================
  // WAITLIST
  // ============================================================

  router.get('/api/activities/:activityId/waitlist', (req, res) => {
    const entries = WaitlistService.listByActivity(req.params.activityId)
    res.json({ data: entries, count: entries.length })
  })

  router.post('/api/waitlist', async (req, res) => {
    const parsed = validate(AddToWaitlistSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = WaitlistService.add(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/waitlist/:id/accept', (req, res) => {
    const { pricingOptionId } = req.body as { pricingOptionId: string }
    const result = WaitlistConversionWorkflow.acceptAndBook(req.params.id, pricingOptionId)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.post('/api/waitlist/:id/decline', (req, res) => {
    const entry = WaitlistService.decline(req.params.id)
    if (!entry) return res.error(400, 'Konnte nicht abgelehnt werden')
    res.json({ data: entry })
  })

  // ============================================================
  // COUPONS
  // ============================================================

  router.get('/api/providers/:providerId/coupons', (req, res) => {
    const coupons = CouponService.listByProvider(req.params.providerId, {
      active: req.query.active ? req.query.active === 'true' : undefined,
    })
    res.json({ data: coupons })
  })

  router.post('/api/coupons', async (req, res) => {
    const parsed = validate(CreateCouponSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = CouponService.create(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/coupons/validate', (req, res) => {
    const { code, activityId, amount } = req.body as any
    const result = CouponService.validate(code, activityId, amount)
    res.json({ data: result })
  })

  // ============================================================
  // CALENDAR
  // ============================================================

  router.get('/api/providers/:providerId/calendar', (req, res) => {
    const { start, end } = req.query
    if (!start || !end) return res.error(400, 'start und end Parameter erforderlich')
    const events = CalendarService.getByDateRange(req.params.providerId, start, end)
    const conflicts = CalendarService.detectConflictsInRange(req.params.providerId, start, end)
    res.json({ data: events, conflicts, count: events.length })
  })

  router.get('/api/providers/:providerId/calendar/ical', (req, res) => {
    const { start, end } = req.query
    if (!start || !end) return res.error(400, 'start und end Parameter erforderlich')
    const ical = CalendarService.generateICalFeed(req.params.providerId, start, end)
    res.json({ data: ical, contentType: 'text/calendar' })
  })

  router.post('/api/providers/:providerId/calendar/sync', (req, res) => {
    const events = CalendarService.syncActivitiesToCalendar(req.params.providerId)
    res.json({ data: events, count: events.length })
  })

  // ============================================================
  // TRIALS
  // ============================================================

  router.get('/api/providers/:providerId/trials', (req, res) => {
    const trials = TrialService.listByProvider(req.params.providerId, {
      status: req.query.status as any,
    })
    res.json({ data: trials })
  })

  router.post('/api/trials', async (req, res) => {
    const parsed = validate(CreateTrialSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = TrialService.create(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/trials/:id/complete', (req, res) => {
    const { feedback } = req.body as { feedback?: string }
    const trial = TrialService.complete(req.params.id, feedback)
    if (!trial) return res.error(400, 'Probestunde konnte nicht abgeschlossen werden')
    res.json({ data: trial })
  })

  router.post('/api/trials/:id/convert', (req, res) => {
    const { pricingOptionId } = req.body as { pricingOptionId: string }
    const result = TrialConversionWorkflow.convert(req.params.id, pricingOptionId)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.get('/api/providers/:providerId/trials/stats', (req, res) => {
    const stats = TrialService.getConversionStats(req.params.providerId)
    res.json({ data: stats })
  })

  // ============================================================
  // INVOICES
  // ============================================================

  router.get('/api/providers/:providerId/invoices', (req, res) => {
    const invoices = InvoiceService.listByProvider(req.params.providerId, {
      status: req.query.status as any,
    })
    res.json({ data: invoices })
  })

  router.post('/api/invoices', async (req, res) => {
    const parsed = validate(CreateInvoiceSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = InvoiceService.create(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/invoices/from-booking/:bookingId', (req, res) => {
    const { vatRate } = req.body as { vatRate?: number }
    const result = InvoiceService.createFromBooking(req.params.bookingId, vatRate)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/invoices/:id/send', (req, res) => {
    const invoice = InvoiceService.send(req.params.id)
    if (!invoice) return res.error(400, 'Rechnung konnte nicht versendet werden')
    res.json({ data: invoice })
  })

  router.post('/api/invoices/:id/pay', (req, res) => {
    const invoice = InvoiceService.markPaid(req.params.id)
    if (!invoice) return res.error(404, 'Rechnung nicht gefunden')
    res.json({ data: invoice })
  })

  router.get('/api/providers/:providerId/invoices/outstanding', (req, res) => {
    const outstanding = InvoiceService.getOutstandingTotal(req.params.providerId)
    res.json({ data: outstanding })
  })

  router.get('/api/providers/:providerId/invoices/vat-summary/:year', (req, res) => {
    const year = safeParseInt(req.params.year, new Date().getFullYear())
    const summary = InvoiceService.getVatSummary(req.params.providerId, year)
    res.json({ data: summary })
  })

  // ============================================================
  // E-INVOICES
  // ============================================================

  router.post('/api/einvoices/generate', async (req, res) => {
    const parsed = validate(GenerateEInvoiceSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = EInvoiceService.generate(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.get('/api/invoices/:invoiceId/einvoice', (req, res) => {
    const eInvoice = EInvoiceService.getByInvoice(req.params.invoiceId)
    if (!eInvoice) return res.error(404, 'Keine E-Rechnung vorhanden')
    res.json({ data: eInvoice })
  })

  // ============================================================
  // PAYMENTS & SEPA
  // ============================================================

  router.get('/api/providers/:providerId/payments', (req, res) => {
    const payments = PaymentService.listByProvider(req.params.providerId, {
      method: req.query.method as any,
      status: req.query.status,
    })
    res.json({ data: payments })
  })

  router.post('/api/payments', async (req, res) => {
    const parsed = validate(CreatePaymentSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = PaymentService.create(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/payments/:id/complete', (req, res) => {
    const payment = PaymentService.markCompleted(req.params.id)
    if (!payment) return res.error(400, 'Zahlung konnte nicht abgeschlossen werden')
    res.json({ data: payment })
  })

  router.get('/api/providers/:providerId/payments/summary', (req, res) => {
    const summary = PaymentService.getRevenueSummary(req.params.providerId)
    res.json({ data: summary })
  })

  router.post('/api/providers/:providerId/sepa/collect', (req, res) => {
    const payments = PaymentService.runSepaCollection(req.params.providerId)
    res.json({ data: payments, count: payments.length })
  })

  router.get('/api/providers/:providerId/sepa/mandates', (req, res) => {
    const mandates = SepaMandateService.listByProvider(req.params.providerId)
    res.json({ data: mandates })
  })

  router.post('/api/sepa/mandates', async (req, res) => {
    const parsed = validate(CreateSepaMandateSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const mandate = SepaMandateService.create(parsed.data as any)
    res.status(201).json({ data: mandate })
  })

  // ============================================================
  // DOCUMENTS & COMPLIANCE
  // ============================================================

  router.get('/api/providers/:providerId/documents', (req, res) => {
    const docs = DocumentService.listByProvider(req.params.providerId, {
      type: req.query.type as any,
      status: req.query.status as any,
    })
    res.json({ data: docs })
  })

  router.post('/api/documents', async (req, res) => {
    const parsed = validate(CreateDocumentSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const doc = DocumentService.create(parsed.data as any)
    res.status(201).json({ data: doc })
  })

  router.get('/api/providers/:providerId/compliance', (req, res) => {
    const status = DocumentService.getComplianceStatus(req.params.providerId)
    res.json({ data: status })
  })

  router.post('/api/consent', async (req, res) => {
    const parsed = validate(CreateConsentSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const consent = ConsentService.giveConsent(parsed.data as any)
    res.status(201).json({ data: consent })
  })

  router.get('/api/parents/:parentId/data-export', (req, res) => {
    const data = ConsentService.exportParentData(req.params.parentId)
    res.json({ data })
  })

  // ============================================================
  // SEASONS & HOLIDAYS
  // ============================================================

  router.get('/api/providers/:providerId/seasons', (req, res) => {
    const seasons = SeasonService.listByProvider(req.params.providerId)
    const current = SeasonService.getCurrentSeason(req.params.providerId)
    res.json({ data: seasons, currentSeason: current })
  })

  router.post('/api/seasons', async (req, res) => {
    const parsed = validate(CreateSeasonSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const season = SeasonService.create(parsed.data as any)
    res.status(201).json({ data: season })
  })

  router.get('/api/providers/:providerId/holidays', (req, res) => {
    const holidays = HolidayService.listByProvider(req.params.providerId)
    res.json({ data: holidays })
  })

  router.post('/api/holidays', async (req, res) => {
    const parsed = validate(CreateHolidaySchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const holiday = HolidayService.create(parsed.data as any)
    res.status(201).json({ data: holiday })
  })

  router.post('/api/providers/:providerId/holidays/import', (req, res) => {
    const { region } = req.body as { region?: string }
    const holidays = HolidayService.importGermanHolidays(req.params.providerId, region)
    res.status(201).json({ data: holidays, count: holidays.length })
  })

  router.get('/api/holidays/bundeslaender', (_req, res) => {
    const laender = HolidayService.getAvailableBundeslaender()
    res.json({ data: laender })
  })

  // ============================================================
  // CONTRACTS (Scheinselbständigkeit)
  // ============================================================

  router.get('/api/providers/:providerId/contracts', (req, res) => {
    const contracts = ContractService.listByProvider(req.params.providerId, {
      type: req.query.type as any,
      status: req.query.status as any,
    })
    res.json({ data: contracts })
  })

  router.post('/api/contracts', async (req, res) => {
    const parsed = validate(CreateContractSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const contract = ContractService.create(parsed.data as any)
    res.status(201).json({ data: contract })
  })

  router.get('/api/contracts/:id/risk', (req, res) => {
    const risk = ContractService.assessFreelanceRisk(req.params.id)
    res.json({ data: risk })
  })

  router.get('/api/providers/:providerId/contracts/risk-overview', (req, res) => {
    const overview = ContractService.getProviderRiskOverview(req.params.providerId)
    const deadline = ContractService.getTransitionDeadlineWarning()
    res.json({ data: overview, deadline })
  })

  // ============================================================
  // BuT VOUCHERS
  // ============================================================

  router.get('/api/providers/:providerId/but-vouchers', (req, res) => {
    const vouchers = BuTVoucherService.listByProvider(req.params.providerId, {
      status: req.query.status as any,
    })
    const stats = BuTVoucherService.getStats(req.params.providerId)
    res.json({ data: vouchers, stats })
  })

  router.post('/api/but-vouchers', async (req, res) => {
    const parsed = validate(CreateBuTVoucherSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const voucher = BuTVoucherService.create(parsed.data as any)
    res.status(201).json({ data: voucher })
  })

  // ============================================================
  // WIDGETS
  // ============================================================

  router.get('/api/providers/:providerId/widgets', (req, res) => {
    const widgets = WidgetService.listByProvider(req.params.providerId)
    res.json({ data: widgets })
  })

  router.post('/api/widgets', async (req, res) => {
    const parsed = validate(CreateWidgetSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const widget = WidgetService.create(parsed.data as any)
    res.status(201).json({ data: widget })
  })

  // ============================================================
  // CRM
  // ============================================================

  router.get('/api/providers/:providerId/customers', (req, res) => {
    const customers = CrmService.listCustomers(req.params.providerId, {
      tag: req.query.tag as any,
      minSpent: req.query.minSpent ? parseFloat(req.query.minSpent) : undefined,
      query: req.query.q,
    })
    const segments = CrmService.getSegments(req.params.providerId)
    res.json({ data: customers, segments, count: customers.length })
  })

  router.get('/api/providers/:providerId/customers/:parentId', (req, res) => {
    const profile = CrmService.getExtendedProfile(req.params.parentId, req.params.providerId)
    if (!profile) return res.error(404, 'Kundenprofil nicht gefunden')
    res.json({ data: profile })
  })

  router.post('/api/providers/:providerId/customers/:parentId/notes', (req, res) => {
    const { content, authorId } = req.body as { content: string; authorId: string }
    const note = CrmService.addNote({
      parentId: req.params.parentId,
      providerId: req.params.providerId,
      authorId,
      content,
    })
    res.status(201).json({ data: note })
  })

  // ============================================================
  // NOTIFICATIONS
  // ============================================================

  router.get('/api/notifications/:recipientId', (req, res) => {
    const notifications = NotificationService.getByRecipient(req.params.recipientId, {
      unread: req.query.unread === 'true',
      type: req.query.type as any,
    })
    const unreadCount = NotificationService.getUnreadCount(req.params.recipientId)
    res.json({ data: notifications, unreadCount })
  })

  router.post('/api/notifications/:id/read', (req, res) => {
    const notification = NotificationService.markAsRead(req.params.id)
    if (!notification) return res.error(404, 'Benachrichtigung nicht gefunden')
    res.json({ data: notification })
  })

  router.post('/api/notifications/:recipientId/read-all', (req, res) => {
    const count = NotificationService.markAllAsRead(req.params.recipientId)
    res.json({ data: { markedAsRead: count } })
  })

  // ============================================================
  // EXPORTS
  // ============================================================

  router.post('/api/providers/:providerId/export', async (req, res) => {
    const parsed = validate(CreateExportSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const { type, format, dateRange } = parsed.data as any
    const request = ExportService.createExport({
      providerId: req.params.providerId,
      type,
      format,
      dateRange,
    })
    res.json({ data: request })
  })

  // ============================================================
  // REPORTING
  // ============================================================

  router.get('/api/providers/:providerId/dashboard', (req, res) => {
    const summary = ReportingService.getDashboardSummary(req.params.providerId)
    res.json({ data: summary })
  })

  router.get('/api/providers/:providerId/reports/revenue/:period', (req, res) => {
    const report = ReportingService.getRevenueReport(req.params.providerId, req.params.period)
    res.json({ data: report })
  })

  router.get('/api/providers/:providerId/reports/occupancy', (req, res) => {
    const occupancy = ReportingService.getOccupancyByActivity(req.params.providerId)
    res.json({ data: occupancy })
  })

  router.get('/api/providers/:providerId/reports/clv', (req, res) => {
    const clv = ReportingService.getCustomerLifetimeValue(req.params.providerId)
    res.json({ data: clv })
  })

  router.get('/api/providers/:providerId/reports/churn', (req, res) => {
    const months = safeParseInt(req.query.months, 3)
    const churn = ReportingService.getChurnRate(req.params.providerId, months)
    res.json({ data: churn })
  })

  router.get('/api/providers/:providerId/reports/trials', (req, res) => {
    const trials = ReportingService.getTrialConversionByActivity(req.params.providerId)
    res.json({ data: trials })
  })

  router.get('/api/providers/:providerId/reports/staff', (req, res) => {
    const staff = ReportingService.getStaffUtilization(req.params.providerId)
    res.json({ data: staff })
  })

  // ============================================================
  // AUDIT LOG
  // ============================================================

  router.get('/api/providers/:providerId/audit', (req, res) => {
    const entries = AuditService.getByProvider(req.params.providerId, {
      action: req.query.action,
      entityType: req.query.entityType,
    })
    res.json({ data: entries })
  })

  router.get('/api/providers/:providerId/audit/recent', (req, res) => {
    const limit = safeParseInt(req.query.limit, 20)
    const entries = AuditService.getRecentActivity(req.params.providerId, limit)
    res.json({ data: entries })
  })

  // ============================================================
  // BACKGROUND JOBS (Admin-Trigger)
  // ============================================================

  router.post('/api/admin/jobs/daily', (_req, res) => {
    const result = BackgroundJobs.runDaily()
    res.json({ data: result })
  })

  router.post('/api/admin/jobs/weekly', (_req, res) => {
    const result = BackgroundJobs.runWeekly()
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
    const { email, password, providerId } = req.body as { email: string; password: string; providerId: string }
    if (!email || !password || !providerId) return res.error(400, 'E-Mail, Passwort und Provider-ID erforderlich')
    const { registerProvider } = await import('../lib/auth')
    const result = await registerProvider(email, password, providerId)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  // ============================================================
  // HEALTH CHECK
  // ============================================================

  // ============================================================
  // COURSE BLOCKS & GUTHABEN-SYSTEM
  // ============================================================

  // --- Course Blocks ---

  router.post('/api/course-blocks', async (req, res) => {
    if (!requireAuth(req, res)) return
    const result = CourseBlockService.createBlock(req.body)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.get('/api/course-blocks/:id', (req, res) => {
    const block = CourseBlockService.getBlock(req.params.id)
    if (!block) return res.error(404, 'Block nicht gefunden')
    res.json({ data: block })
  })

  router.get('/api/providers/:id/course-blocks', (req, res) => {
    const blocks = CourseBlockService.getBlocksByProvider(req.params.id)
    res.json({ data: blocks, count: blocks.length })
  })

  router.get('/api/course-blocks/by-type/:activityType', (req, res) => {
    const activeOnly = req.query.activeOnly === 'true'
    const blocks = CourseBlockService.getBlocksByActivityType(req.params.activityType, activeOnly)
    res.json({ data: blocks, count: blocks.length })
  })

  // --- Block Sessions ---

  router.get('/api/course-blocks/:id/sessions', (req, res) => {
    const sessions = CourseBlockService.getSessionsByBlock(req.params.id)
    res.json({ data: sessions, count: sessions.length })
  })

  router.get('/api/sessions/:id', (req, res) => {
    const session = CourseBlockService.getSession(req.params.id)
    if (!session) return res.error(404, 'Session nicht gefunden')
    res.json({ data: session })
  })

  router.post('/api/sessions/:id/cancel', async (req, res) => {
    if (!requireAuth(req, res)) return
    const result = CourseBlockService.cancelSession({
      sessionId: req.params.id,
      reason: req.body.reason,
      compensation: req.body.compensation,
      cancelledBy: req.body.cancelledBy ?? 'provider',
    })
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  // --- Block Enrollments ---

  router.post('/api/course-blocks/:id/enroll', async (req, res) => {
    if (!requireAuth(req, res)) return
    const result = CourseBlockService.enrollChild({
      blockId: req.params.id,
      ...req.body,
    })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.get('/api/course-blocks/:id/enrollments', (req, res) => {
    const enrollments = CourseBlockService.getEnrollmentsByBlock(req.params.id)
    res.json({ data: enrollments, count: enrollments.length })
  })

  router.get('/api/parents/:id/enrollments', (req, res) => {
    const enrollments = CourseBlockService.getEnrollmentsByParent(req.params.id)
    res.json({ data: enrollments, count: enrollments.length })
  })

  router.get('/api/children/:id/enrollments', (req, res) => {
    const enrollments = CourseBlockService.getEnrollmentsByChild(req.params.id)
    res.json({ data: enrollments, count: enrollments.length })
  })

  // --- Session Attendance ---

  router.get('/api/sessions/:id/attendance', (req, res) => {
    const attendance = CourseBlockService.getAttendanceBySession(req.params.id)
    res.json({ data: attendance, count: attendance.length })
  })

  router.post('/api/sessions/:id/mark-attendance', async (req, res) => {
    if (!requireAuth(req, res)) return
    const result = CourseBlockService.markAttendance(req.body.attendanceId, req.body.status)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  // --- Eltern-Absage (triggert Credit-Prüfung) ---

  router.post('/api/attendance/:id/cancel', async (req, res) => {
    if (!requireAuth(req, res)) return
    const result = SessionCreditService.handleParentCancellation(req.params.id)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  // --- Session Credits ---

  router.get('/api/children/:id/credits', (req, res) => {
    const status = req.query.status as any
    const credits = SessionCreditService.getCreditsByChild(req.params.id, status)
    res.json({ data: credits, count: credits.length })
  })

  router.get('/api/parents/:id/credits', (req, res) => {
    const status = req.query.status as any
    const credits = SessionCreditService.getCreditsByParent(req.params.id, status)
    res.json({ data: credits, count: credits.length })
  })

  router.get('/api/credits/:id', (req, res) => {
    const credit = SessionCreditService.getCredit(req.params.id)
    if (!credit) return res.error(404, 'Guthaben nicht gefunden')
    res.json({ data: credit })
  })

  // Verfügbare Nachhol-Slots für ein Guthaben
  router.get('/api/credits/:id/available-slots', (req, res) => {
    const credit = SessionCreditService.getCredit(req.params.id)
    if (!credit) return res.error(404, 'Guthaben nicht gefunden')
    if (credit.status !== 'available') return res.error(400, 'Guthaben ist nicht verfügbar')
    const slots = CourseBlockService.getAvailableMakeupSlots(
      credit.activityType,
      credit.validUntil,
      credit.blockId
    )
    res.json({ data: slots, count: slots.length })
  })

  // Manuell Credit ausstellen (Admin / Kulanz)
  router.post('/api/credits/manual', async (req, res) => {
    if (!requireAuth(req, res)) return
    const result = SessionCreditService.issueManualCredit(req.body)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  // --- Makeup Bookings ---

  router.post('/api/credits/:id/book-makeup', async (req, res) => {
    if (!requireAuth(req, res)) return
    const result = MakeupBookingService.bookMakeup({
      creditId: req.params.id,
      targetSessionId: req.body.targetSessionId,
      bookedBy: req.body.bookedBy ?? 'parent',
      overrideCapacity: req.body.overrideCapacity,
    })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.delete('/api/makeup-bookings/:id', async (req, res) => {
    if (!requireAuth(req, res)) return
    const cancelledBy = (req.query.cancelledBy as 'parent' | 'provider') ?? 'parent'
    const result = MakeupBookingService.cancelMakeup(req.params.id, cancelledBy)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.post('/api/makeup-bookings/:id/attendance', async (req, res) => {
    if (!requireAuth(req, res)) return
    const result = MakeupBookingService.markMakeupAttendance(req.params.id, req.body.status)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.get('/api/children/:id/makeup-bookings', (req, res) => {
    const makeups = MakeupBookingService.getMakeupsByChild(req.params.id)
    res.json({ data: makeups, count: makeups.length })
  })

  router.get('/api/parents/:id/makeup-bookings', (req, res) => {
    const makeups = MakeupBookingService.getMakeupsByParent(req.params.id)
    res.json({ data: makeups, count: makeups.length })
  })

  router.get('/api/makeup-bookings/:id', (req, res) => {
    const makeup = MakeupBookingService.getMakeup(req.params.id)
    if (!makeup) return res.error(404, 'Nachholtermin nicht gefunden')
    res.json({ data: makeup })
  })

  // --- Background Jobs (Cronjobs) ---

  router.post('/api/admin/blocks/update-statuses', async (req, res) => {
    if (!requireAuth(req, res)) return
    const result = CourseBlockService.updateBlockStatuses()
    res.json({ data: result })
  })

  router.post('/api/admin/credits/expire', async (req, res) => {
    if (!requireAuth(req, res)) return
    const expired = SessionCreditService.expireCredits()
    res.json({ data: { expired } })
  })

  router.post('/api/admin/credits/send-reminders', async (req, res) => {
    if (!requireAuth(req, res)) return
    const sent = SessionCreditService.sendExpiryReminders()
    res.json({ data: { sent } })
  })

  // --- Block Extension (Provider verlängert Block manuell) ---

  router.post('/api/course-blocks/:id/extend', async (req, res) => {
    if (!requireAuth(req, res)) return
    const additionalSessions = req.body.additionalSessions ?? 1
    const result = CourseBlockService.extendBlock(req.params.id, additionalSessions)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result, count: result.length })
  })

  // ============================================================
  // PUBLIC WIDGET ENDPOINTS (kein Auth – für Eltern-Widget auf Squarespace)
  // ============================================================
  // Diese Endpoints liefern angereicherte Daten für das eingebettete Widget.
  // Keine sensiblen Provider-Daten – nur öffentliche Kursinfos + elternbezogene Daten.

  // Öffentlich: Kursblöcke eines Providers mit Enrollment-Count + Activity-Titel
  router.get('/api/widget/providers/:slug/course-blocks', (req, res) => {
    const slug = req.params.slug
    // Provider by slug oder ID
    const { store: storeRef } = require('../domain/store')
    let providerId = slug
    for (const [id, provider] of storeRef.state.providers.entries()) {
      if (provider.slug === slug) { providerId = id; break }
    }

    const blocks = CourseBlockService.getBlocksByProvider(providerId)
    const enriched = blocks.map((block: any) => {
      // Activity-Titel holen
      const activity = storeRef.state.activities.get(block.activityId)
      // Enrollment-Count berechnen
      const enrollmentIds = storeRef.getFromIndex(storeRef.indexes.enrollmentsByBlock, block.id)
      const enrollmentCount = Array.from(enrollmentIds as Set<string>).filter(eId => {
        const enr = storeRef.state.blockEnrollments.get(eId)
        return enr && enr.status === 'active'
      }).length

      return {
        ...block,
        _activityTitle: activity?.title ?? block.activityType,
        _enrollmentCount: enrollmentCount,
      }
    })

    res.json({ data: enriched, count: enriched.length })
  })

  // Eltern: Enrollments mit Block-Info
  router.get('/api/widget/enrollments/parent/:parentId', (req, res) => {
    const enrollments = CourseBlockService.getEnrollmentsByParent(req.params.parentId)
    res.json({ data: enrollments, count: enrollments.length })
  })

  // Eltern: Credits
  router.get('/api/widget/credits/parent/:parentId', (req, res) => {
    const credits = SessionCreditService.getCreditsByParent(req.params.parentId)
    res.json({ data: credits, count: credits.length })
  })

  // Eltern: Makeup-Bookings mit Session-Infos angereichert
  router.get('/api/widget/makeup-bookings/parent/:parentId', (req, res) => {
    const makeups = MakeupBookingService.getMakeupsByParent(req.params.parentId)
    const { store: storeRef } = require('../domain/store')

    const enriched = makeups.map((m: any) => {
      const session = storeRef.state.blockSessions.get(m.targetSessionId)
      return {
        ...m,
        _targetDate: session?.date ?? '',
        _targetTime: session?.startTime ?? '',
      }
    })

    res.json({ data: enriched, count: enriched.length })
  })

  // Eltern: Verfügbare Makeup-Slots (mit Block-Label angereichert)
  router.get('/api/widget/credits/:id/available-slots', (req, res) => {
    const credit = SessionCreditService.getCredit(req.params.id)
    if (!credit) return res.error(404, 'Guthaben nicht gefunden')
    if (credit.status !== 'available') return res.error(400, 'Guthaben ist nicht verfügbar')

    const slots = CourseBlockService.getAvailableMakeupSlots(
      credit.activityType,
      credit.validUntil,
      credit.blockId
    )

    // Block-Label anreichern
    const { store: storeRef } = require('../domain/store')
    const enriched = slots.map((slot: any) => {
      const block = storeRef.state.courseBlocks.get(slot.blockId)
      const activity = block ? storeRef.state.activities.get(block.activityId) : null
      return {
        ...slot,
        blockLabel: `${activity?.title ?? block?.activityType ?? ''} – ${block?.seasonLabel ?? ''}`,
      }
    })

    res.json({ data: enriched, count: enriched.length })
  })

  // ============================================================
  // OPENAPI SPEC
  // ============================================================

  router.get('/api/openapi.json', async (_req, res) => {
    const { openApiSpec } = await import('./openapi')
    res.json(openApiSpec)
  })


  // ============================================================
  // HEALTH CHECK
  // ============================================================

  router.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      store: {
        providers: store.state.providers.size,
        activities: store.state.activities.size,
        bookings: store.state.bookings.size,
        parents: store.state.parents.size,
      },
    })
  })
}

// Import store for health check
import { store } from '../domain/store'
