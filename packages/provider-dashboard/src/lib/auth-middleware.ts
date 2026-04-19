// src/lib/auth-middleware.ts
import { supabase, getServiceClient } from './supabase'
import type { ParsedRequest, ApiResponse } from '../api/router'
import type { TeamPermissions, PermissionArea, PermissionAction, TeamRole } from '../types'

export interface AuthContext {
  userId: string
  email: string
  providerId: string
  role: TeamRole
  permissions: TeamPermissions
}

// Full permissions for owner/admin
const FULL_PERMISSIONS: TeamPermissions = {
  courses: ['view', 'create', 'edit', 'move', 'delete'],
  bookings: ['view', 'confirm', 'cancel'],
  customers: ['view', 'contact'],
  invoices: ['view', 'create', 'send'],
  team: ['view', 'invite', 'edit'],
  settings: ['view', 'edit'],
  marketing: ['view', 'edit'],
  embed: ['view', 'edit'],
  reports: ['view'],
  documents: ['view', 'upload'],
}

// Cache provider lookups for 5 minutes (with periodic eviction)
const providerCache = new Map<string, { providerId: string; role: TeamRole; permissions: TeamPermissions; expiresAt: number }>()
const CACHE_TTL = 5 * 60 * 1000
// Evict expired entries every 10 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of providerCache) {
    if (val.expiresAt < now) providerCache.delete(key)
  }
}, 10 * 60 * 1000).unref()

export async function authenticateRequest(req: ParsedRequest): Promise<AuthContext> {
  const token = req.raw.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    throw new AuthError(401, 'Nicht authentifiziert')
  }

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user || !user.email) {
    throw new AuthError(401, 'Token ungültig oder abgelaufen')
  }

  const cached = providerCache.get(user.email)
  if (cached && cached.expiresAt > Date.now()) {
    return { userId: user.id, email: user.email, providerId: cached.providerId, role: cached.role, permissions: cached.permissions }
  }

  // Use service_role client to bypass RLS for provider lookup
  const serviceClient = getServiceClient()

  // Try 1: Direct provider owner (login_email matches)
  const { data: provider } = await serviceClient
    .from('providers')
    .select('id')
    .eq('login_email', user.email)
    .maybeSingle()

  if (!provider) {
    // Try 2: Team member (linked via user_id or email)
    const { data: teamMember } = await serviceClient
      .from('team_members')
      .select('provider_id, role, permissions')
      .or(`user_id.eq.${user.id},email.eq.${user.email}`)
      .eq('active', true)
      .maybeSingle()

    if (!teamMember) {
      throw new AuthError(403, 'Kein Anbieter-Konto für diese E-Mail')
    }

    const role = (teamMember.role || 'staff') as TeamRole
    const permissions = teamMember.permissions || FULL_PERMISSIONS

    providerCache.set(user.email, {
      providerId: teamMember.provider_id,
      role,
      permissions,
      expiresAt: Date.now() + CACHE_TTL,
    })

    return { userId: user.id, email: user.email, providerId: teamMember.provider_id, role, permissions }
  }

  // Provider owner always has full access
  providerCache.set(user.email, {
    providerId: provider.id,
    role: 'owner',
    permissions: FULL_PERMISSIONS,
    expiresAt: Date.now() + CACHE_TTL,
  })

  return { userId: user.id, email: user.email, providerId: provider.id, role: 'owner', permissions: FULL_PERMISSIONS }
}

/**
 * Check if the authenticated user has a specific permission.
 * Owner and admin roles always have full access.
 * Returns true if allowed, false otherwise.
 */
export function hasPermission(auth: AuthContext, area: PermissionArea, action: PermissionAction): boolean {
  // Owner and admin always bypass permission checks
  if (auth.role === 'owner' || auth.role === 'admin') return true
  const areaPerms = auth.permissions?.[area]
  if (!areaPerms || !Array.isArray(areaPerms)) return false
  return areaPerms.includes(action)
}

/**
 * Middleware: Check permission and return 403 if not allowed.
 * Returns true if the user has the permission, false if 403 was sent.
 */
export function checkPermission(auth: AuthContext, res: ApiResponse, area: PermissionArea, action: PermissionAction): boolean {
  if (!hasPermission(auth, area, action)) {
    res.error(403, `Keine Berechtigung: ${area}.${action}`)
    return false
  }
  return true
}

export class AuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Invalidate the auth cache for a specific email.
 * Call this when team member permissions or roles change, or when a team member is deleted.
 */
export function invalidateAuthCache(email: string): void {
  providerCache.delete(email)
}

/**
 * Invalidate all auth cache entries for a given provider.
 * Useful when bulk permission changes occur.
 */
export function invalidateProviderCache(providerId: string): void {
  for (const [key, val] of providerCache) {
    if (val.providerId === providerId) providerCache.delete(key)
  }
}

export async function requireAuth(req: ParsedRequest, res: ApiResponse): Promise<AuthContext | null> {
  try {
    const auth = await authenticateRequest(req)
    return auth
  } catch (err) {
    if (err instanceof AuthError) {
      res.error(err.statusCode, err.message)
    } else {
      res.error(500, 'Auth-Fehler')
    }
    return null
  }
}
