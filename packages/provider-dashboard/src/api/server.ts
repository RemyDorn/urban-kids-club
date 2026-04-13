// ============================================================
// HTTP Server – Provider Dashboard API + Frontend
// ============================================================

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from './router'
import { registerRoutes } from './routes'

const PORT = parseInt(process.env.PORT ?? '3000')
const __dirname = dirname(fileURLToPath(import.meta.url))
const USE_SUPABASE = process.env.USE_SUPABASE === 'true'

// ============================================================
// Persistence: Nur im In-Memory-Modus
// ============================================================
let hasPersistedData = false

if (!USE_SUPABASE) {
  const { loadFromDisk, startAutoSave } = await import('../domain/persistence')
  const { seedDemoData } = await import('./seed')

  const loadResult = loadFromDisk()
  hasPersistedData = loadResult.success && loadResult.entries > 0

  if (hasPersistedData) {
    console.log(`[Server] ${loadResult.entries} Einträge aus Disk geladen – überspringe Demo-Daten.`)
  } else {
    // Nur Demo-Daten laden wenn keine persistierten Daten vorhanden
    seedDemoData()
    console.log('[Server] Demo-Daten geladen (keine persistierten Daten gefunden).')
  }

  // Auto-Save starten (alle 30 Sek oder via SAVE_INTERVAL env)
  startAutoSave()
} else {
  console.log('[Server] Supabase-Modus – Persistence deaktiviert')
}

// Dashboard HTML laden
let dashboardHtml: string
try {
  dashboardHtml = readFileSync(resolve(__dirname, '../frontend/dashboard.html'), 'utf-8')
} catch {
  dashboardHtml = '<html><body><h1>Frontend not found</h1></body></html>'
}

// Widget HTML laden
let parentWidgetHtml: string
try {
  parentWidgetHtml = readFileSync(resolve(__dirname, '../widgets/parent-course-widget.html'), 'utf-8')
} catch {
  parentWidgetHtml = '<html><body><h1>Widget not found</h1></body></html>'
}

// Router erstellen und Routen registrieren
const router = new Router()
registerRoutes(router)

// Server starten
const server = createServer((req, res) => {
  const url = req.url ?? '/'

  // Frontend: Root-URL → Dashboard HTML ausliefern
  const path = url.split('?')[0]
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(dashboardHtml)
    return
  }

  // Widget: Parent-Course-Widget ausliefern
  if (url.startsWith('/widget/')) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL'  // Embedding erlauben
    })
    res.end(parentWidgetHtml)
    return
  }

  // POST/PUT/PATCH/DELETE → markDirty für Auto-Save (nur im In-Memory-Modus)
  if (!USE_SUPABASE && req.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    // Nach Response markieren wir dirty
    const origEnd = res.end.bind(res)
    res.end = function (...args: Parameters<typeof res.end>) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        import('../domain/persistence').then(({ markDirty }) => markDirty())
      }
      return origEnd(...args)
    } as typeof res.end
  }

  // Alles andere → API Router
  router.handle(req, res)
})

const modeLabel = USE_SUPABASE ? 'Supabase' : 'In-Memory'

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
┌─────────────────────────────────────────────────┐
│  Urban Kids Club – Provider Dashboard           │
│  http://0.0.0.0:${PORT}                           │
│                                                 │
│  Dashboard: http://localhost:${PORT}               │
│  API:       http://localhost:${PORT}/api/health    │
│  Widget:    http://localhost:${PORT}/widget/       │
│                                                 │
│  Modus:      ${modeLabel.padEnd(35)}│
│  Persistence: ${USE_SUPABASE ? 'Supabase (extern)' : hasPersistedData ? 'Daten geladen' : 'Neuer Start (Demo-Daten)'}${' '.repeat(Math.max(0, 34 - (USE_SUPABASE ? 'Supabase (extern)' : hasPersistedData ? 'Daten geladen' : 'Neuer Start (Demo-Daten)').length))}│
│  Auto-Save:  ${USE_SUPABASE ? 'n/a (Supabase)' : 'aktiv'}${' '.repeat(Math.max(0, 35 - (USE_SUPABASE ? 'n/a (Supabase)' : 'aktiv').length))}│
└─────────────────────────────────────────────────┘
  `)
})
