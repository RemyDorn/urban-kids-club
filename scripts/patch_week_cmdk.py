"""Two fixes:
1. dashboard-v3.html: move renderWeekGlance hook AFTER window.dashboardState
   assignment so state is available; also pass activities directly via fallback
   inside the function so it works even if state isn't fully wired.
2. dashboard-cmdk.js: rewrite NAV_ITEMS + ACTIONS to use /v3 hash routes,
   trigger openKursCreatorV2 for 'Neuer Kurs', drop the mock ENTITIES list
   (so the palette only shows real navigation, not fake customers/courses).
"""

# ============================================================
# 1. Fix renderWeekGlance fallback + move hook after state
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
fs = open(fp, 'r', encoding='utf-8').read()

# 1a. Allow renderWeekGlance to receive an explicit activities arg as fallback.
old_fn = """window.renderWeekGlance = function() {
  var c = document.getElementById('phWeekGlance');
  if (!c) return;
  var s = window.dashboardState; if (!s) return;
  var activities = s.activities || [];"""

new_fn = """window.renderWeekGlance = function(activitiesArg) {
  var c = document.getElementById('phWeekGlance');
  if (!c) return;
  var s = window.dashboardState;
  var activities = activitiesArg || (s && s.activities) || [];"""

if old_fn not in fs:
    print('FAIL: renderWeekGlance signature anchor not found'); exit(1)
fs = fs.replace(old_fn, new_fn, 1)
print('OK: renderWeekGlance accepts explicit activitiesArg')

# 1b. Remove the early hook that ran before state was assigned and add a
#     post-state hook that passes activities directly.
old_early = """    // 6. Letzte Buchungen-Tabelle (5 letzte) — nutzt class=\"data-table\" + .cust pattern
    if (typeof window.renderWeekGlance === 'function') {
      // Render the dashboard week-glance now that activities are loaded.
      try { window.renderWeekGlance(); } catch (e) { console.warn('[Dashboard] renderWeekGlance failed', e); }
    }
    const recentBookings = [...bookings].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);"""
new_early = """    // 6. Letzte Buchungen-Tabelle (5 letzte) — nutzt class=\"data-table\" + .cust pattern
    const recentBookings = [...bookings].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);"""

if old_early in fs:
    fs = fs.replace(old_early, new_early, 1)
    print('OK: removed pre-state renderWeekGlance call')

# After window.dashboardState assignment, add the call.
old_state = """    window.dashboardState = { provider: cp, activities, bookings, token, api };
    console.log('[v3] Phase 1d komplett — Provider:', pname, '| Activities:', activities.length, '| Bookings:', bookings.length, '| Today:', todaySessions.length, '| Todos:', todos.length);"""
new_state = """    window.dashboardState = { provider: cp, activities, bookings, token, api };
    console.log('[v3] Phase 1d komplett — Provider:', pname, '| Activities:', activities.length, '| Bookings:', bookings.length, '| Today:', todaySessions.length, '| Todos:', todos.length);
    if (typeof window.renderWeekGlance === 'function') {
      try { window.renderWeekGlance(activities); } catch (e) { console.warn('[Dashboard] renderWeekGlance failed', e); }
    }"""

if old_state not in fs:
    print('FAIL: state assignment anchor not found'); exit(1)
fs = fs.replace(old_state, new_state, 1)
print('OK: renderWeekGlance hook moved AFTER state assignment')

open(fp, 'w', encoding='utf-8').write(fs)

# ============================================================
# 2. Rewrite cmdk navigation: hash routes + drop mock entities
# ============================================================
cp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-cmdk.js'
cs = open(cp, 'r', encoding='utf-8').read()

# Replace NAV_ITEMS list
import re

# Find NAV_ITEMS = [...]; ACTIONS = [...]; ENTITIES = [...]; — replace whole region.
nav_start = cs.index('var NAV_ITEMS = [')
# Find the end of ENTITIES array — search for closing pattern.
entities_marker = '// Mock Content-Entities — später durch echte API-Calls ersetzbar'
entities_start = cs.index(entities_marker)
# Find end of ENTITIES — look for `];` after a line that includes ENTITIES = ... up to next non-bracket area.
# Strategy: find `var ENTITIES = [` and then scan to the matching `];`
ent_arr_start = cs.index('var ENTITIES = [', entities_start)
# scan brackets
i = ent_arr_start + len('var ENTITIES = [')
depth = 1
while i < len(cs) and depth > 0:
    ch = cs[i]
    if ch == '[': depth += 1
    elif ch == ']': depth -= 1
    i += 1
# Skip the trailing `;` and newline
ent_arr_end = i
# Find next `;` close
while ent_arr_end < len(cs) and cs[ent_arr_end] in ' \n\r\t':
    ent_arr_end += 1
if cs[ent_arr_end] == ';':
    ent_arr_end += 1

