#!/usr/bin/env python3
"""
Wire Topbar:
  1. Register /assets/dashboard-topbar.js route
  2. Loader in dashboard-ui.js ergänzen (nach cmdk-loader)
"""
from pathlib import Path

SERVER_TS = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/api/server.ts")
DASHBOARD_UI = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/frontend/dashboard-ui.js")

# ============================================================
# Route
# ============================================================
server = SERVER_TS.read_text(encoding="utf-8")

anchor = """  if (path === '/assets/dashboard-cmdk.js') {
    try {
      const js = readFileSync(resolve(__dirname, '../frontend/dashboard-cmdk.js'), 'utf-8')
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(js)
    } catch (err) {
      res.statusCode = 404; res.end('Command-palette script not found')
    }
    return
  }"""

new_block = anchor + """
  if (path === '/assets/dashboard-topbar.js') {
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

if "/assets/dashboard-topbar.js" in server:
    print("· server.ts already has topbar route — skipping")
else:
    if anchor not in server:
        raise SystemExit("ERROR: cmdk route anchor not found in server.ts")
    server = server.replace(anchor, new_block, 1)
    SERVER_TS.write_text(server, encoding="utf-8")
    print("✓ server.ts: /assets/dashboard-topbar.js route registered")


# ============================================================
# Loader in dashboard-ui.js
# ============================================================
ui_content = DASHBOARD_UI.read_text(encoding="utf-8")

if "dashboard-topbar.js" in ui_content:
    print("· dashboard-ui.js already loads topbar — skipping")
else:
    snippet = """
// __UKC_TOPBAR_LOADER__
(function () {
  var s = document.createElement('script');
  s.src = '/assets/dashboard-topbar.js';
  s.async = false;
  document.head.appendChild(s);
})();
"""
    ui_content = ui_content.rstrip() + "\n" + snippet
    DASHBOARD_UI.write_text(ui_content, encoding="utf-8")
    print("✓ dashboard-ui.js: topbar loader appended")
