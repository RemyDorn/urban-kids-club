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

  async markAttended(id: ID): Promise<MakeupBooking | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'attended', updated_at: new Date().toISOString() })
      .eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? makeupBookingFromDb(data) : undefined
  },

  async cancel(id: ID): Promise<MakeupBooking | undefined> {
    const sb = getServiceClient()
    const makeup = await this.getById(id)
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

  async getById(id: ID): Promise<MakeupBooking | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? makeupBookingFromDb(data) : undefined
  },
}
