// ============================================================
// Marketing Automation Service
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import { createAuditEntry } from './helpers'
import type {
  AutomationFlow, AutomationTrigger, AutomationChannel, AutomationStatus,
  MessageTemplate, MarketingCampaign, ID, TrialLesson,
} from '../types'

// --- Default-Templates (vorgefertigt) ---

const DEFAULT_TEMPLATES: Omit<MessageTemplate, 'id' | 'providerId' | 'createdAt'>[] = [
  {
    name: 'Willkommen',
    channel: 'whatsapp',
    body: 'Hallo {{parentName}}! 👋 Willkommen bei {{providerName}}. Wir freuen uns, dass {{childName}} bei uns mitmacht! Bei Fragen sind wir jederzeit erreichbar.',
    variables: ['parentName', 'childName', 'providerName'],
    isDefault: true,
  },
  {
    name: 'Buchungsbestätigung',
    channel: 'whatsapp',
    body: '✅ Buchung bestätigt! {{childName}} ist angemeldet für "{{courseName}}" – {{scheduleText}}. Wir freuen uns! 🎉',
    variables: ['childName', 'courseName', 'scheduleText', 'parentName'],
    isDefault: true,
  },
  {
    name: 'Erinnerung (24h)',
    channel: 'whatsapp',
    body: '⏰ Erinnerung: Morgen um {{startTime}} findet "{{courseName}}" statt. {{childName}}, wir sehen uns! 😊',
    variables: ['childName', 'courseName', 'startTime', 'locationName'],
    isDefault: true,
  },
  {
    name: 'Nach Probestunde',
    channel: 'whatsapp',
    body: 'Hallo {{parentName}}! Hat {{childName}} die Probestunde bei "{{courseName}}" gefallen? 🤩 Wir haben noch Plätze frei – sollen wir {{childName}} fest anmelden? Antworte einfach hier!',
    variables: ['parentName', 'childName', 'courseName'],
    isDefault: true,
  },
  {
    name: 'Bewertung anfragen',
    channel: 'whatsapp',
    body: 'Hallo {{parentName}}! Wie fand {{childName}} "{{courseName}}"? Wir würden uns über dein Feedback freuen! ⭐ {{reviewLink}}',
    variables: ['parentName', 'childName', 'courseName', 'reviewLink'],
    isDefault: true,
  },
  {
    name: 'Wir vermissen euch',
    channel: 'whatsapp',
    body: 'Hallo {{parentName}}! Wir haben {{childName}} schon eine Weile nicht gesehen 😢 Schau dir unsere neuen Kurse an – vielleicht ist etwas Passendes dabei? {{courseListLink}}',
    variables: ['parentName', 'childName', 'courseListLink', 'providerName'],
    isDefault: true,
  },
  {
    name: 'Geburtstag',
    channel: 'whatsapp',
    body: '🎂 Happy Birthday, {{childName}}! 🎉 Alles Gute zum Geburtstag! Als kleines Geschenk bekommst du {{discountPercent}}% Rabatt auf deinen nächsten Kurs. Code: {{couponCode}}',
    variables: ['childName', 'parentName', 'discountPercent', 'couponCode'],
    isDefault: true,
  },
  {
    name: 'Kurspaket endet bald',
    channel: 'whatsapp',
    body: 'Hallo {{parentName}}! Das Kurspaket von {{childName}} für "{{courseName}}" endet in {{daysLeft}} Tagen. Sollen wir verlängern? Antworte einfach hier! 📩',
    variables: ['parentName', 'childName', 'courseName', 'daysLeft'],
    isDefault: true,
  },
  {
    name: 'Treuestufe Aufstieg',
    channel: 'whatsapp',
    body: '🎊 Glückwunsch {{parentName}}! Du bist aufgestiegen zum {{tierName}} {{tierIcon}}! Ab jetzt bekommst du {{discountPercent}}% Rabatt auf alle Kurse. Danke für deine Treue! ❤️',
    variables: ['parentName', 'tierName', 'tierIcon', 'discountPercent'],
    isDefault: true,
  },
  {
    name: 'Zahlungserinnerung',
    channel: 'email',
    subject: 'Zahlungserinnerung – {{invoiceNumber}}',
    body: 'Hallo {{parentName}},\n\ndie Rechnung {{invoiceNumber}} über {{amount}} € ist noch offen.\n\nBitte überweisen Sie den Betrag bis zum {{dueDate}}.\n\nMit freundlichen Grüßen\n{{providerName}}',
    variables: ['parentName', 'invoiceNumber', 'amount', 'dueDate', 'providerName'],
    isDefault: true,
  },
  {
    name: 'Neues Halbjahr',
    channel: 'whatsapp',
    body: '📅 Neues Halbjahr, neue Kurse! Hallo {{parentName}}, die Anmeldung für {{seasonName}} ist ab jetzt offen. Sichere dir früh einen Platz für {{childName}}! 🏃‍♂️ {{bookingLink}}',
    variables: ['parentName', 'childName', 'seasonName', 'bookingLink'],
    isDefault: true,
  },
]

