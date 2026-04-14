// ============================================================
// Waitlist Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { waitlistEntryFromDb, waitlistEntryToDb } from './mappers'
import type { WaitlistEntry, ChildInfo, ID } from '../../types'

const TABLE = 'waitlist_entries'
const OFFER_EXPIRY_HOURS = 48

export const SupabaseWaitlistService = {

  async add(input: { activityId: ID; parentId: ID; child: ChildInfo } | ID, parentId?: ID, childInfo?: ChildInfo): Promise<WaitlistEntry | { error: string }> {
    const activityId = typeof input === 'object' ? input.activityId : input
    const pid = typeof input === 'object' ? input.parentId : parentId!
    const child = typeof input === 'object' ? input.child : childInfo!
    return this._addInternal(activityId, pid, child)
  },

  async _addInternal(activityId: ID, parentId: ID, childInfo: ChildInfo): Promise<WaitlistEntry | { error: string }> {
    const sb = getServiceClient()

    // Duplicate check
    const { data: existing } = await sb.from(TABLE)
      .select('id').eq('activity_id', activityId).eq('parent_id', parentId)
      .in('status', ['waiting', 'offered'])
    if (existing?.length) return { error: 'Kind ist bereits auf der Warteliste' }

    // Get max position
    const { data: maxRows } = await sb.from(TABLE)
      .select('position').eq('activity_id', activityId)
      .order('position', { ascending: false }).limit(1)
    const maxPos = maxRows?.[0]?.position ?? 0

    const row = waitlistEntryToDb({
      activityId,
      parentId,
      child: childInfo,
      position: maxPos + 1,
      priority: 'normal',
      status: 'waiting',
    })

    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return waitlistEntryFromDb(data)
  },

  // Routes compatibility aliases
  async listByActivity(activityId: ID): Promise<WaitlistEntry[]> {
    return this.list(activityId)
  },

  async list(activityId: ID): Promise<WaitlistEntry[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*')
      .eq('activity_id', activityId)
      .in('status', ['waiting', 'offered'])
      .order('position', { ascending: true })
    if (error) throw error
    return (data ?? []).map(waitlistEntryFromDb)
  },

  async offer(id: ID): Promise<WaitlistEntry | undefined> {
    const sb = getServiceClient()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + OFFER_EXPIRY_HOURS * 60 * 60 * 1000)
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'offered', notified_at: now.toISOString(), expires_at: expiresAt.toISOString() })
      .eq('id', id).eq('status', 'waiting')
      .select().maybeSingle()
    if (error) throw error
    return data ? waitlistEntryFromDb(data) : undefined
  },

  async accept(id: ID): Promise<WaitlistEntry | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'accepted' })
      .eq('id', id).eq('status', 'offered')
      .select().maybeSingle()
    if (error) throw error
    return data ? waitlistEntryFromDb(data) : undefined
  },

  async decline(id: ID): Promise<WaitlistEntry | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'declined' })
      .eq('id', id).eq('status', 'offered')
      .select().maybeSingle()
    if (error) throw error
    return data ? waitlistEntryFromDb(data) : undefined
  },
}
