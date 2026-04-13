// ============================================================
// SessionCredit Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { sessionCreditFromDb, sessionCreditToDb } from './mappers'
import type { SessionCredit, SessionCreditStatus, ID } from '../../types'

const TABLE = 'session_credits'

export const SupabaseSessionCreditService = {

  async issue(enrollmentId: ID, sessionId: ID, reason: 'parent_cancellation' | 'provider_cancellation'): Promise<SessionCredit> {
    const sb = getServiceClient()

    // Fetch enrollment for context
    const { data: enrollment } = await sb.from('block_enrollments').select('*').eq('id', enrollmentId).single()
    // Fetch block for validity
    const { data: block } = await sb.from('course_blocks').select('*').eq('id', enrollment.block_id).single()
    // Fetch session
    const { data: session } = await sb.from('block_sessions').select('*').eq('id', sessionId).single()

    const validUntil = block.extended_end_date ?? block.end_date

    const row = sessionCreditToDb({
      enrollmentId,
      blockId: enrollment.block_id,
      providerId: block.provider_id,
      parentId: enrollment.parent_id,
      childId: enrollment.child_id,
      activityType: block.activity_type,
      reason,
      isProviderCancellation: reason === 'provider_cancellation',
      originalSessionId: sessionId,
      originalSessionDate: session.date,
      status: 'available',
      validUntil,
    })

    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error

    // Update enrollment credits earned if parent cancellation
    if (reason === 'parent_cancellation') {
      await sb.from('block_enrollments')
        .update({ credits_earned: (enrollment.credits_earned ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', enrollmentId)
    }

    return sessionCreditFromDb(data)
  },

  async list(parentId: ID, activityType?: string): Promise<SessionCredit[]> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').eq('parent_id', parentId).order('created_at', { ascending: false })
    if (activityType) query = query.eq('activity_type', activityType)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(sessionCreditFromDb)
  },

  async markUsed(creditId: ID, sessionId: ID): Promise<SessionCredit | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'used', used_in_session_id: sessionId, used_at: new Date().toISOString() })
      .eq('id', creditId).eq('status', 'available')
      .select().maybeSingle()
    if (error) throw error
    return data ? sessionCreditFromDb(data) : undefined
  },

  async expireOverdue(): Promise<number> {
    const sb = getServiceClient()
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'expired' })
      .eq('status', 'available')
      .lt('valid_until', today)
      .select('id')
    if (error) throw error
    return data?.length ?? 0
  },
}
