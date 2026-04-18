// ============================================================
// Health Check & Config Routes
// ============================================================

import { Router } from '../router'

export function registerHealthRoutes(router: Router) {

  router.get('/api/health', async (_req, res) => {
    const isSupabase = process.env.USE_SUPABASE === 'true'
    let dbHealthy = true
    if (isSupabase) {
      const { checkConnection } = await import('../../lib/supabase')
      dbHealthy = await checkConnection()
    }
    const status = dbHealthy ? 'ok' : 'degraded'
    if (!dbHealthy) res.status(503)
    res.json({
      status,
      mode: isSupabase ? 'supabase' : 'memory',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      checks: { database: dbHealthy ? 'ok' : 'error' },
    })
  })

  // Public config endpoint — frontend uses this to init Supabase client
  router.get('/api/config', (_req, res) => {
    res.json({
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
      environment: process.env.NODE_ENV || 'development',
    })
  })

  router.get('/api/openapi.json', async (_req, res) => {
    const { openApiSpec } = await import('../openapi')
    res.json(openApiSpec)
  })
}
