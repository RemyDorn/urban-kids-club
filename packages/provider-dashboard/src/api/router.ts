// ============================================================
// Lightweight HTTP Router – Zero Dependencies
// ============================================================
// Minimaler Router der ohne Express/Fastify/Hono auskommt.
// In Produktion durch ein Framework ersetzen.
// ============================================================

import { IncomingMessage, ServerResponse } from 'node:http'

export type RouteHandler = (req: ParsedRequest, res: ApiResponse) => void | Promise<void>

export interface ParsedRequest {
  method: string
  path: string
  params: Record<string, string>
  query: Record<string, string>
  body: any
  raw: IncomingMessage
}

export interface ApiResponse {
  status(code: number): ApiResponse
  json(data: unknown): void
  error(code: number, message: string): void
}

interface Route {
  method: string
  pattern: RegExp
  paramNames: string[]
  handler: RouteHandler
}

export class Router {
  private routes: Route[] = []

  private addRoute(method: string, path: string, handler: RouteHandler) {
    const paramNames: string[] = []
    const pattern = path.replace(/:(\w+)/g, (_match, name) => {
      paramNames.push(name)
      return '([^/]+)'
    })
    this.routes.push({
      method,
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
      handler,
    })
  }

  get(path: string, handler: RouteHandler) { this.addRoute('GET', path, handler) }
  post(path: string, handler: RouteHandler) { this.addRoute('POST', path, handler) }
  put(path: string, handler: RouteHandler) { this.addRoute('PUT', path, handler) }
  patch(path: string, handler: RouteHandler) { this.addRoute('PATCH', path, handler) }
  delete(path: string, handler: RouteHandler) { this.addRoute('DELETE', path, handler) }

  async handle(req: IncomingMessage, res: ServerResponse) {
    // CORS Headers – In Produktion auf eigene Domain einschränken
    const allowedOrigin = process.env.CORS_ORIGIN ?? '*'
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const method = req.method ?? 'GET'
    const path = url.pathname

    // Query params
    const query: Record<string, string> = {}
    url.searchParams.forEach((value, key) => { query[key] = value })

    // Body parsen (für POST/PUT/PATCH)
    let body: unknown = undefined
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        body = await parseBody(req)
      } catch (err) {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large (max 1MB)' }))
        return
      }
    }

    // Route finden
    for (const route of this.routes) {
      if (route.method !== method) continue
      const match = path.match(route.pattern)
      if (!match) continue

      const params: Record<string, string> = {}
      route.paramNames.forEach((name, i) => { params[name] = match[i + 1] })

      const parsedReq: ParsedRequest = { method, path, params, query, body, raw: req }
      let statusCode = 200

      const apiRes: ApiResponse = {
        status(code: number) { statusCode = code; return apiRes },
        json(data: unknown) {
          res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(data))
        },
        error(code: number, message: string) {
          res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: message }))
        },
      }

      try {
        await route.handler(parsedReq, apiRes)
      } catch (err) {
        console.error(`Error handling ${method} ${path}:`, err)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Internal Server Error' }))
        }
      }
      return
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Route not found' }))
  }
}

const MAX_BODY_SIZE = 1024 * 1024 // 1 MB

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalSize = 0
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy()
        reject(new Error('Request body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8')
      if (!raw) { resolve(undefined); return }
      try { resolve(JSON.parse(raw)) } catch { resolve(raw) }
    })
    req.on('error', () => resolve(undefined))
  })
}
