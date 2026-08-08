// Conversion-Webhook Service — Server-Side-Tracking
// =====================================================================================
// Provider configures an outgoing webhook (n8n / Zapier / Make / own endpoint).
// On every booking_confirmed / payment_received / refund / customer_signup event,
// UKC POSTs a standardized CAPI-compatible payload with SHA256-hashed identifiers.
// Failed deliveries are retried via background worker (exponential backoff).

import { createHash, createHmac, randomUUID } from 'crypto'
import { getServiceClient } from '../lib/supabase'

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export type ConversionTrigger = 'booking_confirmed' | 'payment_received' | 'refund' | 'customer_signup'

export interface ConversionEventInput {
  providerId: string
  triggerType: ConversionTrigger
  // Required for dedup with browser-pixel
  eventId?: string                  // If omitted, generated as 'ukc_{trigger}_{uuid}'
  eventName?: string                // CAPI event_name. Default: trigger_type → 'Purchase' / 'Lead'
  // Booking context
  booking?: {
    id?: string
    activityId?: string
    activityTitle?: string
    blockId?: string
    sessionId?: string
    paymentMethod?: string          // 'stripe' | 'onsite' | 'invoice' | 'paypal'
    status?: string
  }
  // Monetary
  value?: number
  currency?: string                 // Default 'EUR'
  contentIds?: string[]             // Default [activityId]
  numItems?: number                 // Default 1
  // PII (will be SHA256-hashed before transport)
  user?: {
    email?: string
    phone?: string
    firstName?: string
    lastName?: string
    externalId?: string             // Stable parent UUID (already non-PII, but useful for matching)
  }
  // Tracking context
  clientIp?: string
  userAgent?: string
  fbp?: string                      // Meta browser cookie
  fbc?: string                      // Meta click cookie
  gclid?: string                    // Google Ads click id
  utm?: {
    source?: string
    medium?: string
    campaign?: string
    term?: string
    content?: string
  }
}

interface WebhookConfig {
  id: string
  provider_id: string
  url: string
  secret: string | null
  events: string[]
  active: boolean
}

// ----------------------------------------------------------------------
// Hashing — SHA256 for Meta CAPI / GA4 MP compatibility
// ----------------------------------------------------------------------

function normalizeEmail(s: string): string {
  return String(s || '').trim().toLowerCase()
}

function normalizePhone(s: string): string {
  // CAPI/MP expect E.164 without '+'. Strip everything non-digit; if starts with 0, assume DE → 49.
  const d = String(s || '').replace(/\D+/g, '')
  if (!d) return ''
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith('0')) return '49' + d.slice(1)
  return d
}

function normalizeName(s: string): string {
  return String(s || '').trim().toLowerCase()
}

