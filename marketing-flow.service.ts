// ============================================================
// Marketing Flow Engine + Worker
// ============================================================
// Implementiert Phase 1 des Marketing-Flow-Systems:
//   - evaluateTrigger(eventType, ...) wird von Trigger-Hooks aufgerufen
//     (z.B. nach Booking-Confirm) und legt für jeden matching Active-Flow
//     eine Row in pending_sends an (mit ON CONFLICT DO NOTHING für Idempotenz).
//   - processPendingSends() ist der Cron-Worker. Claimt due Rows mit
//     FOR UPDATE SKIP LOCKED, rendert Template, sendet via EmailService,
//     setzt status='sent'/'failed'.
// ============================================================

import { getServiceClient } from '../lib/supabase'
import { EmailService } from '../lib/email'

type Channel = 'email' | 'whatsapp' | 'sms' | 'in_app'
type RecipientType = 'parent' | 'provider' | 'instructor' | 'admin'

export interface TriggerEventPayload {
  /** z.B. 'booking_confirmed', 'session_cancelled', 'birthday' */
  eventType: string
  /** ID der auslösenden Entity (booking.id, session.id, ...) */
  eventId: string
  providerId: string

  /** Empfänger */
  recipientType: RecipientType
  recipientId: string
  recipientEmail?: string | null
  recipientPhone?: string | null
  recipientName?: string | null

  /** Variablen für Template-Rendering */
  templateVars?: Record<string, unknown>
}

export const MarketingFlowEngine = {
  /**
   * Findet alle aktiven Flows für (providerId × eventType) und legt
   * pro Flow + Channel-Match eine Row in pending_sends an.
   * Idempotent: gleicher (flow_id, event_id, recipient_id) wird nicht doppelt eingefügt.
   *
   * Best-effort: Fehler werden geloggt aber nicht propagiert — Trigger-Hooks
   * sollen niemals den Haupt-Flow (Booking-Confirm etc.) brechen.
   */
  async evaluateTrigger(p: TriggerEventPayload): Promise<{ scheduled: number }> {
    try {
      const sb = getServiceClient()

      const { data: flows, error: flowsErr } = await sb
        .from('automation_flows')
        .select('id, channel, delay_minutes, template_id, conditions')
        .eq('provider_id', p.providerId)
        .eq('trigger_type', p.eventType)
        .eq('status', 'active')

      if (flowsErr) {
        console.error('[MarketingFlow] flows query failed:', flowsErr.message)
        return { scheduled: 0 }
      }
      if (!flows || flows.length === 0) return { scheduled: 0 }

      const now = Date.now()
      const rows = flows.map(f => ({
        flow_id: f.id,
        provider_id: p.providerId,
        event_type: p.eventType,
        event_id: p.eventId,
        recipient_type: p.recipientType,
        recipient_id: p.recipientId,
        recipient_email: p.recipientEmail || null,
        recipient_phone: p.recipientPhone || null,
        recipient_name: p.recipientName || null,
        template_vars: p.templateVars || {},
        channel: f.channel as Channel,
        scheduled_at: new Date(now + (f.delay_minutes || 0) * 60_000).toISOString(),
        status: 'pending' as const,
      }))

      // ON CONFLICT DO NOTHING via upsert with ignoreDuplicates
      const { error: insErr, data: inserted } = await sb
        .from('pending_sends')
        .upsert(rows, {
          onConflict: 'flow_id,event_id,recipient_id',
          ignoreDuplicates: true,
        })
        .select('id')

      if (insErr) {
        console.error('[MarketingFlow] insert pending_sends failed:', insErr.message)
        return { scheduled: 0 }
      }

      const count = inserted?.length || 0
      if (count > 0) {
        console.log(`[MarketingFlow] ${p.eventType} → scheduled ${count}/${flows.length} sends for provider ${p.providerId}`)
      }
      return { scheduled: count }
    } catch (e: any) {
      console.error('[MarketingFlow] evaluateTrigger crashed:', e?.message || e)
      return { scheduled: 0 }
    }
  },
}

// ============================================================
// WORKER
// ============================================================

