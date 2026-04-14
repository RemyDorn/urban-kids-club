// ============================================================
// Location Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { locationFromDb, locationToDb } from './mappers'
import type { Location, ID } from '../../types'

const TABLE = 'locations'

export const SupabaseLocationService = {

  async list(providerId: ID): Promise<Location[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(locationFromDb)
  },

  async getById(id: ID, providerId?: ID): Promise<Location | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    return data ? locationFromDb(data) : undefined
  },

  async create(input: Omit<Location, 'id'>): Promise<Location> {
    const sb = getServiceClient()
    const row = locationToDb(input as Partial<Location>)
    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return locationFromDb(data)
  },

  async update(id: ID, input: Partial<Location>, providerId?: ID): Promise<Location | undefined> {
    const sb = getServiceClient()
    const row = locationToDb(input)
    let query = sb.from(TABLE).update(row).eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? locationFromDb(data) : undefined
  },

  async delete(id: ID, providerId?: ID): Promise<boolean> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).delete().eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { error } = await query
    if (error) throw error
    return true
  },

  // Alias for routes compatibility
  async listByProvider(providerId: ID): Promise<Location[]> {
    return this.list(providerId)
  },
}
