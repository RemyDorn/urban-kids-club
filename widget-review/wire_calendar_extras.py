#!/usr/bin/env python3
"""
Wire Calendar Extras:
  1. Register /assets/calendar-extras.js route after calendar-dnd.js route
  2. Inject <script src="/assets/calendar-extras.js"></script> in kalender-preview.html
"""
from pathlib import Path

SERVER_TS = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/api/server.ts")
KALENDER = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/widgets/kalender-preview.html")

server = SERVER_TS.read_text(encoding="utf-8")

anchor = """  if (path === '/assets/calendar-dnd.js') {
    try {
      const js = readFileSync(resolve(__dirname, '../frontend/calendar-dnd.js'), 'utf-8')
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(js)
    } catch (err) {
      res.statusCode = 404; res.end('Calendar DnD script not found')
    }
    return
  }"""

extras_route = anchor + """
  if (path === '/assets/calendar-extras.js') {
    try {
      const js = readFileSync(resolve(__dirname, '../frontend/calendar-extras.js'), 'utf-8')
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(js)
    } catch (err) {
      res.statusCode = 404; res.end('Calendar extras script not found')
    }
    return
  }"""

if "/assets/calendar-extras.js" in server:
    print("· server.ts already has calendar-extras route — skipping")
else:
    if anchor not in server:
        raise SystemExit("ERROR: calendar-dnd anchor not found in server.ts")
    server = server.replace(anchor, extras_route, 1)
    SERVER_TS.write_text(server, encoding="utf-8")
    print("✓ server.ts: /assets/calendar-extras.js route registered")


html = KALENDER.read_text(encoding="utf-8")
extras_tag = '<script src="/assets/calendar-extras.js"></script>'

if extras_tag in html:
    print("· kalender-preview.html already has extras script tag — skipping")
else:
    dnd_tag = '<script src="/assets/calendar-dnd.js"></script>'
    if dnd_tag in html:
        html = html.replace(dnd_tag, dnd_tag + "\n" + extras_tag, 1)
    else:
        html = html.replace("</body>", extras_tag + "\n</body>", 1)
    KALENDER.write_text(html, encoding="utf-8")
    print("✓ kalender-preview.html: extras script tag injected")
