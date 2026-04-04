// ============================================================
// Reporting Service – Berichte & Analytics (130%-Feature)
// ============================================================

import { store } from '../domain/store'
import type { RevenueReport, ID } from '../types'

export const ReportingService = {

  // Umsatz-Report für einen Zeitraum
  getRevenueReport(providerId: ID, period: string): RevenueReport {
    const bookings = Array.from(
      store.getFromIndex(store.indexes.bookingsByProvider, providerId)
    )
      .map((id) => store.state.bookings.get(id)!)
      .filter(Boolean)

    // Paid bookings im Zeitraum
    const paidBookings = bookings.filter((b) => b.paymentStatus === 'paid')
    const totalRevenue = paidBookings.reduce((sum, b) => sum + b.amountPaid, 0)

    // Activities des Providers
    const activityIds = store.getFromIndex(store.indexes.activitiesByProvider, providerId)
    const activities = Array.from(activityIds)
      .map((id) => store.state.activities.get(id)!)
      .filter(Boolean)

    // Top Activities
    const activityStats = activities.map((a) => {
      const actBookings = bookings.filter((b) => b.activityId === a.id)
      const actRevenue = actBookings
        .filter((b) => b.paymentStatus === 'paid')
        .reduce((sum, b) => sum + b.amountPaid, 0)

      return {
        activityId: a.id,
        title: a.title,
        revenue: actRevenue,
        bookings: actBookings.length,
      }
    })
    activityStats.sort((a, b) => b.revenue - a.revenue)

    // Auslastung: Confirmed Bookings / Total Capacity
    const totalCapacity = activities.reduce((sum, a) => sum + a.capacity, 0)
    const totalConfirmed = bookings.filter(
      (b) => b.status === 'confirmed' || b.status === 'completed'
    ).length
    const occupancyRate = totalCapacity > 0 ? totalConfirmed / totalCapacity : 0

    // Unique Parents
    const parentIds = new Set(bookings.map((b) => b.parentId))
    const returningParents = Array.from(parentIds).filter((pid) => {
      const parentBookings = bookings.filter((b) => b.parentId === pid)
      return parentBookings.length > 1
    })

    return {
      providerId,
      period,
      totalRevenue,
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

  // Zusammenfassung für Dashboard
  getDashboardSummary(providerId: ID): {
    totalActivities: number
    publishedActivities: number
    totalBookings: number
    confirmedBookings: number
    totalRevenue: number
    outstandingInvoices: number
    averageOccupancy: number
  } {
    const activityIds = store.getFromIndex(store.indexes.activitiesByProvider, providerId)
    const activities = Array.from(activityIds)
      .map((id) => store.state.activities.get(id)!)
      .filter(Boolean)

    const bookingIds = store.getFromIndex(store.indexes.bookingsByProvider, providerId)
    const bookings = Array.from(bookingIds)
      .map((id) => store.state.bookings.get(id)!)
      .filter(Boolean)

    const invoiceIds = store.getFromIndex(store.indexes.invoicesByProvider, providerId)
    const invoices = Array.from(invoiceIds)
      .map((id) => store.state.invoices.get(id)!)
      .filter(Boolean)

    const totalRevenue = bookings
      .filter((b) => b.paymentStatus === 'paid')
      .reduce((sum, b) => sum + b.amountPaid, 0)

    const outstandingInvoices = invoices
      .filter((i) => i.status === 'sent' || i.status === 'overdue')
      .reduce((sum, i) => sum + i.total, 0)

    const occupancy = this.getOccupancyByActivity(providerId)
    const avgOccupancy = occupancy.length > 0
      ? occupancy.reduce((sum, o) => sum + o.occupancy, 0) / occupancy.length
      : 0

    return {
      totalActivities: activities.length,
      publishedActivities: activities.filter((a) => a.status === 'published').length,
      totalBookings: bookings.length,
      confirmedBookings: bookings.filter((b) => b.status === 'confirmed').length,
      totalRevenue,
      outstandingInvoices,
      averageOccupancy: Math.round(avgOccupancy * 100) / 100,
    }
  },
}
