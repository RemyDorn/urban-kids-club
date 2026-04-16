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
    totalRevenue: number; unpaidBookings: number;
  }> {
    const sb = getServiceClient()

    const [actRes, bookRes] = await Promise.all([
      sb.from('activities').select('status').eq('provider_id', providerId),
      sb.from('provider_bookings').select('status, payment_status, amount_paid').eq('provider_id', providerId),
    ])

    if (actRes.error) throw new Error('Aktivitäten konnten nicht geladen werden: ' + actRes.error.message)
    if (bookRes.error) throw new Error('Buchungen konnten nicht geladen werden: ' + bookRes.error.message)

    const activities = actRes.data ?? []
    const bookings = bookRes.data ?? []

    let totalRevenue = 0
    let unpaidBookings = 0
    let confirmedBookings = 0

    for (const b of bookings) {
      if (b.payment_status === 'paid') totalRevenue += b.amount_paid ?? 0
      if (b.payment_status === 'unpaid' && b.status === 'confirmed') unpaidBookings++
      if (b.status === 'confirmed') confirmedBookings++
    }

    return {
      totalActivities: activities.length,
      publishedActivities: activities.filter((a: { status: string }) => a.status === 'published').length,
      totalBookings: bookings.length,
      confirmedBookings,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      unpaidBookings,
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

    const { data: bookings, error: bookErr } = await sb.from('provider_bookings').select('activity_id, status, booked_date').eq('provider_id', providerId)
    if (bookErr) throw new Error('Buchungen konnten nicht geladen werden: ' + bookErr.message)

    const bookingCounts = new Map<string, number>()
    // Also count per activity+date for calendar occupancy
    const bookingsByDate = new Map<string, number>()
    for (const b of bookings ?? []) {
      if (b.status === 'confirmed' || b.status === 'pending') {
        bookingCounts.set(b.activity_id, (bookingCounts.get(b.activity_id) ?? 0) + 1)
        if (b.booked_date) {
          const key = `${b.activity_id}:${b.booked_date}`
          bookingsByDate.set(key, (bookingsByDate.get(key) ?? 0) + 1)
        }
      }
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
