// ============================================================
// Season & Holiday Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { seasonFromDb, seasonToDb, holidayFromDb, holidayToDb } from './mappers'
import type { Season, Holiday, ID } from '../../types'

export const SupabaseSeasonService = {

  async list(providerId: ID): Promise<Season[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('seasons').select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(seasonFromDb)
  },

  async getById(id: ID): Promise<Season | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('seasons').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? seasonFromDb(data) : undefined
  },

  async create(input: Omit<Season, 'id' | 'createdAt'>): Promise<Season> {
    const sb = getServiceClient()
    const row = seasonToDb(input as Partial<Season>)
    const { data, error } = await sb.from('seasons').insert(row).select().single()
    if (error) throw error
    return seasonFromDb(data)
  },

  async update(id: ID, input: Partial<Season>): Promise<Season | undefined> {
    const sb = getServiceClient()
    const row = seasonToDb(input)
    const { data, error } = await sb.from('seasons').update(row).eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? seasonFromDb(data) : undefined
  },

  async delete(id: ID): Promise<boolean> {
    const sb = getServiceClient()
    const { error } = await sb.from('seasons').delete().eq('id', id)
    if (error) throw error
    return true
  },
}

export const SupabaseHolidayService = {

  async list(providerId: ID): Promise<Holiday[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('holidays').select('*').eq('provider_id', providerId).order('start_date', { ascending: true })
    if (error) throw error
    return (data ?? []).map(holidayFromDb)
  },

  async getById(id: ID): Promise<Holiday | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('holidays').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? holidayFromDb(data) : undefined
  },

  async create(input: Omit<Holiday, 'id'>): Promise<Holiday> {
    const sb = getServiceClient()
    const row = holidayToDb(input as Partial<Holiday>)
    const { data, error } = await sb.from('holidays').insert(row).select().single()
    if (error) throw error
    return holidayFromDb(data)
  },

  async update(id: ID, input: Partial<Holiday>): Promise<Holiday | undefined> {
    const sb = getServiceClient()
    const row = holidayToDb(input)
    const { data, error } = await sb.from('holidays').update(row).eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? holidayFromDb(data) : undefined
  },

  async delete(id: ID): Promise<boolean> {
    const sb = getServiceClient()
    const { error } = await sb.from('holidays').delete().eq('id', id)
    if (error) throw error
    return true
  },
}
