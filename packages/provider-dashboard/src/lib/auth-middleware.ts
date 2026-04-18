// src/lib/auth-middleware.ts
import { supabase, getServiceClient } from './supabase'
import type { ParsedRequest, ApiResponse } from '../api/router'

export interface AuthContext {
  userId: string
  email: string
  providerId: string
}

// Cache provider lookups for 5 minutes (with periodic eviction)
const providerCache = new Map<string, { providerId: string; expiresAt: number }>()
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
    return { userId: user.id, email: user.email, providerId: cached.providerId }
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
      .select('provider_id')
      .or(`user_id.eq.${user.id},email.eq.${user.email}`)
      .eq('active', true)
      .maybeSingle()

    if (!teamMember) {
      throw new AuthError(403, 'Kein Anbieter-Konto für diese E-Mail')
    }

    providerCache.set(user.email, {
      providerId: teamMember.provider_id,
      expiresAt: Date.now() + CACHE_TTL,
    })

    return { userId: user.id, email: user.email, providerId: teamMember.provider_id }
  }

  providerCache.set(user.email, {
    providerId: provider.id,
    expiresAt: Date.now() + CACHE_TTL,
  })

  return { userId: user.id, email: user.email, providerId: provider.id }
}

export class AuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
    this.name = 'AuthError'
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
