// ============================================================
// Parents, Children & CRM Routes
// ============================================================

import { Router } from '../router'
import { validate, CreateParentSchema, UpdateParentSchema } from '../../lib/schemas'
import { requireAuth } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { ParentService, CrmService, ActivityService, BookingService, ConsentService } from '../../services'

export function registerParentRoutes(router: Router) {

  // ============================================================
  // PARENTS
  // ============================================================

  router.get('/api/parents', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parents = await ParentService.list({ query: req.query.q, providerId: auth.providerId })
    res.json({ data: parents, count: parents.length })
  })

  router.get('/api/parents/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parent = await ParentService.getById(req.params.id, auth.providerId)
    if (!parent) return res.error(404, 'Elternteil nicht gefunden')
    res.json({ data: parent })
  })

  router.post('/api/parents', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateParentSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await ParentService.create(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.put('/api/parents/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(UpdateParentSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    // Verify parent belongs to this provider before updating
    const existingParent = await ParentService.getById(req.params.id, auth.providerId)
    if (!existingParent) return res.error(404, 'Elternteil nicht gefunden')
    const parent = await ParentService.update(req.params.id, parsed.data as any)
    if (!parent) return res.error(404, 'Elternteil nicht gefunden')
    res.json({ data: parent })
  })

  router.post('/api/parents/:id/children', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Verify parent belongs to this provider before modifying
    const existingParentForChild = await ParentService.getById(req.params.id, auth.providerId)
    if (!existingParentForChild) return res.error(404, 'Elternteil nicht gefunden')
    const parent = await ParentService.addChild(req.params.id, req.body as any)
    if (!parent) return res.error(404, 'Elternteil nicht gefunden')
    res.json({ data: parent })
  })

  // DSGVO data export
  router.get('/api/parents/:parentId/data-export', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Verify parent has bookings with this provider
    const allBookings = await BookingService.listByParent(req.params.parentId)
    const providerActivities = await ActivityService.listByProvider(auth.providerId)
    const providerActivityIds = new Set(providerActivities.map(a => a.id))
    const hasRelation = allBookings.some(b => providerActivityIds.has(b.activityId))
    if (!hasRelation) return res.error(403, 'Kein Zugriff auf diese Elterndaten')
    const data = await ConsentService.exportParentData(req.params.parentId)
    res.json({ data })
  })

  // ============================================================
  // CRM
  // ============================================================

  router.get('/api/providers/:providerId/customers', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const customers = await CrmService.listCustomers(auth.providerId, {
      tag: req.query.tag as any,
      minSpent: req.query.minSpent ? parseFloat(req.query.minSpent) : undefined,
      query: req.query.q,
    })
    const segments = await CrmService.getSegments(auth.providerId)
    const db = getServiceClient()

    // Fetch child info from bookings + waitlist to merge into each customer
    const { data: allBookings } = await db.from('provider_bookings')
      .select('parent_id, child_info').eq('provider_id', auth.providerId)
    const { data: provActs } = await db.from('activities').select('id').eq('provider_id', auth.providerId)
    const actIds = (provActs ?? []).map((a: { id: string }) => a.id)
    let allWaitlist: any[] = []
    if (actIds.length > 0) {
      const { data: wl } = await db.from('waitlist_entries')
        .select('parent_id, child_info').in('activity_id', actIds)
      allWaitlist = wl ?? []
    }

    // Flatten parent data for frontend consumption
    const flat = customers.map((c: any) => {
      const childMap: Record<string, { name: string; age: number }> = {}
      for (const ch of c.parent.children ?? []) {
        if (ch.name) childMap[ch.name] = { name: ch.name, age: ch.age ?? 0 }
      }
      for (const b of allBookings ?? []) {
        if (b.parent_id !== c.parent.id) continue
        const ci = b.child_info ?? {}
        const name = ci.firstName ? (ci.firstName + ' ' + (ci.lastName || '')).trim() : ''
        if (name && !childMap[name]) {
          childMap[name] = { name, age: ci.birthYear ? new Date().getFullYear() - ci.birthYear : 0 }
        }
      }
      for (const w of allWaitlist) {
        if (w.parent_id !== c.parent.id) continue
        const ci = w.child_info ?? {}
        const name = ci.firstName ? (ci.firstName + ' ' + (ci.lastName || '')).trim() : ''
        if (name && !childMap[name]) {
          childMap[name] = { name, age: ci.birthYear ? new Date().getFullYear() - ci.birthYear : 0 }
        }
      }
      return {
        id: c.parent.id, name: c.parent.name, email: c.parent.email, phone: c.parent.phone,
        children: Object.values(childMap),
        bookingCount: c.bookingCount, totalSpent: c.totalSpent, lastBookingAt: c.lastBookingAt,
      }
    })
    res.json({ data: flat, segments, count: flat.length })
  })

  router.get('/api/providers/:providerId/customers/:parentId', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const profile = await CrmService.getExtendedProfile(req.params.parentId, auth.providerId) as any
    if (!profile) return res.error(404, 'Kundenprofil nicht gefunden')
    const p = profile.parent as any
    const db = getServiceClient()

    // Merge children from: parents.children + bookings.child_info + waitlist.child_info
    const childMap: Record<string, { name: string; age: number }> = {}
    for (const ch of p.children ?? []) {
      if (ch.name) childMap[ch.name] = { name: ch.name, age: ch.age ?? 0 }
    }
    for (const b of (profile.bookings as any[]) ?? []) {
      const ci = b.child_info ?? {}
      const name = ci.firstName ? (ci.firstName + ' ' + (ci.lastName || '')).trim() : ''
      if (name && !childMap[name]) {
        childMap[name] = { name, age: ci.birthYear ? new Date().getFullYear() - ci.birthYear : 0 }
      }
    }
    // Check waitlist entries for this parent
    const { data: provActs } = await db.from('activities').select('id').eq('provider_id', auth.providerId)
    const actIds = (provActs ?? []).map((a: { id: string }) => a.id)
    if (actIds.length > 0) {
      const { data: wlEntries } = await db.from('waitlist_entries')
        .select('child_info').eq('parent_id', req.params.parentId).in('activity_id', actIds)
      for (const w of wlEntries ?? []) {
        const ci = w.child_info ?? {}
        const name = ci.firstName ? (ci.firstName + ' ' + (ci.lastName || '')).trim() : ''
        if (name && !childMap[name]) {
          childMap[name] = { name, age: ci.birthYear ? new Date().getFullYear() - ci.birthYear : 0 }
        }
      }
    }

    res.json({ data: {
      id: p.id, name: p.name, email: p.email, phone: p.phone,
      children: Object.values(childMap),
      bookingCount: (profile.bookings as any[])?.length ?? 0,
      totalSpent: profile.totalSpent,
      bookings: profile.bookings,
      notes: profile.notes,
    } })
  })

  router.post('/api/providers/:providerId/customers/:parentId/notes', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { content, authorId } = req.body as { content: string; authorId: string }
    const note = await CrmService.addNote({
      parentId: req.params.parentId,
      providerId: auth.providerId,
      authorId,
      content,
    })
    res.status(201).json({ data: note })
  })
}
