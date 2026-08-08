// ============================================================
// Invoice Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { invoiceFromDb, invoiceToDb } from './mappers'
import type { Invoice, InvoiceStatus, Currency, ID } from '../../types'

const TABLE = 'invoices'

export const SupabaseInvoiceService = {

  async list(providerId: ID, filters?: { status?: InvoiceStatus; limit?: number; offset?: number }): Promise<Invoice[]> {
    const sb = getServiceClient()
    const limit = filters?.limit ?? 100
    const offset = filters?.offset ?? 0
    let query = sb.from(TABLE).select('*').eq('provider_id', providerId).order('issued_at', { ascending: false })
    if (filters?.status) query = query.eq('status', filters.status)
    query = query.range(offset, offset + limit - 1)
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

    // Draft gets temporary number — real number assigned on send
    const invoiceNumber = `ENTWURF-${Date.now()}`

    // Preise sind IMMER Brutto (inkl. MwSt) — MwSt rausrechnen, nicht draufschlagen
    const vatRate = customVatRate !== undefined ? customVatRate : 0.19
    const total = Math.round(amount * 100) / 100  // Brutto = was der Kunde zahlt
    const subtotal = vatRate > 0 ? Math.round((total / (1 + vatRate)) * 100) / 100 : total  // Netto
    const tax = Math.round((total - subtotal) * 100) / 100  // MwSt-Betrag

    const now = new Date()
    const dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + 14)

    const netAmount = subtotal  // alias for clarity
    const vatAmount = tax       // alias for clarity

    const row = invoiceToDb({
      providerId,
      parentId: booking.parent_id,
      bookingIds: [bookingId],
      number: invoiceNumber,
      lineItems: [{
        description: `${activity.title} – ${label}`,
        quantity: 1,
        unitPrice: amount,        // Brutto-Einzelpreis (was der Kunde zahlt)
        vatRate,
        total,                    // Brutto-Gesamtpreis
        netAmount,                // Netto
        vatAmount,                // MwSt-Betrag
      }],
      subtotal,                   // = Netto-Summe
      tax,                        // = MwSt-Summe
      total,                      // = Brutto-Summe
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

    // Generate final invoice number atomically via DB function (next_invoice_number)
    // Uses INSERT ... ON CONFLICT to guarantee unique sequential numbers per provider
    const { data: finalNumber, error: seqErr } = await sb.rpc('next_invoice_number', {
      p_provider_id: invoiceRow.provider_id,
    })
    if (seqErr || !finalNumber) {
      throw new Error('Rechnungsnummer konnte nicht generiert werden: ' + (seqErr?.message || 'unknown'))
    }

    // Persist final number to DB FIRST (before email) — ensures DB always has the correct number
    const { error: numErr } = await sb.from(TABLE)
      .update({ number: finalNumber })
      .eq('id', id)
    if (numErr) throw numErr

    // Send email with final number
    try {
      const { data: parent } = await sb.from('parents').select('name, email').eq('id', invoiceRow.parent_id).single()
      const { data: provider } = await sb.from('providers').select('company_name').eq('id', invoiceRow.provider_id).single()
      if (parent?.email) {
        const { EmailService } = await import('../../lib/email')
        let courseName = ''
        let childName = ''
        const bookingIds: string[] = Array.isArray(invoiceRow.booking_ids) ? invoiceRow.booking_ids : invoiceRow.booking_ids ? [invoiceRow.booking_ids] : []
        if (bookingIds.length > 0) {
          const { data: booking } = await sb.from('provider_bookings')
            .select('activity_id, child_info').eq('id', bookingIds[0]).maybeSingle()
          if (booking) {
            const ci = booking.child_info as any
            childName = ci?.firstName ? (ci.firstName + ' ' + (ci.lastName || '')).trim() : ''
            const { data: activity } = await sb.from('activities').select('title').eq('id', booking.activity_id).maybeSingle()
            courseName = activity?.title || ''
          }
        }
        const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
        // Generate HMAC view token for secure invoice link
        const { createHmac } = await import('node:crypto')
        const viewSecret = process.env.INVOICE_VIEW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        const viewToken = viewSecret ? createHmac('sha256', viewSecret).update(id).digest('hex').slice(0, 32) : ''
        const invoiceLink = origin + '/api/invoices/' + id + '/view' + (viewToken ? '?token=' + viewToken : '')
        await EmailService.sendInvoice(parent.email, {
          parentName: parent.name,
          invoiceNumber: finalNumber,
          amount: Number(invoiceRow.total).toFixed(2).replace('.', ',') + ' €',
          dueDate: new Date(invoiceRow.due_date).toLocaleDateString('de-DE'),
          providerName: provider?.company_name || '',
          courseName,
          childName,
          invoiceLink,
          providerId: invoiceRow.provider_id || (provider as any)?.id,
        })
        console.log(`[Invoice] Email sent to ${parent.email} for invoice ${finalNumber}`)
      }
    } catch (emailErr) {
      console.error('[Invoice] Email send failed:', emailErr)
      // Revert: set number back to draft placeholder so the sequence number isn't wasted
      await sb.from(TABLE).update({ number: 'ENTWURF-' + Date.now() }).eq('id', id)
      throw new Error('E-Mail konnte nicht gesendet werden. Rechnung bleibt als Entwurf.')
    }

    // Email sent → update status (number was already claimed above to prevent race conditions)
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'sent', sent_at: new Date().toISOString() })
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

    // Fetch first to inspect status + line_items (for Storno-Rechnung)
    let fetchQ = sb.from(TABLE).select('*').eq('id', id)
    if (providerId) fetchQ = fetchQ.eq('provider_id', providerId)
    const { data: orig, error: fetchErr } = await fetchQ.maybeSingle()
    if (fetchErr) throw fetchErr
    if (!orig) return undefined
    if (orig.status === 'cancelled') return invoiceFromDb(orig) // idempotent

    // §14 UStG-konform: bereits versendete/bezahlte Rechnungen dürfen nicht gelöscht werden,
    // sondern eine Storno-Rechnung mit negativen Beträgen muss erstellt werden.
    const needsStorno = orig.status === 'sent' || orig.status === 'paid' || orig.status === 'overdue'

    // Mark original as cancelled (allow paid → cancelled when creating Storno)
    const { data: cancelled, error: updErr } = await sb.from(TABLE)
      .update({ status: 'cancelled' }).eq('id', id).select().maybeSingle()
    if (updErr) throw updErr
    if (!cancelled) return undefined

    if (!needsStorno) return invoiceFromDb(cancelled)

    // Create Storno-Rechnung with negative amounts referencing original
    try {
      const stornoRefNote = `Storno-Rechnung zu ${orig.number} (${orig.status === 'paid' ? 'bezahlt' : 'versendet'} am ${(orig.issued_at || '').slice(0,10)})`
      const stornoLineItems = (orig.line_items || []).map((item: any, idx: number) => ({
        description: idx === 0
          ? `Storno: ${item.description || 'Position'} — ${stornoRefNote}`
          : `Storno: ${item.description || 'Position'} (zu Rechnung ${orig.number})`,
        quantity: item.quantity ?? 1,
        unitPrice: -(item.unitPrice ?? 0),
        vatRate: item.vatRate ?? 0.19,
        total: -(item.total ?? 0),
        netAmount: item.netAmount !== undefined ? -item.netAmount : undefined,
        vatAmount: item.vatAmount !== undefined ? -item.vatAmount : undefined,
      }))

      // Reserve a sequential number for the Storno-Rechnung
      const { data: stornoNumber, error: seqErr } = await sb.rpc('next_invoice_number', {
        p_provider_id: orig.provider_id,
      })
      const stornoNumberStr = (seqErr || !stornoNumber) ? `STORNO-${Date.now()}` : `STORNO-${stornoNumber}`

      const now = new Date().toISOString()
      await sb.from(TABLE).insert({
        provider_id: orig.provider_id,
        parent_id: orig.parent_id,
        booking_ids: orig.booking_ids,
        number: stornoNumberStr,
        line_items: stornoLineItems,
        subtotal: -Number(orig.subtotal || 0),
        tax: -Number(orig.tax || 0),
        total: -Number(orig.total || 0),
        currency: orig.currency || 'EUR',
        status: 'sent', // direkt versendet (Storno braucht keine Draft-Phase)
        issued_at: now,
        due_date: now,
      })
      console.log(`[Invoice.cancel] Storno-Rechnung erstellt für ${orig.number} → ${stornoNumberStr}`)
    } catch (stornoErr) {
      console.error('[Invoice.cancel] Storno-Rechnung Erstellung fehlgeschlagen:', stornoErr)
      // Return original-cancelled even if Storno-creation failed (user can retry manually)
    }

    return invoiceFromDb(cancelled)
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
      const items: Array<{ vatRate?: number; total?: number; netAmount?: number; vatAmount?: number }> = row.line_items ?? []
      for (const item of items) {
        const rate = Math.round((item.vatRate ?? 0) * 100)
        if (!result[rate]) result[rate] = { net: 0, vat: 0, gross: 0 }
        // total ist Brutto, netAmount/vatAmount sind die aufgeschlüsselten Werte
        const brutto = item.total ?? 0
        const vatRate = item.vatRate ?? 0
        const net = item.netAmount ?? (vatRate > 0 ? Math.round(brutto / (1 + vatRate) * 100) / 100 : brutto)
        const vat = item.vatAmount ?? Math.round((brutto - net) * 100) / 100
        result[rate].net += net
        result[rate].vat += vat
        result[rate].gross += brutto
      }
    }
    return result
  },

  // Alias for routes compatibility
  async listByProvider(providerId: ID, filters?: { status?: InvoiceStatus; limit?: number; offset?: number }): Promise<Invoice[]> {
    return this.list(providerId, filters)
  },
}
