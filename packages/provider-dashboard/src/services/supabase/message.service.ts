// ============================================================
// Message Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { messageFromDb, messageToDb } from './mappers'
import type { Message, MessageType, ID } from '../../types'

export interface SendMessageInput {
  providerId: ID
  parentId?: ID
  activityId?: ID
  type: MessageType
  subject?: string
  body: string
}

export const SupabaseMessageService = {

  async send(input: SendMessageInput): Promise<Message> {
    const sb = getServiceClient()
    const row = messageToDb({
      providerId: input.providerId,
      parentId: input.parentId,
      activityId: input.activityId,
      type: input.type,
      subject: input.subject,
      body: input.body,
      read: false,
      sentAt: new Date(),
    })
    const { data, error } = await sb.from('messages').insert(row).select().single()
    if (error) throw error
    return messageFromDb(data)
  },

  async broadcast(providerId: ID, activityId: ID, subject: string, body: string): Promise<Message[]> {
    const sb = getServiceClient()
    const { data: bookings } = await sb.from('provider_bookings').select('parent_id')
      .eq('activity_id', activityId).in('status', ['confirmed', 'pending'])
    const parentIds = [...new Set((bookings ?? []).map((b: any) => b.parent_id))]

    const messages: Message[] = []
    for (const parentId of parentIds) {
      const msg = await this.send({ providerId, parentId, activityId, type: 'broadcast', subject, body })
      messages.push(msg)
    }
    return messages
  },

  async getById(id: ID): Promise<Message | undefined> {
    const sb = getServiceClient()
    const { data } = await sb.from('messages').select('*').eq('id', id).maybeSingle()
    return data ? messageFromDb(data) : undefined
  },

  async getConversation(providerId: ID, parentId: ID): Promise<Message[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('messages').select('*')
      .eq('provider_id', providerId).eq('parent_id', parentId)
      .order('sent_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map(messageFromDb)
  },

  async getInbox(providerId: ID, filters?: { unreadOnly?: boolean; type?: MessageType }): Promise<Message[]> {
    const sb = getServiceClient()
    let q = sb.from('messages').select('*').eq('provider_id', providerId)
    if (filters?.unreadOnly) q = q.eq('read', false)
    if (filters?.type) q = q.eq('type', filters.type)
    q = q.order('sent_at', { ascending: false })
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(messageFromDb)
  },

  async getParentMessages(parentId: ID): Promise<Message[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('messages').select('*')
      .eq('parent_id', parentId).order('sent_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(messageFromDb)
  },

  async markAsRead(id: ID): Promise<Message | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('messages').update({ read: true })
      .eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? messageFromDb(data) : undefined
  },

  async markAllAsRead(providerId: ID): Promise<number> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('messages').update({ read: true })
      .eq('provider_id', providerId).eq('read', false).select('id')
    if (error) throw error
    return data?.length ?? 0
  },

  async getUnreadCount(providerId: ID): Promise<number> {
    const sb = getServiceClient()
    const { count, error } = await sb.from('messages').select('id', { count: 'exact', head: true })
      .eq('provider_id', providerId).eq('read', false)
    if (error) throw error
    return count ?? 0
  },

  async delete(id: ID): Promise<boolean> {
    const sb = getServiceClient()
    const { error } = await sb.from('messages').delete().eq('id', id)
    if (error) throw error
    return true
  },
}
