/**
 * Portal-PWA — White-Label Eltern-Portal als installierbare PWA pro Provider.
 *
 * Architektur (Hybrid B/C):
 *  - App-Branding pro Provider (Manifest + Icons + Theme dynamisch)
 *  - Account-System UKC-weit (Email als globaler Anchor — siehe 006_parent_federation.sql)
 *  - Service Worker scoped auf /portal/:slug/* damit jede Provider-PWA isoliert cached
 *
 * Routes:
 *   GET /portal/:slug                     → portal-preview HTML mit injected provider context
 *   GET /portal/:slug/manifest.json       → dynamic Web App Manifest (per-provider branding)
 *   GET /portal/:slug/sw.js               → Service Worker (provider-scoped cache)
 *   GET /portal/:slug/icons/icon.svg      → Brand-coloured SVG icon
 *   GET /portal/:slug/icons/maskable.svg  → Maskable variant (full-bleed safe zone)
 *   GET /portal/:slug/icons/apple.svg     → 180x180 Apple Touch Icon (rendered as SVG; iOS rasterises)
 *   GET /portal/:slug/install             → install instruction page (iOS/Android steps)
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { IncomingMessage, ServerResponse } from 'http'

/* -------------------------------------------------------------------------- */
/*  PROVIDER BRANDING REGISTRY                                                */
/*  Single source of truth. Add a provider here → PWA picks up automatically. */
/* -------------------------------------------------------------------------- */
export interface ProviderBrand {
  slug: string
  appName: string          // App-Icon Label
  shortName: string        // Home-Screen Label (≤ 12 chars ideal)
  description: string
  themeColor: string       // Status-bar / theme on Android
  bgColor: string          // Splash-screen background
  fgColor: string          // Icon foreground (letter)
  letter: string           // Icon initial (used by auto-generated SVG fallback)
  startUrl: string         // Default landing path

  /**
   * Optional: real branded icon files. If provided, the manifest references
   * them directly INSTEAD of the auto-generated SVG.
   *
   * File location convention:
   *   src/widgets/provider-brands/<slug>/<filename>
   *
   * Recommended set (square, full-bleed, no padding around the logo):
   *   icon-192.png       — Android home-screen
   *   icon-512.png       — Android splash
   *   icon-maskable.png  — Android adaptive (with 10% safe-zone padding inside)
   *   apple-180.png      — iOS home-screen (must be PNG, iOS doesn't render SVG)
   *
   * If you only have ONE PNG, point all four fields at it — works, just looks
   * less optimal on adaptive Android launchers.
   */
  customIcons?: {
    icon192?: string       // filename inside provider-brands/<slug>/
    icon512?: string
    iconMaskable?: string
    appleIcon180?: string
    /** Vendored SVG for browsers that prefer it (optional). */
    svgAny?: string
  }
}

export const PROVIDER_BRANDS: Record<string, ProviderBrand> = {
  socialy: {
    slug: 'socialy',
    appName: 'Socialy — Mein Bereich',
    shortName: 'Socialy',
    description: 'Buchungen, Guthaben & Postfach für deine Familie bei Socialy.',
    themeColor: '#FBF5EA',  // Cream
    bgColor: '#FBF5EA',
    fgColor: '#D96C45',     // Coral
    letter: 'S',
    startUrl: '/portal/socialy?utm_source=pwa',
    // Real branded SVG vendored under widgets/provider-brands/socialy/.
    // To upgrade to PNGs (better for iOS): drop logo-192.png, logo-512.png,
    // logo-maskable.png, apple-180.png in the same folder and add the fields
    // here (icon192, icon512, iconMaskable, appleIcon180).
    customIcons: { svgAny: 'logo.svg' },
  },
  ukc: {
    slug: 'ukc',
    appName: 'Urban Kids Club',
    shortName: 'Kids Club',
    description: 'Alle deine Kinderkurse — egal bei welchem Studio.',
    themeColor: '#FFEFE1',  // Linen
    bgColor: '#FFEFE1',
    fgColor: '#CC895E',     // Sienna
    letter: 'U',
    startUrl: '/portal/ukc?utm_source=pwa',
  },
  // Demo: zweiter Provider zum Showcasen der White-Label-Logik
  'tanzschule-mitte': {
    slug: 'tanzschule-mitte',
    appName: 'Tanzschule Mitte',
    shortName: 'Tanzschule',
    description: 'Stunden, Anmeldung & Termine — Tanzschule Mitte Berlin.',
    themeColor: '#1A1A1A',
    bgColor: '#FAFAFA',
    fgColor: '#E91E63',
    letter: 'T',
    startUrl: '/portal/tanzschule-mitte?utm_source=pwa',
  },
}

export function getBrand(slug: string): ProviderBrand | null {
  return PROVIDER_BRANDS[slug] ?? null
}

/* -------------------------------------------------------------------------- */
/*  DYNAMIC ICON RENDERER (SVG)                                                */
/* -------------------------------------------------------------------------- */
/**
 * Build the manifest `icons` array. If custom icons are vendored under
 * src/widgets/provider-brands/<slug>/, prefer those. Else fall back to the
 * auto-generated SVG-letter icons.
 */
