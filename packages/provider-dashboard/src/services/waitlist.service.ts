// ============================================================
// Waitlist Service – Erweiterte Warteliste-Logik
// ============================================================
// Priorisierung: Geschwisterkinder, Stammkunden, normale Warteliste.
// Automatisches Nachrücken mit Frist zur Annahme.
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { WaitlistEntry, ChildInfo, ID } from '../types'

export interface AddToWaitlistInput {
  activityId: ID
  courseBlockId?: ID
  parentId: ID
  child: ChildInfo
  priority?: 'normal' | 'sibling' | 'returning' | 'high'
}

const OFFER_EXPIRY_HOURS = 48 // Frist zur Annahme

export const WaitlistService = {

  // Auto-expire offered entries that have passed their deadline
  _autoExpireOffers(): void {
    const now = new Date()
    for (const entry of store.state.waitlistEntries.values()) {
      if (
        entry.status === 'offered' &&
        entry.expiresAt &&
        now > entry.expiresAt
      ) {
        entry.status = 'expired'
      }
    }
  },

  add(input: AddToWaitlistInput): WaitlistEntry | { error: string } {
    // Duplikat-Check: Scope auf courseBlockId wenn vorhanden, sonst Activity-Level
    const scopeEntries = input.courseBlockId
      ? this.listByCourseBlock(input.courseBlockId)
      : this.listByActivity(input.activityId)
    const duplicate = scopeEntries.find(
      (e) => e.parentId === input.parentId && e.child.name === input.child.name
    )
    if (duplicate) {
      return { error: input.courseBlockId
        ? 'Kind ist bereits auf der Warteliste für diesen Kursblock'
        : 'Kind ist bereits auf der Warteliste für diesen Kurs' }
    }

    const id = generateId('wl')
    const now = new Date()
    const maxPosition = scopeEntries.reduce((max, e) => Math.max(max, e.position), 0)

    const entry: WaitlistEntry = {
      id,
      activityId: input.activityId,
      courseBlockId: input.courseBlockId,
      parentId: input.parentId,
      child: input.child,
      position: maxPosition + 1,
      priority: input.priority ?? 'normal',
      addedAt: now,
      status: 'waiting',
    }

    store.state.waitlistEntries.set(id, entry)
    store.addToIndex(store.indexes.waitlistByActivity, input.activityId, id)
    store.addToIndex(store.indexes.waitlistByParent, input.parentId, id)
    if (input.courseBlockId) {
      store.addToIndex(store.indexes.waitlistByCourseBlock, input.courseBlockId, id)
    }

    // Neuordnung nach Priorität (innerhalb Block-Scope wenn vorhanden)
    if (input.courseBlockId) {
      this._reorderByPriority(input.activityId, input.courseBlockId)
    } else {
      this._reorderByPriority(input.activityId)
    }

    return entry
  },

  getById(id: ID): WaitlistEntry | undefined {
    return store.state.waitlistEntries.get(id)
  },

  listByActivity(activityId: ID): WaitlistEntry[] {
    this._autoExpireOffers()
    const ids = store.getFromIndex(store.indexes.waitlistByActivity, activityId)
    return Array.from(ids)
      .map((id) => store.state.waitlistEntries.get(id)!)
      .filter(Boolean)
      .filter((e) => e.status === 'waiting' || e.status === 'offered')
      .sort((a, b) => a.position - b.position)
  },

  listByParent(parentId: ID): WaitlistEntry[] {
    const ids = store.getFromIndex(store.indexes.waitlistByParent, parentId)
    return Array.from(ids)
      .map((id) => store.state.waitlistEntries.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime())
  },

  // Nächsten Kandidaten auf der Warteliste einen Platz anbieten
  offerNextSpot(activityId: ID): WaitlistEntry | undefined {
    const waitlist = this.listByActivity(activityId)
    const next = waitlist.find((e) => e.status === 'waiting')

    if (!next) return undefined

    const now = new Date()
    next.status = 'offered'
    next.notifiedAt = now
    next.expiresAt = new Date(now.getTime() + OFFER_EXPIRY_HOURS * 60 * 60 * 1000)

    return next
  },

  // Elternteil nimmt den Platz an
  accept(id: ID): WaitlistEntry | undefined {
    const entry = store.state.waitlistEntries.get(id)
    if (!entry || entry.status !== 'offered') return undefined

    // Prüfen ob Frist abgelaufen
    if (entry.expiresAt && new Date() > entry.expiresAt) {
      entry.status = 'expired'
      return undefined
    }

    entry.status = 'accepted'
    return entry
  },

  // Elternteil lehnt ab
  decline(id: ID): WaitlistEntry | undefined {
    const entry = store.state.waitlistEntries.get(id)
    if (!entry || entry.status !== 'offered') return undefined

    entry.status = 'declined'

    // Automatisch nächsten Kandidaten anbieten
    this.offerNextSpot(entry.activityId)

    return entry
  },

  // Abgelaufene Angebote behandeln
  expireStaleOffers(): WaitlistEntry[] {
    const now = new Date()
    const expired: WaitlistEntry[] = []

    for (const entry of store.state.waitlistEntries.values()) {
      if (
        entry.status === 'offered' &&
        entry.expiresAt &&
        now > entry.expiresAt
      ) {
        entry.status = 'expired'
        expired.push(entry)

        // Nächsten Kandidaten anbieten
        this.offerNextSpot(entry.activityId)
      }
    }

    return expired
  },

  // Position in Warteliste
  getPosition(id: ID): number | undefined {
    const entry = store.state.waitlistEntries.get(id)
    if (!entry) return undefined
    return entry.position
  },

  getWaitlistSize(activityId: ID): number {
    return this.listByActivity(activityId).length
  },

  listByCourseBlock(courseBlockId: ID): WaitlistEntry[] {
    this._autoExpireOffers()
    const ids = store.getFromIndex(store.indexes.waitlistByCourseBlock, courseBlockId)
    return Array.from(ids)
      .map((id) => store.state.waitlistEntries.get(id)!)
      .filter(Boolean)
      .filter((e) => e.status === 'waiting' || e.status === 'offered')
      .sort((a, b) => a.position - b.position)
  },

  remove(id: ID): boolean {
    const entry = store.state.waitlistEntries.get(id)
    if (!entry) return false

    store.removeFromIndex(store.indexes.waitlistByActivity, entry.activityId, id)
    store.removeFromIndex(store.indexes.waitlistByParent, entry.parentId, id)
    if (entry.courseBlockId) {
      store.removeFromIndex(store.indexes.waitlistByCourseBlock, entry.courseBlockId, id)
    }
    store.state.waitlistEntries.delete(id)

    // Positionen neu vergeben
    if (entry.courseBlockId) {
      this._reorderByPriority(entry.activityId, entry.courseBlockId)
    } else {
      this._reorderByPriority(entry.activityId)
    }

    return true
  },

  // Neuordnung: Hohe Priorität zuerst, dann nach Zeitpunkt
  // Wenn courseBlockId angegeben, nur innerhalb dieses Blocks reordern
  _reorderByPriority(activityId: ID, courseBlockId?: ID): void {
    const priorityOrder = { high: 0, sibling: 1, returning: 2, normal: 3 }
    const entries = courseBlockId
      ? this.listByCourseBlock(courseBlockId)
      : this.listByActivity(activityId)

    entries.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (pDiff !== 0) return pDiff
      return a.addedAt.getTime() - b.addedAt.getTime()
    })

    entries.forEach((entry, index) => {
      entry.position = index + 1
    })
  },
}
