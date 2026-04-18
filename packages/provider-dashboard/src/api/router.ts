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
  rawBody?: Buffer
  raw: IncomingMessage
}

export interface ApiResponse {
  status(code: number): ApiResponse
  json(data: unknown): void
  error(code: number, message: string): void
  html(content: string, code?: number): void
}

interface Route {
  method: string
  pattern: RegExp
  paramNames: string[]
  handler: RouteHandler
}

export type MiddlewareHandler = (req: ParsedRequest, res: ApiResponse, next: () => Promise<void>) => void | Promise<void>

export class Router {
  private routes: Route[] = []
  private middlewares: MiddlewareHandler[] = []

  /** Register middleware that runs before every route handler */
  use(handler: MiddlewareHandler) {
    this.middlewares.push(handler)
  }

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
    // CORS Headers – Widget/public endpoints allow any origin, authenticated endpoints restrict
    const requestPath = (req.url ?? '/').split('?')[0]
    // Normalize versioned API paths for CORS check: /api/v1/widget/... → /api/widget/...
    const normalizedRequestPath = requestPath.replace(/^\/api\/v\d+\//, '/api/')
    const isPublicEndpoint = normalizedRequestPath.startsWith('/api/widget/') ||
      normalizedRequestPath.startsWith('/api/public/') ||
      normalizedRequestPath.startsWith('/api/checkout/') ||
      normalizedRequestPath.startsWith('/api/providers/by-slug/') ||
      normalizedRequestPath === '/api/config' ||
      normalizedRequestPath === '/api/health'
    const corsOrigin = process.env.CORS_ORIGIN
    const defaultOrigin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
    const allowedOrigin = isPublicEndpoint ? '*' : (corsOrigin || defaultOrigin)
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    if (allowedOrigin !== '*') res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    // Security Headers set in server.ts createServer handler (covers all responses)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const method = req.method ?? 'GET'
    const path = url.pathname

    // Normalize versioned API paths: /api/v1/widget/... → /api/widget/...
    // This allows existing handlers to work without changes while supporting versioned URLs.
    // Currently only v1 is supported; future versions can branch to separate handlers.
    let normalizedPath = path
    const versionMatch = path.match(/^\/api\/v(\d+)\/(.*)/)
    if (versionMatch) {
      const version = parseInt(versionMatch[1])
      if (version === 1) {
        normalizedPath = '/api/' + versionMatch[2]
      }
      // Future: if (version === 2) { use v2 handlers }
    }

    // Query params
    const query: Record<string, string> = {}
    url.searchParams.forEach((value, key) => { query[key] = value })

    // Body parsen (für POST/PUT/PATCH)
    let body: unknown = undefined
    let rawBody: Buffer | undefined = undefined
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        const result = await parseBody(req)
        body = result.parsed
        rawBody = result.rawBuffer
      } catch (err) {
        res.setHeader('Content-Type', 'application/json')
        res.statusCode = 413
        res.end(JSON.stringify({ error: 'Request body too large (max 1MB)' }))
        return
      }
    }

    // Route finden
    for (const route of this.routes) {
      if (route.method !== method) continue
      const match = normalizedPath.match(route.pattern)
      if (!match) continue

      const params: Record<string, string> = {}
      route.paramNames.forEach((name, i) => { params[name] = match[i + 1] })

      const parsedReq: ParsedRequest = { method, path, params, query, body, rawBody, raw: req }
      let statusCode = 200

      const apiRes: ApiResponse = {
        status(code: number) { statusCode = code; return apiRes },
        json(data: unknown) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.statusCode = statusCode
          res.end(JSON.stringify(data))
        },
        error(code: number, message: string) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.statusCode = code
          res.end(JSON.stringify({ error: message }))
        },
        html(content: string, code?: number) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.statusCode = code ?? statusCode
          res.end(content)
        },
      }

      try {
        // Run middleware chain, then the route handler
        let middlewareIndex = 0
        const runNext = async (): Promise<void> => {
          if (middlewareIndex < this.middlewares.length) {
            const mw = this.middlewares[middlewareIndex++]
            await mw(parsedReq, apiRes, runNext)
          } else {
            await route.handler(parsedReq, apiRes)
          }
        }
        await runNext()
      } catch (err) {
        console.error(`Error handling ${method} ${path}:`, err)
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'application/json')
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Internal Server Error' }))
        }
      }
      return
    }

    // 404
    res.setHeader('Content-Type', 'application/json')
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'Route not found' }))
  }
}

const MAX_BODY_SIZE = 1024 * 1024 // 1 MB

function parseBody(req: IncomingMessage): Promise<{ parsed: unknown; rawBuffer: Buffer }> {
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
      const rawBuffer = Buffer.concat(chunks)
      const raw = rawBuffer.toString('utf-8')
      if (!raw) { resolve({ parsed: undefined, rawBuffer }); return }
      try { resolve({ parsed: JSON.parse(raw), rawBuffer }) } catch { resolve({ parsed: raw, rawBuffer }) }
    })
    req.on('error', () => resolve({ parsed: undefined, rawBuffer: Buffer.alloc(0) }))
  })
}
