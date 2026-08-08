// ============================================================
// Supabase-backed ParentInviteService
// ============================================================
// Implementiert das gleiche Interface wie der In-Memory-Scaffold,
// schreibt aber in die parent_invites + affiliate_configs Tabellen.
//
// Aktivierung: USE_SUPABASE=true in der Umgebung
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import type { ID } from '../../types'
import type {
  ParentInvite,
  ParentInviteStatus,
  PaymentMethod,
  AffiliateConfig,
} from '../parent-invite.service'

const TABLE = 'parent_invites'
const CFG_TABLE = 'affiliate_configs'

const DEFAULT_CFG: AffiliateConfig = {
  weeksPerCredit: 4,
  minCredits: 1,
  maxCredits: 5,
  paymentMethodWaitDays: {
    invoice: 0, bank_transfer: 0, paypal: 0,
    credit_card: 14, sepa_debit: 14, cash: 0, on_site: 0,
  },
  defaultWaitDays: 14,
  excludedMethods: [],
  autoCouponEnabled: true,
  autoCouponPercentOff: 10,
  autoCouponMaxEuroOff: 20,
  autoCouponValidDays: 60,
}

// ------------------------------------------------------------
// Row ↔ Domain Mappers
// ------------------------------------------------------------
function fromRow(r: any): ParentInvite {
  return {
    id: r.id,
    code: r.code,
    inviterId: r.inviter_id,
    activityId: r.activity_id,
    providerId: r.provider_id,
    createdAt: new Date(r.created_at),
    expiresAt: new Date(r.expires_at),
    status: r.status,
    inviteeTrialId: r.invitee_trial_id ?? undefined,
    inviteeParentId: r.invitee_parent_id ?? undefined,
    trialBookedAt: r.trial_booked_at ? new Date(r.trial_booked_at) : undefined,
    inviteeBookingId: r.invitee_booking_id ?? undefined,
    convertedAt: r.converted_at ? new Date(r.converted_at) : undefined,
    courseDurationWeeks: r.course_duration_weeks ?? undefined,
    paymentMethod: r.payment_method ?? undefined,
    rewardCredits: r.reward_credits ?? undefined,
    rewardedAt: r.rewarded_at ? new Date(r.rewarded_at) : undefined,
    rewardSkippedReason: r.reward_skipped_reason ?? undefined,
    viewCount: r.view_count ?? 0,
    lastViewedAt: r.last_viewed_at ? new Date(r.last_viewed_at) : undefined,
    couponCode: r.coupon_code ?? undefined,
    couponPercentOff: r.coupon_percent_off ?? undefined,
    couponMaxEuroOff: r.coupon_max_euro_off ?? undefined,
    couponValidUntil: r.coupon_valid_until ? new Date(r.coupon_valid_until) : undefined,
    couponUsedAt: r.coupon_used_at ? new Date(r.coupon_used_at) : undefined,
    couponUsedOnBookingId: r.coupon_used_on_booking_id ?? undefined,
    couponDiscountEuro: r.coupon_discount_euro ?? undefined,
  }
}

function cfgFromRow(r: any): AffiliateConfig {
  return {
    weeksPerCredit: r.weeks_per_credit,
    minCredits: r.min_credits,
    maxCredits: r.max_credits,
    paymentMethodWaitDays: r.payment_method_wait_days,
    defaultWaitDays: r.default_wait_days,
    excludedMethods: r.excluded_methods ?? [],
    autoCouponEnabled: r.auto_coupon_enabled,
    autoCouponPercentOff: r.auto_coupon_percent_off,
    autoCouponMaxEuroOff: r.auto_coupon_max_euro_off,
    autoCouponValidDays: r.auto_coupon_valid_days,
  }
}

function generateCode(): string {
  const abc = '23456789abcdefghjkmnpqrstuvwxyz'
  let c = ''
  for (let i = 0; i < 8; i++) c += abc[Math.floor(Math.random() * abc.length)]
  return c
}

function generateCouponCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = (n: number) => Array.from({ length: n }, () => abc[Math.floor(Math.random() * abc.length)]).join('')
  return `MOM-${pick(4)}-${pick(2)}`
}

