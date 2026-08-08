#!/usr/bin/env python3
"""
Phase 1c: Erstellt dashboard-v3.html (Sophie-Look) mit Backend-Wiring
Kopiert provider-preview.html, erweitert Sidebar auf 19 Items, fixt Brand-Image,
hängt JS-Hook für echte Daten an.
"""
import os
import re
import shutil
from pathlib import Path

TARGET = os.environ.get('UKC_TARGET', 'sandbox')
BASE = Path('/opt/urban-kids-club-prod-v2' if TARGET == 'prod' else '/opt/urban-kids-club-v2')
PD = BASE / 'packages' / 'provider-dashboard' / 'src'

src_file = PD / 'widgets' / 'provider-preview.html'
dst_file = PD / 'frontend' / 'dashboard-v3.html'

print(f'TARGET: {TARGET}')
print(f'Source: {src_file}')
print(f'Destination: {dst_file}')

# ============================================================
# 1. Kopiere provider-preview.html → dashboard-v3.html
# ============================================================
shutil.copy(src_file, dst_file)
src = dst_file.read_text(encoding='utf-8')
print(f'OK Step 1: Kopiert ({len(src)} bytes)')

# ============================================================
# 2. Sidebar erweitern: 6 neue Items
# ============================================================
SIDEBAR_PATCHES = [
    (
        '<button class="nav-item" onclick="window.location.href=\'/team-preview\'">Team</button>',
        '<button class="nav-item" onclick="window.location.href=\'/team-preview\'">Team</button>\n        <button class="nav-item" onclick="window.location.href=\'/postfach-preview\'">Postfach<span class="badge">3</span></button>',
        'Postfach nach Team',
    ),
    (
        '<button class="nav-item" onclick="window.location.href=\'/berichte-preview\'">Berichte</button>',
        '<button class="nav-item" onclick="window.location.href=\'/berichte-preview\'">Berichte</button>\n        <button class="nav-item" onclick="window.location.href=\'/credits-preview\'">Credits</button>',
        'Credits nach Berichte',
    ),
    (
        '<button class="nav-item" onclick="window.location.href=\'/ferien-preview\'">Ferien &amp; Saisons</button>',
        '<button class="nav-item" onclick="window.location.href=\'/anwesenheit-preview\'">Anwesenheit</button>\n        <button class="nav-item" onclick="window.location.href=\'/raeume-preview\'">Räume</button>\n        <button class="nav-item" onclick="window.location.href=\'/ferien-preview\'">Ferien &amp; Saisons</button>',
        'Anwesenheit + Räume vor Ferien',
    ),
    (
        '<button class="nav-item" onclick="window.location.href=\'/marketing-preview\'">Marketing</button>',
        '<button class="nav-item" onclick="window.location.href=\'/marketing-preview\'">Marketing</button>\n        <button class="nav-item" onclick="window.location.href=\'/ki-assistent-preview\'">KI-Assistent <span class="badge" style="background:rgba(228,180,142,0.3);color:#FFEFE1">PRO</span></button>',
        'KI-Assistent nach Marketing',
    ),
    (
        '<button class="nav-item" onclick="window.location.href=\'/einstellungen-preview\'">Einstellungen</button>',
        '<button class="nav-item" onclick="window.location.href=\'/integrationen-preview\'">Integrationen</button>\n        <button class="nav-item" onclick="window.location.href=\'/einstellungen-preview\'">Einstellungen</button>',
        'Integrationen vor Einstellungen',
    ),
]

for anchor, replacement, label in SIDEBAR_PATCHES:
    if anchor in src:
        src = src.replace(anchor, replacement, 1)
        print(f'OK Step 2: {label}')
    else:
        print(f'SKIP Step 2: {label} — Anchor nicht gefunden')

# ============================================================
# 3. Active-State-Toggle für Sidebar (aktuell ist provider-preview hardcoded active)
#    + Sidebar-Brand soll auf "/" linken, nicht /provider-preview
# ============================================================
# Active state: provider-preview = active aktuell, sollte aber nur active sein wenn URL passt
# Easier: belassen, wir kommen später

# Brand: ändert nicht, sieht gut aus

# ============================================================
# 4. Brand-Image-Pfad korrigieren: /assets/brand/ukc-logo-icon.png → /brand/ukc-logo-icon.png
# (Server hat Brand-Asset-Routes mit Pfad /brand/X.png)
# ============================================================
old_img = '<img src="/assets/brand/ukc-logo-icon.png" alt="Urban Kids Club">'
new_img = '<img src="/brand/ukc-logo-icon.png" alt="Urban Kids Club" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{textContent:\'U\',style:\'font-family:Barlow Condensed,sans-serif;font-weight:700;color:#3C2124;font-size:18px\'}))">'
if old_img in src:
    src = src.replace(old_img, new_img, 1)
    print('OK Step 4: Brand-Image-Pfad korrigiert (mit onerror-Fallback auf "U")')
else:
    print('SKIP Step 4: Brand-Image-Anchor nicht gefunden')

