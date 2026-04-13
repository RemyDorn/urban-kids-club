// ============================================================
// HTTP Server – Provider Dashboard API + Frontend
// ============================================================

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from './router'
import { registerRoutes } from './routes'
import { seedDemoData } from './seed'
import { loadFromDisk, saveToDisk, startAutoSave, markDirty } from '../domain/persistence'

const PORT = parseInt(process.env.PORT ?? '3000')
const __dirname = dirname(fileURLToPath(import.meta.url))

// ============================================================
// Persistence: Gespeicherte Daten laden
// ============================================================
const loadResult = loadFromDisk()
const hasPersistedData = loadResult.success && loadResult.entries > 0

if (hasPersistedData) {
  console.log(`[Server] ${loadResult.entries} Einträge aus Disk geladen – überspringe Demo-Daten.`)
} else {
  // Nur Demo-Daten laden wenn keine persistierten Daten vorhanden
  seedDemoData()
  console.log('[Server] Demo-Daten geladen (keine persistierten Daten gefunden).')
}

// Auto-Save starten (alle 30 Sek oder via SAVE_INTERVAL env)
startAutoSave()

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
  if (url === '/' || url === '/index.html') {
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

  // POST/PUT/PATCH/DELETE → markDirty für Auto-Save
  if (req.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    // Nach Response markieren wir dirty
    const origEnd = res.end.bind(res)
    res.end = function (...args: Parameters<typeof res.end>) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        markDirty()
      }
      return origEnd(...args)
    } as typeof res.end
  }

  // Alles andere → API Router
  router.handle(req, res)
})

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
│  Persistence: ${hasPersistedData ? 'Daten geladen ✓' : 'Neuer Start (Demo-Daten) ✓'}       │
│  Auto-Save:  aktiv ✓                            │
└─────────────────────────────────────────────────┘
  `)
})
