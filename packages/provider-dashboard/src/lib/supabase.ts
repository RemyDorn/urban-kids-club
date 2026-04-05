// ============================================================
// Supabase Client – Datenbankverbindung
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://yuilhiqnrjuuqoqggihm.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1aWxoaXFucmp1dXFvcWdnaWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNzUxMDAsImV4cCI6MjA5MDc1MTEwMH0.8dnGBOapmuTwEUy0VG-VnSgIAgRf10F4L1wi9gcE0iw'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Anon-Client für Frontend/Public-Zugriff (mit RLS)
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Service-Role-Client für Backend-Operationen (umgeht RLS)
export function getServiceClient(): SupabaseClient {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY nicht konfiguriert')
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Authenticated Client für einen spezifischen User (mit RLS)
export function getAuthClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export { SUPABASE_URL }
