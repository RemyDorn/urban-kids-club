// ============================================================
// Booking Service – Buchungen verwalten
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import { ActivityService } from './activity.service'
import type { Booking, BookingStatus, ChildInfo, ID } from '../types'

export interface CreateBookingInput {
  activityId: ID
  providerId: ID
  parentId: ID
  child: ChildInfo
  pricingOptionId: ID
  notes?: string
}

export const BookingService = {

  create(input: CreateBookingInput): Booking | { error: string } {
    const activity = store.state.activities.get(input.activityId)
    if (!activity) return { error: 'Aktivität nicht gefunden' }
    if (activity.status !== 'published') return { error: 'Aktivität ist nicht buchbar' }

    // Pricing-Option prüfen
    const pricingOption = activity.pricing.find((p) => p.id === input.pricingOptionId)
    if (!pricingOption) return { error: 'Preisoption nicht gefunden' }

    // Kapazität prüfen
    const availableSpots = ActivityService.getAvailableSpots(input.activityId)

    let status: BookingStatus = 'confirmed'
    if (availableSpots <= 0) {
      if (!activity.waitlistEnabled) {
        return { error: 'Kurs ist ausgebucht' }
      }
      status = 'waitlisted'
    }

    const id = generateId('book')
    const now = new Date()

    const booking: Booking = {
      id,
      activityId: input.activityId,
      providerId: input.providerId,
      parentId: input.parentId,
      child: input.child,
      pricingOptionId: input.pricingOptionId,
      status,
      paymentStatus: 'unpaid',
      amountPaid: 0,
      currency: pricingOption.currency,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    }

    store.state.bookings.set(id, booking)

    // Indizes
    store.addToIndex(store.indexes.bookingsByActivity, input.activityId, id)
    store.addToIndex(store.indexes.bookingsByProvider, input.providerId, id)
    store.addToIndex(store.indexes.bookingsByParent, input.parentId, id)

    return booking
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

  listByProvider(providerId: ID, filters?: { status?: BookingStatus }): Booking[] {
    const ids = store.getFromIndex(store.indexes.bookingsByProvider, providerId)
    let result = Array.from(ids)
      .map((id) => store.state.bookings.get(id)!)
      .filter(Boolean)

    if (filters?.status) {
      result = result.filter((b) => b.status === filters.status)
    }

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

  cancel(id: ID): Booking | undefined {
    const booking = store.state.bookings.get(id)
    if (!booking) return undefined
    if (booking.status === 'completed' || booking.status === 'cancelled') return undefined

    const wasPreviouslyConfirmed = booking.status === 'confirmed'
    booking.status = 'cancelled'
    booking.updatedAt = new Date()

    // Warteliste nachrücken
    if (wasPreviouslyConfirmed) {
      this._promoteFromWaitlist(booking.activityId)
    }

    return booking
  },

  complete(id: ID): Booking | undefined {
    const booking = store.state.bookings.get(id)
    if (!booking || booking.status !== 'confirmed') return undefined
    booking.status = 'completed'
    booking.updatedAt = new Date()
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
    booking.amountPaid = amount
    booking.paymentStatus = 'paid'
    booking.updatedAt = new Date()
    return booking
  },

  refund(id: ID): Booking | undefined {
    const booking = store.state.bookings.get(id)
    if (!booking || booking.paymentStatus !== 'paid') return undefined
    booking.paymentStatus = 'refunded'
    booking.updatedAt = new Date()
    return booking
  },

  // Warteliste: Nächsten Kandidat nachrücken
  _promoteFromWaitlist(activityId: ID): Booking | undefined {
    const bookings = this.listByActivity(activityId)
    const nextWaitlisted = bookings.find((b) => b.status === 'waitlisted')

    if (nextWaitlisted) {
      nextWaitlisted.status = 'confirmed'
      nextWaitlisted.updatedAt = new Date()
      // Hier würde man eine Benachrichtigung auslösen
      return nextWaitlisted
    }

    return undefined
  },

  // Statistiken für Provider
  getStats(providerId: ID): {
    total: number
    confirmed: number
    waitlisted: number
    cancelled: number
    completed: number
  } {
    const bookings = this.listByProvider(providerId)
    return {
      total: bookings.length,
      confirmed: bookings.filter((b) => b.status === 'confirmed').length,
      waitlisted: bookings.filter((b) => b.status === 'waitlisted').length,
      cancelled: bookings.filter((b) => b.status === 'cancelled').length,
      completed: bookings.filter((b) => b.status === 'completed').length,
    }
  },
}