function buildManifestIcons(brand: ProviderBrand): Array<{ src: string; sizes: string; type: string; purpose?: string }> {
  const ci = brand.customIcons
  const base = `/portal/${brand.slug}/brand`
  if (ci) {
    const out: Array<{ src: string; sizes: string; type: string; purpose?: string }> = []
    if (ci.icon192) out.push({ src: `${base}/${ci.icon192}`, sizes: '192x192', type: 'image/png', purpose: 'any' })
    if (ci.icon512) out.push({ src: `${base}/${ci.icon512}`, sizes: '512x512', type: 'image/png', purpose: 'any' })
    if (ci.iconMaskable) out.push({ src: `${base}/${ci.iconMaskable}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' })
    if (ci.appleIcon180) out.push({ src: `${base}/${ci.appleIcon180}`, sizes: '180x180', type: 'image/png' })
    if (ci.svgAny) out.push({ src: `${base}/${ci.svgAny}`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' })
    if (out.length > 0) return out
  }
  // Fallback: auto-generated SVG with the brand letter
  return [
    { src: `/portal/${brand.slug}/icons/icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: `/portal/${brand.slug}/icons/maskable.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    { src: `/portal/${brand.slug}/icons/apple.svg`, sizes: '180x180', type: 'image/svg+xml' },
  ]
}

function renderIconSvg(brand: ProviderBrand, opts: { maskable?: boolean; size?: number } = {}): string {
  const size = opts.size ?? 512
  const safeRadius = opts.maskable ? size * 0.42 : size * 0.5
  const letterSize = size * (opts.maskable ? 0.42 : 0.5)
  const cx = size / 2
  const cy = size / 2
  const padding = opts.maskable ? size * 0.1 : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect x="0" y="0" width="${size}" height="${size}" fill="${brand.bgColor}"/>
  <circle cx="${cx}" cy="${cy}" r="${safeRadius}" fill="${brand.fgColor}"/>
  <text x="${cx}" y="${cy + letterSize * 0.34}" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif"
        font-style="italic" font-weight="400"
        font-size="${letterSize}"
        fill="${brand.bgColor}">${brand.letter}</text>
</svg>`
}

/* -------------------------------------------------------------------------- */
/*  SERVICE WORKER GENERATOR                                                   */
/*  Provider-scoped cache, network-first for HTML/API, cache-first for assets */
/* -------------------------------------------------------------------------- */
function renderServiceWorker(brand: ProviderBrand): string {
  return `// Service Worker — ${brand.appName}
const SCOPE = '/portal/${brand.slug}'
const CACHE = 'portal-${brand.slug}-v1'
const PRECACHE = [
  SCOPE + '/',
  SCOPE + '/manifest.json',
  SCOPE + '/icons/icon.svg',
  SCOPE + '/icons/maskable.svg',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE).catch(() => null))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k.startsWith('portal-${brand.slug}-') && k !== CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return
  if (!url.pathname.startsWith(SCOPE) && !url.pathname.startsWith('/api/')) return

  // API → network-first, cache as fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(event.request, copy)).catch(() => null)
          return res
        })
        .catch(() => caches.match(event.request).then(r => r || new Response(JSON.stringify({ offline: true }), { status: 503, headers: { 'Content-Type': 'application/json' } })))
    )
    return
  }

  // HTML navigations → network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(event.request, copy)).catch(() => null)
          return res
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match(SCOPE + '/')))
    )
    return
  }

  // Assets → cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached
      return fetch(event.request).then(res => {
        const copy = res.clone()
        if (res.ok) caches.open(CACHE).then(c => c.put(event.request, copy)).catch(() => null)
        return res
      })
    })
  )
})

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting()
})
`
}

/* -------------------------------------------------------------------------- */
/*  HTTP HANDLER — wire from server.ts                                         */
/* -------------------------------------------------------------------------- */
export function handlePortalPwa(req: IncomingMessage, res: ServerResponse, path: string, widgetsDir: string): boolean {
  const m = path.match(/^\/portal\/([a-z0-9-]+)(\/.*)?$/i)
  if (!m) return false
  const [, slug, rest = '/'] = m
  const brand = getBrand(slug)
  if (!brand) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(`Provider "${slug}" not found.`)
    return true
  }

  // /portal/:slug/manifest.json
  if (rest === '/manifest.json') {
    const manifest = {
      id: `/portal/${brand.slug}/`,
      name: brand.appName,
      short_name: brand.shortName,
      description: brand.description,
      start_url: brand.startUrl,
      scope: `/portal/${brand.slug}/`,
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      orientation: 'portrait-primary',
      background_color: brand.bgColor,
      theme_color: brand.themeColor,
      lang: 'de-DE',
      categories: ['lifestyle', 'kids', 'education'],
      icons: buildManifestIcons(brand),
      shortcuts: [
        { name: 'Postfach', short_name: 'Postfach', url: `/portal/${brand.slug}#postfach` },
        { name: 'Buchungen', short_name: 'Buchungen', url: `/portal/${brand.slug}#buchungen` },
        { name: 'Guthaben', short_name: 'Guthaben', url: `/portal/${brand.slug}#guthaben` },
      ],
    }
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.statusCode = 200
    res.end(JSON.stringify(manifest, null, 2))
    return true
  }

  // /portal/:slug/sw.js  — must be served from same origin under the scope
  if (rest === '/sw.js') {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')           // SW updates need fresh fetch
    res.setHeader('Service-Worker-Allowed', `/portal/${brand.slug}/`)
    res.statusCode = 200
    res.end(renderServiceWorker(brand))
    return true
  }

  // /portal/:slug/icons/icon.svg
  if (rest === '/icons/icon.svg') {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.statusCode = 200
    res.end(renderIconSvg(brand))
    return true
  }
  if (rest === '/icons/maskable.svg') {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.statusCode = 200
    res.end(renderIconSvg(brand, { maskable: true }))
    return true
  }
  if (rest === '/icons/apple.svg') {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.statusCode = 200
    res.end(renderIconSvg(brand, { size: 180 }))
    return true
  }

  // /portal/:slug/brand/<filename>  → vendored brand asset (PNG/SVG)
  // Files live in src/widgets/provider-brands/<slug>/<filename>
  // Strict path safety: only [a-zA-Z0-9._-] allowed in the filename
  const brandMatch = rest.match(/^\/brand\/([a-zA-Z0-9][a-zA-Z0-9._-]*)$/)
  if (brandMatch) {
    const filename = brandMatch[1]
    if (filename.includes('..')) {
      res.statusCode = 400
      res.end('invalid path')
      return true
    }
    try {
      const filePath = resolve(widgetsDir, 'provider-brands', brand.slug, filename)
      const data = readFileSync(filePath)
      const ext = filename.split('.').pop()?.toLowerCase()
      const mime: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        ico: 'image/x-icon',
      }
      res.setHeader('Content-Type', (ext && mime[ext]) || 'application/octet-stream')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.statusCode = 200
      res.end(data)
    } catch {
      res.statusCode = 404
      res.end('brand asset not found — drop the file at src/widgets/provider-brands/' + brand.slug + '/' + filename)
    }
    return true
  }

  // /portal/:slug/install  → installation guide page
  if (rest === '/install') {
    try {
      let html = readFileSync(resolve(widgetsDir, 'portal-pwa-install.html'), 'utf-8')
      html = html
        .replace(/__BRAND_NAME__/g, brand.appName)
        .replace(/__BRAND_SHORT__/g, brand.shortName)
        .replace(/__BRAND_SLUG__/g, brand.slug)
        .replace(/__BRAND_THEME__/g, brand.themeColor)
        .replace(/__BRAND_FG__/g, brand.fgColor)
        .replace(/__BRAND_BG__/g, brand.bgColor)
        .replace(/__BRAND_LETTER__/g, brand.letter)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.statusCode = 200
      res.end(html)
    } catch {
      res.statusCode = 500
      res.end('install page error')
    }
    return true
  }

  // /portal/:slug or /portal/:slug/  → portal HTML with injected provider context + PWA tags
  if (rest === '/' || rest === '') {
    try {
      let html = readFileSync(resolve(widgetsDir, 'portal-preview.html'), 'utf-8')
      // Prefer real PNG/SVG when vendored, else fall back to letter-SVG
      const ci = brand.customIcons
      const appleHref = ci?.appleIcon180
        ? `/portal/${brand.slug}/brand/${ci.appleIcon180}`
        : `/portal/${brand.slug}/icons/apple.svg`
      const iconHref = ci?.svgAny
        ? `/portal/${brand.slug}/brand/${ci.svgAny}`
        : `/portal/${brand.slug}/icons/icon.svg`
      const iconType = ci?.svgAny ? 'image/svg+xml' : 'image/svg+xml'
      const pngFavicon = ci?.icon192
        ? `<link rel="icon" type="image/png" sizes="192x192" href="/portal/${brand.slug}/brand/${ci.icon192}">`
        : ''
      const pwaHead = `
  <!-- PWA -->
  <link rel="manifest" href="/portal/${brand.slug}/manifest.json">
  <meta name="theme-color" content="${brand.themeColor}">
  <meta name="application-name" content="${brand.appName}">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="${brand.shortName}">
  <link rel="apple-touch-icon" href="${appleHref}">
  <link rel="icon" type="${iconType}" href="${iconHref}">
  ${pngFavicon}
  <script>
    window.__UKC_PROVIDER__ = ${JSON.stringify(brand)};
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/portal/${brand.slug}/sw.js', { scope: '/portal/${brand.slug}/' })
          .catch(err => console.warn('SW register failed', err));
      });
    }
  </script>
  <script src="/assets/portal-pwa-banner.js" defer></script>
`
      html = html.replace('</head>', pwaHead + '</head>')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(html)
    } catch (err) {
      res.statusCode = 500
      res.end('portal render error')
    }
    return true
  }

  res.statusCode = 404
  res.end(`Unknown portal path: ${rest}`)
  return true
}
