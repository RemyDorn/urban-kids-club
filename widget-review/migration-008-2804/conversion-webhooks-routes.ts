// ============================================================
// Conversion-Webhook Routes — Server-Side-Tracking-Config
// ============================================================
// GET    /api/providers/:providerId/conversion-webhook            → Read config
// PUT    /api/providers/:providerId/conversion-webhook            → Upsert config
// DELETE /api/providers/:providerId/conversion-webhook            → Disable
// POST   /api/providers/:providerId/conversion-webhook/test       → Send test event
// GET    /api/providers/:providerId/conversion-webhook/deliveries → Recent log

import { Router } from '../router'
import { requireAuth } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { ConversionWebhookService } from '../../services/conversion-webhook.service'

export function registerConversionWebhookRoutes(router: Router) {

  // GET config (one webhook per provider for now)
  router.get('/api/providers/:providerId/conversion-webhook', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (auth.providerId !== req.params.providerId) return res.error(403, 'Forbidden')
    const sb = getServiceClient()
    const { data } = await sb
      .from('conversion_webhooks')
      .select('id, url, secret, events, active, created_at, updated_at')
      .eq('provider_id', auth.providerId)
      .maybeSingle()
    res.json({ data: data || null })
  })

  // PUT (upsert) config
  router.put('/api/providers/:providerId/conversion-webhook', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (auth.providerId !== req.params.providerId) return res.error(403, 'Forbidden')

    const { url, secret, events, active } = req.body ?? {}
    const ev = Array.isArray(events) && events.length > 0 ? events : ['booking_confirmed', 'payment_received']

    if (url && typeof url === 'string') {
      if (!/^https?:\/\//i.test(url)) return res.error(400, 'URL muss mit http(s):// beginnen')
      try { new URL(url) } catch { return res.error(400, 'Ungültige URL') }
    }

    const sb = getServiceClient()
    const { data: existing } = await sb
      .from('conversion_webhooks')
      .select('id')
      .eq('provider_id', auth.providerId)
      .maybeSingle()

    const row = {
      provider_id: auth.providerId,
      url: url || '',
      secret: secret || null,
      events: ev,
      active: !!active && !!url,
      updated_at: new Date().toISOString(),
    }

    if (existing && (existing as any).id) {
      const { data, error } = await sb
        .from('conversion_webhooks')
        .update(row)
        .eq('id', (existing as any).id)
        .select()
        .single()
      if (error) return res.error(500, error.message)
      res.json({ data })
    } else {
      const { data, error } = await sb
        .from('conversion_webhooks')
        .insert(row)
        .select()
        .single()
      if (error) return res.error(500, error.message)
      res.json({ data })
    }
  })

  // DELETE (disable)
  router.delete('/api/providers/:providerId/conversion-webhook', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (auth.providerId !== req.params.providerId) return res.error(403, 'Forbidden')
    const sb = getServiceClient()
    await sb.from('conversion_webhooks').update({ active: false }).eq('provider_id', auth.providerId)
    res.json({ data: { ok: true } })
  })

  // POST /test — send a test event
  router.post('/api/providers/:providerId/conversion-webhook/test', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (auth.providerId !== req.params.providerId) return res.error(403, 'Forbidden')
    try {
      const result = await ConversionWebhookService.sendTest(auth.providerId)
      res.json({ data: { ok: result.ok, responseStatus: result.status, error: result.error, eventId: result.eventId } })
    } catch (e: any) {
      res.error(500, e?.message || 'Test fehlgeschlagen')
    }
  })

  // GET deliveries log (last 50)
  router.get('/api/providers/:providerId/conversion-webhook/deliveries', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (auth.providerId !== req.params.providerId) return res.error(403, 'Forbidden')
    const sb = getServiceClient()
    const { data } = await sb
      .from('conversion_deliveries')
      .select('id, event_id, event_name, trigger_type, status, attempts, response_status, response_body, last_error, sent_at, created_at')
      .eq('provider_id', auth.providerId)
      .order('created_at', { ascending: false })
      .limit(50)
    res.json({ data: data || [] })
  })

  // POST /retry — manually retry a failed delivery (for dashboard "Retry" button — future)
  router.post('/api/conversion-deliveries/:id/retry', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data: row } = await sb
      .from('conversion_deliveries')
      .select('provider_id, status, attempts, max_attempts')
      .eq('id', req.params.id)
      .maybeSingle()
    if (!row) return res.error(404, 'Delivery nicht gefunden')
    if ((row as any).provider_id !== auth.providerId) return res.error(403, 'Forbidden')
    await sb.from('conversion_deliveries').update({
      status: 'pending',
      next_retry_at: null,
      max_attempts: Math.max((row as any).attempts + 1, (row as any).max_attempts || 5),
    }).eq('id', req.params.id)
    res.json({ data: { ok: true } })
  })
}
