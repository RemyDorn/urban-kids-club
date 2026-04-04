// ============================================================
// Payment & SEPA Service – Zahlungsverwaltung (130%-Feature)
// ============================================================
// SEPA-Lastschrift ist der Standard für wiederkehrende Zahlungen
// in Deutschland (Kursgebühren, Monatsabos).
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { PaymentRecord, PaymentMethod, SepaMandate, SepaStatus, Currency, ID } from '../types'

// --- SEPA Mandate ---

export interface CreateSepaMandateInput {
  providerId: ID
  parentId: ID
  iban: string
  bic?: string
  accountHolder: string
}

// Laufende Mandatsreferenz
const mandateCounters = new Map<ID, number>()

function nextMandateReference(providerId: ID): string {
  const current = mandateCounters.get(providerId) ?? 0
  const next = current + 1
  mandateCounters.set(providerId, next)
  const year = new Date().getFullYear()
  return `MNDT-${year}-${next.toString().padStart(4, '0')}`
}

export const SepaMandateService = {

  create(input: CreateSepaMandateInput): SepaMandate {
    const id = generateId('sepa')
    const now = new Date()

    const mandate: SepaMandate = {
      id,
      providerId: input.providerId,
      parentId: input.parentId,
      mandateReference: nextMandateReference(input.providerId),
      iban: input.iban,   // In Produktion: verschlüsseln!
      bic: input.bic,
      accountHolder: input.accountHolder,
      signedAt: now,
      status: 'active',
      createdAt: now,
    }

    store.state.sepaMandates.set(id, mandate)
    store.addToIndex(store.indexes.mandatesByProvider, input.providerId, id)
    store.addToIndex(store.indexes.mandatesByParent, input.parentId, id)

    return mandate
  },

  getById(id: ID): SepaMandate | undefined {
    return store.state.sepaMandates.get(id)
  },

  getActiveMandate(providerId: ID, parentId: ID): SepaMandate | undefined {
    const mandateIds = store.getFromIndex(store.indexes.mandatesByProvider, providerId)
    for (const mid of mandateIds) {
      const mandate = store.state.sepaMandates.get(mid)
      if (mandate && mandate.parentId === parentId && mandate.status === 'active') {
        return mandate
      }
    }
    return undefined
  },

  listByProvider(providerId: ID): SepaMandate[] {
    const ids = store.getFromIndex(store.indexes.mandatesByProvider, providerId)
    return Array.from(ids)
      .map((id) => store.state.sepaMandates.get(id)!)
      .filter(Boolean)
  },

  listByParent(parentId: ID): SepaMandate[] {
    const ids = store.getFromIndex(store.indexes.mandatesByParent, parentId)
    return Array.from(ids)
      .map((id) => store.state.sepaMandates.get(id)!)
      .filter(Boolean)
  },

  cancel(id: ID): SepaMandate | undefined {
    const mandate = store.state.sepaMandates.get(id)
    if (!mandate || mandate.status !== 'active') return undefined
    mandate.status = 'cancelled'
    return mandate
  },
}

// --- Zahlungen ---

export interface CreatePaymentInput {
  providerId: ID
  parentId: ID
  bookingId?: ID
  invoiceId?: ID
  method: PaymentMethod
  amount: number
  currency?: Currency
  reference: string
  sepaMandateId?: ID
}

