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

export const WAITLIST_SIGNAL = '__WAITLIST__' as const

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
    if (ageRange.min > ageRange.max) {
      return fail('Altersrange ungültig: min > max')
    }
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
      .map((id) => store.state.bookings.get(id))
      .filter((b): b is NonNullable<typeof b> => b !== undefined && b.child.name === childName && b.status !== 'cancelled')

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
  // Gibt { valid: false, waitlist: true } zurück wenn Warteliste aktiviert ist
  activityHasCapacity(activityId: ID): ValidationResult & { waitlist?: boolean } {
    const activity = store.state.activities.get(activityId)
    if (!activity) return fail('Aktivität nicht gefunden')

    const bookingIds = store.getFromIndex(store.indexes.bookingsByActivity, activityId)
    const activeCount = Array.from(bookingIds)
      .map((id) => store.state.bookings.get(id))
      .filter((b) => b && (b.status === 'confirmed' || b.status === 'pending'))
      .length

    if (activeCount >= activity.capacity) {
      if (activity.waitlistEnabled) {
        return { valid: false, errors: [WAITLIST_SIGNAL], waitlist: true }
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
    if (!isValidDateFormat(startDate) || !isValidDateFormat(endDate)) {
      return fail('Datumsformat muss YYYY-MM-DD sein')
    }
    if (endDate < startDate) {
      return fail('Enddatum muss nach Startdatum liegen')
    }
    return ok()
  },

  dateNotInPast(date: string): ValidationResult {
    if (!isValidDateFormat(date)) {
      return fail('Datumsformat muss YYYY-MM-DD sein')
    }
    const today = getLocalDateString()
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
    if (!email || email.length > 254) return fail('Ungültige E-Mail-Adresse')
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
    return emailRegex.test(email) ? ok() : fail('Ungültige E-Mail-Adresse')
  },

  // --- E-Mail-Eindeutigkeit ---

  emailUniqueForParent(email: string, excludeId?: ID): ValidationResult {
    const existing = Array.from(store.state.parents.values()).find(
      (p) => p.email.toLowerCase() === email.toLowerCase() && p.id !== excludeId
    )
    return existing ? fail('E-Mail-Adresse ist bereits vergeben') : ok()
  },

  emailUniqueForTeamMember(email: string, providerId: ID, excludeId?: ID): ValidationResult {
    const teamIds = store.getFromIndex(store.indexes.teamByProvider, providerId)
    for (const tid of teamIds) {
      const member = store.state.teamMembers.get(tid)
      if (member && member.email.toLowerCase() === email.toLowerCase() && member.id !== excludeId) {
        return fail('E-Mail-Adresse ist bereits vergeben')
      }
    }
    return ok()
  },

  // --- IBAN (mit MOD-97 Prüfsumme) ---

  ibanValid(iban: string): ValidationResult {
    const cleaned = iban.replace(/\s/g, '').toUpperCase()
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleaned)) {
      return fail('Ungültiges IBAN-Format')
    }
    // Einfache Längenprüfung DE
    if (cleaned.startsWith('DE') && cleaned.length !== 22) {
      return fail('Deutsche IBAN muss 22 Zeichen haben')
    }
    // MOD-97 Prüfsummenvalidierung (ISO 13616)
    if (!validateIbanChecksum(cleaned)) {
      return fail('IBAN-Prüfsumme ist ungültig')
    }
    return ok()
  },

  // --- Währung ---

  currencyConsistent(a: Currency, b: Currency): ValidationResult {
    return a === b ? ok() : fail(`Währung stimmt nicht überein: ${a} vs. ${b}`)
  },

  // --- Betrag ---

  amountPositive(amount: number, label: string = 'Betrag'): ValidationResult {
    if (typeof amount !== 'number' || isNaN(amount)) return fail(`${label} muss eine Zahl sein`)
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
    for (const slotA of a.slots) {
      for (const slotB of b.slots) {
        if (slotA.day === slotB.day) {
          if (timesOverlap(slotA.startTime, slotA.endTime, slotB.startTime, slotB.endTime)) {
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

  // Mixed types: Cross-Typ-Prüfung
  if (a.type === 'single' && b.type === 'recurring') {
    return singleOverlapsRecurring(a, b)
  }
  if (a.type === 'recurring' && b.type === 'single') {
    return singleOverlapsRecurring(b, a)
  }
  if (a.type === 'single' && b.type === 'camp') {
    return singleOverlapsCamp(a, b)
  }
  if (a.type === 'camp' && b.type === 'single') {
    return singleOverlapsCamp(b, a)
  }
  if (a.type === 'recurring' && b.type === 'camp') {
    return recurringOverlapsCamp(a, b)
  }
  if (a.type === 'camp' && b.type === 'recurring') {
    return recurringOverlapsCamp(b, a)
  }

  return false
}

// --- Cross-Typ Overlap-Helfer ---

const DAY_NAMES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

function singleOverlapsRecurring(single: Extract<Schedule, { type: 'single' }>, recurring: Extract<Schedule, { type: 'recurring' }>): boolean {
  const singleDate = new Date(single.date)
  const dayName = DAY_NAMES[singleDate.getDay()]
  const recurringEnd = recurring.endDate ?? '9999-12-31'

  if (single.date < recurring.startDate || single.date > recurringEnd) return false

  for (const slot of recurring.slots) {
    if (slot.day === dayName && timesOverlap(single.startTime, single.endTime, slot.startTime, slot.endTime)) {
      return true
    }
  }
  return false
}

function singleOverlapsCamp(single: Extract<Schedule, { type: 'single' }>, camp: Extract<Schedule, { type: 'camp' }>): boolean {
  if (single.date < camp.startDate || single.date > camp.endDate) return false
  return timesOverlap(single.startTime, single.endTime, camp.dailyStartTime, camp.dailyEndTime)
}

function recurringOverlapsCamp(recurring: Extract<Schedule, { type: 'recurring' }>, camp: Extract<Schedule, { type: 'camp' }>): boolean {
  const recurringEnd = recurring.endDate ?? '9999-12-31'
  if (recurring.startDate > camp.endDate || camp.startDate > recurringEnd) return false

  // Prüfe ob einer der recurring Wochentage in den Camp-Zeitraum fällt
  const campStart = new Date(camp.startDate)
  const campEnd = new Date(camp.endDate)
  const current = new Date(campStart)

  while (current <= campEnd) {
    const dayName = DAY_NAMES[current.getDay()]
    const dateStr = current.toISOString().split('T')[0]

    if (dateStr >= recurring.startDate && dateStr <= recurringEnd) {
      for (const slot of recurring.slots) {
        if (slot.day === dayName && timesOverlap(slot.startTime, slot.endTime, camp.dailyStartTime, camp.dailyEndTime)) {
          return true
        }
      }
    }
    current.setDate(current.getDate() + 1)
  }
  return false
}

// --- IBAN MOD-97 Prüfsumme ---

function validateIbanChecksum(iban: string): boolean {
  // Erste 4 Zeichen ans Ende verschieben
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  // Buchstaben durch Zahlen ersetzen (A=10, B=11, ..., Z=35)
  let numericString = ''
  for (const char of rearranged) {
    const code = char.charCodeAt(0)
    if (code >= 65 && code <= 90) {
      numericString += (code - 55).toString()
    } else {
      numericString += char
    }
  }
  // MOD 97 berechnen (große Zahl, daher stückweise)
  let remainder = 0
  for (const digit of numericString) {
    remainder = (remainder * 10 + parseInt(digit)) % 97
  }
  return remainder === 1
}

// --- Datums-Helfer ---

function isValidDateFormat(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
}

function getLocalDateString(): string {
  // Verwende lokale Zeitzone (CET/CEST für Deutschland) statt UTC
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export { timesOverlap, schedulesOverlap, validateIbanChecksum, getLocalDateString }
