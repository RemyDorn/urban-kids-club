#!/usr/bin/env python3
"""
Registriere 5 neue Routes in server.ts und verdrahte Sidebar-Nav in allen Dashboards.
"""
from pathlib import Path
import re

SERVER_TS = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/api/server.ts")
WIDGETS_DIR = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/widgets")

# ============================================================
# STEP 1: Routes in server.ts einfügen
# ============================================================
server = SERVER_TS.read_text(encoding="utf-8")

NEW_ROUTES = """
  // Kursblöcke preview
  if (path === '/kursbloecke-preview' || path === '/kursbloecke-preview/') {
    try {
      const html = readFileSync(resolve(__dirname, '../widgets/kursbloecke-preview.html'), 'utf-8')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(html)
    } catch (err) {
      res.statusCode = 500; res.end('Kursblöcke preview not found')
    }
    return
  }

  // Probestunden preview
  if (path === '/probestunden-preview' || path === '/probestunden-preview/') {
    try {
      const html = readFileSync(resolve(__dirname, '../widgets/probestunden-preview.html'), 'utf-8')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(html)
    } catch (err) {
      res.statusCode = 500; res.end('Probestunden preview not found')
    }
    return
  }

  // Team preview
  if (path === '/team-preview' || path === '/team-preview/') {
    try {
      const html = readFileSync(resolve(__dirname, '../widgets/team-preview.html'), 'utf-8')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(html)
    } catch (err) {
      res.statusCode = 500; res.end('Team preview not found')
    }
    return
  }

  // Berichte preview
  if (path === '/berichte-preview' || path === '/berichte-preview/') {
    try {
      const html = readFileSync(resolve(__dirname, '../widgets/berichte-preview.html'), 'utf-8')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(html)
    } catch (err) {
      res.statusCode = 500; res.end('Berichte preview not found')
    }
    return
  }

  // Ferien & Saisons preview
  if (path === '/ferien-preview' || path === '/ferien-preview/') {
    try {
      const html = readFileSync(resolve(__dirname, '../widgets/ferien-preview.html'), 'utf-8')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(html)
    } catch (err) {
      res.statusCode = 500; res.end('Ferien preview not found')
    }
    return
  }

"""

anchor = "  // Einstellungen preview\n  if (path === '/einstellungen-preview' || path === '/einstellungen-preview/')"
if anchor not in server:
    raise SystemExit("ERROR: Anchor 'Einstellungen preview' not found in server.ts")

# Only insert once
if "/kursbloecke-preview" not in server:
    server = server.replace(anchor, NEW_ROUTES + anchor, 1)
    SERVER_TS.write_text(server, encoding="utf-8")
    print("✓ server.ts: 5 new routes registered before Einstellungen block")
else:
    print("· server.ts already has kursbloecke route — skipping route insertion")


# ============================================================
# STEP 2: Sidebar-Nav in allen Dashboard-Previews verdrahten
# ============================================================
# Map: sichtbarer Text -> route
NAV_MAPPINGS = [
    ("Kursblöcke", "/kursbloecke-preview"),
    ("Probestunden", "/probestunden-preview"),
    ("Team", "/team-preview"),
    ("Berichte", "/berichte-preview"),
    ("Ferien &amp; Saisons", "/ferien-preview"),
]

# Dashboard-Previews, die die Sidebar haben
DASHBOARD_FILES = [
    "provider-preview.html",
    "kurse-preview.html",
    "kurs-detail-preview.html",
    "buchungen-preview.html",
    "buchung-detail-preview.html",
    "kunden-preview.html",
    "kunden-detail-preview.html",
    "rechnungen-preview.html",
    "rechnung-detail-preview.html",
    "kalender-preview.html",
    "einstellungen-preview.html",
    "marketing-preview.html",
    "embed-preview.html",
    # Die 5 neuen haben die Sidebar auch (aus einstellungen copied)
    "kursbloecke-preview.html",
    "probestunden-preview.html",
    "team-preview.html",
    "berichte-preview.html",
    "ferien-preview.html",
]

def wire_nav_in_file(path: Path) -> int:
    if not path.exists():
        return -1
    text = path.read_text(encoding="utf-8")
    before = text
    for nav_text, route in NAV_MAPPINGS:
        # Ohne onclick (verdrahten):
        # <button class="nav-item">Team</button>
        # <button class="nav-item">Kursblöcke</button>
        # <button class="nav-item">Probestunden <span class="badge">4</span></button>
        # <button class="nav-item">Berichte</button>
        # <button class="nav-item">Ferien &amp; Saisons</button>

        # Pattern: <button class="nav-item(| active)">TEXT...</button>
        # Variants:
        #   <button class="nav-item">Team</button>
        #   <button class="nav-item">Kursblöcke</button>
        #   <button class="nav-item">Probestunden <span class="badge">4</span></button>
        #   <button class="nav-item">Berichte</button>
        #   <button class="nav-item">Ferien &amp; Saisons</button>
        #   <button class="nav-item active">Team</button>  (nur in team-preview)

        # Wir setzen onclick. Aktive Nav (active) bekommt auch onclick, damit Klick wiederkehrt.
        pattern = re.compile(
            r'<button class="(nav-item(?:\s+active)?)">' +
            r'(\s*' + re.escape(nav_text) + r'(?:\s*<span class="badge">[^<]+</span>)?\s*)' +
            r'</button>'
        )
        new_text = pattern.sub(
            lambda m: f'<button class="{m.group(1)}" onclick="window.location.href=\'{route}\'">{m.group(2)}</button>',
            text
        )
        text = new_text

    if text != before:
        path.write_text(text, encoding="utf-8")
        return 1
    return 0

changed = []
unchanged = []
missing = []
for fname in DASHBOARD_FILES:
    p = WIDGETS_DIR / fname
    result = wire_nav_in_file(p)
    if result == 1:
        changed.append(fname)
    elif result == 0:
        unchanged.append(fname)
    else:
        missing.append(fname)

print(f"\nSidebar-Nav verdrahtet:")
for f in changed:
    print(f"  ✓ {f}")
if unchanged:
    print(f"\nSchon aktuell / kein Match:")
    for f in unchanged:
        print(f"  · {f}")
if missing:
    print(f"\nFehlt:")
    for f in missing:
        print(f"  ✗ {f}")
