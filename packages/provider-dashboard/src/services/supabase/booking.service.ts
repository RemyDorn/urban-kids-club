// ============================================================
// Booking Service – Supabase-backed (provider_bookings table)
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { bookingFromDb, bookingToDb } from './mappers'
import type { Booking, BookingStatus, PaymentStatus, ID } from '../../types'

const TABLE = 'provider_bookings'

export const SupabaseBookingService = {

  async list(providerId: ID, filters?: { status?: BookingStatus; paymentStatus?: PaymentStatus }): Promise<Booking[]> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
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

  async listByActivity(activityId: ID): Promise<Booking[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('activity_id', activityId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(bookingFromDb)
  },

  async listByParent(parentId: ID): Promise<Booking[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('parent_id', parentId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(bookingFromDb)
  },

  async getStats(providerId: ID): Promise<{ total: number; confirmed: number; cancelled: number; revenue: number }> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('status, amount_paid').eq('provider_id', providerId)
    if (error) throw error
    const rows = data ?? []
    return {
      total: rows.length,
      confirmed: rows.filter((r: any) => r.status === 'confirmed').length,
      cancelled: rows.filter((r: any) => r.status === 'cancelled').length,
      revenue: rows.reduce((s: number, r: any) => s + (r.amount_paid ?? 0), 0),
    }
  },

  // Alias for routes compatibility
  async listByProvider(providerId: ID, filters?: { status?: BookingStatus; paymentStatus?: PaymentStatus }): Promise<Booking[]> {
    return this.list(providerId, filters)
  },
}