// Trigger Labels (deutsch)
export const TRIGGER_LABELS: Record<AutomationTrigger, { label: string; desc: string; icon: string }> = {
  customer_signup: { label: 'Neuer Kunde', desc: 'Wenn sich ein neuer Kunde registriert', icon: '👋' },
  booking_confirmed: { label: 'Buchung bestätigt', desc: 'Wenn eine Buchung bestätigt wird', icon: '✅' },
  booking_reminder_24h: { label: 'Erinnerung 24h', desc: '24 Stunden vor dem Kurstermin', icon: '⏰' },
  booking_completed: { label: 'Kurs abgeschlossen', desc: 'Wenn ein Kurs abgeschlossen ist', icon: '🎓' },
  trial_completed: { label: 'Probestunde fertig', desc: 'Nach Abschluss einer Probestunde', icon: '🧪' },
  trial_no_conversion: { label: 'Probe ohne Buchung', desc: 'X Tage nach Probestunde ohne Anmeldung', icon: '🔄' },
  payment_received: { label: 'Zahlung eingegangen', desc: 'Wenn eine Zahlung eingeht', icon: '💰' },
  payment_overdue: { label: 'Zahlung überfällig', desc: 'Wenn eine Rechnung überfällig ist', icon: '⚠️' },
  waitlist_spot_available: { label: 'Platz frei (Warteliste)', desc: 'Wenn ein Wartelisten-Platz frei wird', icon: '🎫' },
  child_birthday: { label: 'Kindergeburtstag', desc: 'Am Geburtstag des Kindes', icon: '🎂' },
  inactive_customer: { label: 'Inaktiver Kunde', desc: 'Kunde seit X Wochen nicht mehr da', icon: '😢' },
  course_ending_soon: { label: 'Kurspaket endet', desc: 'X Tage vor Ende des Kurspakets', icon: '📦' },
  loyalty_tier_upgrade: { label: 'Treuestufe Aufstieg', desc: 'Wenn Kunde eine Treuestufe aufsteigt', icon: '🏆' },
  review_request: { label: 'Bewertung anfragen', desc: 'Nach Kursbesuch um Bewertung bitten', icon: '⭐' },
  seasonal_reminder: { label: 'Neues Halbjahr', desc: 'Erinnerung bei Saisonstart', icon: '📅' },
}

// In-memory flow store
const memFlows = new Map<string, AutomationFlow>()
const memTemplates = new Map<string, MessageTemplate>()

