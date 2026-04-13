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

  async getById(id: ID): Promise<Booking | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('id', id).maybeSingle()
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

  async markPaid(id: ID): Promise<Booking | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? bookingFromDb(data) : undefined
  },

  async cancel(id: ID): Promise<Booking | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .not('status', 'in', '("cancelled","completed")')
      .select().maybeSingle()
    if (error) throw error
    return data ? bookingFromDb(data) : undefined
  },
}
