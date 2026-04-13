// ============================================================
// Calendar Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { calendarEventFromDb, calendarEventToDb } from './mappers'
import type { CalendarEvent, ID } from '../../types'

const TABLE = 'calendar_events'

export const SupabaseCalendarService = {

  async list(providerId: ID, dateRange?: { from: string; to: string }): Promise<CalendarEvent[]> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').eq('provider_id', providerId).order('date', { ascending: true })
    if (dateRange?.from) query = query.gte('date', dateRange.from)
    if (dateRange?.to) query = query.lte('date', dateRange.to)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(calendarEventFromDb)
  },

  async create(input: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> {
    const sb = getServiceClient()
    const row = calendarEventToDb(input as Partial<CalendarEvent>)
    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return calendarEventFromDb(data)
  },

  async update(id: ID, input: Partial<CalendarEvent>): Promise<CalendarEvent | undefined> {
    const sb = getServiceClient()
    const row = calendarEventToDb(input)
    const { data, error } = await sb.from(TABLE).update(row).eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? calendarEventFromDb(data) : undefined
  },

  async delete(id: ID): Promise<boolean> {
    const sb = getServiceClient()
    const { error } = await sb.from(TABLE).delete().eq('id', id)
    if (error) throw error
    return true
  },
}
