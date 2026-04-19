// ============================================================
// Activities Routes — CRUD, publish, duplicate, archive
// ============================================================

import { Router } from '../router'
import { validate, CreateActivitySchema } from '../../lib/schemas'
import { requireAuth, checkPermission } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { ProviderService, ActivityService } from '../../services'
import { checkOpeningHours, checkRoomAvailability } from './helpers'

export function registerActivityRoutes(router: Router) {

  router.get('/api/providers/:providerId/activities', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const activities = await ActivityService.listByProvider(auth.providerId)
    res.json({ data: activities, count: activities.length })
  })

  router.get('/api/activities/search', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { safeParseInt } = await import('./helpers')
    const activities = await ActivityService.search({
      category: req.query.category,
      ageMin: req.query.ageMin ? safeParseInt(req.query.ageMin, 0) : undefined,
      ageMax: req.query.ageMax ? safeParseInt(req.query.ageMax, 18) : undefined,
      providerId: auth.providerId,
      status: req.query.status as any,
      query: req.query.q,
    })
    res.json({ data: activities, count: activities.length })
  })

  router.get('/api/activities/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const activity = await ActivityService.getById(req.params.id, auth.providerId)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')
    const spots = await ActivityService.getAvailableSpots(req.params.id)
    res.json({ data: { ...activity, availableSpots: spots } })
  })

  router.post('/api/activities', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'courses', 'create')) return
    const parsed = validate(CreateActivitySchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)

    // Check opening hours
    const ohError = await checkOpeningHours(auth.providerId, (parsed.data as any).schedule)
    if (ohError) return res.error(400, ohError)

    // Check room availability
    const roomError = await checkRoomAvailability(auth.providerId, (parsed.data as any).schedule)
    if (roomError) return res.error(400, roomError)

    const activity = await ActivityService.create({ ...parsed.data as any, providerId: auth.providerId })

    // Auto-create first course block if schedule has dates
    try {
      const sched = (parsed.data as any).schedule
      if (sched?.startDate && sched?.slots?.length > 0) {
        const sb = getServiceClient()
        const slot = sched.slots[0]
        const startDate = sched.startDate
        const packageSize = (parsed.data as any).pricing?.[0]?.packageSize || 8
        // Calculate end date based on package size (weekly sessions)
        const endD = new Date(startDate)
        endD.setDate(endD.getDate() + (packageSize - 1) * 7)
        const endDate = endD.toISOString().slice(0, 10)
        const duration = (parsed.data as any).duration || 60

        const { data: block } = await sb.from('course_blocks').insert({
          provider_id: auth.providerId,
          activity_id: (activity as any).id,
          activity_type: 'recurring',
          season_label: 'Block 1',
          total_sessions: packageSize,
          start_date: startDate,
          end_date: endDate,
          recurring_day: slot.day,
          recurring_time: slot.startTime,
          duration_minutes: duration,
          price_per_block: (parsed.data as any).pricing?.[0]?.amount || 0,
          capacity: (parsed.data as any).capacity || 10,
          status: 'active',
        }).select().single()

        // Auto-create sessions
        if (block) {
          const sessions = []
          const dayToNum: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
          const targetDay = dayToNum[slot.day?.toUpperCase()] ?? 1
          let d = new Date(startDate)
          while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1)
          let num = 1
          // Generate exactly packageSize sessions (don't constrain by endD which may be too short)
          while (num <= packageSize) {
            const [sh, sm] = slot.startTime.split(':').map(Number)
            const totalEndMin = sh * 60 + sm + duration
            const endH = Math.floor(totalEndMin / 60)
            const endM = totalEndMin % 60
            sessions.push({
              block_id: block.id,
              session_number: num,
              date: d.toISOString().slice(0, 10),
              start_time: slot.startTime,
              end_time: String(endH).padStart(2, '0') + ':' + String(endM).padStart(2, '0'),
              status: 'scheduled',
            })
            num++
            d.setDate(d.getDate() + 7)
          }
          // Update block end_date to match actual last session
          if (sessions.length) {
            await sb.from('block_sessions').insert(sessions)
            const lastSessionDate = sessions[sessions.length - 1].date
            await sb.from('course_blocks').update({ end_date: lastSessionDate }).eq('id', block.id)
          }
          console.log(`[AutoBlock] Created block with ${sessions.length} sessions for "${(activity as any).title}"`)
        }
      }
    } catch (e) { console.error('[AutoBlock] Error:', e) }

    res.status(201).json({ data: activity })
  })

  router.put('/api/activities/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Whitelist allowed fields for update
    const body = req.body as any
    const allowed: Record<string, unknown> = {}
    const fields = ['title', 'description', 'category', 'ageRange', 'capacity', 'schedule', 'pricing',
      'color', 'imageUrl', 'images', 'status', 'instructorId', 'roomId', 'locationId', 'platformListing',
      'payment_online', 'payment_onsite', 'paymentOnline', 'paymentOnsite',
      'waitlistEnabled', 'trialEnabled', 'tags',
      'siblingDiscount', 'siblingDiscountPercent']
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f] }
    // Server-side enforcement: block platform listing if provider's platform is not enabled
    if ((allowed as any).platformListing?.enabled) {
      const provider = await ProviderService.getById(auth.providerId)
      if (!provider?.platformEnabled) {
        return res.error(403, 'Plattform-Anbindung ist nicht freigeschaltet. Kontaktiere support@urbankids.club für mehr Informationen.')
      }
    }
    // Check opening hours if schedule is being updated
    if (allowed.schedule) {
      const ohError = await checkOpeningHours(auth.providerId, allowed.schedule as any)
      if (ohError) return res.error(400, ohError)
    }
    // Check room availability if schedule is being updated
    if (allowed.schedule) {
      const roomError = await checkRoomAvailability(auth.providerId, allowed.schedule as any, req.params.id)
      if (roomError) return res.error(400, roomError)
    }
    const activity = await ActivityService.update(req.params.id, allowed, auth.providerId)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')
    res.json({ data: activity })
  })

  router.post('/api/activities/:id/publish', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const result = await ActivityService.publish(req.params.id, auth.providerId)
    if (!result) return res.error(400, 'Aktivität konnte nicht veröffentlicht werden')
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.post('/api/activities/:id/duplicate', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const activity = await ActivityService.duplicate(req.params.id, auth.providerId)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')
    res.status(201).json({ data: activity })
  })

  router.post('/api/activities/:id/archive', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'courses', 'delete')) return
    const activity = await ActivityService.archive(req.params.id, auth.providerId)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')
    res.json({ data: activity })
  })
}
