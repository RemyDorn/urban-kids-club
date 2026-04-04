// ============================================================
// Notification Service – Benachrichtigungen (130%-Feature)
// ============================================================
// In-Memory Notification-System. In Produktion würde man hier
// E-Mail (SendGrid/Resend), Push (FCM), SMS (Twilio) anbinden.
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type {
  Notification,
  NotificationType,
  NotificationChannel,
  NotificationPreference,
  ID,
} from '../types'

export interface SendNotificationInput {
  recipientType: 'parent' | 'provider' | 'team_member'
  recipientId: ID
  type: NotificationType
  channel: NotificationChannel
  title: string
  body: string
  data?: Record<string, string>
}

// In-Memory Event-Queue für ausgehende Notifications
const notificationQueue: Notification[] = []

export const NotificationService = {

  send(input: SendNotificationInput): Notification {
    const id = generateId('notif')

    const notification: Notification = {
      id,
      recipientType: input.recipientType,
      recipientId: input.recipientId,
      type: input.type,
      channel: input.channel,
      title: input.title,
      body: input.body,
      data: input.data,
      read: false,
      sentAt: new Date(),
    }

    store.state.notifications.set(id, notification)
    store.addToIndex(store.indexes.notificationsByRecipient, input.recipientId, id)

    // In Queue für asynchrone Verarbeitung
    notificationQueue.push(notification)

    return notification
  },

  // Bequeme Helfer für häufige Benachrichtigungen

  sendBookingConfirmation(parentId: ID, bookingId: ID, activityTitle: string): Notification {
    return this.send({
      recipientType: 'parent',
      recipientId: parentId,
      type: 'booking_confirmed',
      channel: 'email',
      title: 'Buchungsbestätigung',
      body: `Ihre Buchung für "${activityTitle}" wurde bestätigt.`,
      data: { bookingId },
    })
  },

  sendBookingCancellation(parentId: ID, bookingId: ID, activityTitle: string): Notification {
    return this.send({
      recipientType: 'parent',
      recipientId: parentId,
      type: 'booking_cancelled',
      channel: 'email',
      title: 'Buchung storniert',
      body: `Ihre Buchung für "${activityTitle}" wurde storniert.`,
      data: { bookingId },
    })
  },

  sendReminder(parentId: ID, activityTitle: string, date: string, time: string): Notification {
    return this.send({
      recipientType: 'parent',
      recipientId: parentId,
      type: 'booking_reminder',
      channel: 'email',
      title: 'Erinnerung: Morgen Kurs',
      body: `Erinnerung: "${activityTitle}" findet morgen am ${date} um ${time} statt.`,
      data: { date, time },
    })
  },

  sendWaitlistPromotion(parentId: ID, activityTitle: string): Notification {
    return this.send({
      recipientType: 'parent',
      recipientId: parentId,
      type: 'waitlist_promoted',
      channel: 'email',
      title: 'Platz frei geworden!',
      body: `Ein Platz in "${activityTitle}" ist frei geworden! Bitte bestätigen Sie innerhalb von 48 Stunden.`,
    })
  },

  sendPaymentOverdue(parentId: ID, invoiceNumber: string, amount: number): Notification {
    return this.send({
      recipientType: 'parent',
      recipientId: parentId,
      type: 'payment_overdue',
      channel: 'email',
      title: `Zahlungserinnerung – ${invoiceNumber}`,
      body: `Die Rechnung ${invoiceNumber} über ${amount} € ist überfällig. Bitte begleichen Sie den Betrag.`,
      data: { invoiceNumber, amount: amount.toString() },
    })
  },

  sendReviewRequest(parentId: ID, activityTitle: string, activityId: ID): Notification {
    return this.send({
      recipientType: 'parent',
      recipientId: parentId,
      type: 'review_request',
      channel: 'email',
      title: 'Wie war der Kurs?',
      body: `Ihr Kind hat "${activityTitle}" besucht. Wir würden uns über Ihre Bewertung freuen!`,
      data: { activityId },
    })
  },

  sendDocumentExpiring(providerId: ID, documentName: string, expiresAt: string): Notification {
    return this.send({
      recipientType: 'provider',
      recipientId: providerId,
      type: 'document_expiring',
      channel: 'in_app',
      title: 'Dokument läuft ab',
      body: `Das Dokument "${documentName}" läuft am ${expiresAt} ab. Bitte erneuern Sie es rechtzeitig.`,
    })
  },

  // Für einen Empfänger abrufen
  getByRecipient(recipientId: ID, filters?: { unread?: boolean; type?: NotificationType }): Notification[] {
    const ids = store.getFromIndex(store.indexes.notificationsByRecipient, recipientId)
    let result = Array.from(ids)
      .map((id) => store.state.notifications.get(id)!)
      .filter(Boolean)

    if (filters?.unread) {
      result = result.filter((n) => !n.read)
    }
    if (filters?.type) {
      result = result.filter((n) => n.type === filters.type)
    }

    return result.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
  },

  markAsRead(id: ID): Notification | undefined {
    const notification = store.state.notifications.get(id)
    if (!notification) return undefined
    notification.read = true
    notification.readAt = new Date()
    return notification
  },

  markAllAsRead(recipientId: ID): number {
    const notifications = this.getByRecipient(recipientId, { unread: true })
    const now = new Date()
    for (const n of notifications) {
      n.read = true
      n.readAt = now
    }
    return notifications.length
  },

  getUnreadCount(recipientId: ID): number {
    return this.getByRecipient(recipientId, { unread: true }).length
  },

  // --- Preferences ---

  setPreference(
    userId: ID,
    userType: 'parent' | 'provider',
    type: NotificationType,
    channels: NotificationChannel[],
    enabled: boolean
  ): NotificationPreference {
    // Vorhandene Preference suchen
    const existingIds = store.getFromIndex(store.indexes.preferencesByUser, userId)
    for (const pid of existingIds) {
      const pref = store.state.notificationPreferences.get(pid)
      if (pref && pref.type === type) {
        pref.channels = channels
        pref.enabled = enabled
        return pref
      }
    }

    const id = generateId('pref')
    const preference: NotificationPreference = {
      id,
      userId,
      userType,
      type,
      channels,
      enabled,
    }

    store.state.notificationPreferences.set(id, preference)
    store.addToIndex(store.indexes.preferencesByUser, userId, id)

    return preference
  },

  getPreferences(userId: ID): NotificationPreference[] {
    const ids = store.getFromIndex(store.indexes.preferencesByUser, userId)
    return Array.from(ids)
      .map((id) => store.state.notificationPreferences.get(id)!)
      .filter(Boolean)
  },

  // Queue für externe Verarbeitung (E-Mail, Push, SMS)
  drainQueue(): Notification[] {
    const drained = [...notificationQueue]
    notificationQueue.length = 0
    return drained
  },

  getQueueSize(): number {
    return notificationQueue.length
  },
}
