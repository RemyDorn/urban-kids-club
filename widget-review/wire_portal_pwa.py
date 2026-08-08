#!/usr/bin/env python3
"""
Wire Portal PWA into V2 server:
  1. /assets/portal-pwa-banner.js  (frontend asset)
  2. /portal-pwa-demo              (demo HTML)
  3. /portal/:slug/...             (handlePortalPwa dispatch)
"""
from pathlib import Path

SERVER_TS = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/api/server.ts")
src = SERVER_TS.read_text(encoding="utf-8")

# ----- 1. Add import -----
import_line = "import { handlePortalPwa } from './portal-pwa'\n"
if "from './portal-pwa'" in src:
    print("- import already present")
else:
    # Insert after last import { Router } from './router' or similar
    anchor = "import { Router } from './router'"
    if anchor in src:
        src = src.replace(anchor, anchor + "\n" + import_line.rstrip(), 1)
        print("OK added import { handlePortalPwa }")
    else:
        raise SystemExit("Couldn't find anchor for import")

# ----- 2. Insert PWA dispatcher early in path handler -----
# Find existing /embed-v2/ block and place /portal/ dispatcher just BEFORE it
pwa_dispatch = """  // Portal PWA: white-label per-provider installable web app
  // Routes: /portal/:slug, /portal/:slug/manifest.json, /portal/:slug/sw.js, /portal/:slug/icons/*, /portal/:slug/install
  if (path.startsWith('/portal/')) {
    const widgetsDir = resolve(__dirname, '../widgets')
    if (handlePortalPwa(req, res, path, widgetsDir)) return
  }

"""

embed_anchor = "  // Embed V2: Single-Course Session-Picker"
if "handlePortalPwa(req, res, path" in src:
    print("- PWA dispatcher already present")
elif embed_anchor in src:
    src = src.replace(embed_anchor, pwa_dispatch + embed_anchor, 1)
    print("OK added portal PWA dispatcher before embed-v2")
else:
    # Fallback: place before /embed/ block
    fallback = "  // Embed: Public embeddable widgets"
    if fallback in src:
        src = src.replace(fallback, pwa_dispatch + fallback, 1)
        print("OK added portal PWA dispatcher before embed (fallback anchor)")
    else:
        raise SystemExit("Couldn't find anchor for PWA dispatcher")

# ----- 3. Add /assets/portal-pwa-banner.js route -----
banner_route = """  if (path === '/assets/portal-pwa-banner.js') {
    try {
      const js = readFileSync(resolve(__dirname, '../frontend/portal-pwa-banner.js'), 'utf-8')
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(js)
    } catch (err) {
      res.statusCode = 404; res.end('PWA banner not found')
    }
    return
  }
"""

if "/assets/portal-pwa-banner.js" in src:
    print("- banner asset route already present")
else:
    # Anchor: insert after kurs-creator-v2 asset route
    asset_anchor = "  if (path === '/assets/kurs-creator-v2.js') {"
    # find end of that block and insert after
    idx = src.find(asset_anchor)
    if idx < 0:
        raise SystemExit("kurs-creator-v2 asset anchor not found")
    # find matching closing for that block: look for the `return\n  }\n` after
    end_marker = "    return\n  }\n"
    end_idx = src.find(end_marker, idx)
    if end_idx < 0:
        raise SystemExit("end of kurs-creator-v2 block not found")
    insert_pos = end_idx + len(end_marker)
    src = src[:insert_pos] + banner_route + src[insert_pos:]
    print("OK added banner asset route")

# ----- 4. Add /portal-pwa-demo HTML route -----
demo_route = """  if (path === '/portal-pwa-demo' || path === '/portal-pwa-demo/') {
    try {
      const html = readFileSync(resolve(__dirname, '../widgets/portal-pwa-demo.html'), 'utf-8')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(html)
    } catch (err) {
      res.statusCode = 500; res.end('PWA demo render error')
    }
    return
  }
"""
if "/portal-pwa-demo" in src:
    print("- demo route already present")
else:
    anchor = "  if (path === '/kurs-anlegen-preview' || path === '/kurs-anlegen-preview/') {"
    if anchor not in src:
        raise SystemExit("kurs-anlegen-preview anchor not found for demo route")
    src = src.replace(anchor, demo_route + anchor, 1)
    print("OK added /portal-pwa-demo route")

SERVER_TS.write_text(src, encoding="utf-8")
print(f"\nOK server.ts updated ({len(src)} bytes)")