function getDefaultFlows(providerId: ID): AutomationFlow[] {
  const templates = MarketingService.templates.list(providerId)
  const findTmpl = (name: string) => templates.find(t => t.name === name)?.id || ''
  return [
    { id: 'flow_1', providerId, name: 'Willkommensnachricht', trigger: 'customer_signup', channel: 'whatsapp', delayMinutes: 0, templateId: findTmpl('Willkommen'), status: 'active', stats: { sent: 47, opened: 42, clicked: 0 }, createdAt: new Date(), updatedAt: new Date() },
    { id: 'flow_2', providerId, name: 'Buchungsbestätigung', trigger: 'booking_confirmed', channel: 'whatsapp', delayMinutes: 0, templateId: findTmpl('Buchungsbestätigung'), status: 'active', stats: { sent: 156, opened: 148, clicked: 0 }, createdAt: new Date(), updatedAt: new Date() },
    { id: 'flow_3', providerId, name: 'Kurs-Erinnerung (24h)', trigger: 'booking_reminder_24h', channel: 'whatsapp', delayMinutes: 0, templateId: findTmpl('Erinnerung (24h)'), status: 'active', stats: { sent: 312, opened: 290, clicked: 0 }, createdAt: new Date(), updatedAt: new Date() },
    { id: 'flow_4', providerId, name: 'Nach Probestunde nachfassen', trigger: 'trial_completed', channel: 'whatsapp', delayMinutes: 60 * 24, templateId: findTmpl('Nach Probestunde'), status: 'active', stats: { sent: 23, opened: 19, clicked: 8 }, createdAt: new Date(), updatedAt: new Date() },
    { id: 'flow_5', providerId, name: 'Bewertung anfragen', trigger: 'review_request', channel: 'whatsapp', delayMinutes: 60 * 2, templateId: findTmpl('Bewertung anfragen'), status: 'paused', stats: { sent: 0, opened: 0, clicked: 0 }, createdAt: new Date(), updatedAt: new Date() },
    { id: 'flow_6', providerId, name: 'Wir vermissen euch', trigger: 'inactive_customer', channel: 'whatsapp', delayMinutes: 0, templateId: findTmpl('Wir vermissen euch'), status: 'active', stats: { sent: 12, opened: 9, clicked: 4 }, createdAt: new Date(), updatedAt: new Date() },
    { id: 'flow_7', providerId, name: 'Kindergeburtstag', trigger: 'child_birthday', channel: 'whatsapp', delayMinutes: 0, templateId: findTmpl('Geburtstag'), status: 'draft', stats: { sent: 0, opened: 0, clicked: 0 }, createdAt: new Date(), updatedAt: new Date() },
    { id: 'flow_8', providerId, name: 'Zahlungserinnerung', trigger: 'payment_overdue', channel: 'email', delayMinutes: 60 * 24 * 3, templateId: findTmpl('Zahlungserinnerung'), status: 'active', stats: { sent: 8, opened: 6, clicked: 0 }, createdAt: new Date(), updatedAt: new Date() },
    { id: 'flow_9', providerId, name: 'Kurspaket endet bald', trigger: 'course_ending_soon', channel: 'whatsapp', delayMinutes: 0, templateId: findTmpl('Kurspaket endet bald'), status: 'active', stats: { sent: 34, opened: 30, clicked: 12 }, createdAt: new Date(), updatedAt: new Date() },
    { id: 'flow_10', providerId, name: 'Treuestufe aufgestiegen', trigger: 'loyalty_tier_upgrade', channel: 'whatsapp', delayMinutes: 0, templateId: findTmpl('Treuestufe Aufstieg'), status: 'active', stats: { sent: 5, opened: 5, clicked: 3 }, createdAt: new Date(), updatedAt: new Date() },
  ] as AutomationFlow[]
}

