// ============================================================
// Parent Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { parentFromDb, parentToDb } from './mappers'
import type { Parent, ID } from '../../types'

const TABLE = 'parents'

export const SupabaseParentService = {

  async list(providerId: ID): Promise<Parent[]> {
    const sb = getServiceClient()
    // Parents who have bookings with this provider
    const { data: bookingRows, error: bErr } = await sb
      .from('provider_bookings')
      .select('parent_id')
      .eq('provider_id', providerId)
    if (bErr) throw bErr
    const parentIds = [...new Set((bookingRows ?? []).map((r: { parent_id: string }) => r.parent_id))]
    if (parentIds.length === 0) return []
    const { data, error } = await sb.from(TABLE).select('*').in('id', parentIds).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(parentFromDb)
  },

  async getById(id: ID): Promise<Parent | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? parentFromDb(data) : undefined
  },

  async create(input: Omit<Parent, 'id' | 'createdAt'>): Promise<Parent> {
    const sb = getServiceClient()
    const row = parentToDb(input as Partial<Parent>)
    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return parentFromDb(data)
  },

  async update(id: ID, input: Partial<Pick<Parent, 'name' | 'email' | 'phone' | 'children'>>): Promise<Parent | undefined> {
    const sb = getServiceClient()
    const row = parentToDb(input as Partial<Parent>)
    const { data, error } = await sb.from(TABLE).update(row).eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? parentFromDb(data) : undefined
  },

  async delete(id: ID): Promise<boolean> {
    const sb = getServiceClient()
    const { error } = await sb.from(TABLE).delete().eq('id', id)
    if (error) throw error
    return true
  },
}
