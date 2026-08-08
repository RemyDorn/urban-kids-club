// ============================================================
// Parent-to-Parent Invite Routes — Mom-Graph / Schnupper-Empfehlung
// ============================================================
// Scaffold-Status: self-contained, KEINE Auth. Vor Go-Live:
//   - parentId aus Session statt aus Body/Path
//   - providerId aus activityId ableiten (nicht vom Client akzeptieren)
//   - Rate-Limiting per parentId
// ============================================================

import { Router } from '../router'
import { ParentInviteService } from '../../services/parent-invite.service'

export function registerParentInviteRoutes(router: Router) {

  // ----------------------------------------------------------
  // Parent A: neue Einladung erstellen
  // POST /api/parents/:parentId/share-invites
  // body: { activityId, providerId, expiryDays? }
  // ----------------------------------------------------------
  router.post('/api/parents/:parentId/share-invites', async (req, res) => {
    const parentId = req.params.parentId
    const { activityId, providerId, expiryDays } = (req.body ?? {}) as {
      activityId?: string
      providerId?: string
      expiryDays?: number
    }

    if (!activityId || !providerId) {
      return res.error(400, 'activityId und providerId sind erforderlich')
    }

    const invite = ParentInviteService.create({
      inviterId: parentId,
      activityId,
      providerId,
      expiryDays,
    })

    if ('error' in invite) return res.error(400, invite.error)

    const origin = process.env.APP_PUBLIC_URL || `https://${req.raw?.headers?.host || 'v2.urbankids.club'}`
    res.status(201).json({
      data: {
        ...invite,
        url: `${origin}/invite/${invite.code}`,
      },
    })
  })

  // ----------------------------------------------------------
  // Parent A: eigene Einladungen ansehen
  // GET /api/parents/:parentId/share-invites
  // ----------------------------------------------------------
  router.get('/api/parents/:parentId/share-invites', async (req, res) => {
    const invites = ParentInviteService.listByInviter(req.params.parentId)
    res.json({ data: invites })
  })

  // ----------------------------------------------------------
  // Parent A: Stats über eigene Einladungen
  // GET /api/parents/:parentId/share-invites/stats
  // ----------------------------------------------------------
  router.get('/api/parents/:parentId/share-invites/stats', async (req, res) => {
    const stats = ParentInviteService.getStatsForInviter(req.params.parentId)
    res.json({ data: stats })
  })

  // ----------------------------------------------------------
  // Parent A: Einladung zurückziehen
  // POST /api/parents/:parentId/share-invites/:id/cancel
  // ----------------------------------------------------------
  router.post('/api/parents/:parentId/share-invites/:id/cancel', async (req, res) => {
    const result = ParentInviteService.cancel(req.params.id, req.params.parentId)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  // ----------------------------------------------------------
  // Parent B: Code öffentlich auflösen (unauth, für Landing-Page)
  // GET /api/public/share-invites/:code
  // ----------------------------------------------------------
  router.get('/api/public/share-invites/:code', async (req, res) => {
    const result = ParentInviteService.resolveByCode(req.params.code)
    if ('error' in result) return res.error(404, result.error)

    // Öffentliche Ansicht — keine internen IDs / Status preisgeben, nur was Parent B braucht
    res.json({
      data: {
        code: result.code,
        activityId: result.activityId,
        providerId: result.providerId,
        expiresAt: result.expiresAt,
        expired: result.status === 'expired',
        alreadyUsed: result.status !== 'pending',
        // Coupon für erste zahlende Buchung — damit Landing-Page ihn anzeigen kann
        coupon: result.couponCode ? {
          code: result.couponCode,
          percentOff: result.couponPercentOff,
          maxEuroOff: result.couponMaxEuroOff,
          validUntil: result.couponValidUntil,
          used: Boolean(result.couponUsedAt),
        } : null,
      },
    })
  })

  // ----------------------------------------------------------
  // Public: Coupon validieren (Checkout)
  // POST /api/public/invite-coupons/validate
  // body: { code, bookingAmount }
  // ----------------------------------------------------------
  router.post('/api/public/invite-coupons/validate', async (req, res) => {
    const { code, bookingAmount } = (req.body ?? {}) as { code?: string; bookingAmount?: number }
    if (!code || !Number.isFinite(bookingAmount) || (bookingAmount as number) <= 0) {
      return res.error(400, 'code und bookingAmount (>0) sind erforderlich')
    }
    const result = ParentInviteService.validateCoupon(code, bookingAmount as number)
    res.json({ data: result })
  })

  // ----------------------------------------------------------
  // Public: Coupon einlösen (nach erfolgreichem Checkout)
  // POST /api/public/invite-coupons/redeem
  // body: { code, bookingId, discountEuro }
  // ----------------------------------------------------------
  router.post('/api/public/invite-coupons/redeem', async (req, res) => {
    const { code, bookingId, discountEuro } = (req.body ?? {}) as {
      code?: string
      bookingId?: string
      discountEuro?: number
    }
    if (!code || !bookingId || !Number.isFinite(discountEuro)) {
      return res.error(400, 'code, bookingId und discountEuro sind erforderlich')
    }
    const result = ParentInviteService.redeemCoupon(code, bookingId, discountEuro as number)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: { redeemed: true } })
  })

  // ----------------------------------------------------------
  // Parent B: Schnupperstunde buchen via Invite-Code
  // POST /api/public/share-invites/:code/book-trial
  // body: { inviteeParentId, childName, childBirthYear?, scheduledDate, scheduledTime, guestEmail?, guestName? }
  // ----------------------------------------------------------
  router.post('/api/public/share-invites/:code/book-trial', async (req, res) => {
    const code = req.params.code
    const body = (req.body ?? {}) as any

    if (!body.inviteeParentId || !body.childName || !body.scheduledDate || !body.scheduledTime) {
      return res.error(400, 'inviteeParentId, childName, scheduledDate und scheduledTime sind erforderlich')
    }

    const result = ParentInviteService.bookTrialFromInvite(code, {
      inviteeParentId: body.inviteeParentId,
      childName: body.childName,
      childBirthYear: body.childBirthYear,
      scheduledDate: body.scheduledDate,
      scheduledTime: body.scheduledTime,
      guestEmail: body.guestEmail,
      guestName: body.guestName,
    })

    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  // ----------------------------------------------------------
  // Admin/System: Conversion markieren (Trial → Buchung)
  // POST /api/admin/share-invites/:id/mark-converted
  // body: { bookingId, courseDurationWeeks }
  // ----------------------------------------------------------
  router.post('/api/admin/share-invites/:id/mark-converted', async (req, res) => {
    const { bookingId, courseDurationWeeks, paymentMethod } = (req.body ?? {}) as {
      bookingId?: string
      courseDurationWeeks?: number
      paymentMethod?: string
    }
    if (!bookingId) return res.error(400, 'bookingId ist erforderlich')
    if (!courseDurationWeeks || courseDurationWeeks <= 0) {
      return res.error(400, 'courseDurationWeeks (positive Zahl) ist erforderlich')
    }
    const validMethods = ['invoice', 'bank_transfer', 'paypal', 'credit_card', 'sepa_debit', 'cash', 'on_site']
    if (!paymentMethod || !validMethods.includes(paymentMethod)) {
      return res.error(400, `paymentMethod ist erforderlich (${validMethods.join('|')})`)
    }

    const result = ParentInviteService.markConverted(
      req.params.id,
      bookingId,
      courseDurationWeeks,
      paymentMethod as any
    )
    if ('error' in result) return res.error(400, result.error)
    const availableAt = ParentInviteService.getRewardAvailableAt(req.params.id)
    res.json({ data: { ...result, rewardAvailableAt: availableAt } })
  })

  // ----------------------------------------------------------
  // Provider: Affiliate-Config setzen (z.B. weeksPerCredit=4)
  // POST /api/providers/:providerId/affiliate-config
  // body: { weeksPerCredit?, minCredits?, maxCredits?, waitDays? }
  // ----------------------------------------------------------
  router.post('/api/providers/:providerId/affiliate-config', async (req, res) => {
    const { weeksPerCredit, minCredits, maxCredits, paymentMethodWaitDays, defaultWaitDays, excludedMethods } = (req.body ?? {}) as any
    const partial: any = {}
    if (typeof weeksPerCredit === 'number' && weeksPerCredit > 0) partial.weeksPerCredit = weeksPerCredit
    if (typeof minCredits === 'number' && minCredits >= 0) partial.minCredits = minCredits
    if (typeof maxCredits === 'number' && maxCredits > 0) partial.maxCredits = maxCredits
    if (typeof defaultWaitDays === 'number' && defaultWaitDays >= 0) partial.defaultWaitDays = defaultWaitDays
    if (paymentMethodWaitDays && typeof paymentMethodWaitDays === 'object') {
      // Merge mit bestehenden Werten
      const current = ParentInviteService.getAffiliateConfig(req.params.providerId).paymentMethodWaitDays
      partial.paymentMethodWaitDays = { ...current, ...paymentMethodWaitDays }
    }
    if (Array.isArray(excludedMethods)) partial.excludedMethods = excludedMethods

    if (Object.keys(partial).length === 0) return res.error(400, 'Mindestens ein Wert erforderlich')

    ParentInviteService.setAffiliateConfig(req.params.providerId, partial)
    res.json({ data: ParentInviteService.getAffiliateConfig(req.params.providerId) })
  })

  router.get('/api/providers/:providerId/affiliate-config', async (req, res) => {
    res.json({ data: ParentInviteService.getAffiliateConfig(req.params.providerId) })
  })

  // ----------------------------------------------------------
  // Admin / Cron: Reward-Eligibility-Liste
  // GET /api/admin/share-invites/pending-rewards
  // (täglicher Cron-Job iteriert und belohnt)
  // ----------------------------------------------------------
  router.get('/api/admin/share-invites/pending-rewards', async (_req, res) => {
    const eligible = ParentInviteService.listPendingEligibleForReward()
    res.json({
      data: eligible,
      count: eligible.length,
    })
  })

  // ----------------------------------------------------------
  // Admin / Cron: Reward-Cron ausführen (täglicher Job)
  // POST /api/admin/share-invites/run-reward-cron
  // ----------------------------------------------------------
  router.post('/api/admin/share-invites/run-reward-cron', async (req, res) => {
    // _bypassWait=true ist nur für lokale Tests/Demo — umgeht die 14-Tage-Wartefrist
    const bypass = String(req.query._bypassWait || '') === 'true'
    const report = ParentInviteService.runRewardCron(bypass)
    res.json({ data: report, _bypassWaitUsed: bypass })
  })

  // ----------------------------------------------------------
  // Admin: Expired-Sweep (Cron)
  // POST /api/admin/share-invites/sweep-expired
  // ----------------------------------------------------------
  router.post('/api/admin/share-invites/sweep-expired', async (_req, res) => {
    const count = ParentInviteService.sweepExpired()
    res.json({ data: { swept: count } })
  })
}
