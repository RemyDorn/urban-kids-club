// ============================================================
// Payment & SEPA Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { paymentFromDb, paymentToDb, sepaMandateFromDb, sepaMandateToDb } from './mappers'
import { encrypt, decrypt, maskIban } from '../../lib/encryption'
import type { PaymentRecord, PaymentMethod, SepaMandate, Currency, ID } from '../../types'

// --- PaymentService ---

export const SupabasePaymentService = {

  async list(providerId: ID, filters?: { method?: PaymentMethod; status?: string; limit?: number; offset?: number }): Promise<PaymentRecord[]> {
    const sb = getServiceClient()
    const limit = filters?.limit ?? 100
    const offset = filters?.offset ?? 0
    let query = sb.from('payments').select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
    if (filters?.method) query = query.eq('method', filters.method)
    if (filters?.status) query = query.eq('status', filters.status)
    query = query.range(offset, offset + limit - 1)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(paymentFromDb)
  },

  async getById(id: ID, providerId?: ID): Promise<PaymentRecord | undefined> {
    const sb = getServiceClient()
    let query = sb.from('payments').select('*').eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    return data ? paymentFromDb(data) : undefined
  },

  async create(input: Omit<PaymentRecord, 'id' | 'createdAt' | 'processedAt' | 'status'> & { status?: PaymentRecord['status'] }): Promise<PaymentRecord> {
    const sb = getServiceClient()
    const row = paymentToDb({ ...input, status: input.status ?? 'pending' } as Partial<PaymentRecord>)
    const { data, error } = await sb.from('payments').insert(row).select().single()
    if (error) throw error
    return paymentFromDb(data)
  },

  async update(id: ID, input: Partial<PaymentRecord>): Promise<PaymentRecord | undefined> {
    const sb = getServiceClient()
    const row = paymentToDb(input)
    const { data, error } = await sb.from('payments').update(row).eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? paymentFromDb(data) : undefined
  },

  async delete(id: ID): Promise<boolean> {
    const sb = getServiceClient()
    const { error } = await sb.from('payments').delete().eq('id', id)
    if (error) throw error
    return true
  },

  async markCompleted(id: ID, providerId?: ID): Promise<PaymentRecord | undefined> {
    const sb = getServiceClient()
    let query = sb.from('payments')
      .update({ status: 'completed', processed_at: new Date().toISOString() })
      .eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? paymentFromDb(data) : undefined
  },

  async getRevenueSummary(providerId: ID): Promise<{ total: number; byMethod: Record<string, number> }> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('payments').select('amount, method').eq('provider_id', providerId).eq('status', 'completed')
    if (error) throw error
    const rows = data ?? []
    const total = rows.reduce((s: number, r: any) => s + (r.amount ?? 0), 0)
    const byMethod: Record<string, number> = {}
    for (const r of rows) {
      byMethod[r.method] = (byMethod[r.method] ?? 0) + (r.amount ?? 0)
    }
    return { total, byMethod }
  },

  async runSepaCollection(providerId: ID): Promise<PaymentRecord[]> {
    // Returns pending SEPA payments for collection
    const sb = getServiceClient()
    const { data, error } = await sb.from('payments')
      .select('*').eq('provider_id', providerId).eq('method', 'sepa_debit').eq('status', 'pending')
    if (error) throw error
    return (data ?? []).map(paymentFromDb)
  },

  // Alias for routes compatibility
  async listByProvider(providerId: ID, filters?: { method?: PaymentMethod; status?: string; limit?: number; offset?: number }): Promise<PaymentRecord[]> {
    return this.list(providerId, filters)
  },
}

// --- SepaMandateService ---

export const SupabaseSepaMandateService = {

  async list(providerId: ID): Promise<SepaMandate[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('sepa_mandates').select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(sepaMandateFromDb)
  },

  async getById(id: ID): Promise<SepaMandate | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('sepa_mandates').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? sepaMandateFromDb(data) : undefined
  },

  async create(input: Omit<SepaMandate, 'id' | 'createdAt' | 'signedAt' | 'status' | 'mandateReference' | 'ibanMasked'>& { iban: string }): Promise<SepaMandate> {
    const sb = getServiceClient()
    const cleanIban = input.iban.replace(/\s/g, '').toUpperCase()
    const ibanMasked = maskIban(cleanIban)
    const encryptedIban = encrypt(cleanIban)

    // Generate mandate reference
    const { data: existing } = await sb.from('sepa_mandates')
      .select('mandate_reference').eq('provider_id', input.providerId)
      .order('created_at', { ascending: false }).limit(1)
    let nextNum = 1
    if (existing?.length) {
      const match = existing[0].mandate_reference?.match(/MNDT-\d{4}-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const mandateReference = `MNDT-${new Date().getFullYear()}-${nextNum.toString().padStart(4, '0')}`

    const row = sepaMandateToDb({
      ...input,
      iban: encryptedIban,
      ibanMasked,
      mandateReference,
      signedAt: new Date(),
      status: 'active',
    } as Partial<SepaMandate>)

    const { data, error } = await sb.from('sepa_mandates').insert(row).select().single()
    if (error) throw error
    return sepaMandateFromDb(data)
  },

  async update(id: ID, input: Partial<SepaMandate>): Promise<SepaMandate | undefined> {
    const sb = getServiceClient()
    const row = sepaMandateToDb(input)
    const { data, error } = await sb.from('sepa_mandates').update(row).eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? sepaMandateFromDb(data) : undefined
  },

  async delete(id: ID): Promise<boolean> {
    const sb = getServiceClient()
    const { error } = await sb.from('sepa_mandates').delete().eq('id', id)
    if (error) throw error
    return true
  },

  // Alias for routes compatibility
  async listByProvider(providerId: ID): Promise<SepaMandate[]> {
    return this.list(providerId)
  },
}
