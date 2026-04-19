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
  }) {
    const db = getServiceClient()

    // 1. Find or create parent
    let { data: parent } = await db.from('parents')
      .select('id').eq('email', params.parentEmail).maybeSingle()

    if (!parent) {
      const { data: newParent, error: parentErr } = await db.from('parents').insert({
        name: `${params.parentFirstName} ${params.parentLastName}`.trim(),
        email: params.parentEmail,
        phone: params.parentPhone || null,
      }).select('id').single()
      if (parentErr) throw new Error('Parent-Erstellung fehlgeschlagen: ' + parentErr.message)
      parent = newParent
    }

    if (!parent) throw new Error('Parent konnte nicht erstellt werden')

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
            const { data: provider } = await db.from('providers').select('company_name').eq('id', params.providerId).single()
            await EmailService.sendWaitlistConfirmation(params.parentEmail, {
              parentName: params.parentFirstName,
              childName: (params.childFirstName + ' ' + params.childLastName).trim(),
              courseName: activity?.title || 'Kurs',
              providerName: provider?.company_name || '',
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
        const { data: provider } = await db.from('providers').select('company_name').eq('id', params.providerId).single()
        const slot = activity?.schedule?.slots?.[0]
        const dayMap: Record<string, string> = { MO: 'Montags', TU: 'Dienstags', WE: 'Mittwochs', TH: 'Donnerstags', FR: 'Freitags', SA: 'Samstags', SU: 'Sonntags' }
        await EmailService.sendBookingConfirmation(params.parentEmail, {
          parentName: params.parentFirstName,
          childName: `${params.childFirstName} ${params.childLastName}`,
          courseName: activity?.title || 'Kurs',
          date: activity?.schedule?.startDate || '',
          time: slot ? `${slot.startTime}–${slot.endTime}` : '',
          providerName: provider?.company_name || '',
        })
      } catch (emailErr) {
        console.error('Confirmation email failed:', emailErr)
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
            price_paid: params.amount > 0 ? params.amount / 100 : 0,
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

    // Normal checkout: atomic capacity check via DB function
    // Uses SELECT ... FOR UPDATE to lock the block row, preventing TOCTOU race conditions
    const { data: rpcResult, error: rpcError } = await db.rpc('atomic_create_booking', {
      p_activity_id: params.activityId,
      p_amount: params.paymentMethod !== 'onsite' ? params.amount / 100 : params.amount / 100,
      p_block_id: activeBlock.id,
      p_booked_date: params.bookedDate || null,
      p_child_info: childInfo,
      p_currency: params.currency || 'EUR',
      p_parent_id: parent.id,
      p_payment_method: params.paymentMethod,
      p_paypal_order_id: params.paypalOrderId || null,
      p_provider_id: params.providerId,
      p_source: 'widget',
      p_stripe_session_id: params.stripeSessionId || null,
    })

    if (rpcError) throw new Error(rpcError.message)
    if (rpcResult?.error) {
      // If course is full but block exists → add to waitlist instead of error
      if (rpcResult.error.includes('ausgebucht') && activeBlock) {
        const { count: existingWl } = await db.from('waitlist_entries')
          .select('*', { count: 'exact', head: true })
          .eq('activity_id', params.activityId).eq('parent_id', parent.id)
          .in('status', ['waiting', 'offered'])
        if (!existingWl || existingWl === 0) {
          // Use Date.now() for position to avoid race condition with parallel requests
          await db.from('waitlist_entries').insert({
            activity_id: params.activityId, parent_id: parent.id,
            child_info: { firstName: params.childFirstName, lastName: params.childLastName, birthYear: params.childBirthYear },
            position: Date.now(), priority: 'normal', status: 'waiting',
          })
          // Notify provider
          await db.from('notifications').insert({
            recipient_type: 'provider', recipient_id: params.providerId,
            type: 'block_full', channel: 'in_app',
            title: 'Kurs ist voll — Warteliste!',
            body: params.childFirstName + ' wurde auf die Warteliste gesetzt.',
            data: { activityId: params.activityId },
          })
          // Send waitlist confirmation email
          try {
            const { EmailService } = await import('../../lib/email')
            const { data: activity } = await db.from('activities').select('title').eq('id', params.activityId).maybeSingle()
            const { data: provider } = await db.from('providers').select('company_name').eq('id', params.providerId).single()
            await EmailService.sendWaitlistConfirmation(params.parentEmail, {
              parentName: params.parentFirstName,
              childName: (params.childFirstName + ' ' + params.childLastName).trim(),
              courseName: activity?.title || 'Kurs',
              providerName: provider?.company_name || '',
            })
          } catch (emailErr) {
            console.error('[Checkout] Waitlist email failed:', emailErr)
          }
        }
        throw new Error('Tut uns leid — da war leider jemand schneller! 😅 Aber keine Sorge, wir haben ' + params.childFirstName + ' auf die Warteliste gesetzt. Sobald ein Platz frei wird, melden wir uns sofort bei dir!')
      }
      throw new Error(rpcResult.error)
    }

    const booking = { id: rpcResult.id, ...rpcResult }

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

    // 4. Send confirmation email (non-blocking)
    try {
      const { EmailService } = await import('../../lib/email')
      const { data: activity } = await db.from('activities').select('title, pricing, schedule').eq('id', params.activityId).single()
      const { data: provider } = await db.from('providers').select('company_name').eq('id', params.providerId).single()
      const pkgSize = activity?.pricing?.[0]?.packageSize || 0
      const slot = activity?.schedule?.slots?.[0]
      const dayMap: Record<string, string> = { MO: 'Montags', TU: 'Dienstags', WE: 'Mittwochs', TH: 'Donnerstags', FR: 'Freitags', SA: 'Samstags', SU: 'Sonntags' }
      await EmailService.sendBookingConfirmation(params.parentEmail, {
        parentName: params.parentFirstName,
        childName: `${params.childFirstName} ${params.childLastName}`,
        courseName: activity?.title || 'Kurs',
        date: activity?.schedule?.startDate || '',
        time: slot ? `${slot.startTime}–${slot.endTime}` : '',
        providerName: provider?.company_name || '',
        packageInfo: pkgSize > 1 ? `${pkgSize} Termine · ${dayMap[slot?.day] || ''}` : undefined,
        amount: params.amount > 0 ? `${(params.amount / 100).toFixed(2).replace('.', ',')} €` : undefined,
      })
    } catch (emailErr) {
      console.error('Confirmation email failed:', emailErr)
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
