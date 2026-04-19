// ============================================================
// Admin Endpoints & Background Jobs
// ============================================================

import { Router } from '../router'
import { authenticateAdmin } from '../../lib/auth'
import { getServiceClient } from '../../lib/supabase'
import { BackgroundJobs } from '../../services/workflows'
import { requireAdmin } from './helpers'

export function registerAdminRoutes(router: Router) {

  // ============================================================
  // BACKGROUND JOBS (Admin-Trigger)
  // ============================================================

  router.post('/api/admin/jobs/daily', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const result = await BackgroundJobs.runDaily()
    res.json({ data: result })
  })

  router.post('/api/admin/jobs/weekly', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const result = await BackgroundJobs.runWeekly()
    res.json({ data: result })
  })

  // Auto-expire waitlist offers and offer to next person (call via cron/n8n every 15min)
  // Auth: internal calls from server.ts use localhost — validate via shared secret or admin auth
  router.post('/api/admin/jobs/expire-waitlist', async (req, res) => {
    // Allow internal calls (from server setInterval) or admin auth
    // Always require admin auth (no IP bypass — behind reverse proxy IP is unreliable)
    const admin = await authenticateAdmin(req, res); if (!admin) return
    const db = getServiceClient()
    const now = new Date().toISOString()

    // Find all expired offers
    const { data: expired } = await db.from('waitlist_entries')
      .select('id, activity_id, parent_id, child_info, confirm_token')
      .eq('status', 'offered')
      .lt('expires_at', now)

    let expiredCount = 0, offeredCount = 0

    // Batch-update all expired entries in ONE query
    const expiredIds = (expired ?? []).map(e => e.id)
    if (expiredIds.length) {
      await db.from('waitlist_entries').update({ status: 'expired' }).in('id', expiredIds)
      expiredCount = expiredIds.length
    }

    // Get unique activity IDs from expired entries for "offer to next" logic
    const expiredActivityIds = [...new Set((expired ?? []).map(e => e.activity_id))]

    if (expiredActivityIds.length > 0) {
      // Batch-fetch activity details and provider details upfront
      const { data: activityDetails } = await db.from('activities')
        .select('id, title, provider_id').in('id', expiredActivityIds)
      const activityMap = new Map((activityDetails ?? []).map((a: any) => [a.id, a]))

      const expProviderIds = [...new Set((activityDetails ?? []).map((a: any) => a.provider_id))]
      const { data: expProviderDetails } = await db.from('providers')
        .select('id, company_name').in('id', expProviderIds)
      const expProviderMap = new Map((expProviderDetails ?? []).map((p: any) => [p.id, p]))

      // For each expired activity, find and offer to the next waiting person
      const { randomBytes } = await import('node:crypto')
      const { EmailService } = await import('../../lib/email')

      for (const activityId of expiredActivityIds) {
        const { data: nextEntry } = await db.from('waitlist_entries')
          .select('id, parent_id, child_info, activity_id')
          .eq('activity_id', activityId).eq('status', 'waiting')
          .order('position', { ascending: true }).limit(1).maybeSingle()

        if (!nextEntry) continue

        const token = randomBytes(24).toString('hex')
        await db.from('waitlist_entries').update({
          status: 'offered',
          notified_at: now,
          expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
          confirm_token: token,
        }).eq('id', nextEntry.id)

        // Send offer email using pre-fetched data
        try {
          const { data: parent } = await db.from('parents').select('name, email').eq('id', nextEntry.parent_id).single()
          const activity = activityMap.get(nextEntry.activity_id)
          const provider = activity ? expProviderMap.get(activity.provider_id) : null
          if (parent?.email) {
            const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
            const childName = nextEntry.child_info?.firstName ? (nextEntry.child_info.firstName + ' ' + (nextEntry.child_info.lastName || '')) : 'Ihr Kind'
            await EmailService.sendWaitlistOffer(parent.email, {
              parentName: parent.name?.split(' ')[0] || '',
              childName,
              courseName: activity?.title || 'Kurs',
              providerName: provider?.company_name || '',
              confirmLink: origin + '/api/waitlist/' + nextEntry.id + '/confirm?token=' + token,
              declineLink: origin + '/api/waitlist/' + nextEntry.id + '/decline-offer?token=' + token,
            })
            offeredCount++
            console.log('[AutoOffer] Offered to next person: ' + parent.email + ' for ' + activity?.title)
          }
        } catch (emailErr) {
          console.error('[AutoOffer] Email failed:', emailErr)
        }
      }
    }
    res.json({ data: { expired: expiredCount, offered: offeredCount } })
  })

  // Send course reminders for tomorrow's sessions
  router.post('/api/admin/jobs/send-reminders', async (req, res) => {
    // Always require admin auth (no IP bypass — behind reverse proxy IP is unreliable)
    const admin = await authenticateAdmin(req, res); if (!admin) return
    const db = getServiceClient()
    const nowDE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
    const tomorrow = new Date(nowDE)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0')
    const tomorrowDow = tomorrow.getDay()
    const dowMap: Record<number, string> = { 0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' }
    const tomorrowCode = dowMap[tomorrowDow]

    let sent = 0

    // 1. Find all published activities that run tomorrow
    const { data: activities } = await db.from('activities')
      .select('id, title, provider_id, schedule')
      .eq('status', 'published')

    const tomorrowActivities: Array<{ id: string; title: string; providerId: string; time: string }> = []
    for (const a of activities ?? []) {
      const sched = a.schedule as any
      const slots = Array.isArray(sched) ? sched : (sched?.slots ?? [])
      const matchSlot = slots.find((s: any) => s.day?.toUpperCase() === tomorrowCode)
      if (matchSlot) {
        // Check date range
        if (sched?.startDate && tomorrowStr < sched.startDate) continue
        if (sched?.endDate && tomorrowStr > sched.endDate) continue
        tomorrowActivities.push({ id: a.id, title: a.title, providerId: a.provider_id, time: matchSlot.startTime || '' })
      }
    }

    if (tomorrowActivities.length === 0) {
      return res.json({ data: { sent: 0, message: 'Keine Kurse morgen' } })
    }

    // 2. For each activity, find enrolled children (via block_enrollments or bookings)
    const { EmailService } = await import('../../lib/email')
    const tomorrowFormatted = tomorrow.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })

    // Batch-fetch all provider info upfront (including reminder setting)
    const providerIds = [...new Set(tomorrowActivities.map(a => a.providerId))]
    const { data: providerRows } = await db.from('providers').select('id, company_name, address_street, address_city, reminder_emails_enabled').in('id', providerIds)
    const providerMap = new Map((providerRows ?? []).map((p: any) => [p.id, p]))

    // Batch-fetch all blocks for all tomorrow's activities in ONE query
    const allActivityIds = tomorrowActivities.map(a => a.id)

    const { data: allBlocks } = await db.from('course_blocks')
      .select('id, activity_id')
      .in('activity_id', allActivityIds)
      .in('status', ['active', 'upcoming'])
      .lte('start_date', tomorrowStr)
      .gte('end_date', tomorrowStr)
    const blocksByActivity = new Map<string, string[]>()
    for (const b of allBlocks ?? []) {
      if (!blocksByActivity.has(b.activity_id)) blocksByActivity.set(b.activity_id, [])
      blocksByActivity.get(b.activity_id)!.push(b.id)
    }
    const allBlockIds = (allBlocks ?? []).map((b: any) => b.id)

    // Batch-fetch all enrollments for all blocks in ONE query
    const { data: allEnrollments } = allBlockIds.length
      ? await db.from('block_enrollments').select('block_id, parent_id, child_name').in('block_id', allBlockIds).eq('status', 'active')
      : { data: [] as any[] }

    // Batch-fetch all bookings for all activities in ONE query
    const { data: allBookings } = await db.from('provider_bookings')
      .select('activity_id, parent_id, child_info')
      .in('activity_id', allActivityIds)
      .in('status', ['confirmed', 'pending'])

    // Build parentChildMap per activity
    const parentChildByActivity = new Map<string, Map<string, string>>()
    const allParentIds = new Set<string>()

    for (const act of tomorrowActivities) {
      const pcMap = new Map<string, string>()
      parentChildByActivity.set(act.id, pcMap)

      // Match enrollments via blocks
      const actBlockIds = blocksByActivity.get(act.id) ?? []
      for (const e of allEnrollments ?? []) {
        if (actBlockIds.includes(e.block_id) && !pcMap.has(e.parent_id)) {
          pcMap.set(e.parent_id, e.child_name || 'Ihr Kind')
          allParentIds.add(e.parent_id)
        }
      }

      // Match direct bookings
      for (const b of allBookings ?? []) {
        if (b.activity_id === act.id && !pcMap.has(b.parent_id)) {
          const ci = b.child_info as any
          pcMap.set(b.parent_id, ci?.firstName ? `${ci.firstName} ${ci.lastName || ''}`.trim() : 'Ihr Kind')
          allParentIds.add(b.parent_id)
        }
      }
    }

    // Batch-fetch ALL parents in ONE query
    const { data: allParents } = allParentIds.size
      ? await db.from('parents').select('id, name, email').in('id', [...allParentIds])
      : { data: [] as any[] }
    const parentMap = new Map((allParents ?? []).map((p: any) => [p.id, p]))

    // Send emails using pre-fetched data
    const sentEmails = new Set<string>()
    for (const act of tomorrowActivities) {
      const provider = providerMap.get(act.providerId) as any
      // Respect provider setting (default: true — send unless explicitly disabled)
      if (provider?.reminder_emails_enabled === false) continue
      const location = provider?.address_street ? `${provider.address_street}, ${provider.address_city}` : undefined
      const pcMap = parentChildByActivity.get(act.id)
      if (!pcMap || pcMap.size === 0) continue

      for (const [parentId, childName] of pcMap) {
        const parent = parentMap.get(parentId) as any
        if (!parent?.email || sentEmails.has(parent.email + ':' + act.id)) continue
        sentEmails.add(parent.email + ':' + act.id)
        try {
          await EmailService.sendCourseReminder(parent.email, {
            parentName: parent.name,
            childName,
            courseName: act.title,
            providerName: provider?.company_name || '',
            courseDate: tomorrowFormatted,
            courseTime: act.time,
            location,
          })
          sent++
        } catch (emailErr) { console.error('[Reminder] Email failed:', emailErr) }
      }
    }

    console.log(`[Reminder] Sent ${sent} course reminders for ${tomorrowStr}`)
    res.json({ data: { sent, date: tomorrowStr, activities: tomorrowActivities.length } })
  })

  // ============================================================
  // ADMIN ENDPOINTS
  // ============================================================

  router.get('/api/admin/check', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    res.json({ admin: true, email: admin.email })
  })

  router.get('/api/admin/providers', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const db = getServiceClient()
    const { data, error } = await db.from('providers').select('*').order('created_at', { ascending: false })
    if (error) return res.error(500, error.message)
    res.json({ data, count: data!.length })
  })

  router.post('/api/admin/providers/:id/status', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const { status } = req.body as any
    if (!['active', 'suspended', 'onboarding'].includes(status)) {
      return res.error(400, 'Ungültiger Status')
    }
    const db = getServiceClient()
    const { data, error } = await db.from('providers').update({ status, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single()
    if (error) return res.error(500, error.message)
    res.json({ data })
  })

  // Archive provider (soft delete — sets status to 'archived', keeps all data)
  router.post('/api/admin/providers/:id/archive', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const db = getServiceClient()
    const { data, error } = await db.from('providers')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single()
    if (error) return res.error(500, error.message)
    res.json({ data })
  })

  // Create provider (admin creates account directly, skipping self-registration)
  router.post('/api/admin/providers', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const { email, password, displayName, companyName, legalForm, contactName, phone, street, zip, city, status } = req.body as any

    if (!email || !password || !displayName || !companyName || !contactName) {
      return res.error(400, 'Pflichtfelder: E-Mail, Passwort, Anzeigename, Firmenname, Kontaktperson')
    }
    if (password.length < 8) return res.error(400, 'Passwort muss mindestens 8 Zeichen lang sein')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.error(400, 'Ungültige E-Mail-Adresse')

    const db = getServiceClient()

    // Create auth user
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (authError) return res.error(500, authError.message)

    // Create provider
    const slug = (displayName || companyName).toLowerCase()
      .replace(/[äöüß]/g, (c: string) => ({ä:'ae',ö:'oe',ü:'ue',ß:'ss'} as any)[c] ?? c)
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    const { data: provider, error: provError } = await db.from('providers').insert({
      display_name: displayName || '',
      company_name: companyName,
      legal_form: legalForm || '',
      contact_name: contactName,
      email, phone: phone || '',
      address_street: street || '', address_zip: zip || '', address_city: city || '',
      latitude: 0, longitude: 0,
      login_email: email, slug,
      status: status || 'active',
      subscription: 'free',
    }).select().single()

    if (provError) {
      await db.auth.admin.deleteUser(authData.user.id)
      return res.error(500, provError.message)
    }
    // Auto-add owner as team member
    await (db.from('team_members').insert({
      provider_id: provider.id,
      name: contactName,
      email: email,
      phone: phone || '',
      role: 'owner',
      active: true,
      user_id: authData.user.id,
    }) as any).catch(() => {})
    res.json({ data: provider })
  })

  // Delete provider auth user (disable login when archiving)
  router.post('/api/admin/providers/:id/delete-auth', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    const db = getServiceClient()
    // Get provider email
    const { data: provider } = await db.from('providers').select('login_email').eq('id', req.params.id).single()
    if (!provider?.login_email) return res.error(404, 'Provider nicht gefunden')
    // Find auth user by email (paginate through users in small pages)
    let authUser: any = null
    let authPage = 1
    while (!authUser) {
      const { data: { users } } = await db.auth.admin.listUsers({ page: authPage, perPage: 50 })
      if (users.length === 0) break
      authUser = users.find((u: any) => u.email === provider.login_email)
      authPage++
    }
    if (authUser) {
      await db.auth.admin.updateUserById(authUser.id, { ban_duration: '876000h' }) // ban for 100 years
    }
    res.json({ success: true })
  })

  // Process trial follow-up emails (call via cron/setInterval every hour)
  router.post('/api/admin/jobs/process-trial-followups', async (req, res) => {
    const admin = await authenticateAdmin(req, res); if (!admin) return
    try {
      const result = await BackgroundJobs.processTrialFollowups()
      res.json({ data: result })
    } catch (e: any) {
      res.status(500).json({ error: e.message ?? 'Interner Fehler' })
    }
  })
}
