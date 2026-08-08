#!/usr/bin/env python3
"""
Wire Embed V2:
  - Register /embed-v2/:slug/course/:activityId route in server.ts
  - Route liest course-session-picker-v2.html und schickt mit iframe-fähigen Headern
"""
from pathlib import Path

SERVER_TS = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/api/server.ts")

server = SERVER_TS.read_text(encoding="utf-8")

anchor = """  // Embed: Public embeddable widgets (calendar, courses, etc.)
  if (path.startsWith('/embed/')) {"""

new_block = """  // Embed V2: Single-Course Session-Picker im Socialy-Brand
  // Route: /embed-v2/:slug/course/:activityId
  if (path.startsWith('/embed-v2/')) {
    const parts = path.split('/').filter(Boolean) // ['embed-v2', slug, 'course', activityId]
    if (parts.length >= 4 && parts[2] === 'course') {
      try {
        const html = readFileSync(resolve(__dirname, '../widgets/course-session-picker-v2.html'), 'utf-8')
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        // Iframe-fähig: allow embedding on any origin (socialy.club etc.)
        res.setHeader('Content-Security-Policy', "frame-ancestors *")
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.statusCode = 200
        res.end(html)
      } catch (err) {
        res.statusCode = 500
        res.end('Embed V2 not found')
      }
      return
    }
    res.statusCode = 400
    res.end('Invalid embed-v2 path. Expected: /embed-v2/:slug/course/:activityId')
    return
  }

  // Embed: Public embeddable widgets (calendar, courses, etc.)
  if (path.startsWith('/embed/')) {"""

if "/embed-v2/" in server:
    print("· server.ts already has embed-v2 route — skipping")
else:
    if anchor not in server:
        raise SystemExit("ERROR: /embed/ anchor not found")
    server = server.replace(anchor, new_block, 1)
    SERVER_TS.write_text(server, encoding="utf-8")
    print("✓ server.ts: /embed-v2/:slug/course/:activityId registered (iframe-fähig)")
