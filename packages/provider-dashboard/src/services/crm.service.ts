// ============================================================
// CRM / Contact Service – Kundenverwaltung (130%-Feature)
// ============================================================
// Erweiterte Kundenverwaltung für Provider: Tags, Notizen,
// Kaufhistorie, Segmentierung.
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { ContactNote, ContactTag, ParentExtended, PaymentMethod, ID } from '../types'

// --- Contact Notes ---

export interface CreateContactNoteInput {
  parentId: ID
  providerId: ID
  authorId: ID
  content: string
}

export const CrmService = {

  // Notiz zu einem Kundenkontakt hinzufügen
  addNote(input: CreateContactNoteInput): ContactNote {
    const id = generateId('note')

    const note: ContactNote = {
      id,
      parentId: input.parentId,
      providerId: input.providerId,
      authorId: input.authorId,
      content: input.content,
      createdAt: new Date(),
    }

    store.state.contactNotes.set(id, note)
    store.addToIndex(store.indexes.notesByParent, input.parentId, id)
    store.addToIndex(store.indexes.notesByProvider, input.providerId, id)

    return note
  },

  getNotes(parentId: ID, providerId: ID): ContactNote[] {
    const byParent = store.getFromIndex(store.indexes.notesByParent, parentId)
    const byProvider = store.getFromIndex(store.indexes.notesByProvider, providerId)

    return Array.from(byParent)
      .filter((id) => byProvider.has(id))
      .map((id) => store.state.contactNotes.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  // Erweitertes Kundenprofil zusammenstellen
  getExtendedProfile(parentId: ID, providerId: ID): ParentExtended | undefined {
    const parent = store.state.parents.get(parentId)
    if (!parent) return undefined

    // Buchungen bei diesem Provider
    const bookingIds = store.getFromIndex(store.indexes.bookingsByParent, parentId)
    const providerBookings = Array.from(bookingIds)
      .map((id) => store.state.bookings.get(id)!)
      .filter((b) => b && b.providerId === providerId)

    const paidBookings = providerBookings.filter((b) => b.paymentStatus === 'paid')
    const totalSpent = paidBookings.reduce((sum, b) => sum + b.amountPaid, 0)
    const bookingCount = providerBookings.length

    const sortedByDate = providerBookings.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const firstBookingAt = sortedByDate.length > 0 ? sortedByDate[0].createdAt : undefined
    const lastBookingAt = sortedByDate.length > 0 ? sortedByDate[sortedByDate.length - 1].createdAt : undefined

    // Notizen
    const notes = this.getNotes(parentId, providerId)

    return {
      ...parent,
      tags: this._autoTag(providerBookings, totalSpent),
      notes,
      totalSpent,
      bookingCount,
      firstBookingAt,
      lastBookingAt,
      language: 'de',
    }
  },

  // Auto-Tagging basierend auf Verhalten
  _autoTag(bookings: Array<{ status: string; amountPaid: number }>, totalSpent: number): ContactTag[] {
    const tags: ContactTag[] = []

    if (bookings.length === 0) {
      tags.push('prospect')
    } else if (bookings.some((b) => b.status === 'confirmed' || b.status === 'pending')) {
      tags.push('active')
    } else {
      tags.push('inactive')
    }

    if (totalSpent > 500) tags.push('vip')
    if (bookings.length >= 5) tags.push('returning')

    return tags
  },

  // Alle Kunden eines Providers mit erweiterten Daten
  listCustomers(providerId: ID, filters?: {
    tag?: ContactTag
    minSpent?: number
    query?: string
  }): ParentExtended[] {
    // Alle Parents finden, die Buchungen bei diesem Provider haben
    const bookingIds = store.getFromIndex(store.indexes.bookingsByProvider, providerId)
    const parentIds = new Set<string>()

    for (const bid of bookingIds) {
      const booking = store.state.bookings.get(bid)
      if (booking) parentIds.add(booking.parentId)
    }

    let customers = Array.from(parentIds)
      .map((pid) => this.getExtendedProfile(pid, providerId))
      .filter(Boolean) as ParentExtended[]

    if (filters?.tag) {
      customers = customers.filter((c) => c.tags.includes(filters.tag!))
    }
    if (filters?.minSpent !== undefined) {
      customers = customers.filter((c) => c.totalSpent >= filters.minSpent!)
    }
    if (filters?.query) {
      const q = filters.query.toLowerCase()
      customers = customers.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.children.some((ch) => ch.name.toLowerCase().includes(q))
      )
    }

    return customers.sort((a, b) => b.totalSpent - a.totalSpent)
  },

  // Kundensegmente für Marketing
  getSegments(providerId: ID): {
    total: number
    active: number
    inactive: number
    vip: number
    prospects: number
    newThisMonth: number
  } {
    const customers = this.listCustomers(providerId)
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    return {
      total: customers.length,
      active: customers.filter((c) => c.tags.includes('active')).length,
      inactive: customers.filter((c) => c.tags.includes('inactive')).length,
      vip: customers.filter((c) => c.tags.includes('vip')).length,
      prospects: customers.filter((c) => c.tags.includes('prospect')).length,
      newThisMonth: customers.filter((c) => c.firstBookingAt && c.firstBookingAt >= monthStart).length,
    }
  },

  deleteNote(id: ID): boolean {
    const note = store.state.contactNotes.get(id)
    if (!note) return false

    store.removeFromIndex(store.indexes.notesByParent, note.parentId, id)
    store.removeFromIndex(store.indexes.notesByProvider, note.providerId, id)
    return store.state.contactNotes.delete(id)
  },
}
