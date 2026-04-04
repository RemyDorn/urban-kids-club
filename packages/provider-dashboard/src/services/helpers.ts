// ============================================================
// Shared Helpers – Deduplizierte Patterns
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { ID, NotificationType, NotificationChannel } from '../types'

// --- Entity lookup from index (deduplicated pattern) ---

export function getEntitiesFromIndex<T>(
  entityMap: Map<ID, T>,
  index: Map<ID, Set<ID>>,
  key: ID
): T[] {
  const ids = store.getFromIndex(index, key)
  return Array.from(ids)
    .map((id) => entityMap.get(id))
    .filter((e): e is T => e !== undefined)
}

// --- Notification creation (used in 10+ places) ---

export function createNotification(input: {
  recipientType: 'parent' | 'provider' | 'team_member'
  recipientId: ID
  type: NotificationType
  channel?: NotificationChannel
  title: string
  body: string
  data?: Record<string, string>
}): ID {
  const id = generateId('notif')
  store.state.notifications.set(id, {
    id,
    recipientType: input.recipientType,
    recipientId: input.recipientId,
    type: input.type,
    channel: input.channel ?? 'email',
    title: input.title,
    body: input.body,
    data: input.data,
    read: false,
    sentAt: new Date(),
  })
  store.addToIndex(store.indexes.notificationsByRecipient, input.recipientId, id)
  return id
}

// --- Audit log creation (used in 5+ places) ---

export function createAuditEntry(input: {
  providerId: ID
  userId: ID
  userType: 'provider' | 'team_member' | 'parent' | 'admin'
  action: string
  entityType: string
  entityId: ID
  changes?: Record<string, { old: unknown; new: unknown }>
}): ID {
  const id = generateId('audit')
  store.state.auditLog.set(id, {
    id,
    ...input,
    timestamp: new Date(),
  })
  store.addToIndex(store.indexes.auditByProvider, input.providerId, id)
  store.addToIndex(store.indexes.auditByEntity, `${input.entityType}:${input.entityId}`, id)
  return id
}

// --- Document status calculation (used in 3 places) ---

export function calcDocumentStatus(expiresAt: Date | undefined): 'valid' | 'expiring_soon' | 'expired' | 'pending_review' {
  if (!expiresAt) return 'pending_review'
  const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  if (daysUntilExpiry < 0) return 'expired'
  if (daysUntilExpiry < 30) return 'expiring_soon'
  return 'valid'
}

// --- Day-of-week map (used in calendar + validators) ---

export const DAY_TO_NUMBER: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
}

// --- Weeks to generate for recurring schedules ---

export const RECURRING_WEEKS_AHEAD = 12
