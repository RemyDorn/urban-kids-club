// ============================================================
// Auth Middleware – JWT-basierte Authentifizierung
// ============================================================
// Verwendet Supabase Auth. Provider loggen sich ein und erhalten
// ein JWT-Token, das bei jedem API-Request mitgesendet wird.
// ============================================================

import { supabase } from './supabase'
import type { ParsedRequest, ApiResponse } from '../api/router'

export interface AuthUser {
  id: string
  email: string
  providerId?: string
  role: 'provider' | 'admin' | 'parent'
}

// Erweitere ParsedRequest um Auth-Infos
declare module '../api/router' {
  interface ParsedRequest {
    user?: AuthUser
  }
}

// Auth-Middleware: Prüft JWT-Token und setzt req.user
export async function authenticate(req: ParsedRequest, res: ApiResponse): Promise<boolean> {
  const authHeader = req.raw.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.error(401, 'Nicht authentifiziert – Bearer Token erforderlich')
    return false
  }

  const token = authHeader.slice(7)

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      res.error(401, 'Token ungültig oder abgelaufen')
      return false
    }

    // Provider-ID aus user_metadata oder Provider-Tabelle laden
    const providerId = user.user_metadata?.provider_id as string | undefined

    req.user = {
      id: user.id,
      email: user.email!,
      providerId,
      role: user.user_metadata?.role as AuthUser['role'] ?? 'parent',
    }

    return true
  } catch {
    res.error(401, 'Authentifizierung fehlgeschlagen')
    return false
  }
}

// Provider-Auth: Stellt sicher, dass der User ein Provider ist und Zugriff hat
export async function authenticateProvider(req: ParsedRequest, res: ApiResponse): Promise<boolean> {
  const authed = await authenticate(req, res)
  if (!authed) return false

  if (!req.user?.providerId) {
    res.error(403, 'Kein Provider-Zugang')
    return false
  }

  // Prüfe ob der angegebene providerId mit dem Auth-Provider übereinstimmt
  const requestedProviderId = req.params.providerId || req.params.id
  if (requestedProviderId && requestedProviderId !== req.user.providerId && req.user.role !== 'admin') {
    res.error(403, 'Zugriff verweigert – nicht Ihr Provider')
    return false
  }

  return true
}

// Admin-Auth
export async function authenticateAdmin(req: ParsedRequest, res: ApiResponse): Promise<boolean> {
  const authed = await authenticate(req, res)
  if (!authed) return false

  if (req.user?.role !== 'admin') {
    res.error(403, 'Admin-Zugang erforderlich')
    return false
  }

  return true
}

// Optional Auth: Setzt req.user falls Token vorhanden, aber blockiert nicht
export async function optionalAuth(req: ParsedRequest, _res: ApiResponse): Promise<boolean> {
  const authHeader = req.raw.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return true

  const token = authHeader.slice(7)
  try {
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user) {
      req.user = {
        id: user.id,
        email: user.email!,
        providerId: user.user_metadata?.provider_id as string | undefined,
        role: user.user_metadata?.role as AuthUser['role'] ?? 'parent',
      }
    }
  } catch {
    // Silent fail – optionale Auth
  }
  return true
}

// Provider Login (E-Mail/Passwort)
export async function loginProvider(email: string, password: string): Promise<{ token: string; providerId: string } | { error: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    return { error: error?.message ?? 'Login fehlgeschlagen' }
  }

  const providerId = data.user.user_metadata?.provider_id
  if (!providerId) {
    return { error: 'Kein Provider-Konto gefunden' }
  }

  return { token: data.session.access_token, providerId }
}

// Provider Registrierung
export async function registerProvider(email: string, password: string, providerId: string): Promise<{ token: string } | { error: string }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { provider_id: providerId, role: 'provider' },
    },
  })

  if (error) return { error: error.message }
  if (!data.session) return { error: 'Registrierung erfolgreich – bitte E-Mail bestätigen' }

  return { token: data.session.access_token }
}
