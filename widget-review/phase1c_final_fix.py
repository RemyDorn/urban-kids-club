#!/usr/bin/env python3
"""
Phase 1c-Final-Fix: API Response-Format + Logout-Button korrigieren
Bug: Endpoints returnen {data: [...]}, nicht {providers/activities/bookings: [...]}
Bug: Logout-Button addEventListener nicht zuverlässig — switch zu onclick attribute
"""
import os
from pathlib import Path

TARGET = os.environ.get('UKC_TARGET', 'sandbox')
BASE = Path('/opt/urban-kids-club-prod-v2' if TARGET == 'prod' else '/opt/urban-kids-club-v2')
PD = BASE / 'packages' / 'provider-dashboard' / 'src'
DV3 = PD / 'frontend' / 'dashboard-v3.html'

src = DV3.read_text(encoding='utf-8')
patches = 0

# ============================================================
# Fix 1: Response-Format /api/providers → {data: [...]}
# ============================================================
old_prov = "const providers = provRes.providers || provRes || [];"
new_prov = "const providers = provRes.data || provRes.providers || provRes || [];"
if old_prov in src:
    src = src.replace(old_prov, new_prov, 1)
    patches += 1
    print('OK Fix 1: /api/providers Response-Format')

# ============================================================
# Fix 2: Response-Format /api/providers/:id/activities → {data: [...]}
# ============================================================
old_act = "activities = r.activities || r || [];"
new_act = "activities = r.data || r.activities || r || [];"
if old_act in src:
    src = src.replace(old_act, new_act, 1)
    patches += 1
    print('OK Fix 2: activities Response-Format')

# ============================================================
# Fix 3: Response-Format /api/providers/:id/bookings → {data: [...]}
# ============================================================
old_book = "bookings = r.bookings || r || [];"
new_book = "bookings = r.data || r.bookings || r || [];"
if old_book in src:
    src = src.replace(old_book, new_book, 1)
    patches += 1
    print('OK Fix 3: bookings Response-Format')

# ============================================================
# Fix 4: Logout-Button — onclick-Attribute statt addEventListener
# ============================================================
# 4a: Define global function at script start
old_logout_block = """// Logout
document.querySelector('.logout-btn')?.addEventListener('click', async () => {
  // Nur localStorage clearen + reload
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith('sb-')) localStorage.removeItem(k);
  }
  window.location.href = '/';
});"""

new_logout_block = """// Logout — global function (called via onclick attribute)
window.dashboardV3Logout = function() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith('sb-')) localStorage.removeItem(k);
  }
  window.location.href = '/';
};
// Auch alle .logout-btn Buttons binden (falls onclick nicht eingehängt wird)
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.logout-btn').forEach(btn => {
    btn.onclick = window.dashboardV3Logout;
  });
});
// Direkt jetzt auch versuchen (falls DOM schon ready)
document.querySelectorAll('.logout-btn').forEach(btn => {
  btn.onclick = window.dashboardV3Logout;
});"""

if old_logout_block in src:
    src = src.replace(old_logout_block, new_logout_block, 1)
    patches += 1
    print('OK Fix 4: Logout-Button onclick + DOMContentLoaded fallback')

# ============================================================
# Fix 5: Logout-Button HTML — onclick-Attribut hinzufügen
# ============================================================
old_logout_btn = '<button class="logout-btn">Abmelden</button>'
new_logout_btn = '<button class="logout-btn" onclick="window.dashboardV3Logout && window.dashboardV3Logout()">Abmelden</button>'
if old_logout_btn in src:
    src = src.replace(old_logout_btn, new_logout_btn, 1)
    patches += 1
    print('OK Fix 5: Logout-Button HTML onclick-Attribut')

# ============================================================
# Sanity
# ============================================================
print(f'\nPatches angewendet: {patches}/5')
print(f'Tag-Balance: <button>={src.count("<button")}/{src.count("</button>")}, <script>={src.count("<script")}/{src.count("</script>")}')
print(f'Postfach im File: {src.count("Postfach")} (sollte 1)')

DV3.write_text(src, encoding='utf-8')
print(f'\nOK: dashboard-v3.html geschrieben ({len(src)} bytes)')
