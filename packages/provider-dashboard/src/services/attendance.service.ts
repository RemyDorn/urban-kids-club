// ============================================================
// Attendance Service – Anwesenheit & Check-In
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { AttendanceRecord, ID } from '../types'

export const AttendanceService = {

  // Check-In für eine Buchung an einem bestimmten Datum
  checkIn(bookingId: ID, activityId: ID, date: string, checkedInBy?: ID): AttendanceRecord | { error: string } {
    // Duplikat-Check: Bereits eingecheckt für dieses Datum?
    const existingIds = store.getFromIndex(store.indexes.attendanceByBooking, bookingId)
    for (const eid of existingIds) {
      const existing = store.state.attendance.get(eid)
      if (existing && existing.date === date) {
        return { error: 'Bereits eingecheckt für dieses Datum' }
      }
    }

    const id = generateId('att')
    const now = new Date()

    const record: AttendanceRecord = {
      id,
      bookingId,
      activityId,
      date,
      checkedIn: true,
      checkedInAt: now,
      checkedInBy,
    }

    store.state.attendance.set(id, record)
    store.addToIndex(store.indexes.attendanceByBooking, bookingId, id)
    store.addToIndex(store.indexes.attendanceByActivity, activityId, id)
    store.addToIndex(store.indexes.attendanceByDate, date, id)

    return record
  },

  // Abwesenheit markieren (z.B. am Ende des Tages)
  markAbsent(bookingId: ID, activityId: ID, date: string, note?: string): AttendanceRecord | { error: string } {
    // Duplikat-Check
    const existingIds = store.getFromIndex(store.indexes.attendanceByBooking, bookingId)
    for (const eid of existingIds) {
      const existing = store.state.attendance.get(eid)
      if (existing && existing.date === date) {
        return { error: 'Bereits ein Eintrag für dieses Datum vorhanden' }
      }
    }

    const id = generateId('att')

    const record: AttendanceRecord = {
      id,
      bookingId,
      activityId,
      date,
      checkedIn: false,
      note,
    }

    store.state.attendance.set(id, record)
    store.addToIndex(store.indexes.attendanceByBooking, bookingId, id)
    store.addToIndex(store.indexes.attendanceByActivity, activityId, id)
    store.addToIndex(store.indexes.attendanceByDate, date, id)

    return record
  },

  // Anwesenheitsliste für einen Kurs an einem Datum
  getByActivityAndDate(activityId: ID, date: string): AttendanceRecord[] {
    const byActivity = store.getFromIndex(store.indexes.attendanceByActivity, activityId)
    const byDate = store.getFromIndex(store.indexes.attendanceByDate, date)

    // Schnittmenge
    const intersection = Array.from(byActivity).filter((id) => byDate.has(id))

    return intersection
      .map((id) => store.state.attendance.get(id)!)
      .filter(Boolean)
  },

  // Anwesenheitshistorie für eine Buchung
  getByBooking(bookingId: ID): AttendanceRecord[] {
    const ids = store.getFromIndex(store.indexes.attendanceByBooking, bookingId)
    return Array.from(ids)
      .map((id) => store.state.attendance.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date))
  },

  // Anwesenheitsquote für einen Kurs
  getAttendanceRate(activityId: ID): { total: number; present: number; rate: number } {
    const ids = store.getFromIndex(store.indexes.attendanceByActivity, activityId)
    const records = Array.from(ids)
      .map((id) => store.state.attendance.get(id)!)
      .filter(Boolean)

    const total = records.length
    const present = records.filter((r) => r.checkedIn).length

    return {
      total,
      present,
      rate: total > 0 ? Math.round((present / total) * 100) / 100 : 0,
    }
  },
}
