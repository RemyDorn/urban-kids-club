// ============================================================
// Message Service – Kommunikation Provider ↔ Eltern
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { Message, MessageType, ID } from '../types'

export interface SendMessageInput {
  providerId: ID
  parentId?: ID
  activityId?: ID
  type: MessageType
  subject?: string
  body: string
}

export const MessageService = {

  send(input: SendMessageInput): Message {
    const id = generateId('msg')

    const message: Message = {
      id,
      providerId: input.providerId,
      parentId: input.parentId,
      activityId: input.activityId,
      type: input.type,
      subject: input.subject,
      body: input.body,
      read: false,
      sentAt: new Date(),
    }

    store.state.messages.set(id, message)
    store.addToIndex(store.indexes.messagesByProvider, input.providerId, id)
    if (input.parentId) {
      store.addToIndex(store.indexes.messagesByParent, input.parentId, id)
    }

    return message
  },

  // Broadcast an alle Teilnehmer eines Kurses
  broadcast(providerId: ID, activityId: ID, subject: string, body: string): Message[] {
    const bookingIds = store.getFromIndex(store.indexes.bookingsByActivity, activityId)
    const parentIds = new Set<string>()

    for (const bid of bookingIds) {
      const booking = store.state.bookings.get(bid)
      if (booking && (booking.status === 'confirmed' || booking.status === 'pending')) {
        parentIds.add(booking.parentId)
      }
    }

    const messages: Message[] = []
    for (const parentId of parentIds) {
      messages.push(
        this.send({
          providerId,
          parentId,
          activityId,
          type: 'broadcast',
          subject,
          body,
        })
      )
    }

    return messages
  },

  getById(id: ID): Message | undefined {
    return store.state.messages.get(id)
  },

  // Konversation zwischen Provider und Elternteil
  getConversation(providerId: ID, parentId: ID): Message[] {
    const providerMessages = store.getFromIndex(store.indexes.messagesByProvider, providerId)
    const parentMessages = store.getFromIndex(store.indexes.messagesByParent, parentId)

    // Schnittmenge
    const conversationIds = Array.from(providerMessages).filter((id) => parentMessages.has(id))

    return conversationIds
      .map((id) => store.state.messages.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
  },

  // Alle Nachrichten für einen Provider (Inbox)
  getInbox(providerId: ID, filters?: { unreadOnly?: boolean; type?: MessageType }): Message[] {
    const ids = store.getFromIndex(store.indexes.messagesByProvider, providerId)
    let result = Array.from(ids)
      .map((id) => store.state.messages.get(id)!)
      .filter(Boolean)

    if (filters?.unreadOnly) {
      result = result.filter((m) => !m.read)
    }
    if (filters?.type) {
      result = result.filter((m) => m.type === filters.type)
    }

    return result.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
  },

  // Nachrichten für ein Elternteil
  getParentMessages(parentId: ID): Message[] {
    const ids = store.getFromIndex(store.indexes.messagesByParent, parentId)
    return Array.from(ids)
      .map((id) => store.state.messages.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
  },

  markAsRead(id: ID): Message | undefined {
    const message = store.state.messages.get(id)
    if (!message) return undefined
    message.read = true
    return message
  },

  markAllAsRead(providerId: ID): number {
    const ids = store.getFromIndex(store.indexes.messagesByProvider, providerId)
    let count = 0
    for (const id of ids) {
      const message = store.state.messages.get(id)
      if (message && !message.read) {
        message.read = true
        count++
      }
    }
    return count
  },

  getUnreadCount(providerId: ID): number {
    const ids = store.getFromIndex(store.indexes.messagesByProvider, providerId)
    return Array.from(ids)
      .map((id) => store.state.messages.get(id)!)
      .filter((m) => m && !m.read).length
  },

  delete(id: ID): boolean {
    const message = store.state.messages.get(id)
    if (!message) return false

    store.removeFromIndex(store.indexes.messagesByProvider, message.providerId, id)
    if (message.parentId) {
      store.removeFromIndex(store.indexes.messagesByParent, message.parentId, id)
    }
    return store.state.messages.delete(id)
  },
}
