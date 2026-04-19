// ============================================================
// Providers, Locations, Team & Roles Routes
// ============================================================

import { Router } from '../router'
import { validate, CreateProviderSchema, UpdateProviderSchema, CreateLocationSchema, CreateTeamMemberSchema } from '../../lib/schemas'
import { requireAuth, checkPermission } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { ProviderService, LocationService, TeamService } from '../../services'
import { rateLimit, getClientIp } from './helpers'

export function registerProviderRoutes(router: Router) {

  // ============================================================
  // PROVIDERS
  // ============================================================

  router.get('/api/providers', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Return only the authenticated provider's data — never list all providers
    const provider = await ProviderService.getById(auth.providerId)
    const providers = provider ? [provider] : []
    res.json({ data: providers, count: providers.length })
  })

  router.get('/api/providers/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (req.params.id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    const provider = await ProviderService.getById(auth.providerId)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    res.json({ data: provider })
  })

  router.get('/api/providers/slug/:slug', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const provider = await ProviderService.getBySlug(req.params.slug)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    if (provider.id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    res.json({ data: provider })
  })

  router.post('/api/providers', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateProviderSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const provider = await ProviderService.create(parsed.data as any)
    res.status(201).json({ data: provider })
  })

  router.put('/api/providers/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (req.params.id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    const parsed = validate(UpdateProviderSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const provider = await ProviderService.update(auth.providerId, parsed.data as any)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    res.json({ data: provider })
  })

  router.post('/api/providers/:id/activate', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (req.params.id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    const provider = await ProviderService.activate(auth.providerId)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    res.json({ data: provider })
  })

  router.post('/api/providers/:id/change-plan', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (req.params.id !== auth.providerId) return res.error(403, 'Zugriff verweigert')
    const { plan } = req.body as { plan: string }
    const provider = await ProviderService.changePlan(auth.providerId, plan as any)
    if (!provider) return res.error(404, 'Provider nicht gefunden')
    res.json({ data: provider })
  })

  // ============================================================
  // LOCATIONS
  // ============================================================

  router.get('/api/providers/:providerId/locations', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const locations = await LocationService.listByProvider(auth.providerId)
    res.json({ data: locations })
  })

  router.post('/api/providers/:providerId/locations', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateLocationSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const location = await LocationService.create({ ...parsed.data as any, providerId: auth.providerId })
    res.status(201).json({ data: location })
  })

  router.put('/api/locations/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const location = await LocationService.update(req.params.id, req.body as any, auth.providerId)
    if (!location) return res.error(404, 'Standort nicht gefunden')
    res.json({ data: location })
  })

  // ============================================================
  // TEAM
  // ============================================================

  router.get('/api/providers/:providerId/team', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const members = await TeamService.list(auth.providerId)
    res.json({ data: members })
  })

  router.post('/api/providers/:providerId/team', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'team', 'invite')) return
    // Validate with Zod schema
    const parsed = validate(CreateTeamMemberSchema, { ...req.body, providerId: auth.providerId })
    if ('error' in parsed) return res.error(400, parsed.error)
    const { name, email, role, specializations } = parsed.data
    const { phone, permissions } = req.body as any
    const result = await TeamService.create({ providerId: auth.providerId, name, email, phone: phone?.slice?.(0, 30) || '', role: role || 'instructor', permissions, specializations })
    res.status(201).json({ data: result })
  })

  router.put('/api/team/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'team', 'edit')) return
    // Whitelist allowed update fields
    const { name, email, phone, role, specializations, status, permissions: perms } = req.body as any
    const updates: Record<string, unknown> = {}
    if (name) updates.name = String(name).slice(0, 100)
    if (email) updates.email = String(email).slice(0, 200)
    if (phone) updates.phone = String(phone).slice(0, 30)
    if (role && ['owner', 'admin', 'manager', 'staff', 'instructor', 'assistant'].includes(role)) updates.role = role
    if (specializations) updates.specializations = specializations
    if (status && ['active', 'inactive'].includes(status)) updates.status = status
    if (perms && typeof perms === 'object') updates.permissions = perms
    const member = await TeamService.update(req.params.id, updates, auth.providerId)
    if (!member) return res.error(404, 'Teammitglied nicht gefunden')
    res.json({ data: member })
  })

  router.delete('/api/team/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'team', 'edit')) return
    await TeamService.delete(req.params.id, auth.providerId)
    res.json({ success: true })
  })

  router.post('/api/team/:id/invite', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'team', 'invite')) return
    const result = await TeamService.invite(req.params.id, auth.providerId)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  // Verify invite token (public — called from invite acceptance page)
  router.get('/api/team/invite/verify', async (req, res) => {
    const token = req.query?.token as string
    if (!token) return res.error(400, 'Token fehlt')
    const db = getServiceClient()
    const { data: member } = await db.from('team_members')
      .select('id, name, email, role, provider_id, user_id, invite_token')
      .eq('invite_token', token).maybeSingle()
    if (!member) return res.error(404, 'Einladung nicht gefunden oder abgelaufen')
    if (member.user_id) return res.error(400, 'Einladung bereits angenommen')
    // Get provider name for display
    const { data: provider } = await db.from('providers').select('company_name, display_name').eq('id', member.provider_id).maybeSingle()
    res.json({ data: { name: member.name, email: member.email, role: member.role, providerName: provider?.display_name || provider?.company_name || '' } })
  })

  // Accept invite — create auth user + link to team member (public)
  router.post('/api/team/invite/accept', async (req, res) => {
    const { token, password } = req.body as { token?: string; password?: string }
    if (!token || !password) return res.error(400, 'Token und Passwort erforderlich')
    if (password.length < 8) return res.error(400, 'Passwort muss mindestens 8 Zeichen lang sein')
    // Rate limit
    const ip = getClientIp(req)
    if (!rateLimit(`invite-accept:${ip}`, 5, 15 * 60 * 1000)) return res.error(429, 'Zu viele Versuche')

    const db = getServiceClient()
    const { data: member } = await db.from('team_members')
      .select('id, name, email, role, provider_id, user_id, invite_token')
      .eq('invite_token', token).maybeSingle()
    if (!member) return res.error(404, 'Einladung nicht gefunden')
    if (member.user_id) return res.error(400, 'Einladung bereits angenommen')

    // Create auth user
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email: member.email, password, email_confirm: true,
    })
    if (authError) {
      // User might already exist (e.g. owner with same email)
      if (authError.message?.includes('already been registered')) {
        return res.error(400, 'E-Mail ist bereits registriert. Bitte melde dich direkt an.')
      }
      return res.error(500, 'Fehler beim Erstellen des Kontos: ' + authError.message)
    }

    // Link auth user to team member + set provider login_email
    await db.from('team_members').update({
      user_id: authData.user.id,
      invite_token: null, // Clear token after use
      last_login_at: new Date().toISOString(),
    }).eq('id', member.id)

    // Set user metadata with provider_id
    await db.auth.admin.updateUserById(authData.user.id, {
      user_metadata: { provider_id: member.provider_id, team_member_id: member.id },
    })

    res.json({ data: { email: member.email, name: member.name } })
  })

  // Get available roles and permissions
  router.get('/api/roles', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { DEFAULT_ROLE_PERMISSIONS } = await import('../../types')
    res.json({ data: { defaults: DEFAULT_ROLE_PERMISSIONS, roles: ['owner', 'admin', 'manager', 'staff'] } })
  })

  // Get current user's role and permissions
  router.get('/api/me', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    res.json({ data: { userId: auth.userId, email: auth.email, providerId: auth.providerId, role: auth.role, permissions: auth.permissions } })
  })
}
