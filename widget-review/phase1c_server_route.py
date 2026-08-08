#!/usr/bin/env python3
"""
Phase 1c: Server-Route /v3 hinzufügen
Liefert dashboard-v3.html für /v3 und /v3/ aus
"""
import os
from pathlib import Path

TARGET = os.environ.get('UKC_TARGET', 'sandbox')
BASE = Path('/opt/urban-kids-club-prod-v2' if TARGET == 'prod' else '/opt/urban-kids-club-v2')
PD = BASE / 'packages' / 'provider-dashboard' / 'src'

S = PD / 'api' / 'server.ts'
src = S.read_text(encoding='utf-8')

# Anchor: Route für /provider-preview existiert schon — wir hängen /v3 daneben
ANCHOR = """  if (path === '/provider-preview' || path === '/provider-preview/') {
    try {
      const html = readFileSync(resolve(__dirname, '../widgets/provider-preview.html'), 'utf-8')"""

NEW_V3_ROUTE = '''  // Phase 1c: /v3 → dashboard-v3.html (Sophie-Look mit Backend-Wiring)
  if (path === '/v3' || path === '/v3/' || path === '/dashboard-v3' || path === '/dashboard-v3/') {
    try {
      const html = readFileSync(resolve(__dirname, '../frontend/dashboard-v3.html'), 'utf-8')
      res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(html); return
    } catch (err) {
      res.statusCode = 500; res.end('dashboard-v3 not found: ' + (err as Error).message); return
    }
  }

'''

if 'path === \'/v3\'' in src:
    print('SKIP: /v3 Route existiert bereits')
elif ANCHOR in src:
    src = src.replace(ANCHOR, NEW_V3_ROUTE + ANCHOR, 1)
    S.write_text(src, encoding='utf-8')
    print(f'OK: /v3 Route eingefügt vor /provider-preview ({len(src)} bytes)')
else:
    print(f'FAIL: Anchor /provider-preview nicht gefunden')
