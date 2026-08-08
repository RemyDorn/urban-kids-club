// ============================================================
// Booking Service – Supabase-backed (provider_bookings table)
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { bookingFromDb, bookingToDb } from './mappers'
import type { Booking, BookingStatus, PaymentStatus, ID } from '../../types'

const TABLE = 'provider_bookings'

export const SupabaseBookingService = {

  async list(providerId: ID, filters?: { status?: BookingStatus; paymentStatus?: PaymentStatus; limit?: number; offset?: number }): Promise<Booking[]> {
    const sb = getServiceClient()
    const limit = filters?.limit ?? 100
    const offset = filters?.offset ?? 0
    let query = sb.from(TABLE).select('*').eq('provider_id', providerId).order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    if (filters?.status) query = query.eq('status', filters.status)
    if (filters?.paymentStatus) query = query.eq('payment_status', filters.paymentStatus)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(bookingFromDb)
  },

  async getById(id: ID, providerId?: ID): Promise<Booking | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    return data ? bookingFromDb(data) : undefined
  },

  async create(input: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>): Promise<Booking> {
    const sb = getServiceClient()
    const row = bookingToDb(input as Partial<Booking>)
    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return bookingFromDb(data)
  },

  async markPaid(id: ID, amount?: number, providerId?: ID): Promise<Booking | undefined> {
    const sb = getServiceClient()
    const update: Record<string, unknown> = { payment_status: 'paid', updated_at: new Date().toISOString() }
    if (amount !== undefined) update.amount_paid = amount
    let query = sb.from(TABLE).update(update).eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? bookingFromDb(data) : undefined
  },

  async cancel(id: ID, providerId?: ID): Promise<Booking | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE)
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .not('status', 'in', '("cancelled","completed")')
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? bookingFromDb(data) : undefined
  },

  async complete(id: ID, providerId?: ID): Promise<Booking | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE)
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'confirmed')
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? bookingFromDb(data) : undefined
  },

  async listByActivity(activityId: ID, opts?: { limit?: number; offset?: number }): Promise<Booking[]> {
    const sb = getServiceClient()
    const limit = opts?.limit ?? 100
    const offset = opts?.offset ?? 0
    const { data, error } = await sb.from(TABLE).select('*').eq('activity_id', activityId).order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    if (error) throw error
    return (data ?? []).map(bookingFromDb)
  },

  async listByParent(parentId: ID, opts?: { limit?: number; offset?: number }): Promise<Booking[]> {
    const sb = getServiceClient()
    const limit = opts?.limit ?? 100
    const offset = opts?.offset ?? 0
    const { data, error } = await sb.from(TABLE).select('*').eq('parent_id', parentId).order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    if (error) throw error
    return (data ?? []).map(bookingFromDb)
  },

  async getStats(providerId: ID): Promise<{ total: number; confirmed: number; cancelled: number; completed: number; pending: number; waitlisted: number; noShow: number; revenue: number }> {
    const sb = getServiceClient()
    const statuses = ['confirmed', 'cancelled', 'completed', 'pending', 'waitlisted', 'no_show'] as const
    const counts: Record<string, number> = {}

    // Parallel count queries (much cheaper than loading all rows)
    await Promise.all(statuses.map(async (status) => {
      const { count, error } = await sb.from(TABLE).select('*', { count: 'exact', head: true })
        .eq('provider_id', providerId).eq('status', status)
      if (error) throw error
      counts[status] = count ?? 0
    }))

    // Total count
    const { count: total, error: totalError } = await sb.from(TABLE).select('*', { count: 'exact', head: true })
      .eq('provider_id', providerId)
    if (totalError) throw totalError

    // Revenue sum - only load paid amounts (not all rows)
    const { data: revenueRows, error: revError } = await sb.from(TABLE)
      .select('amount_paid')
      .eq('provider_id', providerId)
      .not('amount_paid', 'is', null)
      .gt('amount_paid', 0)
    if (revError) throw revError
    const revenue = (revenueRows ?? []).reduce((s: number, r: any) => s + (r.amount_paid ?? 0), 0)

    return {
      total: total ?? 0,
      confirmed: counts.confirmed ?? 0,
      cancelled: counts.cancelled ?? 0,
      completed: counts.completed ?? 0,
      pending: counts.pending ?? 0,
      waitlisted: counts.waitlisted ?? 0,
      noShow: counts.no_show ?? 0,
      revenue,
    }
  },

  // Alias for routes compatibility
  async listByProvider(providerId: ID, filters?: { status?: BookingStatus; paymentStatus?: PaymentStatus; limit?: number; offset?: number }): Promise<Booking[]> {
    return this.list(providerId, filters)
  },
}
