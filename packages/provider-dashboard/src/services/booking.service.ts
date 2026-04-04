// ============================================================
// Booking Service – Buchungen verwalten (v2 – integriert)
// ============================================================
// Integriert mit: Validators, NotificationService, AuditService,
// CouponService, WaitlistService, CalendarService
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import { Validators, WAITLIST_SIGNAL } from './validators'
import { createNotification, createAuditEntry } from './helpers'
import type { Booking, BookingStatus, PaymentStatus, ChildInfo, Currency, ID } from '../types'

export interface CreateBookingInput {
  activityId: ID
  providerId: ID
  parentId: ID
  child: ChildInfo
  pricingOptionId: ID
  couponCode?: string
  source?: 'direct' | 'platform'  // Default: 'direct'
  notes?: string
}

export interface BookingResult {
  booking: Booking
  discountApplied?: number
  waitlisted: boolean
  notifications: string[]     // IDs der gesendeten Benachrichtigungen
}

export const BookingService = {

  create(input: CreateBookingInput): BookingResult | { error: string } {
    // --- Validierung ---
    const activity = store.state.activities.get(input.activityId)
    if (!activity) return { error: 'Aktivität nicht gefunden' }
    if (activity.status !== 'published') return { error: 'Aktivität ist nicht buchbar' }

    const parentCheck = Validators.parentExists(input.parentId)
    if (!parentCheck.valid) return { error: parentCheck.errors[0] }

    const childCheck = Validators.childInfoComplete(input.child)
    if (!childCheck.valid) return { error: childCheck.errors.join('; ') }

    // Alter prüfen
    const ageCheck = Validators.childAgeInRange(input.child, activity.ageRange)
    if (!ageCheck.valid) return { error: ageCheck.errors[0] }

    // Doppelbuchung prüfen
    const doubleCheck = Validators.noDoubleBooking(input.activityId, input.parentId, input.child.name)
    if (!doubleCheck.valid) return { error: doubleCheck.errors[0] }

    // Zeitkonflikt prüfen
    const conflictCheck = Validators.noTimeConflict(
      input.parentId, input.child.name, activity.schedule, input.activityId
    )
    if (!conflictCheck.valid) return { error: conflictCheck.errors[0] }

    // Pricing-Option prüfen
    const pricingOption = activity.pricing.find((p) => p.id === input.pricingOptionId)
    if (!pricingOption) return { error: 'Preisoption nicht gefunden' }

    // --- Kapazität & Warteliste (mit Plattform-Priorität) ---
    const capacityCheck = Validators.activityHasCapacity(input.activityId)
    let status: BookingStatus = 'confirmed'
    let waitlisted = false
    const source = input.source ?? 'direct'
    const pl = activity.platformListing

    if (capacityCheck.errors[0] === WAITLIST_SIGNAL) {
      // Kurs voll – aber direkte Buchungen haben Vorrang bei provider_first
      if (source === 'direct' && pl?.enabled && pl.priorityMode === 'provider_first') {
        // Direkte Buchung verdrängt Plattform-Kontingent → trotzdem bestätigen
        status = 'confirmed'
      } else {
        status = 'waitlisted'
        waitlisted = true
      }
    } else if (!capacityCheck.valid) {
      return { error: capacityCheck.errors[0] }
    }

    // Plattform-Buchung: Prüfe ob Plattform-Kontingent noch frei
    if (source === 'platform' && pl?.enabled) {
      const existingPlatformBookings = store.getFromIndex(store.indexes.bookingsByActivity, input.activityId)
      let platformCount = 0
      for (const bid of existingPlatformBookings) {
        const b = store.state.bookings.get(bid)
        if (b && b.source === 'platform' && b.status !== 'cancelled') platformCount++
      }
      if (platformCount >= pl.platformCapacity) {
        if (activity.waitlistEnabled) { status = 'waitlisted'; waitlisted = true }
        else return { error: 'Plattform-Kontingent ausgeschöpft' }
      }
    }

    // --- Gutschein validieren ---
    let discountApplied = 0
    let couponId: string | undefined

    if (input.couponCode) {
      const normalizedCode = input.couponCode.toUpperCase().trim()
      const couponIdFromIndex = store.indexes.couponByCode.get(normalizedCode)
      const foundCoupon = couponIdFromIndex ? store.state.coupons.get(couponIdFromIndex) : undefined

      if (foundCoupon) {
        couponId = foundCoupon.id
        const now = new Date()

        if (!foundCoupon.active) {
          return { error: 'Gutschein ist nicht aktiv' }
        }
        if (now < foundCoupon.validFrom || now > foundCoupon.validUntil) {
          return { error: 'Gutschein ist abgelaufen oder noch nicht gültig' }
        }
        if (foundCoupon.maxUses > 0 && foundCoupon.usedCount >= foundCoupon.maxUses) {
          return { error: 'Gutschein ist aufgebraucht' }
        }
        if (foundCoupon.activityIds?.length && !foundCoupon.activityIds.includes(input.activityId)) {
          return { error: 'Gutschein gilt nicht für diesen Kurs' }
        }
        if (foundCoupon.minBookingAmount && pricingOption.amount < foundCoupon.minBookingAmount) {
          return { error: `Mindestbuchungsbetrag: ${foundCoupon.minBookingAmount} ${foundCoupon.currency}` }
        }

        // Bereits eingelöst von diesem Elternteil?
        const redemptionIds = store.getFromIndex(store.indexes.redemptionsByParent, input.parentId)
        for (const rid of redemptionIds) {
          const r = store.state.couponRedemptions.get(rid)
          if (r && r.couponId === foundCoupon.id) {
            return { error: 'Gutschein wurde von Ihnen bereits eingelöst' }
          }
        }

        // Rabatt berechnen
        switch (foundCoupon.type) {
          case 'percentage':
            discountApplied = Math.round(pricingOption.amount * (foundCoupon.value / 100) * 100) / 100
            break
          case 'fixed_amount':
            discountApplied = Math.min(foundCoupon.value, pricingOption.amount)
            break
          case 'free_trial':
            discountApplied = pricingOption.amount
            break
        }
      } else {
        return { error: 'Gutscheincode nicht gefunden' }
      }
    }

    // --- Buchung erstellen ---
    const id = generateId('book')
    const now = new Date()
    const finalAmount = Math.max(0, pricingOption.amount - discountApplied)

    const booking: Booking = {
      id,
      activityId: input.activityId,
      providerId: input.providerId,
      parentId: input.parentId,
      child: input.child,
      pricingOptionId: input.pricingOptionId,
      status,
      paymentStatus: finalAmount === 0 ? 'paid' : 'unpaid',
      amountPaid: 0,
      currency: pricingOption.currency,
      source: input.source ?? 'direct',
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    }

    store.state.bookings.set(id, booking)
    store.addToIndex(store.indexes.bookingsByActivity, input.activityId, id)
    store.addToIndex(store.indexes.bookingsByProvider, input.providerId, id)
    store.addToIndex(store.indexes.bookingsByParent, input.parentId, id)

    // --- Gutschein einlösen ---
    if (couponId && discountApplied > 0) {
      const redemptionId = generateId('redem')
      store.state.couponRedemptions.set(redemptionId, {
        id: redemptionId,
        couponId,
        bookingId: id,
        parentId: input.parentId,
        discountAmount: discountApplied,
        redeemedAt: now,
      })
      store.addToIndex(store.indexes.redemptionsByCoupon, couponId, redemptionId)
      store.addToIndex(store.indexes.redemptionsByParent, input.parentId, redemptionId)

      const couponEntity = store.state.coupons.get(couponId)!
      couponEntity.usedCount++
      if (couponEntity.maxUses > 0 && couponEntity.usedCount >= couponEntity.maxUses) {
        couponEntity.active = false
      }
    }

    createAuditEntry({
      providerId: input.providerId,
      userId: input.parentId,
      userType: 'parent',
      action: waitlisted ? 'booking.waitlisted' : 'booking.created',
      entityType: 'booking',
      entityId: id,
    })

    const notifications: string[] = []
    notifications.push(createNotification({
      recipientType: 'parent',
      recipientId: input.parentId,
      type: waitlisted ? 'waitlist_promoted' : 'booking_confirmed',
      title: waitlisted ? 'Auf Warteliste gesetzt' : 'Buchungsbestätigung',
      body: waitlisted
        ? `"${input.child.name}" steht auf der Warteliste für "${activity.title}". Sie werden benachrichtigt, sobald ein Platz frei wird.`
        : `Buchung bestätigt: "${input.child.name}" für "${activity.title}".${discountApplied > 0 ? ` Rabatt: ${discountApplied} ${pricingOption.currency}` : ''}`,
      data: { bookingId: id, activityId: input.activityId },
    }))

    return { booking, discountApplied: discountApplied > 0 ? discountApplied : undefined, waitlisted, notifications }
  },

  getById(id: ID): Booking | undefined {
    return store.state.bookings.get(id)
  },

  listByActivity(activityId: ID): Booking[] {
    const ids = store.getFromIndex(store.indexes.bookingsByActivity, activityId)
    return Array.from(ids)
      .map((id) => store.state.bookings.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  },

  listByProvider(providerId: ID, filters?: { status?: BookingStatus; paymentStatus?: PaymentStatus }): Booking[] {
    const ids = store.getFromIndex(store.indexes.bookingsByProvider, providerId)
    let result = Array.from(ids)
      .map((id) => store.state.bookings.get(id)!)
      .filter(Boolean)

    if (filters?.status) result = result.filter((b) => b.status === filters.status)
    if (filters?.paymentStatus) result = result.filter((b) => b.paymentStatus === filters.paymentStatus)

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  listByParent(parentId: ID): Booking[] {
    const ids = store.getFromIndex(store.indexes.bookingsByParent, parentId)
    return Array.from(ids)
      .map((id) => store.state.bookings.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  confirm(id: ID): Booking | undefined {
    const booking = store.state.bookings.get(id)
    if (!booking || booking.status !== 'pending') return undefined
    booking.status = 'confirmed'
    booking.updatedAt = new Date()
    return booking
  },

  cancel(id: ID, cancelledBy?: { userId: ID; userType: 'parent' | 'provider' | 'admin' }): Booking | undefined {
    const booking = store.state.bookings.get(id)
    if (!booking) return undefined
    if (booking.status === 'completed' || booking.status === 'cancelled') return undefined

    const wasConfirmed = booking.status === 'confirmed'
    booking.status = 'cancelled'
    booking.updatedAt = new Date()

    createAuditEntry({
      providerId: booking.providerId,
      userId: cancelledBy?.userId ?? booking.parentId,
      userType: cancelledBy?.userType ?? 'parent',
      action: 'booking.cancelled',
      entityType: 'booking',
      entityId: id,
    })

    const activity = store.state.activities.get(booking.activityId)
    createNotification({
      recipientType: 'parent',
      recipientId: booking.parentId,
      type: 'booking_cancelled',
      title: 'Buchung storniert',
      body: `Ihre Buchung für "${activity?.title ?? booking.activityId}" wurde storniert.`,
      data: { bookingId: id },
    })

    // Warteliste nachrücken
    if (wasConfirmed) {
      this._promoteFromWaitlist(booking.activityId)
    }

    return booking
  },

  complete(id: ID): Booking | undefined {
    const booking = store.state.bookings.get(id)
    if (!booking || booking.status !== 'confirmed') return undefined
    booking.status = 'completed'
    booking.updatedAt = new Date()

    const activity = store.state.activities.get(booking.activityId)
    if (activity) {
      createNotification({
        recipientType: 'parent',
        recipientId: booking.parentId,
        type: 'review_request',
        title: 'Wie war der Kurs?',
        body: `"${booking.child.name}" hat "${activity.title}" besucht. Wir freuen uns über Ihre Bewertung!`,
        data: { activityId: booking.activityId, bookingId: id },
      })
    }

    return booking
  },

  markNoShow(id: ID): Booking | undefined {
    const booking = store.state.bookings.get(id)
    if (!booking || booking.status !== 'confirmed') return undefined
    booking.status = 'no_show'
    booking.updatedAt = new Date()
    return booking
  },

  markPaid(id: ID, amount: number): Booking | undefined {
    const booking = store.state.bookings.get(id)
    if (!booking) return undefined

    booking.amountPaid += amount

    // Prüfe ob vollständig bezahlt
    const activity = store.state.activities.get(booking.activityId)
    const pricingOption = activity?.pricing.find((p) => p.id === booking.pricingOptionId)
    const expectedAmount = pricingOption?.amount ?? 0

    if (booking.amountPaid >= expectedAmount) {
      booking.paymentStatus = 'paid'
    } else if (booking.amountPaid > 0) {
      booking.paymentStatus = 'partial'
    }

    booking.updatedAt = new Date()

    createNotification({
      recipientType: 'parent',
      recipientId: booking.parentId,
      type: 'payment_received',
      title: 'Zahlung eingegangen',
      body: `Zahlung über ${amount} ${booking.currency} für "${activity?.title ?? ''}" eingegangen.`,
      data: { bookingId: id, amount: amount.toString() },
    })

    return booking
  },

  refund(id: ID): Booking | undefined {
    const booking = store.state.bookings.get(id)
    if (!booking || booking.paymentStatus !== 'paid') return undefined
    booking.paymentStatus = 'refunded'
    booking.updatedAt = new Date()
    return booking
  },

  // Warteliste nachrücken – mit Benachrichtigung
  _promoteFromWaitlist(activityId: ID): Booking | undefined {
    const bookings = this.listByActivity(activityId)
    const nextWaitlisted = bookings.find((b) => b.status === 'waitlisted')

    if (nextWaitlisted) {
      nextWaitlisted.status = 'confirmed'
      nextWaitlisted.updatedAt = new Date()

      const activity = store.state.activities.get(activityId)
      createNotification({
        recipientType: 'parent',
        recipientId: nextWaitlisted.parentId,
        type: 'waitlist_promoted',
        title: 'Platz frei geworden!',
        body: `Ein Platz in "${activity?.title ?? ''}" ist frei geworden! "${nextWaitlisted.child.name}" wurde automatisch bestätigt.`,
        data: { bookingId: nextWaitlisted.id, activityId },
      })

      return nextWaitlisted
    }

    return undefined
  },

  // Statistiken
  getStats(providerId: ID): {
    total: number
    confirmed: number
    waitlisted: number
    cancelled: number
    completed: number
    noShow: number
    unpaid: number
  } {
    const ids = store.getFromIndex(store.indexes.bookingsByProvider, providerId)
    const stats = { total: 0, confirmed: 0, waitlisted: 0, cancelled: 0, completed: 0, noShow: 0, unpaid: 0 }
    for (const bid of ids) {
      const b = store.state.bookings.get(bid)
      if (!b) continue
      stats.total++
      if (b.status === 'confirmed') { stats.confirmed++; if (b.paymentStatus === 'unpaid') stats.unpaid++ }
      else if (b.status === 'waitlisted') stats.waitlisted++
      else if (b.status === 'cancelled') stats.cancelled++
      else if (b.status === 'completed') stats.completed++
      else if (b.status === 'no_show') stats.noShow++
    }
    return stats
  },
}
