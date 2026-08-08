#!/usr/bin/env python3
"""
Phase 1c-Final: Auto-Redirect von / auf /v3 nach erfolgreichem Login
Patcht dashboard.html so, dass nach Login automatisch /v3 geladen wird.
- checkAuth() → wenn Session schon da: redirect /v3 (statt showDashboard)
- handleLogin() → nach Login-Success: redirect /v3 (statt showDashboard)

Sicherheit: Login-Form bleibt unter / erreichbar, nicht-eingeloggte sehen weiterhin Login.
PendingScreen bei nicht-approvedProvidern bleibt unverändert.
"""
import os
from pathlib import Path

TARGET = os.environ.get('UKC_TARGET', 'sandbox')
BASE = Path('/opt/urban-kids-club-prod-v2' if TARGET == 'prod' else '/opt/urban-kids-club-v2')
PD = BASE / 'packages' / 'provider-dashboard' / 'src'
DH = PD / 'frontend' / 'dashboard.html'

src = DH.read_text(encoding='utf-8')
patches = 0

# ============================================================
# Patch 1: checkAuth() — wenn Session schon da, redirect zu /v3
# Anchor: showDashboard() + init() Block in checkAuth (line ~686)
# ============================================================
OLD_CHECKAUTH = """          const approved = await checkProviderApproved()
          if (approved) {
            showDashboard()
            init()
          } else {
            showPendingScreen()
          }"""

NEW_CHECKAUTH = """          const approved = await checkProviderApproved()
          if (approved) {
            // Phase 1c: Redirect to /v3 (Sophie-Look Dashboard)
            window.location.href = '/v3'
            return
          } else {
            showPendingScreen()
          }"""

# Es gibt 2 Stellen mit identischem Block (checkAuth + handleLogin)
# Beide ersetzen
count = src.count(OLD_CHECKAUTH)
print(f'Anchor-Treffer: {count}')
if count > 0:
    src = src.replace(OLD_CHECKAUTH, NEW_CHECKAUTH)
    patches += count
    print(f'OK: {count} Stellen mit /v3 Redirect ersetzt (checkAuth + handleLogin)')

# ============================================================
# Sanity
# ============================================================
print(f'\nPatches: {patches}/2')
print(f'Tag-Balance: <button>={src.count("<button")}/{src.count("</button>")}, <script>={src.count("<script")}/{src.count("</script>")}')

DH.write_text(src, encoding='utf-8')
print(f'\nOK: dashboard.html geschrieben ({len(src)} bytes)')
