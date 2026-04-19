// ============================================================
// Review Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { reviewFromDb, reviewToDb } from './mappers'
import type { Review, ID } from '../../types'

export interface CreateReviewInput {
  activityId: ID
  providerId: ID
  parentId: ID
  rating: number     // 1–5
  comment?: string
}

export const SupabaseReviewService = {

  async create(input: CreateReviewInput): Promise<Review | { error: string }> {
    // Rating validieren
    if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating)) {
      return { error: 'Bewertung muss zwischen 1 und 5 liegen' }
    }

    const sb = getServiceClient()

    // Prüfen ob Elternteil den Kurs überhaupt besucht hat
    const { data: completedBookings } = await sb.from('provider_bookings').select('id')
      .eq('parent_id', input.parentId)
      .eq('activity_id', input.activityId)
      .eq('status', 'completed')
      .limit(1)

    if (!completedBookings || completedBookings.length === 0) {
      return { error: 'Bewertung nur nach Kursbesuch möglich' }
    }

    // Doppelte Bewertung verhindern
    const { data: existingReview } = await sb.from('reviews').select('id')
      .eq('activity_id', input.activityId)
      .eq('parent_id', input.parentId)
      .limit(1)

    if (existingReview && existingReview.length > 0) {
      return { error: 'Sie haben diesen Kurs bereits bewertet' }
    }

    const row = reviewToDb({
      activityId: input.activityId,
      providerId: input.providerId,
      parentId: input.parentId,
      rating: input.rating,
      comment: input.comment,
    })

    const { data, error } = await sb.from('reviews').insert(row).select().single()
    if (error) throw error
    return reviewFromDb(data)
  },

  async getById(id: ID): Promise<Review | undefined> {
    const sb = getServiceClient()
    const { data } = await sb.from('reviews').select('*').eq('id', id).maybeSingle()
    return data ? reviewFromDb(data) : undefined
  },

  async listByActivity(activityId: ID): Promise<Review[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('reviews').select('*')
      .eq('activity_id', activityId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(reviewFromDb)
  },

  async listByProvider(providerId: ID): Promise<Review[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('reviews').select('*')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(reviewFromDb)
  },

  async getAverageRating(activityId: ID): Promise<{ average: number; count: number }> {
    const reviews = await this.listByActivity(activityId)
    if (reviews.length === 0) return { average: 0, count: 0 }
    const sum = reviews.reduce((s, r) => s + r.rating, 0)
    return {
      average: Math.round((sum / reviews.length) * 10) / 10,
      count: reviews.length,
    }
  },

  async getProviderRating(providerId: ID): Promise<{ average: number; count: number }> {
    const reviews = await this.listByProvider(providerId)
    if (reviews.length === 0) return { average: 0, count: 0 }
    const sum = reviews.reduce((s, r) => s + r.rating, 0)
    return {
      average: Math.round((sum / reviews.length) * 10) / 10,
      count: reviews.length,
    }
  },

  async getRatingDistribution(providerId: ID): Promise<Record<number, number>> {
    const reviews = await this.listByProvider(providerId)
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const review of reviews) {
      distribution[review.rating]++
    }
    return distribution
  },

  async delete(id: ID, parentId?: ID): Promise<boolean> {
    const sb = getServiceClient()
    // If parentId is provided, verify ownership before deleting
    if (parentId) {
      const { data: review } = await sb.from('reviews').select('parent_id').eq('id', id).maybeSingle()
      if (!review) return false
      if (review.parent_id !== parentId) {
        throw new Error('Keine Berechtigung: Bewertung gehört einem anderen Elternteil')
      }
    }
    const { error } = await sb.from('reviews').delete().eq('id', id)
    if (error) throw error
    return true
  },
}
