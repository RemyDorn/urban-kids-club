// ============================================================
// Invoice Service – Rechnungen (130%-Feature)
// ============================================================
// Eigenständiges Feature für Provider – unabhängig von der Plattform.
// Provider können Rechnungen an Eltern erstellen und verwalten.
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { Invoice, InvoiceLineItem, InvoiceStatus, Currency, ID } from '../types'

export interface CreateInvoiceInput {
  providerId: ID
  parentId: ID
  bookingIds?: ID[]
  lineItems: InvoiceLineItem[]
  currency?: Currency
  taxRate?: number           // z.B. 0.19 für 19% MwSt
  dueInDays?: number         // Zahlungsziel, default 14
}

// Laufende Rechnungsnummer pro Provider
const invoiceCounters = new Map<ID, number>()

function nextInvoiceNumber(providerId: ID): string {
  const current = invoiceCounters.get(providerId) ?? 0
  const next = current + 1
  invoiceCounters.set(providerId, next)
  const year = new Date().getFullYear()
  return `INV-${year}-${next.toString().padStart(4, '0')}`
}

export const InvoiceService = {

  create(input: CreateInvoiceInput): Invoice {
    const id = generateId('inv')
    const now = new Date()
    const taxRate = input.taxRate ?? 0.19
    const dueInDays = input.dueInDays ?? 14

    const subtotal = input.lineItems.reduce((sum, item) => sum + item.total, 0)
    const tax = Math.round(subtotal * taxRate * 100) / 100
    const total = Math.round((subtotal + tax) * 100) / 100

    const dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + dueInDays)

    const invoice: Invoice = {
      id,
      providerId: input.providerId,
      parentId: input.parentId,
      bookingIds: input.bookingIds ?? [],
      number: nextInvoiceNumber(input.providerId),
      lineItems: input.lineItems,
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
    invoice.status = 'sent'
    return invoice
  },

  markPaid(id: ID): Invoice | undefined {
    const invoice = store.state.invoices.get(id)
    if (!invoice) return undefined
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
  createFromBooking(bookingId: ID): Invoice | { error: string } {
    const booking = store.state.bookings.get(bookingId)
    if (!booking) return { error: 'Buchung nicht gefunden' }

    const activity = store.state.activities.get(booking.activityId)
    if (!activity) return { error: 'Aktivität nicht gefunden' }

    const pricingOption = activity.pricing.find((p) => p.id === booking.pricingOptionId)
    if (!pricingOption) return { error: 'Preisoption nicht gefunden' }

    return this.create({
      providerId: booking.providerId,
      parentId: booking.parentId,
      bookingIds: [bookingId],
      lineItems: [
        {
          description: `${activity.title} – ${pricingOption.label} (${booking.child.name})`,
          quantity: 1,
          unitPrice: pricingOption.amount,
          total: pricingOption.amount,
        },
      ],
      currency: pricingOption.currency,
    })
  },

  // Offener Betrag pro Provider
  getOutstandingTotal(providerId: ID): number {
    const invoices = this.listByProvider(providerId)
    return invoices
      .filter((inv) => inv.status === 'sent' || inv.status === 'overdue')
      .reduce((sum, inv) => sum + inv.total, 0)
  },
}
