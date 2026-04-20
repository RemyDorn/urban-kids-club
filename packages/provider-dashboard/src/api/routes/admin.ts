// ============================================================
// Admin Endpoints & Background Jobs
// ============================================================

import { Router } from '../router'
import { getServiceClient } from '../../lib/supabase'
import { BackgroundJobs } from '../../services/workflows'
import { requireAdmin } from './helpers'
import { logger } from '../../lib/logger'

// ============================================================
// Extracted job functions (callable directly, no HTTP round-trip)
// ============================================================

/** Expire stale waitlist offers and offer to next person (Supabase mode) */
export async function runExpireWaitlistJob(): Promise<{ expired: number; offered: number }> {
  const db = getServiceClient()
  const now = new Date().toISOString()

  const { data: expired } = await db.from('waitlist_entries')
    .select('id, activity_id, parent_id, child_info, confirm_token')
    .eq('status', 'offered')
    .lt('expires_at', now)

  let expiredCount = 0, offeredCount = 0

  const expiredIds = (expired ?? []).map(e => e.id)
  if (expiredIds.length) {
    await db.from('waitlist_entries').update({ status: 'expired' }).in('id', expiredIds)
    expiredCount = expiredIds.length
  }

  const expiredActivityIds = [...new Set((expired ?? []).map(e => e.activity_id))]

  if (expiredActivityIds.length > 0) {
    const { data: activityDetails } = await db.from('activities')
      .select('id, title, provider_id').in('id', expiredActivityIds)
    const activityMap = new Map((activityDetails ?? []).map((a: any) => [a.id, a]))

    const expProviderIds = [...new Set((activityDetails ?? []).map((a: any) => a.provider_id))]
    const { data: expProviderDetails } = await db.from('providers')
      .select('id, company_name').in('id', expProviderIds)
    const expProviderMap = new Map((expProviderDetails ?? []).map((p: any) => [p.id, p]))

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
          logger.info('AutoOffer', 'Offered to next person', { email: parent.email, course: activity?.title })
        }
      } catch (emailErr) {
        logger.error('AutoOffer', 'Email failed', { error: String(emailErr) })
      }
    }
  }
  return { expired: expiredCount, offered: offeredCount }
}

/** Send course reminders for tomorrow's sessions (Supabase mode) */
export async function runSendRemindersJob(): Promise<{ sent: number; date: string; activities: number }> {
  const db = getServiceClient()
  const nowDE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const tomorrow = new Date(nowDE)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0')
  const tomorrowDow = tomorrow.getDay()
  const dowMap: Record<number, string> = { 0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' }
  const tomorrowCode = dowMap[tomorrowDow]

  let sent = 0

  const { data: activities } = await db.from('activities')
    .select('id, title, provider_id, schedule')
    .eq('status', 'published')

  const tomorrowActivities: Array<{ id: string; title: string; providerId: string; time: string }> = []
  for (const a of activities ?? []) {
    const sched = a.schedule as any
    const slots = Array.isArray(sched) ? sched : (sched?.slots ?? [])
    const matchSlot = slots.find((s: any) => s.day?.toUpperCase() === tomorrowCode)
    if (matchSlot) {
      if (sched?.startDate && tomorrowStr < sched.startDate) continue
      if (sched?.endDate && tomorrowStr > sched.endDate) continue
      tomorrowActivities.push({ id: a.id, title: a.title, providerId: a.provider_id, time: matchSlot.startTime || '' })
    }
  }

  if (tomorrowActivities.length === 0) {
    return { sent: 0, date: tomorrowStr, activities: 0 }
  }

  const { EmailService } = await import('../../lib/email')
  const tomorrowFormatted = tomorrow.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })

  const providerIds = [...new Set(tomorrowActivities.map(a => a.providerId))]
  const { data: providerRows } = await db.from('providers').select('id, company_name, address_street, address_city, reminder_emails_enabled').in('id', providerIds)
  const providerMap = new Map((providerRows ?? []).map((p: any) => [p.id, p]))

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

  const { data: allEnrollments } = allBlockIds.length
    ? await db.from('block_enrollments').select('block_id, parent_id, child_name').in('block_id', allBlockIds).eq('status', 'active')
    : { data: [] as any[] }

  const { data: allBookings } = await db.from('provider_bookings')
    .select('activity_id, parent_id, child_info')
    .in('activity_id', allActivityIds)
    .in('status', ['confirmed', 'pending'])

  const parentChildByActivity = new Map<string, Map<string, string>>()
  const allParentIds = new Set<string>()

  for (const act of tomorrowActivities) {
    const pcMap = new Map<string, string>()
    parentChildByActivity.set(act.id, pcMap)

    const actBlockIds = blocksByActivity.get(act.id) ?? []
    for (const e of allEnrollments ?? []) {
      if (actBlockIds.includes(e.block_id) && !pcMap.has(e.parent_id)) {
        pcMap.set(e.parent_id, e.child_name || 'Ihr Kind')
        allParentIds.add(e.parent_id)
      }
    }

    for (const b of allBookings ?? []) {
      if (b.activity_id === act.id && !pcMap.has(b.parent_id)) {
        const ci = b.child_info as any
        pcMap.set(b.parent_id, ci?.firstName ? `${ci.firstName} ${ci.lastName || ''}`.trim() : 'Ihr Kind')
        allParentIds.add(b.parent_id)
      }
    }
  }

  const { data: allParents } = allParentIds.size
    ? await db.from('parents').select('id, name, email').in('id', [...allParentIds])
    : { data: [] as any[] }
  const parentMap = new Map((allParents ?? []).map((p: any) => [p.id, p]))

  const sentEmails = new Set<string>()
  for (const act of tomorrowActivities) {
    const provider = providerMap.get(act.providerId) as any
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
      } catch (emailErr) { logger.error('Reminder', 'Email failed', { error: String(emailErr) }) }
    }
  }

  logger.info('Reminder', `Sent ${sent} course reminders for ${tomorrowStr}`)
  return { sent, date: tomorrowStr, activities: tomorrowActivities.length }
}

/** Process trial follow-up emails (Supabase mode) */
export async function runTrialFollowupsJob(): Promise<{ providersProcessed: number; totalFeedbackSent: number; totalReminderSent: number; totalLastChanceSent: number }> {
  return await BackgroundJobs.processTrialFollowups()
}

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
  router.post('/api/admin/jobs/expire-waitlist', async (req, res) => {
    const admin = await requireAdmin(req, res); if (!admin) return
    const result = await runExpireWaitlistJob()
    res.json({ data: result })
  })

  // Send course reminders for tomorrow's sessions
  router.post('/api/admin/jobs/send-reminders', async (req, res) => {
    const admin = await requireAdmin(req, res); if (!admin) return
    const result = await runSendRemindersJob()
    res.json({ data: result })
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
      console.error('[Admin] Provider creation failed:', provError.message)
      return res.error(500, 'Aktion fehlgeschlagen')
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
    const admin = await requireAdmin(req, res); if (!admin) return
    try {
      const result = await runTrialFollowupsJob()
      res.json({ data: result })
    } catch (e: any) {
      res.status(500).json({ error: e.message ?? 'Interner Fehler' })
    }
  })
}
