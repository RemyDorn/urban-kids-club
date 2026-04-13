// ============================================================
// Notification Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { notificationFromDb, notificationToDb } from './mappers'
import type { Notification, ID } from '../../types'

const TABLE = 'notifications'

export const SupabaseNotificationService = {

  async create(input: Omit<Notification, 'id' | 'sentAt' | 'read' | 'readAt'>): Promise<Notification> {
    const sb = getServiceClient()
    const row = notificationToDb({
      ...input,
      read: false,
      sentAt: new Date(),
    } as Partial<Notification>)
    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return notificationFromDb(data)
  },

  async list(recipientId: ID): Promise<Notification[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*')
      .eq('recipient_id', recipientId)
      .order('sent_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(notificationFromDb)
  },

  async markRead(id: ID): Promise<Notification | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? notificationFromDb(data) : undefined
  },

  async getUnreadCount(recipientId: ID): Promise<number> {
    const sb = getServiceClient()
    const { count, error } = await sb.from(TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', recipientId)
      .eq('read', false)
    if (error) throw error
    return count ?? 0
  },
}
