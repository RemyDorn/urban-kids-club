// ============================================================
// Review Routes — Parent reviews for courses
// ============================================================

import { Router } from '../router'
import { requireAuth } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { authenticateParent } from './portal'

export function registerReviewRoutes(router: Router) {

  // ============================================================
  // PORTAL: Parent submits a review
  // ============================================================

  router.post('/api/portal/reviews', async (req, res) => {
    const auth = await authenticateParent(req, res)
    if (!auth) return
    const { activityId, rating, comment } = req.body as { activityId?: string; rating?: number; comment?: string }
    if (!activityId) return res.error(400, 'Kurs-ID ist erforderlich')
    if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return res.error(400, 'Bewertung muss zwischen 1 und 5 liegen')
    }

    const sb = getServiceClient()

    // Get activity to find provider
    const { data: activity } = await sb.from('activities').select('id, provider_id').eq('id', activityId).maybeSingle()
    if (!activity) return res.error(404, 'Kurs nicht gefunden')

    // Check if parent has a completed booking for this course
    const { data: completedBookings } = await sb.from('provider_bookings').select('id')
      .eq('parent_id', auth.parentId)
      .eq('activity_id', activityId)
      .eq('status', 'completed')
      .limit(1)

    if (!completedBookings || completedBookings.length === 0) {
      return res.error(400, 'Bewertung nur nach Kursbesuch möglich')
    }

    // Prevent duplicate reviews
    const { data: existingReview } = await sb.from('reviews').select('id')
      .eq('activity_id', activityId)
      .eq('parent_id', auth.parentId)
      .limit(1)

    if (existingReview && existingReview.length > 0) {
      return res.error(400, 'Sie haben diesen Kurs bereits bewertet')
    }

    // Create review
    const { data: review, error } = await sb.from('reviews').insert({
      activity_id: activityId,
      provider_id: activity.provider_id,
      parent_id: auth.parentId,
      rating,
      comment: comment?.trim() || null,
    }).select().single()

    if (error) return res.error(500, error.message)
    res.status(201).json({ data: review })
  })

  // ============================================================
  // PORTAL: Get parent's own reviews
  // ============================================================

  router.get('/api/portal/reviews', async (req, res) => {
    const auth = await authenticateParent(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data: reviews, error } = await sb.from('reviews').select('*')
      .eq('parent_id', auth.parentId)
      .order('created_at', { ascending: false })

    if (error) return res.error(500, error.message)

    // Enrich with activity titles
    const actIds = [...new Set((reviews ?? []).map((r: any) => r.activity_id))]
    const { data: acts } = actIds.length
      ? await sb.from('activities').select('id, title').in('id', actIds)
      : { data: [] }
    const actMap = new Map((acts ?? []).map((a: any) => [a.id, a.title]))

    const enriched = (reviews ?? []).map((r: any) => ({
      ...r,
      activityTitle: actMap.get(r.activity_id) || 'Kurs',
    }))

    res.json({ data: enriched })
  })

  // ============================================================
  // PORTAL: Get reviewable courses (completed bookings without review)
  // ============================================================

  router.get('/api/portal/reviewable', async (req, res) => {
    const auth = await authenticateParent(req, res)
    if (!auth) return
    const sb = getServiceClient()

    // Get completed bookings
    const { data: completedBookings } = await sb.from('provider_bookings')
      .select('activity_id, provider_id')
      .eq('parent_id', auth.parentId)
      .eq('status', 'completed')

    if (!completedBookings || completedBookings.length === 0) {
      return res.json({ data: [] })
    }

    // Get existing reviews
    const { data: existingReviews } = await sb.from('reviews').select('activity_id')
      .eq('parent_id', auth.parentId)

    const reviewedIds = new Set((existingReviews ?? []).map((r: any) => r.activity_id))
    const reviewable = completedBookings.filter((b: any) => !reviewedIds.has(b.activity_id))

    // Deduplicate by activity_id
    const seen = new Set<string>()
    const unique = reviewable.filter((b: any) => {
      if (seen.has(b.activity_id)) return false
      seen.add(b.activity_id)
      return true
    })

    // Enrich with activity titles + provider names
    const actIds = unique.map((b: any) => b.activity_id)
    const provIds = [...new Set(unique.map((b: any) => b.provider_id))]
    const { data: acts } = actIds.length ? await sb.from('activities').select('id, title').in('id', actIds) : { data: [] }
    const { data: provs } = provIds.length ? await sb.from('providers').select('id, company_name').in('id', provIds) : { data: [] }
    const actMap = new Map((acts ?? []).map((a: any) => [a.id, a.title]))
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, p.company_name]))

    const enriched = unique.map((b: any) => ({
      activityId: b.activity_id,
      providerId: b.provider_id,
      activityTitle: actMap.get(b.activity_id) || 'Kurs',
      providerName: provMap.get(b.provider_id) || 'Anbieter',
    }))

    res.json({ data: enriched })
  })

  // ============================================================
  // DASHBOARD: Get reviews for provider's activities
  // ============================================================

  router.get('/api/reviews', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const activityId = req.query?.activityId as string | undefined

    let query = sb.from('reviews').select('*')
      .eq('provider_id', auth.providerId)
      .order('created_at', { ascending: false })

    if (activityId) {
      query = query.eq('activity_id', activityId)
    }

    const { data: reviews, error } = await query
    if (error) return res.error(500, error.message)

    // Enrich with parent names + activity titles
    const parentIds = [...new Set((reviews ?? []).map((r: any) => r.parent_id))]
    const actIds = [...new Set((reviews ?? []).map((r: any) => r.activity_id))]
    const { data: parents } = parentIds.length ? await sb.from('parents').select('id, name').in('id', parentIds) : { data: [] }
    const { data: acts } = actIds.length ? await sb.from('activities').select('id, title').in('id', actIds) : { data: [] }
    const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p.name]))
    const actMap = new Map((acts ?? []).map((a: any) => [a.id, a.title]))

    const enriched = (reviews ?? []).map((r: any) => ({
      ...r,
      parentName: parentMap.get(r.parent_id) || 'Elternteil',
      activityTitle: actMap.get(r.activity_id) || 'Kurs',
    }))

    res.json({ data: enriched, count: enriched.length })
  })

  // ============================================================
  // DASHBOARD: Get average rating for an activity (auth required)
  // Removed redundant unauthenticated endpoint — use /api/public/activities/:id/rating instead
  // ============================================================

  router.get('/api/activities/:id/rating', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data: reviews } = await sb.from('reviews').select('rating')
      .eq('activity_id', req.params.id)

    if (!reviews || reviews.length === 0) {
      return res.json({ data: { average: 0, count: 0 } })
    }

    const sum = reviews.reduce((s: number, r: any) => s + r.rating, 0)
    res.json({
      data: {
        average: Math.round((sum / reviews.length) * 10) / 10,
        count: reviews.length,
      }
    })
  })

  // ============================================================
  // DASHBOARD: Get provider's overall rating (auth required)
  // ============================================================

  router.get('/api/providers/:id/rating', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data: reviews } = await sb.from('reviews').select('rating')
      .eq('provider_id', req.params.id)

    if (!reviews || reviews.length === 0) {
      return res.json({ data: { average: 0, count: 0 } })
    }

    const sum = reviews.reduce((s: number, r: any) => s + r.rating, 0)
    res.json({
      data: {
        average: Math.round((sum / reviews.length) * 10) / 10,
        count: reviews.length,
      }
    })
  })

  // ============================================================
  // PUBLIC: Get average rating for widget display
  // ============================================================

  router.get('/api/public/activities/:id/rating', async (req, res) => {
    const sb = getServiceClient()
    const { data: reviews } = await sb.from('reviews').select('rating')
      .eq('activity_id', req.params.id)

    if (!reviews || reviews.length === 0) {
      return res.json({ data: { average: 0, count: 0 } })
    }

    const sum = reviews.reduce((s: number, r: any) => s + r.rating, 0)
    res.json({
      data: {
        average: Math.round((sum / reviews.length) * 10) / 10,
        count: reviews.length,
      }
    })
  })
}