function sha256Hex(s: string): string {
  if (!s) return ''
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

// ----------------------------------------------------------------------
// CAPI-compatible event_name mapping
// ----------------------------------------------------------------------

// Meta-Standard-Event-Mapping. Trennt Funnel-Step (Buchung) von Conversion (Bezahlung)
// damit Meta nicht doppelt zählt:
//   booking_confirmed → 'Schedule' (Meta-Standard für Termin-/Kursbuchung, ohne Money-Trigger)
//   payment_received  → 'Purchase' (echte Conversion mit Wert)
// Bei Online-Zahlung feuern beide gleichzeitig (Schedule + Purchase) → Funnel-Visualisierung in Meta.
// Bei Onsite-Zahlung feuert Schedule sofort, Purchase erst wenn Provider auf "Bezahlt" klickt.
const EVENT_NAME_MAP: Record<ConversionTrigger, string> = {
  booking_confirmed: 'Schedule',
  payment_received: 'Purchase',
  refund: 'Refund',
  customer_signup: 'Lead',
}

// ----------------------------------------------------------------------
// Event-ID — must match browser-pixel event_id for server+pixel dedup
// ----------------------------------------------------------------------

function buildEventId(input: ConversionEventInput): string {
  if (input.eventId) return input.eventId
  // Stable per booking: ukc_{trigger}_{bookingId} → so same trigger can't fire twice
  if (input.booking?.id) return `ukc_${input.triggerType}_${input.booking.id}`
  return `ukc_${input.triggerType}_${randomUUID()}`
}

// ----------------------------------------------------------------------
// Build CAPI-compatible payload
// ----------------------------------------------------------------------

export function buildPayload(input: ConversionEventInput, providerSlug: string): Record<string, any> {
  const eventName = input.eventName || EVENT_NAME_MAP[input.triggerType] || 'CustomEvent'
  const currency = input.currency || 'EUR'
  const contentIds = input.contentIds || (input.booking?.activityId ? [input.booking.activityId] : [])
  const eventId = buildEventId(input)
  const u = input.user || {}

  const userData: Record<string, any> = {}
  if (u.email) userData.em_sha256 = sha256Hex(normalizeEmail(u.email))
  if (u.phone) userData.ph_sha256 = sha256Hex(normalizePhone(u.phone))
  if (u.firstName) userData.fn_sha256 = sha256Hex(normalizeName(u.firstName))
  if (u.lastName) userData.ln_sha256 = sha256Hex(normalizeName(u.lastName))
  if (u.externalId) userData.external_id = u.externalId
  if (input.clientIp) userData.client_ip_address = input.clientIp
  if (input.userAgent) userData.client_user_agent = input.userAgent
  if (input.fbp) userData.fbp = input.fbp
  if (input.fbc) userData.fbc = input.fbc
  if (input.gclid) userData.gclid = input.gclid

  const customData: Record<string, any> = {}
  if (input.utm?.source) customData.utm_source = input.utm.source
  if (input.utm?.medium) customData.utm_medium = input.utm.medium
  if (input.utm?.campaign) customData.utm_campaign = input.utm.campaign
  if (input.utm?.term) customData.utm_term = input.utm.term
  if (input.utm?.content) customData.utm_content = input.utm.content

  return {
    event_id: eventId,
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    provider: { id: input.providerId, slug: providerSlug },
    booking: input.booking ? {
      id: input.booking.id,
      activity_id: input.booking.activityId,
      activity_title: input.booking.activityTitle,
      block_id: input.booking.blockId,
      session_id: input.booking.sessionId,
      payment_method: input.booking.paymentMethod,
      status: input.booking.status,
    } : undefined,
    value: input.value,
    currency,
    content_ids: contentIds,
    content_type: 'product',
    num_items: input.numItems ?? 1,
    user_data: userData,
    custom_data: customData,
  }
}

// ----------------------------------------------------------------------
// HMAC signing (X-UKC-Signature header)
// ----------------------------------------------------------------------

function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

// ----------------------------------------------------------------------
// Public: Enqueue conversion event
// ----------------------------------------------------------------------

export const ConversionWebhookService = {
  /**
   * Enqueue a conversion event for outgoing webhook delivery.
   * Idempotent: same (webhook_id, event_id) is silently dropped via UNIQUE constraint.
   * Returns delivery_id or null if no active webhook is configured for this trigger.
   */
  async enqueue(input: ConversionEventInput): Promise<string | null> {
    const sb = getServiceClient()

    // 1) Look up provider's active webhook
    const { data: webhook } = await sb
      .from('conversion_webhooks')
      .select('id, provider_id, url, secret, events, active')
      .eq('provider_id', input.providerId)
      .eq('active', true)
      .maybeSingle()

    if (!webhook) return null
    const cfg = webhook as WebhookConfig
    if (!cfg.events?.includes(input.triggerType)) return null

    // 2) Look up provider slug for payload
    const { data: prov } = await sb.from('providers').select('slug').eq('id', input.providerId).maybeSingle()
    const slug = (prov as any)?.slug || ''

    // 3) Build payload
    const payload = buildPayload(input, slug)
    const eventId = payload.event_id as string
    const eventName = payload.event_name as string

    // 4) Insert delivery (ON CONFLICT DO NOTHING via UNIQUE)
    const { data, error } = await sb
      .from('conversion_deliveries')
      .insert({
        webhook_id: cfg.id,
        provider_id: input.providerId,
        event_id: eventId,
        event_name: eventName,
        trigger_type: input.triggerType,
        payload,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) {
      // Likely unique-violation on (webhook_id, event_id) — already enqueued. Quiet.
      const msg = (error as any).message || ''
      if (msg.includes('duplicate key') || msg.includes('conversion_deliveries_webhook_id_event_id_key')) {
        return null
      }
      console.warn('[conversion-webhook] enqueue insert failed', error)
      return null
    }

    return (data as any)?.id || null
  },

  /**
   * Worker: claim up to N pending/retry-due deliveries, send them, update status.
   */
  async processPending(maxBatch = 20): Promise<{ sent: number; failed: number; skipped: number }> {
    const sb = getServiceClient()
    const now = new Date().toISOString()

    // Claim: pending OR retry due
    const { data: rows } = await sb
      .from('conversion_deliveries')
      .select('id, webhook_id, payload, attempts, max_attempts')
      .or(`and(status.eq.pending,next_retry_at.is.null),and(status.eq.pending,next_retry_at.lte.${now})`)
      .order('created_at', { ascending: true })
      .limit(maxBatch)

    const list = (rows as any[]) || []
    if (list.length === 0) return { sent: 0, failed: 0, skipped: 0 }

    // Atomic claim — flip to 'sending' to prevent double-claim by parallel workers
    const ids = list.map(r => r.id)
    await sb.from('conversion_deliveries').update({ status: 'sending' }).in('id', ids)

    // Look up webhook configs once
    const wIds = Array.from(new Set(list.map(r => r.webhook_id)))
    const { data: webhooks } = await sb
      .from('conversion_webhooks')
      .select('id, url, secret, active')
      .in('id', wIds)
    const webhookMap = new Map<string, WebhookConfig>()
    for (const w of (webhooks as any[]) || []) webhookMap.set(w.id, w as WebhookConfig)

    let sent = 0, failed = 0, skipped = 0

    for (const row of list) {
      const cfg = webhookMap.get(row.webhook_id)
      if (!cfg || !cfg.active) {
        await sb.from('conversion_deliveries').update({
          status: 'failed', last_error: 'webhook inactive or deleted',
        }).eq('id', row.id)
        skipped++
        continue
      }

      const result = await deliverOnce(cfg, row.payload, row.attempts + 1)

      if (result.ok) {
        await sb.from('conversion_deliveries').update({
          status: 'success',
          attempts: row.attempts + 1,
          response_status: result.status,
          response_body: result.body?.slice(0, 1000) || null,
          sent_at: new Date().toISOString(),
          next_retry_at: null,
          last_error: null,
        }).eq('id', row.id)
        sent++
      } else {
        const newAttempts = row.attempts + 1
        const maxA = row.max_attempts || 5
        const giveUp = newAttempts >= maxA

        // Exponential backoff: 30s, 2m, 10m, 1h, 6h
        const backoffSec = [30, 120, 600, 3600, 21600][Math.min(newAttempts - 1, 4)]
        const nextRetry = giveUp ? null : new Date(Date.now() + backoffSec * 1000).toISOString()

        await sb.from('conversion_deliveries').update({
          status: giveUp ? 'failed' : 'pending',
          attempts: newAttempts,
          response_status: result.status || null,
          response_body: result.body?.slice(0, 1000) || null,
          last_error: result.error?.slice(0, 500) || null,
          next_retry_at: nextRetry,
        }).eq('id', row.id)
        failed++
      }
    }

    return { sent, failed, skipped }
  },

  /**
   * One-off test delivery — bypasses queue, direct send, no retry.
   * Used by "Test-Event senden" button in dashboard.
   */
  async sendTest(providerId: string): Promise<{ ok: boolean; status?: number; error?: string; eventId: string }> {
    const sb = getServiceClient()
    const { data: webhook } = await sb
      .from('conversion_webhooks')
      .select('id, provider_id, url, secret, active')
      .eq('provider_id', providerId)
      .eq('active', true)
      .maybeSingle()

    if (!webhook) return { ok: false, error: 'Kein aktiver Webhook konfiguriert', eventId: '' }
    const cfg = webhook as WebhookConfig

    const { data: prov } = await sb.from('providers').select('slug').eq('id', providerId).maybeSingle()
    const slug = (prov as any)?.slug || ''

    const eventId = `ukc_test_${randomUUID()}`
    const payload = buildPayload({
      providerId,
      triggerType: 'booking_confirmed',
      eventId,
      booking: {
        id: 'test-booking-id',
        activityId: 'test-activity-id',
        activityTitle: 'Test-Kurs (Probebuchung)',
        paymentMethod: 'stripe',
        status: 'confirmed',
      },
      value: 140.00,
      currency: 'EUR',
      user: {
        email: 'test@urbankids.club',
        phone: '+49 30 12345678',
        firstName: 'Test',
        lastName: 'Provider',
        externalId: 'test-parent-id',
      },
    }, slug)

    // Mark payload as test
    payload.test_mode = true

    const result = await deliverOnce(cfg, payload, 1)

    // Log to deliveries table for visibility (status=success or failed, not retried)
    await sb.from('conversion_deliveries').insert({
      webhook_id: cfg.id,
      provider_id: providerId,
      event_id: eventId,
      event_name: payload.event_name,
      trigger_type: 'test',
      payload,
      status: result.ok ? 'success' : 'failed',
      attempts: 1,
      response_status: result.status || null,
      response_body: result.body?.slice(0, 1000) || null,
      last_error: result.error?.slice(0, 500) || null,
      sent_at: new Date().toISOString(),
    })

    return { ok: result.ok, status: result.status, error: result.error, eventId }
  },
}

// ----------------------------------------------------------------------
// HTTP delivery (one attempt)
// ----------------------------------------------------------------------

async function deliverOnce(
  cfg: WebhookConfig,
  payload: any,
  attemptNum: number,
): Promise<{ ok: boolean; status?: number; body?: string; error?: string }> {
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'UrbanKidsClub-Webhook/1.0',
    'X-UKC-Event-Id': payload.event_id,
    'X-UKC-Event-Name': payload.event_name,
    'X-UKC-Attempt': String(attemptNum),
  }
  if (cfg.secret) {
    headers['X-UKC-Signature'] = sign(cfg.secret, body)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000) // 10s timeout

  try {
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const text = await r.text().catch(() => '')
    if (r.status >= 200 && r.status < 300) {
      return { ok: true, status: r.status, body: text }
    }
    return { ok: false, status: r.status, body: text, error: `HTTP ${r.status}` }
  } catch (e: any) {
    clearTimeout(timeout)
    return { ok: false, error: e?.message || String(e) }
  }
}
