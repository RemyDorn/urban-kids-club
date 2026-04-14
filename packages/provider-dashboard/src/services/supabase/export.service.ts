// ============================================================
// Export Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { exportRequestFromDb, exportRequestToDb } from './mappers'
import type { ExportRequest, ExportFormat, ID } from '../../types'

const TABLE = 'export_requests'

export const SupabaseExportService = {

  async createExport(input: { providerId: ID; type: ExportRequest['type']; format: ExportFormat; dateRange?: Record<string, string>; filters?: Record<string, string> }): Promise<ExportRequest> {
    return this.create(input.providerId, input.type, input.format, input.filters ?? input.dateRange)
  },

  async create(providerId: ID, type: ExportRequest['type'], format: ExportFormat, filters?: Record<string, string>): Promise<ExportRequest> {
    const sb = getServiceClient()
    const row = exportRequestToDb({
      providerId,
      type,
      format,
      filters,
      status: 'pending',
    })
    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return exportRequestFromDb(data)
  },

  async getById(id: ID): Promise<ExportRequest | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? exportRequestFromDb(data) : undefined
  },

  async list(providerId: ID): Promise<ExportRequest[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(exportRequestFromDb)
  },
}
