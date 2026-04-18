// ============================================================
// Compliance Routes — Documents, Consent, Seasons, Holidays,
// Contracts, BuT Vouchers, Widgets, Coupons
// ============================================================

import { Router } from '../router'
import { validate, CreateDocumentSchema, CreateConsentSchema, CreateSeasonSchema, CreateHolidaySchema, CreateContractSchema, CreateBuTVoucherSchema, CreateWidgetSchema, CreateCouponSchema } from '../../lib/schemas'
import { requireAuth } from '../../lib/auth-middleware'
import { DocumentService, ConsentService, SeasonService, HolidayService, ContractService, BuTVoucherService, WidgetService, CouponService } from '../../services'

export function registerComplianceRoutes(router: Router) {

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
}
