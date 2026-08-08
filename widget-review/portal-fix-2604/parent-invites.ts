// ============================================================
// Parent-to-Parent Invite Routes — Mom-Graph / Schnupper-Empfehlung
// ============================================================
// Scaffold-Status: self-contained, KEINE Auth. Vor Go-Live:
//   - parentId aus Session statt aus Body/Path
//   - providerId aus activityId ableiten (nicht vom Client akzeptieren)
//   - Rate-Limiting per parentId
// ============================================================

import { Router } from '../router'
import { ParentInviteService as MemParentInviteService } from '../../services/parent-invite.service'
import { SupabaseParentInviteService } from '../../services/supabase/parent-invite.service'
import { requireAuth } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'

// Demo-/Fallback-IDs (z.B. 'parent-anna-demo' aus portal.html) sind keine UUIDs und würden
// Supabase-Queries mit `invalid input syntax for type uuid` crashen lassen.
// Statt 500 geben wir leere Daten zurück, damit Mom-Graph-Demo & nicht-eingeloggte Portal-Sessions
// einen sauberen Empty-State sehen.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(s: string | undefined | null): boolean {
  return !!s && UUID_RE.test(String(s))
}

// Runtime-Switch: USE_SUPABASE_PARENT_INVITES=true schaltet auf Persistenz.
// Default = In-Memory-Scaffold (entwickler-/demo-freundlich).
const ParentInviteService: any = process.env.USE_SUPABASE_PARENT_INVITES === 'true'
  ? SupabaseParentInviteService
  : MemParentInviteService

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

    const invite = await ParentInviteService.create({
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
    if (!isUuid(req.params.parentId)) return res.json({ data: [] })
    const invites = await ParentInviteService.listByInviter(req.params.parentId)
    res.json({ data: invites })
  })

  // ----------------------------------------------------------
  // Parent A: Stats über eigene Einladungen
  // GET /api/parents/:parentId/share-invites/stats
  // ----------------------------------------------------------
  router.get('/api/parents/:parentId/share-invites/stats', async (req, res) => {
    if (!isUuid(req.params.parentId)) return res.json({ data: { total: 0, pending: 0, trial_booked: 0, converted: 0, rewarded: 0, expired: 0 } })
    const stats = await ParentInviteService.getStatsForInviter(req.params.parentId)
    res.json({ data: stats })
  })

  // ----------------------------------------------------------
  // Parent A: Einladung zurückziehen
  // POST /api/parents/:parentId/share-invites/:id/cancel
  // ----------------------------------------------------------
  router.post('/api/parents/:parentId/share-invites/:id/cancel', async (req, res) => {
    const result = await ParentInviteService.cancel(req.params.id, req.params.parentId)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  // ----------------------------------------------------------
  // Parent B: Code öffentlich auflösen (unauth, für Landing-Page)
  // GET /api/public/share-invites/:code
  // ----------------------------------------------------------
  router.get('/api/public/share-invites/:code', async (req, res) => {
    const result = await ParentInviteService.resolveByCode(req.params.code)
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
    const result = await ParentInviteService.validateCoupon(code, bookingAmount as number)
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
    const result = await ParentInviteService.redeemCoupon(code, bookingId, discountEuro as number)
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

    const result = await ParentInviteService.bookTrialFromInvite(code, {
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

    const result = await ParentInviteService.markConverted(
      req.params.id,
      bookingId,
      courseDurationWeeks,
      paymentMethod as any
    )
    if ('error' in result) return res.error(400, result.error)
    const availableAt = await ParentInviteService.getRewardAvailableAt(req.params.id)
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
      const current = await ParentInviteService.getAffiliateConfig(req.params.providerId).paymentMethodWaitDays
      partial.paymentMethodWaitDays = { ...current, ...paymentMethodWaitDays }
    }
    if (Array.isArray(excludedMethods)) partial.excludedMethods = excludedMethods

    if (Object.keys(partial).length === 0) return res.error(400, 'Mindestens ein Wert erforderlich')

    await ParentInviteService.setAffiliateConfig(req.params.providerId, partial)
    res.json({ data: await ParentInviteService.getAffiliateConfig(req.params.providerId) })
  })

  router.get('/api/providers/:providerId/affiliate-config', async (req, res) => {
    res.json({ data: await ParentInviteService.getAffiliateConfig(req.params.providerId) })
  })

  // ----------------------------------------------------------
  // Admin / Cron: Reward-Eligibility-Liste
  // GET /api/admin/share-invites/pending-rewards
  // (täglicher Cron-Job iteriert und belohnt)
  // ----------------------------------------------------------
  router.get('/api/admin/share-invites/pending-rewards', async (_req, res) => {
    const eligible = await ParentInviteService.listPendingEligibleForReward()
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
    const report = await ParentInviteService.runRewardCron(bypass)
    res.json({ data: report, _bypassWaitUsed: bypass })
  })

  // ----------------------------------------------------------
  // Admin: Expired-Sweep (Cron)
  // POST /api/admin/share-invites/sweep-expired
  // ----------------------------------------------------------
  router.post('/api/admin/share-invites/sweep-expired', async (_req, res) => {
    const count = await ParentInviteService.sweepExpired()
    res.json({ data: { swept: count } })
  })

  // ----------------------------------------------------------
  // PROVIDER: Mom-Graph Dashboard (Funnel + KPIs + Leaderboard + Aktivität)
  // GET /api/providers/:providerId/mom-graph/dashboard
  // ----------------------------------------------------------
  router.get('/api/providers/:providerId/mom-graph/dashboard', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const providerId = req.params.providerId
    if (auth.providerId !== providerId) return res.error(403, 'Falscher Provider')

    const sb = getServiceClient()

    // 1. Funnel-Aggregation aus parent_invite_stats view
    const { data: statsRow } = await sb.from('parent_invite_stats')
      .select('*').eq('provider_id', providerId).maybeSingle()
    const s = statsRow || {
      pending_count: 0, trial_booked_count: 0, converted_count: 0,
      rewarded_count: 0, total_count: 0,
      total_credits_issued: 0, total_coupon_discount_euro: 0,
    }
    const sent = Number(s.total_count || 0)
    const trialBooked = Number(s.trial_booked_count || 0) + Number(s.converted_count || 0) + Number(s.rewarded_count || 0)
    const converted = Number(s.converted_count || 0) + Number(s.rewarded_count || 0)
    const creditsIssued = Number(s.total_credits_issued || 0)

    // 2. Leaderboard — alle Inviter mit Aggregation
    const { data: invites } = await sb.from('parent_invites')
      .select('inviter_id, status, reward_credits')
      .eq('provider_id', providerId)

    const inviterMap = new Map<string, { invited: number; trial: number; converted: number; credits: number }>()
    for (const inv of invites || []) {
      if (!inv.inviter_id) continue
      const m = inviterMap.get(inv.inviter_id) || { invited: 0, trial: 0, converted: 0, credits: 0 }
      m.invited++
      if (inv.status === 'trial_booked' || inv.status === 'converted' || inv.status === 'rewarded') m.trial++
      if (inv.status === 'converted' || inv.status === 'rewarded') m.converted++
      if (inv.status === 'rewarded') m.credits += Number(inv.reward_credits || 0)
      inviterMap.set(inv.inviter_id, m)
    }
    const inviterIds = [...inviterMap.keys()]
    const { data: lbParents } = inviterIds.length
      ? await sb.from('parents').select('id, name, email').in('id', inviterIds)
      : { data: [] }
    const lbParentMap = new Map((lbParents ?? []).map((p: any) => [p.id, p]))
    const leaderboard = [...inviterMap.entries()]
      .map(([id, m]) => {
        const p: any = lbParentMap.get(id)
        const name = p?.name || 'Eltern'
        return {
          parentId: id,
          name,
          email: p?.email || '',
          initial: (name[0] || 'E').toUpperCase(),
          invited: m.invited,
          converted: m.converted,
          kFactor: m.invited > 0 ? Math.round((m.converted / m.invited) * 10) / 10 : 0,
          credits: m.credits,
        }
      })
      .sort((a, b) => b.credits - a.credits || b.converted - a.converted || b.invited - a.invited)
      .slice(0, 8)

    // 3. Aktivitäts-Feed (Status-Übergänge der letzten 30 Invites)
    const { data: recent } = await sb.from('parent_invites')
      .select('id, code, status, created_at, trial_booked_at, converted_at, rewarded_at, reward_credits, course_duration_weeks, inviter_id, invitee_parent_id, activity_id')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .limit(30)
    const events: any[] = []
    for (const r of recent || []) {
      if (r.created_at) events.push({ type: 'invite_sent', at: r.created_at, inviterId: r.inviter_id, inviteId: r.id })
      if (r.trial_booked_at) events.push({ type: 'trial_booked', at: r.trial_booked_at, inviterId: r.inviter_id, inviteeId: r.invitee_parent_id, inviteId: r.id })
      if (r.converted_at) events.push({ type: 'converted', at: r.converted_at, inviterId: r.inviter_id, inviteeId: r.invitee_parent_id, inviteId: r.id, weeks: r.course_duration_weeks })
      if (r.rewarded_at) events.push({ type: 'rewarded', at: r.rewarded_at, inviterId: r.inviter_id, inviteId: r.id, credits: r.reward_credits })
    }
    events.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
    const activityRecent = events.slice(0, 10)
    const actParentIds = [...new Set(activityRecent.flatMap((e: any) => [e.inviterId, e.inviteeId]).filter(Boolean))] as string[]
    const { data: actParents } = actParentIds.length
      ? await sb.from('parents').select('id, name').in('id', actParentIds)
      : { data: [] }
    const actParentMap = new Map((actParents ?? []).map((p: any) => [p.id, p.name || 'Eltern']))
    const activity = activityRecent.map((e: any) => ({
      ...e,
      inviterName: e.inviterId ? actParentMap.get(e.inviterId) : null,
      inviteeName: e.inviteeId ? actParentMap.get(e.inviteeId) : null,
    }))

    // 4. KPIs
    const distinctInviters = inviterMap.size
    const viralKFactor = distinctInviters > 0 ? Math.round((converted / distinctInviters) * 10) / 10 : 0
    const cacSavings = converted * 20  // 20€ angenommener CAC pro Kunde

    res.json({
      data: {
        funnel: { sent, trial_booked: trialBooked, converted, credits_issued: creditsIssued },
        kpis: {
          viral_k_factor: viralKFactor,
          new_via_momgraph: converted,
          credits_open: Number(s.converted_count || 0),
          credits_cac_savings_euro: cacSavings,
        },
        leaderboard,
        activity,
      },
    })
  })
}
