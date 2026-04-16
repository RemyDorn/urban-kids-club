// ============================================================
// CRM Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { contactNoteFromDb, contactNoteToDb, parentFromDb } from './mappers'
import type { ContactNote, Parent, ID } from '../../types'

export const SupabaseCrmService = {

  async addNote(input: { parentId: ID; providerId: ID; authorId?: ID; content: string } | ID, providerId?: ID, content?: string): Promise<ContactNote> {
    const sb = getServiceClient()
    const noteInput = typeof input === 'object'
      ? input
      : { parentId: input, providerId: providerId!, authorId: providerId!, content: content! }
    const row = contactNoteToDb({
      parentId: noteInput.parentId,
      providerId: noteInput.providerId,
      authorId: noteInput.authorId ?? noteInput.providerId,
      content: noteInput.content,
    })
    const { data, error } = await sb.from('contact_notes').insert(row).select().single()
    if (error) throw error
    return contactNoteFromDb(data)
  },

  async getNotes(parentId: ID, providerId: ID): Promise<ContactNote[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('contact_notes').select('*')
      .eq('parent_id', parentId).eq('provider_id', providerId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(contactNoteFromDb)
  },

  async listCustomers(providerId: ID, filters?: { tag?: string; minSpent?: number; query?: string }): Promise<Array<{
    parent: Parent; bookingCount: number; totalSpent: number;
    lastBookingAt?: Date;
  }>> {
    const sb = getServiceClient()

    // Get all bookings for this provider
    const { data: bookings } = await sb.from('provider_bookings')
      .select('parent_id, amount_paid, payment_status, created_at')
      .eq('provider_id', providerId)
      .not('status', 'eq', 'cancelled')

    // Aggregate per parent
    const parentStats = new Map<string, { count: number; spent: number; last: string }>()
    for (const b of bookings ?? []) {
      const existing = parentStats.get(b.parent_id) ?? { count: 0, spent: 0, last: '' }
      existing.count++
      if (b.payment_status === 'paid') existing.spent += b.amount_paid ?? 0
      if (b.created_at > existing.last) existing.last = b.created_at
      parentStats.set(b.parent_id, existing)
    }

    // Also include parents from waitlist (no bookings yet)
    const { data: waitlistParents } = await sb.from('waitlist_entries')
      .select('parent_id').in('status', ['waiting', 'offered'])
    for (const w of waitlistParents ?? []) {
      if (!parentStats.has(w.parent_id)) {
        parentStats.set(w.parent_id, { count: 0, spent: 0, last: '' })
      }
    }

    if (parentStats.size === 0) return []

    // Fetch parent details
    const parentIds = Array.from(parentStats.keys())
    const { data: parents } = await sb.from('parents').select('*').in('id', parentIds)

    let results = (parents ?? []).map((p) => {
      const parent = parentFromDb(p)
      const stats = parentStats.get(parent.id)!
      return {
        parent,
        bookingCount: stats.count,
        totalSpent: Math.round(stats.spent * 100) / 100,
        lastBookingAt: stats.last ? new Date(stats.last) : undefined,
      }
    }).sort((a, b) => b.totalSpent - a.totalSpent)

    if (filters?.minSpent !== undefined) {
      results = results.filter((r) => r.totalSpent >= filters.minSpent!)
    }
    if (filters?.query) {
      const q = filters.query.toLowerCase()
      results = results.filter((r) =>
        r.parent.name.toLowerCase().includes(q) || r.parent.email.toLowerCase().includes(q)
      )
    }

    return results
  },

  async getSegments(providerId: ID): Promise<Record<string, number>> {
    const sb = getServiceClient()
    const { data: bookings } = await sb.from('provider_bookings')
      .select('parent_id, amount_paid, payment_status, created_at').eq('provider_id', providerId).neq('status', 'cancelled')

    const parentIds = new Set<string>()
    const activeIds = new Set<string>()
    const vipIds = new Set<string>()
    const newIds = new Set<string>()
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    for (const b of bookings ?? []) {
      parentIds.add(b.parent_id)
      const created = new Date(b.created_at)
      if (created > ninetyDaysAgo) activeIds.add(b.parent_id)
      if (created > thirtyDaysAgo) newIds.add(b.parent_id)
      if (b.payment_status === 'paid' && (b.amount_paid ?? 0) >= 200) vipIds.add(b.parent_id)
    }

    // Also count waitlist parents
    const { data: waitlistParents } = await sb.from('waitlist_entries')
      .select('parent_id').in('status', ['waiting', 'offered'])
    const prospectIds = new Set<string>()
    for (const w of waitlistParents ?? []) {
      if (!parentIds.has(w.parent_id)) prospectIds.add(w.parent_id)
    }

    const total = parentIds.size + prospectIds.size
    const inactive = parentIds.size - activeIds.size

    return {
      total,
      active: activeIds.size,
      inactive: inactive > 0 ? inactive : 0,
      vip: vipIds.size,
      prospects: prospectIds.size,
      newThisMonth: newIds.size,
    }
  },

  async getExtendedProfile(parentId: ID, providerId: ID): Promise<Record<string, unknown> | undefined> {
    const sb = getServiceClient()
    const { data: parent } = await sb.from('parents').select('*').eq('id', parentId).maybeSingle()
    if (!parent) return undefined
    const { data: bookings } = await sb.from('provider_bookings').select('*').eq('parent_id', parentId).eq('provider_id', providerId)
    const notes = await this.getNotes(parentId, providerId)
    const totalSpent = (bookings ?? []).filter((b: any) => b.payment_status === 'paid').reduce((s: number, b: any) => s + (b.amount_paid ?? 0), 0)
    return {
      parent: parentFromDb(parent),
      bookings: bookings ?? [],
      notes,
      totalSpent: Math.round(totalSpent * 100) / 100,
    }
  },
}
