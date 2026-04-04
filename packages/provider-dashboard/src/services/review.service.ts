// ============================================================
// Review Service – Bewertungen & Rezensionen
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { Review, ID } from '../types'

export interface CreateReviewInput {
  activityId: ID
  providerId: ID
  parentId: ID
  rating: number     // 1–5
  comment?: string
}

export const ReviewService = {

  create(input: CreateReviewInput): Review | { error: string } {
    // Rating validieren
    if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating)) {
      return { error: 'Bewertung muss zwischen 1 und 5 liegen' }
    }

    // Prüfen ob Elternteil den Kurs überhaupt besucht hat
    const parentBookings = Array.from(
      store.getFromIndex(store.indexes.bookingsByParent, input.parentId)
    )
      .map((id) => store.state.bookings.get(id)!)
      .filter((b) => b && b.activityId === input.activityId)

    const hasCompleted = parentBookings.some(
      (b) => b.status === 'completed' || b.status === 'confirmed'
    )
    if (!hasCompleted) {
      return { error: 'Bewertung nur nach Kursbesuch möglich' }
    }

    // Doppelte Bewertung verhindern
    const existingReviews = Array.from(
      store.getFromIndex(store.indexes.reviewsByActivity, input.activityId)
    )
      .map((id) => store.state.reviews.get(id)!)
      .filter(Boolean)

    if (existingReviews.some((r) => r.parentId === input.parentId)) {
      return { error: 'Sie haben diesen Kurs bereits bewertet' }
    }

    const id = generateId('rev')
    const review: Review = {
      id,
      activityId: input.activityId,
      providerId: input.providerId,
      parentId: input.parentId,
      rating: input.rating,
      comment: input.comment,
      createdAt: new Date(),
    }

    store.state.reviews.set(id, review)
    store.addToIndex(store.indexes.reviewsByProvider, input.providerId, id)
    store.addToIndex(store.indexes.reviewsByActivity, input.activityId, id)

    return review
  },

  getById(id: ID): Review | undefined {
    return store.state.reviews.get(id)
  },

  listByActivity(activityId: ID): Review[] {
    const ids = store.getFromIndex(store.indexes.reviewsByActivity, activityId)
    return Array.from(ids)
      .map((id) => store.state.reviews.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  listByProvider(providerId: ID): Review[] {
    const ids = store.getFromIndex(store.indexes.reviewsByProvider, providerId)
    return Array.from(ids)
      .map((id) => store.state.reviews.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  // Durchschnittsbewertung eines Kurses
  getAverageRating(activityId: ID): { average: number; count: number } {
    const reviews = this.listByActivity(activityId)
    if (reviews.length === 0) return { average: 0, count: 0 }

    const sum = reviews.reduce((s, r) => s + r.rating, 0)
    return {
      average: Math.round((sum / reviews.length) * 10) / 10,
      count: reviews.length,
    }
  },

  // Durchschnittsbewertung eines Providers
  getProviderRating(providerId: ID): { average: number; count: number } {
    const reviews = this.listByProvider(providerId)
    if (reviews.length === 0) return { average: 0, count: 0 }

    const sum = reviews.reduce((s, r) => s + r.rating, 0)
    return {
      average: Math.round((sum / reviews.length) * 10) / 10,
      count: reviews.length,
    }
  },

  // Rating-Verteilung (für Sterne-Anzeige)
  getRatingDistribution(providerId: ID): Record<number, number> {
    const reviews = this.listByProvider(providerId)
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const review of reviews) {
      distribution[review.rating]++
    }
    return distribution
  },

  delete(id: ID): boolean {
    const review = store.state.reviews.get(id)
    if (!review) return false

    store.removeFromIndex(store.indexes.reviewsByProvider, review.providerId, id)
    store.removeFromIndex(store.indexes.reviewsByActivity, review.activityId, id)
    return store.state.reviews.delete(id)
  },
}
