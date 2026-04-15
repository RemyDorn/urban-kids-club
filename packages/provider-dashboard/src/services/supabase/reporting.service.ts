// ============================================================
// Reporting Service – Supabase-backed
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

    const { data: activities } = await sb.from('activities').select('id, status').eq('provider_id', providerId)
    const activityIds = (activities ?? []).filter((a: { status: string }) => a.status === 'published').map((a: { id: string }) => a.id)

    // Get bookings via activity_slots → bookings
    let allBookings: Array<{ status: string; payment_method: string }> = []
    if (activityIds.length > 0) {
      const { data: slots } = await sb.from('activity_slots').select('id').in('activity_id', activityIds)
      const slotIds = (slots ?? []).map((s: { id: string }) => s.id)
      if (slotIds.length > 0) {
        const { data: bookings } = await sb.from('bookings').select('status, payment_method').in('activity_slot_id', slotIds)
        allBookings = bookings ?? []
      }
    }

    // Also check provider_bookings as fallback
    const { data: provBookings } = await sb.from('provider_bookings').select('status, payment_status, amount_paid').eq('provider_id', providerId)

    let totalRevenue = 0
    let unpaidBookings = 0
    let confirmedBookings = 0

    // Count from bookings table
    for (const b of allBookings) {
      if (b.status === 'confirmed') confirmedBookings++
    }

    // Count from provider_bookings (fallback)
    for (const b of provBookings ?? []) {
      if (b.payment_status === 'paid') totalRevenue += b.amount_paid ?? 0
      if (b.payment_status === 'unpaid' && b.status === 'confirmed') unpaidBookings++
      if (b.status === 'confirmed') confirmedBookings++
    }

    return {
      totalActivities: (activities ?? []).length,
      publishedActivities: activityIds.length,
      totalBookings: allBookings.length + (provBookings ?? []).length,
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
    const { data: activities } = await sb.from('activities').select('id, title, capacity, status').eq('provider_id', providerId).eq('status', 'published')

    // Get activity IDs for this provider
    const activityIds = (activities ?? []).map((a: { id: string }) => a.id)
    if (activityIds.length === 0) return []

    // Count bookings via activity_slots → bookings (the booking widget's tables)
    const { data: slots } = await sb.from('activity_slots').select('id, activity_id').in('activity_id', activityIds)
    const slotIds = (slots ?? []).map((s: { id: string }) => s.id)
    const slotToActivity = new Map<string, string>()
    for (const s of slots ?? []) slotToActivity.set(s.id, s.activity_id)

    const bookingCounts = new Map<string, number>()
    if (slotIds.length > 0) {
      const { data: bookings } = await sb.from('bookings').select('activity_slot_id, status').in('activity_slot_id', slotIds)
      for (const b of bookings ?? []) {
        if (b.status === 'confirmed' || b.status === 'pending') {
          const actId = slotToActivity.get(b.activity_slot_id)
          if (actId) bookingCounts.set(actId, (bookingCounts.get(actId) ?? 0) + 1)
        }
      }
    }

    // Also check provider_bookings as fallback
    const { data: provBookings } = await sb.from('provider_bookings').select('activity_id, status').eq('provider_id', providerId)
    for (const b of provBookings ?? []) {
      if (b.status === 'confirmed' || b.status === 'pending') {
        bookingCounts.set(b.activity_id, (bookingCounts.get(b.activity_id) ?? 0) + 1)
      }
    }

    return (activities ?? []).map((a: { id: string; title: string; capacity: number }) => {
      const booked = bookingCounts.get(a.id) ?? 0
      return {
        activityId: a.id,
        title: a.title,
        capacity: a.capacity,
        booked,
        occupancy: a.capacity > 0 ? Math.round((booked / a.capacity) * 100) / 100 : 0,
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
      if (b.child_info?.name) childNames.add(`${b.parent_id}:${b.child_info.name}`)
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

    // Approximate trial stats from bookings with platform source
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
