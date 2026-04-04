// ============================================================
// Calendar Service – Kalender, Konflikterkennung, iCal-Export
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import { DAY_TO_NUMBER, RECURRING_WEEKS_AHEAD } from './helpers'
import type { CalendarEvent, CalendarConflict, ID } from '../types'

export interface CreateCalendarEventInput {
  providerId: ID
  activityId?: ID
  locationId?: ID
  instructorId?: ID
  title: string
  description?: string
  date: string
  startTime: string
  endTime: string
  recurring?: boolean
  recurrenceRule?: string
  color?: string
  type: CalendarEvent['type']
}

export const CalendarService = {

  create(input: CreateCalendarEventInput): CalendarEvent {
    const id = generateId('cal')

    const event: CalendarEvent = {
      id,
      providerId: input.providerId,
      activityId: input.activityId,
      locationId: input.locationId,
      instructorId: input.instructorId,
      title: input.title,
      description: input.description,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      recurring: input.recurring ?? false,
      recurrenceRule: input.recurrenceRule,
      color: input.color,
      type: input.type,
    }

    store.state.calendarEvents.set(id, event)
    store.addToIndex(store.indexes.calendarByProvider, input.providerId, id)
    store.addToIndex(store.indexes.calendarByDate, input.date, id)
    if (input.locationId) {
      store.addToIndex(store.indexes.calendarByLocation, input.locationId, id)
    }
    if (input.instructorId) {
      store.addToIndex(store.indexes.calendarByInstructor, input.instructorId, id)
    }

    return event
  },

  getById(id: ID): CalendarEvent | undefined {
    return store.state.calendarEvents.get(id)
  },

  // Events für einen Tag
  getByDate(providerId: ID, date: string): CalendarEvent[] {
    const byDate = store.getFromIndex(store.indexes.calendarByDate, date)
    const byProvider = store.getFromIndex(store.indexes.calendarByProvider, providerId)

    return Array.from(byDate)
      .filter((id) => byProvider.has(id))
      .map((id) => store.state.calendarEvents.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  },

  // Events für einen Zeitraum (Woche/Monat)
  getByDateRange(providerId: ID, startDate: string, endDate: string): CalendarEvent[] {
    const providerEvents = store.getFromIndex(store.indexes.calendarByProvider, providerId)

    return Array.from(providerEvents)
      .map((id) => store.state.calendarEvents.get(id)!)
      .filter(Boolean)
      .filter((e) => e.date >= startDate && e.date <= endDate)
      .sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date)
        return dateCmp !== 0 ? dateCmp : a.startTime.localeCompare(b.startTime)
      })
  },

  // Events für einen Standort
  getByLocation(locationId: ID, date?: string): CalendarEvent[] {
    const ids = store.getFromIndex(store.indexes.calendarByLocation, locationId)
    let result = Array.from(ids)
      .map((id) => store.state.calendarEvents.get(id)!)
      .filter(Boolean)

    if (date) {
      result = result.filter((e) => e.date === date)
    }

    return result.sort((a, b) => a.startTime.localeCompare(b.startTime))
  },

  // Events für einen Trainer
  getByInstructor(instructorId: ID, date?: string): CalendarEvent[] {
    const ids = store.getFromIndex(store.indexes.calendarByInstructor, instructorId)
    let result = Array.from(ids)
      .map((id) => store.state.calendarEvents.get(id)!)
      .filter(Boolean)

    if (date) {
      result = result.filter((e) => e.date === date)
    }

    return result.sort((a, b) => a.startTime.localeCompare(b.startTime))
  },

  // --- Konflikterkennung ---

  _timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
    return startA < endB && startB < endA
  },

  detectConflicts(providerId: ID, date: string): CalendarConflict[] {
    const events = this.getByDate(providerId, date)
    const conflicts: CalendarConflict[] = []

    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i]
        const b = events[j]

        if (!this._timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) continue

        // Raum-Konflikt
        if (a.locationId && b.locationId && a.locationId === b.locationId) {
          conflicts.push({
            eventA: a,
            eventB: b,
            conflictType: 'room_overlap',
            description: `Raumkonflikt: "${a.title}" und "${b.title}" zur gleichen Zeit am gleichen Standort`,
          })
        }

        // Trainer-Konflikt
        if (a.instructorId && b.instructorId && a.instructorId === b.instructorId) {
          conflicts.push({
            eventA: a,
            eventB: b,
            conflictType: 'instructor_overlap',
            description: `Trainerkonflikt: "${a.title}" und "${b.title}" – gleicher Trainer zur gleichen Zeit`,
          })
        }
      }
    }

    return conflicts
  },

  // Konflikte für einen Zeitraum
  detectConflictsInRange(providerId: ID, startDate: string, endDate: string): CalendarConflict[] {
    const allConflicts: CalendarConflict[] = []

    // Alle Daten im Bereich durchgehen
    const start = new Date(startDate)
    const end = new Date(endDate)
    const current = new Date(start)

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0]
      allConflicts.push(...this.detectConflicts(providerId, dateStr))
      current.setDate(current.getDate() + 1)
    }

    return allConflicts
  },

  // --- iCal Export ---

  generateICalFeed(providerId: ID, startDate: string, endDate: string): string {
    const events = this.getByDateRange(providerId, startDate, endDate)
    const provider = store.state.providers.get(providerId)
    const calName = provider ? provider.name : 'Urban Kids Club'

    let ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//Urban Kids Club//${calName}//DE`,
      `X-WR-CALNAME:${calName}`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ]

    for (const event of events) {
      const dtStart = `${event.date.replace(/-/g, '')}T${event.startTime.replace(':', '')}00`
      const dtEnd = `${event.date.replace(/-/g, '')}T${event.endTime.replace(':', '')}00`

      ical.push(
        'BEGIN:VEVENT',
        `UID:${event.id}@urbankidsclub.de`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${event.title}`,
      )

      if (event.description) {
        ical.push(`DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`)
      }

      // Location hinzufügen
      if (event.locationId) {
        const location = store.state.locations.get(event.locationId)
        if (location) {
          ical.push(`LOCATION:${location.name}, ${location.address.street}, ${location.address.city}`)
        }
      }

      if (event.recurring && event.recurrenceRule) {
        ical.push(`RRULE:${event.recurrenceRule}`)
      }

      ical.push('END:VEVENT')
    }

    ical.push('END:VCALENDAR')
    return ical.join('\r\n')
  },

  // Aus Activities automatisch Kalender-Events generieren
  syncActivitiesToCalendar(providerId: ID): CalendarEvent[] {
    const activityIds = store.getFromIndex(store.indexes.activitiesByProvider, providerId)
    const created: CalendarEvent[] = []

    for (const actId of activityIds) {
      const activity = store.state.activities.get(actId)
      if (!activity || activity.status !== 'published') continue

      const schedule = activity.schedule

      if (schedule.type === 'single') {
        created.push(this.create({
          providerId,
          activityId: actId,
          locationId: activity.locationId,
          instructorId: activity.instructorId,
          title: activity.title,
          date: schedule.date,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          type: 'activity',
        }))
      } else if (schedule.type === 'recurring') {
        // Erstelle Events für die nächsten 12 Wochen
        for (const slot of schedule.slots) {
          const targetDay = DAY_TO_NUMBER[slot.day]
          const start = new Date(schedule.startDate)
          const end = schedule.endDate ? new Date(schedule.endDate) : new Date(start.getTime() + RECURRING_WEEKS_AHEAD * 7 * 24 * 60 * 60 * 1000)

          const current = new Date(start)
          // Zum richtigen Wochentag springen
          while (current.getDay() !== targetDay && current <= end) {
            current.setDate(current.getDate() + 1)
          }

          while (current <= end) {
            const dateStr = current.toISOString().split('T')[0]

            // Prüfen ob Feiertag/Ferien
            const isHoliday = this._isHoliday(providerId, dateStr)

            if (!isHoliday) {
              created.push(this.create({
                providerId,
                activityId: actId,
                locationId: activity.locationId,
                instructorId: activity.instructorId,
                title: activity.title,
                date: dateStr,
                startTime: slot.startTime,
                endTime: slot.endTime,
                recurring: true,
                type: 'activity',
              }))
            }

            current.setDate(current.getDate() + 7)
          }
        }
      } else if (schedule.type === 'camp') {
        // Camp: Jeden Tag im Zeitraum
        const current = new Date(schedule.startDate)
        const end = new Date(schedule.endDate)

        while (current <= end) {
          const dayOfWeek = current.getDay()
          // Nur Werktage (Mo–Fr), außer explizit anders
          if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            created.push(this.create({
              providerId,
              activityId: actId,
              locationId: activity.locationId,
              instructorId: activity.instructorId,
              title: `${activity.title} (Feriencamp)`,
              date: current.toISOString().split('T')[0],
              startTime: schedule.dailyStartTime,
              endTime: schedule.dailyEndTime,
              type: 'activity',
            }))
          }
          current.setDate(current.getDate() + 1)
        }
      }
    }

    return created
  },

  _isHoliday(providerId: ID, date: string): boolean {
    const holidayIds = store.getFromIndex(store.indexes.holidaysByProvider, providerId)
    for (const hid of holidayIds) {
      const holiday = store.state.holidays.get(hid)
      if (holiday && holiday.cancelActivities && date >= holiday.startDate && date <= holiday.endDate) {
        return true
      }
    }
    return false
  },

  delete(id: ID): boolean {
    const event = store.state.calendarEvents.get(id)
    if (!event) return false

    store.removeFromIndex(store.indexes.calendarByProvider, event.providerId, id)
    store.removeFromIndex(store.indexes.calendarByDate, event.date, id)
    if (event.locationId) {
      store.removeFromIndex(store.indexes.calendarByLocation, event.locationId, id)
    }
    if (event.instructorId) {
      store.removeFromIndex(store.indexes.calendarByInstructor, event.instructorId, id)
    }

    return store.state.calendarEvents.delete(id)
  },
}
