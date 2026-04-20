// ============================================================
// Public Embed, Checkout & Widget Endpoints (no auth)
// ============================================================

import { Router } from '../router'
import { requireAuth } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { ProviderService, ActivityService, CourseBlockService, SessionCreditService, MakeupBookingService } from '../../services'
import { rateLimit, getClientIp, idempotencyStore } from './helpers'

export function registerPublicRoutes(router: Router) {

  // ============================================================
  // PUBLIC EMBED ENDPOINTS (kein Auth – für iframe-Widgets)
  // ============================================================

  // Public: Widget branding for a provider
  router.get('/api/providers/by-slug/:slug/branding', async (req, res) => {
    const provider = await ProviderService.getBySlug(req.params.slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    const sb = getServiceClient()
    const { data } = await sb.from('providers')
      .select('company_name, logo_url, widget_primary_color, widget_accent_color, widget_font, widget_border_radius, widget_show_logo')
      .eq('id', provider.id).maybeSingle()
    res.json({ data: {
      name: data?.company_name || provider.name,
      logo: data?.logo_url || null,
      primaryColor: data?.widget_primary_color || '#D4956A',
      accentColor: data?.widget_accent_color || '#3C2225',
      font: data?.widget_font || 'Inter',
      borderRadius: data?.widget_border_radius || '16',
      showLogo: data?.widget_show_logo !== false,
    }})
  })

  router.get('/api/providers/by-slug/:slug/activities', async (req, res) => {
    const provider = await ProviderService.getBySlug(req.params.slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    const activities = await ActivityService.listByProvider(provider.id)
    // Check which activities have active blocks
    const db = getServiceClient()
    const activityIds = activities.map((a: any) => a.id)
    const { data: activeBlocks } = await db.from('course_blocks')
      .select('activity_id, start_date, end_date').in('activity_id', activityIds).in('status', ['active', 'upcoming'])
    // Build map: activity_id → [{start_date, end_date}]
    const blockDateRanges: Record<string, Array<{start: string, end: string}>> = {}
    for (const b of activeBlocks ?? []) {
      if (!blockDateRanges[b.activity_id]) blockDateRanges[b.activity_id] = []
      blockDateRanges[b.activity_id].push({ start: b.start_date, end: b.end_date })
    }
    // Only return public-safe fields + block date ranges for per-date checking
    const safe = activities.map((a: any) => ({
      id: a.id, title: a.title, description: a.description, category: a.category,
      ageRange: a.ageRange || { min: a.age_group_min, max: a.age_group_max },
      duration: a.duration || a.duration_minutes, schedule: a.schedule,
      pricing: a.pricing, status: a.status, color: a.color, images: a.images,
      hasActiveBlock: !!blockDateRanges[a.id]?.length,
      blockDateRanges: blockDateRanges[a.id] || [],
    }))
    res.json({ data: safe, count: safe.length })
  })

  // Public: Waitlist registration (no auth needed — for embed widget)
  router.post('/api/widget/waitlist', async (req, res) => {
    // Rate limit: 10 waitlist entries per IP per hour
    const ip = getClientIp(req)
    if (!rateLimit(`widget-waitlist:${ip}`, 10, 60 * 60 * 1000)) return res.error(429, 'Zu viele Anfragen. Bitte später erneut probieren.')
    const { slug, activityId, child, parent: parentData } = req.body as any
    if (!slug || !activityId) return res.error(400, 'Pflichtfelder fehlen')
    if (!child?.firstName || !child?.lastName || !child?.birthYear) return res.error(400, 'Kind-Daten unvollständig')
    if (!parentData?.firstName || !parentData?.lastName || !parentData?.email) return res.error(400, 'Eltern-Daten unvollständig')
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentData.email)) return res.error(400, 'Ungültige E-Mail-Adresse')
    // Validate birth year
    const by = parseInt(child.birthYear)
    if (isNaN(by) || by < 2000 || by > new Date().getFullYear()) return res.error(400, 'Ungültiges Geburtsjahr')

    const db = getServiceClient()
    const provider = await ProviderService.getBySlug(slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')

    // Find or create parent
    let { data: existingParent } = await db.from('parents').select('id').eq('email', parentData.email).maybeSingle()
    if (!existingParent) {
      const { data: newParent } = await db.from('parents').insert({
        name: (parentData.firstName + ' ' + parentData.lastName).trim(),
        email: parentData.email,
        phone: parentData.phone || null,
      }).select('id').single()
      existingParent = newParent
    }
    if (!existingParent) return res.error(500, 'Eltern konnten nicht erstellt werden')

    // Check if this specific child is already on waitlist (not just same parent)
    const { data: parentWaitlist } = await db.from('waitlist_entries')
      .select('id, child_info').eq('activity_id', activityId).eq('parent_id', existingParent.id)
      .in('status', ['waiting', 'offered'])
    const existing = (parentWaitlist || []).find(function(e: any) {
      const ci = e.child_info || {}
      return (ci.firstName || '').toLowerCase() === (child.firstName || '').toLowerCase()
        && (ci.lastName || '').toLowerCase() === (child.lastName || '').toLowerCase()
    })
    if (existing) return res.json({ success: true, message: 'Bereits auf der Warteliste', alreadyExists: true })

    // Find active block for block-scoped waitlist
    const { data: wlBlock } = await db.from('course_blocks')
      .select('id').eq('activity_id', activityId).in('status', ['active', 'upcoming'])
      .order('start_date', { ascending: true }).limit(1).maybeSingle()

    // Add to waitlist (scoped to block if available)
    // Use Date.now() for position to avoid race condition where parallel requests
    // both read the same count and assign the same position number
    await db.from('waitlist_entries').insert({
      activity_id: activityId,
      course_block_id: wlBlock?.id || null,
      parent_id: existingParent.id,
      child_info: { firstName: child.firstName, lastName: child.lastName, birthYear: child.birthYear },
      position: Date.now(),
      priority: 'normal',
      status: 'waiting',
    })

    // Notify provider
    await db.from('notifications').insert({
      recipient_type: 'provider',
      recipient_id: provider.id,
      type: 'waitlist_entry',
      channel: 'in_app',
      title: 'Neue Wartelisten-Anmeldung!',
      body: child.firstName + ' ' + child.lastName + ' möchte am Kurs teilnehmen.',
      data: { activityId, parentId: existingParent.id },
    })

    // Send waitlist confirmation email to parent
    try {
      const { EmailService } = await import('../../lib/email')
      const { data: activity } = await db.from('activities').select('title').eq('id', activityId).maybeSingle()
      await EmailService.sendWaitlistConfirmation(parentData.email, {
        parentName: parentData.firstName,
        childName: (child.firstName + ' ' + child.lastName).trim(),
        courseName: activity?.title || 'Kurs',
        providerName: (provider as any).companyName || provider.name || '',
      })
    } catch (emailErr) {
      console.error('[Waitlist] Confirmation email failed:', emailErr)
    }

    res.json({ success: true, message: 'Erfolgreich auf die Warteliste eingetragen!' })
  })

  // Public: Booking inquiry from embed widget (creates a lead/notification)
  router.post('/api/widget/booking-inquiry', async (req, res) => {
    // Rate limit: 5 inquiries per IP per hour
    const ip = getClientIp(req)
    if (!rateLimit(`booking-inquiry:${ip}`, 5, 60 * 60 * 1000)) return res.error(429, 'Zu viele Anfragen.')
    const { slug, course, date, time, name, email, phone, message } = req.body as any
    if (!slug || !name || !email) return res.error(400, 'Name und E-Mail erforderlich')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.error(400, 'Ungültige E-Mail-Adresse')
    // Limit field lengths to prevent abuse
    if (name.length > 200 || (message && message.length > 2000)) return res.error(400, 'Eingabe zu lang')
    const provider = await ProviderService.getBySlug(slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    const db = getServiceClient()
    const { error } = await db.from('booking_inquiries').insert({
      provider_id: provider.id,
      course_name: (course || '').slice(0, 200),
      preferred_date: (date || '').slice(0, 20),
      preferred_time: (time || '').slice(0, 20),
      parent_name: name.slice(0, 200),
      parent_email: email.slice(0, 200),
      parent_phone: (phone || '').slice(0, 30),
      message: (message || '').slice(0, 2000),
      status: 'new',
    })
    if (error) return res.error(500, 'Anfrage konnte nicht gespeichert werden')
    res.json({ success: true })
  })

  // ============================================================
  // PUBLIC CHECKOUT (no auth — called from embed widget)
  // ============================================================

  router.post('/api/checkout/create-session', async (req, res) => {
    // Rate limit: 10 checkout sessions per IP per hour
    const ip = getClientIp(req)
    if (!rateLimit(`checkout:${ip}`, 10, 60 * 60 * 1000)) return res.error(429, 'Zu viele Anfragen. Bitte später erneut probieren.')

    // Idempotency check (with server-side fallback if no client header)
    let idempotencyKey = req.raw?.headers?.['x-idempotency-key'] as string | undefined
    if (!idempotencyKey) {
      const { slug, activityId, child, parent } = req.body as any
      if (activityId && parent?.email && child?.firstName && child?.lastName) {
        const { createHash } = await import('node:crypto')
        idempotencyKey = createHash('sha256').update(activityId + ':' + parent.email + ':' + child.firstName + ':' + child.lastName).digest('hex').slice(0, 32)
      }
    }
    if (idempotencyKey) {
      const cached = idempotencyStore.get(idempotencyKey)
      if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.response)
      }
    }

    const { slug, activityId, blockId, child, parent, paymentMethod, bookedDate } = req.body as any

    // Server-side validation
    if (!slug || !activityId || !paymentMethod) return res.error(400, 'Pflichtfelder fehlen')
    if (!child?.firstName?.trim() || !child?.lastName?.trim()) return res.error(400, 'Vor- und Nachname des Kindes erforderlich')
    if (!child.birthYear || child.birthYear < 2005 || child.birthYear > new Date().getFullYear()) return res.error(400, 'Ungültiges Geburtsjahr')
    if (!parent?.firstName?.trim() || !parent?.lastName?.trim()) return res.error(400, 'Vor- und Nachname des Elternteils erforderlich')
    if (!parent?.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email)) return res.error(400, 'Ungültige E-Mail-Adresse')
    if (!['stripe', 'paypal', 'onsite'].includes(paymentMethod)) return res.error(400, 'Ungültige Zahlungsart')

    const db = getServiceClient()
    const provider = await ProviderService.getBySlug(slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    // Fetch extra fields not in Provider mapper
    const { data: provExtra } = await db.from('providers')
      .select('booking_redirect_url, stripe_account_id').eq('id', provider.id).single()

    const { data: activity } = await db.from('activities').select('*').eq('id', activityId).single()
    if (!activity) return res.error(404, 'Kurs nicht gefunden')
    if (activity.provider_id !== provider.id) return res.error(400, 'Kurs gehört nicht zu diesem Provider')

    // Validate payment method is enabled for this activity
    if (paymentMethod === 'onsite' && activity.payment_onsite === false) {
      return res.error(400, 'Vor-Ort-Zahlung ist für diesen Kurs nicht aktiviert')
    }
    if ((paymentMethod === 'stripe' || paymentMethod === 'paypal') && activity.payment_online === false) {
      return res.error(400, 'Online-Zahlung ist für diesen Kurs nicht aktiviert')
    }

    // Find active block for this activity (for block-scoped capacity + waitlist)
    const { data: activeBlock } = await db.from('course_blocks')
      .select('id, capacity, makeup_capacity')
      .eq('activity_id', activityId).in('status', ['active', 'upcoming'])
      .order('start_date', { ascending: true }).limit(1).maybeSingle()

    // Soft pre-check: count enrollments in active block (not total bookings)
    // This is NOT the authoritative gate — create_booking_atomic RPC does the real atomic check
    let currentCount = 0
    if (activeBlock) {
      const { count: enrollCount } = await db.from('block_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('block_id', activeBlock.id).eq('status', 'active')
      currentCount = enrollCount ?? 0
    } else {
      const { count: bookingCount } = await db.from('provider_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('activity_id', activityId).in('status', ['confirmed', 'pending'])
      currentCount = bookingCount ?? 0
    }

    const effectiveCapacity = (activeBlock?.capacity || activity.capacity || 0) + (activeBlock?.makeup_capacity || 0)
    if (currentCount >= effectiveCapacity) {
      // Course full → auto-add to waitlist (scoped to block if available)
      let parentId = ''
      const { data: existingParent } = await db.from('parents').select('id').eq('email', parent.email).maybeSingle()
      if (existingParent) {
        parentId = existingParent.id
      } else {
        const { data: newParent } = await db.from('parents').insert({
          name: (parent.firstName + ' ' + parent.lastName).trim(),
          email: parent.email, phone: parent.phone || null,
        }).select('id').single()
        parentId = newParent?.id || ''
      }
      if (parentId) {
        const { data: parentWl } = await db.from('waitlist_entries')
          .select('id, child_info').eq('activity_id', activityId).eq('parent_id', parentId)
          .in('status', ['waiting', 'offered'])
        const existingWl = (parentWl || []).find(function(e: any) {
          const ci = e.child_info || {}
          return (ci.firstName || '').toLowerCase() === (child.firstName || '').toLowerCase()
            && (ci.lastName || '').toLowerCase() === (child.lastName || '').toLowerCase()
        })
        if (!existingWl) {
          // Use Date.now() for position to avoid race condition with parallel requests
          await db.from('waitlist_entries').insert({
            activity_id: activityId, parent_id: parentId,
            course_block_id: activeBlock?.id || null,
            child_info: { firstName: child.firstName, lastName: child.lastName, birthYear: child.birthYear },
            position: Date.now(), priority: 'normal', status: 'waiting',
          })
          // Notify provider
          await db.from('notifications').insert({
            recipient_type: 'provider', recipient_id: provider.id,
            type: 'waitlist_entry', channel: 'in_app',
            title: 'Neue Wartelisten-Anmeldung!',
            body: child.firstName + ' ' + child.lastName + ' möchte am Kurs teilnehmen.',
            data: { activityId, parentId },
          })
          // Send waitlist email
          try {
            const { EmailService } = await import('../../lib/email')
            await EmailService.sendWaitlistConfirmation(parent.email, {
              parentName: parent.firstName,
              childName: (child.firstName + ' ' + child.lastName).trim(),
              courseName: activity.title || 'Kurs',
              providerName: (provider as any).companyName || provider.name || '',
            })
          } catch(e) {}
        }
      }
      return res.error(400, 'Tut uns leid — da war leider jemand schneller! 😅 Aber keine Sorge, wir haben ' + child.firstName + ' auf die Warteliste gesetzt. Sobald ein Platz frei wird, melden wir uns sofort bei dir!')
    }

    // Duplicate check — same child (first+last name) for same activity, not just same parent
    if (parent.email && child.firstName && child.lastName) {
      const { data: existingParent2 } = await db.from('parents').select('id').eq('email', parent.email).maybeSingle()
      if (existingParent2) {
        const { data: parentBookings } = await db.from('provider_bookings')
          .select('id, child_info').eq('activity_id', activityId).eq('parent_id', existingParent2.id)
          .in('status', ['confirmed', 'pending'])
        const isDuplicate = (parentBookings || []).some(function(b: any) {
          const ci = b.child_info || {}
          return (ci.firstName || '').toLowerCase() === child.firstName.toLowerCase()
            && (ci.lastName || '').toLowerCase() === child.lastName.toLowerCase()
        })
        if (isDuplicate) {
          return res.error(400, child.firstName + ' ' + child.lastName + ' ist bereits für diesen Kurs angemeldet.')
        }
      }
    }

    // Price + sibling discount
    let priceEur = activity.pricing?.[0]?.amount || 0
    const siblingDiscount = activity.pricing?.[0]?.siblingDiscount || 0
    let appliedDiscount = 0

    // Check if parent already has another child in this course → sibling discount
    if (siblingDiscount > 0 && parent.email) {
      const { data: siblingParent } = await db.from('parents').select('id').eq('email', parent.email).maybeSingle()
      if (siblingParent) {
        const { count: siblingBookings } = await db.from('provider_bookings')
          .select('*', { count: 'exact', head: true })
          .eq('activity_id', activityId).eq('parent_id', siblingParent.id)
          .in('status', ['confirmed', 'pending'])
        if ((siblingBookings ?? 0) > 0) {
          appliedDiscount = siblingDiscount
          priceEur = Math.round(priceEur * (1 - siblingDiscount / 100) * 100) / 100
          console.log(`[Checkout] Sibling discount ${siblingDiscount}% applied: ${activity.pricing?.[0]?.amount}€ → ${priceEur}€`)
        }
      }
    }
    const price = Math.round(priceEur * 100) // Stripe expects cents

    // If sibling discount makes price 0 → treat as free booking (skip Stripe)
    if (price <= 0 && (paymentMethod === 'stripe' || paymentMethod === 'paypal')) {
      try {
        const { CheckoutService } = await import('../../services/supabase/checkout.service')
        const booking = await CheckoutService.createBooking({
          providerId: provider.id, activityId, blockId,
          childFirstName: child.firstName, childLastName: child.lastName, childBirthYear: child.birthYear,
          parentFirstName: parent.firstName, parentLastName: parent.lastName,
          parentEmail: parent.email, parentPhone: parent.phone || '',
          bookedDate: bookedDate || undefined,
          paymentMethod: 'onsite', amount: 0, currency: 'EUR',
        })
        const responseData = { success: true, bookingId: booking.id, redirect: provExtra?.booking_redirect_url || null }
        if (idempotencyKey) {
          idempotencyStore.set(idempotencyKey, { response: responseData, expiresAt: Date.now() + 5 * 60 * 1000 })
        }
        return res.json(responseData)
      } catch (bookingErr: any) {
        return res.error(400, bookingErr.message || 'Buchung fehlgeschlagen')
      }
    }

    if (paymentMethod === 'onsite') {
      try {
        const { CheckoutService } = await import('../../services/supabase/checkout.service')
        const booking = await CheckoutService.createBooking({
          providerId: provider.id, activityId, blockId,
          childFirstName: child.firstName, childLastName: child.lastName, childBirthYear: child.birthYear,
          parentFirstName: parent.firstName, parentLastName: parent.lastName,
          parentEmail: parent.email, parentPhone: parent.phone || '',
          bookedDate: bookedDate || undefined,
          paymentMethod: 'onsite', amount: price, currency: 'EUR',
        })
        const responseData = { success: true, bookingId: booking.id, redirect: provExtra?.booking_redirect_url || null }
        if (idempotencyKey) {
          idempotencyStore.set(idempotencyKey, { response: responseData, expiresAt: Date.now() + 5 * 60 * 1000 })
        }
        return res.json(responseData)
      } catch (bookingErr: any) {
        return res.error(400, bookingErr.message || 'Buchung fehlgeschlagen')
      }
    }

    if (paymentMethod === 'stripe') {
      const { stripe: stripeClient, createCheckoutSession } = await import('../../lib/stripe')
      if (!stripeClient) return res.error(500, 'Stripe ist nicht konfiguriert')
      const origin = req.raw.headers.origin || (req.raw.headers.host ? `https://${req.raw.headers.host}` : 'https://app.urbankids.club')
      const defaultSuccess = `${origin}/embed/${slug}/booking-success?session_id={CHECKOUT_SESSION_ID}`
      const redirectUrl = provExtra?.booking_redirect_url
      const successUrl = (redirectUrl && (redirectUrl.startsWith('https://') || redirectUrl.startsWith('http://'))) ? redirectUrl : defaultSuccess
      const url = await createCheckoutSession({
        stripeAccountId: provExtra?.stripe_account_id || undefined,
        amount: price, currency: 'EUR', courseName: activity.title,
        successUrl,
        cancelUrl: `${origin}/embed/${slug}/calendar`,
        metadata: {
          provider_id: provider.id, activity_id: activityId, block_id: blockId || '',
          child_first: child.firstName, child_last: child.lastName, child_year: String(child.birthYear),
          parent_first: parent.firstName, parent_last: parent.lastName,
          parent_email: parent.email, parent_phone: parent.phone || '',
          booked_date: bookedDate || '',
        },
      })
      const responseData = { success: true, redirect: url }
      if (idempotencyKey) {
        idempotencyStore.set(idempotencyKey, { response: responseData, expiresAt: Date.now() + 5 * 60 * 1000 })
      }
      return res.json(responseData)
    }

    if (paymentMethod === 'paypal') {
      try {
        const { createPayPalOrder } = await import('../../lib/paypal')
        const origin = req.raw.headers.origin || (req.raw.headers.host ? `https://${req.raw.headers.host}` : 'https://app.urbankids.club')
        const returnUrl = `${origin}/api/paypal/capture?slug=${encodeURIComponent(slug)}`
        const cancelUrl = `${origin}/embed/${slug}/calendar`
        const { orderId, approvalUrl } = await createPayPalOrder({
          providerId: provider.id,
          amount: price,
          currency: 'EUR',
          courseName: activity.title,
          returnUrl,
          cancelUrl,
          metadata: {
            provider_id: provider.id, activity_id: activityId, block_id: blockId || '',
            child_first: child.firstName, child_last: child.lastName, child_year: String(child.birthYear),
            parent_first: parent.firstName, parent_last: parent.lastName,
            parent_email: parent.email, parent_phone: parent.phone || '',
            booked_date: bookedDate || '',
          },
        })
        const responseData = { success: true, redirect: approvalUrl, paypalOrderId: orderId }
        if (idempotencyKey) {
          idempotencyStore.set(idempotencyKey, { response: responseData, expiresAt: Date.now() + 5 * 60 * 1000 })
        }
        return res.json(responseData)
      } catch (ppErr: any) {
        console.error('[PayPal] Order creation failed:', ppErr)
        return res.error(500, 'Zahlung fehlgeschlagen. Bitte versuche es erneut.')
      }
    }

    res.error(400, 'Ungueltige Zahlungsart')
  })

  // Stripe Webhook
  router.post('/api/webhooks/stripe', async (req, res) => {
    const { stripe: stripeClient } = await import('../../lib/stripe')
    if (!stripeClient) return res.error(500, 'Stripe not configured')

    // 1. Verify webhook signature
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    let event: any
    if (webhookSecret && req.rawBody) {
      try {
        const sig = req.raw.headers['stripe-signature'] as string
        event = stripeClient.webhooks.constructEvent(req.rawBody, sig, webhookSecret)
      } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message)
        return res.error(400, 'Invalid signature')
      }
    } else {
      // Always require webhook signature — no dev bypass
      console.error('STRIPE_WEBHOOK_SECRET not configured or rawBody missing!')
      return res.error(500, 'Webhook not configured — set STRIPE_WEBHOOK_SECRET')
    }

    if (event?.type === 'checkout.session.completed') {
      const session = event.data.object
      const meta = session.metadata || {}
      const db = getServiceClient()

      // 2. Idempotency: check if booking already exists for this session
      const { data: existing } = await db.from('provider_bookings')
        .select('id').eq('stripe_session_id', session.id).maybeSingle()
      if (existing) {
        return res.json({ received: true, duplicate: true })
      }

      // 2b. Re-check capacity at webhook time (race condition protection)
      let isOverbooked = false
      if (meta.activity_id) {
        const { data: act } = await db.from('activities').select('capacity').eq('id', meta.activity_id).single()
        const maxCap = act?.capacity || 12
        const { count } = await db.from('provider_bookings')
          .select('id', { count: 'exact', head: true })
          .eq('activity_id', meta.activity_id)
          .eq('status', 'confirmed')
        if (count !== null && count >= maxCap) {
          isOverbooked = true
          console.error(`[Stripe Webhook] OVERBOOKING: course ${meta.activity_id} full at payment time (${count}/${maxCap}). Booking will be created as pending_refund. Stripe session: ${session.id}`)
        }
      }

      // 3. Create booking — with pending_refund status if overbooked
      try {
        const { CheckoutService } = await import('../../services/supabase/checkout.service')
        const booking = await CheckoutService.createBooking({
          providerId: meta.provider_id, activityId: meta.activity_id, blockId: meta.block_id || undefined,
          childFirstName: meta.child_first, childLastName: meta.child_last,
          childBirthYear: parseInt(meta.child_year) || 2020,
          parentFirstName: meta.parent_first, parentLastName: meta.parent_last,
          parentEmail: meta.parent_email, parentPhone: meta.parent_phone || '',
          bookedDate: meta.booked_date || undefined,
          paymentMethod: 'stripe', amount: session.amount_total || 0,
          currency: session.currency || 'eur', stripeSessionId: session.id,
          ...(isOverbooked ? { status: 'pending_refund' } : {}),
        })

        // If overbooked, notify provider and update booking status directly
        if (isOverbooked) {
          // Ensure status is pending_refund in DB (in case CheckoutService ignores the field)
          await db.from('provider_bookings').update({ status: 'pending_refund' }).eq('id', booking.id)

          await db.from('notifications').insert({
            recipient_type: 'provider',
            recipient_id: meta.provider_id,
            type: 'overbooking',
            channel: 'in_app',
            title: 'Überbuchung erkannt — manueller Refund nötig',
            body: `${meta.child_first} ${meta.child_last} hat bezahlt, aber der Kurs war bereits voll. Buchung #${booking.id} wurde als "pending_refund" markiert. Bitte Stripe-Refund durchführen.`,
            data: { bookingId: booking.id, activityId: meta.activity_id, stripeSessionId: session.id },
          })
          console.error(`[Stripe Webhook] Overbooking notification sent to provider ${meta.provider_id}. Booking ${booking.id} marked as pending_refund.`)
        }
      } catch (err: any) {
        // 4. Return 500 so Stripe retries
        console.error('Webhook booking creation failed:', err.message)
        return res.error(500, 'Booking creation failed')
      }
    }
    res.json({ received: true })
  })

  // PayPal: Capture after user approves payment (return URL)
  router.get('/api/paypal/capture', async (req, res) => {
    const token = req.query.token as string // PayPal order ID
    const slug = req.query.slug as string
    if (!token || !slug) return res.error(400, 'Missing token or slug')

    try {
      const provider = await ProviderService.getBySlug(slug)
      if (!provider) return res.error(404, 'Provider nicht gefunden')

      const { capturePayPalOrder } = await import('../../lib/paypal')
      const result = await capturePayPalOrder(provider.id, token)

      if (result.status !== 'COMPLETED') {
        console.error('[PayPal] Capture status:', result.status)
        return res.error(400, 'PayPal-Zahlung nicht abgeschlossen')
      }

      const meta = result.metadata
      const db = getServiceClient()

      // Idempotency: check if booking already exists for this PayPal order
      const { data: existing } = await db.from('provider_bookings')
        .select('id').eq('paypal_order_id', token).maybeSingle()
      if (existing) {
        // Already processed — redirect to success
        const { data: provExtra } = await db.from('providers')
          .select('booking_redirect_url').eq('id', provider.id).single()
        const origin = req.raw.headers.origin || (req.raw.headers.host ? `https://${req.raw.headers.host}` : 'https://app.urbankids.club')
        const redirectUrl = provExtra?.booking_redirect_url || `${origin}/embed/${slug}/booking-success`
        ;(res as any).writeHead(302, { Location: redirectUrl })
        ;(res as any).end()
        return
      }

      // Create booking
      const { CheckoutService } = await import('../../services/supabase/checkout.service')
      await CheckoutService.createBooking({
        providerId: meta.provider_id || provider.id,
        activityId: meta.activity_id,
        blockId: meta.block_id || undefined,
        childFirstName: meta.child_first,
        childLastName: meta.child_last,
        childBirthYear: parseInt(meta.child_year) || 2020,
        parentFirstName: meta.parent_first,
        parentLastName: meta.parent_last,
        parentEmail: meta.parent_email,
        parentPhone: meta.parent_phone || '',
        bookedDate: meta.booked_date || undefined,
        paymentMethod: 'paypal',
        amount: Math.round((parseFloat(result.amount) || 0) * 100),
        currency: result.currency,
        paypalOrderId: token,
      })

      // Redirect to success page
      const { data: provExtra } = await db.from('providers')
        .select('booking_redirect_url').eq('id', provider.id).single()
      const origin = req.raw.headers.origin || (req.raw.headers.host ? `https://${req.raw.headers.host}` : 'https://app.urbankids.club')
      const redirectUrl = provExtra?.booking_redirect_url || `${origin}/embed/${slug}/booking-success`
      ;(res as any).writeHead(302, { Location: redirectUrl })
      ;(res as any).end()
    } catch (err: any) {
      console.error('[PayPal] Capture failed:', err)
      res.error(500, 'Zahlung fehlgeschlagen. Bitte versuche es erneut.')
    }
  })

  // Public: Validate coupon code
  router.post('/api/coupons/validate', async (req, res) => {
    const db = getServiceClient()
    const { code, activityId, amount } = req.body as any
    if (!code) return res.json({ valid: false, error: 'Kein Code angegeben' })

    // Look up coupon by code (case-insensitive)
    const { data: coupon } = await db.from('coupons')
      .select('*')
      .ilike('code', code)
      .eq('active', true)
      .maybeSingle()

    if (!coupon) return res.json({ valid: false, error: 'Ungültiger Rabatt-Code' })

    // Check expiry
    const now = new Date()
    if (coupon.valid_from && new Date(coupon.valid_from) > now) return res.json({ valid: false, error: 'Code noch nicht gültig' })
    if (coupon.valid_until && new Date(coupon.valid_until) < now) return res.json({ valid: false, error: 'Code abgelaufen' })

    // Check usage limit
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return res.json({ valid: false, error: 'Code bereits aufgebraucht' })

    // Check activity restriction (activity_ids is an array)
    if (coupon.activity_ids?.length > 0 && activityId && !coupon.activity_ids.includes(activityId)) return res.json({ valid: false, error: 'Code gilt nicht für diesen Kurs' })

    // Calculate discount
    let discount = 0
    let message = ''
    if (coupon.type === 'percentage') {
      discount = Math.round((amount || 0) * (coupon.value / 100) * 100) / 100
      message = `${coupon.value}% Rabatt (-${discount.toFixed(2).replace('.', ',')} €)`
    } else if (coupon.type === 'fixed_amount') {
      discount = coupon.value
      message = `${coupon.value.toFixed(2).replace('.', ',')} € Rabatt`
    } else if (coupon.type === 'free_trial') {
      discount = amount || 0
      message = 'Kostenlose Probestunde!'
    }

    res.json({ valid: true, discount, type: coupon.type, value: coupon.value, message })
  })

  // Public: Get activity details + payment config for checkout form
  router.get('/api/checkout/activity/:activityId', async (req, res) => {
    const db = getServiceClient()
    const { data: activity } = await db.from('activities').select('id, title, category, pricing, payment_online, payment_onsite, provider_id').eq('id', req.params.activityId).single()
    if (!activity) return res.error(404, 'Kurs nicht gefunden')
    // Get provider payment config
    const { data: provider } = await db.from('providers').select('stripe_connected, paypal_connected').eq('id', activity.provider_id).single()
    // Get cancellation policy
    const { data: policy } = await db.from('cancellation_policies').select('*').eq('provider_id', activity.provider_id).single()
    res.json({
      activity: { id: activity.id, title: activity.title, category: activity.category, pricing: activity.pricing, paymentOnline: activity.payment_online, paymentOnsite: activity.payment_onsite },
      provider: { stripeConnected: provider?.stripe_connected || !!process.env.STRIPE_SECRET_KEY, paypalConnected: provider?.paypal_connected || !!process.env.PAYPAL_CLIENT_ID },
      cancellation: policy || { fee_type: 'fixed', fee_value: 0, deadline_hours: 48, custom_text: '' },
    })
  })

  // ============================================================
  // PUBLIC WIDGET ENDPOINTS (kein Auth – für Eltern-Widget auf Squarespace)
  // ============================================================

  // Öffentlich: Kursblöcke eines Providers mit Enrollment-Count + Activity-Titel
  router.get('/api/widget/providers/:slug/course-blocks', async (req, res) => {
    const slug = req.params.slug
    // Provider by slug
    const provider = await ProviderService.getBySlug(slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    const providerId = provider.id

    const blocks = await CourseBlockService.getBlocksByProvider(providerId)

    // Batch-load all activities to avoid N+1 queries
    const activityIds = [...new Set(blocks.map((b: any) => b.activityId).filter(Boolean))]
    const activities = await Promise.all(activityIds.map((id: string) => ActivityService.getById(id)))
    const activityMap = new Map<string, any>()
    for (const act of activities) {
      if (act) activityMap.set(act.id, act)
    }

    const enriched = blocks.map((block: any) => {
      const activity = activityMap.get(block.activityId)
      return {
        ...block,
        _activityTitle: activity?.title ?? block.activityType,
        _enrollmentCount: 0, // TODO: add enrollment count query to service
      }
    })

    res.json({ data: enriched, count: enriched.length })
  })

  // Public: Block sessions (for widget calendar to show actual dates)
  router.get('/api/widget/course-blocks/:id/sessions', async (req, res) => {
    const db = getServiceClient()
    const { data: sessions, error } = await db.from('block_sessions')
      .select('id, date, start_time, end_time, status')
      .eq('block_id', req.params.id)
      .order('date', { ascending: true })
    if (error) return res.error(500, 'Fehler')
    // Map to camelCase for frontend consistency
    const mapped = (sessions || []).map((s: any) => ({
      id: s.id, date: s.date, startTime: s.start_time, endTime: s.end_time, status: s.status
    }))
    res.json({ data: mapped, count: mapped.length })
  })

  // Eltern: Enrollments mit Block-Info (auth required)
  router.get('/api/widget/enrollments/parent/:parentId', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const enrollments = await CourseBlockService.getEnrollmentsByParent(req.params.parentId)
    res.json({ data: enrollments, count: enrollments.length })
  })

  // Eltern: Credits (auth required)
  router.get('/api/widget/credits/parent/:parentId', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const credits = await SessionCreditService.getCreditsByParent(req.params.parentId)
    res.json({ data: credits, count: credits.length })
  })

  // Eltern: Makeup-Bookings mit Session-Infos angereichert (auth required)
  router.get('/api/widget/makeup-bookings/parent/:parentId', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const makeups = await MakeupBookingService.getMakeupsByParent(req.params.parentId)
    res.json({ data: makeups, count: makeups.length })
  })

  // Eltern: Verfügbare Makeup-Slots (auth required)
  router.get('/api/widget/credits/:id/available-slots', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const credit = await SessionCreditService.getCredit(req.params.id)
    if (!credit) return res.error(404, 'Guthaben nicht gefunden')
    if (credit.status !== 'available') return res.error(400, 'Guthaben ist nicht verfügbar')

    const slots = await CourseBlockService.getAvailableMakeupSlots(
      credit.activityType,
      credit.validUntil,
      credit.blockId
    )
    res.json({ data: slots, count: slots.length })
  })
}
