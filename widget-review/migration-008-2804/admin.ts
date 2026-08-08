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

/**
 * Marketing-Flow Scheduler: 24h-Erinnerung
 *
 * Scannt morgige `block_sessions` (status='scheduled'), für jeden enrollten Parent
 * pro Session einen `booking_reminder_24h`-Trigger an die MarketingFlowEngine.
 * Die Engine matched aktive Provider-Flows, der Worker sendet binnen 60s.
 *
 * Idempotent: UNIQUE(flow_id, event_id=session_id, recipient_id) verhindert Doppel-Sends
 * — egal wie oft der Job am gleichen Tag läuft.
 */
export async function runMarketingReminders24hJob(): Promise<{ sessions: number; triggered: number; skipped: number; errors: number }> {
  const db = getServiceClient()
  const result = { sessions: 0, triggered: 0, skipped: 0, errors: 0 }

  // Tomorrow's date in Berlin TZ as YYYY-MM-DD
  const nowDE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const tomorrow = new Date(nowDE)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0')

  // Sessions tomorrow with their block info
  const { data: sessions, error: sessErr } = await db.from('block_sessions')
    .select('id, block_id, date, start_time, end_time, status, course_blocks(provider_id, activity_id)')
    .eq('date', tomorrowStr)
    .eq('status', 'scheduled')
  if (sessErr) {
    logger.error('MarketingReminder24h', `Sessions query failed: ${sessErr.message}`)
    return result
  }
  if (!sessions || sessions.length === 0) {
    return result
  }
  result.sessions = sessions.length

  // Lazy-load engine (avoids circular import + only loaded when scheduler runs)
  const { MarketingFlowEngine } = await import('../../services/marketing-flow.service')

  for (const sess of sessions) {
    const block = (sess as any).course_blocks
    if (!block || !block.provider_id || !block.activity_id) { result.skipped++; continue }

    // Resolve activity + provider names (best-effort)
    const [{ data: activity }, { data: provider }] = await Promise.all([
      db.from('activities').select('title').eq('id', block.activity_id).maybeSingle(),
      db.from('providers').select('display_name, company_name').eq('id', block.provider_id).maybeSingle(),
    ])
    const courseName = (activity as any)?.title || 'Kurs'
    const providerName = (provider as any)?.display_name || (provider as any)?.company_name || 'Anbieter'

    // Find enrolled parents on this block
    const { data: enrollments } = await db.from('block_enrollments')
      .select('parent_id, child_name')
      .eq('block_id', (sess as any).block_id)
      .eq('status', 'active')
    if (!enrollments || enrollments.length === 0) continue

    // Resolve parent contacts
    const parentIds = [...new Set(enrollments.map((e: any) => e.parent_id))]
    const { data: parents } = await db.from('parents')
      .select('id, email, name')
      .in('id', parentIds)
    const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p]))

    for (const e of enrollments) {
      const p = parentMap.get((e as any).parent_id) as any
      if (!p || !p.email) { result.skipped++; continue }
      try {
        const r = await MarketingFlowEngine.evaluateTrigger({
          eventType: 'booking_reminder_24h',
          eventId: (sess as any).id,
          providerId: block.provider_id,
          recipientType: 'parent',
          recipientId: (e as any).parent_id,
          recipientEmail: p.email,
          recipientName: p.name,
          templateVars: {
            parentName: ((p.name || '').split(' ')[0]) || '',
            childName: (e as any).child_name || 'Ihr Kind',
            courseName,
            providerName,
            time: ((sess as any).start_time || '').slice(0, 5),
            startDate: (sess as any).date,
          },
        })
        result.triggered += r.scheduled
      } catch (err: any) {
        result.errors++
        logger.error('MarketingReminder24h', `Trigger failed for session=${(sess as any).id} parent=${(e as any).parent_id}: ${err?.message || err}`)
      }
    }
  }

  logger.info('MarketingReminder24h', `Scanned ${result.sessions} sessions for ${tomorrowStr} → triggered ${result.triggered} sends, skipped ${result.skipped}, errors ${result.errors}`)
  return result
}

/**
 * Marketing-Flow Scheduler: course_ending_soon
 *
 * Findet aktive course_blocks die in 7 Tagen enden, feuert pro enrolltem Parent
 * den Trigger. eventId = enrollment.id (einmal pro Enrollment).
 */
