// ============================================================
// Invoice Service – Rechnungen (v2 – GoBD-konform)
// ============================================================
// Variable MwSt-Sätze (19% Standard, 7% ermäßigt, 0% befreit)
// Doppelte Rechnungsprüfung, Audit-Integration, E-Rechnung-Link
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import { Validators } from './validators'
import { createNotification, createAuditEntry } from './helpers'
import type { Invoice, InvoiceLineItem, InvoiceStatus, Currency, ID } from '../types'

export interface InvoiceLineItemInput {
  description: string
  quantity: number
  unitPrice: number
  vatRate?: number           // 0.19 (Standard), 0.07 (ermäßigt), 0 (befreit)
}

export interface CreateInvoiceInput {
  providerId: ID
  parentId: ID
  bookingIds?: ID[]
  lineItems: InvoiceLineItemInput[]
  currency?: Currency
  dueInDays?: number         // Zahlungsziel, default 14
}

// Laufende Rechnungsnummer pro Provider (persistent in Produktion!)
// LIMITATION: This in-memory counter is safe for single-process Node.js (event loop is
// single-threaded, so no concurrent increments). For multi-process or clustered deployments,
// use the Supabase-backed invoice service which uses SELECT ... FOR UPDATE or a DB sequence.
const invoiceCounters = new Map<ID, number>()

function nextInvoiceNumber(providerId: ID): string {
  // Nur versendete/bezahlte/überfällige Rechnungen zählen (keine Entwürfe)
  const existing = Array.from(store.getFromIndex(store.indexes.invoicesByProvider, providerId))
    .map((id) => store.state.invoices.get(id)!)
    .filter((inv) => inv && inv.status !== 'draft')

  const currentFromCounter = invoiceCounters.get(providerId) ?? 0
  const currentFromExisting = existing.reduce((max, inv) => {
    const match = inv.number.match(/INV-\d{4}-(\d+)/)
    return match ? Math.max(max, parseInt(match[1])) : max
  }, 0)

  const current = Math.max(currentFromCounter, currentFromExisting)
  const next = current + 1
  invoiceCounters.set(providerId, next)
  const year = new Date().getFullYear()
  return `INV-${year}-${next.toString().padStart(4, '0')}`
}

