// ============================================================
// Reporting Service – Supabase-backed
// Single source of truth: provider_bookings table
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import type { ID } from '../../types'

export const SupabaseReportingService = {

  async getOverview(providerId: ID): Promise<{
    totalActivities: number; publishedActivities: number;
    totalBookings: number; confirmedBookings: number;
    totalRevenue: number; unpaidBookings: number; unpaidRevenue: number;
  }> {
    const sb = getServiceClient()

    const [actRes, bookRes] = await Promise.all([
      sb.from('activities').select('status, id, pricing').eq('provider_id', providerId),
      sb.from('provider_bookings').select('status, payment_status, amount_paid, activity_id').eq('provider_id', providerId),
    ])

    if (actRes.error) throw new Error('Aktivitäten konnten nicht geladen werden: ' + actRes.error.message)
    if (bookRes.error) throw new Error('Buchungen konnten nicht geladen werden: ' + bookRes.error.message)

    const activities = actRes.data ?? []
    const bookings = bookRes.data ?? []

    // Build activity price map for unpaid revenue calculation
    const actPriceMap = new Map<string, number>()
    for (const a of activities) {
      const pricing = a.pricing as any[]
      if (pricing?.length) actPriceMap.set(a.id, pricing[0].amount ?? pricing[0].price ?? 0)
    }

    let totalRevenue = 0
    let unpaidBookings = 0
    let unpaidRevenue = 0
    let confirmedBookings = 0

    for (const b of bookings) {
      if (b.payment_status === 'paid') totalRevenue += b.amount_paid ?? 0
      if (b.payment_status === 'unpaid' && b.status === 'confirmed') {
        unpaidBookings++
        unpaidRevenue += b.amount_paid > 0 ? b.amount_paid : (actPriceMap.get(b.activity_id) ?? 0)
      }
      if (b.status === 'confirmed') confirmedBookings++
    }

    return {
      totalActivities: activities.length,
      publishedActivities: activities.filter((a: { status: string }) => a.status === 'published').length,
      totalBookings: bookings.length,
      confirmedBookings,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      unpaidBookings,
      unpaidRevenue: Math.round(unpaidRevenue * 100) / 100,
    }
  },

  async getCourseStats(providerId: ID): Promise<Array<{
    activityId: string; title: string; capacity: number;
    booked: number; occupancy: number;
  }>> {
    const sb = getServiceClient()
    const { data: activities, error: actErr } = await sb.from('activities').select('id, title, capacity, status').eq('provider_id', providerId).eq('status', 'published')
    if (actErr) throw new Error('Kurse konnten nicht geladen werden: ' + actErr.message)

    const activityIds = (activities ?? []).map((a: { id: string }) => a.id)
    if (activityIds.length === 0) return []

    // Get individual bookings (Einzelstunden)
    const { data: bookings, error: bookErr } = await sb.from('provider_bookings').select('activity_id, status, booked_date').eq('provider_id', providerId)
    if (bookErr) throw new Error('Buchungen konnten nicht geladen werden: ' + bookErr.message)

    // Get block enrollments + sessions (Pakete: enrollment = all sessions)
    const { data: blocks } = await sb.from('course_blocks').select('id, activity_id').eq('provider_id', providerId).in('status', ['active', 'upcoming', 'completed'])
    const blockActivityMap = new Map<string, string>()
    const blockIds: string[] = []
    for (const b of blocks ?? []) { blockActivityMap.set(b.id, b.activity_id); blockIds.push(b.id) }

    // Count active enrollments per block
    let enrollmentsByBlock = new Map<string, number>()
    // Get session dates per block for per-date occupancy
    let sessionDatesByBlock = new Map<string, string[]>()
    if (blockIds.length > 0) {
      const { data: enrollments } = await sb.from('block_enrollments').select('block_id, status').in('block_id', blockIds).eq('status', 'active')
      for (const e of enrollments ?? []) {
        enrollmentsByBlock.set(e.block_id, (enrollmentsByBlock.get(e.block_id) ?? 0) + 1)
      }
      const { data: sessions } = await sb.from('block_sessions').select('block_id, date').in('block_id', blockIds).in('status', ['scheduled', 'completed'])
      for (const s of sessions ?? []) {
        if (!sessionDatesByBlock.has(s.block_id)) sessionDatesByBlock.set(s.block_id, [])
        sessionDatesByBlock.get(s.block_id)!.push(s.date)
      }
    }

    const bookingCounts = new Map<string, number>()
    const bookingsByDate = new Map<string, number>()

    // Count individual bookings
    // Track bookings without booked_date that also have no block enrollment
    const bookingsWithoutDate: Array<{ activity_id: string }> = []
    for (const b of bookings ?? []) {
      if (b.status === 'confirmed' || b.status === 'pending') {
        bookingCounts.set(b.activity_id, (bookingCounts.get(b.activity_id) ?? 0) + 1)
        if (b.booked_date) {
          const key = `${b.activity_id}:${b.booked_date}`
          bookingsByDate.set(key, (bookingsByDate.get(key) ?? 0) + 1)
        } else {
          // No specific date — need to spread across schedule dates
          bookingsWithoutDate.push({ activity_id: b.activity_id })
        }
      }
    }

    // For bookings without booked_date and no block: spread across schedule dates
    // First, build a map of activity schedules
    const activityScheduleMap = new Map<string, any>()
    for (const a of activities ?? []) {
      activityScheduleMap.set((a as any).id, a)
    }
    // Fetch full activity data for schedule info
    if (bookingsWithoutDate.length > 0) {
      const needScheduleIds = [...new Set(bookingsWithoutDate.map(b => b.activity_id))]
      const { data: fullActs } = await sb.from('activities').select('id, schedule').in('id', needScheduleIds)
      for (const fa of fullActs ?? []) activityScheduleMap.set(fa.id, fa)
    }

    // Group bookings-without-date by activity
    const noDateByActivity = new Map<string, number>()
    for (const b of bookingsWithoutDate) {
      // Only count if this activity has NO blocks (otherwise block enrollments handle it)
      const hasBlocks = [...blockActivityMap.values()].includes(b.activity_id)
      if (!hasBlocks) {
        noDateByActivity.set(b.activity_id, (noDateByActivity.get(b.activity_id) ?? 0) + 1)
      }
    }

    // Spread no-date bookings across schedule dates for their activity
    const dowMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
    for (const [actId, count] of noDateByActivity.entries()) {
      const act = activityScheduleMap.get(actId)
      const sched = act?.schedule
      const slots = Array.isArray(sched) ? sched : (sched?.slots ?? [])
      const startDate = sched?.startDate ? new Date(sched.startDate) : new Date()
      const endDate = sched?.endDate ? new Date(sched.endDate) : new Date(Date.now() + 90 * 86400000)
      // Generate all matching dates
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dayNum = d.getDay()
        const matches = slots.some((s: any) => dowMap[s.day?.toUpperCase()] === dayNum)
        if (matches) {
          const dateStr = d.toISOString().slice(0, 10)
          const key = `${actId}:${dateStr}`
          bookingsByDate.set(key, Math.max(bookingsByDate.get(key) ?? 0, count))
        }
      }
    }

    // Add block enrollments per-date (each block's enrollments only on its own sessions)
    for (const [blockId, enrollCount] of enrollmentsByBlock.entries()) {
      const actId = blockActivityMap.get(blockId)
      if (!actId) continue
      // Per-date: spread this block's enrollments across only THIS block's session dates
      const dates = sessionDatesByBlock.get(blockId) ?? []
      for (const date of dates) {
        const key = `${actId}:${date}`
        // Use this block's enrollment count for its dates (don't mix blocks)
        bookingsByDate.set(key, Math.max(bookingsByDate.get(key) ?? 0, enrollCount))
      }
    }
    // Total booked = max enrollments across any single block (for the overview card)
    // Group enrollments by activity to find the max across blocks
    const enrollByActivity = new Map<string, number>()
    for (const [blockId, enrollCount] of enrollmentsByBlock.entries()) {
      const actId = blockActivityMap.get(blockId)
      if (!actId) continue
      enrollByActivity.set(actId, (enrollByActivity.get(actId) ?? 0) + enrollCount)
    }
    for (const [actId, totalEnroll] of enrollByActivity.entries()) {
      bookingCounts.set(actId, Math.max(bookingCounts.get(actId) ?? 0, totalEnroll))
    }

    return (activities ?? []).map((a: { id: string; title: string; capacity: number }) => {
      const booked = bookingCounts.get(a.id) ?? 0
      // Build per-date occupancy map for this activity
      const byDate: Record<string, number> = {}
      for (const [key, count] of bookingsByDate.entries()) {
        if (key.startsWith(a.id + ':')) {
          byDate[key.split(':')[1]] = count
        }
      }
      return {
        activityId: a.id,
        title: a.title,
        capacity: a.capacity,
        booked,
        occupancy: a.capacity > 0 ? Math.round((booked / a.capacity) * 100) / 100 : 0,
        byDate,
      }
    })
  },

  async getParticipantStats(providerId: ID): Promise<{
    totalParents: number; totalChildren: number;
  }> {
    const sb = getServiceClient()
    const { data: bookings } = await sb.from('provider_bookings')
      .select('parent_id, child_info').eq('provider_id', providerId)
      .not('status', 'eq', 'cancelled')

    const parentIds = new Set<string>()
    const childNames = new Set<string>()
    for (const b of bookings ?? []) {
      parentIds.add(b.parent_id)
      if (b.child_info?.firstName) childNames.add(`${b.parent_id}:${b.child_info.firstName} ${b.child_info.lastName}`)
      else if (b.child_info?.name) childNames.add(`${b.parent_id}:${b.child_info.name}`)
    }

    return { totalParents: parentIds.size, totalChildren: childNames.size }
  },

  async getRevenueStats(providerId: ID, dateRange?: { from: string; to: string }): Promise<{
    totalRevenue: number; totalBookings: number;
    byMonth: Array<{ month: string; revenue: number; bookings: number }>;
  }> {
    const sb = getServiceClient()
    let query = sb.from('provider_bookings').select('amount_paid, payment_status, created_at').eq('provider_id', providerId)
    if (dateRange?.from) query = query.gte('created_at', dateRange.from)
    if (dateRange?.to) query = query.lte('created_at', dateRange.to)

    const { data: bookings } = await query
    let totalRevenue = 0
    const byMonth = new Map<string, { revenue: number; bookings: number }>()

    for (const b of bookings ?? []) {
      const month = (b.created_at as string).slice(0, 7)
      const entry = byMonth.get(month) ?? { revenue: 0, bookings: 0 }
      entry.bookings++
      if (b.payment_status === 'paid') {
        totalRevenue += b.amount_paid ?? 0
        entry.revenue += b.amount_paid ?? 0
      }
      byMonth.set(month, entry)
    }

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalBookings: bookings?.length ?? 0,
      byMonth: Array.from(byMonth.entries()).map(([month, data]) => ({ month, ...data })).sort((a, b) => a.month.localeCompare(b.month)),
    }
  },

  async getTrialStats(providerId: ID): Promise<{
    total: number; converted: number; conversionRate: number;
  }> {
    const sb = getServiceClient()
    const { data: bookings } = await sb.from('provider_bookings')
      .select('source, status').eq('provider_id', providerId)

    const platformBookings = (bookings ?? []).filter((b: { source: string }) => b.source === 'platform')
    const converted = platformBookings.filter((b: { status: string }) => b.status === 'confirmed' || b.status === 'completed').length

    return {
      total: platformBookings.length,
      converted,
      conversionRate: platformBookings.length > 0 ? Math.round((converted / platformBookings.length) * 100) / 100 : 0,
    }
  },

  async getTeamStats(providerId: ID): Promise<Array<{
    activityId: string; title: string; instructorId: string | null;
  }>> {
    const sb = getServiceClient()
    const { data: activities } = await sb.from('activities')
      .select('id, title, instructor_id').eq('provider_id', providerId).eq('status', 'published')

    return (activities ?? []).map((a: { id: string; title: string; instructor_id: string | null }) => ({
      activityId: a.id,
      title: a.title,
      instructorId: a.instructor_id,
    }))
  },

  // Routes compatibility aliases

  async getDashboardSummary(providerId: ID): Promise<Record<string, unknown>> {
    return this.getOverview(providerId)
  },

  async getRevenueReport(providerId: ID, period: string): Promise<Record<string, unknown>> {
    const [year, month] = period.split('-')
    const dateRange = year && month
      ? { from: `${year}-${month}-01`, to: `${year}-${month}-31` }
      : undefined
    return this.getRevenueStats(providerId, dateRange)
  },

  async getOccupancyByActivity(providerId: ID): Promise<Record<string, unknown>[]> {
    return this.getCourseStats(providerId)
  },

  async getCustomerLifetimeValue(providerId: ID): Promise<Record<string, unknown>[]> {
    const sb = getServiceClient()
    const { data: bookings } = await sb.from('provider_bookings')
      .select('parent_id, amount_paid, payment_status').eq('provider_id', providerId)
    const parentMap = new Map<string, { spent: number; bookings: number }>()
    for (const b of bookings ?? []) {
      const entry = parentMap.get(b.parent_id) ?? { spent: 0, bookings: 0 }
      entry.bookings++
      if (b.payment_status === 'paid') entry.spent += b.amount_paid ?? 0
      parentMap.set(b.parent_id, entry)
    }
    return Array.from(parentMap.entries()).map(([parentId, data]) => ({
      parentId,
      totalSpent: Math.round(data.spent * 100) / 100,
      bookingCount: data.bookings,
    }))
  },

  async getChurnRate(providerId: ID, months: number = 3): Promise<Record<string, unknown>> {
    const sb = getServiceClient()
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    const cutoffStr = cutoff.toISOString()
    const { data: allBookings } = await sb.from('provider_bookings').select('parent_id, created_at').eq('provider_id', providerId).neq('status', 'cancelled')
    const parentIds = new Set<string>((allBookings ?? []).map((b: any) => b.parent_id))
    const { data: recentBookings } = await sb.from('provider_bookings').select('parent_id').eq('provider_id', providerId).gte('created_at', cutoffStr).neq('status', 'cancelled')
    const activeIds = new Set<string>((recentBookings ?? []).map((b: any) => b.parent_id))
    const churned = [...parentIds].filter((id) => !activeIds.has(id)).length
    return {
      totalCustomers: parentIds.size,
      activeCustomers: activeIds.size,
      churnedCustomers: churned,
      churnRate: parentIds.size > 0 ? Math.round((churned / parentIds.size) * 100) / 100 : 0,
    }
  },

  async getTrialConversionByActivity(providerId: ID): Promise<Record<string, unknown>[]> {
    return this.getCourseStats(providerId)
  },

  async getStaffUtilization(providerId: ID): Promise<Record<string, unknown>[]> {
    return this.getTeamStats(providerId)
  },
}
