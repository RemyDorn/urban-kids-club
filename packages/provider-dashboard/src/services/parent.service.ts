// ============================================================
// Parent Service – Eltern & Kinder-Profile
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { Parent, ChildInfo, ID } from '../types'

export interface CreateParentInput {
  name: string
  email: string
  phone?: string
  children?: ChildInfo[]
}

export interface UpdateParentInput {
  name?: string
  email?: string
  phone?: string
}

export const ParentService = {

  create(input: CreateParentInput): Parent | { error: string } {
    // E-Mail-Eindeutigkeit prüfen
    const existing = this.getByEmail(input.email)
    if (existing) {
      return { error: 'E-Mail-Adresse ist bereits vergeben' }
    }

    const id = generateId('par')
    const now = new Date()

    const parent: Parent = {
      id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      children: input.children ?? [],
      createdAt: now,
    }

    store.state.parents.set(id, parent)
    return parent
  },

  getById(id: ID): Parent | undefined {
    return store.state.parents.get(id)
  },

  getByEmail(email: string): Parent | undefined {
    return Array.from(store.state.parents.values()).find(
      (p) => p.email.toLowerCase() === email.toLowerCase()
    )
  },

  list(filters?: { query?: string }): Parent[] {
    let result = Array.from(store.state.parents.values())

    if (filters?.query) {
      const q = filters.query.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.children.some((c) => c.name.toLowerCase().includes(q))
      )
    }

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  update(id: ID, input: UpdateParentInput): Parent | undefined {
    const parent = store.state.parents.get(id)
    if (!parent) return undefined

    const updated: Parent = { ...parent, ...input }
    store.state.parents.set(id, updated)
    return updated
  },

  addChild(id: ID, child: ChildInfo): Parent | undefined {
    const parent = store.state.parents.get(id)
    if (!parent) return undefined

    parent.children.push(child)
    return parent
  },

  updateChild(id: ID, childIndex: number, child: Partial<ChildInfo>): Parent | undefined {
    const parent = store.state.parents.get(id)
    if (!parent || childIndex < 0 || childIndex >= parent.children.length) return undefined

    parent.children[childIndex] = { ...parent.children[childIndex], ...child }
    return parent
  },

  removeChild(id: ID, childIndex: number): Parent | undefined {
    const parent = store.state.parents.get(id)
    if (!parent || childIndex < 0 || childIndex >= parent.children.length) return undefined

    parent.children.splice(childIndex, 1)
    return parent
  },

  // Alle Buchungen eines Elternteils
  getBookings(parentId: ID) {
    const ids = store.getFromIndex(store.indexes.bookingsByParent, parentId)
    return Array.from(ids)
      .map((id) => store.state.bookings.get(id)!)
      .filter(Boolean)
  },

  // Gesamtausgaben eines Elternteils bei einem Provider
  getTotalSpent(parentId: ID, providerId?: ID): number {
    let bookings = this.getBookings(parentId)
    if (providerId) {
      bookings = bookings.filter((b) => b.providerId === providerId)
    }
    return bookings
      .filter((b) => b.paymentStatus === 'paid')
      .reduce((sum, b) => sum + b.amountPaid, 0)
  },

  delete(id: ID): boolean {
    const parent = store.state.parents.get(id)
    if (!parent) return false

    // Bookings-Index aufräumen
    store.indexes.bookingsByParent.delete(id)
    // Messages-Index aufräumen
    store.indexes.messagesByParent.delete(id)
    // Redemptions-Index aufräumen
    store.indexes.redemptionsByParent.delete(id)

    return store.state.parents.delete(id)
  },
}
