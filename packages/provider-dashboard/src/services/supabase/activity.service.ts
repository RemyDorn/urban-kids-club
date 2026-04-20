// ============================================================
// Activity Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { activityFromDb, activityToDb } from './mappers'
import type { Activity, ActivityStatus, ID } from '../../types'

const TABLE = 'activities'

export const SupabaseActivityService = {

  async list(providerId: ID, filters?: { status?: ActivityStatus; category?: string; query?: string; limit?: number; offset?: number }): Promise<Activity[]> {
    const sb = getServiceClient()
    const limit = filters?.limit ?? 100
    const offset = filters?.offset ?? 0
    let query = sb.from(TABLE).select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
    if (filters?.status) query = query.eq('status', filters.status)
    if (filters?.category) query = query.eq('category', filters.category)
    query = query.range(offset, offset + limit - 1)
    const { data, error } = await query
    if (error) throw error
    let result = (data ?? []).map(activityFromDb)
    if (filters?.query) {
      const q = filters.query.toLowerCase()
      result = result.filter(
        (a) => a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
      )
    }
    return result
  },

  async getById(id: ID, providerId?: ID): Promise<Activity | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    return data ? activityFromDb(data) : undefined
  },

  async create(input: Omit<Activity, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: ActivityStatus }): Promise<Activity> {
    const sb = getServiceClient()
    const row = activityToDb({ ...input, status: input.status ?? 'draft' } as Partial<Activity>)
    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return activityFromDb(data)
  },

  async update(id: ID, input: Partial<Activity>, providerId?: ID): Promise<Activity | undefined> {
    const sb = getServiceClient()
    const row = activityToDb(input)
    row.updated_at = new Date().toISOString()
    let query = sb.from(TABLE).update(row).eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? activityFromDb(data) : undefined
  },

  async delete(id: ID, providerId?: ID): Promise<boolean> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).delete().eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { error } = await query
    if (error) throw error
    return true
  },

  async publish(id: ID, providerId?: ID): Promise<Activity | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE)
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', id).neq('status', 'archived')
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? activityFromDb(data) : undefined
  },

  async archive(id: ID, providerId?: ID): Promise<Activity | undefined> {
    const sb = getServiceClient()
    // Archive = free everything: remove room, remove instructor, set status
    let query = sb.from(TABLE)
      .update({ status: 'archived', room_id: null, instructor_id: null, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error

    if (data) {
      // Cancel all active/upcoming course blocks
      const { error: blockErr } = await sb.from('course_blocks')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('activity_id', id)
        .in('status', ['active', 'upcoming'])
      if (blockErr) console.error('[Activity] Failed to cancel blocks on archive:', blockErr.message)

      // Cancel pending waitlist entries
      const { error: waitErr } = await sb.from('waitlist_entries')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('activity_id', id)
        .in('status', ['waiting', 'offered'])
      if (waitErr) console.error('[Activity] Failed to expire waitlist on archive:', waitErr.message)
    }

    return data ? activityFromDb(data) : undefined
  },

  async duplicate(id: ID, providerId?: ID): Promise<Activity | undefined> {
    const original = await this.getById(id, providerId)
    if (!original) return undefined
    const { id: _id, createdAt, updatedAt, status, ...rest } = original
    return this.create({ ...rest, title: `${original.title} (Kopie)` })
  },

  async search(filters: { status?: ActivityStatus; category?: string; query?: string; providerId?: ID; ageMin?: number; ageMax?: number }): Promise<Activity[]> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').order('created_at', { ascending: false })
    if (filters.providerId) query = query.eq('provider_id', filters.providerId)
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.category) query = query.eq('category', filters.category)
    const { data, error } = await query
    if (error) throw error
    let result = (data ?? []).map(activityFromDb)
    if (filters.query) {
      const q = filters.query.toLowerCase()
      result = result.filter((a) => a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
    }
    if (filters.ageMin !== undefined) result = result.filter((a) => (a.ageRange?.max ?? 99) >= filters.ageMin!)
    if (filters.ageMax !== undefined) result = result.filter((a) => (a.ageRange?.min ?? 0) <= filters.ageMax!)
    return result
  },

  async getAvailableSpots(id: ID): Promise<number> {
    const sb = getServiceClient()
    const { data: activity } = await sb.from(TABLE).select('capacity').eq('id', id).single()
    if (!activity) return 0
    const { count } = await sb.from('provider_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('activity_id', id).eq('status', 'confirmed')
    return Math.max(0, (activity.capacity ?? 0) - (count ?? 0))
  },

  // Alias for routes compatibility
  async listByProvider(providerId: ID, filters?: { status?: ActivityStatus; category?: string; query?: string; limit?: number; offset?: number }): Promise<Activity[]> {
    return this.list(providerId, filters)
  },
}
