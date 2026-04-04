// ============================================================
// Validation Layer – Zentrale Validierungs-Logik
// ============================================================
// Alle Business-Validierungen an einem Ort statt verstreut in Services.
// Wird von Services aufgerufen bevor Daten geschrieben werden.
// ============================================================

import { store } from '../domain/store'
import type { ID, ChildInfo, AgeRange, Schedule, Currency } from '../types'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

function ok(): ValidationResult {
  return { valid: true, errors: [] }
}

function fail(...errors: string[]): ValidationResult {
  return { valid: false, errors }
}

function merge(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((r) => r.errors)
  return { valid: errors.length === 0, errors }
}

export const Validators = {

  // --- Entity-Existenz ---

  providerExists(providerId: ID): ValidationResult {
    return store.state.providers.has(providerId) ? ok() : fail('Provider nicht gefunden')
  },

  activityExists(activityId: ID): ValidationResult {
    return store.state.activities.has(activityId) ? ok() : fail('Aktivität nicht gefunden')
  },

  parentExists(parentId: ID): ValidationResult {
    return store.state.parents.has(parentId) ? ok() : fail('Elternteil nicht gefunden')
  },

  bookingExists(bookingId: ID): ValidationResult {
    return store.state.bookings.has(bookingId) ? ok() : fail('Buchung nicht gefunden')
  },

  locationExists(locationId: ID): ValidationResult {
    return store.state.locations.has(locationId) ? ok() : fail('Standort nicht gefunden')
  },

  teamMemberExists(memberId: ID): ValidationResult {
    return store.state.teamMembers.has(memberId) ? ok() : fail('Teammitglied nicht gefunden')
  },

  // --- Kind & Altersgruppe ---

  childAgeInRange(child: ChildInfo, ageRange: AgeRange): ValidationResult {
    if (child.age < ageRange.min || child.age > ageRange.max) {
      return fail(
        `Kind ist ${child.age} Jahre alt, Kurs ist für ${ageRange.min}–${ageRange.max} Jahre`
      )
    }
    return ok()
  },

  childInfoComplete(child: ChildInfo): ValidationResult {
    const errors: string[] = []
    if (!child.name || child.name.trim().length === 0) errors.push('Kindname ist erforderlich')
    if (child.age < 0 || child.age > 18) errors.push('Alter muss zwischen 0 und 18 liegen')
    if (!child.emergencyContact) errors.push('Notfallkontakt ist erforderlich')
    if (!child.emergencyPhone) errors.push('Notfalltelefonnummer ist erforderlich')
    return errors.length === 0 ? ok() : fail(...errors)
  },

  // --- Doppelbuchung ---

  noDoubleBooking(activityId: ID, parentId: ID, childName: string): ValidationResult {
    const bookingIds = store.getFromIndex(store.indexes.bookingsByActivity, activityId)
    for (const bid of bookingIds) {
      const booking = store.state.bookings.get(bid)
      if (
        booking &&
        booking.parentId === parentId &&
        booking.child.name === childName &&
        booking.status !== 'cancelled' &&
        booking.status !== 'no_show'
      ) {
        return fail(`"${childName}" ist bereits für diesen Kurs gebucht`)
      }
    }
    return ok()
  },

  // --- Zeitkonflikte für ein Kind ---

  noTimeConflict(parentId: ID, childName: string, schedule: Schedule, excludeActivityId?: ID): ValidationResult {
    const parentBookings = Array.from(store.getFromIndex(store.indexes.bookingsByParent, parentId))
      .map((id) => store.state.bookings.get(id)!)
      .filter((b) => b && b.child.name === childName && b.status !== 'cancelled')

    for (const booking of parentBookings) {
      if (excludeActivityId && booking.activityId === excludeActivityId) continue

      const otherActivity = store.state.activities.get(booking.activityId)
      if (!otherActivity) continue

      if (schedulesOverlap(schedule, otherActivity.schedule)) {
        return fail(`"${childName}" hat bereits einen Kurs zur gleichen Zeit: "${otherActivity.title}"`)
      }
    }
    return ok()
  },

  // --- Kapazität ---

  activityHasCapacity(activityId: ID): ValidationResult {
    const activity = store.state.activities.get(activityId)
    if (!activity) return fail('Aktivität nicht gefunden')

    const bookingIds = store.getFromIndex(store.indexes.bookingsByActivity, activityId)
    const activeCount = Array.from(bookingIds)
      .map((id) => store.state.bookings.get(id)!)
      .filter((b) => b && (b.status === 'confirmed' || b.status === 'pending'))
      .length

    if (activeCount >= activity.capacity) {
      if (activity.waitlistEnabled) {
        return { valid: true, errors: ['WAITLIST'] } // Signal: Warteliste statt Fehler
      }
      return fail('Kurs ist ausgebucht')
    }
    return ok()
  },

  // --- Raum-Kapazität ---

  roomCapacitySufficient(locationId: ID, requiredCapacity: number): ValidationResult {
    const location = store.state.locations.get(locationId)
    if (!location) return fail('Standort nicht gefunden')
    if (location.capacity && requiredCapacity > location.capacity) {
      return fail(
        `Raumkapazität (${location.capacity}) ist kleiner als Kurskapazität (${requiredCapacity})`
      )
    }
    return ok()
  },

  // --- Datumslogik ---

  dateRangeValid(startDate: string, endDate?: string): ValidationResult {
    if (!endDate) return ok()
    if (endDate < startDate) {
      return fail('Enddatum muss nach Startdatum liegen')
    }
    return ok()
  },

  dateNotInPast(date: string): ValidationResult {
    const today = new Date().toISOString().split('T')[0]
    if (date < today) {
      return fail('Datum darf nicht in der Vergangenheit liegen')
    }
    return ok()
  },

  dateNotInHoliday(providerId: ID, date: string): ValidationResult {
    const holidayIds = store.getFromIndex(store.indexes.holidaysByProvider, providerId)
    for (const hid of holidayIds) {
      const holiday = store.state.holidays.get(hid)
      if (holiday && holiday.cancelActivities && date >= holiday.startDate && date <= holiday.endDate) {
        return fail(`Datum fällt in Ferien: "${holiday.name}" (${holiday.startDate} – ${holiday.endDate})`)
      }
    }
    return ok()
  },

  // --- Instructor-Verfügbarkeit ---

  instructorAvailable(instructorId: ID, date: string, startTime: string, endTime: string): ValidationResult {
    const calendarIds = store.getFromIndex(store.indexes.calendarByInstructor, instructorId)
    for (const cid of calendarIds) {
      const event = store.state.calendarEvents.get(cid)
      if (event && event.date === date && timesOverlap(startTime, endTime, event.startTime, event.endTime)) {
        return fail(`Trainer ist bereits gebucht: "${event.title}" um ${event.startTime}–${event.endTime}`)
      }
    }
    return ok()
  },

  // --- E-Mail ---

  emailValid(email: string): ValidationResult {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email) ? ok() : fail('Ungültige E-Mail-Adresse')
  },

  // --- IBAN ---

  ibanValid(iban: string): ValidationResult {
    const cleaned = iban.replace(/\s/g, '').toUpperCase()
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleaned)) {
      return fail('Ungültiges IBAN-Format')
    }
    // Einfache Längenprüfung DE
    if (cleaned.startsWith('DE') && cleaned.length !== 22) {
      return fail('Deutsche IBAN muss 22 Zeichen haben')
    }
    return ok()
  },

  // --- Währung ---

  currencyConsistent(a: Currency, b: Currency): ValidationResult {
    return a === b ? ok() : fail(`Währung stimmt nicht überein: ${a} vs. ${b}`)
  },

  // --- Betrag ---

  amountPositive(amount: number, label: string = 'Betrag'): ValidationResult {
    return amount > 0 ? ok() : fail(`${label} muss positiv sein`)
  },

  // --- Kombinations-Helfer ---
  merge,
  ok,
  fail,
}

// --- Zeitlogik-Helfer ---

function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && startB < endA
}

function schedulesOverlap(a: Schedule, b: Schedule): boolean {
  if (a.type === 'single' && b.type === 'single') {
    if (a.date !== b.date) return false
    return timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)
  }

  if (a.type === 'recurring' && b.type === 'recurring') {
    // Gleiche Wochentage prüfen
    for (const slotA of a.slots) {
      for (const slotB of b.slots) {
        if (slotA.day === slotB.day) {
          if (timesOverlap(slotA.startTime, slotA.endTime, slotB.startTime, slotB.endTime)) {
            // Datum-Überschneidung prüfen
            const aEnd = a.endDate ?? '9999-12-31'
            const bEnd = b.endDate ?? '9999-12-31'
            if (a.startDate <= bEnd && b.startDate <= aEnd) {
              return true
            }
          }
        }
      }
    }
  }

  if (a.type === 'camp' && b.type === 'camp') {
    if (a.startDate > b.endDate || b.startDate > a.endDate) return false
    return timesOverlap(a.dailyStartTime, a.dailyEndTime, b.dailyStartTime, b.dailyEndTime)
  }

  // Mixed types: konservativ prüfen
  return false
}

export { timesOverlap, schedulesOverlap }
