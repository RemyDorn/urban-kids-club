// ============================================================
// Attendance Service – Supabase-backed (QR Check-in + Manual)
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import type { ID } from '../../types'

const TABLE = 'attendance'

export interface AttendanceRecord {
  id: string
  bookingId: string
  activityId: string
  providerId: string
  parentId: string | null
  date: string          // YYYY-MM-DD
  checkedIn: boolean
  checkedInAt: string | null
  checkedInBy: string | null
  checkinMethod: 'qr' | 'manual'
  note: string | null
}

function fromDb(r: Record<string, any>): AttendanceRecord {
  return {
    id: r.id,
    bookingId: r.booking_id,
    activityId: r.activity_id,
    providerId: r.provider_id,
    parentId: r.parent_id ?? null,
    date: r.date,
    checkedIn: r.checked_in ?? false,
    checkedInAt: r.checked_in_at ?? null,
    checkedInBy: r.checked_in_by ?? null,
    checkinMethod: r.checkin_method ?? 'manual',
    note: r.note ?? null,
  }
}

export const SupabaseAttendanceService = {

  async checkIn(bookingId: ID, activityId: ID, date: string, checkedInBy?: ID): Promise<AttendanceRecord | { error: string }> {
    const sb = getServiceClient()

    // Upsert: if already checked in today, return existing
    const { data: existing } = await sb.from(TABLE)
      .select('*').eq('booking_id', bookingId).eq('date', date).maybeSingle()
    if (existing?.checked_in) return { error: 'Bereits eingecheckt für dieses Datum' }

    // Get provider_id + parent_id from booking
    const { data: booking } = await sb.from('provider_bookings')
      .select('provider_id, parent_id').eq('id', bookingId).single()

    const row = {
      booking_id: bookingId,
      activity_id: activityId,
      provider_id: booking?.provider_id ?? null,
      parent_id: booking?.parent_id ?? null,
      date,
      checked_in: true,
      checked_in_at: new Date().toISOString(),
      checked_in_by: checkedInBy ?? null,
      checkin_method: 'manual',
    }

    if (existing) {
      const { data, error } = await sb.from(TABLE)
        .update({ checked_in: true, checked_in_at: row.checked_in_at, checked_in_by: row.checked_in_by })
        .eq('id', existing.id).select().single()
      if (error) throw error
      return fromDb(data)
    }

    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return fromDb(data)
  },

  async markAbsent(bookingId: ID, activityId: ID, date: string, note?: string): Promise<AttendanceRecord | { error: string }> {
    const sb = getServiceClient()

    const { data: booking } = await sb.from('provider_bookings')
      .select('provider_id, parent_id').eq('id', bookingId).single()

    const row = {
      booking_id: bookingId,
      activity_id: activityId,
      provider_id: booking?.provider_id ?? null,
      parent_id: booking?.parent_id ?? null,
      date,
      checked_in: false,
      note: note ?? null,
      checkin_method: 'manual',
    }

    const { data: existing } = await sb.from(TABLE)
      .select('id').eq('booking_id', bookingId).eq('date', date).maybeSingle()

    if (existing) {
      const { data, error } = await sb.from(TABLE)
        .update({ checked_in: false, note: row.note })
        .eq('id', existing.id).select().single()
      if (error) throw error
      return fromDb(data)
    }

    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return fromDb(data)
  },

  async getByActivityAndDate(activityId: ID, date: string): Promise<AttendanceRecord[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*')
      .eq('activity_id', activityId).eq('date', date)
    if (error) throw error
    return (data ?? []).map(fromDb)
  },

  async getByBooking(bookingId: ID): Promise<AttendanceRecord[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*')
      .eq('booking_id', bookingId).order('date', { ascending: false })
    if (error) throw error
    return (data ?? []).map(fromDb)
  },

  async getAttendanceRate(activityId: ID): Promise<{ total: number; present: number; rate: number }> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('checked_in')
      .eq('activity_id', activityId)
    if (error) throw error
    const total = data?.length ?? 0
    const present = data?.filter((r: any) => r.checked_in).length ?? 0
    return { total, present, rate: total > 0 ? Math.round((present / total) * 100) : 0 }
  },

  // ============================================================
  // QR Check-in: Parent scans QR, enters email → check-in all today's bookings
  // ============================================================

  async qrCheckIn(providerId: ID, email: string): Promise<{
    success: boolean
    checkedIn: Array<{
      activityTitle: string
      childName: string
      paymentStatus: string
      amountDue: number
    }>
    error?: string
  }> {
    const sb = getServiceClient()
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    // 1. Find parent by email (case-insensitive)
    const { data: parent } = await sb.from('parents')
      .select('id, name, email')
      .ilike('email', email.trim())
      .maybeSingle()

    if (!parent) {
      return { success: false, checkedIn: [], error: 'Keine Buchung mit dieser E-Mail-Adresse gefunden.' }
    }

    // 2. Find today's active bookings for this parent at this provider
    //    A booking is "for today" if:
    //    - It has a booked_date matching today, OR
    //    - The activity has a schedule that includes today's weekday
    const { data: bookings } = await sb.from('provider_bookings')
      .select('id, activity_id, child_info, payment_status, amount_paid, status, payment_method, booked_date')
      .eq('provider_id', providerId)
      .eq('parent_id', parent.id)
      .in('status', ['confirmed', 'pending'])

    if (!bookings || bookings.length === 0) {
      return { success: false, checkedIn: [], error: 'Keine aktiven Buchungen für heute gefunden.' }
    }

    // 3. Get activity details for all booked activities
    const activityIds = [...new Set(bookings.map((b: any) => b.activity_id))]
    const { data: activities } = await sb.from('activities')
      .select('id, title, schedule, pricing')
      .in('id', activityIds)

    const activityMap = new Map((activities ?? []).map((a: any) => [a.id, a]))

    // 4. Filter bookings that are relevant for today
    const todayDow = new Date().getDay() // 0=Sun, 1=Mon, ...
    const dowNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const todayName = dowNames[todayDow]

    const todayBookings = bookings.filter((b: any) => {
      // If booking has a specific booked_date, check it
      if (b.booked_date) {
        return b.booked_date === today
      }
      // Otherwise check if activity runs on today's weekday
      const activity = activityMap.get(b.activity_id)
      if (!activity?.schedule) return true // no schedule = assume today
      const sched = activity.schedule as Array<{ day?: string }>
      return sched.some((s: any) => s.day?.toLowerCase() === todayName)
    })

    if (todayBookings.length === 0) {
      return { success: false, checkedIn: [], error: 'Heute findet kein Kurs statt, für den du angemeldet bist.' }
    }

    // 5. Check in each booking
    const checkedIn: Array<{
      activityTitle: string
      childName: string
      paymentStatus: string
      amountDue: number
    }> = []

    for (const booking of todayBookings) {
      const activity = activityMap.get(booking.activity_id)
      const ci = booking.child_info as any

      // Upsert attendance record
      const { data: existing } = await sb.from(TABLE)
        .select('id').eq('booking_id', booking.id).eq('date', today).maybeSingle()

      if (!existing) {
        await sb.from(TABLE).insert({
          booking_id: booking.id,
          activity_id: booking.activity_id,
          provider_id: providerId,
          parent_id: parent.id,
          date: today,
          checked_in: true,
          checked_in_at: new Date().toISOString(),
          checkin_method: 'qr',
        })
      } else {
        await sb.from(TABLE).update({
          checked_in: true,
          checked_in_at: new Date().toISOString(),
          checkin_method: 'qr',
        }).eq('id', existing.id)
      }

      // Determine payment info
      const pricing = (activity?.pricing as Array<{ amount: number }>) ?? []
      const amount = pricing[0]?.amount ?? booking.amount_paid ?? 0
      const isPaid = booking.payment_status === 'paid'

      checkedIn.push({
        activityTitle: activity?.title ?? 'Kurs',
        childName: ci?.firstName ? `${ci.firstName} ${ci.lastName || ''}`.trim() : 'Kind',
        paymentStatus: isPaid ? 'paid' : 'unpaid',
        amountDue: isPaid ? 0 : amount,
      })
    }

    return { success: true, checkedIn }
  },

  // Get today's check-in overview for provider dashboard
  async getTodayOverview(providerId: ID): Promise<{
    total: number
    checkedIn: number
    records: AttendanceRecord[]
  }> {
    const sb = getServiceClient()
    const today = new Date().toISOString().slice(0, 10)

    const { data, error } = await sb.from(TABLE).select('*')
      .eq('provider_id', providerId).eq('date', today)
    if (error) throw error

    const records = (data ?? []).map(fromDb)
    return {
      total: records.length,
      checkedIn: records.filter(r => r.checkedIn).length,
      records,
    }
  },
}
