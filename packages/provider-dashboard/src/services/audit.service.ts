// ============================================================
// Audit Log Service – Compliance & Nachverfolgung
// ============================================================
// Lückenlose Protokollierung aller Aktionen für DSGVO-Compliance
// und interne Nachverfolgung. Wer hat wann was geändert?
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { AuditLogEntry, ID } from '../types'

export interface LogActionInput {
  providerId: ID
  userId: ID
  userType: 'provider' | 'team_member' | 'parent' | 'admin'
  action: string
  entityType: string
  entityId: ID
  changes?: Record<string, { old: unknown; new: unknown }>
  ipAddress?: string
}

export const AuditService = {

  log(input: LogActionInput): AuditLogEntry {
    const id = generateId('audit')

    const entry: AuditLogEntry = {
      id,
      providerId: input.providerId,
      userId: input.userId,
      userType: input.userType,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      changes: input.changes,
      ipAddress: input.ipAddress,
      timestamp: new Date(),
    }

    store.state.auditLog.set(id, entry)
    store.addToIndex(store.indexes.auditByProvider, input.providerId, id)
    store.addToIndex(store.indexes.auditByEntity, `${input.entityType}:${input.entityId}`, id)

    return entry
  },

  // Vordefinierte Aktionen
  logBookingCreated(providerId: ID, userId: ID, bookingId: ID): AuditLogEntry {
    return this.log({ providerId, userId, userType: 'parent', action: 'booking.created', entityType: 'booking', entityId: bookingId })
  },

  logBookingCancelled(providerId: ID, userId: ID, userType: AuditLogEntry['userType'], bookingId: ID): AuditLogEntry {
    return this.log({ providerId, userId, userType, action: 'booking.cancelled', entityType: 'booking', entityId: bookingId })
  },

  logActivityPublished(providerId: ID, userId: ID, activityId: ID): AuditLogEntry {
    return this.log({ providerId, userId, userType: 'provider', action: 'activity.published', entityType: 'activity', entityId: activityId })
  },

  logInvoiceSent(providerId: ID, userId: ID, invoiceId: ID): AuditLogEntry {
    return this.log({ providerId, userId, userType: 'provider', action: 'invoice.sent', entityType: 'invoice', entityId: invoiceId })
  },

  logPaymentReceived(providerId: ID, userId: ID, paymentId: ID): AuditLogEntry {
    return this.log({ providerId, userId, userType: 'provider', action: 'payment.received', entityType: 'payment', entityId: paymentId })
  },

  logConsentGiven(providerId: ID, parentId: ID, consentId: ID): AuditLogEntry {
    return this.log({ providerId, userId: parentId, userType: 'parent', action: 'consent.given', entityType: 'consent', entityId: consentId })
  },

  logConsentRevoked(providerId: ID, parentId: ID, consentId: ID): AuditLogEntry {
    return this.log({ providerId, userId: parentId, userType: 'parent', action: 'consent.revoked', entityType: 'consent', entityId: consentId })
  },

  logDataExported(providerId: ID, userId: ID, exportId: ID): AuditLogEntry {
    return this.log({ providerId, userId, userType: 'provider', action: 'data.exported', entityType: 'export', entityId: exportId })
  },

  logDataDeleted(providerId: ID, userId: ID, parentId: ID): AuditLogEntry {
    return this.log({ providerId, userId, userType: 'admin', action: 'data.deleted', entityType: 'parent', entityId: parentId })
  },

  // Abfragen
  getByProvider(providerId: ID, filters?: { action?: string; entityType?: string; since?: Date }): AuditLogEntry[] {
    const ids = store.getFromIndex(store.indexes.auditByProvider, providerId)
    let result = Array.from(ids)
      .map((id) => store.state.auditLog.get(id)!)
      .filter(Boolean)

    if (filters?.action) {
      result = result.filter((e) => e.action === filters.action)
    }
    if (filters?.entityType) {
      result = result.filter((e) => e.entityType === filters.entityType)
    }
    if (filters?.since) {
      result = result.filter((e) => e.timestamp >= filters.since!)
    }

    return result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  },

  getByEntity(entityType: string, entityId: ID): AuditLogEntry[] {
    const ids = store.getFromIndex(store.indexes.auditByEntity, `${entityType}:${entityId}`)
    return Array.from(ids)
      .map((id) => store.state.auditLog.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  },

  // Aktivitäts-Feed für Dashboard
  getRecentActivity(providerId: ID, limit: number = 20): AuditLogEntry[] {
    return this.getByProvider(providerId).slice(0, limit)
  },
}
