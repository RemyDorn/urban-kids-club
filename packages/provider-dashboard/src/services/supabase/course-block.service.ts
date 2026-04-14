// ============================================================
// CourseBlock Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { courseBlockFromDb, courseBlockToDb, blockSessionFromDb, blockSessionToDb, blockEnrollmentFromDb, blockEnrollmentToDb } from './mappers'
import type { CourseBlock, BlockSession, BlockEnrollment, DayOfWeek, Currency, ID } from '../../types'

const BLOCK_TABLE = 'course_blocks'
const SESSION_TABLE = 'block_sessions'
const ENROLLMENT_TABLE = 'block_enrollments'

const DAY_TO_NUMBER: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const totalMin = h * 60 + m + minutes
  const newH = Math.floor(totalMin / 60) % 24
  const newM = totalMin % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

function generateSessionDates(startDate: string, recurringDay: DayOfWeek | string, totalSessions: number): string[] {
  const targetDay = DAY_TO_NUMBER[recurringDay] ?? DAY_TO_NUMBER[String(recurringDay).toUpperCase()]
  if (targetDay === undefined) {
    console.error(`[CourseBlock] Unknown day: ${recurringDay}, defaulting to Monday`)
    return generateSessionDates(startDate, 'MO' as DayOfWeek, totalSessions)
  }
  const dates: string[] = []
  const current = new Date(startDate + 'T00:00:00Z')
  // Find the first occurrence of targetDay (max 7 iterations)
  let guard = 0
  while (current.getUTCDay() !== targetDay && guard < 7) {
    current.setUTCDate(current.getUTCDate() + 1)
    guard++
  }
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

  async getById(id: ID, providerId?: ID): Promise<CourseBlock | undefined> {
    const sb = getServiceClient()
    let query = sb.from(BLOCK_TABLE).select('*').eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.maybeSingle()
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

  async cancelSession(input: { sessionId: ID; reason?: string } | ID, reason?: string): Promise<BlockSession | { affected: number } | undefined> {
    const sb = getServiceClient()
    const sessionId = typeof input === 'object' ? input.sessionId : input
    const cancelReason = typeof input === 'object' ? (input.reason ?? reason ?? '') : (reason ?? '')
    const { data, error } = await sb.from(SESSION_TABLE)
      .update({ status: 'cancelled_by_provider', cancellation_reason: cancelReason })
      .eq('id', sessionId).select().maybeSingle()
    if (error) throw error
    return data ? blockSessionFromDb(data) : undefined
  },

  // Routes compatibility aliases
  async createBlock(input: {
    providerId: ID; activityId: ID; activityType: string; seasonLabel: string;
    totalSessions?: number; startDate: string; recurringDay: DayOfWeek;
    recurringTime: string; durationMinutes?: number; pricePerBlock?: number;
    currency?: Currency; capacity: number; makeupCapacity?: number;
    maxCreditsPerEnrollment?: number; cancellationDeadlineMinutes?: number;
  }): Promise<CourseBlock> {
    return this.create(input)
  },

  async getBlock(id: ID, providerId?: ID): Promise<CourseBlock | undefined> {
    return this.getById(id, providerId)
  },

  async getBlocksByProvider(providerId: ID): Promise<CourseBlock[]> {
    return this.list(providerId)
  },

  async getBlocksByActivityType(activityType: string, activeOnly = false): Promise<CourseBlock[]> {
    const sb = getServiceClient()
    let query = sb.from(BLOCK_TABLE).select('*').eq('activity_type', activityType)
    if (activeOnly) query = query.in('status', ['upcoming', 'active'])
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(courseBlockFromDb)
  },

  async getSessionsByBlock(blockId: ID): Promise<BlockSession[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(SESSION_TABLE).select('*').eq('block_id', blockId).order('date', { ascending: true })
    if (error) throw error
    return (data ?? []).map(blockSessionFromDb)
  },

  async getSession(sessionId: ID): Promise<BlockSession | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(SESSION_TABLE).select('*').eq('id', sessionId).maybeSingle()
    if (error) throw error
    return data ? blockSessionFromDb(data) : undefined
  },

  async enrollChild(input: {
    blockId: ID; parentId: ID; childId: string; childName: string; childAge: number;
    pricePaid?: number; currency?: Currency; bookingId?: ID;
  }): Promise<BlockEnrollment | { error: string }> {
    return this.enroll(input.blockId, input)
  },

  async getEnrollmentsByBlock(blockId: ID): Promise<BlockEnrollment[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(ENROLLMENT_TABLE).select('*').eq('block_id', blockId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(blockEnrollmentFromDb)
  },

  async getEnrollmentsByParent(parentId: ID): Promise<BlockEnrollment[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(ENROLLMENT_TABLE).select('*').eq('parent_id', parentId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(blockEnrollmentFromDb)
  },

  async getEnrollmentsByChild(childId: string): Promise<BlockEnrollment[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(ENROLLMENT_TABLE).select('*').eq('child_id', childId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(blockEnrollmentFromDb)
  },

  async getAttendanceBySession(sessionId: ID): Promise<any[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('session_attendances').select('*').eq('session_id', sessionId)
    if (error) throw error
    return data ?? []
  },

  async markAttendance(attendanceId: ID, status: string): Promise<any> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('session_attendances')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', attendanceId).select().maybeSingle()
    if (error) throw error
    return data
  },

  async getAvailableMakeupSlots(activityType: string, validUntil: string, excludeBlockId?: ID): Promise<Array<{
    blockId: ID; sessionId: ID; date: string; startTime: string; endTime: string; availableSlots: number
  }>> {
    const sb = getServiceClient()
    const today = new Date().toISOString().split('T')[0]
    let query = sb.from(SESSION_TABLE).select('*, course_blocks!inner(activity_type, makeup_capacity, capacity, provider_id)')
      .eq('course_blocks.activity_type', activityType)
      .eq('status', 'scheduled')
      .gte('date', today)
      .lte('date', validUntil)
    if (excludeBlockId) query = query.neq('block_id', excludeBlockId)
    const { data, error } = await query
    if (error) throw error
    const slots = []
    for (const row of data ?? []) {
      const block = (row as any).course_blocks
      const makeupCap = block?.makeup_capacity ?? 2
      const { count: makeupCount } = await sb.from('makeup_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('target_session_id', row.id).eq('status', 'confirmed')
      if ((makeupCount ?? 0) < makeupCap) {
        slots.push({
          blockId: row.block_id,
          sessionId: row.id,
          date: row.date,
          startTime: row.start_time,
          endTime: row.end_time,
          availableSlots: makeupCap - (makeupCount ?? 0),
        })
      }
    }
    return slots
  },

  async updateBlockStatuses(): Promise<{ activated: number; completed: number }> {
    const sb = getServiceClient()
    const today = new Date().toISOString().split('T')[0]
    // Activate upcoming blocks that have started
    const { data: activated } = await sb.from(BLOCK_TABLE)
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('status', 'upcoming').lte('start_date', today).select('id')
    // Complete active blocks that have ended
    const { data: completed } = await sb.from(BLOCK_TABLE)
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('status', 'active').lt('end_date', today).select('id')
    return { activated: activated?.length ?? 0, completed: completed?.length ?? 0 }
  },

  async extendBlock(blockId: ID, additionalSessions: number, providerId?: ID): Promise<BlockSession[] | { error: string }> {
    const block = await this.getById(blockId, providerId)
    if (!block) return { error: 'Block nicht gefunden' }
    const sb = getServiceClient()
    const { data: lastSession } = await sb.from(SESSION_TABLE)
      .select('date, start_time, end_time, session_number')
      .eq('block_id', blockId).order('date', { ascending: false }).limit(1).single()
    if (!lastSession) return { error: 'Keine Sessions gefunden' }
    const newSessions: BlockSession[] = []
    const lastDate = new Date(lastSession.date + 'T00:00:00Z')
    for (let i = 1; i <= additionalSessions; i++) {
      const nextDate = new Date(lastDate)
      nextDate.setUTCDate(nextDate.getUTCDate() + 7 * i)
      const dateStr = nextDate.toISOString().split('T')[0]
      const { data, error } = await sb.from(SESSION_TABLE).insert(blockSessionToDb({
        blockId,
        sessionNumber: (lastSession.session_number ?? 0) + i,
        date: dateStr,
        startTime: lastSession.start_time,
        endTime: lastSession.end_time,
        status: 'scheduled',
      })).select().single()
      if (error) throw error
      newSessions.push(blockSessionFromDb(data))
    }
    // Update block end_date and total_sessions
    await sb.from(BLOCK_TABLE).update({
      end_date: newSessions[newSessions.length - 1].date,
      total_sessions: (block.totalSessions ?? 0) + additionalSessions,
      updated_at: new Date().toISOString(),
    }).eq('id', blockId)
    return newSessions
  },
}
