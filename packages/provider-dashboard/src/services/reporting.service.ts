// ============================================================
// Reporting Service – Berichte & Analytics (v2 – vollständig)
// ============================================================
// Period-Filter, Refund-Berücksichtigung, CLV, Churn, Trial-Conversion
// ============================================================

import { store } from '../domain/store'
import type { RevenueReport, ID } from '../types'

// Helfer: Datum im Zeitraum?
function dateInPeriod(date: Date, from: Date, to: Date): boolean {
  return date >= from && date <= to
}

function parsePeriod(period: string): { from: Date; to: Date } | null {
  // "2026-Q1" → Jan–Mar
  const quarterMatch = period.match(/^(\d{4})-Q([1-4])$/)
  if (quarterMatch) {
    const year = parseInt(quarterMatch[1])
    const q = parseInt(quarterMatch[2])
    const startMonth = (q - 1) * 3
    return {
      from: new Date(year, startMonth, 1),
      to: new Date(year, startMonth + 3, 0, 23, 59, 59),
    }
  }

  // "2026-03" → März
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/)
  if (monthMatch) {
    const year = parseInt(monthMatch[1])
    const month = parseInt(monthMatch[2]) - 1
    return {
      from: new Date(year, month, 1),
      to: new Date(year, month + 1, 0, 23, 59, 59),
    }
  }

  // "2026" → Ganzes Jahr
  const yearMatch = period.match(/^(\d{4})$/)
  if (yearMatch) {
    const year = parseInt(yearMatch[1])
    return { from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59) }
  }

  return null
}

