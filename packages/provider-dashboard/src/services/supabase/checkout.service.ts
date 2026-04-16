import { getServiceClient } from '../../lib/supabase'

export class CheckoutService {
  static async createBooking(params: {
    providerId: string
    activityId: string
    blockId?: string
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

    // 2. Verify active block exists for this course (no block = no booking)
    const { data: activeBlock } = await db.from('course_blocks')
      .select('id, capacity, makeup_capacity')
      .eq('activity_id', params.activityId)
      .in('status', ['active', 'upcoming'])
      .order('start_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!activeBlock) {
      // No active block → add to waitlist as pre-registration
      const { count: existingWaitlist } = await db.from('waitlist_entries')
        .select('*', { count: 'exact', head: true })
        .eq('activity_id', params.activityId)
        .eq('parent_id', parent.id)
        .in('status', ['waiting', 'offered'])

      if (!existingWaitlist || existingWaitlist === 0) {
        await db.from('waitlist_entries').insert({
          activity_id: params.activityId,
          parent_id: parent.id,
          child_info: { firstName: params.childFirstName, lastName: params.childLastName, birthYear: params.childBirthYear },
          position: 1, // Will be recalculated
          priority: 'normal',
          status: 'waiting',
        })
      }
      throw new Error('Aktuell keine Termine verfügbar. Sie wurden auf die Warteliste gesetzt und werden benachrichtigt, sobald ein neuer Kursblock startet.')
    }

    // 3. Create booking atomically (capacity + duplicate check in one transaction)
    const childInfo = {
      firstName: params.childFirstName,
      lastName: params.childLastName,
      birthYear: params.childBirthYear,
    }
    const { data: rpcResult, error: rpcError } = await db.rpc('create_booking_atomic', {
      p_provider_id: params.providerId,
      p_activity_id: params.activityId,
      p_parent_id: parent.id,
      p_child_info: childInfo,
      p_payment_method: params.paymentMethod,
      p_amount: params.paymentMethod !== 'onsite' ? params.amount / 100 : 0,
      p_currency: params.currency || 'EUR',
      p_source: 'widget',
      p_stripe_session_id: params.stripeSessionId || null,
      p_paypal_order_id: params.paypalOrderId || null,
      p_booked_date: params.bookedDate || null,
    })

    if (rpcError) throw new Error(rpcError.message)
    if (rpcResult?.error) throw new Error(rpcResult.error)

    const booking = { id: rpcResult.id, ...rpcResult }

    // 4. Auto-enroll in the active block
    try {
      // Check if provider has makeup system enabled
      const { data: providerSettings } = await db.from('providers')
        .select('makeup_enabled').eq('id', params.providerId).single()
      const makeupEnabled = providerSettings?.makeup_enabled ?? false

      {
        // If makeup disabled: all slots are fixed. If enabled: reserve makeup_capacity slots.
        const fixedSlots = makeupEnabled
          ? activeBlock.capacity - (activeBlock.makeup_capacity || 2)
          : activeBlock.capacity
        const { count: enrolledCount } = await db.from('block_enrollments')
          .select('*', { count: 'exact', head: true })
          .eq('block_id', activeBlock.id)
          .eq('status', 'active')

        const currentCount = enrolledCount ?? 0
        const childId = `${params.childFirstName}-${params.childLastName}-${params.childBirthYear}`
        const childAge = new Date().getFullYear() - params.childBirthYear

        if (currentCount < fixedSlots) {
          // Auto-enroll: fixed slot available
          await db.from('block_enrollments').insert({
            block_id: activeBlock.id,
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
          console.log(`[Checkout] Auto-enrolled ${params.childFirstName} in block ${activeBlock.id} (${currentCount + 1}/${fixedSlots} fixed slots)`)
        } else if (currentCount < activeBlock.capacity) {
          // Makeup slots territory — booking stays confirmed, provider decides manually
          console.log(`[Checkout] Block ${activeBlock.id} fixed slots full (${currentCount}/${fixedSlots}). Booking ${booking.id} needs manual enrollment (makeup slot).`)
        } else {
          // Block completely full — add to waitlist
          const { count: existingWaitlist } = await db.from('waitlist_entries')
            .select('*', { count: 'exact', head: true })
            .eq('activity_id', params.activityId)
            .in('status', ['waiting', 'offered'])
          const nextPosition = (existingWaitlist ?? 0) + 1

          await db.from('waitlist_entries').insert({
            activity_id: params.activityId,
            parent_id: parent.id,
            child_info: { firstName: params.childFirstName, lastName: params.childLastName, birthYear: params.childBirthYear },
            position: nextPosition,
            priority: 'normal',
            status: 'waiting',
          })
          console.log(`[Checkout] Block ${activeBlock.id} voll (${currentCount}/${activeBlock.capacity}). ${params.childFirstName} auf Warteliste (Position ${nextPosition}).`)

          // Notify provider: block is full
          await db.from('notifications').insert({
            recipient_type: 'provider',
            recipient_id: params.providerId,
            type: 'block_full',
            channel: 'in_app',
            title: 'Kursblock ist voll!',
            body: `Der Block für "${params.activityId}" ist ausgebucht. Es gibt Interessenten auf der Warteliste. Möchten Sie einen neuen Block erstellen?`,
            data: { blockId: activeBlock.id, activityId: params.activityId, waitlistCount: 1 },
          })
          console.log(`[Checkout] Provider ${params.providerId} notified: block full, waitlist entry created.`)
        }
      }
    } catch (enrollErr) {
      // Non-blocking: booking is already created, enrollment failure shouldn't break checkout
      console.error('[Checkout] Auto-enrollment failed:', enrollErr)
    }

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
