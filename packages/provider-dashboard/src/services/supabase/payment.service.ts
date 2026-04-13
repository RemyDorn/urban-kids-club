// ============================================================
// Payment & SEPA Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { paymentFromDb, paymentToDb, sepaMandateFromDb, sepaMandateToDb } from './mappers'
import type { PaymentRecord, PaymentMethod, SepaMandate, Currency, ID } from '../../types'

// --- PaymentService ---

export const SupabasePaymentService = {

  async list(providerId: ID, filters?: { method?: PaymentMethod; status?: string }): Promise<PaymentRecord[]> {
    const sb = getServiceClient()
    let query = sb.from('payments').select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
    if (filters?.method) query = query.eq('method', filters.method)
    if (filters?.status) query = query.eq('status', filters.status)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(paymentFromDb)
  },

  async getById(id: ID): Promise<PaymentRecord | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('payments').select('*').eq('id', id).maybeSingle()
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
    const ibanMasked = cleanIban.slice(0, 4) + ' **** **** **** ' + cleanIban.slice(-4)

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
      iban: cleanIban,
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
}
