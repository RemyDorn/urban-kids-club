// ============================================================
// JSON-File Persistence – Speichert Store-State auf Disk
// Pragmatische Lösung für Launch-Phase. Später: SQLite/Supabase.
// ============================================================

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { store } from './store'

const DATA_DIR = process.env.DATA_DIR || resolve(process.cwd(), 'data')
const DATA_FILE = resolve(DATA_DIR, 'store.json')
const BACKUP_FILE = resolve(DATA_DIR, 'store.backup.json')

// Auto-Save Interval (alle 30 Sekunden)
const AUTO_SAVE_INTERVAL = parseInt(process.env.SAVE_INTERVAL || '30000')

let saveTimer: ReturnType<typeof setInterval> | null = null
let isDirty = false

// ============================================================
// Serialize: Map → Array von [key, value] Paaren
// ============================================================
function serializeState(): Record<string, [string, unknown][]> {
  const result: Record<string, [string, unknown][]> = {}
  for (const [key, map] of Object.entries(store.state)) {
    const m = map as Map<string, unknown>
    result[key] = Array.from(m.entries()).map(([k, v]) => {
      // Dates zu ISO-Strings konvertieren
      return [k, JSON.parse(JSON.stringify(v, (_key, val) => {
        if (val instanceof Date) return { __date: val.toISOString() }
        return val
      }))]
    })
  }
  return result
}

// ============================================================
// Deserialize: [key, value] Array → Map
// ============================================================
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/

function deserializeValue(val: unknown): unknown {
  if (typeof val === 'string' && ISO_DATE_RE.test(val)) {
    return new Date(val)
  }
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>
    // Date-Objekte wiederherstellen (__date Format)
    if ('__date' in obj && typeof obj.__date === 'string') {
      return new Date(obj.__date)
    }
    // Rekursiv durch Objekt gehen
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      result[k] = deserializeValue(v)
    }
    return result
  }
  if (Array.isArray(val)) {
    return val.map(deserializeValue)
  }
  return val
}

// ============================================================
// Save to Disk
// ============================================================
export function saveToDisk(): { success: boolean; entries: number } {
  try {
    // Data-Dir erstellen falls nicht vorhanden
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true })
    }

    // Backup der vorherigen Datei
    if (existsSync(DATA_FILE)) {
      try {
        const existing = readFileSync(DATA_FILE, 'utf-8')
        writeFileSync(BACKUP_FILE, existing, 'utf-8')
      } catch (_) { /* Backup fehlgeschlagen ist nicht kritisch */ }
    }

    const data = serializeState()
    const json = JSON.stringify(data, null, process.env.NODE_ENV === 'development' ? 2 : 0)
    writeFileSync(DATA_FILE, json, 'utf-8')

    let totalEntries = 0
    for (const entries of Object.values(data)) {
      totalEntries += entries.length
    }

    isDirty = false
    return { success: true, entries: totalEntries }
  } catch (err) {
    console.error('[Persistence] Fehler beim Speichern:', err)
    return { success: false, entries: 0 }
  }
}

// ============================================================
// Load from Disk
// ============================================================
export function loadFromDisk(): { success: boolean; entries: number } {
  if (!existsSync(DATA_FILE)) {
    console.log('[Persistence] Keine gespeicherten Daten gefunden. Starte mit leerem Store.')
    return { success: true, entries: 0 }
  }

  try {
    const json = readFileSync(DATA_FILE, 'utf-8')
    const data = JSON.parse(json) as Record<string, [string, unknown][]>

    let totalEntries = 0

    for (const [key, entries] of Object.entries(data)) {
      const stateMap = (store.state as Record<string, Map<string, unknown>>)[key]
      if (!stateMap) {
        console.warn(`[Persistence] Unbekannter State-Key: ${key} – wird übersprungen`)
        continue
      }

      for (const [id, value] of entries) {
        stateMap.set(id, deserializeValue(value))
        totalEntries++
      }
    }

    // Indexes neu aufbauen
    rebuildIndexes()

    console.log(`[Persistence] ${totalEntries} Einträge geladen aus ${DATA_FILE}`)
    return { success: true, entries: totalEntries }
  } catch (err) {
    console.error('[Persistence] Fehler beim Laden:', err)

    // Versuche Backup zu laden
    if (existsSync(BACKUP_FILE)) {
      console.log('[Persistence] Versuche Backup zu laden...')
      try {
        const backup = readFileSync(BACKUP_FILE, 'utf-8')
        writeFileSync(DATA_FILE, backup, 'utf-8')
        return loadFromDisk() // Rekursiv mit dem Backup
      } catch (_) {
        console.error('[Persistence] Auch Backup fehlgeschlagen.')
      }
    }

    return { success: false, entries: 0 }
  }
}

