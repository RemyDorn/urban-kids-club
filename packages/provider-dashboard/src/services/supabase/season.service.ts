// ============================================================
// Season & Holiday Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { seasonFromDb, seasonToDb, holidayFromDb, holidayToDb } from './mappers'
import type { Season, Holiday, ID } from '../../types'
import { SCHULFERIEN_2026, BUNDESLAND_NAMES, ALL_BUNDESLAENDER, type Bundesland } from '../holidays-de'

export const SupabaseSeasonService = {

  // Alias for routes compatibility
  async listByProvider(providerId: ID): Promise<Season[]> {
    return this.list(providerId)
  },

  async getCurrentSeason(providerId: ID): Promise<Season | undefined> {
    const seasons = await this.list(providerId)
    const today = new Date().toISOString().split('T')[0]
    return seasons.find((s) => s.startDate <= today && s.endDate >= today)
  },

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

  // Alias for routes compatibility
  async listByProvider(providerId: ID): Promise<Holiday[]> {
    return this.list(providerId)
  },

  async importGermanHolidays(providerId: ID, region: string = 'NW'): Promise<Holiday[]> {
    const bl = region.toUpperCase() as Bundesland
    const templates = SCHULFERIEN_2026[bl] ?? []
    const results: Holiday[] = []
    for (const tpl of templates) {
      const result = await this.create({
        providerId,
        name: tpl.name,
        startDate: tpl.startDate,
        endDate: tpl.endDate,
        cancelActivities: false,
        region: bl,
      })
      results.push(result)
    }
    return results
  },

  getAvailableBundeslaender(): Array<{ code: string; name: string; holidayCount: number }> {
    return ALL_BUNDESLAENDER.map((bl) => ({
      code: bl,
      name: BUNDESLAND_NAMES[bl],
      holidayCount: (SCHULFERIEN_2026[bl] ?? []).length,
    }))
  },

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