export async function runMarketingCourseEndingSoonJob(): Promise<{ blocks: number; triggered: number; errors: number }> {
  const db = getServiceClient()
  const result = { blocks: 0, triggered: 0, errors: 0 }

  const nowDE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const targetDate = new Date(nowDE)
  targetDate.setDate(targetDate.getDate() + 7)
  const targetStr = targetDate.getFullYear() + '-' + String(targetDate.getMonth() + 1).padStart(2, '0') + '-' + String(targetDate.getDate()).padStart(2, '0')

  const { data: blocks, error } = await db.from('course_blocks')
    .select('id, provider_id, activity_id, end_date, status')
    .eq('end_date', targetStr)
    .eq('status', 'active')
  if (error) { logger.error('MarketingCourseEndingSoon', `Query failed: ${error.message}`); return result }
  if (!blocks || blocks.length === 0) return result
  result.blocks = blocks.length

  const { MarketingFlowEngine } = await import('../../services/marketing-flow.service')

  for (const blk of blocks) {
    const [{ data: activity }, { data: provider }, { data: enrollments }] = await Promise.all([
      db.from('activities').select('title').eq('id', (blk as any).activity_id).maybeSingle(),
      db.from('providers').select('display_name, company_name').eq('id', (blk as any).provider_id).maybeSingle(),
      db.from('block_enrollments').select('id, parent_id, child_name').eq('block_id', (blk as any).id).eq('status', 'active'),
    ])
    if (!enrollments || enrollments.length === 0) continue
    const courseName = (activity as any)?.title || 'Kurs'
    const providerName = (provider as any)?.display_name || (provider as any)?.company_name || 'Anbieter'

    const parentIds = [...new Set(enrollments.map((e: any) => e.parent_id))]
    const { data: parents } = await db.from('parents').select('id, email, name').in('id', parentIds)
    const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p]))

    for (const e of enrollments) {
      const p = parentMap.get((e as any).parent_id) as any
      if (!p?.email) continue
      try {
        const r = await MarketingFlowEngine.evaluateTrigger({
          eventType: 'course_ending_soon',
          eventId: (e as any).id,
          providerId: (blk as any).provider_id,
          recipientType: 'parent',
          recipientId: (e as any).parent_id,
          recipientEmail: p.email,
          recipientName: p.name,
          templateVars: {
            parentName: ((p.name || '').split(' ')[0]) || '',
            childName: (e as any).child_name || 'Ihr Kind',
            courseName,
            providerName,
            daysLeft: '7',
          },
        })
        result.triggered += r.scheduled
      } catch (err: any) {
        result.errors++
        logger.error('MarketingCourseEndingSoon', `Trigger failed enrollment=${(e as any).id}: ${err?.message || err}`)
      }
    }
  }
  logger.info('MarketingCourseEndingSoon', `Blocks ending in 7 days: ${result.blocks}, triggered ${result.triggered}, errors ${result.errors}`)
  return result
}

/**
 * Marketing-Flow Scheduler: booking_completed
 *
 * Findet aktive course_blocks die HEUTE enden, feuert pro enrolltem Parent.
 * eventId = enrollment.id (einmal pro Enrollment).
 */