// ============================================================
// Service
// ============================================================
export const SupabaseParentInviteService = {

  async getAffiliateConfig(providerId: ID): Promise<AffiliateConfig> {
    const sb = getServiceClient()
    const { data } = await sb.from(CFG_TABLE).select('*').eq('provider_id', providerId).maybeSingle()
    return data ? cfgFromRow(data) : DEFAULT_CFG
  },

  async setAffiliateConfig(providerId: ID, partial: Partial<AffiliateConfig>): Promise<AffiliateConfig> {
    const sb = getServiceClient()
    const row: any = { provider_id: providerId, updated_at: new Date().toISOString() }
    if (partial.weeksPerCredit !== undefined) row.weeks_per_credit = partial.weeksPerCredit
    if (partial.minCredits !== undefined) row.min_credits = partial.minCredits
    if (partial.maxCredits !== undefined) row.max_credits = partial.maxCredits
    if (partial.paymentMethodWaitDays) row.payment_method_wait_days = partial.paymentMethodWaitDays
    if (partial.defaultWaitDays !== undefined) row.default_wait_days = partial.defaultWaitDays
    if (partial.excludedMethods) row.excluded_methods = partial.excludedMethods
    if (partial.autoCouponEnabled !== undefined) row.auto_coupon_enabled = partial.autoCouponEnabled
    if (partial.autoCouponPercentOff !== undefined) row.auto_coupon_percent_off = partial.autoCouponPercentOff
    if (partial.autoCouponMaxEuroOff !== undefined) row.auto_coupon_max_euro_off = partial.autoCouponMaxEuroOff
    if (partial.autoCouponValidDays !== undefined) row.auto_coupon_valid_days = partial.autoCouponValidDays

    const { data, error } = await sb.from(CFG_TABLE).upsert(row, { onConflict: 'provider_id' }).select().single()
    if (error) throw error
    return cfgFromRow(data)
  },

  async create(input: { inviterId: ID; activityId: ID; providerId: ID; expiryDays?: number }): Promise<ParentInvite | { error: string }> {
    const sb = getServiceClient()
    const cfg = await this.getAffiliateConfig(input.providerId)
    const now = new Date()
    const expires = new Date(now.getTime() + (input.expiryDays ?? 30) * 864e5)

    // Code mit Retry auf Kollision
    let code = generateCode()
    for (let i = 0; i < 5; i++) {
      const { data } = await sb.from(TABLE).select('id').eq('code', code).maybeSingle()
      if (!data) break
      code = generateCode()
    }

    const row: any = {
      inviter_id: input.inviterId,
      activity_id: input.activityId,
      provider_id: input.providerId,
      code,
      expires_at: expires.toISOString(),
      status: 'pending',
      view_count: 0,
    }

    if (cfg.autoCouponEnabled) {
      let couponCode = generateCouponCode()
      for (let i = 0; i < 5; i++) {
        const { data } = await sb.from(TABLE).select('id').eq('coupon_code', couponCode).maybeSingle()
        if (!data) break
        couponCode = generateCouponCode()
      }
      row.coupon_code = couponCode
      row.coupon_percent_off = cfg.autoCouponPercentOff
      row.coupon_max_euro_off = cfg.autoCouponMaxEuroOff
      row.coupon_valid_until = new Date(now.getTime() + cfg.autoCouponValidDays * 864e5).toISOString()
    }

    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) return { error: error.message }
    return fromRow(data)
  },

  async resolveByCode(code: string): Promise<ParentInvite | { error: string }> {
    const sb = getServiceClient()
    // Lookup + Expiry-Check + View-Count-Bump in einem Round-Trip
    const { data: existing } = await sb.from(TABLE).select('*').eq('code', code).maybeSingle()
    if (!existing) return { error: 'Einladung nicht gefunden' }

    const now = new Date()
    let status = existing.status
    if (status === 'pending' && new Date(existing.expires_at) < now) {
      status = 'expired'
    }
    if (status === 'expired') return { error: 'Einladung abgelaufen' }
    if (status === 'cancelled') return { error: 'Einladung zurückgezogen' }

    const { data, error } = await sb.from(TABLE)
      .update({
        view_count: (existing.view_count ?? 0) + 1,
        last_viewed_at: now.toISOString(),
        ...(status !== existing.status ? { status } : {}),
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return { error: error.message }
    return fromRow(data)
  },

  async linkTrial(code: string, trialId: ID, inviteeParentId: ID): Promise<ParentInvite | { error: string }> {
    const sb = getServiceClient()
    const { data: existing } = await sb.from(TABLE).select('*').eq('code', code).maybeSingle()
    if (!existing) return { error: 'Einladung nicht gefunden' }
    if (existing.status !== 'pending') {
      return { error: `Einladung ist im Status "${existing.status}" und kann nicht mehr verknüpft werden` }
    }
    const { data, error } = await sb.from(TABLE)
      .update({
        status: 'trial_booked',
        invitee_trial_id: trialId,
        invitee_parent_id: inviteeParentId,
        trial_booked_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select().single()
    if (error) return { error: error.message }
    return fromRow(data)
  },

  async markConverted(inviteId: ID, bookingId: ID, courseDurationWeeks: number, paymentMethod: PaymentMethod): Promise<ParentInvite | { error: string }> {
    const sb = getServiceClient()
    const { data: existing } = await sb.from(TABLE).select('status').eq('id', inviteId).maybeSingle()
    if (!existing) return { error: 'Einladung nicht gefunden' }
    if (existing.status !== 'trial_booked') {
      return { error: `Einladung ist nicht im Status "trial_booked" (aktuell: ${existing.status})` }
    }
    const { data, error } = await sb.from(TABLE)
      .update({
        status: 'converted',
        invitee_booking_id: bookingId,
        converted_at: new Date().toISOString(),
        course_duration_weeks: courseDurationWeeks,
        payment_method: paymentMethod,
      })
      .eq('id', inviteId)
      .select().single()
    if (error) return { error: error.message }
    return fromRow(data)
  },

  async markRewarded(inviteId: ID, override?: { credits?: number; bypassWait?: boolean }): Promise<ParentInvite | { error: string }> {
    const sb = getServiceClient()
    const { data: existing } = await sb.from(TABLE).select('*').eq('id', inviteId).maybeSingle()
    if (!existing) return { error: 'Einladung nicht gefunden' }
    if (existing.status !== 'converted') return { error: 'Invite ist nicht im Status "converted"' }

    const cfg = await this.getAffiliateConfig(existing.provider_id)
    const bypass = override?.bypassWait ?? false

    // Wartefrist check
    if (!bypass) {
      const waitDays = existing.payment_method
        ? cfg.paymentMethodWaitDays[existing.payment_method as PaymentMethod] ?? cfg.defaultWaitDays
        : cfg.defaultWaitDays
      const earliest = new Date(new Date(existing.converted_at).getTime() + waitDays * 864e5)
      if (new Date() < earliest) return { error: 'Wartefrist noch nicht abgelaufen' }
    }

    // Attribution-Once: schon belohnt für diesen Invitee?
    if (existing.invitee_parent_id) {
      const { data: already } = await sb.from(TABLE).select('id')
        .eq('invitee_parent_id', existing.invitee_parent_id)
        .eq('status', 'rewarded')
        .limit(1)
      if (already && already.length > 0) {
        const { data, error } = await sb.from(TABLE).update({
          status: 'rewarded',
          reward_credits: 0,
          rewarded_at: new Date().toISOString(),
          reward_skipped_reason: 'already_rewarded_for_parent',
        }).eq('id', inviteId).select().single()
        if (error) return { error: error.message }
        return fromRow(data)
      }

      // Anti-Circle: Schon als Inviter ODER Invitee VOR dieser Einladung aktiv?
      const { data: circle } = await sb.from(TABLE).select('id')
        .or(`inviter_id.eq.${existing.invitee_parent_id},invitee_parent_id.eq.${existing.invitee_parent_id}`)
        .lt('created_at', existing.created_at)
        .neq('id', inviteId)
        .limit(1)
      if (circle && circle.length > 0) {
        const { data, error } = await sb.from(TABLE).update({
          status: 'rewarded',
          reward_credits: 0,
          rewarded_at: new Date().toISOString(),
          reward_skipped_reason: 'invitee_already_on_platform',
        }).eq('id', inviteId).select().single()
        if (error) return { error: error.message }
        return fromRow(data)
      }
    }

    // Credit-Berechnung
    const duration = existing.course_duration_weeks ?? 0
    const raw = Math.floor(duration / cfg.weeksPerCredit)
    const credits = override?.credits ?? Math.max(cfg.minCredits, Math.min(cfg.maxCredits, raw))

    const { data, error } = await sb.from(TABLE).update({
      status: 'rewarded',
      reward_credits: credits,
      rewarded_at: new Date().toISOString(),
    }).eq('id', inviteId).select().single()
    if (error) return { error: error.message }
    return fromRow(data)
  },

  async cancel(inviteId: ID, inviterId: ID): Promise<ParentInvite | { error: string }> {
    const sb = getServiceClient()
    const { data: existing } = await sb.from(TABLE).select('inviter_id, status').eq('id', inviteId).maybeSingle()
    if (!existing) return { error: 'Einladung nicht gefunden' }
    if (existing.inviter_id !== inviterId) return { error: 'Nicht berechtigt' }
    if (existing.status !== 'pending') return { error: 'Nur offene Einladungen können zurückgezogen werden' }

    const { data, error } = await sb.from(TABLE).update({ status: 'cancelled' }).eq('id', inviteId).select().single()
    if (error) return { error: error.message }
    return fromRow(data)
  },

  async listByInviter(parentId: ID): Promise<ParentInvite[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*')
      .eq('inviter_id', parentId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(fromRow)
  },

  async getStatsForInviter(parentId: ID) {
    const invites = await this.listByInviter(parentId)
    return {
      total: invites.length,
      pending: invites.filter((i) => i.status === 'pending').length,
      trialBooked: invites.filter((i) => i.status === 'trial_booked').length,
      converted: invites.filter((i) => i.status === 'converted').length,
      rewarded: invites.filter((i) => i.status === 'rewarded').length,
      totalCreditsEarned: invites
        .filter((i) => i.status === 'rewarded')
        .reduce((sum, i) => sum + (i.rewardCredits ?? 0), 0),
    }
  },

  async sweepExpired(): Promise<number> {
    const sb = getServiceClient()
    const { count } = await sb.from(TABLE)
      .update({ status: 'expired' }, { count: 'exact' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
      .select('id', { count: 'exact', head: true })
    return count ?? 0
  },

  // Coupon-Operationen
  async validateCoupon(code: string, bookingAmount: number) {
    const sb = getServiceClient()
    const normalized = code.toUpperCase().trim()
    const { data } = await sb.from(TABLE).select('*').eq('coupon_code', normalized).maybeSingle()
    if (!data) return { valid: false as const, error: 'Gutscheincode nicht gefunden' }
    if (data.coupon_used_at) return { valid: false as const, error: 'Gutschein bereits eingelöst' }
    if (!data.coupon_valid_until || new Date() > new Date(data.coupon_valid_until)) {
      return { valid: false as const, error: 'Gutschein abgelaufen' }
    }
    if (!data.coupon_percent_off) return { valid: false as const, error: 'Gutschein hat keinen Rabatt-Wert' }
    const pct = bookingAmount * (data.coupon_percent_off / 100)
    const discount = Math.min(pct, data.coupon_max_euro_off ?? Infinity)
    return {
      valid: true as const,
      discountEuro: Math.round(discount * 100) / 100,
      inviteId: data.id,
      percentOff: data.coupon_percent_off,
      maxEuroOff: data.coupon_max_euro_off ?? 0,
    }
  },

  async redeemCoupon(code: string, bookingId: ID, discountEuro: number): Promise<ParentInvite | { error: string }> {
    const sb = getServiceClient()
    const normalized = code.toUpperCase().trim()
    const { data: existing } = await sb.from(TABLE).select('*').eq('coupon_code', normalized).maybeSingle()
    if (!existing) return { error: 'Gutscheincode nicht gefunden' }
    if (existing.coupon_used_at) return { error: 'Gutschein bereits eingelöst' }
    if (!existing.coupon_valid_until || new Date() > new Date(existing.coupon_valid_until)) {
      return { error: 'Gutschein abgelaufen' }
    }

    const { data, error } = await sb.from(TABLE).update({
      coupon_used_at: new Date().toISOString(),
      coupon_used_on_booking_id: bookingId,
      coupon_discount_euro: discountEuro,
    }).eq('id', existing.id).select().single()
    if (error) return { error: error.message }
    return fromRow(data)
  },
}
