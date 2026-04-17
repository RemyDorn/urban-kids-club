// Service Worker – Urban Kids Club PWA
const CACHE_NAME = 'ukc-dashboard-v1'
const PRECACHE = [
  '/',
  '/manifest.json',
]

// Install: precache shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // API calls: always network
  if (url.pathname.startsWith('/api/')) return

  // HTML pages: network-first with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const clone = resp.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
          return resp
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // Static assets (fonts, CDN): cache-first
  if (url.hostname !== location.hostname) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached
        return fetch(event.request).then(resp => {
          const clone = resp.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
          return resp
        })
      })
    )
  }
})
