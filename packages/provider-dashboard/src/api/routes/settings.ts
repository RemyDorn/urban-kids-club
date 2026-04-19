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

  // Stripe is platform-managed — always report as configured
  router.get('/api/stripe/status', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    res.json({
      data: {
        connected: true,
        accountId: null,
        testMode: false,
        platformConfigured: true,
        platformManaged: true,
      }
    })
  })

  // Stripe Connect is platform-managed for MVP — individual providers don't need their own accounts
  router.post('/api/providers/:id/stripe-connect', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    res.json({ message: 'Stripe ist ueber die Urban Kids Club Plattform konfiguriert. Du musst kein eigenes Stripe-Konto verbinden.' })
  })

  // ============================================================
  // PAYPAL CONNECT
  // ============================================================

  // PayPal is platform-managed for MVP — individual providers don't need their own credentials
  router.put('/api/providers/:id/paypal-config', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    res.json({ message: 'PayPal ist ueber die Urban Kids Club Plattform konfiguriert. Du musst keine eigenen PayPal-Zugangsdaten eingeben.' })
  })

  // ============================================================
  // PAYMENT CONFIG
  // ============================================================

  // Payment config — Stripe and PayPal are platform-managed
  router.get('/api/providers/:id/payment-config', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
    res.json({ data: { stripe_connected: true, paypal_connected: true, platformManaged: true } })
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

  // ============================================================
  // REMINDER EMAILS (Erinnerungs-E-Mails)
  // ============================================================

  router.get('/api/providers/:id/reminder-settings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
    const db = getServiceClient()
    const { data } = await db.from('providers').select('reminder_emails_enabled').eq('id', auth.providerId).single()
    // Default: true (enabled) if not explicitly set
    res.json({ data: { reminderEmailsEnabled: data?.reminder_emails_enabled !== false } })
  })

  router.put('/api/providers/:id/reminder-settings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'settings', 'edit')) return
    if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
    const { reminderEmailsEnabled } = req.body as { reminderEmailsEnabled: boolean }
    if (typeof reminderEmailsEnabled !== 'boolean') return res.error(400, 'reminderEmailsEnabled muss ein Boolean sein')
    const db = getServiceClient()
    const { error } = await db.from('providers').update({
      reminder_emails_enabled: reminderEmailsEnabled,
      updated_at: new Date().toISOString()
    }).eq('id', auth.providerId)
    if (error) return res.error(500, error.message)
    res.json({ success: true, data: { reminderEmailsEnabled } })
  })
}
