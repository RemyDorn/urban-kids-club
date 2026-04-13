// ============================================================
// CourseBlock Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { courseBlockFromDb, courseBlockToDb, blockSessionFromDb, blockSessionToDb, blockEnrollmentFromDb, blockEnrollmentToDb } from './mappers'
import type { CourseBlock, BlockSession, BlockEnrollment, DayOfWeek, Currency, ID } from '../../types'

const BLOCK_TABLE = 'course_blocks'
const SESSION_TABLE = 'block_sessions'
const ENROLLMENT_TABLE = 'block_enrollments'

const DAY_TO_NUMBER: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const totalMin = h * 60 + m + minutes
  const newH = Math.floor(totalMin / 60) % 24
  const newM = totalMin % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

function generateSessionDates(startDate: string, recurringDay: DayOfWeek, totalSessions: number): string[] {
  const targetDay = DAY_TO_NUMBER[recurringDay]
  const dates: string[] = []
  const current = new Date(startDate + 'T00:00:00Z')
  while (current.getUTCDay() !== targetDay) current.setUTCDate(current.getUTCDate() + 1)
  for (let i = 0; i < totalSessions; i++) {
    dates.push(current.toISOString().split('T')[0])
    current.setUTCDate(current.getUTCDate() + 7)
  }
  return dates
}

export const SupabaseCourseBlockService = {

  async list(providerId: ID): Promise<CourseBlock[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(BLOCK_TABLE).select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(courseBlockFromDb)
  },

  async getById(id: ID): Promise<CourseBlock | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(BLOCK_TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? courseBlockFromDb(data) : undefined
  },

  async create(input: {
    providerId: ID; activityId: ID; activityType: string; seasonLabel: string;
    totalSessions?: number; startDate: string; recurringDay: DayOfWeek;
    recurringTime: string; durationMinutes?: number; pricePerBlock?: number;
    currency?: Currency; capacity: number; makeupCapacity?: number;
    maxCreditsPerEnrollment?: number; cancellationDeadlineMinutes?: number;
  }): Promise<CourseBlock> {
    const sb = getServiceClient()
    const totalSessions = input.totalSessions ?? 8
    const durationMinutes = input.durationMinutes ?? 60
    const dates = generateSessionDates(input.startDate, input.recurringDay, totalSessions)
    const endDate = dates[dates.length - 1]
    const endTime = addMinutes(input.recurringTime, durationMinutes)

    const blockRow = courseBlockToDb({
      providerId: input.providerId,
      activityId: input.activityId,
      activityType: input.activityType,
      seasonLabel: input.seasonLabel,
      totalSessions,
      startDate: dates[0],
      endDate,
      recurringDay: input.recurringDay,
      recurringTime: input.recurringTime,
      durationMinutes,
      pricePerBlock: input.pricePerBlock ?? 140,
      currency: input.currency ?? 'EUR',
      capacity: input.capacity,
      makeupCapacity: input.makeupCapacity ?? 2,
      maxCreditsPerEnrollment: input.maxCreditsPerEnrollment ?? 2,
      cancellationDeadlineMinutes: input.cancellationDeadlineMinutes ?? 1440,
      status: 'upcoming',
    })

    const { data: blockData, error: blockErr } = await sb.from(BLOCK_TABLE).insert(blockRow).select().single()
    if (blockErr) throw blockErr
    const block = courseBlockFromDb(blockData)

    // Generate sessions
    const sessionRows = dates.map((date, i) => blockSessionToDb({
      blockId: block.id,
      sessionNumber: i + 1,
      date,
      startTime: input.recurringTime,
      endTime,
      status: 'scheduled',
    }))

    const { error: sessErr } = await sb.from(SESSION_TABLE).insert(sessionRows)
    if (sessErr) throw sessErr

    return block
  },

  async enroll(blockId: ID, input: {
    parentId: ID; childId: string; childName: string; childAge: number;
    pricePaid?: number; currency?: Currency; bookingId?: ID;
  }): Promise<BlockEnrollment | { error: string }> {
    const sb = getServiceClient()
    const block = await this.getById(blockId)
    if (!block) return { error: 'Block nicht gefunden' }

    // Check duplicate
    const { data: existing } = await sb.from(ENROLLMENT_TABLE)
      .select('id').eq('block_id', blockId).eq('child_id', input.childId).eq('status', 'active')
    if (existing?.length) return { error: 'Kind ist bereits in diesem Block eingeschrieben' }

    // Check capacity
    const { count } = await sb.from(ENROLLMENT_TABLE)
      .select('*', { count: 'exact', head: true }).eq('block_id', blockId).eq('status', 'active')
    if ((count ?? 0) >= block.capacity) return { error: `Block ist voll (${block.capacity} Plätze belegt)` }

    const row = blockEnrollmentToDb({
      blockId,
      activityType: block.activityType,
      providerId: block.providerId,
      parentId: input.parentId,
      childId: input.childId,
      childName: input.childName,
      childAge: input.childAge,
      bookingId: input.bookingId,
      status: 'active',
      pricePaid: input.pricePaid ?? block.pricePerBlock,
      currency: input.currency ?? block.currency,
      creditsEarned: 0,
      creditsUsed: 0,
    })

    const { data, error } = await sb.from(ENROLLMENT_TABLE).insert(row).select().single()
    if (error) throw error
    return blockEnrollmentFromDb(data)
  },

  async markSessionCompleted(sessionId: ID): Promise<BlockSession | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(SESSION_TABLE)
      .update({ status: 'completed' }).eq('id', sessionId).select().maybeSingle()
    if (error) throw error
    return data ? blockSessionFromDb(data) : undefined
  },

  async cancelSession(sessionId: ID, reason: string): Promise<BlockSession | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(SESSION_TABLE)
      .update({ status: 'cancelled_by_provider', cancellation_reason: reason })
      .eq('id', sessionId).select().maybeSingle()
    if (error) throw error
    return data ? blockSessionFromDb(data) : undefined
  },
}
