// ============================================================
// Parent Portal (Eltern-Portal) Routes
// ============================================================

import { Router } from '../router'
import { requireAuth } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { rateLimit, getClientIp } from './helpers'

export function registerPortalRoutes(router: Router) {

  // Magic link: send login email
  router.post('/api/portal/login', async (req, res) => {
    const { email } = req.body as { email?: string }
    if (!email) return res.error(400, 'E-Mail ist erforderlich')
    // Rate limit: 5 login attempts per email per hour
    if (!rateLimit(`portal-login:${email.toLowerCase().trim()}`, 5, 60 * 60 * 1000)) return res.error(429, 'Zu viele Login-Versuche. Bitte später erneut probieren.')
    const sb = getServiceClient()
    const { data: parent } = await sb.from('parents').select('id, name').ilike('email', email.trim()).maybeSingle()
    // Always return success (don't leak whether email exists)
    if (!parent) return res.json({ success: true })

    const { randomBytes } = await import('node:crypto')
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 min

    await sb.from('parent_auth_tokens').insert({ parent_id: parent.id, token, expires_at: expiresAt })

    const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
    try {
      const { EmailService } = await import('../../lib/email')
      await EmailService.send({
        to: email.trim(),
        subject: 'Dein Login-Link — Urban Kids Club',
        html: `
          <div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;color:#3C2225;">
            <div style="background:linear-gradient(135deg,#D4956A,#c4854a);padding:32px;border-radius:16px 16px 0 0;text-align:center;">
              <h1 style="color:white;margin:0;font-size:24px;">Dein Login-Link</h1>
            </div>
            <div style="padding:32px;background:#FFF9F5;border-radius:0 0 16px 16px;">
              <p>Hey ${parent.name},</p>
              <p>klicke auf den Button um dich einzuloggen:</p>
              <div style="text-align:center;margin:24px 0;">
                <a href="${origin}/portal/?token=${token}" style="display:inline-block;background:#D4956A;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;">Zum Eltern-Portal</a>
              </div>
              <p style="color:#94a3b8;font-size:12px;">Dieser Link ist 15 Minuten gültig.</p>
            </div>
          </div>
        `,
      })
    } catch (e) { console.error('[Portal] Login email failed:', e) }

    res.json({ success: true })
  })

  // Verify magic link token → create session
  router.post('/api/portal/verify', async (req, res) => {
    const { token } = req.body as { token?: string }
    if (!token) return res.error(400, 'Token fehlt')
    // Rate limit: 10 verify attempts per IP per 15 minutes (prevent token guessing)
    const ip = getClientIp(req)
    if (!rateLimit(`portal-verify:${ip}`, 10, 15 * 60 * 1000)) return res.error(429, 'Zu viele Versuche. Bitte warten.')
    const sb = getServiceClient()
    const { data: authToken } = await sb.from('parent_auth_tokens')
      .select('id, parent_id, expires_at, used_at')
      .eq('token', token).maybeSingle()

    if (!authToken || authToken.used_at) return res.error(401, 'Ungültiger oder bereits verwendeter Link')
    if (new Date(authToken.expires_at) < new Date()) return res.error(401, 'Link abgelaufen — bitte fordere einen neuen an')

    // Mark token as used
    await sb.from('parent_auth_tokens').update({ used_at: new Date().toISOString() }).eq('id', authToken.id)

    // Create session (valid 30 days)
    const { randomBytes } = await import('node:crypto')
    const sessionToken = randomBytes(32).toString('hex')
    await sb.from('parent_sessions').insert({
      parent_id: authToken.parent_id,
      session_token: sessionToken,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })

    const { data: parent } = await sb.from('parents').select('id, name, email, children').eq('id', authToken.parent_id).single()
    res.json({ data: { sessionToken, parent } })
  })

  // Helper: authenticate parent from session token
  async function requireParentAuth(req: any, res: any): Promise<{ parentId: string } | null> {
    const authHeader = req.raw?.headers?.authorization || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) { res.error(401, 'Nicht eingeloggt'); return null }
    const sb = getServiceClient()
    const { data: session } = await sb.from('parent_sessions')
      .select('parent_id, expires_at').eq('session_token', token).maybeSingle()
    if (!session || new Date(session.expires_at) < new Date()) { res.error(401, 'Sitzung abgelaufen'); return null }
    return { parentId: session.parent_id }
  }

  // Get parent profile
  router.get('/api/portal/me', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data: parent } = await sb.from('parents').select('id, name, email, phone, children').eq('id', auth.parentId).single()
    res.json({ data: parent })
  })

  // Get parent's bookings across all providers
  router.get('/api/portal/bookings', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data: bookings } = await sb.from('provider_bookings')
      .select('id, activity_id, provider_id, child_info, status, payment_status, payment_method, amount_paid, currency, created_at')
      .eq('parent_id', auth.parentId).order('created_at', { ascending: false })

    // Enrich with activity titles + provider names
    const actIds = [...new Set((bookings ?? []).map((b: any) => b.activity_id))]
    const provIds = [...new Set((bookings ?? []).map((b: any) => b.provider_id))]
    const { data: acts } = actIds.length ? await sb.from('activities').select('id, title, schedule').in('id', actIds) : { data: [] }
    const { data: provs } = provIds.length ? await sb.from('providers').select('id, company_name').in('id', provIds) : { data: [] }
    const actMap = new Map((acts ?? []).map((a: any) => [a.id, a]))
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, p.company_name]))

    const enriched = (bookings ?? []).map((b: any) => ({
      ...b,
      activityTitle: actMap.get(b.activity_id)?.title || 'Kurs',
      providerName: provMap.get(b.provider_id) || 'Anbieter',
      schedule: actMap.get(b.activity_id)?.schedule || null,
    }))
    res.json({ data: enriched })
  })

  // Get parent's invoices
  router.get('/api/portal/invoices', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data } = await sb.from('invoices')
      .select('id, number, status, total, currency, issued_at, due_date, paid_at')
      .eq('parent_id', auth.parentId).order('issued_at', { ascending: false })
    res.json({ data: data ?? [] })
  })

  // Get parent's messages
  router.get('/api/portal/messages', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data } = await sb.from('messages')
      .select('id, provider_id, sender_type, content, read_at, created_at')
      .eq('parent_id', auth.parentId).order('created_at', { ascending: false }).limit(50)

    // Get provider names
    const provIds = [...new Set((data ?? []).map((m: any) => m.provider_id))]
    const { data: provs } = provIds.length ? await sb.from('providers').select('id, company_name').in('id', provIds) : { data: [] }
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, p.company_name]))

    const enriched = (data ?? []).map((m: any) => ({ ...m, providerName: provMap.get(m.provider_id) || '' }))
    res.json({ data: enriched })
  })

  // Send message from parent to provider
  router.post('/api/portal/messages', async (req, res) => {
    const auth = await requireParentAuth(req, res)
    if (!auth) return
    const { providerId, content } = req.body as { providerId?: string; content?: string }
    if (!providerId || !content?.trim()) return res.error(400, 'Provider und Nachricht sind erforderlich')
    const sb = getServiceClient()
    const { data, error } = await sb.from('messages').insert({
      provider_id: providerId, parent_id: auth.parentId,
      sender_type: 'parent', content: content.trim(),
    }).select().single()
    if (error) throw error
    res.status(201).json({ data })
  })

  // Provider: get messages for a parent
  router.get('/api/parents/:parentId/messages', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const sb = getServiceClient()
    const { data } = await sb.from('messages')
      .select('*').eq('provider_id', auth.providerId).eq('parent_id', req.params.parentId)
      .order('created_at', { ascending: true })
    // Mark unread messages as read
    await sb.from('messages').update({ read_at: new Date().toISOString() })
      .eq('provider_id', auth.providerId).eq('parent_id', req.params.parentId)
      .eq('sender_type', 'parent').is('read_at', null)
    res.json({ data: data ?? [] })
  })

  // Provider: send message to parent
  router.post('/api/parents/:parentId/messages', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { content } = req.body as { content?: string }
    if (!content?.trim()) return res.error(400, 'Nachricht ist erforderlich')
    const sb = getServiceClient()
    const { data, error } = await sb.from('messages').insert({
      provider_id: auth.providerId, parent_id: req.params.parentId,
      sender_type: 'provider', content: content.trim(),
    }).select().single()
    if (error) throw error
    res.status(201).json({ data })
  })
}