# ============================================================
# 5. Backend-Wiring JS am Ende einfügen (vor </body>)
# ============================================================
WIRE_JS = '''
<script>
// ============================================================
// dashboard-v3 Backend-Wiring (Phase 1c)
// Lädt Provider-Daten + KPI-Stats aus echten APIs und ersetzt Mockup-Werte
// ============================================================
(async function() {
  // Helper: API-Call mit Cookie-Auth
  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, { credentials: 'include', ...opts });
    if (!res.ok) throw new Error('API ' + path + ' → ' + res.status);
    return res.json();
  }

  function fmtEuros(cents) {
    return (cents / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 });
  }

  try {
    // 1. Provider-Liste holen — ersten als aktiven nehmen
    let providers = [];
    try {
      const r = await api('/providers');
      providers = r.providers || r || [];
    } catch (e) {
      console.warn('[v3] /api/providers nicht erreichbar — Mockup-Daten bleiben sichtbar', e);
      return; // Fallback: Mockup-Daten zeigen
    }

    if (!providers.length) {
      console.warn('[v3] Keine Provider gefunden, Mockup-Daten bleiben');
      return;
    }

    const cp = providers[0]; // erstmal: erster Provider
    const pname = cp.displayName || cp.name || 'Provider';
    const pinitial = pname.charAt(0).toUpperCase();

    // 2. Greeting + User-Chip
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
    const days = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
    const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    const today = new Date();
    const dateStr = days[today.getDay()] + ', ' + today.getDate() + '. ' + months[today.getMonth()];

    document.querySelectorAll('.user-chip-name').forEach(el => el.textContent = pname);
    document.querySelectorAll('.user-avatar').forEach(el => el.textContent = pinitial);
    document.querySelectorAll('.page-title').forEach(el => {
      el.innerHTML = greeting + ', <em>' + pname + '</em>.';
    });
    document.querySelectorAll('.page-kicker').forEach(el => el.textContent = dateStr);

    // 3. Stats laden (Activities + Bookings parallel)
    let activities = [], bookings = [];
    try {
      const actRes = await api('/providers/' + cp.id + '/activities');
      activities = actRes.activities || actRes || [];
    } catch (e) { console.warn('[v3] activities load failed', e); }

    try {
      const bookRes = await api('/providers/' + cp.id + '/bookings');
      bookings = bookRes.bookings || bookRes || [];
    } catch (e) { console.warn('[v3] bookings load failed', e); }

    // KPI-Werte berechnen
    const activeCourses = activities.filter(a => !a.archivedAt && !a.deletedAt).length;

    // April-Buchungen + Umsatz
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthBookings = bookings.filter(b => {
      const d = new Date(b.createdAt || b.bookedAt || 0);
      return d >= monthStart && b.status !== 'cancelled' && b.paymentStatus !== 'cancelled';
    });
    const monthRevenue = monthBookings.reduce((s, b) => s + (b.amountCents || b.priceCents || 0), 0);

    // Vormonat
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
    const prevMonthBookings = bookings.filter(b => {
      const d = new Date(b.createdAt || b.bookedAt || 0);
      return d >= prevMonthStart && d <= prevMonthEnd && b.status !== 'cancelled';
    });
    const prevMonthRevenue = prevMonthBookings.reduce((s, b) => s + (b.amountCents || b.priceCents || 0), 0);

    const bookingsDelta = prevMonthBookings.length > 0 ? Math.round((monthBookings.length - prevMonthBookings.length) / prevMonthBookings.length * 100) : null;
    const revenueDelta = prevMonthRevenue > 0 ? Math.round((monthRevenue - prevMonthRevenue) / prevMonthRevenue * 100) : null;

    // Stats-Cards updaten (4 cards)
    const stats = document.querySelectorAll('.stats .stat');
    if (stats[0]) {
      const v = stats[0].querySelector('.stat-value');
      const d = stats[0].querySelector('.stat-delta');
      if (v) v.innerHTML = monthBookings.length + ' <em>Stück</em>';
      if (d && bookingsDelta !== null) {
        const cls = bookingsDelta >= 0 ? 'up' : 'down';
        d.className = 'stat-delta ' + cls;
        d.innerHTML = '<strong>' + (bookingsDelta >= 0 ? '+' : '') + bookingsDelta + ' %</strong> vs. ' + months[(today.getMonth() - 1 + 12) % 12];
      } else if (d) {
        d.textContent = 'Vergleich nicht verfügbar';
      }
    }
    if (stats[1]) {
      const v = stats[1].querySelector('.stat-value');
      const d = stats[1].querySelector('.stat-delta');
      if (v) v.innerHTML = fmtEuros(monthRevenue) + '<em>€</em>';
      if (d && revenueDelta !== null) {
        const cls = revenueDelta >= 0 ? 'up' : 'down';
        d.className = 'stat-delta ' + cls;
        d.innerHTML = '<strong>' + (revenueDelta >= 0 ? '+' : '') + revenueDelta + ' %</strong> vs. ' + months[(today.getMonth() - 1 + 12) % 12];
      } else if (d) {
        d.textContent = 'Vergleich nicht verfügbar';
      }
    }
    if (stats[2]) {
      const v = stats[2].querySelector('.stat-value');
      const d = stats[2].querySelector('.stat-delta');
      if (v) v.innerHTML = activeCourses + ' <em>laufend</em>';
      if (d) d.textContent = activeCourses === 0 ? 'Lege deinen ersten Kurs an' : '&nbsp;';
    }
    if (stats[3]) {
      const v = stats[3].querySelector('.stat-value');
      const d = stats[3].querySelector('.stat-delta');
      const pendingCount = bookings.filter(b => b.paymentStatus === 'pending').length;
      const todoCount = pendingCount;
      if (v) v.innerHTML = todoCount + ' <em>Aufgabe' + (todoCount === 1 ? '' : 'n') + '</em>';
      if (d) d.textContent = pendingCount > 0 ? pendingCount + ' offene Zahlung' + (pendingCount === 1 ? '' : 'en') : 'Alles erledigt';
    }

    // Sidebar-Counter aktualisieren
    document.querySelectorAll('button.nav-item .badge').forEach(el => {
      const btn = el.closest('.nav-item');
      const onclick = btn.getAttribute('onclick') || '';
      if (onclick.includes('kurse-preview')) el.textContent = activeCourses;
      if (onclick.includes('buchungen-preview')) el.textContent = bookings.length;
    });

    // Sub-Headline
    const sub = document.querySelector('.page-sub');
    if (sub) {
      const pendingCount = bookings.filter(b => b.paymentStatus === 'pending').length;
      const parts = [];
      if (monthBookings.length > 0) parts.push(monthBookings.length + ' Buchung' + (monthBookings.length === 1 ? '' : 'en') + ' diesen Monat');
      if (pendingCount > 0) parts.push(pendingCount + ' offene Zahlung' + (pendingCount === 1 ? '' : 'en'));
      sub.textContent = parts.length > 0 ? 'Heute: ' + parts.join(' · ') + '.' : 'Heute: alles ruhig.';
    }

    // 4. Letzte Buchungen-Tabelle (5 letzte)
    const recentBookings = [...bookings].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
    const tbody = document.querySelector('.bookings-table tbody');
    if (tbody && recentBookings.length > 0) {
      tbody.innerHTML = recentBookings.map(b => {
        const c = b.customer || {};
        const cname = c.name || c.email || 'Unbekannt';
        const childInfo = b.childName ? '<br><small style="color:var(--muted)">Kind: ' + b.childName + (b.childAge ? ' (' + b.childAge + ')' : '') + '</small>' : '';
        const date = new Date(b.createdAt || 0);
        const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ', ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const amount = ((b.amountCents || b.priceCents || 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €';
        const status = (b.paymentStatus || b.status || 'pending').toLowerCase();
        const statusLabels = { paid: 'BEZAHLT', pending: 'OFFEN', failed: 'FEHLGESCHLAGEN', cancelled: 'STORNIERT', waitlist: 'WARTELISTE' };
        const statusLabel = statusLabels[status] || status.toUpperCase();
        const statusClass = { paid: 'ok', pending: 'warn', failed: 'err', cancelled: 'err', waitlist: 'info' }[status] || 'warn';
        const initial = cname.charAt(0).toUpperCase();
        return '<tr><td><div style="display:flex;align-items:center;gap:10px"><div style="width:32px;height:32px;border-radius:50%;background:var(--surface-alt);color:var(--ink);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px">' + initial + '</div><div><strong>' + cname + '</strong>' + childInfo + '</div></div></td><td>' + (b.activityName || '—') + '</td><td>' + dateStr + '</td><td><strong>' + amount + '</strong></td><td><span class="agenda-status ' + statusClass + '">' + statusLabel + '</span></td></tr>';
      }).join('');
    } else if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:30px;color:var(--muted);text-align:center">Noch keine Buchungen.</td></tr>';
    }

    console.log('[v3] Backend-Wiring komplett');
  } catch (e) {
    console.error('[v3] Backend-Wiring failed:', e);
  }
})();

// Logout
document.querySelector('.logout-btn')?.addEventListener('click', async () => {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch(e) {}
  window.location.href = '/';
});
</script>
'''

# Insert before </body>
if '</body>' in src:
    src = src.replace('</body>', WIRE_JS + '\n</body>', 1)
    print('OK Step 5: Backend-Wiring JS eingefügt')
else:
    print('FAIL Step 5: </body> nicht gefunden')

# ============================================================
# 6. Tag-Balance Sanity-Check
# ============================================================
print(f'\nTag-Balance: <button>={src.count("<button")}/{src.count("</button>")}, <aside>={src.count("<aside")}/{src.count("</aside>")}, <script>={src.count("<script")}/{src.count("</script>")}')

# Schreiben
dst_file.write_text(src, encoding='utf-8')
print(f'\nOK: dashboard-v3.html geschrieben ({len(src)} bytes)')
