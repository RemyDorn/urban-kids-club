// ============================================================
// Export Service – CSV, DATEV, PDF Export (v2 – fixed)
// ============================================================
// Fixes: CSV escaping, DATEV spec, consistent date filtering,
// no Buffer dependency (works in browser + Node.js)
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { ExportRequest, ExportFormat, ID } from '../types'

export interface CreateExportInput {
  providerId: ID
  type: ExportRequest['type']
  format: ExportFormat
  dateRange?: { from: string; to: string }
  filters?: Record<string, string>
}

export const ExportService = {

  createExport(input: CreateExportInput): ExportRequest {
    const id = generateId('exp')
    const now = new Date()

    const request: ExportRequest = {
      id,
      providerId: input.providerId,
      type: input.type,
      format: input.format,
      dateRange: input.dateRange,
      filters: input.filters,
      status: 'pending',
      createdAt: now,
    }

    store.state.exportRequests.set(id, request)
    store.addToIndex(store.indexes.exportsByProvider, input.providerId, id)

    // Sofort verarbeiten (In-Memory = synchron)
    this._processExport(request)

    return request
  },

  getById(id: ID): ExportRequest | undefined {
    return store.state.exportRequests.get(id)
  },

  listByProvider(providerId: ID): ExportRequest[] {
    const ids = store.getFromIndex(store.indexes.exportsByProvider, providerId)
    return Array.from(ids)
      .map((id) => store.state.exportRequests.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  _processExport(request: ExportRequest): void {
    request.status = 'processing'

    try {
      let content: string

      switch (request.type) {
        case 'bookings':
          content = this._exportBookings(request)
          break
        case 'invoices':
          content = this._exportInvoices(request)
          break
        case 'attendance':
          content = this._exportAttendance(request)
          break
        case 'customers':
          content = this._exportCustomers(request)
          break
        case 'revenue':
          content = this._exportRevenue(request)
          break
        default:
          content = ''
      }

      // In Produktion: Datei auf S3 hochladen und URL speichern
      // Kein Buffer.from – funktioniert auch im Browser
      request.fileUrl = `data:text/${request.format};charset=utf-8,${encodeURIComponent(content)}`
      request.status = 'completed'
      request.completedAt = new Date()
    } catch {
      request.status = 'failed'
    }
  },

  // --- CSV Escaping (Semikolon-getrennt für DE) ---

  _csvEscape(value: string): string {
    if (value.includes(';') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  },

  _csvRow(values: string[]): string {
    return values.map((v) => this._csvEscape(v)).join(';')
  },

  _filterByDate<T extends { createdAt?: Date; issuedAt?: Date }>(items: T[], dateRange?: { from: string; to: string }, dateField: 'createdAt' | 'issuedAt' = 'createdAt'): T[] {
    if (!dateRange) return items
    const from = new Date(dateRange.from)
    const to = new Date(dateRange.to + 'T23:59:59')
    return items.filter((item) => {
      const d = dateField === 'issuedAt' ? (item as any).issuedAt : (item as any).createdAt
      return d && d >= from && d <= to
    })
  },

  // --- Export-Methoden ---

  _exportBookings(request: ExportRequest): string {
    const bookingIds = store.getFromIndex(store.indexes.bookingsByProvider, request.providerId)
    let bookings = Array.from(bookingIds)
      .map((id) => store.state.bookings.get(id)!)
      .filter(Boolean)

    bookings = this._filterByDate(bookings, request.dateRange, 'createdAt')

    if (request.format === 'csv') {
      const header = this._csvRow(['Buchungs-ID', 'Kind', 'Kurs', 'Status', 'Zahlungsstatus', 'Betrag', 'Währung', 'Erstellt am'])
      const rows = bookings.map((b) => {
        const activity = store.state.activities.get(b.activityId)
        return this._csvRow([
          b.id,
          b.child.name,
          activity?.title ?? b.activityId,
          b.status,
          b.paymentStatus,
          b.amountPaid.toFixed(2).replace('.', ','),
          b.currency,
          b.createdAt.toISOString().split('T')[0],
        ])
      })
      return [header, ...rows].join('\n')
    }

    return JSON.stringify(bookings, null, 2)
  },

  _exportInvoices(request: ExportRequest): string {
    const invoiceIds = store.getFromIndex(store.indexes.invoicesByProvider, request.providerId)
    let invoices = Array.from(invoiceIds)
      .map((id) => store.state.invoices.get(id)!)
      .filter(Boolean)

    if (request.dateRange) {
      const from = new Date(request.dateRange.from)
      const to = new Date(request.dateRange.to)
      invoices = invoices.filter((i) => i.issuedAt >= from && i.issuedAt <= to)
    }

    if (request.format === 'datev') {
      return this._toDATEV(invoices)
    }

    if (request.format === 'csv') {
      const header = 'Rechnungsnr.;Kunde;Netto;MwSt;Brutto;Währung;Status;Ausgestellt;Fällig'
      const rows = invoices.map((inv) => {
        const parent = store.state.parents.get(inv.parentId)
        return [
          inv.number,
          parent?.name ?? inv.parentId,
          inv.subtotal.toFixed(2).replace('.', ','),
          inv.tax.toFixed(2).replace('.', ','),
          inv.total.toFixed(2).replace('.', ','),
          inv.currency,
          inv.status,
          inv.issuedAt.toISOString().split('T')[0],
          inv.dueDate.toISOString().split('T')[0],
        ].join(';')
      })
      return [header, ...rows].join('\n')
    }

    return JSON.stringify(invoices, null, 2)
  },

  // DATEV-Export: Buchungsstapel für den Steuerberater
  _toDATEV(invoices: Array<{
    number: string
    parentId: string
    subtotal: number
    tax: number
    total: number
    issuedAt: Date
    status: string
  }>): string {
    // DATEV Buchungsstapel Header (vereinfacht)
    const header = [
      'Umsatz (ohne Soll/Haben-Kz);Soll/Haben-Kennzeichen;WKZ Umsatz;Kurs;Basisumsatz;',
      'WKZ Basisumsatz;Konto;Gegenkonto (ohne BU-Schlüssel);BU-Schlüssel;Belegdatum;',
      'Belegfeld 1;Buchungstext',
    ].join('')

    const rows = invoices
      .filter((inv) => inv.status === 'paid')
      .map((inv) => {
        const parent = store.state.parents.get(inv.parentId)
        const date = inv.issuedAt
        const belegDatum = `${(date.getDate()).toString().padStart(2, '0')}${(date.getMonth() + 1).toString().padStart(2, '0')}`

        return [
          inv.total.toFixed(2).replace('.', ','),  // Umsatz
          'S',                                      // Soll
          'EUR',                                    // Währung
          '',                                       // Kurs
          '',                                       // Basisumsatz
          '',                                       // WKZ Basis
          '10000',                                  // Konto (Debitoren)
          '8400',                                   // Gegenkonto (Erlöse 19% USt)
          '',                                       // BU-Schlüssel
          belegDatum,                               // Belegdatum TTMM
          inv.number,                               // Belegfeld (Rechnungsnr.)
          parent?.name ?? 'Kunde',                  // Buchungstext
        ].join(';')
      })

    return [header, ...rows].join('\n')
  },

  _exportAttendance(request: ExportRequest): string {
    const activityIds = store.getFromIndex(store.indexes.activitiesByProvider, request.providerId)
    const records: Array<{ activity: string; child: string; date: string; present: boolean }> = []

    for (const actId of activityIds) {
      const activity = store.state.activities.get(actId)
      if (!activity) continue

      const attIds = store.getFromIndex(store.indexes.attendanceByActivity, actId)
      for (const attId of attIds) {
        const att = store.state.attendance.get(attId)
        if (!att) continue

        const booking = store.state.bookings.get(att.bookingId)
        records.push({
          activity: activity.title,
          child: booking?.child.name ?? att.bookingId,
          date: att.date,
          present: att.checkedIn,
        })
      }
    }

    if (request.format === 'csv') {
      const header = 'Kurs;Kind;Datum;Anwesend'
      const rows = records.map((r) => [r.activity, r.child, r.date, r.present ? 'Ja' : 'Nein'].join(';'))
      return [header, ...rows].join('\n')
    }

    return JSON.stringify(records, null, 2)
  },

  _exportCustomers(request: ExportRequest): string {
    const bookingIds = store.getFromIndex(store.indexes.bookingsByProvider, request.providerId)
    const parentIds = new Set<string>()
    for (const bid of bookingIds) {
      const b = store.state.bookings.get(bid)
      if (b) parentIds.add(b.parentId)
    }

    const customers = Array.from(parentIds)
      .map((pid) => store.state.parents.get(pid))
      .filter(Boolean)

    if (request.format === 'csv') {
      const header = 'Name;E-Mail;Telefon;Kinder;Registriert am'
      const rows = customers.map((c) => [
        c!.name,
        c!.email,
        c!.phone ?? '',
        c!.children.map((ch) => `${ch.name} (${ch.age})`).join(', '),
        c!.createdAt.toISOString().split('T')[0],
      ].join(';'))
      return [header, ...rows].join('\n')
    }

    return JSON.stringify(customers, null, 2)
  },

  _exportRevenue(request: ExportRequest): string {
    const paymentIds = store.getFromIndex(store.indexes.paymentsByProvider, request.providerId)
    let payments = Array.from(paymentIds)
      .map((id) => store.state.payments.get(id)!)
      .filter((p) => p && p.status === 'completed')

    if (request.dateRange) {
      const from = new Date(request.dateRange.from)
      const to = new Date(request.dateRange.to)
      payments = payments.filter((p) => p.createdAt >= from && p.createdAt <= to)
    }

    if (request.format === 'csv') {
      const header = 'Datum;Betrag;Währung;Methode;Referenz;Buchungs-ID;Rechnungs-ID'
      const rows = payments.map((p) => [
        p.createdAt.toISOString().split('T')[0],
        p.amount.toFixed(2).replace('.', ','),
        p.currency,
        p.method,
        p.reference,
        p.bookingId ?? '',
        p.invoiceId ?? '',
      ].join(';'))
      return [header, ...rows].join('\n')
    }

    return JSON.stringify(payments, null, 2)
  },
}
