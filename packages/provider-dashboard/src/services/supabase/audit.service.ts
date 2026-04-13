// ============================================================
// Audit Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { auditLogFromDb, auditLogToDb } from './mappers'
import type { AuditLogEntry, ID } from '../../types'

const TABLE = 'audit_log'

export const SupabaseAuditService = {

  async log(
    providerId: ID,
    action: string,
    entityType: string,
    entityId: ID,
    changes?: Record<string, { old: unknown; new: unknown }>,
  ): Promise<AuditLogEntry> {
    const sb = getServiceClient()
    const row = auditLogToDb({
      providerId,
      userId: providerId,
      userType: 'provider',
      action,
      entityType,
      entityId,
      changes,
    })
    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return auditLogFromDb(data)
  },

  async list(providerId: ID, filters?: { entityType?: string; action?: string; limit?: number }): Promise<AuditLogEntry[]> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').eq('provider_id', providerId).order('timestamp', { ascending: false })
    if (filters?.entityType) query = query.eq('entity_type', filters.entityType)
    if (filters?.action) query = query.eq('action', filters.action)
    query = query.limit(filters?.limit ?? 100)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(auditLogFromDb)
  },
}
