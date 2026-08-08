#!/usr/bin/env python3
"""
Phase 2a: SPA-Conversion
- Wrap existing Dashboard-Inhalt in <div class="section" data-section="dashboard">
- Extract <div class="page">...</div> aus 17 Sub-Mockups als zusätzliche Sections
- Update Sidebar-Items: onclick="window.location.href='/X-preview'" → showSection('X')
- Inject SPA-Router (hash-based + history.pushState)
- CSS für smooth transitions

Sub-Sektionen die gewired werden (mit echten Daten):
  kurse, buchungen, kunden, kursbloecke, rechnungen, probestunden
Statisch eingebettet (Mockup-Daten):
  postfach, credits, anwesenheit, raeume, ki-assistent, integrationen,
  team, berichte, marketing, embed, ferien, einstellungen
"""
import os
import re
from pathlib import Path

TARGET = os.environ.get('UKC_TARGET', 'sandbox')
BASE = Path('/opt/urban-kids-club-prod-v2' if TARGET == 'prod' else '/opt/urban-kids-club-v2')
PD = BASE / 'packages' / 'provider-dashboard' / 'src'
WIDGETS = PD / 'widgets'
DV3 = PD / 'frontend' / 'dashboard-v3.html'

# Mapping: sidebar-route → section-id → mockup-file
SECTIONS = [
    # (section_id, mockup_filename, label)
    ('dashboard', None, 'Dashboard'),                         # bleibt wie es ist
    ('kurse', 'kurse-preview.html', 'Kurse'),
    ('buchungen', 'buchungen-preview.html', 'Buchungen'),
    ('kursbloecke', 'kursbloecke-preview.html', 'Kursblöcke'),
    ('kunden', 'kunden-preview.html', 'Kunden'),
    ('probestunden', 'probestunden-preview.html', 'Probestunden'),
    ('team', 'team-preview.html', 'Team'),
    ('postfach', 'postfach-preview.html', 'Postfach'),
    ('rechnungen', 'rechnungen-preview.html', 'Rechnungen'),
    ('berichte', 'berichte-preview.html', 'Berichte'),
    ('credits', 'credits-preview.html', 'Credits'),
    ('anwesenheit', 'anwesenheit-preview.html', 'Anwesenheit'),
    ('raeume', 'raeume-preview.html', 'Räume'),
    ('ferien', 'ferien-preview.html', 'Ferien & Saisons'),
    ('embed', 'embed-preview.html', 'Einbettung'),
    ('marketing', 'marketing-preview.html', 'Marketing'),
    ('ki-assistent', 'ki-assistent-preview.html', 'KI-Assistent'),
    ('integrationen', 'integrationen-preview.html', 'Integrationen'),
    ('einstellungen', 'einstellungen-preview.html', 'Einstellungen'),
]


def extract_page_content(path: Path):
    """Extract balanced <div class="page">...</div> block from mockup file."""
    if not path.exists():
        return None
    src = path.read_text(encoding='utf-8')
    start = src.find('<div class="page">')
    if start < 0:
        # Fallback: try <main>...</main>
        main_start = src.find('<main')
        if main_start < 0:
            return None
        # Find <div class="page" inside main, or extract main directly
        return None
    # Balanced div counting
    pos = start + len('<div')
    depth = 1
    while pos < len(src) and depth > 0:
        next_open = src.find('<div', pos)
        next_close = src.find('</div>', pos)
        if next_close < 0:
            return None
        if next_open >= 0 and next_open < next_close:
            depth += 1
            pos = next_open + 4
        else:
            depth -= 1
            pos = next_close + 6
    return src[start:pos]


