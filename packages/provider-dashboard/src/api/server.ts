// ============================================================
// HTTP Server – Provider Dashboard API
// ============================================================

import { createServer } from 'node:http'
import { Router } from './router'
import { registerRoutes } from './routes'
import { seedDemoData } from './seed'

const PORT = parseInt(process.env.PORT ?? '3000')

// Router erstellen und Routen registrieren
const router = new Router()
registerRoutes(router)

// Demo-Daten laden
seedDemoData()

// Server starten
const server = createServer((req, res) => router.handle(req, res))

server.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────────────┐
│  Urban Kids Club – Provider Dashboard API       │
│  http://localhost:${PORT}                          │
│                                                 │
│  Health:    GET  /api/health                    │
│  Docs:      GET  /api/health (shows store size) │
│  Dashboard: GET  /api/providers/:id/dashboard   │
│                                                 │
│  Demo-Daten geladen ✓                           │
└─────────────────────────────────────────────────┘
  `)
})
