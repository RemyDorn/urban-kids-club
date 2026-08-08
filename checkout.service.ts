import { getServiceClient } from '../../lib/supabase'

export class CheckoutService {
  static async createBooking(params: {
    providerId: string
    activityId: string
    blockId?: string
    skipBlockCheck?: boolean
    childFirstName: string
    childLastName: string
    childBirthYear: number
    parentFirstName: string
    parentLastName: string
    parentEmail: string
    parentPhone: string
    bookedDate?: string
    paymentMethod: 'stripe' | 'paypal' | 'onsite'
    amount: number
    currency: string
    stripeSessionId?: string
    paypalOrderId?: string
    // Tracking-Context für Server-Side-Conversion-Tracking (Match-Quality-Boost)
    clientIp?: string
    userAgent?: string
    fbp?: string
    fbc?: string
    gclid?: string
    utmSource?: string
    utmMedium?: string
    utmCampaign?: string
    // Billing-Address aus Stripe-Webhook (Phase 2A.3) → CAPI Match-Quality 9.5+
    billingCity?: string
    billingZip?: string
    billingState?: string
    billingCountry?: string
    // Cross-Domain external_id aus Socialy-Bridge (project_socialy_ukc_bridge.md).
    // Override für CAPI sharedUserCW.externalId, sodass Meta Lead↔Purchase matcht über Domain-Grenze.
    externalIdOverride?: string
  }) {
    const db = getServiceClient()

    // 1. Find or create parent
    let { data: parent } = await db.from('parents')
      .select('id').eq('email', params.parentEmail).maybeSingle()

    let isNewParent = false
    if (!parent) {
      const { data: newParent, error: parentErr } = await db.from('parents').insert({
        name: `${params.parentFirstName} ${params.parentLastName}`.trim(),
        email: params.parentEmail,
        phone: params.parentPhone || null,
      }).select('id').single()
      if (parentErr) throw new Error('Parent-Erstellung fehlgeschlagen: ' + parentErr.message)
      parent = newParent
      isNewParent = true
    }

    if (!parent) throw new Error('Parent konnte nicht erstellt werden')

    // Marketing-Flow Trigger: customer_signup (best-effort, never blocks).
    // Note: Bei Booking-Checkouts feuert ggf. zusätzlich booking_confirmed weiter unten —
    // das ist gewollt (separate Flows können separate Mails senden).
    if (isNewParent && parent.id) {
      try {
        const { MarketingFlowEngine } = await import('../marketing-flow.service')
        const { data: prov } = await db.from('providers').select('display_name, company_name').eq('id', params.providerId).maybeSingle()
        await MarketingFlowEngine.evaluateTrigger({
          eventType: 'customer_signup',
          eventId: parent.id,
          providerId: params.providerId,
          recipientType: 'parent',
          recipientId: parent.id,
          recipientEmail: params.parentEmail,
          recipientName: params.parentFirstName,
          templateVars: {
            parentName: params.parentFirstName,
            providerName: (prov as any)?.display_name || (prov as any)?.company_name || 'Anbieter',
          },
        })
      } catch (mfErr) {
        console.error('[MarketingFlow] customer_signup (checkout) failed:', mfErr)
      }

      // Conversion-Webhook Trigger: customer_signup (server-side tracking → Meta CAPI / GA4 MP / n8n)
      try {
        const { ConversionWebhookService } = await import('../conversion-webhook.service')
        await ConversionWebhookService.enqueue({
          providerId: params.providerId,
          triggerType: 'customer_signup',
          eventId: `ukc_customer_signup_${parent.id}`,
          user: {
            email: params.parentEmail,
            phone: params.parentPhone,
            firstName: params.parentFirstName,
            lastName: params.parentLastName,
            externalId: params.externalIdOverride || parent.id,
          },
          clientIp: params.clientIp,
          userAgent: params.userAgent,
          fbp: params.fbp,
          fbc: params.fbc,
          gclid: params.gclid,
          utm: { source: params.utmSource, medium: params.utmMedium, campaign: params.utmCampaign },
        })
      } catch (cwErr) {
        console.error('[ConversionWebhook] customer_signup failed:', cwErr)
      }
    }

    // 2. Verify active block exists (skip for waitlist confirmations)
    let activeBlock: any = null
    if (!params.skipBlockCheck) {
      const { data: foundBlock } = await db.from('course_blocks')
        .select('id, capacity, makeup_capacity')
        .eq('activity_id', params.activityId)
        .in('status', ['active', 'upcoming'])
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle()
      activeBlock = foundBlock

      if (!activeBlock) {
        // No active block → add to waitlist as pre-registration
        const { count: existingWaitlist } = await db.from('waitlist_entries')
          .select('*', { count: 'exact', head: true })
          .eq('activity_id', params.activityId)
          .eq('parent_id', parent.id)
          .in('status', ['waiting', 'offered'])

        if (!existingWaitlist || existingWaitlist === 0) {
          // Use Date.now() for position to ensure unique ordering across parallel requests
          await db.from('waitlist_entries').insert({
            activity_id: params.activityId,
            parent_id: parent.id,
            child_info: { firstName: params.childFirstName, lastName: params.childLastName, birthYear: params.childBirthYear },
            position: Date.now(),
            priority: 'normal',
            status: 'waiting',
          })
          // Send waitlist confirmation email
          try {
            const { EmailService } = await import('../../lib/email')
            const { data: activity } = await db.from('activities').select('title').eq('id', params.activityId).maybeSingle()
            const { data: provider } = await db.from('providers').select('display_name, company_name').eq('id', params.providerId).single()
            await EmailService.sendWaitlistConfirmation(params.parentEmail, {
              parentName: params.parentFirstName,
              childName: (params.childFirstName + ' ' + params.childLastName).trim(),
              courseName: activity?.title || 'Kurs',
              providerName: provider?.display_name || provider?.company_name || '',
            })
          } catch (emailErr) {
            console.error('[Checkout] Waitlist email failed:', emailErr)
          }
        }
        throw new Error('Aktuell sind leider keine Termine verfügbar. Wir haben ' + params.childFirstName + ' auf die Warteliste gesetzt und melden uns, sobald ein neuer Kursblock startet! 🤞')
      }
    }

    // 3. Create booking
    const childInfo = {
      firstName: params.childFirstName,
      lastName: params.childLastName,
      birthYear: params.childBirthYear,
    }

    // Waitlist confirmations: provider explicitly approved → check capacity + makeup from block
    if (params.skipBlockCheck) {
      const { data: actCap } = await db.from('activities').select('capacity').eq('id', params.activityId).single()
      const baseCapacity = actCap?.capacity ?? 999

      // Read makeup_capacity from the active block (not provider settings)
      let makeupSlots = 0
      const { data: activeBlk } = await db.from('course_blocks')
        .select('makeup_capacity').eq('activity_id', params.activityId)
        .in('status', ['active', 'upcoming']).order('start_date', { ascending: true }).limit(1).maybeSingle()
      if (activeBlk) {
        makeupSlots = activeBlk.makeup_capacity ?? 0
      } else {
        // Fallback to provider settings
        const { data: provMakeup } = await db.from('providers').select('makeup_enabled, makeup_capacity').eq('id', params.providerId).single()
        makeupSlots = provMakeup?.makeup_enabled ? (provMakeup?.makeup_capacity ?? 0) : 0
      }
      const maxTotal = baseCapacity + makeupSlots

      const { count: currentBookings } = await db.from('provider_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('activity_id', params.activityId)
        .in('status', ['confirmed', 'pending'])
      if ((currentBookings ?? 0) >= maxTotal) {
        throw new Error('Dieser Kurs ist leider ausgebucht. Wir informieren dich sofort, wenn ein Platz frei wird!')
      }

      // Check for sibling discount (same parent, another child already booked)
      let finalAmount = params.paymentMethod !== 'onsite' ? params.amount / 100 : 0
      const { data: actPricing } = await db.from('activities').select('pricing').eq('id', params.activityId).single()
      const siblingDiscount = (actPricing?.pricing as any)?.[0]?.siblingDiscount || 0
      if (siblingDiscount > 0) {
        const { count: siblingCount } = await db.from('provider_bookings')
          .select('*', { count: 'exact', head: true })
          .eq('activity_id', params.activityId).eq('parent_id', parent.id)
          .in('status', ['confirmed', 'pending'])
        if ((siblingCount ?? 0) > 0) {
          const basePrice = (actPricing?.pricing as any)?.[0]?.amount || 0
          const discountedPrice = Math.round(basePrice * (1 - siblingDiscount / 100) * 100) / 100
          if (params.paymentMethod === 'onsite') finalAmount = 0
          else finalAmount = discountedPrice
          console.log(`[Checkout] Sibling discount ${siblingDiscount}% applied for waitlist booking: ${basePrice}€ → ${discountedPrice}€`)
        }
      }

      const { data: directBooking, error: directErr } = await db.from('provider_bookings').insert({
        provider_id: params.providerId,
        activity_id: params.activityId,
        parent_id: parent.id,
        child_info: childInfo,
        payment_method: params.paymentMethod,
        amount_paid: finalAmount,
        currency: params.currency || 'EUR',
        status: 'confirmed',
        payment_status: params.paymentMethod !== 'onsite' && params.amount > 0 ? 'paid' : 'unpaid',
        source: 'waitlist',
        stripe_session_id: params.stripeSessionId || null,
        paypal_order_id: params.paypalOrderId || null,
        booked_date: params.bookedDate || null,
      }).select().single()
      if (directErr) throw new Error(directErr.message)

      const booking = { id: directBooking.id, ...directBooking }

      // Notify + email + invoice (skip to step 3b)
      try {
        await db.from('notifications').insert({
          recipient_type: 'provider', recipient_id: params.providerId,
          type: 'new_booking', channel: 'in_app',
          title: 'Neue Buchung!',
          body: params.childFirstName + ' ' + params.childLastName + ' hat gebucht (Warteliste bestätigt).',
          data: { bookingId: booking.id, activityId: params.activityId },
        })
      } catch(e) {}

      // Send confirmation email
      try {
        const { EmailService } = await import('../../lib/email')
        const { data: activity } = await db.from('activities').select('title, pricing, schedule').eq('id', params.activityId).single()
        const { data: provider } = await db.from('providers').select('display_name, company_name, logo_url, email, website_url').eq('id', params.providerId).single()
        const slot = activity?.schedule?.slots?.[0]
        const dayMap: Record<string, string> = { MO: 'Montags', TU: 'Dienstags', WE: 'Mittwochs', TH: 'Donnerstags', FR: 'Freitags', SA: 'Samstags', SU: 'Sonntags' }
        const providerDisplay = provider?.display_name || provider?.company_name || ''
        await EmailService.sendBookingConfirmation(params.parentEmail, {
          parentName: params.parentFirstName,
          childName: `${params.childFirstName} ${params.childLastName}`,
          courseName: activity?.title || 'Kurs',
          date: activity?.schedule?.startDate || '',
          time: slot ? `${slot.startTime}–${slot.endTime}` : '',
          providerName: providerDisplay,
          branding: {
            name: providerDisplay || undefined,
            logoUrl: (provider as any)?.logo_url || undefined,
            replyToEmail: (provider as any)?.email || undefined,
            websiteUrl: (provider as any)?.website_url || undefined,
          },
        })
      } catch (emailErr) {
        console.error('Confirmation email failed:', emailErr)
      }

      // Marketing-Flow Trigger: booking_confirmed (best-effort, never blocks)
      try {
        const { MarketingFlowEngine } = await import('../marketing-flow.service')
        await MarketingFlowEngine.evaluateTrigger({
          eventType: 'booking_confirmed',
          eventId: booking.id,
          providerId: params.providerId,
          recipientType: 'parent',
          recipientId: parent.id,
          recipientEmail: params.parentEmail,
          recipientName: params.parentFirstName,
          templateVars: {
            parentName: params.parentFirstName,
            childName: `${params.childFirstName} ${params.childLastName}`,
            courseName: (activity as any)?.title || 'Kurs',
            providerName: (provider as any)?.display_name || (provider as any)?.company_name || '',
            startDate: (activity as any)?.schedule?.startDate || '',
          },
        })
        // Marketing-Flow Trigger: payment_received (nur bei Online-Zahlung)
        if (params.paymentMethod !== 'onsite' && params.amount > 0) {
          await MarketingFlowEngine.evaluateTrigger({
            eventType: 'payment_received',
            eventId: booking.id,
            providerId: params.providerId,
            recipientType: 'parent',
            recipientId: parent.id,
            recipientEmail: params.parentEmail,
            recipientName: params.parentFirstName,
            templateVars: {
              parentName: params.parentFirstName,
              childName: `${params.childFirstName} ${params.childLastName}`,
              courseName: (activity as any)?.title || 'Kurs',
              providerName: (provider as any)?.display_name || (provider as any)?.company_name || '',
              amount: `${(params.amount / 100).toFixed(2).replace('.', ',')} ${(params.currency || 'EUR').toUpperCase()}`,
            },
          })
        }
      } catch (mfErr) {
        console.error('[MarketingFlow] booking_confirmed/payment_received (waitlist path) failed:', mfErr)
      }

      // Conversion-Webhook (waitlist path): booking_confirmed (+ payment_received bei Online)
      try {
        const { ConversionWebhookService } = await import('../conversion-webhook.service')
        const valueEUR = params.amount > 0 ? params.amount / 100 : 0
        const sharedUserCW = {
          email: params.parentEmail,
          phone: params.parentPhone,
          firstName: params.parentFirstName,
          lastName: params.parentLastName,
          externalId: params.externalIdOverride || parent.id,
          city: params.billingCity,
          zip: params.billingZip,
          state: params.billingState,
          country: params.billingCountry,
        }
        const sharedBookingCW = {
          id: booking.id,
          activityId: params.activityId,
          activityTitle: (activity as any)?.title || '',
          blockId: params.blockId,
          paymentMethod: params.paymentMethod,
          status: 'confirmed',
        }
        const sharedTrackingCW = {
          clientIp: params.clientIp,
          userAgent: params.userAgent,
          fbp: params.fbp,
          fbc: params.fbc,
          gclid: params.gclid,
          utm: { source: params.utmSource, medium: params.utmMedium, campaign: params.utmCampaign },
        }
        await ConversionWebhookService.enqueue({
          providerId: params.providerId,
          triggerType: 'booking_confirmed',
          eventId: `ukc_booking_confirmed_${booking.id}`,
          booking: sharedBookingCW,
          value: valueEUR,
          currency: (params.currency || 'EUR').toUpperCase(),
          contentIds: [params.activityId],
          numItems: 1,
          user: sharedUserCW,
          ...sharedTrackingCW,
        })
        if (params.paymentMethod !== 'onsite' && params.amount > 0) {
          await ConversionWebhookService.enqueue({
            providerId: params.providerId,
            triggerType: 'payment_received',
            eventId: `ukc_payment_received_${booking.id}`,
            booking: { ...sharedBookingCW, status: 'paid' },
            value: valueEUR,
            currency: (params.currency || 'EUR').toUpperCase(),
            contentIds: [params.activityId],
            numItems: 1,
            user: sharedUserCW,
            ...sharedTrackingCW,
          })
        }
      } catch (cwErr) {
        console.error('[ConversionWebhook] booking_confirmed/payment_received (waitlist) failed:', cwErr)
      }

      // Auto-enroll in active block (waitlist bookings need this too)
      try {
        const { data: activeBlk } = await db.from('course_blocks')
          .select('id, capacity, makeup_capacity')
          .eq('activity_id', params.activityId)
          .in('status', ['active', 'upcoming'])
          .order('start_date', { ascending: true })
          .limit(1).maybeSingle()
        if (activeBlk) {
          const childId = `${params.childFirstName}-${params.childLastName}-${params.childBirthYear}`
          const childAge = new Date().getFullYear() - params.childBirthYear
          await db.from('block_enrollments').insert({
            block_id: activeBlk.id,
            activity_type: 'course',
            provider_id: params.providerId,
            parent_id: parent.id,
            child_id: childId,
            child_name: `${params.childFirstName} ${params.childLastName}`,
            child_age: childAge,
            booking_id: booking.id,
            status: 'active',
            price_paid: finalAmount,
            currency: params.currency || 'EUR',
            credits_earned: 0,
            credits_used: 0,
          })
          console.log(`[Checkout] Waitlist booking auto-enrolled in block ${activeBlk.id}`)
        }
      } catch (enrollErr) {
        console.error('[Checkout] Waitlist auto-enrollment failed:', enrollErr)
      }

      // Auto-invoice
      try {
        const { data: provTax } = await db.from('providers')
          .select('kleinunternehmer, vat_rate').eq('id', params.providerId).single()
        const vatRate = provTax?.kleinunternehmer ? 0 : (provTax?.vat_rate ? provTax.vat_rate / 100 : 0.19)
        const { SupabaseInvoiceService } = await import('./invoice.service')
        await SupabaseInvoiceService.createFromBooking(booking.id, params.providerId, vatRate)
      } catch (invoiceErr) {
        console.error('[Checkout] Auto-invoice failed:', invoiceErr)
      }

      return booking
    }

    // Atomic checkout: booking + enrollment in one DB transaction via RPC
    // Prevents TOCTOU race condition where two concurrent bookings both pass capacity check
    const amountEur = params.amount > 0 ? params.amount / 100 : 0

    // Zombie-Prevention Layer 1: Idempotency-Check
    // Wenn dieselbe Eltern+Kurs+Kind-Kombination in den letzten 30s schon gebucht wurde → Cached-Result returnen.
    // Verhindert Doppelklicks/Race-Conditions vom Frontend.
    try {
      const idempotencyWindow = new Date(Date.now() - 30 * 1000).toISOString()
      const { data: recentBooking } = await db.from('provider_bookings')
        .select('id, status, payment_status, amount_paid, child_info')
        .eq('parent_id', parent.id)
        .eq('activity_id', params.activityId)
        .in('status', ['confirmed', 'pending'])
        .gte('created_at', idempotencyWindow)
        .order('created_at', { ascending: false })
        .limit(5)
      const matchingRecent = (recentBooking || []).find(b => {
        const ci = (b as any).child_info || {}
        return (ci.firstName || '').toLowerCase() === params.childFirstName.toLowerCase()
          && (ci.lastName || '').toLowerCase() === params.childLastName.toLowerCase()
      })
      if (matchingRecent?.id) {
        console.log('[Checkout] Idempotency-hit: returning existing booking', matchingRecent.id, '(< 30s ago)')
        return matchingRecent as any
      }
    } catch (idemErr) {
      console.warn('[Checkout] Idempotency-check failed (non-blocking):', idemErr)
    }

    const { data: rpcResult, error: rpcError } = await db.rpc('atomic_create_booking', {
      p_provider_id: params.providerId,
      p_activity_id: params.activityId,
      p_block_id: activeBlock.id,
      p_parent_id: parent.id,
      p_child_info: childInfo,
      p_payment_method: params.paymentMethod,
      p_amount: amountEur,
      p_currency: params.currency || 'EUR',
      p_source: 'widget',
      p_stripe_session_id: params.stripeSessionId || null,
      p_paypal_order_id: params.paypalOrderId || null,
      p_booked_date: params.bookedDate || null,
    })

    // If RPC fails (e.g. PostgREST cache), fall back to direct inserts with capacity check
    let booking: any = null
    if (rpcError) {
      console.warn('[Checkout] RPC failed, falling back to direct insert:', rpcError.message)

      // Capacity check (since RPC couldn't do it atomically)
      const { count: fallbackCount } = await db.from('block_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('block_id', activeBlock.id).eq('status', 'active')
      const fallbackMax = (activeBlock.capacity ?? 10) + (activeBlock.makeup_capacity ?? 0)
      if ((fallbackCount ?? 0) >= fallbackMax) {
        throw new Error('Dieser Kurs ist leider ausgebucht.')
      }

      const paymentStatus = (params.paymentMethod === 'onsite' || amountEur <= 0) ? 'unpaid' : 'paid'
      const { data: newBooking, error: bookingErr } = await db.from('provider_bookings').insert({
        provider_id: params.providerId, activity_id: params.activityId, parent_id: parent.id,
        child_info: childInfo, payment_method: params.paymentMethod,
        amount_paid: amountEur, currency: params.currency || 'EUR', source: 'widget',
        status: 'confirmed', payment_status: paymentStatus,
        stripe_session_id: params.stripeSessionId || null, paypal_order_id: params.paypalOrderId || null,
        booked_date: params.bookedDate || null,
      }).select().single()
      if (bookingErr) throw new Error(bookingErr.message)

      const childName = `${params.childFirstName} ${params.childLastName}`.trim()
      const childId = `${params.childFirstName}-${params.childLastName}-${params.childBirthYear}`
      const childAge = new Date().getFullYear() - params.childBirthYear
      try {
        await db.from('block_enrollments').insert({
          block_id: activeBlock.id, activity_type: 'course', provider_id: params.providerId,
          parent_id: parent.id, child_id: childId, child_name: childName, child_age: childAge,
          booking_id: newBooking.id, status: 'active', price_paid: amountEur,
          currency: params.currency || 'EUR', credits_earned: 0, credits_used: 0,
        })
      } catch (enrollErr: any) { console.error('[Checkout] Enrollment fallback failed:', enrollErr.message) }

      booking = { id: newBooking.id, ...newBooking }
    } else if (rpcResult?.error) {
      // RPC returned a business error (course full)
      if (String(rpcResult.error).includes('ausgebucht') || String(rpcResult.error).includes('voll')) {
        // Auto-waitlist
        const { count: existingWl } = await db.from('waitlist_entries')
          .select('*', { count: 'exact', head: true })
          .eq('activity_id', params.activityId).eq('parent_id', parent.id)
          .in('status', ['waiting', 'offered'])
        if (!existingWl || existingWl === 0) {
          await db.from('waitlist_entries').insert({
            activity_id: params.activityId, parent_id: parent.id,
            child_info: { firstName: params.childFirstName, lastName: params.childLastName, birthYear: params.childBirthYear },
            position: Date.now(), priority: 'normal', status: 'waiting',
          })
          try {
            const { EmailService } = await import('../../lib/email')
            const { data: activity } = await db.from('activities').select('title').eq('id', params.activityId).maybeSingle()
            const { data: provider } = await db.from('providers').select('display_name, company_name').eq('id', params.providerId).single()
            await EmailService.sendWaitlistConfirmation(params.parentEmail, {
              parentName: params.parentFirstName,
              childName: (params.childFirstName + ' ' + params.childLastName).trim(),
              courseName: activity?.title || 'Kurs', providerName: provider?.display_name || provider?.company_name || '',
            })
          } catch (emailErr) { console.error('[Checkout] Waitlist email failed:', emailErr) }
        }
        throw new Error('Tut uns leid — da war leider jemand schneller! 😅 Wir haben ' + params.childFirstName + ' auf die Warteliste gesetzt.')
      }
      throw new Error(rpcResult.error)
    } else {
      // RPC returns { bookingId, enrollmentId } as JSONB — map bookingId → id for downstream code
      booking = { id: rpcResult?.bookingId || rpcResult?.booking_id || rpcResult?.id, ...rpcResult }
    }

    // Zombie-Prevention Layer 2: DB-Recovery wenn RPC-Result-Mapping fehlschlägt
    // Wenn booking.id fehlt aber RPC nicht erroriert ist → kann sein dass DB-INSERT erfolgreich
    // war, aber das Result-Mapping falsche Felder gelesen hat (Schema-Drift). Rette uns durch
    // direkte DB-Query nach dem letzten Booking dieses Eltern+Activity (max. 60s alt).
    if (!booking?.id && !rpcError) {
      console.warn('[Checkout] booking.id missing despite no RPC error — attempting DB recovery')
      try {
        const { data: rec } = await db.from('provider_bookings')
          .select('id, status')
          .eq('parent_id', parent.id)
          .eq('activity_id', params.activityId)
          .eq('status', 'confirmed')
          .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (rec?.id) {
          console.warn('[Checkout] Recovered booking.id from DB query:', rec.id)
          booking = { id: rec.id, ...rec }
        }
      } catch (recErr) {
        console.error('[Checkout] DB-Recovery failed:', recErr)
      }
    }

    // Zombie-Prevention Layer 3: Compensating-Cancel
    // Wenn wir hier ohne booking.id ankommen, werfen wir. Falls TROTZDEM eine Booking-Row
    // existiert (= Schema-Drift, RPC-Bug, was auch immer): markieren wir sie sofort als
    // cancelled, damit kein Zombie zurückbleibt.
    if (!booking?.id) {
      try {
        await db.from('provider_bookings')
          .update({ status: 'cancelled', payment_status: 'cancelled' })
          .eq('parent_id', parent.id)
          .eq('activity_id', params.activityId)
          .eq('status', 'confirmed')
          .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString())
        await db.from('block_enrollments')
          .update({ status: 'cancelled' })
          .eq('parent_id', parent.id)
          .eq('block_id', activeBlock.id)
          .eq('status', 'active')
          .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString())
      } catch (compErr) {
        console.error('[Checkout] Compensating-cancel failed:', compErr)
      }
      throw new Error('Buchung konnte nicht erstellt werden')
    }

    // 3b. Notify provider about new booking
    try {
      await db.from('notifications').insert({
        recipient_type: 'provider', recipient_id: params.providerId,
        type: 'new_booking', channel: 'in_app',
        title: 'Neue Buchung!',
        body: params.childFirstName + ' ' + params.childLastName + ' hat gebucht (' + (params.paymentMethod === 'onsite' ? 'Vor-Ort-Zahlung' : (params.amount > 0 ? 'Online bezahlt' : 'Zahlung ausstehend')) + ').',
        data: { bookingId: booking.id, activityId: params.activityId },
      })
    } catch(e) { /* non-blocking */ }

    // 4. Enrollment is handled atomically by the atomic_create_booking RPC
    // (booking + enrollment created in a single transaction with capacity lock)
    console.log(`[Checkout] Atomic booking+enrollment created for ${params.childFirstName} in block ${activeBlock.id}`)

    // Activity + Provider auf Funktion-Scope laden, damit Email/MarketingFlow/ConversionWebhook
    // alle den gleichen Datensatz nutzen können (vorher: ReferenceError in MarketingFlow + ConversionWebhook).
    const { data: activity } = await db.from('activities').select('title, pricing, schedule').eq('id', params.activityId).single()
    const { data: provider } = await db.from('providers').select('display_name, company_name, logo_url, email, website_url').eq('id', params.providerId).single()
    const slot: any = (activity as any)?.schedule?.slots?.[0]

    // 4. Send confirmation email (non-blocking)
    try {
      const { EmailService } = await import('../../lib/email')
      const pkgSize = activity?.pricing?.[0]?.packageSize || 0
      const dayMap: Record<string, string> = { MO: 'Montags', TU: 'Dienstags', WE: 'Mittwochs', TH: 'Donnerstags', FR: 'Freitags', SA: 'Samstags', SU: 'Sonntags' }
      const providerDisplay = provider?.display_name || provider?.company_name || ''
      await EmailService.sendBookingConfirmation(params.parentEmail, {
        parentName: params.parentFirstName,
        childName: `${params.childFirstName} ${params.childLastName}`,
        courseName: activity?.title || 'Kurs',
        date: activity?.schedule?.startDate || '',
        time: slot ? `${slot.startTime}–${slot.endTime}` : '',
        providerName: providerDisplay,
        packageInfo: pkgSize > 1 ? `${pkgSize} Termine · ${dayMap[slot?.day] || ''}` : undefined,
        amount: params.amount > 0 ? `${(params.amount / 100).toFixed(2).replace('.', ',')} €` : undefined,
        branding: {
          name: providerDisplay || undefined,
          logoUrl: (provider as any)?.logo_url || undefined,
          replyToEmail: (provider as any)?.email || undefined,
          websiteUrl: (provider as any)?.website_url || undefined,
        },
      })
    } catch (emailErr) {
      console.error('Confirmation email failed:', emailErr)
    }

    // Marketing-Flow Trigger: booking_confirmed (best-effort, never blocks)
    try {
      const { MarketingFlowEngine } = await import('../marketing-flow.service')
      const sharedTplVars = {
        parentName: params.parentFirstName,
        childName: `${params.childFirstName} ${params.childLastName}`,
        courseName: (activity as any)?.title || 'Kurs',
        providerName: (provider as any)?.display_name || (provider as any)?.company_name || '',
        startDate: (activity as any)?.schedule?.startDate || '',
        time: slot ? `${slot.startTime}–${slot.endTime}` : '',
        amount: params.amount > 0 ? `${(params.amount / 100).toFixed(2).replace('.', ',')} ${(params.currency || 'EUR').toUpperCase()}` : '',
      }
      await MarketingFlowEngine.evaluateTrigger({
        eventType: 'booking_confirmed',
        eventId: booking.id,
        providerId: params.providerId,
        recipientType: 'parent',
        recipientId: parent.id,
        recipientEmail: params.parentEmail,
        recipientName: params.parentFirstName,
        templateVars: sharedTplVars,
      })
      // Marketing-Flow Trigger: payment_received (nur bei Online-Zahlung)
      if (params.paymentMethod !== 'onsite' && params.amount > 0) {
        await MarketingFlowEngine.evaluateTrigger({
          eventType: 'payment_received',
          eventId: booking.id,
          providerId: params.providerId,
          recipientType: 'parent',
          recipientId: parent.id,
          recipientEmail: params.parentEmail,
          recipientName: params.parentFirstName,
          templateVars: sharedTplVars,
        })
      }
    } catch (mfErr) {
      console.error('[MarketingFlow] booking_confirmed/payment_received trigger failed:', mfErr)
    }

    // Conversion-Webhook (main path): booking_confirmed (+ payment_received bei Online)
    try {
      const { ConversionWebhookService } = await import('../conversion-webhook.service')
      const valueEUR = params.amount > 0 ? params.amount / 100 : 0
      const sharedUserCW = {
        email: params.parentEmail,
        phone: params.parentPhone,
        firstName: params.parentFirstName,
        lastName: params.parentLastName,
        externalId: params.externalIdOverride || parent.id,
        // Adresse aus Stripe-Webhook (nur Stripe/PayPal-Pfad gesetzt) → CAPI ct/zp/st/country
        city: params.billingCity,
        zip: params.billingZip,
        state: params.billingState,
        country: params.billingCountry,
      }
      const sharedBookingCW = {
        id: booking.id,
        activityId: params.activityId,
        activityTitle: (activity as any)?.title || '',
        blockId: params.blockId,
        paymentMethod: params.paymentMethod,
        status: 'confirmed',
      }
      const sharedTrackingCW = {
        clientIp: params.clientIp,
        userAgent: params.userAgent,
        fbp: params.fbp,
        fbc: params.fbc,
        gclid: params.gclid,
        utm: { source: params.utmSource, medium: params.utmMedium, campaign: params.utmCampaign },
      }
      await ConversionWebhookService.enqueue({
        providerId: params.providerId,
        triggerType: 'booking_confirmed',
        eventId: `ukc_booking_confirmed_${booking.id}`,
        booking: sharedBookingCW,
        value: valueEUR,
        currency: (params.currency || 'EUR').toUpperCase(),
        contentIds: [params.activityId],
        numItems: 1,
        user: sharedUserCW,
        ...sharedTrackingCW,
      })
      if (params.paymentMethod !== 'onsite' && params.amount > 0) {
        await ConversionWebhookService.enqueue({
          providerId: params.providerId,
          triggerType: 'payment_received',
          eventId: `ukc_payment_received_${booking.id}`,
          booking: { ...sharedBookingCW, status: 'paid' },
          value: valueEUR,
          currency: (params.currency || 'EUR').toUpperCase(),
          contentIds: [params.activityId],
          numItems: 1,
          user: sharedUserCW,
          ...sharedTrackingCW,
        })
      }
    } catch (cwErr) {
      console.error('[ConversionWebhook] booking_confirmed/payment_received failed:', cwErr)
    }

    // 5. Auto-create draft invoice (non-blocking)
    try {
      const { data: provTax } = await db.from('providers')
        .select('kleinunternehmer, vat_rate').eq('id', params.providerId).single()
      const vatRate = provTax?.kleinunternehmer ? 0 : (provTax?.vat_rate ? provTax.vat_rate / 100 : 0.19)

      const { SupabaseInvoiceService } = await import('./invoice.service')
      const invoice = await SupabaseInvoiceService.createFromBooking(booking.id, params.providerId, vatRate)
      if ('error' in invoice) {
        console.error('[Checkout] Auto-invoice failed:', invoice.error)
      } else {
        console.log(`[Checkout] Auto-invoice ${(invoice as any).number} created for booking ${booking.id}`)
      }
    } catch (invoiceErr) {
      console.error('[Checkout] Auto-invoice creation failed:', invoiceErr)
    }

    return booking
  }

  static async confirmPayment(sessionId: string, method: 'stripe' | 'paypal') {
    const db = getServiceClient()
    const col = method === 'stripe' ? 'stripe_session_id' : 'paypal_order_id'
    const { data, error } = await db.from('provider_bookings')
      .update({ status: 'confirmed', payment_status: 'paid', updated_at: new Date().toISOString() })
      .eq(col, sessionId)
      .select().single()
    if (error) throw new Error(error.message)
    return data
  }
}
