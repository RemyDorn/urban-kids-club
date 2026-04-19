// ============================================================
// Health Check & Config Routes
// ============================================================

import { Router } from '../router'
import { getLastJobRun } from '../../lib/logger'

export function registerHealthRoutes(router: Router) {

  router.get('/api/health', async (_req, res) => {
    const isSupabase = process.env.USE_SUPABASE === 'true'
    let dbHealthy = true
    if (isSupabase) {
      const { checkConnection } = await import('../../lib/supabase')
      dbHealthy = await checkConnection()
    }
    const status = dbHealthy ? 'healthy' : 'degraded'
    if (!dbHealthy) res.status(503)

    const mem = process.memoryUsage()
    res.json({
      status,
      mode: isSupabase ? 'supabase' : 'memory',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: {
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        rss: Math.round(mem.rss / 1024 / 1024),
      },
      supabase: isSupabase ? (dbHealthy ? 'connected' : 'error') : 'n/a',
      lastJobRun: getLastJobRun(),
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
