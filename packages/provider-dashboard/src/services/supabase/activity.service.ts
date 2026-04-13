// ============================================================
// Activity Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { activityFromDb, activityToDb } from './mappers'
import type { Activity, ActivityStatus, ID } from '../../types'

const TABLE = 'activities'

export const SupabaseActivityService = {

  async list(providerId: ID, filters?: { status?: ActivityStatus; category?: string; query?: string }): Promise<Activity[]> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
    if (filters?.status) query = query.eq('status', filters.status)
    if (filters?.category) query = query.eq('category', filters.category)
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

  async getById(id: ID): Promise<Activity | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('id', id).maybeSingle()
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

  async update(id: ID, input: Partial<Activity>): Promise<Activity | undefined> {
    const sb = getServiceClient()
    const row = activityToDb(input)
    row.updated_at = new Date().toISOString()
    const { data, error } = await sb.from(TABLE).update(row).eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? activityFromDb(data) : undefined
  },

  async delete(id: ID): Promise<boolean> {
    const sb = getServiceClient()
    const { error } = await sb.from(TABLE).delete().eq('id', id)
    if (error) throw error
    return true
  },

  async publish(id: ID): Promise<Activity | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', id).neq('status', 'archived')
      .select().maybeSingle()
    if (error) throw error
    return data ? activityFromDb(data) : undefined
  },

  async archive(id: ID): Promise<Activity | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? activityFromDb(data) : undefined
  },

  async duplicate(id: ID): Promise<Activity | undefined> {
    const original = await this.getById(id)
    if (!original) return undefined
    const { id: _id, createdAt, updatedAt, status, ...rest } = original
    return this.create({ ...rest, title: `${original.title} (Kopie)` })
  },
}
