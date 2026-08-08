#!/usr/bin/env python3
"""
Wire Phase-2 backend stubs into V2 server:
  - parent.service.ts          (already self-contained, just copy)
  - magic-link.service.ts      (depends on parent.service)
  - parent-auth-routes.ts      (handler)
  - push.service.ts            (handler)
  - backfill_parents.ts        (CLI tool, not auto-executed)

Add server.ts wiring to call handleParentAuth + handlePushRoutes early.
"""
from pathlib import Path

SERVER_TS = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/api/server.ts")
src = SERVER_TS.read_text(encoding="utf-8")

# ----- Add imports -----
imports_to_add = [
    "import { handleParentAuth } from './parent-auth-routes'\n",
    "import { handlePushRoutes } from './push.service'\n",
]

new_imports = ""
for imp in imports_to_add:
    if imp.strip().split(' from')[0] in src:
        continue
    new_imports += imp

if new_imports:
    anchor = "import { handlePortalPwa } from './portal-pwa'\n"
    if anchor not in src:
        raise SystemExit("portal-pwa import anchor not found")
    src = src.replace(anchor, anchor + new_imports, 1)
    print(f"OK added imports:\n{new_imports.rstrip()}")
else:
    print("- imports already present")

# ----- Add dispatcher just before /portal/ check -----
DISPATCHER = """  // Parent Auth (Phase-2 Magic-Link, federation-ready stub)
  if (path.startsWith('/api/parent/') || /^\\/portal\\/[a-z0-9-]+\\/auth$/i.test(path)) {
    const _url = new URL(req.url || '/', 'https://' + (req.headers.host || 'localhost'))
    const handled = await handleParentAuth(req, res, _url)
    if (handled) return
  }

  // Parent Push Notifications (scaffolded — VAPID not configured yet)
  if (path.startsWith('/api/parent/push/')) {
    const _url = new URL(req.url || '/', 'https://' + (req.headers.host || 'localhost'))
    const handled = await handlePushRoutes(req, res, _url, () => null) // session getter wired in next pass
    if (handled) return
  }

"""
if "handleParentAuth(req, res, _url)" in src:
    print("- parent auth dispatcher already present")
else:
    anchor = "  // Portal PWA: white-label per-provider installable web app"
    if anchor not in src:
        raise SystemExit("Portal PWA anchor not found")
    src = src.replace(anchor, DISPATCHER + anchor, 1)
    print("OK inserted Phase-2 auth + push dispatchers")

SERVER_TS.write_text(src, encoding="utf-8")
print(f"\nOK server.ts updated ({len(src)} bytes)")
