// ============================================================
// Widget Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { widgetConfigFromDb, widgetConfigToDb } from './mappers'
import type { WidgetConfig, ID } from '../../types'

const TABLE = 'widget_configs'

export const SupabaseWidgetService = {

  async list(providerId: ID): Promise<WidgetConfig[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(widgetConfigFromDb)
  },

  async getById(id: ID): Promise<WidgetConfig | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? widgetConfigFromDb(data) : undefined
  },

  async create(input: Omit<WidgetConfig, 'id' | 'createdAt'>): Promise<WidgetConfig> {
    const sb = getServiceClient()
    const row = widgetConfigToDb(input as Partial<WidgetConfig>)
    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return widgetConfigFromDb(data)
  },

  async update(id: ID, input: Partial<WidgetConfig>): Promise<WidgetConfig | undefined> {
    const sb = getServiceClient()
    const row = widgetConfigToDb(input)
    const { data, error } = await sb.from(TABLE).update(row).eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? widgetConfigFromDb(data) : undefined
  },

  async delete(id: ID): Promise<boolean> {
    const sb = getServiceClient()
    const { error } = await sb.from(TABLE).delete().eq('id', id)
    if (error) throw error
    return true
  },
}
