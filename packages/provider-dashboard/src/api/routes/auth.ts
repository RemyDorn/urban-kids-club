// ============================================================
// Auth Routes — Login & Register
// ============================================================

import { Router } from '../router'
import { getServiceClient } from '../../lib/supabase'
import { rateLimit, getClientIp } from './helpers'

export function registerAuthRoutes(router: Router) {

  router.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body as { email: string; password: string }
    if (!email || !password) return res.error(400, 'E-Mail und Passwort erforderlich')
    // Rate limit: per IP + per email (prevents both botnet and targeted brute-force)
    const ip = getClientIp(req)
    if (!rateLimit(`auth-login:${ip}`, 10, 15 * 60 * 1000)) return res.error(429, 'Zu viele Anmeldeversuche. Bitte warten.')
    if (!rateLimit(`auth-login-email:${email.toLowerCase().trim()}`, 5, 15 * 60 * 1000)) return res.error(429, 'Zu viele Anmeldeversuche für dieses Konto. Bitte warten.')
    const { loginProvider } = await import('../../lib/auth')
    const result = await loginProvider(email, password)
    if ('error' in result) return res.error(401, result.error)
    res.json({ data: result })
  })

  router.post('/api/auth/register', async (req, res) => {
    // Rate limit: 3 registrations per IP per hour
    const ip = getClientIp(req)
    if (!rateLimit(`register:${ip}`, 3, 60 * 60 * 1000)) return res.error(429, 'Zu viele Registrierungsversuche. Bitte später erneut probieren.')

    const { email, password, displayName, companyName, legalForm, contactName, phone, street, zip, city } = req.body as any

    if (!email || !password || !displayName || !companyName || !legalForm || !contactName || !phone || !street || !zip || !city) {
      return res.error(400, 'Alle Felder sind erforderlich')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.error(400, 'Ungültige E-Mail-Adresse')
    }
    if (password.length < 8) {
      return res.error(400, 'Passwort muss mindestens 8 Zeichen lang sein')
    }

    const db = getServiceClient()

    // 1. Deduplicate slug
    let slug = displayName.toLowerCase()
      .replace(/[äöüß]/g, (c: string) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' } as Record<string, string>)[c] ?? c)
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const { data: existingSlugs } = await db.from('providers').select('slug').like('slug', `${slug}%`)
    if (existingSlugs && existingSlugs.length > 0) {
      const taken = new Set(existingSlugs.map((r: any) => r.slug))
      let i = 2
      const base = slug
      while (taken.has(slug)) { slug = `${base}-${i++}` }
    }

    // 2. Create auth user (email_confirm: true — auto-approve for MVP)
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (authError) {
      if (authError.message.includes('already been registered')) {
        return res.error(409, 'Diese E-Mail-Adresse ist bereits registriert')
      }
      return res.error(500, 'Registrierung fehlgeschlagen: ' + authError.message)
    }

    // 3. Create provider record

    const { data: provider, error: provError } = await db
      .from('providers')
      .insert({
        display_name: displayName,
        company_name: companyName,
        legal_form: legalForm,
        contact_name: contactName,
        email: email,
        phone: phone,
        address_street: street,
        address_zip: zip,
        address_city: city,
        latitude: 0,
        longitude: 0,
        login_email: email,
        slug: slug,
        status: 'active',
        subscription: 'free',
      })
      .select()
      .single()

    if (provError) {
      // Rollback: delete auth user
      await db.auth.admin.deleteUser(authData.user.id)
      return res.error(500, 'Provider-Erstellung fehlgeschlagen: ' + provError.message)
    }

    // 4. Set provider_id in user metadata for auth middleware
    await db.auth.admin.updateUserById(authData.user.id, {
      user_metadata: { provider_id: provider.id }
    })

    // 5. Auto-add owner as team member (non-critical)
    try {
      await db.from('team_members').insert({
        provider_id: provider.id,
        name: contactName,
        email: email,
        phone: phone || '',
        role: 'owner',
        active: true,
        user_id: authData.user.id,
      })
    } catch (e) { console.error('[Register] Team member auto-create failed:', e) }

    // 6. Create lead entry for admin pipeline tracking (non-critical)
    try {
      await db.from('provider_leads').insert({
        company_name: companyName,
        contact_name: contactName,
        email: email,
        phone: phone,
        address_street: street,
        address_zip: zip,
        address_city: city,
        description: `Selbst-Registrierung über Provider Dashboard. Anzeigename: ${displayName}, Rechtsform: ${legalForm}`,
        status: 'active',
        converted_provider_id: provider.id,
      })
    } catch (_) { /* Non-critical */ }

    res.json({ success: true, provider })
  })
}