# ============================================================
# Schritt 1: Extract all sub-section contents
# ============================================================
section_html_map = {}  # section_id → html-string
for sid, fname, label in SECTIONS:
    if sid == 'dashboard' or fname is None:
        continue
    p = WIDGETS / fname
    content = extract_page_content(p)
    if content:
        section_html_map[sid] = content
        print(f'OK extract: {sid} ({len(content)} chars)')
    else:
        # Fallback: leeres div mit "noch nicht implementiert"
        section_html_map[sid] = f'<div class="page"><div style="padding:60px;text-align:center;color:var(--muted)"><h2 style="font-family:Fraunces,serif;font-weight:400;font-size:32px;color:var(--ink);margin-bottom:8px">{label}</h2><p style="font-size:14px">Diese Sektion wird gerade gebaut.</p></div></div>'
        print(f'FALLBACK: {sid} (no page-content extracted)')


# ============================================================
# Schritt 2: Read dashboard-v3.html and modify
# ============================================================
src = DV3.read_text(encoding='utf-8')

# 2a. Wrap existing <div class="page"> inhalt in section
# Find existing page div
page_match = re.search(r'<div class="page">', src)
if page_match:
    # Replace with section wrapper
    src = src.replace(
        '<div class="page">',
        '<div class="page-host" id="phPageHost">\n      <div class="section" data-section="dashboard">\n      <div class="page">',
        1
    )
    # Find matching </div></div> after first <div class="page"> closure
    # We need to inject </div> (close section) AFTER the page closes
    # Easier: find the existing close — look for "</div>\n    </div>\n  </div>\n</div>" (page→main→app→outer)
    # Or use anchor: "</div>\n\n    </div>\n  </div>\n</div>" if WOCHE-IM-BLICK was removed properly
    print('OK Step 2a: Section-Wrapper für Dashboard')

# 2b. Find end of <div class="page"> (closes dashboard section)
# Search for "  </div>\n</div>\n\n<script>" pattern (our current end)
# Insert close-section + sub-sections before this pattern
end_anchor = '\n    </div>\n  </div>\n</div>\n'  # end of .page, .main, .app
end_idx = src.rfind(end_anchor)
if end_idx >= 0:
    # Generate sub-sections HTML
    sub_sections_html = '\n      </div>  <!-- close dashboard section -->\n\n'
    for sid, fname, label in SECTIONS:
        if sid == 'dashboard':
            continue
        section_inner = section_html_map.get(sid, f'<div class="page"><h2>{label}</h2></div>')
        # Wrap each section
        sub_sections_html += f'      <div class="section" data-section="{sid}" hidden>\n        {section_inner}\n      </div>\n\n'
    sub_sections_html += '      </div>  <!-- close page-host -->\n'
    # Replace
    src = src[:end_idx] + sub_sections_html + src[end_idx:]
    print(f'OK Step 2b: 18 Sub-Sections injected ({len(sub_sections_html)} chars)')

# ============================================================
# Schritt 3: Update Sidebar-Items: window.location.href → showSection
# ============================================================
sidebar_replacements = [
    # ('/provider-preview', 'dashboard'),  # already 'active' button
    ('/kurse-preview', 'kurse'),
    ('/buchungen-preview', 'buchungen'),
    ('/kursbloecke-preview', 'kursbloecke'),
    ('/kunden-preview', 'kunden'),
    ('/probestunden-preview', 'probestunden'),
    ('/team-preview', 'team'),
    ('/postfach-preview', 'postfach'),
    ('/rechnungen-preview', 'rechnungen'),
    ('/berichte-preview', 'berichte'),
    ('/credits-preview', 'credits'),
    ('/anwesenheit-preview', 'anwesenheit'),
    ('/raeume-preview', 'raeume'),
    ('/ferien-preview', 'ferien'),
    ('/embed-preview', 'embed'),
    ('/marketing-preview', 'marketing'),
    ('/ki-assistent-preview', 'ki-assistent'),
    ('/integrationen-preview', 'integrationen'),
    ('/einstellungen-preview', 'einstellungen'),
]
for old_path, sid in sidebar_replacements:
    old = f"window.location.href='{old_path}'"
    new = f"showSection('{sid}')"
    if old in src:
        src = src.replace(old, new)
        # Don't print all 18 to keep output clean
