// ============================================================
// Bookings & Attendance Routes
// ============================================================

import { Router } from '../router'
import { validate, CreateBookingSchema, CheckInSchema } from '../../lib/schemas'
import { requireAuth, checkPermission } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { BookingService, AttendanceService, ActivityService, InvoiceService } from '../../services'

export function registerBookingRoutes(router: Router) {

  // ============================================================
  // BOOKINGS
  // ============================================================

  router.get('/api/providers/:providerId/bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const bookings = await BookingService.listByProvider(auth.providerId, {
      status: req.query.status as any,
      paymentStatus: req.query.paymentStatus as any,
    })

    // Enrich with parent (customer) + activity title for dashboard display
    if (bookings.length > 0) {
      const db = getServiceClient()
      const parentIds = [...new Set(bookings.map(b => b.parentId).filter(Boolean))]
      const activityIds = [...new Set(bookings.map(b => b.activityId).filter(Boolean))]

      const [parentsRes, activitiesRes] = await Promise.all([
        parentIds.length
          ? db.from('parents').select('id, name, email, phone').in('id', parentIds)
          : Promise.resolve({ data: [] }),
        activityIds.length
          ? db.from('activities').select('id, title').in('id', activityIds)
          : Promise.resolve({ data: [] }),
      ])

      const parentMap = new Map<string, any>()
      for (const p of (parentsRes.data ?? [])) parentMap.set(p.id, p)
      const actMap = new Map<string, any>()
      for (const a of (activitiesRes.data ?? [])) actMap.set(a.id, a)

      const enriched = bookings.map(b => {
        const p = parentMap.get(b.parentId)
        const a = actMap.get(b.activityId)
        return {
          ...b,
          customer: p ? { name: p.name, email: p.email, phone: p.phone } : undefined,
          customerName: p?.name,
          customerEmail: p?.email,
          activityTitle: a?.title,
          activityName: a?.title,
        }
      })
      return res.json({ data: enriched, count: enriched.length })
    }

    res.json({ data: bookings, count: bookings.length })
  })

  router.get('/api/activities/:activityId/bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Verify activity belongs to this provider
    const act = await ActivityService.getById(req.params.activityId, auth.providerId)
    if (!act || act.providerId !== auth.providerId) return res.error(404, 'Aktivität nicht gefunden')
    const bookings = await BookingService.listByActivity(req.params.activityId)
    res.json({ data: bookings, count: bookings.length })
  })

  router.get('/api/parents/:parentId/bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Verify parent belongs to this provider (has bookings with provider's activities)
    const allBookings = await BookingService.listByParent(req.params.parentId)
    const providerActivities = await ActivityService.listByProvider(auth.providerId)
    const providerActivityIds = new Set(providerActivities.map(a => a.id))
    const bookings = allBookings.filter(b => providerActivityIds.has(b.activityId))
    res.json({ data: bookings })
  })

  router.post('/api/bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateBookingSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await BookingService.create(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/bookings/:id/cancel', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'bookings', 'cancel')) return
    const db = getServiceClient()

    // Fetch booking details before cancelling (for refund + email)
    const { data: bookingRow } = await db.from('provider_bookings')
      .select('*, parents!inner(name, email), activities!inner(title)')
      .eq('id', req.params.id).eq('provider_id', auth.providerId).maybeSingle()

    const booking = await (BookingService as any).cancel(req.params.id, auth.providerId)
    if (!booking) return res.error(400, 'Buchung konnte nicht storniert werden')

    // Sync payment_status: bei Storno wird Zahlung auf 'cancelled' gesetzt (Konsistenz mit booking-Status).
    // Stripe-Refund-Block unten überschreibt zu 'refunded' bei erfolgreichem Refund.
    // 'refunded' Status bleibt unverändert (idempotent).
    try {
      if (bookingRow?.payment_status !== 'refunded' && bookingRow?.payment_status !== 'cancelled') {
        await db.from('provider_bookings')
          .update({ payment_status: 'cancelled' })
          .eq('id', req.params.id)
      }
    } catch (psErr) {
      console.error('[Cancel] payment_status sync failed:', psErr)
    }

    // Deactivate block enrollments for this booking
    try {
      await db.from('block_enrollments')
        .update({ status: 'cancelled' })
        .eq('booking_id', req.params.id)
      console.log('[Cancel] Block enrollments deactivated for booking ' + req.params.id)
    } catch (enrollErr) {
      console.error('[Cancel] Failed to deactivate enrollments:', enrollErr)
    }

    // §14 UStG-Cascade: Wenn Buchung mit nicht-stornierter Rechnung verknüpft ist → InvoiceService.cancel
    // (erstellt für sent/paid Rechnungen automatisch eine Storno-Rechnung)
    try {
      const { data: relatedInvoices } = await db.from('invoices')
        .select('id, status')
        .contains('booking_ids', [req.params.id])
        .neq('status', 'cancelled')
      for (const inv of relatedInvoices ?? []) {
        try {
          await (InvoiceService as any).cancel(inv.id, auth.providerId)
          console.log('[Cancel] Invoice ' + inv.id + ' (status=' + inv.status + ') cancelled via cascade')
        } catch (e) {
          console.error('[Cancel] Invoice cascade failed for ' + inv.id + ':', e)
        }
      }
    } catch (invCascadeErr) {
      console.error('[Cancel] Invoice cascade outer failed:', invCascadeErr)
    }

    // Stripe refund if paid via Stripe
    let refundInfo = ''
    if (bookingRow?.payment_method === 'stripe' && bookingRow?.payment_status === 'paid' && bookingRow?.stripe_session_id) {
      try {
        const { stripe } = await import('../../lib/stripe')
        if (stripe) {
          // Get payment intent from session
          const session = await stripe.checkout.sessions.retrieve(bookingRow.stripe_session_id)
          if (session.payment_intent) {
            await stripe.refunds.create({ payment_intent: session.payment_intent as string })
            await db.from('provider_bookings').update({ payment_status: 'refunded' }).eq('id', req.params.id)
            refundInfo = 'Der Betrag von ' + Number(bookingRow.amount_paid).toFixed(2).replace('.', ',') + ' € wird auf dein Zahlungsmittel zurückerstattet. Dies kann 5-10 Werktage dauern.'
            console.log('[Cancel] Stripe refund initiated for booking ' + req.params.id)
          }
        }
      } catch (refundErr) {
        console.error('[Cancel] Stripe refund failed:', refundErr)
        refundInfo = 'Die Rückerstattung konnte nicht automatisch verarbeitet werden. Bitte kontaktiere den Anbieter.'
      }
    }

    // Send cancellation email
    try {
      const { EmailService } = await import('../../lib/email')
      const parent = (bookingRow as any)?.parents
      const activity = (bookingRow as any)?.activities
      const ci = bookingRow?.child_info as any
      // Multi-Tenant Branding: Provider-Daten für Logo + From-Display + Reply-To
      const { data: provider } = await db.from('providers')
        .select('company_name, display_name, logo_url, email, website_url')
        .eq('id', auth.providerId).single()
      if (parent?.email) {
        const providerDisplay = (provider as any)?.display_name || (provider as any)?.company_name || ''
        await EmailService.sendCancellation(parent.email, {
          parentName: parent.name?.split(' ')[0] || '',
          childName: ci?.firstName ? (ci.firstName + ' ' + (ci.lastName || '')).trim() : '',
          courseName: activity?.title || 'Kurs',
          providerName: providerDisplay,
          refundInfo: refundInfo || undefined,
          branding: {
            name: providerDisplay || undefined,
            logoUrl: (provider as any)?.logo_url || undefined,
            replyToEmail: (provider as any)?.email || undefined,
            websiteUrl: (provider as any)?.website_url || undefined,
          },
        })
      }
    } catch (emailErr) {
      console.error('[Cancel] Email failed:', emailErr)
    }


    // ── Auto-Waitlist: Offer spot to next person on waitlist ──
    try {
      const activityId = bookingRow?.activity_id
      if (activityId) {
        // Check for course_block_id on the booking
        const courseBlockId = bookingRow?.course_block_id || null

        // Find next waiting entry (prioritize block-specific, fall back to activity-level)
        let nextEntry = null
        if (courseBlockId) {
          const { data } = await db.from('waitlist_entries')
            .select('id, parent_id, activity_id, course_block_id')
            .eq('course_block_id', courseBlockId).eq('status', 'waiting')
            .order('position', { ascending: true }).limit(1).maybeSingle()
          nextEntry = data
        }
        if (!nextEntry) {
          const { data } = await db.from('waitlist_entries')
            .select('id, parent_id, activity_id, course_block_id')
            .eq('activity_id', activityId).eq('status', 'waiting')
            .order('position', { ascending: true }).limit(1).maybeSingle()
          nextEntry = data
        }

        if (nextEntry) {
          // Generate secure token
          const { randomBytes } = await import('node:crypto')
          const confirmToken = randomBytes(24).toString('hex')
          const now = new Date()
          const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24h instead of 3h for auto-offers

          // Update waitlist entry to "offered"
          await db.from('waitlist_entries').update({
            status: 'offered',
            notified_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            confirm_token: confirmToken,
          }).eq('id', nextEntry.id)

          // Send offer email
          const { data: nextParent } = await db.from('parents').select('name, email').eq('id', nextEntry.parent_id).single()
          const { data: nextActivity } = await db.from('activities').select('title, provider_id, pricing, payment_online, payment_onsite').eq('id', nextEntry.activity_id).single()
          const { data: nextProvider } = await db.from('providers').select('company_name').eq('id', nextActivity?.provider_id).single()

          if (nextParent?.email) {
            const { EmailService } = await import('../../lib/email')
            const origin = process.env.APP_PUBLIC_URL || (req.raw.headers.host ? 'https://' + req.raw.headers.host : 'https://dev.urbankids.club')
            const { data: wlEntry } = await db.from('waitlist_entries').select('child_info').eq('id', nextEntry.id).single()
            const childName = (wlEntry?.child_info as any)?.firstName || 'Ihr Kind'

            await EmailService.sendWaitlistOffer(nextParent.email, {
              parentName: nextParent.name.split(' ')[0],
              childName,
              courseName: nextActivity?.title || 'Kurs',
              providerName: nextProvider?.company_name || '',
              confirmLink: origin + '/api/waitlist/' + nextEntry.id + '/confirm?token=' + confirmToken,
              declineLink: origin + '/api/waitlist/' + nextEntry.id + '/decline-offer?token=' + confirmToken,
            })
            console.log('[Cancel→Waitlist] Auto-offered spot to ' + nextParent.email + ' (waitlist entry ' + nextEntry.id + ')')

            // Marketing-Flow Trigger: waitlist_spot_available (zusätzlich zur Transaktions-Mail)
            try {
              const { MarketingFlowEngine } = await import('../../services/marketing-flow.service')
              await MarketingFlowEngine.evaluateTrigger({
                eventType: 'waitlist_spot_available',
                eventId: nextEntry.id,
                providerId: nextActivity?.provider_id,
                recipientType: 'parent',
                recipientId: nextEntry.parent_id,
                recipientEmail: nextParent.email,
                recipientName: nextParent.name?.split(' ')[0],
                templateVars: {
                  parentName: nextParent.name?.split(' ')[0] || '',
                  childName,
                  courseName: nextActivity?.title || 'Kurs',
                  providerName: nextProvider?.company_name || 'Anbieter',
                },
              })
            } catch (mfErr) {
              console.error('[MarketingFlow] waitlist_spot_available trigger failed:', mfErr)
            }
          }
        } else {
          console.log('[Cancel→Waitlist] No waitlist entries for activity ' + activityId)
        }
      }
    } catch (wlErr) {
      console.error('[Cancel→Waitlist] Auto-offer failed:', wlErr)
      // Non-critical — cancellation still succeeded
    }
    res.json({ data: booking })
  })

  router.post('/api/bookings/:id/complete', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const booking = await BookingService.complete(req.params.id, auth.providerId)
    if (!booking) return res.error(400, 'Buchung konnte nicht abgeschlossen werden')
    res.json({ data: booking })
  })

  router.post('/api/bookings/:id/pay', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { amount } = req.body as { amount: number }
    if (typeof amount !== 'number' || amount < 0 || amount > 100000) return res.error(400, 'Ungültiger Betrag')
    const booking = await (BookingService as any).markPaid(req.params.id, amount, auth.providerId)
    if (!booking) return res.error(404, 'Buchung nicht gefunden')

    // Conversion-Webhook: payment_received (onsite/manuell als bezahlt markiert).
    // Online-Zahlungen feuern bereits aus checkout.service.ts beim Booking-Abschluss.
    try {
      const { ConversionWebhookService } = await import('../../services/conversion-webhook.service')
      const { getServiceClient } = await import('../../lib/supabase')
      const sb = getServiceClient()
      const { data: full } = await sb
        .from('bookings')
        .select('id, parent_id, activity_id, provider_id, payment_method, currency, amount_paid')
        .eq('id', req.params.id)
        .maybeSingle()
      if (full) {
        const f = full as any
        const [{ data: parent }, { data: activity }] = await Promise.all([
          sb.from('parents').select('id, name, email, phone').eq('id', f.parent_id).maybeSingle(),
          sb.from('activities').select('id, title').eq('id', f.activity_id).maybeSingle(),
        ])
        const p = (parent as any) || {}
        const a = (activity as any) || {}
        const nameParts = (p.name || '').trim().split(/\s+/)
        const firstName = nameParts[0] || ''
        const lastName = nameParts.slice(1).join(' ') || ''
        await ConversionWebhookService.enqueue({
          providerId: f.provider_id,
          triggerType: 'payment_received',
          eventId: `ukc_payment_received_${f.id}`,
          booking: {
            id: f.id,
            activityId: f.activity_id,
            activityTitle: a.title || '',
            paymentMethod: f.payment_method || 'onsite',
            status: 'paid',
          },
          value: typeof amount === 'number' ? amount : (f.amount_paid || 0),
          currency: (f.currency || 'EUR').toUpperCase(),
          contentIds: [f.activity_id],
          numItems: 1,
          user: {
            email: p.email,
            phone: p.phone,
            firstName,
            lastName,
            externalId: p.id,
          },
        })
      }
    } catch (cwErr) {
      console.error('[ConversionWebhook] payment_received (markPaid) failed:', cwErr)
    }

    res.json({ data: booking })
  })

  router.get('/api/providers/:providerId/bookings/stats', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const stats = await BookingService.getStats(auth.providerId)
    res.json({ data: stats })
  })

  // ============================================================
  // ATTENDANCE
  // ============================================================

  router.get('/api/activities/:activityId/attendance/:date', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const records = await AttendanceService.getByActivityAndDate(req.params.activityId, req.params.date)
    res.json({ data: records })
  })

  router.post('/api/attendance/checkin', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CheckInSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const { bookingId, activityId, date, checkedInBy } = parsed.data as any
    const result = await AttendanceService.checkIn(bookingId, activityId, date, checkedInBy)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/attendance/absent', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CheckInSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const { bookingId, activityId, date, note } = parsed.data as any
    const result = await AttendanceService.markAbsent(bookingId, activityId, date, note)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.get('/api/activities/:activityId/attendance/rate', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const rate = await AttendanceService.getAttendanceRate(req.params.activityId)
    res.json({ data: rate })
  })
}
