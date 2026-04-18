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

  async list(recipientId: ID, options?: { limit?: number; offset?: number }): Promise<Notification[]> {
    const sb = getServiceClient()
    const limit = options?.limit ?? 100
    const offset = options?.offset ?? 0
    const { data, error } = await sb.from(TABLE).select('*')
      .eq('recipient_id', recipientId)
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw error
    return (data ?? []).map(notificationFromDb)
  },

  async markRead(id: ID, recipientId?: ID): Promise<Notification | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE)
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    if (recipientId) query = query.eq('recipient_id', recipientId)
    const { data, error } = await query.select().maybeSingle()
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

  // Routes compatibility aliases
  async getByRecipient(recipientId: ID, filters?: { unreadOnly?: boolean }): Promise<Notification[]> {
    const notifications = await this.list(recipientId)
    if (filters?.unreadOnly) return notifications.filter((n) => !n.read)
    return notifications
  },

  async markAsRead(id: ID, recipientId?: ID): Promise<Notification | undefined> {
    return this.markRead(id, recipientId)
  },

  async markAllAsRead(recipientId: ID): Promise<number> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('recipient_id', recipientId).eq('read', false)
      .select('id')
    if (error) throw error
    return data?.length ?? 0
  },
}
