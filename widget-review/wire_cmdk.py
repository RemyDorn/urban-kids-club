#!/usr/bin/env python3
"""
Wire Command-Palette:
  1. Register /assets/dashboard-cmdk.js route in server.ts
  2. dashboard-ui.js lädt dashboard-cmdk.js dynamisch (einmalig am Ende)
"""
from pathlib import Path

SERVER_TS = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/api/server.ts")
DASHBOARD_UI = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/frontend/dashboard-ui.js")

# ============================================================
# Route
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

new_block = anchor + """
  if (path === '/assets/dashboard-cmdk.js') {
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

if "/assets/dashboard-cmdk.js" in server:
    print("· server.ts already has cmdk route — skipping")
else:
    if anchor not in server:
        raise SystemExit("ERROR: dashboard-ui anchor not found in server.ts")
    server = server.replace(anchor, new_block, 1)
    SERVER_TS.write_text(server, encoding="utf-8")
    print("✓ server.ts: /assets/dashboard-cmdk.js route registered")


# ============================================================
# dashboard-ui.js: dynamic loader am Ende einfügen (einmalig)
# ============================================================
ui_content = DASHBOARD_UI.read_text(encoding="utf-8")

loader_marker = "// __UKC_CMDK_LOADER__"
loader_snippet = """
// __UKC_CMDK_LOADER__
(function () {
  if (window.__ukcCmdKInjected) return;
  var s = document.createElement('script');
  s.src = '/assets/dashboard-cmdk.js';
  s.async = false;
  document.head.appendChild(s);
})();
"""

if loader_marker in ui_content:
    print("· dashboard-ui.js already has cmdk loader — skipping")
else:
    ui_content = ui_content.rstrip() + "\n" + loader_snippet
    DASHBOARD_UI.write_text(ui_content, encoding="utf-8")
    print("✓ dashboard-ui.js: dynamic cmdk loader appended")
