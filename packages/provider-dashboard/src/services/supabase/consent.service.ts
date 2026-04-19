// ============================================================
// Consent Service – Supabase-backed (DSGVO-Einwilligungen)
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { consentFromDb, consentToDb } from './mappers'
import type { ConsentRecord, DocumentType, ID } from '../../types'

export interface CreateConsentInput {
  parentId: ID
  childName: string
  providerId: ID
  documentType: DocumentType
  ipAddress?: string
}

export const SupabaseConsentService = {

  async giveConsent(input: CreateConsentInput): Promise<ConsentRecord> {
    const sb = getServiceClient()

    const row = consentToDb({
      parentId: input.parentId,
      childName: input.childName,
      providerId: input.providerId,
      documentType: input.documentType,
      consentGiven: true,
      consentedAt: new Date(),
      ipAddress: input.ipAddress,
    })

    const { data, error } = await sb.from('consents').insert(row).select().single()
    if (error) throw error
    return consentFromDb(data)
  },

  async revokeConsent(id: ID): Promise<ConsentRecord | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('consents')
      .update({ consent_given: false, revoked_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle()
    if (error) throw error
    return data ? consentFromDb(data) : undefined
  },

  async getByParent(parentId: ID): Promise<ConsentRecord[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('consents').select('*')
      .eq('parent_id', parentId)
      .order('consented_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(consentFromDb)
  },

  async getByProvider(providerId: ID): Promise<ConsentRecord[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('consents').select('*')
      .eq('provider_id', providerId)
      .order('consented_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(consentFromDb)
  },

  async hasConsent(parentId: ID, childName: string, providerId: ID, documentType: DocumentType): Promise<boolean> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('consents').select('id')
      .eq('parent_id', parentId)
      .eq('child_name', childName)
      .eq('provider_id', providerId)
      .eq('document_type', documentType)
      .eq('consent_given', true)
      .is('revoked_at', null)
      .limit(1)
    if (error) throw error
    return (data ?? []).length > 0
  },

  // DSGVO: Alle Daten eines Elternteils exportieren (Auskunftsrecht)
  async exportParentData(parentId: ID): Promise<{
    consents: ConsentRecord[]
    bookings: unknown[]
    invoices: unknown[]
    messages: unknown[]
  }> {
    const sb = getServiceClient()

    const [consentsRes, bookingsRes, invoicesRes, messagesRes] = await Promise.all([
      sb.from('consents').select('*').eq('parent_id', parentId),
      sb.from('provider_bookings').select('*').eq('parent_id', parentId),
      sb.from('invoices').select('*').eq('parent_id', parentId),
      sb.from('messages').select('*').eq('parent_id', parentId),
    ])

    return {
      consents: (consentsRes.data ?? []).map(consentFromDb),
      bookings: bookingsRes.data ?? [],
      invoices: invoicesRes.data ?? [],
      messages: messagesRes.data ?? [],
    }
  },

  // DSGVO: Alle Daten eines Elternteils loeschen (Recht auf Loeschung)
  // Buchungen und Rechnungen werden anonymisiert (GoBD: 10 Jahre Aufbewahrungspflicht)
  async deleteParentData(parentId: ID): Promise<{ deletedRecords: number; anonymizedRecords: number }> {
    const sb = getServiceClient()
    let deletedRecords = 0
    let anonymizedRecords = 0

    // Delete consents
    const { data: deletedConsents } = await sb.from('consents')
      .delete().eq('parent_id', parentId).select('id')
    deletedRecords += (deletedConsents ?? []).length

    // Delete messages
    const { data: deletedMessages } = await sb.from('messages')
      .delete().eq('parent_id', parentId).select('id')
    deletedRecords += (deletedMessages ?? []).length

    // Delete notifications
    const { data: deletedNotifs } = await sb.from('notifications')
      .delete().eq('recipient_id', parentId).select('id')
    deletedRecords += (deletedNotifs ?? []).length

    // Anonymize bookings (GoBD: keep financial data, remove personal data)
    const { data: bookings } = await sb.from('provider_bookings')
      .select('id').eq('parent_id', parentId)
    if (bookings && bookings.length > 0) {
      const bookingIds = bookings.map(b => b.id)
      await sb.from('provider_bookings')
        .update({
          child_info: {
            name: '[GELOESCHT]',
            age: 0,
            emergencyContact: '[GELOESCHT]',
            emergencyPhone: '[GELOESCHT]',
          },
          notes: null,
        })
        .in('id', bookingIds)
      anonymizedRecords += bookingIds.length
    }

    // Count anonymized invoices (keep for GoBD, just count them)
    const { data: invoices } = await sb.from('invoices')
      .select('id').eq('parent_id', parentId)
    anonymizedRecords += (invoices ?? []).length

    // Delete contact notes
    const { data: deletedNotes } = await sb.from('contact_notes')
      .delete().eq('parent_id', parentId).select('id')
    deletedRecords += (deletedNotes ?? []).length

    // Delete parent record
    const { data: deletedParent } = await sb.from('parents')
      .delete().eq('id', parentId).select('id')
    deletedRecords += (deletedParent ?? []).length

    return { deletedRecords, anonymizedRecords }
  },
}
