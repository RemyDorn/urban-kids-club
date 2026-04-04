// ============================================================
// Booking Service – Buchungen verwalten (v2 – integriert)
// ============================================================
// Integriert mit: Validators, NotificationService, AuditService,
// CouponService, WaitlistService, CalendarService
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import { Validators } from './validators'
import type { Booking, BookingStatus, PaymentStatus, ChildInfo, Currency, ID } from '../types'

export interface CreateBookingInput {
  activityId: ID
  providerId: ID
  parentId: ID
  child: ChildInfo
  pricingOptionId: ID
  couponCode?: string
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

    // --- Kapazität & Warteliste ---
    const capacityCheck = Validators.activityHasCapacity(input.activityId)
    let status: BookingStatus = 'confirmed'
    let waitlisted = false

    if (!capacityCheck.valid) {
      if (capacityCheck.errors[0] === 'WAITLIST') {
        status = 'waitlisted'
        waitlisted = true
      } else {
        return { error: capacityCheck.errors[0] }
      }
    }

    // --- Gutschein validieren ---
    let discountApplied = 0
    let couponId: string | undefined

    if (input.couponCode) {
      // Lazy import to avoid circular dependency
      const coupon = store.state.coupons.values()
      let foundCoupon = undefined
      for (const c of coupon) {
        if (c.code === input.couponCode.toUpperCase().trim()) {
          foundCoupon = c
          break
        }
      }

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
      amountPaid: finalAmount === 0 ? 0 : 0,
      currency: pricingOption.currency,
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

    // --- Audit-Log ---
    const auditId = generateId('audit')
    store.state.auditLog.set(auditId, {
      id: auditId,
      providerId: input.providerId,
      userId: input.parentId,
      userType: 'parent',
      action: waitlisted ? 'booking.waitlisted' : 'booking.created',
      entityType: 'booking',
      entityId: id,
      timestamp: now,
    })
    store.addToIndex(store.indexes.auditByProvider, input.providerId, auditId)
    store.addToIndex(store.indexes.auditByEntity, `booking:${id}`, auditId)

    // --- Benachrichtigungen ---
    const notifications: string[] = []

    const notifId = generateId('notif')
    const notification = {
      id: notifId,
      recipientType: 'parent' as const,
      recipientId: input.parentId,
      type: waitlisted ? 'waitlist_promoted' as const : 'booking_confirmed' as const,
      channel: 'email' as const,
      title: waitlisted ? 'Auf Warteliste gesetzt' : 'Buchungsbestätigung',
      body: waitlisted
        ? `"${input.child.name}" steht auf der Warteliste für "${activity.title}". Sie werden benachrichtigt, sobald ein Platz frei wird.`
        : `Buchung bestätigt: "${input.child.name}" für "${activity.title}".${discountApplied > 0 ? ` Rabatt: ${discountApplied} ${pricingOption.currency}` : ''}`,
      data: { bookingId: id, activityId: input.activityId },
      read: false,
      sentAt: now,
    }
    store.state.notifications.set(notifId, notification)
    store.addToIndex(store.indexes.notificationsByRecipient, input.parentId, notifId)
    notifications.push(notifId)

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

    // Audit
    const auditId = generateId('audit')
    store.state.auditLog.set(auditId, {
      id: auditId,
      providerId: booking.providerId,
      userId: cancelledBy?.userId ?? booking.parentId,
      userType: cancelledBy?.userType ?? 'parent',
      action: 'booking.cancelled',
      entityType: 'booking',
      entityId: id,
      timestamp: new Date(),
    })
    store.addToIndex(store.indexes.auditByProvider, booking.providerId, auditId)
    store.addToIndex(store.indexes.auditByEntity, `booking:${id}`, auditId)

    // Stornierungsbenachrichtigung
    const activity = store.state.activities.get(booking.activityId)
    const notifId = generateId('notif')
    store.state.notifications.set(notifId, {
      id: notifId,
      recipientType: 'parent',
      recipientId: booking.parentId,
      type: 'booking_cancelled',
      channel: 'email',
      title: 'Buchung storniert',
      body: `Ihre Buchung für "${activity?.title ?? booking.activityId}" wurde storniert.`,
      data: { bookingId: id },
      read: false,
      sentAt: new Date(),
    })
    store.addToIndex(store.indexes.notificationsByRecipient, booking.parentId, notifId)

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

    // Review-Request nach Abschluss senden
    const activity = store.state.activities.get(booking.activityId)
    if (activity) {
      const notifId = generateId('notif')
      store.state.notifications.set(notifId, {
        id: notifId,
        recipientType: 'parent',
        recipientId: booking.parentId,
        type: 'review_request',
        channel: 'email',
        title: 'Wie war der Kurs?',
        body: `"${booking.child.name}" hat "${activity.title}" besucht. Wir freuen uns über Ihre Bewertung!`,
        data: { activityId: booking.activityId, bookingId: id },
        read: false,
        sentAt: new Date(),
      })
      store.addToIndex(store.indexes.notificationsByRecipient, booking.parentId, notifId)
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

    // Notification bei Zahlung
    const notifId = generateId('notif')
    store.state.notifications.set(notifId, {
      id: notifId,
      recipientType: 'parent',
      recipientId: booking.parentId,
      type: 'payment_received',
      channel: 'email',
      title: 'Zahlung eingegangen',
      body: `Zahlung über ${amount} ${booking.currency} für "${activity?.title ?? ''}" eingegangen.`,
      data: { bookingId: id, amount: amount.toString() },
      read: false,
      sentAt: new Date(),
    })
    store.addToIndex(store.indexes.notificationsByRecipient, booking.parentId, notifId)

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

      // Benachrichtigung
      const activity = store.state.activities.get(activityId)
      const notifId = generateId('notif')
      store.state.notifications.set(notifId, {
        id: notifId,
        recipientType: 'parent',
        recipientId: nextWaitlisted.parentId,
        type: 'waitlist_promoted',
        channel: 'email',
        title: 'Platz frei geworden!',
        body: `Ein Platz in "${activity?.title ?? ''}" ist frei geworden! "${nextWaitlisted.child.name}" wurde automatisch bestätigt.`,
        data: { bookingId: nextWaitlisted.id, activityId },
        read: false,
        sentAt: new Date(),
      })
      store.addToIndex(store.indexes.notificationsByRecipient, nextWaitlisted.parentId, notifId)

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
    const bookings = this.listByProvider(providerId)
    return {
      total: bookings.length,
      confirmed: bookings.filter((b) => b.status === 'confirmed').length,
      waitlisted: bookings.filter((b) => b.status === 'waitlisted').length,
      cancelled: bookings.filter((b) => b.status === 'cancelled').length,
      completed: bookings.filter((b) => b.status === 'completed').length,
      noShow: bookings.filter((b) => b.status === 'no_show').length,
      unpaid: bookings.filter((b) => b.paymentStatus === 'unpaid' && b.status === 'confirmed').length,
    }
  },
}
