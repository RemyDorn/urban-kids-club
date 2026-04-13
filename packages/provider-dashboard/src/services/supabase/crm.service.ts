// ============================================================
// CRM Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { contactNoteFromDb, contactNoteToDb, parentFromDb } from './mappers'
import type { ContactNote, Parent, ID } from '../../types'

export const SupabaseCrmService = {

  async addNote(parentId: ID, providerId: ID, content: string): Promise<ContactNote> {
    const sb = getServiceClient()
    const row = contactNoteToDb({
      parentId,
      providerId,
      authorId: providerId, // Provider is the default author
      content,
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

  async listCustomers(providerId: ID): Promise<Array<{
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

    if (parentStats.size === 0) return []

    // Fetch parent details
    const parentIds = Array.from(parentStats.keys())
    const { data: parents } = await sb.from('parents').select('*').in('id', parentIds)

    return (parents ?? []).map((p) => {
      const parent = parentFromDb(p)
      const stats = parentStats.get(parent.id)!
      return {
        parent,
        bookingCount: stats.count,
        totalSpent: Math.round(stats.spent * 100) / 100,
        lastBookingAt: stats.last ? new Date(stats.last) : undefined,
      }
    }).sort((a, b) => b.totalSpent - a.totalSpent)
  },
}
