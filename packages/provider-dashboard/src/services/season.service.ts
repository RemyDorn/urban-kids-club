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

import { SCHULFERIEN_2026, BUNDESLAND_NAMES, ALL_BUNDESLAENDER, type Bundesland } from './holidays-de'

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

  // Ferien für ein Bundesland importieren (alle 16 Bundesländer verfügbar)
  importGermanHolidays(providerId: ID, region: string = 'NW'): Holiday[] {
    const bundesland = region as Bundesland
    const templates = SCHULFERIEN_2026[bundesland] ?? []

    if (templates.length === 0) {
      // Fallback: versuche Alias-Mapping und Namen-Suche
      const aliases: Record<string, Bundesland> = { 'NRW': 'NW', 'BAYERN': 'BY', 'BERLIN': 'BE', 'HAMBURG': 'HH', 'HESSEN': 'HE', 'SACHSEN': 'SN', 'BREMEN': 'HB', 'SAARLAND': 'SL' }
      const alias = aliases[region.toUpperCase()]
      if (alias) return this.importGermanHolidays(providerId, alias)

      const found = ALL_BUNDESLAENDER.find((bl) =>
        BUNDESLAND_NAMES[bl].toLowerCase().includes(region.toLowerCase())
      )
      if (found) return this.importGermanHolidays(providerId, found)
      return []
    }

    return templates.map((t) =>
      this.create({
        providerId,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        cancelActivities: true,
        region: `${bundesland} (${BUNDESLAND_NAMES[bundesland]})`,
      })
    )
  },

  // Alle verfügbaren Bundesländer
  getAvailableBundeslaender(): Array<{ code: string; name: string; holidayCount: number }> {
    return ALL_BUNDESLAENDER.map((bl) => ({
      code: bl,
      name: BUNDESLAND_NAMES[bl],
      holidayCount: SCHULFERIEN_2026[bl].length,
    }))
  },

  delete(id: ID): boolean {
    const holiday = store.state.holidays.get(id)
    if (!holiday) return false

    store.removeFromIndex(store.indexes.holidaysByProvider, holiday.providerId, id)
    return store.state.holidays.delete(id)
  },
}
