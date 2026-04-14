// ============================================================
// MakeupBooking Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { makeupBookingFromDb, makeupBookingToDb } from './mappers'
import type { MakeupBooking, ID } from '../../types'

const TABLE = 'makeup_bookings'

export const SupabaseMakeupBookingService = {

  async create(creditId: ID, targetSessionId: ID, input: {
    bookedBy: 'parent' | 'provider'
  }): Promise<MakeupBooking> {
    const sb = getServiceClient()

    // Fetch credit for context
    const { data: credit } = await sb.from('session_credits').select('*').eq('id', creditId).single()
    // Fetch target session for block info
    const { data: session } = await sb.from('block_sessions').select('*').eq('id', targetSessionId).single()
    // Fetch enrollment for child name
    const { data: enrollment } = await sb.from('block_enrollments').select('*').eq('id', credit.enrollment_id).single()

    const row = makeupBookingToDb({
      creditId,
      targetBlockId: session.block_id,
      targetSessionId,
      providerId: credit.provider_id,
      parentId: credit.parent_id,
      childId: credit.child_id,
      childName: enrollment?.child_name ?? '',
      status: 'confirmed',
      bookedBy: input.bookedBy,
    })

    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error

    // Mark credit as used
    await sb.from('session_credits')
      .update({ status: 'used', used_in_session_id: targetSessionId, used_at: new Date().toISOString() })
      .eq('id', creditId)

    return makeupBookingFromDb(data)
  },

  async list(providerId: ID): Promise<MakeupBooking[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(makeupBookingFromDb)
  },

  async markAttended(id: ID, providerId?: ID): Promise<MakeupBooking | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE)
      .update({ status: 'attended', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? makeupBookingFromDb(data) : undefined
  },

  async cancel(id: ID, providerId?: ID): Promise<MakeupBooking | undefined> {
    const sb = getServiceClient()
    const makeup = await this.getById(id, providerId)
    if (!makeup) return undefined

    const { data, error } = await sb.from(TABLE)
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id).select().maybeSingle()
    if (error) throw error

    // Restore credit
    await sb.from('session_credits')
      .update({ status: 'available', used_in_session_id: null, used_at: null })
      .eq('id', makeup.creditId)

    return data ? makeupBookingFromDb(data) : undefined
  },

  async getById(id: ID, providerId?: ID): Promise<MakeupBooking | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    return data ? makeupBookingFromDb(data) : undefined
  },

  // Routes compatibility aliases

  async bookMakeup(input: {
    creditId: ID; targetSessionId: ID; bookedBy: 'parent' | 'provider';
  }): Promise<MakeupBooking | { error: string }> {
    try {
      return await this.create(input.creditId, input.targetSessionId, { bookedBy: input.bookedBy })
    } catch (err: any) {
      return { error: err.message ?? 'Fehler beim Buchen' }
    }
  },

  async cancelMakeup(makeupId: ID, cancelledBy: 'parent' | 'provider', providerId?: ID): Promise<{ success: boolean } | { error: string }> {
    const result = await this.cancel(makeupId, providerId)
    if (!result) return { error: 'Nachholtermin nicht gefunden' }
    return { success: true }
  },

  async markMakeupAttendance(makeupId: ID, status: string, providerId?: ID): Promise<MakeupBooking | undefined> {
    if (status === 'attended') return this.markAttended(makeupId, providerId)
    const sb = getServiceClient()
    let query = sb.from(TABLE)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', makeupId)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? makeupBookingFromDb(data) : undefined
  },

  async getMakeupsByChild(childId: string): Promise<MakeupBooking[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('child_id', childId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(makeupBookingFromDb)
  },

  async getMakeupsByParent(parentId: ID): Promise<MakeupBooking[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('parent_id', parentId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(makeupBookingFromDb)
  },

  async getMakeup(makeupId: ID, providerId?: ID): Promise<MakeupBooking | undefined> {
    return this.getById(makeupId, providerId)
  },
}