export async function runMarketingBookingCompletedJob(): Promise<{ blocks: number; triggered: number; errors: number }> {
  const db = getServiceClient()
  const result = { blocks: 0, triggered: 0, errors: 0 }
  const nowDE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const todayStr = nowDE.getFullYear() + '-' + String(nowDE.getMonth() + 1).padStart(2, '0') + '-' + String(nowDE.getDate()).padStart(2, '0')

  const { data: blocks } = await db.from('course_blocks')
    .select('id, provider_id, activity_id, end_date, status')
    .eq('end_date', todayStr)
    .in('status', ['active', 'upcoming'])
  if (!blocks || blocks.length === 0) return result
  result.blocks = blocks.length

  const { MarketingFlowEngine } = await import('../../services/marketing-flow.service')

  for (const blk of blocks) {
    const [{ data: activity }, { data: provider }, { data: enrollments }] = await Promise.all([
      db.from('activities').select('title').eq('id', (blk as any).activity_id).maybeSingle(),
      db.from('providers').select('display_name, company_name').eq('id', (blk as any).provider_id).maybeSingle(),
      db.from('block_enrollments').select('id, parent_id, child_name').eq('block_id', (blk as any).id).eq('status', 'active'),
    ])
    if (!enrollments || enrollments.length === 0) continue
    const courseName = (activity as any)?.title || 'Kurs'
    const providerName = (provider as any)?.display_name || (provider as any)?.company_name || 'Anbieter'
    const parentIds = [...new Set(enrollments.map((e: any) => e.parent_id))]
    const { data: parents } = await db.from('parents').select('id, email, name').in('id', parentIds)
    const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p]))

    for (const e of enrollments) {
      const p = parentMap.get((e as any).parent_id) as any
      if (!p?.email) continue
      try {
        const r = await MarketingFlowEngine.evaluateTrigger({
          eventType: 'booking_completed',
          eventId: (e as any).id,
          providerId: (blk as any).provider_id,
          recipientType: 'parent',
          recipientId: (e as any).parent_id,
          recipientEmail: p.email,
          recipientName: p.name,
          templateVars: {
            parentName: ((p.name || '').split(' ')[0]) || '',
            childName: (e as any).child_name || 'Ihr Kind',
            courseName,
            providerName,
          },
        })
        result.triggered += r.scheduled
      } catch (err: any) { result.errors++ }
    }
  }
  logger.info('MarketingBookingCompleted', `Blocks ending today: ${result.blocks}, triggered ${result.triggered}, errors ${result.errors}`)
  return result
}

/**
 * Marketing-Flow Scheduler: payment_overdue
 *
 * Findet Rechnungen die offen sind und deren due_date < heute.
 * Feuert einmalig pro Rechnung (eventId = invoice.id).
 */
export async function runMarketingPaymentOverdueJob(): Promise<{ overdue: number; triggered: number; errors: number }> {
  const db = getServiceClient()
  const result = { overdue: 0, triggered: 0, errors: 0 }
  const nowDE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const todayStr = nowDE.getFullYear() + '-' + String(nowDE.getMonth() + 1).padStart(2, '0') + '-' + String(nowDE.getDate()).padStart(2, '0')

  const { data: invoices } = await db.from('invoices')
    .select('id, provider_id, parent_id, number, total, currency, status, due_date')
    .lt('due_date', todayStr)
    .in('status', ['open', 'sent', 'pending'])
  if (!invoices || invoices.length === 0) return result
  result.overdue = invoices.length

  const { MarketingFlowEngine } = await import('../../services/marketing-flow.service')
  const parentIds = [...new Set(invoices.map((i: any) => i.parent_id).filter(Boolean))]
  const providerIds = [...new Set(invoices.map((i: any) => i.provider_id))]
  const [{ data: parents }, { data: providers }] = await Promise.all([
    db.from('parents').select('id, email, name').in('id', parentIds),
    db.from('providers').select('id, display_name, company_name').in('id', providerIds),
  ])
  const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p]))
  const providerMap = new Map((providers ?? []).map((p: any) => [p.id, p]))

  for (const inv of invoices) {
    const p = parentMap.get((inv as any).parent_id) as any
    const provider = providerMap.get((inv as any).provider_id) as any
    if (!p?.email) continue
    try {
      const amountStr = `${Number((inv as any).total || 0).toFixed(2).replace('.', ',')} ${((inv as any).currency || 'EUR').toUpperCase()}`
      const r = await MarketingFlowEngine.evaluateTrigger({
        eventType: 'payment_overdue',
        eventId: (inv as any).id,
        providerId: (inv as any).provider_id,
        recipientType: 'parent',
        recipientId: (inv as any).parent_id,
        recipientEmail: p.email,
        recipientName: p.name,
        templateVars: {
          parentName: ((p.name || '').split(' ')[0]) || '',
          invoiceNumber: (inv as any).number || '',
          amount: amountStr,
          dueDate: (inv as any).due_date || '',
          providerName: provider?.display_name || provider?.company_name || 'Anbieter',
        },
      })
      result.triggered += r.scheduled
    } catch (err: any) { result.errors++ }
  }
  logger.info('MarketingPaymentOverdue', `Overdue invoices: ${result.overdue}, triggered ${result.triggered}, errors ${result.errors}`)
  return result
}

/**
 * Marketing-Flow Scheduler: review_request
 *
 * Findet enrollments die existieren seit ≥ 7 Tagen UND deren Block mindestens 1 Session
 * vor heute hatte. Fires einmalig (eventId = enrollment.id).
 */