export const MarketingService = {
  flows: {
    list(providerId: ID): AutomationFlow[] {
      const providerFlows = Array.from(memFlows.values()).filter(f => f.providerId === providerId)
      return providerFlows.length > 0 ? providerFlows : getDefaultFlows(providerId)
    },
    create(input: any): AutomationFlow {
      const id = generateId('flow')
      const flow: AutomationFlow = {
        id, ...input, delayMinutes: input.delayMinutes ?? 0,
        status: input.status ?? 'draft', conditions: {},
        stats: input.stats ?? { sent: 0, opened: 0, clicked: 0 },
        createdAt: new Date(), updatedAt: new Date(),
      }
      memFlows.set(id, flow)
      return flow
    },
    update(id: ID, input: any): AutomationFlow | undefined {
      const flow = memFlows.get(id)
      if (!flow) return undefined
      Object.assign(flow, input, { updatedAt: new Date() })
      return flow
    },
    toggle(id: ID, status: AutomationStatus): AutomationFlow | undefined {
      const flow = memFlows.get(id)
      if (!flow) return undefined
      flow.status = status
      flow.updatedAt = new Date()
      return flow
    },
  },
  templates: {
    list(providerId: ID): MessageTemplate[] {
      const providerTemplates = Array.from(memTemplates.values()).filter(t => t.providerId === providerId)
      if (providerTemplates.length > 0) return providerTemplates
      return DEFAULT_TEMPLATES.map((t, i) => ({
        id: `tmpl_default_${i}`,
        providerId,
        ...t,
        createdAt: new Date(),
      }))
    },
    create(input: any): MessageTemplate {
      const variables = (input.body?.match(/\{\{(\w+)\}\}/g) || []).map((v: string) => v.replace(/\{\{|\}\}/g, ''))
      const id = generateId('tmpl')
      const template: MessageTemplate = { id, ...input, variables, isDefault: false, createdAt: new Date() }
      memTemplates.set(id, template)
      return template
    },
    update(id: ID, input: any): MessageTemplate | undefined {
      const template = memTemplates.get(id)
      if (!template) return undefined
      Object.assign(template, input)
      return template
    },
    delete(id: ID): boolean {
      return memTemplates.delete(id)
    },
  },
  campaigns: {
    list(_providerId: ID): MarketingCampaign[] { return [] },
    create(input: any): MarketingCampaign {
      const id = generateId('camp')
      return { id, ...input, stats: { recipients: 0, sent: 0, opened: 0, clicked: 0 }, createdAt: new Date() } as MarketingCampaign
    },
    update(_id: ID, _input: any): MarketingCampaign | undefined { return undefined },
  },

  // --- Template Execution Engine ---

  /**
   * Replace {{variable}} placeholders in a template body with actual values.
   */
  replaceVariables(body: string, variables: Record<string, string>): string {
    return body.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] ?? match
    })
  },

  /**
   * Execute a template: resolve variables, send via email, log in audit trail.
   * Returns array of send results.
   */
  async executeTemplate(
    templateId: ID,
    providerId: ID,
    recipients: { id: ID; email: string; name: string }[],
    variables: Record<string, string>,
  ): Promise<{ sent: number; failed: number; results: { recipientId: ID; success: boolean; error?: string }[] }> {
    const templates = this.templates.list(providerId)
    const template = templates.find(t => t.id === templateId)
    if (!template) return { sent: 0, failed: 0, results: [{ recipientId: '', success: false, error: 'Template nicht gefunden' }] }

    // Dynamic import to avoid circular dependency
    const { EmailService, getProviderBranding } = await import('../lib/email')
    // Provider-Branding einmalig auflösen (gilt für alle recipients in diesem Bulk)
    const mktBrand = await getProviderBranding(providerId)

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
          brand: mktBrand,
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

    // Update flow stats if a flow uses this template
    const flows = this.flows.list(providerId)
    for (const flow of flows) {
      if (flow.templateId === templateId && flow.status === 'active') {
        flow.stats.sent += sent
      }
    }

    // Track send in memSendLog
    const existing = memSendLog.get(templateId) || { templateId, totalSent: 0, lastSentAt: new Date() }
    existing.totalSent += sent
    existing.lastSentAt = new Date()
    memSendLog.set(templateId, existing)

    return { sent, failed, results }
  },

  /**
   * Get send counts per template for a provider.
   */
  getSendCounts(providerId: ID): { templateId: ID; totalSent: number; lastSentAt: Date | null }[] {
    const templates = this.templates.list(providerId)
    return templates.map(t => {
      const log = memSendLog.get(t.id)
      return {
        templateId: t.id,
        totalSent: log?.totalSent ?? 0,
        lastSentAt: log?.lastSentAt ?? null,
      }
    })
  },

  /**
   * Process trial follow-up emails for a provider.
   * Checks completed trials and sends follow-up sequence based on timing:
   * - 24h after completion: "Wie hat es gefallen?" feedback email
   * - 3 days after completion (no booking): "Jetzt buchen" reminder
   * - 7 days after completion (no booking): "Letzte Chance" with optional coupon
   */
  async processTrialFollowups(providerId: ID): Promise<{
    feedbackSent: number
    reminderSent: number
    lastChanceSent: number
  }> {
    const now = new Date()
    const stats = { feedbackSent: 0, reminderSent: 0, lastChanceSent: 0 }

    // Check if marketing flows for trial_completed are active
    const flows = this.flows.list(providerId)
    const trialFlow = flows.find(f => f.trigger === 'trial_completed' && f.status === 'active')
    const conversionFlow = flows.find(f => f.trigger === 'trial_no_conversion' && f.status === 'active')
    if (!trialFlow && !conversionFlow) return stats

    // Get all completed (not yet converted) trials
    const completedTrials: TrialLesson[] = []
    for (const trial of store.state.trialLessons.values()) {
      if (trial.providerId !== providerId) continue
      if (trial.status !== 'completed') continue
      completedTrials.push(trial)
    }

    const { EmailService } = await import('../lib/email')

    for (const trial of completedTrials) {
      const completedAt = trial.updatedAt
      const hoursSinceCompletion = (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60)
      const followUp = trial.followUpEmails || {}

      // Look up parent email
      const parent = store.state.parents?.get(trial.parentId) as any
      if (!parent?.contact?.email && !parent?.email) continue
      const parentEmail = parent?.contact?.email || parent?.email || ''
      const parentName = parent?.name || parent?.contact?.name || 'Eltern'

      // Look up activity
      const activity = store.state.activities.get(trial.activityId)
      if (!activity) continue

      // Look up provider
      const provider = store.state.providers.get(providerId)
      const providerName = provider?.name || ''

      // Provider-Branding einmalig pro Trial-Loop auflösen
      const trialBrand = await (await import('../lib/email')).getProviderBranding(providerId)

      // 1. Feedback email (24h after completion)
      if (trialFlow && !followUp.feedbackSentAt && hoursSinceCompletion >= 24) {
        try {
          await EmailService.sendTrialFollowUp(parentEmail, {
            parentName,
            childName: trial.child?.name || 'Ihr Kind',
            courseName: activity.title,
            providerName,
            providerId,
          })
          followUp.feedbackSentAt = now
          trial.followUpEmails = followUp
          stats.feedbackSent++
        } catch (e) {
          console.error('[TrialFollowup] Feedback email failed:', e)
        }
      }

      // 2. Reminder email (3 days after completion, no booking)
      if (conversionFlow && !followUp.reminderSentAt && followUp.feedbackSentAt && hoursSinceCompletion >= 72) {
        try {
          const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
          const bookingUrl = `${origin}/widget/${provider?.slug || ''}`
          await EmailService.send({
            to: parentEmail,
            subject: `Platz sichern: ${activity.title} wartet auf ${trial.child?.name || 'euch'}!`,
            html: `
              <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #3C2225;">
                <div style="background: linear-gradient(135deg, #D4956A, #c4854a); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
                  <div style="font-size: 48px; margin-bottom: 8px;">📋</div>
                  <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Jetzt Platz sichern!</h1>
                </div>
                <div style="padding: 32px; background: #FFF9F5; border-radius: 0 0 16px 16px;">
                  <p style="font-size: 16px;">Hey ${parentName},</p>
                  <p>${trial.child?.name || 'Ihr Kind'} war bei der Probestunde <strong>"${activity.title}"</strong> dabei. Die Kurse sind beliebt und die Plätze begrenzt!</p>
                  <div style="text-align: center; margin: 28px 0;">
                    <a href="${bookingUrl}" style="display: inline-block; background: #D4956A; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px;">Jetzt buchen</a>
                  </div>
                  <p style="color: #8B7355; font-size: 14px;">Bei Fragen sind wir jederzeit erreichbar!</p>
                  <hr style="border: none; border-top: 1px solid #F2E6E2; margin: 24px 0;">
                  <p style="color: #94a3b8; font-size: 12px; text-align: center;">Powered by Urban Kids Club</p>
                </div>
              </div>
            `,
            text: `Hey ${parentName}, ${trial.child?.name || 'Ihr Kind'} war bei "${activity.title}" dabei. Jetzt Platz sichern: ${bookingUrl}`,
            brand: trialBrand,
          }, false)
          followUp.reminderSentAt = now
          trial.followUpEmails = followUp
          stats.reminderSent++
        } catch (e) {
          console.error('[TrialFollowup] Reminder email failed:', e)
        }
      }

      // 3. Last chance email (7 days after completion, no booking)
      if (conversionFlow && !followUp.lastChanceSentAt && followUp.reminderSentAt && hoursSinceCompletion >= 168) {
        try {
          const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
          const bookingUrl = `${origin}/widget/${provider?.slug || ''}`
          await EmailService.send({
            to: parentEmail,
            subject: `Letzte Chance: Platz für ${trial.child?.name || 'euch'} in "${activity.title}" sichern`,
            html: `
              <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #3C2225;">
                <div style="background: linear-gradient(135deg, #e74c3c, #c0392b); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
                  <div style="font-size: 48px; margin-bottom: 8px;">⏰</div>
                  <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Letzte Chance!</h1>
                </div>
                <div style="padding: 32px; background: #FFF9F5; border-radius: 0 0 16px 16px;">
                  <p style="font-size: 16px;">Hey ${parentName},</p>
                  <p>Die Plätze in <strong>"${activity.title}"</strong> sind fast voll. Wenn ${trial.child?.name || 'Ihr Kind'} die Probestunde gefallen hat, solltest du jetzt zuschlagen!</p>
                  <div style="background: #fdf4ed; padding: 16px; border-radius: 12px; border: 2px dashed #D4956A; margin: 20px 0; text-align: center;">
                    <div style="font-size: 14px; color: #8B7355;">Nur noch wenige Plätze frei</div>
                  </div>
                  <div style="text-align: center; margin: 28px 0;">
                    <a href="${bookingUrl}" style="display: inline-block; background: #e74c3c; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px;">Letzten Platz sichern</a>
                  </div>
                  <p style="color: #8B7355; font-size: 14px;">Kein Interesse mehr? Kein Problem — wir haben viele weitere Kurse!</p>
                  <hr style="border: none; border-top: 1px solid #F2E6E2; margin: 24px 0;">
                  <p style="color: #94a3b8; font-size: 12px; text-align: center;">Powered by Urban Kids Club</p>
                </div>
              </div>
            `,
            text: `Hey ${parentName}, letzte Chance! Platz in "${activity.title}" sichern: ${bookingUrl}`,
            brand: trialBrand,
          }, false)
          followUp.lastChanceSentAt = now
          trial.followUpEmails = followUp
          stats.lastChanceSent++
        } catch (e) {
          console.error('[TrialFollowup] Last chance email failed:', e)
        }
      }
    }

    return stats
  },
}

// In-memory send log for template execution tracking
const memSendLog = new Map<string, { templateId: ID; totalSent: number; lastSentAt: Date }>()
