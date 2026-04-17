// ============================================================
// Document Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { documentFromDb, documentToDb } from './mappers'
import type { ProviderDocument, DocumentType, DocumentStatus, ID } from '../../types'

export interface CreateDocumentInput {
  providerId: ID
  teamMemberId?: ID
  type: DocumentType
  name: string
  fileUrl?: string
  issuedAt?: Date
  expiresAt?: Date
  notes?: string
}

export const SupabaseDocumentService = {

  async create(input: CreateDocumentInput): Promise<ProviderDocument> {
    const sb = getServiceClient()
    const now = new Date()

    let status: DocumentStatus = 'pending_review'
    if (input.expiresAt) {
      const daysUntilExpiry = (input.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      if (daysUntilExpiry < 0) status = 'expired'
      else if (daysUntilExpiry < 30) status = 'expiring_soon'
      else status = 'valid'
    }

    const row = documentToDb({
      providerId: input.providerId,
      teamMemberId: input.teamMemberId,
      type: input.type,
      name: input.name,
      fileUrl: input.fileUrl,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      status,
      notes: input.notes,
    })

    const { data, error } = await sb.from('provider_documents').insert(row).select().single()
    if (error) throw error
    return documentFromDb(data)
  },

  async getById(id: ID): Promise<ProviderDocument | undefined> {
    const sb = getServiceClient()
    const { data } = await sb.from('provider_documents').select('*').eq('id', id).maybeSingle()
    return data ? documentFromDb(data) : undefined
  },

  async listByProvider(providerId: ID, filters?: { type?: DocumentType; status?: DocumentStatus }): Promise<ProviderDocument[]> {
    const sb = getServiceClient()
    let q = sb.from('provider_documents').select('*').eq('provider_id', providerId)
    if (filters?.type) q = q.eq('type', filters.type)
    if (filters?.status) q = q.eq('status', filters.status)
    q = q.order('created_at', { ascending: false })
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(documentFromDb)
  },

  async listByTeamMember(teamMemberId: ID): Promise<ProviderDocument[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('provider_documents').select('*')
      .eq('team_member_id', teamMemberId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(documentFromDb)
  },

  async verify(id: ID, verifiedBy: string): Promise<ProviderDocument | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('provider_documents')
      .update({ verified_by: verifiedBy, verified_at: new Date().toISOString(), status: 'valid' })
      .eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? documentFromDb(data) : undefined
  },

  async refreshStatuses(): Promise<ProviderDocument[]> {
    const sb = getServiceClient()
    const now = new Date()
    const updated: ProviderDocument[] = []

    // Get all documents with expiry dates
    const { data: docs } = await sb.from('provider_documents').select('*').not('expires_at', 'is', null)

    for (const doc of docs ?? []) {
      const expiresAt = new Date(doc.expires_at)
      const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      let newStatus: DocumentStatus = doc.status

      if (daysUntilExpiry < 0) newStatus = 'expired'
      else if (daysUntilExpiry < 30) newStatus = 'expiring_soon'
      else if (doc.verified_at) newStatus = 'valid'

      if (newStatus !== doc.status) {
        const { data: upd } = await sb.from('provider_documents')
          .update({ status: newStatus }).eq('id', doc.id).select().maybeSingle()
        if (upd) updated.push(documentFromDb(upd))
      }
    }

    return updated
  },

  async getComplianceStatus(providerId: ID): Promise<{
    compliant: boolean; missing: DocumentType[]; expiring: ProviderDocument[]; expired: ProviderDocument[]
  }> {
    const requiredTypes: DocumentType[] = ['fuehrungszeugnis', 'insurance']
    const docs = await this.listByProvider(providerId)
    const existingTypes = new Set(docs.filter(d => d.status === 'valid').map(d => d.type))
    const missing = requiredTypes.filter(t => !existingTypes.has(t))
    const expiring = docs.filter(d => d.status === 'expiring_soon')
    const expired = docs.filter(d => d.status === 'expired')
    return { compliant: missing.length === 0 && expired.length === 0, missing, expiring, expired }
  },

  async getTeamMemberCompliance(teamMemberId: ID): Promise<{
    compliant: boolean; missing: DocumentType[]; documents: ProviderDocument[]
  }> {
    const requiredForInstructor: DocumentType[] = ['fuehrungszeugnis', 'first_aid']
    const docs = await this.listByTeamMember(teamMemberId)
    const validTypes = new Set(docs.filter(d => d.status === 'valid').map(d => d.type))
    const missing = requiredForInstructor.filter(t => !validTypes.has(t))
    return { compliant: missing.length === 0, missing, documents: docs }
  },

  async delete(id: ID): Promise<boolean> {
    const sb = getServiceClient()
    const { error } = await sb.from('provider_documents').delete().eq('id', id)
    if (error) throw error
    return true
  },
}