export const ReportingService = {

  getRevenueReport(providerId: ID, period: string): RevenueReport {
    const dateRange = parsePeriod(period)

    const allBookings = Array.from(
      store.getFromIndex(store.indexes.bookingsByProvider, providerId)
    )
      .map((id) => store.state.bookings.get(id)!)
      .filter(Boolean)

    // Filter nach Zeitraum
    const bookings = dateRange
      ? allBookings.filter((b) => dateInPeriod(b.createdAt, dateRange.from, dateRange.to))
      : allBookings

    // Umsatz: Paid minus Refunded (single pass)
    let totalRevenue = 0
    for (const b of bookings) {
      if (b.paymentStatus === 'paid') totalRevenue += b.amountPaid
      else if (b.paymentStatus === 'refunded') totalRevenue -= b.amountPaid
    }

    // Activities des Providers
    const activityIds = store.getFromIndex(store.indexes.activitiesByProvider, providerId)
    const activities = Array.from(activityIds)
      .map((id) => store.state.activities.get(id)!)
      .filter(Boolean)

    // Top Activities (nur im Zeitraum)
    const activityStats = activities.map((a) => {
      const actBookings = bookings.filter((b) => b.activityId === a.id)
      const actRevenue = actBookings
        .filter((b) => b.paymentStatus === 'paid')
        .reduce((sum, b) => sum + b.amountPaid, 0)

      return { activityId: a.id, title: a.title, revenue: actRevenue, bookings: actBookings.length }
    })
    activityStats.sort((a, b) => b.revenue - a.revenue)

    // Auslastung
    const totalCapacity = activities
      .filter((a) => a.status === 'published')
      .reduce((sum, a) => sum + a.capacity, 0)
    const totalConfirmed = bookings.filter(
      (b) => b.status === 'confirmed' || b.status === 'completed'
    ).length
    const occupancyRate = totalCapacity > 0 ? totalConfirmed / totalCapacity : 0

    // Kunden-Analyse
    const parentIds = new Set(bookings.map((b) => b.parentId))
    const allTimeParentIds = new Set(allBookings.map((b) => b.parentId))

    // "Returning" = hat sowohl in diesem als auch in früheren Perioden gebucht
    let returningParents: string[]
    if (dateRange) {
      const priorParentIds = new Set(allBookings.filter(b => b.createdAt < dateRange.from).map(b => b.parentId))
      returningParents = Array.from(parentIds).filter(pid => priorParentIds.has(pid))
    } else {
      const parentBookingCounts = new Map<string, number>()
      for (const b of allBookings) parentBookingCounts.set(b.parentId, (parentBookingCounts.get(b.parentId) || 0) + 1)
      returningParents = Array.from(parentIds).filter(pid => (parentBookingCounts.get(pid) || 0) > 1)
    }

    return {
      providerId,
      period,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalBookings: bookings.length,
      occupancyRate: Math.round(occupancyRate * 100) / 100,
      topActivities: activityStats.slice(0, 5),
      newCustomers: parentIds.size - returningParents.length,
      returningCustomers: returningParents.length,
    }
  },

  // Auslastung pro Kurs
  getOccupancyByActivity(providerId: ID): Array<{
    activityId: ID
    title: string
    capacity: number
    booked: number
    occupancy: number
    waitlisted: number
  }> {
    const activityIds = store.getFromIndex(store.indexes.activitiesByProvider, providerId)

    return Array.from(activityIds)
      .map((actId) => {
        const activity = store.state.activities.get(actId)
        if (!activity) return null

        const bookingIds = store.getFromIndex(store.indexes.bookingsByActivity, actId)
        const bookings = Array.from(bookingIds)
          .map((id) => store.state.bookings.get(id)!)
          .filter(Boolean)

        const booked = bookings.filter(
          (b) => b.status === 'confirmed' || b.status === 'pending'
        ).length
        const waitlisted = bookings.filter((b) => b.status === 'waitlisted').length

        return {
          activityId: actId,
          title: activity.title,
          capacity: activity.capacity,
          booked,
          occupancy: activity.capacity > 0 ? Math.round((booked / activity.capacity) * 100) / 100 : 0,
          waitlisted,
        }
      })
      .filter(Boolean) as Array<{
        activityId: ID; title: string; capacity: number
        booked: number; occupancy: number; waitlisted: number
      }>
  },

  // Customer Lifetime Value
  getCustomerLifetimeValue(providerId: ID): Array<{
    parentId: ID
    parentName: string
    totalSpent: number
    bookingCount: number
    firstBooking: Date
    lastBooking: Date
    avgBookingValue: number
    childCount: number
  }> {
    const bookingIds = store.getFromIndex(store.indexes.bookingsByProvider, providerId)
    const parentMap = new Map<ID, { spent: number; count: number; first: Date; last: Date; children: Set<string> }>()

    for (const bid of bookingIds) {
      const booking = store.state.bookings.get(bid)
      if (!booking || booking.status === 'cancelled') continue

      const existing = parentMap.get(booking.parentId)
      if (existing) {
        if (booking.paymentStatus === 'paid') existing.spent += booking.amountPaid
        existing.count++
        if (booking.createdAt < existing.first) existing.first = booking.createdAt
        if (booking.createdAt > existing.last) existing.last = booking.createdAt
        existing.children.add(booking.child.name)
      } else {
        parentMap.set(booking.parentId, {
          spent: booking.paymentStatus === 'paid' ? booking.amountPaid : 0,
          count: 1,
          first: booking.createdAt,
          last: booking.createdAt,
          children: new Set([booking.child.name]),
        })
      }
    }

    return Array.from(parentMap.entries())
      .map(([parentId, data]) => {
        const parent = store.state.parents.get(parentId)
        return {
          parentId,
          parentName: parent?.name ?? 'Unbekannt',
          totalSpent: Math.round(data.spent * 100) / 100,
          bookingCount: data.count,
          firstBooking: data.first,
          lastBooking: data.last,
          avgBookingValue: data.count > 0 ? Math.round((data.spent / data.count) * 100) / 100 : 0,
          childCount: data.children.size,
        }
      })
      .sort((a, b) => b.totalSpent - a.totalSpent)
  },

  // Churn Rate: Kunden die nicht wiederkommen
  getChurnRate(providerId: ID, monthsInactive: number = 3): {
    totalCustomers: number
    activeCustomers: number
    churnedCustomers: number
    churnRate: number
  } {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - monthsInactive)

    const bookingIds = store.getFromIndex(store.indexes.bookingsByProvider, providerId)
    const parentLastBooking = new Map<ID, Date>()

    for (const bid of bookingIds) {
      const booking = store.state.bookings.get(bid)
      if (!booking || booking.status === 'cancelled') continue

      const existing = parentLastBooking.get(booking.parentId)
      if (!existing || booking.createdAt > existing) {
        parentLastBooking.set(booking.parentId, booking.createdAt)
      }
    }

    const totalCustomers = parentLastBooking.size
    let activeCustomers = 0
    let churnedCustomers = 0

    for (const lastDate of parentLastBooking.values()) {
      if (lastDate >= cutoff) activeCustomers++
      else churnedCustomers++
    }

    return {
      totalCustomers,
      activeCustomers,
      churnedCustomers,
      churnRate: totalCustomers > 0 ? Math.round((churnedCustomers / totalCustomers) * 100) / 100 : 0,
    }
  },

  // Trial-Conversion pro Kurs
  getTrialConversionByActivity(providerId: ID): Array<{
    activityId: ID
    title: string
    totalTrials: number
    completed: number
    converted: number
    noShow: number
    conversionRate: number
  }> {
    const trialIds = store.getFromIndex(store.indexes.trialsByProvider, providerId)
    const byActivity = new Map<ID, { total: number; completed: number; converted: number; noShow: number }>()

    for (const tid of trialIds) {
      const trial = store.state.trialLessons.get(tid)
      if (!trial) continue

      if (!byActivity.has(trial.activityId)) {
        byActivity.set(trial.activityId, { total: 0, completed: 0, converted: 0, noShow: 0 })
      }

      const stats = byActivity.get(trial.activityId)!
      stats.total++
      if (trial.status === 'completed') stats.completed++
      if (trial.status === 'converted') { stats.completed++; stats.converted++ }
      if (trial.status === 'no_show') stats.noShow++
    }

    return Array.from(byActivity.entries())
      .map(([activityId, stats]) => {
        const activity = store.state.activities.get(activityId)
        return {
          activityId,
          title: activity?.title ?? 'Unbekannt',
          totalTrials: stats.total,
          completed: stats.completed,
          converted: stats.converted,
          noShow: stats.noShow,
          conversionRate: stats.completed > 0 ? Math.round((stats.converted / stats.completed) * 100) / 100 : 0,
        }
      })
      .sort((a, b) => b.totalTrials - a.totalTrials)
  },

  // Staff Utilization
  getStaffUtilization(providerId: ID): Array<{
    memberId: ID
    name: string
    role: string
    activeActivities: number
    weeklySlots: number
    totalStudents: number
  }> {
    const teamIds = store.getFromIndex(store.indexes.teamByProvider, providerId)

    return Array.from(teamIds)
      .map((mid) => {
        const member = store.state.teamMembers.get(mid)
        if (!member || !member.active) return null

        const activities = Array.from(store.state.activities.values())
          .filter((a) => a.instructorId === mid && a.status === 'published')

        let weeklySlots = 0
        let totalStudents = 0

        for (const activity of activities) {
          if (activity.schedule.type === 'recurring') {
            weeklySlots += activity.schedule.slots.length
          } else {
            weeklySlots += 1
          }

          const bookingIds = store.getFromIndex(store.indexes.bookingsByActivity, activity.id)
          totalStudents += Array.from(bookingIds)
            .map((id) => store.state.bookings.get(id)!)
            .filter((b) => b && b.status === 'confirmed').length
        }

        return {
          memberId: mid,
          name: member.name,
          role: member.role,
          activeActivities: activities.length,
          weeklySlots,
          totalStudents,
        }
      })
      .filter(Boolean) as Array<{
        memberId: ID; name: string; role: string
        activeActivities: number; weeklySlots: number; totalStudents: number
      }>
  },

  // Dashboard-Zusammenfassung
  getDashboardSummary(providerId: ID): {
    totalActivities: number
    publishedActivities: number
    totalBookings: number
    confirmedBookings: number
    totalRevenue: number
    outstandingInvoices: number
    averageOccupancy: number
    unpaidBookings: number
    upcomingTrials: number
    expiringDocuments: number
    unreadMessages: number
  } {
    const activityIds = store.getFromIndex(store.indexes.activitiesByProvider, providerId)
    const activities = Array.from(activityIds).map((id) => store.state.activities.get(id)!).filter(Boolean)

    const bookingIds = store.getFromIndex(store.indexes.bookingsByProvider, providerId)
    const bookings = Array.from(bookingIds).map((id) => store.state.bookings.get(id)!).filter(Boolean)

    const invoiceIds = store.getFromIndex(store.indexes.invoicesByProvider, providerId)
    const invoices = Array.from(invoiceIds).map((id) => store.state.invoices.get(id)!).filter(Boolean)

    let totalRevenue = 0
    let unpaidCount = 0
    for (const b of bookings) {
      if (b.paymentStatus === 'paid') totalRevenue += b.amountPaid
      else if (b.paymentStatus === 'refunded') totalRevenue -= b.amountPaid
      if (b.paymentStatus === 'unpaid' && b.status === 'confirmed') unpaidCount++
    }

    const outstandingInvoices = invoices
      .filter((i) => i.status === 'sent' || i.status === 'overdue')
      .reduce((sum, i) => sum + i.total, 0)

    const occupancy = this.getOccupancyByActivity(providerId)
    const avgOccupancy = occupancy.length > 0
      ? occupancy.reduce((sum, o) => sum + o.occupancy, 0) / occupancy.length
      : 0

    // Anstehende Probestunden
    const today = new Date().toISOString().split('T')[0]
    const trialIds = store.getFromIndex(store.indexes.trialsByProvider, providerId)
    const upcomingTrials = Array.from(trialIds)
      .map((id) => store.state.trialLessons.get(id)!)
      .filter((t) => t && t.status === 'scheduled' && t.scheduledDate >= today).length

    // Ablaufende Dokumente
    const docIds = store.getFromIndex(store.indexes.documentsByProvider, providerId)
    const expiringDocuments = Array.from(docIds)
      .map((id) => store.state.documents.get(id)!)
      .filter((d) => d && (d.status === 'expiring_soon' || d.status === 'expired')).length

    // Ungelesene Nachrichten
    const msgIds = store.getFromIndex(store.indexes.messagesByProvider, providerId)
    const unreadMessages = Array.from(msgIds)
      .map((id) => store.state.messages.get(id)!)
      .filter((m) => m && !m.read).length

    return {
      totalActivities: activities.length,
      publishedActivities: activities.filter((a) => a.status === 'published').length,
      totalBookings: bookings.length,
      confirmedBookings: bookings.filter((b) => b.status === 'confirmed').length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      outstandingInvoices: Math.round(outstandingInvoices * 100) / 100,
      averageOccupancy: Math.round(avgOccupancy * 100) / 100,
      unpaidBookings: unpaidCount,
      upcomingTrials,
      expiringDocuments,
      unreadMessages,
    }
  },
}
