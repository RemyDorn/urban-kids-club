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

const PORT = parseInt(process.env.PORT ?? '3000')
const __dirname = dirname(fileURLToPath(import.meta.url))

// Dashboard HTML laden
let dashboardHtml: string
try {
  dashboardHtml = readFileSync(resolve(__dirname, '../frontend/dashboard.html'), 'utf-8')
} catch {
  dashboardHtml = '<html><body><h1>Frontend not found</h1></body></html>'
}

// Router erstellen und Routen registrieren
const router = new Router()
registerRoutes(router)

// Demo-Daten laden
seedDemoData()

// Server starten
const server = createServer((req, res) => {
  const url = req.url ?? '/'

  // Frontend: Root-URL → Dashboard HTML ausliefern
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(dashboardHtml)
    return
  }

  // Alles andere → API Router
  router.handle(req, res)
})

server.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────────────┐
│  Urban Kids Club – Provider Dashboard           │
│  http://localhost:${PORT}                          │
│                                                 │
│  Dashboard: http://localhost:${PORT}               │
│  API:       http://localhost:${PORT}/api/health    │
│                                                 │
│  Demo-Daten geladen ✓                           │
└─────────────────────────────────────────────────┘
  `)
})
