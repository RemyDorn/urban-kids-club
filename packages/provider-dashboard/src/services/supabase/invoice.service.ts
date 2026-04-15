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

  async getById(id: ID, providerId?: ID): Promise<Invoice | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    return data ? invoiceFromDb(data) : undefined
  },

  async createFromBooking(bookingId: ID, providerId: ID, customVatRate?: number): Promise<Invoice | { error: string }> {
    const sb = getServiceClient()

    // Fetch booking (with provider ownership check)
    const { data: booking, error: bErr } = await sb.from('provider_bookings').select('*').eq('id', bookingId).eq('provider_id', providerId).maybeSingle()
    if (bErr) throw bErr
    if (!booking) return { error: 'Buchung nicht gefunden' }

    // Fetch activity for pricing
    const { data: activity, error: aErr } = await sb.from('activities').select('*').eq('id', booking.activity_id).maybeSingle()
    if (aErr) throw aErr
    if (!activity) return { error: 'Aktivität nicht gefunden' }

    const pricing = (activity.pricing as Array<{ id?: string; label: string; amount: number }>) ?? []
    const option = pricing.find((p: { id?: string }) => p.id === booking.pricing_option_id) ?? pricing[0]
    const amount = option?.amount ?? booking.amount_paid ?? 0
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

    const vatRate = customVatRate !== undefined ? customVatRate : 0.19
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

  async send(id: ID, providerId?: ID): Promise<Invoice | undefined> {
    const sb = getServiceClient()

    // Fetch invoice first (don't update status yet)
    let fetchQuery = sb.from(TABLE).select('*').eq('id', id).eq('status', 'draft')
    if (providerId) fetchQuery = fetchQuery.eq('provider_id', providerId)
    const { data: invoiceRow, error: fetchErr } = await fetchQuery.maybeSingle()
    if (fetchErr) throw fetchErr
    if (!invoiceRow) return undefined

    // Send email BEFORE updating status
    try {
      const { data: parent } = await sb.from('parents').select('name, email').eq('id', invoiceRow.parent_id).single()
      const { data: provider } = await sb.from('providers').select('company_name').eq('id', invoiceRow.provider_id).single()
      if (parent?.email) {
        const { EmailService } = await import('../../lib/email')
        await EmailService.sendInvoice(parent.email, {
          parentName: parent.name,
          invoiceNumber: invoiceRow.number,
          amount: `${Number(invoiceRow.total).toFixed(2).replace('.', ',')} €`,
          dueDate: new Date(invoiceRow.due_date).toLocaleDateString('de-DE'),
          providerName: provider?.company_name || '',
        })
        console.log(`[Invoice] Email sent to ${parent.email} for invoice ${invoiceRow.number}`)
      }
    } catch (emailErr) {
      console.error('[Invoice] Email send failed:', emailErr)
      throw new Error('E-Mail konnte nicht gesendet werden. Rechnung bleibt als Entwurf.')
    }

    // Email sent successfully — now update status
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'sent' })
      .eq('id', id)
      .select().maybeSingle()
    if (error) throw error
    return data ? invoiceFromDb(data) : undefined
  },

  async markPaid(id: ID, providerId?: ID): Promise<Invoice | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE)
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? invoiceFromDb(data) : undefined
  },

  async cancel(id: ID, providerId?: ID): Promise<Invoice | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE)
      .update({ status: 'cancelled' })
      .eq('id', id).neq('status', 'paid')
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? invoiceFromDb(data) : undefined
  },

  async create(input: Omit<Invoice, 'id'>): Promise<Invoice> {
    const sb = getServiceClient()
    const row = invoiceToDb(input as Partial<Invoice>)
    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return invoiceFromDb(data)
  },

  async getOutstandingTotal(providerId: ID): Promise<number> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('total').eq('provider_id', providerId).in('status', ['draft', 'sent'])
    if (error) throw error
    return (data ?? []).reduce((s: number, r: any) => s + (r.total ?? 0), 0)
  },

  async getVatSummary(providerId: ID, year: number): Promise<Record<number, { net: number; vat: number; gross: number }>> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .select('line_items, tax, total, subtotal').eq('provider_id', providerId)
      .gte('issued_at', `${year}-01-01`).lt('issued_at', `${year + 1}-01-01`)
      .not('status', 'eq', 'cancelled')
    if (error) throw error
    const result: Record<number, { net: number; vat: number; gross: number }> = {}
    for (const row of data ?? []) {
      const items: Array<{ vatRate?: number; total?: number }> = row.line_items ?? []
      for (const item of items) {
        const rate = Math.round((item.vatRate ?? 0) * 100)
        if (!result[rate]) result[rate] = { net: 0, vat: 0, gross: 0 }
        const net = item.total ?? 0
        const vat = Math.round(net * (item.vatRate ?? 0) * 100) / 100
        result[rate].net += net
        result[rate].vat += vat
        result[rate].gross += net + vat
      }
    }
    return result
  },

  // Alias for routes compatibility
  async listByProvider(providerId: ID, filters?: { status?: InvoiceStatus }): Promise<Invoice[]> {
    return this.list(providerId, filters)
  },
}
