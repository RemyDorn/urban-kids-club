// ============================================================
// Invoice Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { invoiceFromDb, invoiceToDb } from './mappers'
import type { Invoice, InvoiceStatus, Currency, ID } from '../../types'

const TABLE = 'invoices'

export const SupabaseInvoiceService = {

  async list(providerId: ID, filters?: { status?: InvoiceStatus }): Promise<Invoice[]> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').eq('provider_id', providerId).order('issued_at', { ascending: false })
    if (filters?.status) query = query.eq('status', filters.status)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(invoiceFromDb)
  },

  async getById(id: ID): Promise<Invoice | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? invoiceFromDb(data) : undefined
  },

  async createFromBooking(bookingId: ID, providerId: ID): Promise<Invoice | { error: string }> {
    const sb = getServiceClient()

    // Fetch booking
    const { data: booking, error: bErr } = await sb.from('provider_bookings').select('*').eq('id', bookingId).maybeSingle()
    if (bErr) throw bErr
    if (!booking) return { error: 'Buchung nicht gefunden' }

    // Fetch activity for pricing
    const { data: activity, error: aErr } = await sb.from('activities').select('*').eq('id', booking.activity_id).maybeSingle()
    if (aErr) throw aErr
    if (!activity) return { error: 'Aktivität nicht gefunden' }

    const pricing = (activity.pricing as Array<{ id: string; label: string; amount: number }>) ?? []
    const option = pricing.find((p: { id: string }) => p.id === booking.pricing_option_id)
    const amount = option?.amount ?? 0
    const label = option?.label ?? 'Kurs'

    // Generate invoice number
    const { data: existing } = await sb.from(TABLE)
      .select('number').eq('provider_id', providerId).order('created_at', { ascending: false }).limit(1)
    let nextNum = 1
    if (existing?.length) {
      const match = existing[0].number?.match(/INV-\d{4}-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const year = new Date().getFullYear()
    const invoiceNumber = `INV-${year}-${nextNum.toString().padStart(4, '0')}`

    const vatRate = 0.19
    const subtotal = Math.round(amount * 100) / 100
    const tax = Math.round(subtotal * vatRate * 100) / 100
    const total = Math.round((subtotal + tax) * 100) / 100

    const now = new Date()
    const dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + 14)

    const row = invoiceToDb({
      providerId,
      parentId: booking.parent_id,
      bookingIds: [bookingId],
      number: invoiceNumber,
      lineItems: [{
        description: `${activity.title} – ${label}`,
        quantity: 1,
        unitPrice: amount,
        vatRate,
        total: subtotal,
      }],
      subtotal,
      tax,
      total,
      currency: (booking.currency as Currency) ?? 'EUR',
      status: 'draft',
      issuedAt: now,
      dueDate,
    })

    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return invoiceFromDb(data)
  },

  async send(id: ID): Promise<Invoice | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'sent' })
      .eq('id', id).eq('status', 'draft')
      .select().maybeSingle()
    if (error) throw error
    return data ? invoiceFromDb(data) : undefined
  },

  async markPaid(id: ID): Promise<Invoice | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', id)
      .select().maybeSingle()
    if (error) throw error
    return data ? invoiceFromDb(data) : undefined
  },

  async cancel(id: ID): Promise<Invoice | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'cancelled' })
      .eq('id', id).neq('status', 'paid')
      .select().maybeSingle()
    if (error) throw error
    return data ? invoiceFromDb(data) : undefined
  },
}
