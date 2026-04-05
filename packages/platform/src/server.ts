import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = parseInt(process.env.PLATFORM_PORT ?? '3001')
const API_URL = process.env.API_URL ?? 'http://localhost:3000'
const __dirname = dirname(fileURLToPath(import.meta.url))

let platformHtml: string
try {
  platformHtml = readFileSync(resolve(__dirname, 'frontend/platform.html'), 'utf-8')
} catch {
  platformHtml = '<html><body><h1>Platform frontend not found</h1></body></html>'
}

const server = createServer(async (req, res) => {
  const url = req.url ?? '/'

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(platformHtml)
    return
  }

  // API Proxy
  if (url.startsWith('/api/')) {
    try {
      const proxyUrl = API_URL + url
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (req.headers.authorization) headers['Authorization'] = req.headers.authorization

      let body: string | undefined
      if (req.method !== 'GET') {
        body = await new Promise<string>(resolve => {
          const chunks: Buffer[] = []
          req.on('data', c => chunks.push(c))
          req.on('end', () => resolve(Buffer.concat(chunks).toString()))
        })
      }

      const proxyRes = await fetch(proxyUrl, {
        method: req.method,
        headers,
        body,
      })

      res.writeHead(proxyRes.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(await proxyRes.text())
    } catch {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Backend nicht erreichbar' }))
    }
    return
  }

  res.writeHead(404)
  res.end('Not Found')
})

server.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────────────┐
│  Urban Kids Club – Eltern-Plattform             │
│  http://localhost:${PORT}                          │
└─────────────────────────────────────────────────┘
  `)
})
