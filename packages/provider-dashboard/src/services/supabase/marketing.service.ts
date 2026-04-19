// ============================================================
// Marketing Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import {
  automationFlowFromDb, automationFlowToDb,
  messageTemplateFromDb, messageTemplateToDb,
  marketingCampaignFromDb, marketingCampaignToDb,
} from './mappers'
import { createAuditEntry } from '../helpers'
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

  // --- Template Execution Engine ---

  replaceVariables(body: string, variables: Record<string, string>): string {
    return body.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] ?? match
    })
  },

  async executeTemplate(
    templateId: ID,
    providerId: ID,
    recipients: { id: ID; email: string; name: string }[],
    variables: Record<string, string>,
  ): Promise<{ sent: number; failed: number; results: { recipientId: ID; success: boolean; error?: string }[] }> {
    const templates = await this.templates.list(providerId)
    const template = templates.find(t => t.id === templateId)
    if (!template) return { sent: 0, failed: 0, results: [{ recipientId: '', success: false, error: 'Template nicht gefunden' }] }

    const { EmailService } = await import('../../lib/email')

    const results: { recipientId: ID; success: boolean; error?: string }[] = []
    let sent = 0
    let failed = 0

    for (const recipient of recipients) {
      const recipientVars = { ...variables, parentName: recipient.name }
      const body = this.replaceVariables(template.body, recipientVars)
      const subject = template.subject
        ? this.replaceVariables(template.subject, recipientVars)
        : template.name

      try {
        const result = await EmailService.send({
          to: recipient.email,
          subject,
          html: `<div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #3C2225; padding: 24px;">
            <div style="white-space: pre-wrap; line-height: 1.6;">${body}</div>
            <hr style="border: none; border-top: 1px solid #F2E6E2; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Powered by Urban Kids Club</p>
          </div>`,
          text: body.replace(/<[^>]*>/g, ''),
        }, false)

        if (result.success) {
          sent++
          results.push({ recipientId: recipient.id, success: true })
        } else {
          failed++
          results.push({ recipientId: recipient.id, success: false, error: result.error })
        }
      } catch (err: any) {
        failed++
        results.push({ recipientId: recipient.id, success: false, error: err?.message || 'Unbekannter Fehler' })
      }
    }

    // Log in audit trail
    createAuditEntry({
      providerId,
      userId: providerId,
      userType: 'provider',
      action: 'marketing.template_executed',
      entityType: 'template',
      entityId: templateId,
      changes: {
        sent: { old: null, new: sent },
        failed: { old: null, new: failed },
        recipients: { old: null, new: recipients.length },
      },
    })

    // Update flow stats in DB
    const sb = getServiceClient()
    const flows = await this.flows.list(providerId)
    for (const flow of flows) {
      if (flow.templateId === templateId && flow.status === 'active') {
        await sb.from('automation_flows').update({
          stats: { sent: flow.stats.sent + sent, opened: flow.stats.opened, clicked: flow.stats.clicked },
        }).eq('id', flow.id)
      }
    }

    return { sent, failed, results }
  },

  async getSendCounts(providerId: ID): Promise<{ templateId: ID; totalSent: number; lastSentAt: Date | null }[]> {
    // Derive send counts from flow stats
    const templates = await this.templates.list(providerId)
    const flows = await this.flows.list(providerId)
    return templates.map(t => {
      const flow = flows.find(f => f.templateId === t.id)
      return {
        templateId: t.id,
        totalSent: flow?.stats?.sent ?? 0,
        lastSentAt: flow?.updatedAt ?? null,
      }
    })
  },

  async processTrialFollowups(providerId: ID): Promise<{
    feedbackSent: number
    reminderSent: number
    lastChanceSent: number
  }> {
    const sb = getServiceClient()
    const now = new Date()
    const stats = { feedbackSent: 0, reminderSent: 0, lastChanceSent: 0 }

    // Check if trial follow-up flows are active
    const flows = await this.flows.list(providerId)
    const trialFlow = flows.find(f => f.trigger === 'trial_completed' && f.status === 'active')
    const conversionFlow = flows.find(f => f.trigger === 'trial_no_conversion' && f.status === 'active')
    if (!trialFlow && !conversionFlow) return stats

    // Get completed (not converted) trials
    const { data: trials } = await sb.from('trial_lessons')
      .select('*, activities(title), parents(name, email), providers(company_name, slug)')
      .eq('provider_id', providerId)
      .eq('status', 'completed')

    if (!trials || trials.length === 0) return stats

    const { EmailService } = await import('../../lib/email')

    for (const trial of trials) {
      const completedAt = new Date(trial.updated_at)
      const hoursSinceCompletion = (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60)
      const followUp = trial.follow_up_emails || {}
      const parent = trial.parents as any
      const activity = trial.activities as any
      const provider = trial.providers as any
      if (!parent?.email || !activity?.title) continue

      const childInfo = trial.child_info as any
      const childName = childInfo?.name || 'Ihr Kind'
      const parentName = parent.name || 'Eltern'
      const providerName = provider?.company_name || ''

      // 1. Feedback email (24h)
      if (trialFlow && !followUp.feedbackSentAt && hoursSinceCompletion >= 24) {
        try {
          const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
          await EmailService.sendTrialFollowUp(parent.email, {
            parentName, childName, courseName: activity.title, providerName,
            bookingUrl: `${origin}/widget/${provider?.slug || ''}`,
          })
          followUp.feedbackSentAt = now.toISOString()
          await sb.from('trial_lessons').update({ follow_up_emails: followUp }).eq('id', trial.id)
          stats.feedbackSent++
        } catch (e) { console.error('[TrialFollowup] Feedback failed:', e) }
      }

      // 2. Reminder (3 days)
      if (conversionFlow && !followUp.reminderSentAt && followUp.feedbackSentAt && hoursSinceCompletion >= 72) {
        try {
          const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
          const bookingUrl = `${origin}/widget/${provider?.slug || ''}`
          await EmailService.send({
            to: parent.email,
            subject: `Platz sichern: ${activity.title} wartet auf ${childName}!`,
            html: `<div style="font-family:'Inter','Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#3C2225;">
              <div style="background:linear-gradient(135deg,#D4956A,#c4854a);padding:32px;border-radius:16px 16px 0 0;text-align:center;">
                <div style="font-size:48px;margin-bottom:8px;">📋</div>
                <h1 style="color:white;margin:0;font-size:24px;font-weight:700;">Jetzt Platz sichern!</h1>
              </div>
              <div style="padding:32px;background:#FFF9F5;border-radius:0 0 16px 16px;">
                <p>Hey ${parentName},</p>
                <p>${childName} war bei der Probestunde <strong>"${activity.title}"</strong> dabei. Die Kurse sind beliebt und die Plätze begrenzt!</p>
                <div style="text-align:center;margin:28px 0;"><a href="${bookingUrl}" style="display:inline-block;background:#D4956A;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;">Jetzt buchen</a></div>
                <hr style="border:none;border-top:1px solid #F2E6E2;margin:24px 0;">
                <p style="color:#94a3b8;font-size:12px;text-align:center;">Powered by Urban Kids Club</p>
              </div></div>`,
            text: `Hey ${parentName}, ${childName} war bei "${activity.title}" dabei. Jetzt buchen: ${bookingUrl}`,
          }, false)
          followUp.reminderSentAt = now.toISOString()
          await sb.from('trial_lessons').update({ follow_up_emails: followUp }).eq('id', trial.id)
          stats.reminderSent++
        } catch (e) { console.error('[TrialFollowup] Reminder failed:', e) }
      }

      // 3. Last chance (7 days)
      if (conversionFlow && !followUp.lastChanceSentAt && followUp.reminderSentAt && hoursSinceCompletion >= 168) {
        try {
          const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
          const bookingUrl = `${origin}/widget/${provider?.slug || ''}`
          await EmailService.send({
            to: parent.email,
            subject: `Letzte Chance: Platz für ${childName} in "${activity.title}" sichern`,
            html: `<div style="font-family:'Inter','Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#3C2225;">
              <div style="background:linear-gradient(135deg,#e74c3c,#c0392b);padding:32px;border-radius:16px 16px 0 0;text-align:center;">
                <div style="font-size:48px;margin-bottom:8px;">⏰</div>
                <h1 style="color:white;margin:0;font-size:24px;font-weight:700;">Letzte Chance!</h1>
              </div>
              <div style="padding:32px;background:#FFF9F5;border-radius:0 0 16px 16px;">
                <p>Hey ${parentName},</p>
                <p>Die Plätze in <strong>"${activity.title}"</strong> sind fast voll. Jetzt zuschlagen!</p>
                <div style="text-align:center;margin:28px 0;"><a href="${bookingUrl}" style="display:inline-block;background:#e74c3c;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;">Letzten Platz sichern</a></div>
                <hr style="border:none;border-top:1px solid #F2E6E2;margin:24px 0;">
                <p style="color:#94a3b8;font-size:12px;text-align:center;">Powered by Urban Kids Club</p>
              </div></div>`,
            text: `Hey ${parentName}, letzte Chance! Platz in "${activity.title}" sichern: ${bookingUrl}`,
          }, false)
          followUp.lastChanceSentAt = now.toISOString()
          await sb.from('trial_lessons').update({ follow_up_emails: followUp }).eq('id', trial.id)
          stats.lastChanceSent++
        } catch (e) { console.error('[TrialFollowup] Last chance failed:', e) }
      }
    }

    return stats
  },
}
