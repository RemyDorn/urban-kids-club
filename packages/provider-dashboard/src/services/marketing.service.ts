// ============================================================
// Marketing Automation Service
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type {
  AutomationFlow, AutomationTrigger, AutomationChannel, AutomationStatus,
  MessageTemplate, MarketingCampaign, ID,
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
}