// ============================================================
// Rebuild Indexes – nach dem Laden alle Indexes neu aufbauen
// ============================================================
function rebuildIndexes(): void {
  // Alle Indexes leeren
  for (const map of Object.values(store.indexes)) {
    (map as Map<unknown, unknown>).clear()
  }

  // Providers
  for (const [id, p] of store.state.providers.entries()) {
    // Provider hat keine Standard-Index-Zuordnung
  }

  // Locations
  for (const [id, loc] of store.state.locations.entries()) {
    const l = loc as { providerId: string }
    store.addToIndex(store.indexes.locationsByProvider, l.providerId, id)
  }

  // Team Members
  for (const [id, tm] of store.state.teamMembers.entries()) {
    const t = tm as { providerId: string }
    store.addToIndex(store.indexes.teamByProvider, t.providerId, id)
  }

  // Activities
  for (const [id, act] of store.state.activities.entries()) {
    const a = act as { providerId: string; category: string; locationId?: string }
    store.addToIndex(store.indexes.activitiesByProvider, a.providerId, id)
    store.addToIndex(store.indexes.activitiesByCategory, a.category, id)
    if (a.locationId) store.addToIndex(store.indexes.activitiesByLocation, a.locationId, id)
  }

  // Bookings
  for (const [id, bk] of store.state.bookings.entries()) {
    const b = bk as { activityId: string; providerId: string; parentId: string }
    store.addToIndex(store.indexes.bookingsByActivity, b.activityId, id)
    store.addToIndex(store.indexes.bookingsByProvider, b.providerId, id)
    store.addToIndex(store.indexes.bookingsByParent, b.parentId, id)
  }

  // Parents
  for (const [id, par] of store.state.parents.entries()) {
    // Parents haben keine Standard-Index-Zuordnung
  }

  // Reviews
  for (const [id, rev] of store.state.reviews.entries()) {
    const r = rev as { providerId: string; activityId?: string }
    store.addToIndex(store.indexes.reviewsByProvider, r.providerId, id)
    if (r.activityId) store.addToIndex(store.indexes.reviewsByActivity, r.activityId, id)
  }

  // Course Blocks
  for (const [id, cb] of store.state.courseBlocks.entries()) {
    const b = cb as { providerId: string; activityId: string; activityType: string }
    store.addToIndex(store.indexes.blocksByProvider, b.providerId, id)
    store.addToIndex(store.indexes.blocksByActivity, b.activityId, id)
    store.addToIndex(store.indexes.blocksByActivityType, b.activityType, id)
  }

  // Block Sessions
  for (const [id, sess] of store.state.blockSessions.entries()) {
    const s = sess as { blockId: string; date: string }
    store.addToIndex(store.indexes.sessionsByBlock, s.blockId, id)
    store.addToIndex(store.indexes.sessionsByDate, s.date, id)
  }

  // Block Enrollments
  for (const [id, enr] of store.state.blockEnrollments.entries()) {
    const e = enr as { blockId: string; childId: string; parentId: string; providerId: string }
    store.addToIndex(store.indexes.enrollmentsByBlock, e.blockId, id)
    store.addToIndex(store.indexes.enrollmentsByChild, e.childId, id)
    store.addToIndex(store.indexes.enrollmentsByParent, e.parentId, id)
    store.addToIndex(store.indexes.enrollmentsByProvider, e.providerId, id)
  }

  // Session Credits
  for (const [id, cr] of store.state.sessionCredits.entries()) {
    const c = cr as { childId: string; blockId: string; enrollmentId: string; providerId: string; activityType: string }
    store.addToIndex(store.indexes.creditsByChild, c.childId, id)
    store.addToIndex(store.indexes.creditsByBlock, c.blockId, id)
    store.addToIndex(store.indexes.creditsByEnrollment, c.enrollmentId, id)
    store.addToIndex(store.indexes.creditsByProvider, c.providerId, id)
    store.addToIndex(store.indexes.creditsByActivityType, c.activityType, id)
  }

  // Makeup Bookings
  for (const [id, mb] of store.state.makeupBookings.entries()) {
    const m = mb as { creditId: string; targetSessionId: string; childId: string }
    store.addToIndex(store.indexes.makeupsByCredit, m.creditId, id)
    store.addToIndex(store.indexes.makeupsBySession, m.targetSessionId, id)
    store.addToIndex(store.indexes.makeupsByChild, m.childId, id)
  }

  // Session Attendances
  for (const [id, att] of store.state.sessionAttendances.entries()) {
    const a = att as { sessionId: string; childId: string; enrollmentId: string }
    store.addToIndex(store.indexes.sessionAttendancesBySession, a.sessionId, id)
    store.addToIndex(store.indexes.sessionAttendancesByChild, a.childId, id)
    store.addToIndex(store.indexes.sessionAttendancesByEnrollment, a.enrollmentId, id)
  }

  // Invoices, Messages, Coupons, etc. – analog
  for (const [id, inv] of store.state.invoices.entries()) {
    const i = inv as { providerId: string; parentId: string }
    store.addToIndex(store.indexes.invoicesByProvider, i.providerId, id)
    store.addToIndex(store.indexes.invoicesByParent, i.parentId, id)
  }

  for (const [id, wl] of store.state.waitlistEntries.entries()) {
    const w = wl as { activityId: string; parentId: string }
    store.addToIndex(store.indexes.waitlistByActivity, w.activityId, id)
    store.addToIndex(store.indexes.waitlistByParent, w.parentId, id)
  }
}

// ============================================================
// Auto-Save starten / stoppen
// ============================================================
export function startAutoSave(): void {
  if (saveTimer) return

  saveTimer = setInterval(() => {
    if (isDirty) {
      const result = saveToDisk()
      if (result.success) {
        console.log(`[Persistence] Auto-Save: ${result.entries} Einträge gespeichert`)
      }
    }
  }, AUTO_SAVE_INTERVAL)

  console.log(`[Persistence] Auto-Save aktiviert (alle ${AUTO_SAVE_INTERVAL / 1000}s)`)
}

export function stopAutoSave(): void {
  if (saveTimer) {
    clearInterval(saveTimer)
    saveTimer = null
  }
}

// Wird von Services aufgerufen nach jeder Schreiboperation
export function markDirty(): void {
  isDirty = true
}

// ============================================================
// Graceful Shutdown – Daten speichern vor Exit
// ============================================================
function onShutdown(): void {
  console.log('\n[Persistence] Speichere Daten vor Shutdown...')
  const result = saveToDisk()
  if (result.success) {
    console.log(`[Persistence] ${result.entries} Einträge gespeichert. Tschüss!`)
  }
}

process.on('SIGINT', () => { onShutdown(); process.exit(0) })
process.on('SIGTERM', () => { onShutdown(); process.exit(0) })
