// ============================================================
// Activities Routes — CRUD, publish, duplicate, archive
// ============================================================

import { Router } from '../router'
import { validate, CreateActivitySchema } from '../../lib/schemas'
import { requireAuth, checkPermission } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { ProviderService, ActivityService } from '../../services'
import { checkOpeningHours, checkRoomAvailability } from './helpers'

// --------------------------------------------------------------
// Block-Session sync helpers (Bug-Fix 2026-04-30):
// FK-Refs (session_credits, makeup_bookings) machten DELETE silent fail
// → INSERT lief trotzdem → Duplikate. UPSERT mit (block_id, session_number)
// als unique key vermeidet das. Bei Resume (paused → active) und
// start_date in der Vergangenheit wird der Block automatisch auf den
// nächsten gültigen Wochentag verschoben.
// --------------------------------------------------------------

const DAY_TO_NUM: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

/** Find next occurrence of `recurringDay` on or after `today` (ISO yyyy-mm-dd). */
function shiftBlockStartDate(currentStart: string | null | undefined, recurringDay: string | null | undefined, today: string): string | null {
  if (!recurringDay) return null
  if (currentStart && currentStart >= today) return null
  const targetDay = DAY_TO_NUM[String(recurringDay).toUpperCase()] ?? 1
  const d = new Date(today + 'T00:00:00Z')
  while (d.getUTCDay() !== targetDay) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Build N session rows for a block starting at block.start_date, weekly cadence. */
function buildSessionsForBlock(blk: any): any[] {
  const targetDay = DAY_TO_NUM[String(blk.recurring_day || '').toUpperCase()] ?? 1
  let d = new Date((blk.start_date || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z')
  while (d.getUTCDay() !== targetDay) d.setUTCDate(d.getUTCDate() + 1)
  const sessions: any[] = []
  const total = blk.total_sessions || 1
  const dur = blk.duration_minutes || 60
  const [sh, sm] = String(blk.recurring_time || '15:00').split(':').map(Number)
  const totalEndMin = sh * 60 + (sm || 0) + dur
  const endTime = String(Math.floor(totalEndMin / 60)).padStart(2, '0') + ':' + String(totalEndMin % 60).padStart(2, '0')
  for (let i = 0; i < total; i++) {
    sessions.push({
      block_id: blk.id,
      session_number: i + 1,
      date: d.toISOString().slice(0, 10),
      start_time: blk.recurring_time,
      end_time: endTime,
      status: 'scheduled',
    })
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return sessions
}

/** UPSERT sessions and prune any with session_number > total. Errors are logged, not thrown.
 *  Side-effect: aligns course_blocks.end_date and (if blk.activity_id given) activities.schedule.startDate/endDate
 *  so frontend-Kalender (liest activities.schedule) und Block-Detail (liest course_blocks) konsistent bleiben. */
async function syncBlockSessionsViaUpsert(sb: any, blk: any): Promise<{ ok: boolean; error?: string; count: number }> {
  const sessions = buildSessionsForBlock(blk)
  if (!sessions.length) return { ok: true, count: 0 }
  const { error: upsertErr } = await sb.from('block_sessions')
    .upsert(sessions, { onConflict: 'block_id,session_number' })
  if (upsertErr) {
    console.error('[BlockSessionsSync] Upsert failed for block', blk.id, ':', upsertErr.message)
    return { ok: false, error: upsertErr.message, count: 0 }
  }
  const { error: pruneErr } = await sb.from('block_sessions')
    .delete()
    .eq('block_id', blk.id)
    .gt('session_number', sessions.length)
  if (pruneErr) console.warn('[BlockSessionsSync] Prune failed (likely FK refs from credits/makeups):', pruneErr.message)
  const firstDate = sessions[0].date
  const lastDate = sessions[sessions.length - 1].date
  const { error: blockErr } = await sb.from('course_blocks').update({ end_date: lastDate, updated_at: new Date().toISOString() }).eq('id', blk.id)
  if (blockErr) console.warn('[BlockSessionsSync] Block end_date update failed:', blockErr.message)

  // Propagate to activities.schedule (Frontend-Kalender liest dort, nicht aus block_sessions)
  let actId = blk.activity_id
  if (!actId) {
    const { data: blkRow } = await sb.from('course_blocks').select('activity_id').eq('id', blk.id).maybeSingle()
    actId = blkRow?.activity_id
  }
  if (actId) {
    const { data: actRow } = await sb.from('activities').select('schedule').eq('id', actId).maybeSingle()
    if (actRow?.schedule) {
      const newSchedule = { ...(actRow.schedule as any), startDate: firstDate, endDate: lastDate }
      const { error: actErr } = await sb.from('activities').update({ schedule: newSchedule, updated_at: new Date().toISOString() }).eq('id', actId)
      if (actErr) console.warn('[BlockSessionsSync] Activity schedule update failed:', actErr.message)
      else console.log('[BlockSessionsSync] Activity', actId, 'schedule synced to', firstDate, '→', lastDate)
    }
  }
  return { ok: true, count: sessions.length }
}

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
          makeup_capacity: (parsed.data as any).makeupCapacity != null ? (parsed.data as any).makeupCapacity : 2,
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
      'waitlistEnabled', 'trialEnabled', 'tags', 'makeupCapacity',
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
    // Snapshot original activity for diff (sendCourseUpdate)
    const originalActivity: any = await ActivityService.getById(req.params.id)
    const activity = await ActivityService.update(req.params.id, allowed, auth.providerId)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')

    // Resume-detection (paused → active/published): used für Auto-Shift bei vergangenem start_date
    const _oldStatus = originalActivity?.status
    const _newStatus = (allowed as any).status
    const isResumeTransition = _oldStatus === 'paused' && (_newStatus === 'active' || _newStatus === 'published')
    const _today = new Date().toISOString().slice(0, 10)

    // Sync linked course_block fields (capacity / day / time / price / duration / sessions)
    try {
      const sb = getServiceClient()
      const body = req.body as any
      const updateForBlock: Record<string, any> = {}
      if (body.capacity != null) updateForBlock.capacity = body.capacity
      if (body.makeupCapacity != null) updateForBlock.makeup_capacity = body.makeupCapacity
      const newPkg = body.pricing && body.pricing[0] && body.pricing[0].packageSize
      if (body.pricing && body.pricing[0] && body.pricing[0].amount != null) updateForBlock.price_per_block = body.pricing[0].amount
      if (newPkg && newPkg > 0) updateForBlock.total_sessions = newPkg
      let scheduleChanged = false
      if (body.schedule && body.schedule.slots && body.schedule.slots[0]) {
        const slot0 = body.schedule.slots[0]
        if (slot0.day) { updateForBlock.recurring_day = slot0.day; scheduleChanged = true }
        if (slot0.startTime) { updateForBlock.recurring_time = slot0.startTime; scheduleChanged = true }
        if (slot0.startTime && slot0.endTime) {
          const [sh, sm] = String(slot0.startTime).split(':').map(Number)
          const [eh, em] = String(slot0.endTime).split(':').map(Number)
          updateForBlock.duration_minutes = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))
        }
      }
      if (body.schedule && body.schedule.startDate) { updateForBlock.start_date = body.schedule.startDate; scheduleChanged = true }
      if (body.schedule && body.schedule.endDate) updateForBlock.end_date = body.schedule.endDate

      if (Object.keys(updateForBlock).length > 0) {
        await sb.from('course_blocks').update(updateForBlock)
          .eq('activity_id', req.params.id)
          .in('status', ['active', 'upcoming'])
        console.log('[ActivityPUT] Synced block fields:', Object.keys(updateForBlock).join(','), 'for activity', req.params.id)
      }

      // Regenerate block_sessions ONLY if schedule/sessions changed AND no
      // enrollments exist on this block (safety: never silently shift booked sessions).
      const { data: blocks } = await sb.from('course_blocks')
        .select('id, activity_id, capacity, total_sessions, start_date, recurring_day, recurring_time, duration_minutes')
        .eq('activity_id', req.params.id).in('status', ['active', 'upcoming'])
      for (const blk of (blocks || [])) {
        const { count: enrollCount } = await sb.from('block_enrollments')
          .select('*', { count: 'exact', head: true })
          .eq('block_id', blk.id).eq('status', 'active')
        if ((enrollCount ?? 0) > 0) {
          console.log('[ActivityPUT] Block', blk.id, 'has', enrollCount, 'active enrollments — keeping existing sessions.')
          continue
        }
        // Auto-Shift on Resume: wenn Activity wieder-aktiviert wird und Block-Start in Vergangenheit liegt,
        // verschiebe auf nächsten passenden Wochentag (≥heute). Macht den "wieder aktivieren"-Switch sinnvoll.
        if (isResumeTransition && blk.start_date && blk.start_date < _today && blk.recurring_day) {
          const newStart = shiftBlockStartDate(blk.start_date, blk.recurring_day, _today)
          if (newStart && newStart !== blk.start_date) {
            blk.start_date = newStart
            scheduleChanged = true
            const { error: shiftErr } = await sb.from('course_blocks')
              .update({ start_date: newStart, updated_at: new Date().toISOString() })
              .eq('id', blk.id)
            if (shiftErr) console.warn('[ActivityPUT/Resume] start_date update failed:', shiftErr.message)
            else console.log('[ActivityPUT/Resume] Shifted block', blk.id, 'start_date to', newStart, '(', blk.recurring_day, ')')
          }
        }
        if (!scheduleChanged && (newPkg == null || newPkg === blk.total_sessions)) continue
        // Sync via UPSERT (Bug-Fix 2026-04-30: ersetzt fragile DELETE+INSERT, verhindert Duplikate
        // bei FK-Refs auf block_sessions). UNIQUE INDEX (block_id, session_number) macht Duplikate
        // auf DB-Ebene unmöglich.
        const syncResult = await syncBlockSessionsViaUpsert(sb, blk)
        if (syncResult.ok) console.log('[ActivityPUT] Upserted', syncResult.count, 'sessions for block', blk.id)
        else console.warn('[ActivityPUT] Session sync failed for block', blk.id, ':', syncResult.error)
      }
    } catch (syncErr: any) {
      console.error('[ActivityPUT] Block sync failed (non-fatal):', syncErr.message || syncErr)
    }


    // Status transition notifications (pause/resume) — separate from generic update
    try {
      if (req.body?.notifyParents !== false && originalActivity && (req.body as any)?.status && (req.body as any).status !== originalActivity.status) {
        const oldStatus = originalActivity.status
        const newStatus = (req.body as any).status
        const wasActive = oldStatus === 'active' || oldStatus === 'published' || oldStatus === 'in_planning'
        const willBeActive = newStatus === 'active' || newStatus === 'published'
        const isPause = wasActive && newStatus === 'paused'
        const isResume = oldStatus === 'paused' && willBeActive
        if (isPause || isResume) {
          const sb3 = getServiceClient()
          const { data: blocksST } = await sb3.from('course_blocks').select('id').eq('activity_id', req.params.id).in('status', ['active', 'upcoming'])
          const blockIdsST = (blocksST || []).map((b: any) => b.id)
          if (blockIdsST.length > 0) {
            const { data: enrollmentsST } = await sb3.from('block_enrollments')
              .select('parent_id, child_name')
              .in('block_id', blockIdsST)
              .eq('status', 'active')
            const byParentST = new Map<string, { childNames: Set<string> }>()
            for (const e of (enrollmentsST || [])) {
              if (!e.parent_id) continue
              const entry = byParentST.get(e.parent_id) || { childNames: new Set<string>() }
              if (e.child_name) entry.childNames.add(e.child_name)
              byParentST.set(e.parent_id, entry)
            }
            if (byParentST.size > 0) {
              const parentIdsST = Array.from(byParentST.keys())
              const { data: parentsST } = await sb3.from('parents').select('id, name, email').in('id', parentIdsST)
              const { data: providerST } = await sb3.from('providers').select('display_name, company_name, logo_url, email, website_url').eq('id', auth.providerId).single()
              const providerNameST = providerST?.display_name || providerST?.company_name || 'Dein Anbieter'
              const brandingST = {
                name: providerNameST || undefined,
                logoUrl: (providerST as any)?.logo_url || undefined,
                replyToEmail: (providerST as any)?.email || undefined,
                websiteUrl: (providerST as any)?.website_url || undefined,
              }
              const { EmailService } = await import('../../lib/email')
              const courseTitle = (activity as any)?.title || 'Kurs'
              for (const p of (parentsST || [])) {
                const entry = byParentST.get(p.id)
                if (!entry || !p.email) continue
                const childName = Array.from(entry.childNames).join(' & ') || 'dein Kind'
                try {
                  if (isPause) {
                    await EmailService.sendCoursePause(p.email, {
                      parentName: p.name || '',
                      childName, courseName: courseTitle, providerName: providerNameST,
                      note: (req.body as any)?.pauseNote,
                      branding: brandingST,
                    })
                  } else {
                    await EmailService.sendCourseResume(p.email, {
                      parentName: p.name || '',
                      childName, courseName: courseTitle, providerName: providerNameST,
                      branding: brandingST,
                    })
                  }
                } catch (mailErr: any) {
                  console.error('[ActivityPUT] Pause/Resume email failed for', p.email, mailErr.message)
                }
              }
              console.log('[ActivityPUT] Sent', byParentST.size, (isPause ? 'pause' : 'resume'), 'emails for activity', req.params.id)
            }
          }
        }
      }
    } catch (statusErr: any) {
      console.error('[ActivityPUT] Pause/Resume notification failed (non-fatal):', statusErr.message || statusErr)
    }

    // Notify enrolled parents about the change (best-effort, non-blocking)
    try {
      const sb2 = getServiceClient()
      const orig = originalActivity || {}
      const next = activity as any
      const changes: Array<{ label: string; oldValue: string; newValue: string }> = []

      const fmtTime = (t: string | undefined) => t ? String(t).slice(0, 5) : ''
      const fmtMoney = (v: any) => v != null ? `${v} EUR` : '—'
      const dayMap: Record<string, string> = { MO: 'Montag', TU: 'Dienstag', WE: 'Mittwoch', TH: 'Donnerstag', FR: 'Freitag', SA: 'Samstag', SU: 'Sonntag' }

      if (orig.title !== next.title && next.title != null) {
        changes.push({ label: 'Titel', oldValue: String(orig.title || ''), newValue: String(next.title) })
      }
      const oSlot = (orig.schedule?.slots || [])[0] || {}
      const nSlot = (next.schedule?.slots || [])[0] || {}
      if (oSlot.day !== nSlot.day && nSlot.day) {
        changes.push({ label: 'Tag', oldValue: dayMap[oSlot.day] || oSlot.day || '—', newValue: dayMap[nSlot.day] || nSlot.day })
      }
      const oTime = `${fmtTime(oSlot.startTime)}${oSlot.endTime ? '-' + fmtTime(oSlot.endTime) : ''}`
      const nTime = `${fmtTime(nSlot.startTime)}${nSlot.endTime ? '-' + fmtTime(nSlot.endTime) : ''}`
      if (oTime !== nTime && nTime !== '-') {
        changes.push({ label: 'Uhrzeit', oldValue: oTime || '—', newValue: nTime })
      }
      const fmtD = (s: string | undefined | null) => {
        if (!s) return ''
        const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (!m) return String(s)
        const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
        return parseInt(m[3], 10) + '. ' + months[parseInt(m[2], 10) - 1] + ' ' + m[1]
      }
      if (orig.schedule?.startDate !== next.schedule?.startDate && next.schedule?.startDate) {
        changes.push({ label: 'Start', oldValue: fmtD(orig.schedule?.startDate) || '—', newValue: fmtD(next.schedule.startDate) })
      }
      if (orig.schedule?.endDate !== next.schedule?.endDate && next.schedule?.endDate) {
        changes.push({ label: 'Ende', oldValue: fmtD(orig.schedule?.endDate) || 'offen', newValue: fmtD(next.schedule.endDate) })
      }
      if (orig.capacity !== next.capacity && next.capacity != null) {
        changes.push({ label: 'Plaetze', oldValue: String(orig.capacity ?? '?'), newValue: String(next.capacity) })
      }
      const oPrice = orig.pricing?.[0]?.amount
      const nPrice = next.pricing?.[0]?.amount
      if (oPrice !== nPrice && nPrice != null) {
        changes.push({ label: 'Preis', oldValue: fmtMoney(oPrice), newValue: fmtMoney(nPrice) })
      }

      if (changes.length > 0) {
        // Find every parent enrolled in any active block of this activity
        const { data: blocks2 } = await sb2.from('course_blocks').select('id').eq('activity_id', req.params.id).in('status', ['active', 'upcoming'])
        const blockIds = (blocks2 || []).map((b: any) => b.id)
        if (blockIds.length > 0) {
          const { data: enrollments } = await sb2.from('block_enrollments')
            .select('parent_id, child_name')
            .in('block_id', blockIds)
            .eq('status', 'active')
          const byParent = new Map<string, { childNames: Set<string> }>()
          for (const e of (enrollments || [])) {
            if (!e.parent_id) continue
            const entry = byParent.get(e.parent_id) || { childNames: new Set<string>() }
            if (e.child_name) entry.childNames.add(e.child_name)
            byParent.set(e.parent_id, entry)
          }
          if (byParent.size > 0) {
            const parentIds = Array.from(byParent.keys())
            const { data: parents2 } = await sb2.from('parents').select('id, name, email').in('id', parentIds)
            const { data: provider2 } = await sb2.from('providers').select('display_name, company_name, logo_url, email, website_url').eq('id', auth.providerId).single()
            const providerName = provider2?.display_name || provider2?.company_name || 'Dein Anbieter'
            const branding2 = {
              name: providerName || undefined,
              logoUrl: (provider2 as any)?.logo_url || undefined,
              replyToEmail: (provider2 as any)?.email || undefined,
              websiteUrl: (provider2 as any)?.website_url || undefined,
            }
            const { EmailService } = await import('../../lib/email')
            for (const p of (parents2 || [])) {
              const entry = byParent.get(p.id)
              if (!entry || !p.email) continue
              const childName = Array.from(entry.childNames).join(' & ') || 'dein Kind'
              try {
                await EmailService.sendCourseUpdate(p.email, {
                  parentName: p.name || '',
                  childName,
                  courseName: next.title || 'Kurs',
                  providerName,
                  changes,
                  branding: branding2,
                })
              } catch (mailErr: any) {
                console.error('[ActivityPUT] sendCourseUpdate failed for', p.email, mailErr.message)
              }
            }
            console.log('[ActivityPUT] Sent', byParent.size, 'update emails for activity', req.params.id, 'with', changes.length, 'changes')
          }
        }
      }
    } catch (notifyErr: any) {
      console.error('[ActivityPUT] Update notification failed (non-fatal):', notifyErr.message || notifyErr)
    }


    res.json({ data: activity })
  })

  router.post('/api/activities/:id/publish', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Capture original BEFORE publish to detect transition for notifications
    const orig: any = await ActivityService.getById(req.params.id)
    const result = await ActivityService.publish(req.params.id, auth.providerId)
    if (!result) return res.error(400, 'Aktivität konnte nicht veröffentlicht werden')
    if ('error' in result) return res.error(400, result.error)

    // Pause/Resume notification on status transition
    try {
      const wasPaused = orig?.status === 'paused'
      const newSt = (result as any)?.status
      const isNowActive = newSt === 'active' || newSt === 'published'
      const notifyParents = (req.body as any)?.notifyParents !== false

      // Auto-Shift on Resume: vergangene Block-Start-Daten auf nächsten passenden Wochentag verschieben
      // (NUR bei Blöcken ohne aktive Enrollments — sonst würden gebuchte Termine still verschoben werden).
      if (wasPaused && isNowActive) {
        const sbShift = getServiceClient()
        const todayShift = new Date().toISOString().slice(0, 10)
        const { data: blocksShift } = await sbShift.from('course_blocks')
          .select('id, activity_id, total_sessions, start_date, recurring_day, recurring_time, duration_minutes, status')
          .eq('activity_id', req.params.id).in('status', ['active', 'upcoming'])
        for (const blk of (blocksShift || [])) {
          if (!blk.start_date || blk.start_date >= todayShift || !blk.recurring_day) continue
          const { count: enrollC } = await sbShift.from('block_enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('block_id', blk.id).eq('status', 'active')
          if ((enrollC ?? 0) > 0) {
            console.log('[ActivityPublish/Resume] Block', blk.id, 'has active enrollments — keeping dates.')
            continue
          }
          const newStart = shiftBlockStartDate(blk.start_date, blk.recurring_day, todayShift)
          if (!newStart || newStart === blk.start_date) continue
          blk.start_date = newStart
          const { error: shiftErr } = await sbShift.from('course_blocks')
            .update({ start_date: newStart, updated_at: new Date().toISOString() })
            .eq('id', blk.id)
          if (shiftErr) { console.warn('[ActivityPublish/Resume] start_date update failed:', shiftErr.message); continue }
          console.log('[ActivityPublish/Resume] Shifted block', blk.id, 'to', newStart, '(', blk.recurring_day, ')')
          const syncR = await syncBlockSessionsViaUpsert(sbShift, blk)
          if (syncR.ok) console.log('[ActivityPublish/Resume] Upserted', syncR.count, 'sessions for block', blk.id)
          else console.warn('[ActivityPublish/Resume] Session sync failed:', syncR.error)
        }
      }

      if (wasPaused && isNowActive && notifyParents) {
        const sb = getServiceClient()
        const { data: blocks2 } = await sb.from('course_blocks').select('id').eq('activity_id', req.params.id).in('status', ['active', 'upcoming'])
        const blockIds = (blocks2 || []).map((b: any) => b.id)
        if (blockIds.length > 0) {
          const { data: enrollments } = await sb.from('block_enrollments')
            .select('parent_id, child_name')
            .in('block_id', blockIds)
            .eq('status', 'active')
          const byParent = new Map<string, { childNames: Set<string> }>()
          for (const e of (enrollments || [])) {
            if (!e.parent_id) continue
            const entry = byParent.get(e.parent_id) || { childNames: new Set<string>() }
            if (e.child_name) entry.childNames.add(e.child_name)
            byParent.set(e.parent_id, entry)
          }
          if (byParent.size > 0) {
            const parentIds = Array.from(byParent.keys())
            const { data: parents2 } = await sb.from('parents').select('id, name, email').in('id', parentIds)
            const { data: provider2 } = await sb.from('providers').select('display_name, company_name, logo_url, email, website_url').eq('id', auth.providerId).single()
            const providerName = provider2?.display_name || provider2?.company_name || 'Dein Anbieter'
            const branding3 = {
              name: providerName || undefined,
              logoUrl: (provider2 as any)?.logo_url || undefined,
              replyToEmail: (provider2 as any)?.email || undefined,
              websiteUrl: (provider2 as any)?.website_url || undefined,
            }
            const { EmailService } = await import('../../lib/email')
            const courseTitle = (result as any)?.title || 'Kurs'
            for (const p of (parents2 || [])) {
              const entry = byParent.get(p.id)
              if (!entry || !p.email) continue
              const childName = Array.from(entry.childNames).join(' & ') || 'dein Kind'
              try {
                await EmailService.sendCourseResume(p.email, {
                  parentName: p.name || '', childName,
                  courseName: courseTitle, providerName,
                  branding: branding3,
                })
              } catch (mailErr: any) { console.error('[ActivityPublish] Resume email failed for', p.email, mailErr.message) }
            }
            console.log('[ActivityPublish] Sent', byParent.size, 'resume emails for activity', req.params.id)
          }
        }
      }
    } catch (notifyErr: any) {
      console.error('[ActivityPublish] Resume notification failed (non-fatal):', notifyErr.message || notifyErr)
    }

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