export const InvoiceService = {

  create(input: CreateInvoiceInput): Invoice | { error: string } {
    // Validierung
    const providerCheck = Validators.providerExists(input.providerId)
    if (!providerCheck.valid) return { error: providerCheck.errors[0] }

    const parentCheck = Validators.parentExists(input.parentId)
    if (!parentCheck.valid) return { error: parentCheck.errors[0] }

    if (!input.lineItems || input.lineItems.length === 0) {
      return { error: 'Mindestens eine Rechnungsposition erforderlich' }
    }

    // Prüfe ob Buchung bereits eine Rechnung hat
    if (input.bookingIds?.length) {
      for (const bid of input.bookingIds) {
        const existingInvoices = Array.from(store.getFromIndex(store.indexes.invoicesByProvider, input.providerId))
          .map((id) => store.state.invoices.get(id)!)
          .filter((inv) => inv && inv.bookingIds.includes(bid) && inv.status !== 'cancelled')

        if (existingInvoices.length > 0) {
          return { error: `Buchung ${bid} hat bereits eine aktive Rechnung (${existingInvoices[0].number})` }
        }
      }
    }

    const id = generateId('inv')
    const now = new Date()
    const dueInDays = input.dueInDays ?? 14

    // Line Items mit variabler MwSt berechnen
    // Preise sind IMMER Brutto (inkl. MwSt) — MwSt rausrechnen, nicht draufschlagen
    const lineItems: InvoiceLineItem[] = input.lineItems.map((item) => {
      const vatRate = item.vatRate ?? 0.19
      const bruttoTotal = Math.round(item.quantity * item.unitPrice * 100) / 100
      const netAmount = vatRate > 0
        ? Math.round(bruttoTotal / (1 + vatRate) * 100) / 100
        : bruttoTotal
      const vatAmount = Math.round((bruttoTotal - netAmount) * 100) / 100
      return {
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate,
        total: bruttoTotal,       // Brutto
        netAmount,                // Netto
        vatAmount,                // MwSt-Betrag
      }
    })

    // Netto = Summe aller Netto-Beträge
    const subtotal = Math.round(lineItems.reduce((sum, item) => sum + item.netAmount, 0) * 100) / 100

    // MwSt = Summe aller MwSt-Beträge
    const tax = Math.round(lineItems.reduce((sum, item) => sum + item.vatAmount, 0) * 100) / 100

    // Brutto-Gesamtbetrag = Summe aller Brutto-Beträge (= was der Kunde zahlt)
    const total = Math.round(lineItems.reduce((sum, item) => sum + item.total, 0) * 100) / 100

    // Betrag muss positiv sein
    const amountCheck = Validators.amountPositive(total, 'Rechnungsbetrag')
    if (!amountCheck.valid) return { error: amountCheck.errors[0] }

    const dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + dueInDays)

    const invoice: Invoice = {
      id,
      providerId: input.providerId,
      parentId: input.parentId,
      bookingIds: input.bookingIds ?? [],
      number: 'ENTWURF',
      lineItems,
      subtotal,
      tax,
      total,
      currency: input.currency ?? 'EUR',
      status: 'draft',
      issuedAt: now,
      dueDate,
    }

    store.state.invoices.set(id, invoice)
    store.addToIndex(store.indexes.invoicesByProvider, input.providerId, id)
    store.addToIndex(store.indexes.invoicesByParent, input.parentId, id)

    createAuditEntry({
      providerId: input.providerId, userId: input.providerId, userType: 'provider',
      action: 'invoice.created', entityType: 'invoice', entityId: id,
    })

    return invoice
  },

  getById(id: ID): Invoice | undefined {
    return store.state.invoices.get(id)
  },

  listByProvider(providerId: ID, filters?: { status?: InvoiceStatus }): Invoice[] {
    const ids = store.getFromIndex(store.indexes.invoicesByProvider, providerId)
    let result = Array.from(ids)
      .map((id) => store.state.invoices.get(id)!)
      .filter(Boolean)

    if (filters?.status) {
      result = result.filter((inv) => inv.status === filters.status)
    }

    return result.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
  },

  listByParent(parentId: ID): Invoice[] {
    const ids = store.getFromIndex(store.indexes.invoicesByParent, parentId)
    return Array.from(ids)
      .map((id) => store.state.invoices.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
  },

  send(id: ID): Invoice | undefined {
    const invoice = store.state.invoices.get(id)
    if (!invoice || invoice.status !== 'draft') return undefined
    // GoBD: Rechnungsnummer erst beim Versenden vergeben
    invoice.number = nextInvoiceNumber(invoice.providerId)
    invoice.status = 'sent'

    createNotification({
      recipientType: 'parent', recipientId: invoice.parentId,
      type: 'invoice_sent',
      title: `Rechnung ${invoice.number}`,
      body: `Sie haben eine neue Rechnung über ${invoice.total} ${invoice.currency} erhalten. Fällig am ${invoice.dueDate.toISOString().split('T')[0]}.`,
      data: { invoiceId: id, invoiceNumber: invoice.number },
    })

    createAuditEntry({
      providerId: invoice.providerId, userId: invoice.providerId, userType: 'provider',
      action: 'invoice.sent', entityType: 'invoice', entityId: id,
    })

    return invoice
  },

  markPaid(id: ID): Invoice | undefined {
    const invoice = store.state.invoices.get(id)
    if (!invoice || invoice.status === 'cancelled' || invoice.status === 'draft') return undefined
    invoice.status = 'paid'
    invoice.paidAt = new Date()
    return invoice
  },

  markOverdue(id: ID): Invoice | undefined {
    const invoice = store.state.invoices.get(id)
    if (!invoice || invoice.status !== 'sent') return undefined
    invoice.status = 'overdue'
    return invoice
  },

  cancel(id: ID): Invoice | undefined {
    const invoice = store.state.invoices.get(id)
    if (!invoice || invoice.status === 'paid') return undefined
    invoice.status = 'cancelled'
    return invoice
  },

  // Aus Buchung automatisch Rechnung generieren
  createFromBooking(bookingId: ID, vatRate: number = 0.19): Invoice | { error: string } {
    const booking = store.state.bookings.get(bookingId)
    if (!booking) return { error: 'Buchung nicht gefunden' }

    const activity = store.state.activities.get(booking.activityId)
    if (!activity) return { error: 'Aktivität nicht gefunden' }

    const pricingOption = activity.pricing.find((p) => p.id === booking.pricingOptionId)
    if (!pricingOption) return { error: 'Preisoption nicht gefunden' }

    const lineItems: InvoiceLineItemInput[] = [
      {
        description: `${activity.title} – ${pricingOption.label} (${booking.child.name})`,
        quantity: 1,
        unitPrice: pricingOption.amount,
        vatRate,
      },
    ]

    // Geschwisterrabatt als separate Rechnungsposition
    if (booking.discountApplied && booking.discountApplied > 0 && booking.discountReason === 'sibling') {
      lineItems.push({
        description: `Geschwisterrabatt (${pricingOption.siblingDiscount || ''}%)`,
        quantity: 1,
        unitPrice: -booking.discountApplied,
        vatRate,
      })
    }

    return this.create({
      providerId: booking.providerId,
      parentId: booking.parentId,
      bookingIds: [bookingId],
      lineItems,
      currency: pricingOption.currency,
    })
  },

  // Offener Betrag pro Provider
  getOutstandingTotal(providerId: ID): { count: number; total: number } {
    const invoices = this.listByProvider(providerId)
    const outstanding = invoices.filter((inv) => inv.status === 'sent' || inv.status === 'overdue')
    return {
      count: outstanding.length,
      total: outstanding.reduce((sum, inv) => sum + inv.total, 0),
    }
  },

  // MwSt-Zusammenfassung für Steuererklärung
  getVatSummary(providerId: ID, year: number): {
    totalNet: number
    totalVat: number
    totalGross: number
    paidInvoices: number
    openInvoices: number
  } {
    const invoices = this.listByProvider(providerId)
      .filter((inv) => inv.issuedAt.getFullYear() === year && inv.status !== 'cancelled')

    return {
      totalNet: Math.round(invoices.reduce((sum, inv) => sum + inv.subtotal, 0) * 100) / 100,
      totalVat: Math.round(invoices.reduce((sum, inv) => sum + inv.tax, 0) * 100) / 100,
      totalGross: Math.round(invoices.reduce((sum, inv) => sum + inv.total, 0) * 100) / 100,
      paidInvoices: invoices.filter((inv) => inv.status === 'paid').length,
      openInvoices: invoices.filter((inv) => inv.status !== 'paid' && inv.status !== 'cancelled').length,
    }
  },
}