# Handle Dashboard active item too — it had window.location.href='/provider-preview'
old_dash = "window.location.href='/provider-preview'"
new_dash = "showSection('dashboard')"
src = src.replace(old_dash, new_dash)
print('OK Step 3: Sidebar-Items auf showSection() umgestellt')

# Add data-section-target attribute for active-state tracking
def add_data_section_attr(src):
    # For each nav-item button, add data-section-target based on the showSection arg
    pattern = re.compile(r'<button class="nav-item([^"]*)" onclick="showSection\(\'([^\']+)\'\)">')
    def repl(m):
        cls = m.group(1)
        sid = m.group(2)
        return f'<button class="nav-item{cls}" data-section-target="{sid}" onclick="showSection(\'{sid}\')">'
    return pattern.sub(repl, src)
src = add_data_section_attr(src)
print('OK Step 3b: data-section-target attribute added')

# ============================================================
# Schritt 4: SPA-Router JS einfügen (vor schließendem </script> des Wiring-Blocks)
# ============================================================
SPA_ROUTER_JS = '''
// ============================================================
// Phase 2a: SPA-Router (Section-Switching ohne Page-Reload)
// ============================================================
window.showSection = function(name) {
  document.querySelectorAll('.section').forEach(s => {
    s.hidden = (s.dataset.section !== name);
  });
  document.querySelectorAll('.nav-item').forEach(b => {
    if (b.dataset.sectionTarget === name) b.classList.add('active');
    else b.classList.remove('active');
  });
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'instant' });
  // Update URL
  if (location.hash !== '#' + name) {
    history.pushState({ section: name }, '', '#' + name);
  }
  // Trigger lazy load if section has loader
  if (window.sectionLoaders && window.sectionLoaders[name] && !window.sectionLoaded[name]) {
    window.sectionLoaders[name]();
    window.sectionLoaded[name] = true;
  }
};
window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaded = window.sectionLoaded || {};

// Init: load section based on URL hash
function initSection() {
  const hash = location.hash.slice(1) || 'dashboard';
  const valid = !!document.querySelector('[data-section="' + hash + '"]');
  showSection(valid ? hash : 'dashboard');
}

window.addEventListener('hashchange', () => {
  const hash = location.hash.slice(1) || 'dashboard';
  showSection(hash);
});
window.addEventListener('popstate', initSection);

// Run init after DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSection);
} else {
  initSection();
}
'''

# Find Logout-Function definition and insert SPA-Router JS BEFORE it
logout_anchor = '// Logout — global function (called via onclick attribute)'
if logout_anchor in src:
    src = src.replace(logout_anchor, SPA_ROUTER_JS + '\n' + logout_anchor, 1)
    print('OK Step 4: SPA-Router JS eingefügt')
else:
    print('SKIP Step 4: Logout-Anchor nicht gefunden')

# ============================================================
# Schritt 5: CSS-Anpassung — section + page-host styles
# ============================================================
EXTRA_CSS = '''
/* Phase 2a: SPA Sections */
.page-host { width: 100%; }
.section[hidden] { display: none !important; }
.section { animation: fadeIn 0.18s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
'''
# Insert before </style> (last </style>)
last_style = src.rfind('</style>')
if last_style >= 0:
    src = src[:last_style] + EXTRA_CSS + '\n' + src[last_style:]
    print('OK Step 5: SPA-CSS eingefügt')

# ============================================================
# Sanity
# ============================================================
print(f'\nTag-Balance: <div>={src.count("<div")}/{src.count("</div>")}, <button>={src.count("<button")}/{src.count("</button>")}, <script>={src.count("<script")}/{src.count("</script>")}, <section>={src.count("<section")}/{src.count("</section>")}')

DV3.write_text(src, encoding='utf-8')
print(f'\nOK: dashboard-v3.html geschrieben ({len(src)} bytes)')
