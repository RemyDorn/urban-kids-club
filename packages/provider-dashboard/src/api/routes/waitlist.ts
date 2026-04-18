// ============================================================
// Waitlist Routes — including public confirm/decline endpoints
// ============================================================

import { Router } from '../router'
import { validate, AddToWaitlistSchema } from '../../lib/schemas'
import { requireAuth } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { WaitlistService } from '../../services'
import { WaitlistConversionWorkflow } from '../../services/workflows'
import { escHtml, htmlPage, successPageWithRedirect } from './helpers'

export function registerWaitlistRoutes(router: Router) {

  router.get('/api/activities/:activityId/waitlist', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const entries = await WaitlistService.listByActivity(req.params.activityId)
    res.json({ data: entries, count: entries.length })
  })

  router.post('/api/waitlist', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(AddToWaitlistSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await WaitlistService.add(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  // Public: Confirm or decline waitlist offer (linked from email)
  router.get('/api/waitlist/:id/confirm', async (_req, res) => {
    const db = getServiceClient()
    const token = _req.query.token
    const { data: entry } = await db.from('waitlist_entries')
      .select('*, parents!inner(name, email), activities!inner(title, provider_id, capacity, pricing, payment_online, payment_onsite)')
      .eq('id', _req.params.id).eq('status', 'offered').maybeSingle()

    if (!entry) {
      return res.html(htmlPage('⚠️', 'Nicht mehr gültig', 'Dieses Angebot wurde bereits bestätigt, abgelehnt oder ist abgelaufen.', '#f59e0b'))
    }

    // Verify token (mandatory)
    if (!token || !entry.confirm_token || token !== entry.confirm_token) {
      return res.html(htmlPage('🔒', 'Ungültiger Link', 'Dieser Bestätigungslink ist ungültig oder abgelaufen.', '#ef4444'))
    }

    // Check if expired
    if (entry.expires_at && new Date(entry.expires_at) < new Date()) {
      await db.from('waitlist_entries').update({ status: 'expired' }).eq('id', _req.params.id)
      return res.html(htmlPage('⏰', 'Leider abgelaufen', 'Das Angebot ist abgelaufen. Bitte kontaktiere den Anbieter für einen neuen Termin.', '#ef4444'))
    }

    const activity = (entry as any).activities
    const parent = (entry as any).parents
    const courseName = escHtml(activity?.title || 'den Kurs')
    // If online payment is available, always redirect to Stripe (customer pays first)
    const requiresOnlinePayment = !!activity?.payment_online

    // If online-only course → show payment page with Stripe checkout
    if (requiresOnlinePayment) {
      const pricing = activity.pricing as any[] | undefined
      const price = pricing?.[0]?.amount ?? pricing?.[0]?.price ?? 0
      const { data: provider } = await db.from('providers').select('company_name, slug').eq('id', activity.provider_id).single()

      // Create Stripe checkout session
      let checkoutUrl = ''
      try {
        const { stripe } = await import('../../lib/stripe')
        if (stripe) {
          const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
              price_data: {
                currency: 'eur',
                product_data: { name: activity.title || 'Kurs' },
                unit_amount: Math.round(price * 100), // Stripe expects cents
              },
              quantity: 1,
            }],
            mode: 'payment',
            success_url: origin + '/api/waitlist/' + _req.params.id + '/payment-success?session_id={CHECKOUT_SESSION_ID}&token=' + token,
            cancel_url: origin + '/api/waitlist/' + _req.params.id + '/confirm?token=' + token,
            customer_email: parent.email,
            metadata: {
              waitlistId: _req.params.id,
              activityId: entry.activity_id,
              providerId: activity.provider_id,
              parentId: entry.parent_id,
            },
          })
          checkoutUrl = session.url || ''
        }
      } catch (stripeErr) {
        console.error('[Waitlist] Stripe checkout creation failed:', stripeErr)
      }

      if (checkoutUrl) {
        // Redirect directly to Stripe checkout
        return res.html('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=' + checkoutUrl + '"></head><body><p>Weiterleitung zur Zahlung...</p></body></html>')
      }

      // Stripe not available — show info page
      return res.html(htmlPage(
        '💳',
        'Fast geschafft!',
        '<strong>' + courseName + '</strong> kostet <strong>' + Number(price).toFixed(2).replace('.', ',') + ' €</strong> und muss vor der Teilnahme bezahlt werden.<br><br>' +
        'Bitte kontaktiere <strong>' + escHtml(provider?.company_name || '') + '</strong> direkt für die Zahlungsabwicklung.',
        '#B5533A'
      ))
    }

    // Onsite payment → create booking directly
    try {
      const { CheckoutService } = await import('../../services/supabase/checkout.service')
      await CheckoutService.createBooking({
        providerId: activity.provider_id,
        activityId: entry.activity_id,
        skipBlockCheck: true,
        childFirstName: entry.child_info?.firstName || '',
        childLastName: entry.child_info?.lastName || '',
        childBirthYear: entry.child_info?.birthYear || 2020,
        parentFirstName: parent.name.split(' ')[0],
        parentLastName: parent.name.split(' ').slice(1).join(' '),
        parentEmail: parent.email,
        parentPhone: '',
        paymentMethod: 'onsite',
        amount: 0,
        currency: 'EUR',
      })
    } catch (bookErr: any) {
      console.error('[Waitlist] Booking creation failed:', bookErr)
      return res.html(htmlPage('❌', 'Buchung fehlgeschlagen', escHtml(bookErr.message || 'Bitte kontaktiere den Anbieter.'), '#ef4444'))
    }

    // Booking succeeded — now mark waitlist entry as accepted
    await db.from('waitlist_entries').update({ status: 'accepted' }).eq('id', _req.params.id)

    // Check for redirect URL
    const { data: provRedir } = await db.from('providers').select('redirect_after_booking, booking_redirect_url').eq('id', activity.provider_id).single()
    const redirectUrl = provRedir?.redirect_after_booking || provRedir?.booking_redirect_url || null

    res.html(successPageWithRedirect('Buchung bestätigt!', 'Dein Platz für <strong>' + courseName + '</strong> ist reserviert. Du erhältst eine Bestätigung per E-Mail.', redirectUrl))
  })

  // Payment success callback after Stripe checkout for waitlist confirmations
  router.get('/api/waitlist/:id/payment-success', async (_req, res) => {
    const db = getServiceClient()
    const token = _req.query.token
    const sessionId = _req.query.session_id

    const { data: entry } = await db.from('waitlist_entries')
      .select('*, parents!inner(name, email), activities!inner(title, provider_id, pricing)')
      .eq('id', _req.params.id).maybeSingle()

    if (!entry) {
      return res.html(htmlPage('⚠️', 'Nicht gefunden', 'Wartelisten-Eintrag nicht gefunden.', '#f59e0b'))
    }
    if (!token || entry.confirm_token !== token) {
      return res.html(htmlPage('🔒', 'Ungültiger Link', 'Dieser Link ist ungültig.', '#ef4444'))
    }

    const activity = (entry as any).activities
    const parent = (entry as any).parents
    const pricing = activity.pricing as any[] | undefined
    const price = pricing?.[0]?.amount ?? 0

    // Create the booking with payment info
    try {
      const { CheckoutService } = await import('../../services/supabase/checkout.service')
      await CheckoutService.createBooking({
        providerId: activity.provider_id,
        activityId: entry.activity_id,
        skipBlockCheck: true,
        childFirstName: entry.child_info?.firstName || '',
        childLastName: entry.child_info?.lastName || '',
        childBirthYear: entry.child_info?.birthYear || 2020,
        parentFirstName: parent.name.split(' ')[0],
        parentLastName: parent.name.split(' ').slice(1).join(' '),
        parentEmail: parent.email,
        parentPhone: '',
        paymentMethod: 'stripe',
        amount: Math.round(price * 100), // cents for checkout service
        currency: 'EUR',
        stripeSessionId: sessionId as string || undefined,
      })
    } catch (bookErr: any) {
      console.error('[Waitlist] Payment-success booking failed:', bookErr)
      return res.html(htmlPage('❌', 'Buchung fehlgeschlagen', escHtml(bookErr.message || 'Bitte kontaktiere den Anbieter.'), '#ef4444'))
    }

    await db.from('waitlist_entries').update({ status: 'accepted' }).eq('id', _req.params.id)

    // Check for redirect URL
    const { data: provRedir } = await db.from('providers').select('redirect_after_booking, booking_redirect_url').eq('id', activity.provider_id).single()
    const redirectUrl = provRedir?.redirect_after_booking || provRedir?.booking_redirect_url || null

    const courseName = escHtml(activity?.title || 'den Kurs')
    res.html(successPageWithRedirect('Zahlung erfolgreich!', 'Dein Platz für <strong>' + courseName + '</strong> ist bestätigt und bezahlt. Du erhältst eine Bestätigung per E-Mail. 🎉', redirectUrl))
  })

  router.get('/api/waitlist/:id/decline-offer', async (_req, res) => {
    const db = getServiceClient()
    const token = _req.query.token
    const { data: entry } = await db.from('waitlist_entries')
      .select('activity_id, position, confirm_token').eq('id', _req.params.id).eq('status', 'offered').maybeSingle()

    if (!entry) {
      return res.html(htmlPage('⚠️', 'Nicht mehr gültig', 'Dieses Angebot ist nicht mehr verfügbar.', '#f59e0b'))
    }

    // Verify token (mandatory)
    if (!token || !entry.confirm_token || token !== entry.confirm_token) {
      return res.html(htmlPage('🔒', 'Ungültiger Link', 'Dieser Link ist ungültig oder abgelaufen.', '#ef4444'))
    }

    await db.from('waitlist_entries').update({ status: 'declined' }).eq('id', _req.params.id)

    // Auto-offer to next person on waitlist
    const { data: nextEntry } = await db.from('waitlist_entries')
      .select('id').eq('activity_id', entry.activity_id).eq('status', 'waiting')
      .order('position', { ascending: true }).limit(1).maybeSingle()

    if (nextEntry) {
      console.log('[Waitlist] Auto-offering to next entry:', nextEntry.id)
    }

    res.html(htmlPage('👋', 'Schade!', 'Du hast den Platz abgelehnt. Wir hoffen, dich beim nächsten Mal dabei zu haben!', '#6b7280'))
  })

  // Offer waitlist spot to parent (changes status, sends email)
  router.post('/api/waitlist/:id/offer', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const db = getServiceClient()

    // Get waitlist entry with parent + activity info
    const { data: entry } = await db.from('waitlist_entries')
      .select('*, parents!inner(name, email), activities!inner(title, pricing, payment_online, payment_onsite)')
      .eq('id', req.params.id).in('status', ['waiting', 'offered', 'expired']).single()
    if (!entry) return res.error(404, 'Wartelisten-Eintrag nicht gefunden')

    // Generate secure token for confirm/decline links
    const { randomBytes } = await import('node:crypto')
    const confirmToken = randomBytes(24).toString('hex')

    // Update status to "offered" with token
    await db.from('waitlist_entries')
      .update({ status: 'offered', notified_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        confirm_token: confirmToken })
      .eq('id', req.params.id)

    // Send notification email
    try {
      const { EmailService } = await import('../../lib/email')
      const parent = (entry as any).parents
      const activity = (entry as any).activities
      const { data: provider } = await db.from('providers').select('company_name, slug').eq('id', auth.providerId).single()

      const childName = entry.child_info?.firstName ? (entry.child_info.firstName + ' ' + (entry.child_info.lastName || '')) : 'Ihr Kind'
      const hasOnlinePayment = activity?.payment_online

      // Build confirm/decline links with token
      const origin = process.env.APP_PUBLIC_URL || (req.raw.headers.host ? 'https://' + req.raw.headers.host : 'https://dev.urbankids.club')
      const confirmLink = origin + '/api/waitlist/' + req.params.id + '/confirm?token=' + confirmToken
      const declineLink = origin + '/api/waitlist/' + req.params.id + '/decline-offer?token=' + confirmToken

      await EmailService.sendWaitlistOffer(parent.email, {
        parentName: parent.name.split(' ')[0],
        childName,
        courseName: activity?.title || 'Kurs',
        providerName: provider?.company_name || '',
        confirmLink,
        declineLink,
      })
      console.log('[Waitlist] Offer email sent to ' + parent.email)
    } catch (emailErr) {
      console.error('[Waitlist] Email failed:', emailErr)
    }

    res.json({ data: { id: req.params.id, status: 'offered' } })
  })

  router.post('/api/waitlist/:id/accept', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { pricingOptionId } = req.body as { pricingOptionId: string }
    const result = await WaitlistConversionWorkflow.acceptAndBook(req.params.id, pricingOptionId)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.post('/api/waitlist/:id/decline', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const entry = await WaitlistService.decline(req.params.id)
    if (!entry) return res.error(400, 'Konnte nicht abgelehnt werden')
    res.json({ data: entry })
  })
}
