// ============================================================
// Supabase Client – Datenbankverbindung
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Create a fetch function with timeout */
function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    return fetch(input, {
      ...init,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))
  }
}

const DB_TIMEOUT_MS = 15_000 // 15 second timeout for DB queries

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('FATAL: SUPABASE_URL und SUPABASE_ANON_KEY müssen als Umgebungsvariablen gesetzt sein!')
}
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Anon-Client für Frontend/Public-Zugriff (mit RLS)
export const supabase: SupabaseClient = createClient(SUPABASE_URL || '', SUPABASE_ANON_KEY || '', {
  global: { fetch: fetchWithTimeout(DB_TIMEOUT_MS) },
})

// Service-Role-Client für Backend-Operationen (umgeht RLS) — Singleton
let _serviceClient: SupabaseClient | null = null
export function getServiceClient(): SupabaseClient {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY nicht konfiguriert')
  }
  if (!_serviceClient) {
    _serviceClient = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: fetchWithTimeout(DB_TIMEOUT_MS) },
    })
  }
  return _serviceClient
}

// Authenticated Client für einen spezifischen User (mit RLS)
// Note: This creates a new client per call. Caching is not practical because
// each client is bound to a specific JWT that expires quickly. Callers should
// avoid calling getAuthClient in hot loops – one call per request is fine.
export function getAuthClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL || '', SUPABASE_ANON_KEY || '', {
    global: { headers: { Authorization: `Bearer ${accessToken}` }, fetch: fetchWithTimeout(DB_TIMEOUT_MS) },
  })
}

/** Check if Supabase is reachable (for health checks) */
export async function checkConnection(): Promise<boolean> {
  try {
    const sb = getServiceClient()
    const { error } = await sb.from('providers').select('id', { count: 'exact', head: true }).limit(0)
    return !error
  } catch {
    return false
  }
}

export { SUPABASE_URL }
