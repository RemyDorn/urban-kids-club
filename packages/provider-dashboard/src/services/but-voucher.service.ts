// ============================================================
// BuT Voucher Service – Bildungs- und Teilhabepaket
// ============================================================
// Das Bildungspaket gewährt Kindern aus einkommensschwachen
// Familien 15 €/Monat für Sport, Kultur & Musik.
// Provider können diese Gutscheine annehmen und abrechnen.
// ============================================================
// Quelle: Bundesagentur für Arbeit – Bildungspaket
// SGB II §28 Abs. 7 / SGB XII §34 Abs. 7
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { BuTVoucher, BuTVoucherStatus, ID } from '../types'

export interface CreateBuTVoucherInput {
  providerId: ID
  parentId: ID
  childName: string
  bookingId?: ID
  voucherNumber: string
  issuingAuthority: string
  monthlyAmount?: number      // Default: 15 €
  validFrom: string
  validUntil: string
  notes?: string
}

export const BuTVoucherService = {

  create(input: CreateBuTVoucherInput): BuTVoucher {
    const id = generateId('but')
    const now = new Date()

    const voucher: BuTVoucher = {
      id,
      providerId: input.providerId,
      parentId: input.parentId,
      childName: input.childName,
      bookingId: input.bookingId,
      voucherNumber: input.voucherNumber,
      issuingAuthority: input.issuingAuthority,
      monthlyAmount: input.monthlyAmount ?? 15,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      status: 'submitted',
      totalRedeemed: 0,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    }

    store.state.butVouchers.set(id, voucher)
    store.addToIndex(store.indexes.butVouchersByProvider, input.providerId, id)
    store.addToIndex(store.indexes.butVouchersByParent, input.parentId, id)

    return voucher
  },

  getById(id: ID): BuTVoucher | undefined {
    return store.state.butVouchers.get(id)
  },

  listByProvider(providerId: ID, filters?: { status?: BuTVoucherStatus }): BuTVoucher[] {
    const ids = store.getFromIndex(store.indexes.butVouchersByProvider, providerId)
    let result = Array.from(ids)
      .map((id) => store.state.butVouchers.get(id)!)
      .filter(Boolean)

    if (filters?.status) {
      result = result.filter((v) => v.status === filters.status)
    }

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  listByParent(parentId: ID): BuTVoucher[] {
    const ids = store.getFromIndex(store.indexes.butVouchersByParent, parentId)
    return Array.from(ids)
      .map((id) => store.state.butVouchers.get(id)!)
      .filter(Boolean)
  },

  approve(id: ID): BuTVoucher | undefined {
    const voucher = store.state.butVouchers.get(id)
    if (!voucher || voucher.status !== 'submitted') return undefined
    voucher.status = 'approved'
    voucher.updatedAt = new Date()
    return voucher
  },

  reject(id: ID, reason?: string): BuTVoucher | undefined {
    const voucher = store.state.butVouchers.get(id)
    if (!voucher || voucher.status !== 'submitted') return undefined
    voucher.status = 'rejected'
    if (reason) voucher.notes = (voucher.notes ? voucher.notes + '\n' : '') + `Abgelehnt: ${reason}`
    voucher.updatedAt = new Date()
    return voucher
  },

  // Monatliche Einlösung des Gutscheins
  redeemMonthly(id: ID, month: string): BuTVoucher | { error: string } {
    const voucher = store.state.butVouchers.get(id)
    if (!voucher) return { error: 'Gutschein nicht gefunden' }
    if (voucher.status !== 'approved' && voucher.status !== 'redeemed') {
      return { error: 'Gutschein ist nicht genehmigt' }
    }

    // Prüfen ob noch gültig
    const today = new Date().toISOString().split('T')[0]
    if (today > voucher.validUntil) {
      voucher.status = 'expired'
      voucher.updatedAt = new Date()
      return { error: 'Gutschein ist abgelaufen' }
    }

    voucher.totalRedeemed += voucher.monthlyAmount
    voucher.status = 'redeemed'
    voucher.updatedAt = new Date()

    return voucher
  },

  // Beim Jobcenter/Sozialamt abrechnen
  markSettled(id: ID, settlementReference: string): BuTVoucher | undefined {
    const voucher = store.state.butVouchers.get(id)
    if (!voucher || voucher.status !== 'redeemed') return undefined
    voucher.status = 'settled'
    voucher.settlementReference = settlementReference
    voucher.updatedAt = new Date()
    return voucher
  },

  // Offener Abrechnungsbetrag beim Provider
  getOutstandingSettlement(providerId: ID): { count: number; totalAmount: number } {
    const vouchers = this.listByProvider(providerId, { status: 'redeemed' })
    return {
      count: vouchers.length,
      totalAmount: vouchers.reduce((sum, v) => sum + v.totalRedeemed, 0),
    }
  },

  // Statistiken
  getStats(providerId: ID): {
    totalVouchers: number
    activeVouchers: number
    totalRedeemed: number
    totalSettled: number
    childrenSupported: number
  } {
    const all = this.listByProvider(providerId)
    const childNames = new Set(all.map((v) => v.childName))

    return {
      totalVouchers: all.length,
      activeVouchers: all.filter((v) => v.status === 'approved' || v.status === 'redeemed').length,
      totalRedeemed: all.reduce((sum, v) => sum + v.totalRedeemed, 0),
      totalSettled: all.filter((v) => v.status === 'settled').reduce((sum, v) => sum + v.totalRedeemed, 0),
      childrenSupported: childNames.size,
    }
  },
}
