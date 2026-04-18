// ============================================================
// Supabase Client – Datenbankverbindung
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('FATAL: SUPABASE_URL und SUPABASE_ANON_KEY müssen als Umgebungsvariablen gesetzt sein!')
}
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Anon-Client für Frontend/Public-Zugriff (mit RLS)
export const supabase: SupabaseClient = createClient(SUPABASE_URL || '', SUPABASE_ANON_KEY || '')

// Service-Role-Client für Backend-Operationen (umgeht RLS)
export function getServiceClient(): SupabaseClient {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY nicht konfiguriert')
  }
  return createClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Authenticated Client für einen spezifischen User (mit RLS)
export function getAuthClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL || '', SUPABASE_ANON_KEY || '', {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export { SUPABASE_URL }