interface PendingRow {
  id: string
  flow_id: string
  provider_id: string
  channel: Channel
  recipient_type: RecipientType
  recipient_id: string
  recipient_email: string | null
  recipient_phone: string | null
  recipient_name: string | null
  template_vars: Record<string, unknown>
  attempts: number
}

interface FlowRow {
  id: string
  channel: Channel
  template_id: string | null
}

interface TemplateRow {
  id: string
  channel: Channel
  subject: string | null
  body: string
}

const MAX_ATTEMPTS = 3

/** Render `{varName}` Token mit template_vars-Werten. Unbekannte Tokens bleiben stehen. */
function renderTemplate(text: string, vars: Record<string, unknown>): string {
  return String(text).replace(/\{\s*([a-zA-Z0-9_.]+)\s*\}/g, (_match, key) => {
    const v = vars[key as string]
    return v == null ? `{${key}}` : String(v)
  })
}

export const MarketingFlowWorker = {
  /**
   * Worker-Tick: Claimt bis zu `maxBatch` due pending_sends, sendet sie,
   * updated Status. Idempotent über Atomic-Status-Transition + UNIQUE-Idem-Index.
   *
   * Note: FOR UPDATE SKIP LOCKED ist mit Supabase JS-Client nicht direkt verfügbar
   * (kein Raw-SQL ohne RPC). Stattdessen 2-Step Atomic Claim:
   *   UPDATE ... SET status='sending' WHERE id IN (SELECT id WHERE status='pending' AND scheduled_at <= now() LIMIT N) RETURNING *
   * Der UPDATE ist atomar (Postgres Row-Lock auf Write), kein Race möglich.
   */
  async processPendingSends(maxBatch = 20): Promise<{
    claimed: number; sent: number; failed: number; skipped: number
  }> {
    const sb = getServiceClient()
    const result = { claimed: 0, sent: 0, failed: 0, skipped: 0 }

    try {
      // Step 1: Atomic claim — pull due pending rows, set to 'sending'
      const nowIso = new Date().toISOString()
      const { data: dueIds } = await sb
        .from('pending_sends')
        .select('id')
        .eq('status', 'pending')
        .lte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true })
        .limit(maxBatch)

      if (!dueIds || dueIds.length === 0) return result

      const ids = dueIds.map(r => r.id)
      const { data: claimed, error: claimErr } = await sb
        .from('pending_sends')
        .update({ status: 'sending', last_attempted_at: nowIso, attempts: 1 })
        .in('id', ids)
        .eq('status', 'pending') // Only claim if still pending (race-safe)
        .select('id, flow_id, provider_id, channel, recipient_type, recipient_id, recipient_email, recipient_phone, recipient_name, template_vars, attempts')

      if (claimErr) {
        console.error('[MarketingWorker] claim failed:', claimErr.message)
        return result
      }
      if (!claimed || claimed.length === 0) return result

      result.claimed = claimed.length

      // Step 2: Pre-fetch flow + template metadata (deduplicate)
      const flowIds = [...new Set(claimed.map(r => r.flow_id))]
      const { data: flows } = await sb
        .from('automation_flows')
        .select('id, channel, template_id')
        .in('id', flowIds)
      const flowMap = new Map<string, FlowRow>((flows || []).map(f => [f.id, f as FlowRow]))

      const templateIds = [...new Set((flows || []).map(f => f.template_id).filter(Boolean))] as string[]
      const { data: templates } = templateIds.length
        ? await sb.from('message_templates').select('id, channel, subject, body').in('id', templateIds)
        : { data: [] }
      const tplMap = new Map<string, TemplateRow>((templates || []).map(t => [t.id, t as TemplateRow]))

      // Step 3: Process each claimed row
      for (const row of claimed as PendingRow[]) {
        const flow = flowMap.get(row.flow_id)
        const template = flow?.template_id ? tplMap.get(flow.template_id) : null

        // Validate prerequisites
        if (!flow) {
          await markFailed(sb, row.id, 'Flow nicht gefunden', row.attempts)
          result.failed++
          continue
        }
        if (!template) {
          await markFailed(sb, row.id, 'Template nicht gefunden', row.attempts)
          result.failed++
          continue
        }
        if (row.channel !== 'email') {
          // Phase 1: nur email. Andere Kanäle → skip (status=skipped).
          await markSkipped(sb, row.id, `Channel ${row.channel} noch nicht implementiert`)
          result.skipped++
          continue
        }
        if (!row.recipient_email) {
          await markSkipped(sb, row.id, 'Kein Empfänger-Email')
          result.skipped++
          continue
        }

        // Consent-Check für parents (DSGVO)
        if (row.recipient_type === 'parent') {
          const { data: consent } = await sb
            .from('marketing_consent')
            .select('granted')
            .eq('parent_id', row.recipient_id)
            .eq('channel', 'email')
            .maybeSingle()
          // Default-Policy: granted=true wenn keine Row existiert (Soft-Opt-in via Booking-Akzeptanz)
          if (consent && consent.granted === false) {
            await markSkipped(sb, row.id, 'Empfänger hat opt-out (email)')
            result.skipped++
            continue
          }
        }

        // Render
        const subject = renderTemplate(template.subject || '(kein Betreff)', row.template_vars)
        const body = renderTemplate(template.body, row.template_vars)

        // Send via Resend.
        // Wichtig: Wir tracken "send-success" via lokale Variable, damit ein
        // Crash NACH dem erfolgreichen Send (z.B. in Followup-Code) nicht
        // markFailed triggert und einen Duplikat-Send beim nächsten Tick auslöst.
        let sendSucceeded = false
        let sendError: string | null = null
        let messageId: string | null = null
        try {
          const { getProviderBranding: _gpb } = await import('../lib/email')
          const flowBrand = await _gpb(row.provider_id)
          const send = await EmailService.send({
            to: row.recipient_email,
            subject,
            html: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br>')}</p>`,
            text: body.includes('<') ? body.replace(/<[^>]+>/g, '') : body,
            brand: flowBrand,
          })
          sendSucceeded = !!send.success
          sendError = send.success ? null : (send.error || 'Send failed')
          messageId = send.messageId || null
        } catch (err: any) {
          sendSucceeded = false
          sendError = err?.message || String(err)
        }

        if (sendSucceeded) {
          // Status final auf 'sent' setzen — auch wenn die Update-Query selbst fehlschlägt,
          // wird beim nächsten Tick erneut versucht zu UPDATEn (idempotent), aber Email
          // wird NICHT nochmal gesendet, weil Worker pending-Filter nutzt und Status schon != pending.
          // Edge: wenn auch das hier crashed, status bleibt 'sending', wird beim nächsten Tick
          // NICHT re-claimed (weil Filter status='pending') → eine manuelle Audit-Klärung nötig.
          try {
            await sb.from('pending_sends').update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              external_message_id: messageId,
              last_error: null,
            }).eq('id', row.id)
          } catch (updErr: any) {
            console.error('[MarketingWorker] post-send status update failed (Email war erfolgreich, messageId=' + messageId + '):', updErr?.message || updErr)
          }
          result.sent++
        } else {
          await markFailed(sb, row.id, sendError || 'Unbekannter Fehler', row.attempts)
          result.failed++
        }
      }

      console.log(`[MarketingWorker] tick: claimed=${result.claimed} sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`)
      return result
    } catch (e: any) {
      console.error('[MarketingWorker] processPendingSends crashed:', e?.message || e)
      return result
    }
  },
}

async function markFailed(sb: ReturnType<typeof getServiceClient>, id: string, error: string, attempts: number) {
  // Bei MAX_ATTEMPTS überschritten → final failed; sonst zurück auf pending mit Backoff
  const finalFail = attempts + 1 >= MAX_ATTEMPTS
  if (finalFail) {
    await sb.from('pending_sends').update({
      status: 'failed',
      last_error: error,
    }).eq('id', id)
  } else {
    // Exponential backoff: 5min × 2^attempts
    const backoffMs = 5 * 60_000 * Math.pow(2, attempts)
    await sb.from('pending_sends').update({
      status: 'pending',
      last_error: error,
      scheduled_at: new Date(Date.now() + backoffMs).toISOString(),
    }).eq('id', id)
  }
}

async function markSkipped(sb: ReturnType<typeof getServiceClient>, id: string, reason: string) {
  await sb.from('pending_sends').update({
    status: 'skipped',
    skip_reason: reason,
  }).eq('id', id)
}
