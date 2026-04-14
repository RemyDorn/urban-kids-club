// ============================================================
// Coupon Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { couponFromDb, couponToDb, couponRedemptionFromDb } from './mappers'
import type { Coupon, CouponRedemption, ID } from '../../types'

const TABLE = 'coupons'

export const SupabaseCouponService = {

  async list(providerId: ID): Promise<Coupon[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(couponFromDb)
  },

  async create(input: Omit<Coupon, 'id' | 'createdAt' | 'usedCount'> & { usedCount?: number }): Promise<Coupon> {
    const sb = getServiceClient()
    const row = couponToDb({ ...input, usedCount: input.usedCount ?? 0 } as Partial<Coupon>)
    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return couponFromDb(data)
  },

  async validate(code: string, activityId: ID): Promise<Coupon | { error: string }> {
    const sb = getServiceClient()
    const normalized = code.toUpperCase().trim()
    const { data, error } = await sb.from(TABLE).select('*').eq('code', normalized).eq('active', true).maybeSingle()
    if (error) throw error
    if (!data) return { error: 'Gutscheincode nicht gefunden' }

    const coupon = couponFromDb(data)
    const now = new Date()

    if (now < coupon.validFrom || now > coupon.validUntil) return { error: 'Gutschein ist abgelaufen oder noch nicht gültig' }
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return { error: 'Gutschein ist aufgebraucht' }
    if (coupon.activityIds?.length && !coupon.activityIds.includes(activityId)) return { error: 'Gutschein gilt nicht für diesen Kurs' }

    return coupon
  },

  // Alias for routes compatibility
  async listByProvider(providerId: ID): Promise<Coupon[]> {
    return this.list(providerId)
  },

  async redeem(couponId: ID, bookingId: ID, parentId: ID): Promise<CouponRedemption> {
    const sb = getServiceClient()

    // Get coupon for discount calculation
    const { data: couponRow } = await sb.from(TABLE).select('*').eq('id', couponId).single()
    const coupon = couponFromDb(couponRow)

    // Increment used count
    await sb.from(TABLE).update({ used_count: coupon.usedCount + 1 }).eq('id', couponId)

    // Create redemption
    const { data, error } = await sb.from('coupon_redemptions').insert({
      coupon_id: couponId,
      booking_id: bookingId,
      parent_id: parentId,
      discount_amount: coupon.value,
      redeemed_at: new Date().toISOString(),
    }).select().single()
    if (error) throw error
    return couponRedemptionFromDb(data)
  },
}
