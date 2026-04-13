// ============================================================
// Marketing Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import {
  automationFlowFromDb, automationFlowToDb,
  messageTemplateFromDb, messageTemplateToDb,
  marketingCampaignFromDb, marketingCampaignToDb,
} from './mappers'
import type { AutomationFlow, MessageTemplate, MarketingCampaign, AutomationStatus, ID } from '../../types'

export const SupabaseMarketingService = {

  flows: {
    async list(providerId: ID): Promise<AutomationFlow[]> {
      const sb = getServiceClient()
      const { data, error } = await sb.from('automation_flows').select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(automationFlowFromDb)
    },

    async create(input: Omit<AutomationFlow, 'id' | 'createdAt' | 'updatedAt' | 'stats'> & { stats?: AutomationFlow['stats'] }): Promise<AutomationFlow> {
      const sb = getServiceClient()
      const row = automationFlowToDb({
        ...input,
        stats: input.stats ?? { sent: 0, opened: 0, clicked: 0 },
      } as Partial<AutomationFlow>)
      const { data, error } = await sb.from('automation_flows').insert(row).select().single()
      if (error) throw error
      return automationFlowFromDb(data)
    },

    async update(id: ID, input: Partial<AutomationFlow>): Promise<AutomationFlow | undefined> {
      const sb = getServiceClient()
      const row = automationFlowToDb(input)
      row.updated_at = new Date().toISOString()
      const { data, error } = await sb.from('automation_flows').update(row).eq('id', id).select().maybeSingle()
      if (error) throw error
      return data ? automationFlowFromDb(data) : undefined
    },

    async toggle(id: ID, status: AutomationStatus): Promise<AutomationFlow | undefined> {
      const sb = getServiceClient()
      const { data, error } = await sb.from('automation_flows')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id).select().maybeSingle()
      if (error) throw error
      return data ? automationFlowFromDb(data) : undefined
    },
  },

  templates: {
    async list(providerId: ID): Promise<MessageTemplate[]> {
      const sb = getServiceClient()
      const { data, error } = await sb.from('message_templates').select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(messageTemplateFromDb)
    },

    async create(input: Omit<MessageTemplate, 'id' | 'createdAt'>): Promise<MessageTemplate> {
      const sb = getServiceClient()
      const row = messageTemplateToDb(input as Partial<MessageTemplate>)
      const { data, error } = await sb.from('message_templates').insert(row).select().single()
      if (error) throw error
      return messageTemplateFromDb(data)
    },

    async update(id: ID, input: Partial<MessageTemplate>): Promise<MessageTemplate | undefined> {
      const sb = getServiceClient()
      const row = messageTemplateToDb(input)
      const { data, error } = await sb.from('message_templates').update(row).eq('id', id).select().maybeSingle()
      if (error) throw error
      return data ? messageTemplateFromDb(data) : undefined
    },

    async delete(id: ID): Promise<boolean> {
      const sb = getServiceClient()
      const { error } = await sb.from('message_templates').delete().eq('id', id)
      if (error) throw error
      return true
    },
  },

  campaigns: {
    async list(providerId: ID): Promise<MarketingCampaign[]> {
      const sb = getServiceClient()
      const { data, error } = await sb.from('marketing_campaigns').select('*').eq('provider_id', providerId).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(marketingCampaignFromDb)
    },

    async create(input: Omit<MarketingCampaign, 'id' | 'createdAt' | 'stats'> & { stats?: MarketingCampaign['stats'] }): Promise<MarketingCampaign> {
      const sb = getServiceClient()
      const row = marketingCampaignToDb({
        ...input,
        stats: input.stats ?? { recipients: 0, sent: 0, opened: 0, clicked: 0 },
      } as Partial<MarketingCampaign>)
      const { data, error } = await sb.from('marketing_campaigns').insert(row).select().single()
      if (error) throw error
      return marketingCampaignFromDb(data)
    },

    async update(id: ID, input: Partial<MarketingCampaign>): Promise<MarketingCampaign | undefined> {
      const sb = getServiceClient()
      const row = marketingCampaignToDb(input)
      const { data, error } = await sb.from('marketing_campaigns').update(row).eq('id', id).select().maybeSingle()
      if (error) throw error
      return data ? marketingCampaignFromDb(data) : undefined
    },
  },
}
