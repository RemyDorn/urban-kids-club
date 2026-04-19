// ============================================================
// DEPRECATED – Use auth-middleware.ts instead
// ============================================================
// This file is kept only for backward compatibility with legacy
// routes (e.g. routes.ts in-memory version). All new code should
// import from './auth-middleware'.
//
// The auth-middleware.ts implementation is superior because it:
// - Resolves provider via DB lookup (not just JWT metadata)
// - Supports team member permissions
// - Caches provider lookups with TTL
// - Provides cache invalidation for permission changes
// ============================================================

/** @deprecated Use requireAuth from auth-middleware.ts */
export { requireAuth as authenticate } from './auth-middleware'
/** @deprecated Use requireAuth from auth-middleware.ts */
export { requireAuth as authenticateProvider } from './auth-middleware'

// Re-export authenticateAdmin from helpers (the proper admin check)
// For backward compatibility only — new code should use requireAdmin from routes/helpers.ts
import { supabase } from './supabase'
import type { ParsedRequest, ApiResponse } from '../api/router'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'remy.dostal@gmail.com').split(',').map(e => e.trim())

/** Login a provider with email + password via Supabase Auth */
export async function loginProvider(email: string, password: string): Promise<{ token: string; provider: any } | { error: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) return { error: error?.message || 'Login fehlgeschlagen' }

  const { getServiceClient } = await import('./supabase')
  const db = getServiceClient()
  const { data: provider } = await db.from('providers').select('*').eq('login_email', email).maybeSingle()
  if (!provider) return { error: 'Kein Provider-Konto für diese E-Mail gefunden' }

  return { token: data.session.access_token, provider }
}

/** @deprecated Use requireAdmin from api/routes/helpers.ts */
export async function authenticateAdmin(req: ParsedRequest, res: ApiResponse): Promise<boolean> {
  const token = req.raw.headers.authorization?.replace('Bearer ', '')
  if (!token) { res.error(401, 'Nicht authentifiziert'); return false }
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user || !user.email) { res.error(401, 'Token ungültig oder abgelaufen'); return false }
  if (!ADMIN_EMAILS.includes(user.email)) { res.error(403, 'Kein Admin-Zugang'); return false }
  return true
}
