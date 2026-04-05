// ============================================================
// Coupon Service – Gutscheine & Rabatte (130%-Feature)
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { Coupon, CouponRedemption, CouponType, Currency, ID } from '../types'

export interface CreateCouponInput {
  providerId: ID
  code: string
  type: CouponType
  value: number
  currency?: Currency
  activityIds?: ID[]
  maxUses?: number
  minBookingAmount?: number
  validFrom: Date
  validUntil: Date
}

export const CouponService = {

  create(input: CreateCouponInput): Coupon | { error: string } {
    // Code normalisieren und prüfen
    const code = input.code.toUpperCase().trim()

    if (store.indexes.couponByCode.has(code)) {
      return { error: `Gutscheincode "${code}" existiert bereits` }
    }

    if (input.type === 'percentage' && (input.value < 1 || input.value > 100)) {
      return { error: 'Prozent-Rabatt muss zwischen 1 und 100 liegen' }
    }

    const id = generateId('coup')
    const now = new Date()

    const coupon: Coupon = {
      id,
      providerId: input.providerId,
      code,
      type: input.type,
      value: input.value,
      currency: input.currency ?? 'EUR',
      activityIds: input.activityIds,
      maxUses: input.maxUses ?? 0,
      usedCount: 0,
      minBookingAmount: input.minBookingAmount,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      active: true,
      createdAt: now,
    }

    store.state.coupons.set(id, coupon)
    store.addToIndex(store.indexes.couponsByProvider, input.providerId, id)
    store.indexes.couponByCode.set(code, id)

    return coupon
  },

  getById(id: ID): Coupon | undefined {
    return store.state.coupons.get(id)
  },

  getByCode(code: string): Coupon | undefined {
    const id = store.indexes.couponByCode.get(code.toUpperCase().trim())
    return id ? store.state.coupons.get(id) : undefined
  },

  listByProvider(providerId: ID, filters?: { active?: boolean }): Coupon[] {
    const ids = store.getFromIndex(store.indexes.couponsByProvider, providerId)
    let result = Array.from(ids)
      .map((id) => store.state.coupons.get(id)!)
      .filter(Boolean)

    if (filters?.active !== undefined) {
      result = result.filter((c) => c.active === filters.active)
    }

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  // Gutschein validieren (vor Einlösung)
  validate(code: string, activityId: ID, bookingAmount: number): { valid: boolean; error?: string; discount?: number } {
    const coupon = this.getByCode(code)

    if (!coupon) return { valid: false, error: 'Gutscheincode nicht gefunden' }
    if (!coupon.active) return { valid: false, error: 'Gutschein ist nicht aktiv' }

    const now = new Date()
    if (now < coupon.validFrom) return { valid: false, error: 'Gutschein ist noch nicht gültig' }
    if (now > coupon.validUntil) return { valid: false, error: 'Gutschein ist abgelaufen' }

    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      return { valid: false, error: 'Gutschein wurde bereits vollständig eingelöst' }
    }

    if (coupon.activityIds && coupon.activityIds.length > 0 && !coupon.activityIds.includes(activityId)) {
      return { valid: false, error: 'Gutschein gilt nicht für diesen Kurs' }
    }

    if (coupon.minBookingAmount && bookingAmount < coupon.minBookingAmount) {
      return { valid: false, error: `Mindestbuchungsbetrag: ${coupon.minBookingAmount} ${coupon.currency}` }
    }

    // Rabatt berechnen
    let discount = 0
    switch (coupon.type) {
      case 'percentage':
        discount = Math.round(bookingAmount * (coupon.value / 100) * 100) / 100
        break
      case 'fixed_amount':
        discount = Math.min(coupon.value, bookingAmount)
        break
      case 'free_trial':
        discount = bookingAmount // Komplett kostenlos
        break
    }

    return { valid: true, discount }
  },

  // Gutschein einlösen (mit erneuter Validierung)
  redeem(couponId: ID, bookingId: ID, parentId: ID, discountAmount: number): CouponRedemption | { error: string } {
    const coupon = store.state.coupons.get(couponId)
    if (!coupon) return { error: 'Gutschein nicht gefunden' }
    if (!coupon.active) return { error: 'Gutschein ist nicht mehr aktiv' }

    const now = new Date()
    if (now < coupon.validFrom || now > coupon.validUntil) {
      return { error: 'Gutschein ist abgelaufen oder noch nicht gültig' }
    }
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      return { error: 'Gutschein ist aufgebraucht' }
    }

    const id = generateId('redem')
    const redemption: CouponRedemption = {
      id,
      couponId,
      bookingId,
      parentId,
      discountAmount,
      redeemedAt: new Date(),
    }

    store.state.couponRedemptions.set(id, redemption)
    store.addToIndex(store.indexes.redemptionsByCoupon, couponId, id)
    store.addToIndex(store.indexes.redemptionsByParent, parentId, id)

    // Nutzungszähler erhöhen
    coupon.usedCount++

    // Auto-Deaktivierung bei Erreichen des Limits
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      coupon.active = false
    }

    return redemption
  },

  deactivate(id: ID): Coupon | undefined {
    const coupon = store.state.coupons.get(id)
    if (!coupon) return undefined
    coupon.active = false
    return coupon
  },

  // Statistiken für einen Gutschein
  getStats(couponId: ID): { totalRedemptions: number; totalDiscount: number } {
    const ids = store.getFromIndex(store.indexes.redemptionsByCoupon, couponId)
    const redemptions = Array.from(ids)
      .map((id) => store.state.couponRedemptions.get(id)!)
      .filter(Boolean)

    return {
      totalRedemptions: redemptions.length,
      totalDiscount: redemptions.reduce((sum, r) => sum + r.discountAmount, 0),
    }
  },

  delete(id: ID): boolean {
    const coupon = store.state.coupons.get(id)
    if (!coupon) return false

    store.removeFromIndex(store.indexes.couponsByProvider, coupon.providerId, id)
    store.indexes.couponByCode.delete(coupon.code)
    return store.state.coupons.delete(id)
  },
}
