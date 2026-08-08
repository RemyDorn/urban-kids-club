#!/usr/bin/env python3
"""
Wire Socialy Consumer Polish:
  1. Register /assets/socialy-polish.js route
  2. Inject <script src="/assets/socialy-polish.js"></script> in den 3 Consumer-Pages
"""
from pathlib import Path

SERVER_TS = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/api/server.ts")
WIDGETS = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/widgets")

# ============================================================
# Route
# ============================================================
server = SERVER_TS.read_text(encoding="utf-8")

anchor = """  if (path === '/assets/dashboard-polish.js') {
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

new_block = anchor + """
  if (path === '/assets/socialy-polish.js') {
    try {
      const js = readFileSync(resolve(__dirname, '../frontend/socialy-polish.js'), 'utf-8')
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(js)
    } catch (err) {
      res.statusCode = 404; res.end('Socialy polish script not found')
    }
    return
  }"""

if "/assets/socialy-polish.js" in server:
    print("· server.ts already has socialy-polish route — skipping")
else:
    if anchor not in server:
        raise SystemExit("ERROR: dashboard-polish anchor not found")
    server = server.replace(anchor, new_block, 1)
    SERVER_TS.write_text(server, encoding="utf-8")
    print("✓ server.ts: socialy-polish route registered")


# ============================================================
# Script-Tag in 3 Consumer-Pages
# ============================================================
CONSUMER_PAGES = [
    "portal-preview.html",
    "invite-landing-preview.html",
    "login-preview.html",
]

tag = '<script src="/assets/socialy-polish.js"></script>'

for fname in CONSUMER_PAGES:
    p = WIDGETS / fname
    if not p.exists():
        print(f"  ✗ {fname} — file not found")
        continue
    html = p.read_text(encoding="utf-8")
    if tag in html:
        print(f"  · {fname} — already has tag, skipping")
        continue
    # Vor </body> einfügen
    if "</body>" in html:
        html = html.replace("</body>", tag + "\n</body>", 1)
    else:
        html = html.rstrip() + "\n" + tag + "\n"
    p.write_text(html, encoding="utf-8")
    print(f"  ✓ {fname} — tag injected")
