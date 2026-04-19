// ============================================================
// Settings Routes — Stripe, PayPal, Payment Config,
// Cancellation Policy, Opening Hours, Rooms
// ============================================================

import { Router } from '../router'
import { requireAuth, checkPermission } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { RoomService } from '../../services'

export function registerSettingsRoutes(router: Router) {

  // ============================================================
  // STRIPE CONNECT
  // ============================================================

  // Dedicated status endpoint with test mode detection
  router.get('/api/stripe/status', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const db = getServiceClient()
    const { data } = await db.from('providers').select('stripe_account_id, stripe_connected').eq('id', auth.providerId).single()
    const stripeKey = process.env.STRIPE_SECRET_KEY || ''
    const isTestMode = stripeKey.startsWith('sk_test_')
    const isConfigured = !!stripeKey
    res.json({
      data: {
        connected: !!data?.stripe_connected,
        accountId: data?.stripe_account_id || null,
        testMode: isTestMode,
        platformConfigured: isConfigured,
      }
    })
  })

  router.post('/api/providers/:id/stripe-connect', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'settings', 'edit')) return
    if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
    const { getConnectAuthUrl } = await import('../../lib/stripe')
    const returnUrl = `${req.raw.headers.origin || 'https://app.urbankids.club'}/api/stripe/callback`
    const url = getConnectAuthUrl(req.params.id, returnUrl)
    res.json({ url })
  })

  router.get('/api/stripe/callback', async (req, res) => {
    const code = req.query.code as string
    const state = req.query.state as string
    if (!code || !state) { res.error(400, 'Missing code or state'); return }
    try {
      const { verifyConnectState, completeConnect } = await import('../../lib/stripe')
      const { providerId } = verifyConnectState(state)
      const accountId = await completeConnect(code)
      const db = getServiceClient()
      await db.from('providers').update({
        stripe_account_id: accountId,
        stripe_connected: true,
        updated_at: new Date().toISOString()
      }).eq('id', providerId)
      ;(res as any).writeHead(302, { Location: '/?page=settings&tab=payments&stripe=connected' })
      ;(res as any).end()
    } catch (err: any) {
      res.error(500, 'Stripe-Verbindung fehlgeschlagen: ' + err.message)
    }
  })

  // ============================================================
  // PAYPAL CONNECT
  // ============================================================

  router.put('/api/providers/:id/paypal-config', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'settings', 'edit')) return
    if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
    const { clientId, secret } = req.body as any
    if (!clientId || !secret) return res.error(400, 'Client ID und Secret erforderlich')
    // Encrypt PayPal secret before storage (never store plaintext)
    const { createCipheriv, randomBytes: rndBytes } = await import('node:crypto')
    const encKey = process.env.ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (!encKey || Buffer.from(encKey, 'utf8').length < 32) {
      return res.error(500, 'Verschlüsselung nicht konfiguriert — ENCRYPTION_KEY muss mindestens 32 Zeichen lang sein')
    }
    const keyBuf = Buffer.from(encKey, 'utf8').subarray(0, 32)
    const iv = rndBytes(16)
    const cipher = createCipheriv('aes-256-cbc', keyBuf, iv)
    const encryptedSecret = 'enc:' + iv.toString('hex') + ':' + cipher.update(secret, 'utf8', 'hex') + cipher.final('hex')
    const db = getServiceClient()
    const { error } = await db.from('providers').update({
      paypal_client_id: clientId,
      paypal_secret: encryptedSecret,
      paypal_connected: true,
      updated_at: new Date().toISOString()
    }).eq('id', auth.providerId)
    if (error) return res.error(500, error.message)
    res.json({ success: true })
  })

  // ============================================================
  // PAYMENT CONFIG
  // ============================================================

  router.get('/api/providers/:id/payment-config', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
    const db = getServiceClient()
    const { data } = await db.from('providers').select('stripe_account_id, stripe_connected, paypal_client_id, paypal_connected').eq('id', auth.providerId).single()
    // Stripe is available if provider has connected account OR platform has keys configured
    const stripeAvailable = data?.stripe_connected || !!process.env.STRIPE_SECRET_KEY
    res.json({ data: { ...data, stripe_connected: stripeAvailable, paypal_client_id: data?.paypal_client_id ? '***' + data.paypal_client_id.slice(-4) : null } })
  })

  // ============================================================
  // CANCELLATION POLICY
  // ============================================================

  router.get('/api/providers/:id/cancellation-policy', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const db = getServiceClient()
    const { data } = await db.from('cancellation_policies').select('*').eq('provider_id', auth.providerId).single()
    res.json({ data: data || { fee_type: 'fixed', fee_value: 0, deadline_hours: 48, custom_text: '' } })
  })

  router.put('/api/providers/:id/cancellation-policy', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'settings', 'edit')) return
    const { feeType, feeValue, deadlineHours, customText } = req.body as any
    const db = getServiceClient()
    const { error } = await db.from('cancellation_policies').upsert({
      provider_id: auth.providerId,
      fee_type: feeType || 'fixed',
      fee_value: parseFloat(feeValue) || 0,
      deadline_hours: parseInt(deadlineHours) || 48,
      custom_text: customText || '',
      updated_at: new Date().toISOString()
    }, { onConflict: 'provider_id' })
    if (error) return res.error(500, error.message)
    res.json({ success: true })
  })

  // ============================================================
  // OPENING HOURS (Öffnungszeiten)
  // ============================================================

  router.get('/api/opening-hours', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data } = await sb.from('providers').select('opening_hours').eq('id', auth.providerId).maybeSingle()
    res.json({ data: data?.opening_hours || {} })
  })

  router.put('/api/opening-hours', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'settings', 'edit')) return
    const sb = getServiceClient()
    const { error } = await sb.from('providers').update({ opening_hours: req.body }).eq('id', auth.providerId)
    if (error) return res.error(500, error.message)
    res.json({ success: true })
  })

  // ============================================================
  // ROOMS (Räume-System)
  // ============================================================

  router.get('/api/rooms', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const rooms = await RoomService.list(auth.providerId)
    res.json({ data: rooms, count: rooms.length })
  })

  router.post('/api/rooms', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { name, description, capacity, color } = req.body as any
    if (!name) return res.error(400, 'Name ist erforderlich')
    if (capacity !== undefined && capacity !== null && (capacity < 1 || capacity > 10000)) return res.error(400, 'Kapazität muss zwischen 1 und 10000 liegen')
    const safeColor = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#6B7280'
    const room = await RoomService.create({ providerId: auth.providerId, name, description, capacity, color: safeColor })
    res.status(201).json({ data: room })
  })

  router.put('/api/rooms/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const room = await RoomService.update(req.params.id, req.body as any, auth.providerId)
    if (!room) return res.error(404, 'Raum nicht gefunden')
    res.json({ data: room })
  })

  router.delete('/api/rooms/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    await RoomService.delete(req.params.id, auth.providerId)
    res.json({ success: true })
  })

  // Check for time conflicts in a room
  router.post('/api/rooms/:id/check-conflict', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { day, startTime, endTime, excludeActivityId } = req.body as any
    if (!day || !startTime || !endTime) return res.error(400, 'day, startTime, endTime sind erforderlich')
    const result = await RoomService.checkConflict(auth.providerId, req.params.id, day, startTime, endTime, excludeActivityId)
    res.json({ data: result })
  })

  // Assign room to activity
  router.put('/api/activities/:id/room', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { roomId } = req.body as { roomId: string | null }
    const sb = getServiceClient()

    // If assigning a room, check for conflicts
    if (roomId) {
      const { data: activity } = await sb.from('activities').select('schedule').eq('id', req.params.id).eq('provider_id', auth.providerId).maybeSingle()
      if (!activity) return res.error(404, 'Aktivität nicht gefunden')
      const sched = activity.schedule as any
      const slots = Array.isArray(sched) ? sched : (sched?.slots ?? [])
      for (const slot of slots) {
        const conflict = await RoomService.checkConflict(auth.providerId, roomId, slot.day, slot.startTime, slot.endTime, req.params.id)
        if (conflict.conflict) {
          return res.error(409, `Raumkonflikt: "${conflict.conflictingActivity?.title}" belegt den Raum ${slot.day} ${conflict.conflictingActivity?.startTime}–${conflict.conflictingActivity?.endTime}`)
        }
      }
    }

    const { error } = await sb.from('activities').update({ room_id: roomId }).eq('id', req.params.id).eq('provider_id', auth.providerId)
    if (error) return res.error(500, error.message)
    res.json({ success: true })
  })
}
