"""Wire sidebar nav in all provider dashboard previews on the server."""
import subprocess, re

PREVIEWS = [
    'provider-preview.html',
    'kurse-preview.html',
    'kurs-detail-preview.html',
    'buchungen-preview.html',
    'buchung-detail-preview.html',
    'kunden-preview.html',
    'kunden-detail-preview.html',
    'rechnungen-preview.html',
    'rechnung-detail-preview.html',
    'kalender-preview.html',
    'einstellungen-preview.html',
    'marketing-preview.html',
]

NAV_TARGETS = {
    'Dashboard': '/provider-preview',
    'Kurse': '/kurse-preview',
    'Buchungen': '/buchungen-preview',
    'Kalender': '/kalender-preview',
    'Kunden': '/kunden-preview',
    'Rechnungen': '/rechnungen-preview',
    'Marketing': '/marketing-preview',
    'Einstellungen': '/einstellungen-preview',
}

# Build a bash script executed on server that patches all files
script = '''#!/bin/bash
cd /opt/urban-kids-club-v2/packages/provider-dashboard/src/widgets
python3 <<'PYEOF'
from pathlib import Path
import re

previews = %r
targets = %r

nav_pattern = re.compile(r'<button class="nav-item( active)?">([^<]+?)(<span class="badge">[^<]+</span>)?</button>')

def wire(text):
    def repl(m):
        active_attr = m.group(1) or ''
        label = m.group(2).strip()
        badge = m.group(3) or ''
        # find matching target
        for key, url in targets.items():
            if label.startswith(key):
                return f'<button class="nav-item{active_attr}" onclick="window.location.href=\\'{url}\\'">{label}{badge}</button>'
        return m.group(0)  # no match, leave as-is
    return nav_pattern.sub(repl, text)

patched = 0
for name in previews:
    p = Path(name)
    if not p.exists():
        print(f'SKIP {name} (not found)')
        continue
    src = p.read_text(encoding='utf-8')
    new = wire(src)
    if new != src:
        p.write_text(new, encoding='utf-8')
        patched += 1
        print(f'WIRED {name}')
    else:
        print(f'UNCHANGED {name}')
print(f'Total patched: {patched}')
PYEOF
systemctl restart dashboard-v2
sleep 3
for p in provider kurse kurs-detail buchungen buchung-detail kunden kunden-detail rechnungen rechnung-detail kalender einstellungen marketing; do
  printf '%%-28s %%s\\n' "$p" "$(curl -s -o /dev/null -w '%%{http_code}' https://v2.urbankids.club/$p-preview)"
done
''' % (PREVIEWS, NAV_TARGETS)

print(script)
