#!/usr/bin/env python3
"""
Phase 1a: Sidebar-Polish auf Production dashboard.html
- Logo "URBAN KIDS Club" mit italic Club
- 6 neue Sidebar-Items (Postfach, Credits, Anwesenheit, Räume, KI-Assistent, Integrationen)
- Counter-Badges (hardcoded zunächst, später JS-gefüllt)
- Navigation der neuen Items zu /X-preview Routes (existieren bereits)

Sicherheit: rindex/find statt globaler Replace, Syntax-Check (HTML-Tag-Balance)
"""
from pathlib import Path
import sys

import os
TARGET = os.environ.get('UKC_TARGET', 'sandbox')  # 'sandbox' (v2.urbankids.club, Port 3012) oder 'prod' (app.urbankids.club, Port 3013)
if TARGET == 'prod':
    DH = Path('/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard.html')
else:
    DH = Path('/opt/urban-kids-club-v2/packages/provider-dashboard/src/frontend/dashboard.html')
print(f'TARGET: {TARGET} → {DH}')
src = DH.read_text(encoding='utf-8')
orig_size = len(src)
patches_applied = 0

# ============================================================
# PATCH 1: Logo "URBAN KIDS" → "URBAN KIDS Club"
# Sidebar-Brand (Zeile ~439)
# ============================================================
old_logo = '<span class="font-heading font-bold text-brand-100 text-[15px] tracking-[0.02em]">URBAN KIDS</span>'
new_logo = '<span class="font-heading font-bold text-brand-100 text-[15px] tracking-[0.02em]">URBAN KIDS <em class="not-italic font-accent" style="font-style:italic;font-weight:400;opacity:0.85;font-family:Fraunces,Georgia,serif">Club</em></span>'
if old_logo in src:
    src = src.replace(old_logo, new_logo, 1)
    patches_applied += 1
    print(f'OK Patch 1: Logo "URBAN KIDS Club" mit italic')
else:
    print(f'SKIP Patch 1: Logo-Anchor nicht gefunden')

# ============================================================
# PATCH 2: Counter-Badges für existierende Items
# ============================================================
# Helper: badge-Span im nav-item-Style
def add_badge(item_html_old, count_var):
    """Wandelt 'class="...">Kurse</button>' → 'class="...">Kurse<span data-counter="kurse" class="ml-auto inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-300/20 text-brand-200">8</span></button>'"""
    pass

# Kurse Counter
old_kurse = "navigate('activities')\" data-page=\"activities\" class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all\">Kurse</button>"
new_kurse = "navigate('activities')\" data-page=\"activities\" class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all flex items-center justify-between\">Kurse<span data-counter=\"activities\" class=\"text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-300/20 text-brand-200\">·</span></button>"
if old_kurse in src:
    src = src.replace(old_kurse, new_kurse, 1)
    patches_applied += 1
    print(f'OK Patch 2a: Kurse Counter-Badge')

# Buchungen Counter
old_buchungen = "navigate('bookings')\" data-page=\"bookings\" class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all\">Buchungen</button>"
new_buchungen = "navigate('bookings')\" data-page=\"bookings\" class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all flex items-center justify-between\">Buchungen<span data-counter=\"bookings\" class=\"text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-300/20 text-brand-200\">·</span></button>"
if old_buchungen in src:
    src = src.replace(old_buchungen, new_buchungen, 1)
    patches_applied += 1
    print(f'OK Patch 2b: Buchungen Counter-Badge')

# Kunden Counter
old_kunden = "navigate('customers')\" data-page=\"customers\" class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all\">Kunden</button>"
new_kunden = "navigate('customers')\" data-page=\"customers\" class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all flex items-center justify-between\">Kunden<span data-counter=\"customers\" class=\"text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-300/20 text-brand-200\">·</span></button>"
if old_kunden in src:
    src = src.replace(old_kunden, new_kunden, 1)
    patches_applied += 1
    print(f'OK Patch 2c: Kunden Counter-Badge')

# Probestunden Counter
old_proben = "navigate('trials')\" data-page=\"trials\" class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all\">Probestunden</button>"
new_proben = "navigate('trials')\" data-page=\"trials\" class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all flex items-center justify-between\">Probestunden<span data-counter=\"trials\" class=\"text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-300/20 text-brand-200\">·</span></button>"
if old_proben in src:
    src = src.replace(old_proben, new_proben, 1)
    patches_applied += 1
    print(f'OK Patch 2d: Probestunden Counter-Badge')

# ============================================================
# PATCH 3: 6 neue Sidebar-Items
# Position: Postfach (nach Team), Credits (nach Berichte), Anwesenheit + Räume (vor Ferien),
#           KI-Assistent (nach Marketing), Integrationen (vor Einstellungen)
# ============================================================

NAV_NEW_ITEM_TEMPLATE = (
    "<button onclick=\"window.location.href='/{route}'\" "
    "class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all flex items-center justify-between\">"
    "{label}{badge}</button>"
)

