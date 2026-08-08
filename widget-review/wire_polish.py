#!/usr/bin/env python3
"""
Wire Dashboard Polish:
  1. Register /assets/dashboard-polish.js route
  2. Loader in dashboard-ui.js
"""
from pathlib import Path

SERVER_TS = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/api/server.ts")
DASHBOARD_UI = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/frontend/dashboard-ui.js")

server = SERVER_TS.read_text(encoding="utf-8")

anchor = """  if (path === '/assets/dashboard-topbar.js') {
    try {
      const js = readFileSync(resolve(__dirname, '../frontend/dashboard-topbar.js'), 'utf-8')
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(js)
    } catch (err) {
      res.statusCode = 404; res.end('Topbar script not found')
    }
    return
  }"""

new_block = anchor + """
  if (path === '/assets/dashboard-polish.js') {
    try {
      const js = readFileSync(resolve(__dirname, '../frontend/dashboard-polish.js'), 'utf-8')
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(js)
    } catch (err) {
      res.statusCode = 404; res.end('Polish script not found')
    }
    return
  }"""

if "/assets/dashboard-polish.js" in server:
    print("· server.ts already has polish route — skipping")
else:
    if anchor not in server:
        raise SystemExit("ERROR: topbar anchor not found")
    server = server.replace(anchor, new_block, 1)
    SERVER_TS.write_text(server, encoding="utf-8")
    print("✓ server.ts: polish route registered")


ui_content = DASHBOARD_UI.read_text(encoding="utf-8")
if "dashboard-polish.js" in ui_content:
    print("· dashboard-ui.js already loads polish — skipping")
else:
    snippet = """
// __UKC_POLISH_LOADER__
(function () {
  var s = document.createElement('script');
  s.src = '/assets/dashboard-polish.js';
  s.async = false;
  document.head.appendChild(s);
})();
"""
    ui_content = ui_content.rstrip() + "\n" + snippet
    DASHBOARD_UI.write_text(ui_content, encoding="utf-8")
    print("✓ dashboard-ui.js: polish loader appended")