export const PaymentService = {

  create(input: CreatePaymentInput): PaymentRecord {
    const id = generateId('pay')
    const now = new Date()

    const payment: PaymentRecord = {
      id,
      providerId: input.providerId,
      parentId: input.parentId,
      bookingId: input.bookingId,
      invoiceId: input.invoiceId,
      method: input.method,
      amount: input.amount,
      currency: input.currency ?? 'EUR',
      reference: input.reference,
      status: 'pending',
      sepaMandateId: input.sepaMandateId,
      createdAt: now,
    }

    store.state.payments.set(id, payment)
    store.addToIndex(store.indexes.paymentsByProvider, input.providerId, id)
    store.addToIndex(store.indexes.paymentsByParent, input.parentId, id)
    if (input.bookingId) {
      store.addToIndex(store.indexes.paymentsByBooking, input.bookingId, id)
    }
    if (input.invoiceId) {
      store.addToIndex(store.indexes.paymentsByInvoice, input.invoiceId, id)
    }

    return payment
  },

  getById(id: ID): PaymentRecord | undefined {
    return store.state.payments.get(id)
  },

  listByProvider(providerId: ID, filters?: { method?: PaymentMethod; status?: string }): PaymentRecord[] {
    const ids = store.getFromIndex(store.indexes.paymentsByProvider, providerId)
    let result = Array.from(ids)
      .map((id) => store.state.payments.get(id)!)
      .filter(Boolean)

    if (filters?.method) {
      result = result.filter((p) => p.method === filters.method)
    }
    if (filters?.status) {
      result = result.filter((p) => p.status === filters.status)
    }

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  listByParent(parentId: ID): PaymentRecord[] {
    const ids = store.getFromIndex(store.indexes.paymentsByParent, parentId)
    return Array.from(ids)
      .map((id) => store.state.payments.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  listByBooking(bookingId: ID): PaymentRecord[] {
    const ids = store.getFromIndex(store.indexes.paymentsByBooking, bookingId)
    return Array.from(ids)
      .map((id) => store.state.payments.get(id)!)
      .filter(Boolean)
  },

  listByInvoice(invoiceId: ID): PaymentRecord[] {
    const ids = store.getFromIndex(store.indexes.paymentsByInvoice, invoiceId)
    return Array.from(ids)
      .map((id) => store.state.payments.get(id)!)
      .filter(Boolean)
  },

  markCompleted(id: ID): PaymentRecord | undefined {
    const payment = store.state.payments.get(id)
    if (!payment || payment.status !== 'pending') return undefined
    payment.status = 'completed'
    payment.processedAt = new Date()

    // Wenn Zahlung einer Buchung zugeordnet, Buchung als bezahlt markieren
    if (payment.bookingId) {
      const booking = store.state.bookings.get(payment.bookingId)
      if (booking) {
        booking.paymentStatus = 'paid'
        booking.amountPaid = payment.amount
        booking.updatedAt = new Date()
      }
    }

    // Wenn Zahlung einer Rechnung zugeordnet
    if (payment.invoiceId) {
      const invoice = store.state.invoices.get(payment.invoiceId)
      if (invoice) {
        invoice.status = 'paid'
        invoice.paidAt = new Date()
      }
    }

    return payment
  },

  markFailed(id: ID): PaymentRecord | undefined {
    const payment = store.state.payments.get(id)
    if (!payment || payment.status !== 'pending') return undefined
    payment.status = 'failed'
    payment.processedAt = new Date()
    return payment
  },

  refund(id: ID): PaymentRecord | undefined {
    const payment = store.state.payments.get(id)
    if (!payment || payment.status !== 'completed') return undefined
    payment.status = 'refunded'
    payment.processedAt = new Date()

    // Buchung-Status aktualisieren
    if (payment.bookingId) {
      const booking = store.state.bookings.get(payment.bookingId)
      if (booking) {
        booking.paymentStatus = 'refunded'
        booking.updatedAt = new Date()
      }
    }

    return payment
  },

  // SEPA-Lastschriftlauf: Alle offenen Rechnungen einziehen
  runSepaCollection(providerId: ID): PaymentRecord[] {
    const invoiceIds = store.getFromIndex(store.indexes.invoicesByProvider, providerId)
    const created: PaymentRecord[] = []

    for (const invId of invoiceIds) {
      const invoice = store.state.invoices.get(invId)
      if (!invoice || invoice.status !== 'sent') continue

      // SEPA-Mandat des Elternteils suchen
      const mandate = SepaMandateService.getActiveMandate(providerId, invoice.parentId)
      if (!mandate) continue

      const payment = this.create({
        providerId,
        parentId: invoice.parentId,
        invoiceId: invId,
        method: 'sepa_direct_debit',
        amount: invoice.total,
        currency: invoice.currency,
        reference: `Rechnung ${invoice.number}`,
        sepaMandateId: mandate.id,
      })

      created.push(payment)
    }

    return created
  },

  // Umsatz-Zusammenfassung
  getRevenueSummary(providerId: ID): {
    totalReceived: number
    totalPending: number
    totalRefunded: number
    byMethod: Record<string, number>
  } {
    const payments = this.listByProvider(providerId)

    const byMethod: Record<string, number> = {}
    let totalReceived = 0
    let totalPending = 0
    let totalRefunded = 0

    for (const p of payments) {
      if (p.status === 'completed') {
        totalReceived += p.amount
        byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount
      } else if (p.status === 'pending') {
        totalPending += p.amount
      } else if (p.status === 'refunded') {
        totalRefunded += p.amount
      }
    }

    return { totalReceived, totalPending, totalRefunded, byMethod }
  },
}