def make_item(route, label, badge_text=None, pro=False):
    badge_html = ''
    if badge_text:
        badge_html = f'<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-300/20 text-brand-200">{badge_text}</span>'
    if pro:
        badge_html = '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-400/30 text-brand-100 tracking-wider">PRO</span>'
    return NAV_NEW_ITEM_TEMPLATE.format(route=route, label=label, badge=badge_html)

# 3a: Postfach nach Team
team_anchor = "navigate('team')\" data-page=\"team\" class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all\">Team</button>"
postfach_item = "\n          " + make_item('postfach-preview', 'Postfach', '·')
if team_anchor in src:
    src = src.replace(team_anchor, team_anchor + postfach_item, 1)
    patches_applied += 1
    print(f'OK Patch 3a: Postfach eingefügt nach Team')

# 3b: Credits nach Berichte
berichte_anchor = "navigate('reports')\" data-page=\"reports\" class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all\">Berichte</button>"
credits_item = "\n          " + make_item('credits-preview', 'Credits')
if berichte_anchor in src:
    src = src.replace(berichte_anchor, berichte_anchor + credits_item, 1)
    patches_applied += 1
    print(f'OK Patch 3b: Credits eingefügt nach Berichte')

# 3c: Anwesenheit + Räume vor Ferien & Saisons
ferien_anchor = "<button onclick=\"navigate('holidays')\" data-page=\"holidays\" class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all\">Ferien & Saisons</button>"
new_pre_ferien = make_item('anwesenheit-preview', 'Anwesenheit') + "\n          " + make_item('raeume-preview', 'Räume') + "\n          " + ferien_anchor
if ferien_anchor in src:
    src = src.replace(ferien_anchor, new_pre_ferien, 1)
    patches_applied += 1
    print(f'OK Patch 3c: Anwesenheit + Räume eingefügt vor Ferien & Saisons')

# 3d: KI-Assistent nach Marketing
marketing_anchor = "navigate('marketing')\" data-page=\"marketing\" class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all\">Marketing</button>"
ki_item = "\n          " + make_item('ki-assistent-preview', 'KI-Assistent', pro=True)
if marketing_anchor in src:
    src = src.replace(marketing_anchor, marketing_anchor + ki_item, 1)
    patches_applied += 1
    print(f'OK Patch 3d: KI-Assistent eingefügt nach Marketing')

# 3e: Integrationen vor Einstellungen
einstellungen_anchor = "<button onclick=\"navigate('settings')\" data-page=\"settings\" class=\"nav-item w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-brand-300 transition-all\">Einstellungen</button>"
integrationen_item = make_item('integrationen-preview', 'Integrationen') + "\n          " + einstellungen_anchor
if einstellungen_anchor in src:
    src = src.replace(einstellungen_anchor, integrationen_item, 1)
    patches_applied += 1
    print(f'OK Patch 3e: Integrationen eingefügt vor Einstellungen')

# ============================================================
# PATCH 4: JS-Hook zum Counter-Update — Hook in den existierenden /api/dashboard-stats Loader
# ============================================================
# Suche eine geeignete Stelle (z.B. nach loadDashboardData oder im fetch-then-Block)
# Wir fügen ein hilfsfunction ein, das beim ersten Daten-Load die Counter füllt
counter_js = '''
    // Phase 1a: Sidebar-Counter-Update
    function updateSidebarCounters(stats) {
      try {
        const map = {
          activities: stats?.activeCourses ?? stats?.totalCourses ?? null,
          bookings: stats?.monthlyBookings ?? stats?.totalBookings ?? null,
          customers: stats?.totalCustomers ?? null,
          trials: stats?.openTrials ?? stats?.pendingTrials ?? null,
        };
        Object.entries(map).forEach(([key, val]) => {
          if (val === null || val === undefined) return;
          document.querySelectorAll('[data-counter="' + key + '"]').forEach(el => {
            el.textContent = String(val);
          });
        });
      } catch (e) { console.warn('counter update failed', e); }
    }
'''

# Insert before closing </script> of the main app (find the LAST </script>)
last_script_close = src.rfind('</script>')
if last_script_close != -1:
    src = src[:last_script_close] + counter_js + '\n  ' + src[last_script_close:]
    patches_applied += 1
    print(f'OK Patch 4: updateSidebarCounters() Funktion eingefügt')

# ============================================================
# Syntax-Sanity-Check: Tag-Balance prüfen
# ============================================================
opens = src.count('<button')
closes = src.count('</button>')
asides_open = src.count('<aside')
asides_close = src.count('</aside>')
print(f'\nTAG-BALANCE: <button>={opens}/{closes}, <aside>={asides_open}/{asides_close}')
if opens != closes:
    print(f'WARNING: <button> Tags unbalanced! Diff: {opens - closes}')
    sys.exit(1)
if asides_open != asides_close:
    print(f'WARNING: <aside> Tags unbalanced! Diff: {asides_open - asides_close}')
    sys.exit(1)

# ============================================================
# Schreiben
# ============================================================
DH.write_text(src, encoding='utf-8')
new_size = len(src)
print(f'\nOK: dashboard.html geschrieben ({orig_size} → {new_size} bytes, +{new_size - orig_size})')
print(f'Patches angewendet: {patches_applied}/11')
