// ============================================================
// In-Memory Store – Zentraler Datenspeicher
// ============================================================
// Alle Daten leben im Arbeitsspeicher. Kein externer DB-Server nötig.
// Später ersetzbar durch DB-Adapter ohne Änderung der Service-Schicht.
// ============================================================

import type {
  ID,
  Provider,
  Location,
  TeamMember,
  Activity,
  Booking,
  AttendanceRecord,
  Parent,
  Review,
  Invoice,
  Message,
} from '../types'

export interface StoreState {
  providers: Map<ID, Provider>
  locations: Map<ID, Location>
  teamMembers: Map<ID, TeamMember>
  activities: Map<ID, Activity>
  bookings: Map<ID, Booking>
  attendance: Map<ID, AttendanceRecord>
  parents: Map<ID, Parent>
  reviews: Map<ID, Review>
  invoices: Map<ID, Invoice>
  messages: Map<ID, Message>
}

// --- Sekundärindizes für schnelle Lookups ---

export interface StoreIndexes {
  locationsByProvider: Map<ID, Set<ID>>
  teamByProvider: Map<ID, Set<ID>>
  activitiesByProvider: Map<ID, Set<ID>>
  activitiesByCategory: Map<string, Set<ID>>
  activitiesByLocation: Map<ID, Set<ID>>
  bookingsByActivity: Map<ID, Set<ID>>
  bookingsByProvider: Map<ID, Set<ID>>
  bookingsByParent: Map<ID, Set<ID>>
  attendanceByBooking: Map<ID, Set<ID>>
  attendanceByActivity: Map<ID, Set<ID>>
  attendanceByDate: Map<string, Set<ID>>   // "YYYY-MM-DD" → attendance IDs
  reviewsByProvider: Map<ID, Set<ID>>
  reviewsByActivity: Map<ID, Set<ID>>
  invoicesByProvider: Map<ID, Set<ID>>
  invoicesByParent: Map<ID, Set<ID>>
  messagesByProvider: Map<ID, Set<ID>>
  messagesByParent: Map<ID, Set<ID>>
}

class Store {
  state: StoreState
  indexes: StoreIndexes

  constructor() {
    this.state = {
      providers: new Map(),
      locations: new Map(),
      teamMembers: new Map(),
      activities: new Map(),
      bookings: new Map(),
      attendance: new Map(),
      parents: new Map(),
      reviews: new Map(),
      invoices: new Map(),
      messages: new Map(),
    }

    this.indexes = {
      locationsByProvider: new Map(),
      teamByProvider: new Map(),
      activitiesByProvider: new Map(),
      activitiesByCategory: new Map(),
      activitiesByLocation: new Map(),
      bookingsByActivity: new Map(),
      bookingsByProvider: new Map(),
      bookingsByParent: new Map(),
      attendanceByBooking: new Map(),
      attendanceByActivity: new Map(),
      attendanceByDate: new Map(),
      reviewsByProvider: new Map(),
      reviewsByActivity: new Map(),
      invoicesByProvider: new Map(),
      invoicesByParent: new Map(),
      messagesByProvider: new Map(),
      messagesByParent: new Map(),
    }
  }

  // --- Index-Helfer ---

  addToIndex(index: Map<string, Set<string>>, key: string, value: string): void {
    if (!index.has(key)) {
      index.set(key, new Set())
    }
    index.get(key)!.add(value)
  }

  removeFromIndex(index: Map<string, Set<string>>, key: string, value: string): void {
    const set = index.get(key)
    if (set) {
      set.delete(value)
      if (set.size === 0) index.delete(key)
    }
  }

  getFromIndex(index: Map<string, Set<string>>, key: string): Set<string> {
    return index.get(key) ?? new Set()
  }

  // --- Reset (für Tests) ---

  reset(): void {
    for (const map of Object.values(this.state)) {
      (map as Map<unknown, unknown>).clear()
    }
    for (const map of Object.values(this.indexes)) {
      (map as Map<unknown, unknown>).clear()
    }
  }
}

// Singleton – eine Instanz für die gesamte App
export const store = new Store()
