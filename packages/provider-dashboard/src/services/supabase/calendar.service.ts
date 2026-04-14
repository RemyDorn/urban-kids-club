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

  async update(id: ID, input: Partial<CalendarEvent>, providerId?: ID): Promise<CalendarEvent | undefined> {
    const sb = getServiceClient()
    const row = calendarEventToDb(input)
    let query = sb.from(TABLE).update(row).eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? calendarEventFromDb(data) : undefined
  },

  async delete(id: ID, providerId?: ID): Promise<boolean> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).delete().eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { error } = await query
    if (error) throw error
    return true
  },

  // Routes compatibility aliases
  async getByDateRange(providerId: ID, start: string, end: string): Promise<CalendarEvent[]> {
    return this.list(providerId, { from: start, to: end })
  },

  async detectConflictsInRange(providerId: ID, start: string, end: string): Promise<CalendarEvent[][]> {
    const events = await this.list(providerId, { from: start, to: end })
    // Simple conflict detection: events with overlapping times on the same day
    const conflicts: CalendarEvent[][] = []
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        if (events[i].date === events[j].date) {
          const aStart = events[i].startTime ?? '00:00'
          const aEnd = events[i].endTime ?? '23:59'
          const bStart = events[j].startTime ?? '00:00'
          const bEnd = events[j].endTime ?? '23:59'
          if (aStart < bEnd && bStart < aEnd) {
            conflicts.push([events[i], events[j]])
          }
        }
      }
    }
    return conflicts
  },

  async generateICalFeed(providerId: ID, start: string, end: string): Promise<string> {
    const events = await this.list(providerId, { from: start, to: end })
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Urban Kids Club//DE']
    for (const ev of events) {
      lines.push('BEGIN:VEVENT')
      lines.push(`UID:${ev.id}@urban-kids-club`)
      lines.push(`DTSTART:${ev.date.replace(/-/g, '')}T${(ev.startTime ?? '000000').replace(':', '')}00Z`)
      lines.push(`DTEND:${ev.date.replace(/-/g, '')}T${(ev.endTime ?? '235900').replace(':', '')}00Z`)
      lines.push(`SUMMARY:${ev.title}`)
      lines.push('END:VEVENT')
    }
    lines.push('END:VCALENDAR')
    return lines.join('\r\n')
  },

  async syncActivitiesToCalendar(providerId: ID): Promise<CalendarEvent[]> {
    const sb = getServiceClient()
    const { data: activities } = await sb.from('activities').select('*').eq('provider_id', providerId).eq('status', 'published')
    const results: CalendarEvent[] = []
    for (const a of activities ?? []) {
      const schedule = a.schedule as Array<{ day: string; time: string }> ?? []
      for (const slot of schedule) {
        const existing = await sb.from(TABLE)
          .select('id').eq('provider_id', providerId).eq('activity_id', a.id).eq('day_of_week', slot.day).limit(1)
        if (!existing.data?.length) {
          const ev = await this.create({
            providerId,
            activityId: a.id,
            title: a.title,
            date: new Date().toISOString().split('T')[0],
            startTime: slot.time,
            type: 'activity',
          } as any)
          results.push(ev)
        }
      }
    }
    return results
  },
}
