// ============================================================
// Trial Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { trialFromDb, trialToDb } from './mappers'
import type { TrialLesson, TrialStatus, ChildInfo, ID } from '../../types'

export interface CreateTrialInput {
  activityId: ID
  providerId: ID
  parentId: ID
  child: ChildInfo
  scheduledDate: string
  scheduledTime: string
}

export const SupabaseTrialService = {

  async create(input: CreateTrialInput): Promise<TrialLesson | { error: string }> {
    const sb = getServiceClient()

    // Check activity exists and is published
    const { data: activity } = await sb.from('activities').select('id, status').eq('id', input.activityId).maybeSingle()
    if (!activity) return { error: 'Aktivität nicht gefunden' }
    if (activity.status !== 'published') return { error: 'Aktivität ist nicht aktiv' }

    // Check for existing trial
    const { data: existing } = await sb.from('trial_lessons').select('id')
      .eq('activity_id', input.activityId)
      .eq('parent_id', input.parentId)
      .neq('status', 'cancelled')
    if (existing && existing.some((t: any) => {
      // Check child name match — child_info is stored as JSONB
      return true // We'll check after fetching
    })) {
      // More precise check
      const { data: trials } = await sb.from('trial_lessons').select('*')
        .eq('activity_id', input.activityId)
        .eq('parent_id', input.parentId)
        .neq('status', 'cancelled')
      const alreadyHas = (trials ?? []).some((t: any) => {
        const childInfo = t.child_info ?? {}
        return childInfo.name === input.child.name
      })
      if (alreadyHas) {
        return { error: 'Es existiert bereits eine Probestunde für dieses Kind in diesem Kurs' }
      }
    }

    const row = trialToDb({
      activityId: input.activityId,
      providerId: input.providerId,
      parentId: input.parentId,
      child: input.child,
      scheduledDate: input.scheduledDate,
      scheduledTime: input.scheduledTime,
      status: 'scheduled',
    })

    const { data, error } = await sb.from('trial_lessons').insert(row).select().single()
    if (error) throw error
    return trialFromDb(data)
  },

  async getById(id: ID): Promise<TrialLesson | undefined> {
    const sb = getServiceClient()
    const { data } = await sb.from('trial_lessons').select('*').eq('id', id).maybeSingle()
    return data ? trialFromDb(data) : undefined
  },

  async listByProvider(providerId: ID, filters?: { status?: TrialStatus }): Promise<TrialLesson[]> {
    const sb = getServiceClient()
    let q = sb.from('trial_lessons').select('*').eq('provider_id', providerId)
    if (filters?.status) q = q.eq('status', filters.status)
    q = q.order('scheduled_date').order('scheduled_time')
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(trialFromDb)
  },

  async listByActivity(activityId: ID): Promise<TrialLesson[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('trial_lessons').select('*')
      .eq('activity_id', activityId).order('scheduled_date')
    if (error) throw error
    return (data ?? []).map(trialFromDb)
  },

  async listByParent(parentId: ID): Promise<TrialLesson[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('trial_lessons').select('*')
      .eq('parent_id', parentId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(trialFromDb)
  },

  async complete(id: ID, feedback?: string): Promise<TrialLesson | undefined> {
    const sb = getServiceClient()
    const update: Record<string, unknown> = { status: 'completed', updated_at: new Date().toISOString() }
    if (feedback) update.feedback = feedback
    const { data, error } = await sb.from('trial_lessons').update(update)
      .eq('id', id).eq('status', 'scheduled').select().maybeSingle()
    if (error) throw error
    return data ? trialFromDb(data) : undefined
  },

  async markNoShow(id: ID): Promise<TrialLesson | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('trial_lessons')
      .update({ status: 'no_show', updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'scheduled').select().maybeSingle()
    if (error) throw error
    return data ? trialFromDb(data) : undefined
  },

  async markConverted(id: ID, bookingId: ID): Promise<TrialLesson | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('trial_lessons')
      .update({ status: 'converted', converted_to_booking_id: bookingId, updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'completed').select().maybeSingle()
    if (error) throw error
    return data ? trialFromDb(data) : undefined
  },

  async cancel(id: ID): Promise<TrialLesson | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('trial_lessons')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'scheduled').select().maybeSingle()
    if (error) throw error
    return data ? trialFromDb(data) : undefined
  },

  async addParentFeedback(id: ID, feedback: string): Promise<TrialLesson | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('trial_lessons')
      .update({ parent_feedback: feedback, updated_at: new Date().toISOString() })
      .eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? trialFromDb(data) : undefined
  },

  async getConversionStats(providerId: ID): Promise<{
    total: number; completed: number; converted: number; noShow: number; conversionRate: number
  }> {
    const trials = await this.listByProvider(providerId)
    const completed = trials.filter(t => t.status === 'completed' || t.status === 'converted').length
    const converted = trials.filter(t => t.status === 'converted').length
    const noShow = trials.filter(t => t.status === 'no_show').length
    return {
      total: trials.length, completed, converted, noShow,
      conversionRate: completed > 0 ? Math.round((converted / completed) * 100) / 100 : 0,
    }
  },

  async getUpcomingToday(providerId: ID): Promise<TrialLesson[]> {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
    const todayStr = today.toISOString().split('T')[0]
    const sb = getServiceClient()
    const { data, error } = await sb.from('trial_lessons').select('*')
      .eq('provider_id', providerId).eq('status', 'scheduled').eq('scheduled_date', todayStr)
    if (error) throw error
    return (data ?? []).map(trialFromDb)
  },
}