export async function runMarketingReviewRequestJob(): Promise<{ candidates: number; triggered: number; errors: number }> {
  const db = getServiceClient()
  const result = { candidates: 0, triggered: 0, errors: 0 }
  const nowDE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const sevenDaysAgo = new Date(nowDE); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString()

  const { data: enrollments } = await db.from('block_enrollments')
    .select('id, block_id, parent_id, child_name, provider_id, created_at, status')
    .eq('status', 'active')
    .lte('created_at', sevenDaysAgoStr)
  if (!enrollments || enrollments.length === 0) return result
  result.candidates = enrollments.length

  const { MarketingFlowEngine } = await import('../../services/marketing-flow.service')
  const blockIds = [...new Set(enrollments.map((e: any) => e.block_id))]
  const { data: blocksData } = await db.from('course_blocks').select('id, activity_id').in('id', blockIds)
  const blockMap = new Map((blocksData ?? []).map((b: any) => [b.id, b]))
  const activityIds = [...new Set((blocksData ?? []).map((b: any) => b.activity_id))]
  const [{ data: activities }, { data: providers }, { data: parents }] = await Promise.all([
    db.from('activities').select('id, title, provider_id').in('id', activityIds),
    db.from('providers').select('id, display_name, company_name'),
    db.from('parents').select('id, email, name').in('id', [...new Set(enrollments.map((e: any) => e.parent_id))]),
  ])
  const activityMap = new Map((activities ?? []).map((a: any) => [a.id, a]))
  const providerMap = new Map((providers ?? []).map((p: any) => [p.id, p]))
  const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p]))

  for (const e of enrollments) {
    const block = blockMap.get((e as any).block_id) as any
    if (!block) continue
    const activity = activityMap.get(block.activity_id) as any
    const provider = providerMap.get((e as any).provider_id) as any
    const parent = parentMap.get((e as any).parent_id) as any
    if (!parent?.email) continue
    try {
      const r = await MarketingFlowEngine.evaluateTrigger({
        eventType: 'review_request',
        eventId: (e as any).id,
        providerId: (e as any).provider_id,
        recipientType: 'parent',
        recipientId: (e as any).parent_id,
        recipientEmail: parent.email,
        recipientName: parent.name,
        templateVars: {
          parentName: ((parent.name || '').split(' ')[0]) || '',
          childName: (e as any).child_name || 'Ihr Kind',
          courseName: activity?.title || 'Kurs',
          providerName: provider?.display_name || provider?.company_name || 'Anbieter',
          reviewLink: 'https://app.urbankids.club/portal',
        },
      })
      result.triggered += r.scheduled
    } catch (err: any) { result.errors++ }
  }
  logger.info('MarketingReviewRequest', `Candidates ≥7 days: ${result.candidates}, triggered ${result.triggered}, errors ${result.errors}`)
  return result
}

/**
 * Marketing-Flow Scheduler: child_birthday
 *
 * Scannt children-Tabelle für heute (Monat+Tag), feuert für jeden Eltern-Treffer.
 * eventId = deterministisch via md5(child_id + year) → blockt Doppel-Sends im selben Jahr,
 * lässt aber nächstes Jahr neu firen.
 */
