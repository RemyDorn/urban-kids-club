// ============================================================
// Parent Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { parentFromDb, parentToDb } from './mappers'
import type { Parent, ID } from '../../types'

const TABLE = 'parents'

export const SupabaseParentService = {

  async list(input: { providerId: ID; query?: string; limit?: number; offset?: number } | ID): Promise<Parent[]> {
    const providerId = typeof input === 'object' ? input.providerId : input
    const query = typeof input === 'object' ? input.query : undefined
    const limit = typeof input === 'object' ? (input.limit ?? 100) : 100
    const offset = typeof input === 'object' ? (input.offset ?? 0) : 0
    const sb = getServiceClient()
    // Parents who have bookings with this provider
    const { data: bookingRows, error: bErr } = await sb
      .from('provider_bookings')
      .select('parent_id')
      .eq('provider_id', providerId)
    if (bErr) throw bErr
    const parentIds = [...new Set((bookingRows ?? []).map((r: { parent_id: string }) => r.parent_id))]
    if (parentIds.length === 0) return []
    let dbQuery = sb.from(TABLE).select('*').in('id', parentIds).order('created_at', { ascending: false })
    if (query) {
      // Sanitize query: escape PostgREST special chars (commas, dots, parens)
      const sanitized = query.replace(/[,().%*]/g, '')
      if (sanitized) dbQuery = dbQuery.or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`)
    }
    dbQuery = dbQuery.range(offset, offset + limit - 1)
    const { data, error } = await dbQuery
    if (error) throw error
    return (data ?? []).map(parentFromDb)
  },

  async getById(id: ID, providerId?: ID): Promise<Parent | undefined> {
    const sb = getServiceClient()
    if (providerId) {
      // Verify parent has bookings OR waitlist entries with this provider
      const { data: bookingRows, error: bErr } = await sb
        .from('provider_bookings')
        .select('parent_id')
        .eq('provider_id', providerId)
        .eq('parent_id', id)
        .limit(1)
      if (bErr) throw bErr
      if (!bookingRows?.length) {
        // Check waitlist entries (parent may only be on waitlist, no bookings yet)
        const { data: provActs } = await sb.from('activities').select('id').eq('provider_id', providerId)
        const actIds = (provActs ?? []).map((a: { id: string }) => a.id)
        if (actIds.length > 0) {
          const { data: wlRows } = await sb.from('waitlist_entries')
            .select('parent_id').eq('parent_id', id).in('activity_id', actIds).limit(1)
          if (!wlRows?.length) return undefined
        } else {
          return undefined
        }
      }
    }
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

  async addChild(id: ID, child: { name: string; age?: number; emergencyContact?: string; emergencyPhone?: string; medicalNotes?: string }): Promise<Parent | undefined> {
    const parent = await this.getById(id)
    if (!parent) return undefined
    const newChild: import('../../types').ChildInfo = {
      name: child.name,
      age: child.age ?? 0,
      emergencyContact: child.emergencyContact ?? '',
      emergencyPhone: child.emergencyPhone ?? '',
      medicalNotes: child.medicalNotes,
    }
    const children = [...(parent.children ?? []), newChild]
    return this.update(id, { children })
  },
}
