#!/usr/bin/env python3
"""
Wire Calendar DnD:
  1. Register /assets/calendar-dnd.js route in server.ts (after dashboard-ui.js)
  2. Inject <script src="/assets/calendar-dnd.js"></script> in kalender-preview.html
"""
from pathlib import Path

SERVER_TS = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/api/server.ts")
KALENDER = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/widgets/kalender-preview.html")

# ============================================================
# STEP 1: Route in server.ts
# ============================================================
server = SERVER_TS.read_text(encoding="utf-8")

anchor = """  if (path === '/assets/dashboard-ui.js') {
    try {
      const js = readFileSync(resolve(__dirname, '../frontend/dashboard-ui.js'), 'utf-8')
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(js)
    } catch (err) {
      res.statusCode = 404; res.end('UI script not found')
    }
    return
  }"""

dnd_route = """  if (path === '/assets/dashboard-ui.js') {
    try {
      const js = readFileSync(resolve(__dirname, '../frontend/dashboard-ui.js'), 'utf-8')
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(js)
    } catch (err) {
      res.statusCode = 404; res.end('UI script not found')
    }
    return
  }
  if (path === '/assets/calendar-dnd.js') {
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

if "/assets/calendar-dnd.js" in server:
    print("· server.ts already has calendar-dnd route — skipping")
else:
    if anchor not in server:
        raise SystemExit("ERROR: anchor not found in server.ts")
    server = server.replace(anchor, dnd_route, 1)
    SERVER_TS.write_text(server, encoding="utf-8")
    print("✓ server.ts: /assets/calendar-dnd.js route registered")


# ============================================================
# STEP 2: Script-Tag in kalender-preview.html
# ============================================================
html = KALENDER.read_text(encoding="utf-8")

dnd_tag = '<script src="/assets/calendar-dnd.js"></script>'

if dnd_tag in html:
    print("· kalender-preview.html already has DnD script tag — skipping")
else:
    # Einfügen vor </body>, nach dashboard-ui.js
    ui_tag = '<script src="/assets/dashboard-ui.js"></script>'
    if ui_tag in html:
        html = html.replace(ui_tag, ui_tag + "\n" + dnd_tag, 1)
    else:
        html = html.replace("</body>", dnd_tag + "\n</body>", 1)
    KALENDER.write_text(html, encoding="utf-8")
    print("✓ kalender-preview.html: DnD script tag injected")
