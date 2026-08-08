// ============================================================
// Invitations Routes — Match & invite parents for courses
// ============================================================

import { Router } from '../router'
import { requireAuth, checkPermission } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { EmailService } from '../../lib/email'
import { ProviderService, ActivityService } from '../../services'
import { safeParseInt } from './helpers'

export function registerInvitationRoutes(router: Router) {

  // ============================================================
  // GET /api/providers/:providerId/parents/matching
  // Find parents whose children match age range & category
  // ============================================================

  router.get('/api/providers/:providerId/parents/matching', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'customers', 'view')) return

    const ageMin = safeParseInt(req.query.ageMin, 0)
    const ageMax = safeParseInt(req.query.ageMax, 18)
    const category = req.query.category || ''
    const activityId = req.query.activityId || ''

    const sb = getServiceClient()

    // Step 1: Get all bookings for this provider (parent_id, activity_id, child_info, created_at)
    const { data: bookings } = await sb.from('provider_bookings')
      .select('parent_id, activity_id, child_info, created_at, status')
      .eq('provider_id', auth.providerId)
      .neq('status', 'cancelled')

    if (!bookings || bookings.length === 0) {
      return res.json({ data: [], count: 0 })
    }

    // Step 2: Get all activities for this provider (to check categories)
    const { data: activities } = await sb.from('activities')
      .select('id, category, title')
      .eq('provider_id', auth.providerId)

    const activityMap = new Map<string, { category: string; title: string }>()
    for (const a of activities ?? []) {
      activityMap.set(a.id, { category: a.category, title: a.title })
    }

    // Step 3: Aggregate parent data
    const now = new Date()
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    interface ParentMatch {
      parentId: string
      childNames: string[]
      childAges: number[]
      matchReasons: string[]
      relevanceScore: number
      lastBookingAt: string
      bookingCount: number
      hasCategoryMatch: boolean
      hasAgeMatch: boolean
      isActive: boolean
    }

    const parentMap = new Map<string, ParentMatch>()

    for (const b of bookings) {
      const ci = b.child_info ?? {}
      const childName = ci.firstName
        ? (ci.firstName + ' ' + (ci.lastName || '')).trim()
        : ''
      const birthYear = ci.birthYear as number | undefined
      const childAge = birthYear ? now.getFullYear() - birthYear : undefined

      let match = parentMap.get(b.parent_id)
      if (!match) {
        match = {
          parentId: b.parent_id,
          childNames: [],
          childAges: [],
          matchReasons: [],
          relevanceScore: 0,
          lastBookingAt: b.created_at,
          bookingCount: 0,
          hasCategoryMatch: false,
          hasAgeMatch: false,
          isActive: false,
        }
        parentMap.set(b.parent_id, match)
      }

      match.bookingCount++
      if (b.created_at > match.lastBookingAt) match.lastBookingAt = b.created_at

      // Track child names (deduplicated)
      if (childName && !match.childNames.includes(childName)) {
        match.childNames.push(childName)
      }
      if (childAge !== undefined && !match.childAges.includes(childAge)) {
        match.childAges.push(childAge)
      }

      // Check age match
      if (childAge !== undefined && childAge >= ageMin && childAge <= ageMax) {
        match.hasAgeMatch = true
      }

      // Check category match
      const actInfo = activityMap.get(b.activity_id)
      if (category && actInfo && actInfo.category.toLowerCase() === category.toLowerCase()) {
        match.hasCategoryMatch = true
      }

      // Check if active (booking in last 6 months)
      if (new Date(b.created_at) >= sixMonthsAgo) {
        match.isActive = true
      }
    }

    // Also check waitlist entries for children
    const actIds = Array.from(activityMap.keys())
    if (actIds.length > 0) {
      const { data: waitlistEntries } = await sb.from('waitlist_entries')
        .select('parent_id, child_info, activity_id')
        .in('activity_id', actIds)
        .in('status', ['waiting', 'offered'])

      for (const w of waitlistEntries ?? []) {
        const ci = w.child_info ?? {}
        const childName = ci.firstName
          ? (ci.firstName + ' ' + (ci.lastName || '')).trim()
          : ''
        const birthYear = ci.birthYear as number | undefined
        const childAge = birthYear ? now.getFullYear() - birthYear : undefined

        let match = parentMap.get(w.parent_id)
        if (!match) {
          match = {
            parentId: w.parent_id,
            childNames: [],
            childAges: [],
            matchReasons: [],
            relevanceScore: 0,
            lastBookingAt: '',
            bookingCount: 0,
            hasCategoryMatch: false,
            hasAgeMatch: false,
            isActive: false,
          }
          parentMap.set(w.parent_id, match)
        }
        if (childName && !match.childNames.includes(childName)) {
          match.childNames.push(childName)
        }
        if (childAge !== undefined && !match.childAges.includes(childAge)) {
          match.childAges.push(childAge)
        }
        if (childAge !== undefined && childAge >= ageMin && childAge <= ageMax) {
          match.hasAgeMatch = true
        }
        const actInfo = activityMap.get(w.activity_id)
        if (category && actInfo && actInfo.category.toLowerCase() === category.toLowerCase()) {
          match.hasCategoryMatch = true
        }
      }
    }

    // Step 3.5: Get parents that already have an active booking on THIS activity
    let alreadyBookedParents = new Set<string>()
    if (activityId) {
      const { data: existingBookings } = await sb.from('provider_bookings')
        .select('parent_id, status, payment_status')
        .eq('activity_id', activityId)
        .eq('provider_id', auth.providerId)
      for (const row of existingBookings ?? []) {
        if (row.status === 'cancelled') continue
        if (row.payment_status === 'refunded') continue
        if (row.parent_id) alreadyBookedParents.add(row.parent_id)
      }
    }

    // Step 3.6: Find parents with active credits (also relevant for invites)
    const creditCountByParent = new Map<string, number>()
    try {
      const { data: creditRows } = await sb.from('session_credits')
        .select('parent_id, status')
        .eq('status', 'active')
      for (const row of creditRows ?? []) {
        if (!row.parent_id) continue
        creditCountByParent.set(row.parent_id, (creditCountByParent.get(row.parent_id) || 0) + 1)
      }
      // Boost or include parents with credits even if no age/category match
      for (const [pid, cnt] of creditCountByParent) {
        if (alreadyBookedParents.has(pid)) continue
        let m = parentMap.get(pid)
        if (!m) {
          // Add as fresh entry — no booking history but has unused credits
          m = {
            parentId: pid, childNames: [], childAges: [], matchReasons: [],
            relevanceScore: 0, lastBookingAt: '', bookingCount: 0,
            hasCategoryMatch: false, hasAgeMatch: false, isActive: true,
          }
          parentMap.set(pid, m)
        }
        ;(m as any).creditCount = cnt
      }
    } catch (e) {
      // session_credits table may not exist yet
    }

    // Step 4: Calculate relevance score and build match reasons
    const matches: ParentMatch[] = []

    for (const match of parentMap.values()) {
      // Don't suggest parents that already have an active booking for this course
      if (alreadyBookedParents.has(match.parentId)) continue
      const credCount = (match as any).creditCount || 0
      // At least one matching criterion required (or credits available)
      if (!match.hasAgeMatch && !match.hasCategoryMatch && credCount === 0) continue

      let score = 0
      if (credCount > 0) {
        score += 70
        match.matchReasons.push(credCount + ' Credit' + (credCount === 1 ? '' : 's') + ' verfügbar')
      }
      if (match.hasAgeMatch) {
        score += 50
        match.matchReasons.push('Kind im passenden Alter')
      }
      if (match.hasCategoryMatch) {
        score += 30
        match.matchReasons.push('Hat ähnlichen Kurs besucht')
      }
      if (match.isActive) {
        score += 20
        match.matchReasons.push('Aktiver Kunde')
      }
      match.relevanceScore = score
      matches.push(match)
    }

    // Sort by relevance score descending
    matches.sort((a, b) => b.relevanceScore - a.relevanceScore)

    // Fetch parent details
    const parentIds = matches.map((m) => m.parentId)
    if (parentIds.length === 0) {
      return res.json({ data: [], count: 0 })
    }

    const { data: parents } = await sb.from('parents')
      .select('id, name, email, phone')
      .in('id', parentIds)

    const parentDetailMap = new Map<string, { name: string; email: string; phone?: string }>()
    for (const p of parents ?? []) {
      parentDetailMap.set(p.id, { name: p.name, email: p.email, phone: p.phone })
    }

    // Check which parents were already invited for this activity
    let invitedParentIds = new Set<string>()
    if (activityId) {
      try {
        const { data: existingInvites } = await sb.from('course_invitations')
          .select('parent_id')
          .eq('activity_id', activityId)
          .eq('provider_id', auth.providerId)

        invitedParentIds = new Set((existingInvites ?? []).map((i: { parent_id: string }) => i.parent_id))
      } catch {
        // Table may not exist yet — skip invitation tracking
      }
    }

    const result = matches
      .filter((m) => parentDetailMap.has(m.parentId))
      .map((m) => {
        const detail = parentDetailMap.get(m.parentId)!
        return {
          parentId: m.parentId,
          name: detail.name,
          email: detail.email,
          phone: detail.phone,
          childNames: m.childNames,
          childAges: m.childAges,
          matchReasons: m.matchReasons,
          relevanceScore: m.relevanceScore,
          bookingCount: m.bookingCount,
          isActive: m.isActive,
          creditCount: (m as any).creditCount || 0,
          alreadyInvited: invitedParentIds.has(m.parentId),
        }
      })

    res.json({ data: result, count: result.length })
  })

  // ============================================================
  // POST /api/providers/:providerId/invite-parents
  // Send invitation emails to selected parents
  // ============================================================

  router.post('/api/providers/:providerId/invite-parents', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'customers', 'contact')) return

    const { parentIds, activityId, couponCode } = req.body as {
      parentIds: string[]
      activityId: string
      couponCode?: string
    }

    if (!parentIds || !Array.isArray(parentIds) || parentIds.length === 0) {
      return res.error(400, 'Mindestens ein Elternteil muss ausgewählt werden')
    }
    if (!activityId) {
      return res.error(400, 'Aktivität muss angegeben werden')
    }

    const sb = getServiceClient()

    // Load activity
    const activity = await ActivityService.getById(activityId, auth.providerId)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')

    // Load provider — prefer display_name (Brand) over company_name (Legal)
    const provider = await ProviderService.getById(auth.providerId)
    if (!provider) return res.error(404, 'Anbieter nicht gefunden')
    const providerDisplayName = (provider as any).displayName || provider.name

    // Load parents
    const { data: parents } = await sb.from('parents')
      .select('id, name, email, children')
      .in('id', parentIds)

    if (!parents || parents.length === 0) {
      return res.error(404, 'Keine Eltern gefunden')
    }

    // Check which parents were already invited
    let alreadyInvited = new Set<string>()
    try {
      const { data: existingInvites } = await sb.from('course_invitations')
        .select('parent_id')
        .eq('activity_id', activityId)
        .eq('provider_id', auth.providerId)
        .in('parent_id', parentIds)

      alreadyInvited = new Set((existingInvites ?? []).map((i: { parent_id: string }) => i.parent_id))
    } catch {
      // Table may not exist yet
    }

    // Build course details for email
    const schedule = activity.schedule as any
    let scheduleText = ''
    if (schedule?.type === 'recurring' && schedule?.slots?.length > 0) {
      const dayLabels: Record<string, string> = {
        MO: 'Montag', TU: 'Dienstag', WE: 'Mittwoch', TH: 'Donnerstag',
        FR: 'Freitag', SA: 'Samstag', SU: 'Sonntag',
      }
      scheduleText = schedule.slots
        .map((s: { day: string; startTime: string; endTime: string }) =>
          `${dayLabels[s.day] || s.day} ${s.startTime}–${s.endTime} Uhr`)
        .join(', ')
    }

    const ageText = activity.ageRange
      ? `${activity.ageRange.min}–${activity.ageRange.max} Jahre`
      : ''

    const priceText = activity.pricing?.[0]
      ? `${activity.pricing[0].amount.toFixed(2).replace('.', ',')} €`
      : ''

    const courseDetails = [
      scheduleText ? `Wann: ${scheduleText}` : '',
      ageText ? `Alter: ${ageText}` : '',
      priceText ? `Preis: ${priceText}` : '',
      activity.description ? activity.description.substring(0, 200) : '',
    ].filter(Boolean).join('<br>')

    // Booking URL (widget/public booking page)
    const baseUrl = process.env.PUBLIC_URL || 'https://app.urbankids.club'
    const slug = (provider as any).slug || ''
    const bookingUrl = slug
      ? `${baseUrl}/widget/${slug}?course=${activity.id}`
      : `${baseUrl}/widget/${activity.id}`

    // Send invitations
    const results: Array<{ parentId: string; name: string; success: boolean; error?: string; skipped?: boolean }> = []
    const invitationRows: Array<Record<string, unknown>> = []

    for (const parent of parents) {
      if (alreadyInvited.has(parent.id)) {
        results.push({ parentId: parent.id, name: parent.name, success: false, skipped: true, error: 'Bereits eingeladen' })
        continue
      }

      // Find child names for this parent (use first child name as fallback)
      const childNames = (parent.children ?? []).map((c: { name: string }) => c.name).filter(Boolean)
      const childName = childNames[0] || 'Ihr Kind'

      const emailResult = await EmailService.sendCourseInvitation(parent.email, {
        parentName: parent.name,
        childName,
        courseName: activity.title,
        providerName: providerDisplayName,
        scheduleText,
        ageText,
        priceText,
        descriptionText: activity.description ? activity.description.substring(0, 240) : '',
        bookingUrl,
        couponCode,
        providerId: activity.provider_id || (activity as any).providerId,
      })

      results.push({
        parentId: parent.id,
        name: parent.name,
        success: emailResult.success,
        error: emailResult.success ? undefined : emailResult.error,
      })

      // Track invitation regardless of email success (we attempted it)
      invitationRows.push({
        provider_id: auth.providerId,
        activity_id: activityId,
        parent_id: parent.id,
        coupon_code: couponCode || null,
        email_sent: emailResult.success,
        sent_at: new Date().toISOString(),
      })
    }

    // Store invitations in DB
    if (invitationRows.length > 0) {
      try {
        await sb.from('course_invitations').insert(invitationRows)
      } catch (e) {
        console.error('[Invitations] Failed to store invitation records:', e)
      }
    }

    const sentCount = results.filter((r) => r.success).length
    const skippedCount = results.filter((r) => r.skipped).length

    res.json({
      data: results,
      summary: {
        total: parentIds.length,
        sent: sentCount,
        skipped: skippedCount,
        failed: parentIds.length - sentCount - skippedCount,
      },
    })
  })

  // ============================================================
  // GET /api/providers/:providerId/invitations
  // List all invitations sent by this provider
  // ============================================================

  router.get('/api/providers/:providerId/invitations', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const sb = getServiceClient()
    const activityId = req.query.activityId

    try {
      let query = sb.from('course_invitations')
        .select('*')
        .eq('provider_id', auth.providerId)
        .order('sent_at', { ascending: false })
        .limit(200)

      if (activityId) {
        query = query.eq('activity_id', activityId)
      }

      const { data, error } = await query
      if (error) return res.error(500, 'Einladungen konnten nicht geladen werden')

      res.json({ data: data ?? [], count: (data ?? []).length })
    } catch {
      // Table may not exist yet
      res.json({ data: [], count: 0 })
    }
  })
}