new_nav_block = """var NAV_ITEMS = [
    { id: 'nav-dashboard',     title: 'Dashboard',         hint: 'Überblick',           url: '/v3#dashboard',     group: 'Navigation' },
    { id: 'nav-kurse',         title: 'Kurse',             hint: 'Alle Kurse',          url: '/v3#kurse',         group: 'Navigation' },
    { id: 'nav-kursbloecke',   title: 'Kursblöcke',        hint: 'Mehrwöchige Serien',  url: '/v3#kursbloecke',   group: 'Navigation' },
    { id: 'nav-buchungen',     title: 'Buchungen',         hint: 'Alle Buchungen',      url: '/v3#buchungen',     group: 'Navigation' },
    { id: 'nav-probestunden',  title: 'Probestunden',      hint: 'Schnupper-Queue',     url: '/v3#probestunden',  group: 'Navigation' },
    { id: 'nav-kunden',        title: 'Kunden',            hint: 'Eltern & Kinder',     url: '/v3#kunden',        group: 'Navigation' },
    { id: 'nav-team',          title: 'Team',              hint: 'Mitarbeiter',         url: '/v3#team',          group: 'Navigation' },
    { id: 'nav-rechnungen',    title: 'Rechnungen',        hint: 'Finanzen',            url: '/v3#rechnungen',    group: 'Navigation' },
    { id: 'nav-berichte',      title: 'Berichte',          hint: 'Reports & Export',    url: '/v3#berichte',      group: 'Navigation' },
    { id: 'nav-credits',       title: 'Guthaben',          hint: 'Add-Up · Credits',    url: '/v3#credits',       group: 'Navigation' },
    { id: 'nav-anwesenheit',   title: 'Anwesenheit',       hint: 'Check-In',            url: '/v3#anwesenheit',   group: 'Navigation' },
    { id: 'nav-raeume',        title: 'Räume',             hint: 'Kursraum-Verwaltung', url: '/v3#raeume',        group: 'Navigation' },
    { id: 'nav-ferien',        title: 'Ferien & Saisons',  hint: 'Feiertage, Pausen',   url: '/v3#ferien',        group: 'Navigation' },
    { id: 'nav-postfach',      title: 'Postfach',          hint: 'Nachrichten',         url: '/v3#postfach',      group: 'Navigation' },
    { id: 'nav-marketing',     title: 'Marketing',         hint: 'Mom-Graph · Funnel',  url: '/v3#marketing',     group: 'Navigation' },
    { id: 'nav-einbettung',    title: 'Einbettung',        hint: 'Widget-Code',         url: '/v3#einbettung',    group: 'Navigation' },
    { id: 'nav-integrationen', title: 'Integrationen',     hint: 'API · Sync',          url: '/v3#integrationen', group: 'Navigation' },
    { id: 'nav-einstellungen', title: 'Einstellungen',     hint: 'Konfiguration',       url: '/v3#einstellungen', group: 'Navigation' },
  ];

  var ACTIONS = [
    { id: 'act-new-course',   title: 'Neuer Kurs',          hint: 'Kurs anlegen',           icon: '＋',
      customAction: function() {
        location.hash = '#kurse';
        setTimeout(function() {
          if (typeof window.openKursCreatorV2 === 'function') window.openKursCreatorV2({});
        }, 80);
      }, group: 'Aktionen' },
    { id: 'act-new-block',    title: 'Neuer Kursblock',     hint: 'Mehrwöchige Serie',     icon: '＋', url: '/v3#kursbloecke',   group: 'Aktionen' },
    { id: 'act-new-booking',  title: 'Neue Buchung',        hint: 'Manuell einbuchen',     icon: '＋', url: '/v3#buchungen',     group: 'Aktionen' },
    { id: 'act-new-customer', title: 'Neuer Kunde',         hint: 'Eltern anlegen',        icon: '＋', url: '/v3#kunden',        group: 'Aktionen' },
    { id: 'act-new-invoice',  title: 'Rechnung schreiben',  hint: 'Manuell erstellen',     icon: '＋', url: '/v3#rechnungen',    group: 'Aktionen' },
    { id: 'act-new-trial',    title: 'Probestunde planen',  hint: 'Schnupper buchen',      icon: '＋', url: '/v3#probestunden',  group: 'Aktionen' },
    { id: 'act-invite-team',  title: 'Teammitglied einladen', hint: 'Rolle + Zugriff',     icon: '＋', url: '/v3#team',          group: 'Aktionen' },
    { id: 'act-shortcuts',    title: 'Tastatur-Shortcuts',  hint: 'Alle Kürzel',           icon: '?',
      customAction: function() {
        if (typeof window.openShortcutsModal === 'function') { window.openShortcutsModal(); return; }
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
      }, group: 'Aktionen' },
  ];

  // Real-data entities (Kunden / Kurse / Rechnungen) sind später dynamisch via API.
  var ENTITIES = [];
"""

cs = cs[:nav_start] + new_nav_block + cs[ent_arr_end:]

open(cp, 'w', encoding='utf-8').write(cs)
print('OK: cmdk navigates to /v3 hash routes; mock entities removed')
