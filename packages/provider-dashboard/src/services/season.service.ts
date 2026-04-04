// ============================================================
// Season & Holiday Service – Saisons & Schulferien (130%-Feature)
// ============================================================
// Kursanbieter arbeiten in Saisons (Schulhalbjahre, Ferienprogramme).
// Ferien/Feiertage beeinflussen den Kursplan.
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { Season, SeasonType, Holiday, ID } from '../types'

// --- Saisons ---

export interface CreateSeasonInput {
  providerId: ID
  name: string
  type: SeasonType
  startDate: string
  endDate: string
}

export const SeasonService = {

  create(input: CreateSeasonInput): Season {
    const id = generateId('season')

    const season: Season = {
      id,
      providerId: input.providerId,
      name: input.name,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      isActive: false,
      createdAt: new Date(),
    }

    store.state.seasons.set(id, season)
    store.addToIndex(store.indexes.seasonsByProvider, input.providerId, id)

    return season
  },

  getById(id: ID): Season | undefined {
    return store.state.seasons.get(id)
  },

  listByProvider(providerId: ID): Season[] {
    const ids = store.getFromIndex(store.indexes.seasonsByProvider, providerId)
    return Array.from(ids)
      .map((id) => store.state.seasons.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
  },

  getActiveSeason(providerId: ID): Season | undefined {
    const seasons = this.listByProvider(providerId)
    return seasons.find((s) => s.isActive)
  },

  getCurrentSeason(providerId: ID): Season | undefined {
    const today = new Date().toISOString().split('T')[0]
    const seasons = this.listByProvider(providerId)
    return seasons.find((s) => s.startDate <= today && s.endDate >= today)
  },

  activate(id: ID): Season | undefined {
    const season = store.state.seasons.get(id)
    if (!season) return undefined

    // Alle anderen Saisons des Providers deaktivieren
    const otherSeasons = this.listByProvider(season.providerId)
    for (const s of otherSeasons) {
      s.isActive = false
    }

    season.isActive = true
    return season
  },

  deactivate(id: ID): Season | undefined {
    const season = store.state.seasons.get(id)
    if (!season) return undefined
    season.isActive = false
    return season
  },

  delete(id: ID): boolean {
    const season = store.state.seasons.get(id)
    if (!season) return false

    store.removeFromIndex(store.indexes.seasonsByProvider, season.providerId, id)
    return store.state.seasons.delete(id)
  },
}

// --- Ferien / Feiertage ---

export interface CreateHolidayInput {
  providerId: ID
  name: string
  startDate: string
  endDate: string
  cancelActivities?: boolean
  region?: string
}

// Vordefinierte deutsche Schulferien (Beispiel NRW 2026)
export const GERMAN_HOLIDAYS_NRW_2026 = [
  { name: 'Osterferien NRW 2026', startDate: '2026-03-30', endDate: '2026-04-11' },
  { name: 'Pfingstferien NRW 2026', startDate: '2026-05-26', endDate: '2026-05-26' },
  { name: 'Sommerferien NRW 2026', startDate: '2026-06-29', endDate: '2026-08-11' },
  { name: 'Herbstferien NRW 2026', startDate: '2026-10-12', endDate: '2026-10-24' },
  { name: 'Weihnachtsferien NRW 2026', startDate: '2026-12-21', endDate: '2027-01-05' },
]

export const HolidayService = {

  create(input: CreateHolidayInput): Holiday {
    const id = generateId('hol')

    const holiday: Holiday = {
      id,
      providerId: input.providerId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      cancelActivities: input.cancelActivities ?? true,
      region: input.region,
    }

    store.state.holidays.set(id, holiday)
    store.addToIndex(store.indexes.holidaysByProvider, input.providerId, id)

    return holiday
  },

  getById(id: ID): Holiday | undefined {
    return store.state.holidays.get(id)
  },

  listByProvider(providerId: ID): Holiday[] {
    const ids = store.getFromIndex(store.indexes.holidaysByProvider, providerId)
    return Array.from(ids)
      .map((id) => store.state.holidays.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
  },

  // Prüfen ob ein Datum in den Ferien liegt
  isHoliday(providerId: ID, date: string): Holiday | undefined {
    const holidays = this.listByProvider(providerId)
    return holidays.find((h) => h.startDate <= date && h.endDate >= date)
  },

  // Alle freien Tage in einem Zeitraum
  getHolidayDates(providerId: ID, startDate: string, endDate: string): string[] {
    const holidays = this.listByProvider(providerId)
    const dates: string[] = []

    for (const holiday of holidays) {
      const hStart = holiday.startDate > startDate ? holiday.startDate : startDate
      const hEnd = holiday.endDate < endDate ? holiday.endDate : endDate

      if (hStart > hEnd) continue

      const current = new Date(hStart)
      const end = new Date(hEnd)

      while (current <= end) {
        dates.push(current.toISOString().split('T')[0])
        current.setDate(current.getDate() + 1)
      }
    }

    return dates
  },

  // NRW-Ferien als Vorlage importieren
  importGermanHolidays(providerId: ID, region: string = 'NRW'): Holiday[] {
    const templates = region === 'NRW' ? GERMAN_HOLIDAYS_NRW_2026 : []
    return templates.map((t) =>
      this.create({
        providerId,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        cancelActivities: true,
        region,
      })
    )
  },

  delete(id: ID): boolean {
    const holiday = store.state.holidays.get(id)
    if (!holiday) return false

    store.removeFromIndex(store.indexes.holidaysByProvider, holiday.providerId, id)
    return store.state.holidays.delete(id)
  },
}