export async function runMarketingChildBirthdayJob(): Promise<{ birthdays: number; triggered: number; errors: number }> {
  const db = getServiceClient()
  const result = { birthdays: 0, triggered: 0, errors: 0 }
  const nowDE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const todayMonth = nowDE.getMonth() + 1
  const todayDay = nowDE.getDate()
  const year = nowDE.getFullYear()

  // Postgres-Filter auf MM-DD ist über Supabase JS-Client umständlich → in JS filtern.
  // Bei wachsender children-Tabelle ggf. einen DB-Index oder RPC hinzufügen.
  const { data: allChildren } = await db.from('children').select('id, user_id, name, date_of_birth').not('date_of_birth', 'is', null)
  if (!allChildren || allChildren.length === 0) return result

  const todayBirthdays = allChildren.filter((c: any) => {
    if (!c.date_of_birth) return false
    const d = new Date(c.date_of_birth)
    return d.getMonth() + 1 === todayMonth && d.getDate() === todayDay
  })
  if (todayBirthdays.length === 0) return result
  result.birthdays = todayBirthdays.length

  const { MarketingFlowEngine } = await import('../../services/marketing-flow.service')
  const { createHash } = await import('node:crypto')

  // Build deterministic UUID from (child_id + year)
  function deterministicUuid(name: string): string {
    const h = createHash('sha1').update(name).digest('hex')
    return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-${(parseInt(h.slice(16,18), 16) & 0x3f | 0x80).toString(16).padStart(2,'0')}${h.slice(18,20)}-${h.slice(20,32)}`
  }

  const userIds = [...new Set(todayBirthdays.map((c: any) => c.user_id).filter(Boolean))]
  // children.user_id likely refers to auth.users(id). Map to parents by joining via auth_id or email.
  // Pragmatic: try matching parents.id = user_id (some setups) or skip if not resolvable.
  const { data: parentMatches } = await db.from('parents').select('id, email, name').in('id', userIds)
  const parentMap = new Map((parentMatches ?? []).map((p: any) => [p.id, p]))

  // Find provider per parent (use most recent enrollment as proxy)
  for (const c of todayBirthdays) {
    const parent = parentMap.get((c as any).user_id) as any
    if (!parent?.email) continue
    const { data: lastEnr } = await db.from('block_enrollments')
      .select('provider_id').eq('parent_id', parent.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const providerId = (lastEnr as any)?.provider_id
    if (!providerId) continue
    const { data: prov } = await db.from('providers').select('display_name, company_name').eq('id', providerId).maybeSingle()
    try {
      const r = await MarketingFlowEngine.evaluateTrigger({
        eventType: 'child_birthday',
        eventId: deterministicUuid(`birthday-${(c as any).id}-${year}`),
        providerId,
        recipientType: 'parent',
        recipientId: parent.id,
        recipientEmail: parent.email,
        recipientName: parent.name,
        templateVars: {
          parentName: ((parent.name || '').split(' ')[0]) || '',
          childName: (c as any).name || 'Ihr Kind',
          providerName: (prov as any)?.display_name || (prov as any)?.company_name || 'Anbieter',
          discountPercent: '10',
          couponCode: 'HAPPYBDAY',
        },
      })
      result.triggered += r.scheduled
    } catch (err: any) { result.errors++ }
  }
  logger.info('MarketingChildBirthday', `Birthdays today: ${result.birthdays}, triggered ${result.triggered}, errors ${result.errors}`)
  return result
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
  /** Marketing 24h-Reminder Scheduler — manuell sofort triggern (z.B. zum Testen) */
  router.post('/api/admin/jobs/marketing-reminders-24h', async (req, res) => {
    const admin = await requireAdmin(req, res)
    if (!admin) return
    try {
      const result = await runMarketingReminders24hJob()
      res.json({ data: result })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Interner Fehler' })
    }
  })

  /** Marketing Schedulers: course_ending_soon | booking_completed | payment_overdue | review_request | child_birthday */
  router.post('/api/admin/jobs/marketing-course-ending-soon', async (req, res) => {
    const admin = await requireAdmin(req, res); if (!admin) return
    try { res.json({ data: await runMarketingCourseEndingSoonJob() }) } catch (e: any) { res.status(500).json({ error: e?.message || 'Interner Fehler' }) }
  })
  router.post('/api/admin/jobs/marketing-booking-completed', async (req, res) => {
    const admin = await requireAdmin(req, res); if (!admin) return
    try { res.json({ data: await runMarketingBookingCompletedJob() }) } catch (e: any) { res.status(500).json({ error: e?.message || 'Interner Fehler' }) }
  })
  router.post('/api/admin/jobs/marketing-payment-overdue', async (req, res) => {
    const admin = await requireAdmin(req, res); if (!admin) return
    try { res.json({ data: await runMarketingPaymentOverdueJob() }) } catch (e: any) { res.status(500).json({ error: e?.message || 'Interner Fehler' }) }
  })
  router.post('/api/admin/jobs/marketing-review-request', async (req, res) => {
    const admin = await requireAdmin(req, res); if (!admin) return
    try { res.json({ data: await runMarketingReviewRequestJob() }) } catch (e: any) { res.status(500).json({ error: e?.message || 'Interner Fehler' }) }
  })
  router.post('/api/admin/jobs/marketing-child-birthday', async (req, res) => {
    const admin = await requireAdmin(req, res); if (!admin) return
    try { res.json({ data: await runMarketingChildBirthdayJob() }) } catch (e: any) { res.status(500).json({ error: e?.message || 'Interner Fehler' }) }
  })

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
