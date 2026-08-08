#!/usr/bin/env python3
"""
Phase 1c-Fix: Auth-Hook in dashboard-v3.html korrigieren
- Supabase-Bearer-Token aus localStorage statt Cookie-Auth
- Redirect auf '/' wenn keine Session vorhanden
- Cache-Bust für die Route
"""
import os
import re
from pathlib import Path

TARGET = os.environ.get('UKC_TARGET', 'sandbox')
BASE = Path('/opt/urban-kids-club-prod-v2' if TARGET == 'prod' else '/opt/urban-kids-club-v2')
PD = BASE / 'packages' / 'provider-dashboard' / 'src'

DV3 = PD / 'frontend' / 'dashboard-v3.html'
src = DV3.read_text(encoding='utf-8')

# Replace OLD script block (Phase 1c initial wiring) with NEW (Bearer-Auth + Redirect)
NEW_SCRIPT = '''<script>
// ============================================================
// dashboard-v3 Backend-Wiring (Phase 1c-Fix)
// Liest Supabase-Bearer-Token aus localStorage (sb-*-auth-token),
// macht authenticated API-Calls, redirects auf / wenn nicht eingeloggt.
// ============================================================
(async function() {
  // 1. Find Supabase session in localStorage (key: sb-{project-ref}-auth-token)
  let session = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.access_token) { session = parsed; break; }
        }
      }
    }
  } catch (e) { console.warn('[v3] localStorage parse failed', e); }

  if (!session?.access_token) {
    // Nicht eingeloggt → zur Login-Page (echtes dashboard.html unter /)
    console.warn('[v3] Keine Supabase-Session — redirect auf /');
    // Banner anzeigen + 2s Verzögerung damit User den Look kurz sieht
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#B4523A;color:#FFEFE1;padding:12px 20px;text-align:center;z-index:99999;font-family:Inter,sans-serif;font-size:13px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.15)';
    banner.innerHTML = 'Bitte zuerst auf <a href="/" style="color:#FDE4D3;text-decoration:underline">app.urbankids.club</a> einloggen, dann diese URL erneut öffnen. Du wirst in 3 Sekunden weitergeleitet…';
    document.body.appendChild(banner);
    setTimeout(() => { window.location.href = '/'; }, 3000);
    return;
  }

  const token = session.access_token;
  async function api(path, opts = {}) {
    const headers = { 'Authorization': 'Bearer ' + token, ...(opts.headers || {}) };
    const res = await fetch('/api' + path, { ...opts, headers });
    if (res.status === 401) {
      console.warn('[v3] 401 — Token abgelaufen, redirect auf /');
      window.location.href = '/';
      throw new Error('unauthorized');
    }
    if (!res.ok) throw new Error('API ' + path + ' → ' + res.status);
    return res.json();
  }

  function fmtEuros(cents) {
    return (cents / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 });
  }

  try {
    // 2. Provider-Liste holen — ersten als aktiven nehmen
    const provRes = await api('/providers');
    const providers = provRes.providers || provRes || [];
    if (!providers.length) {
      console.warn('[v3] Keine Provider gefunden');
      return;
    }
    const cp = providers[0];
    const pname = cp.displayName || cp.name || 'Provider';
    const pinitial = pname.charAt(0).toUpperCase();

    // 3. Greeting + User-Chip + Date
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

    // 4. Activities + Bookings parallel laden
    let activities = [], bookings = [];
    try {
      const r = await api('/providers/' + cp.id + '/activities');
      activities = r.activities || r || [];
    } catch (e) { console.warn('[v3] activities load failed', e); }

    try {
      const r = await api('/providers/' + cp.id + '/bookings');
      bookings = r.bookings || r || [];
    } catch (e) { console.warn('[v3] bookings load failed', e); }

    // 5. KPI-Werte
    const activeCourses = activities.filter(a => !a.archivedAt && !a.deletedAt).length;
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthBookings = bookings.filter(b => {
      const d = new Date(b.createdAt || b.bookedAt || 0);
      return d >= monthStart && b.status !== 'cancelled' && b.paymentStatus !== 'cancelled';
    });
    const monthRevenue = monthBookings.reduce((s, b) => s + (b.amountCents || b.priceCents || 0), 0);

    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
    const prevMonthBookings = bookings.filter(b => {
      const d = new Date(b.createdAt || b.bookedAt || 0);
      return d >= prevMonthStart && d <= prevMonthEnd && b.status !== 'cancelled';
    });
    const prevMonthRevenue = prevMonthBookings.reduce((s, b) => s + (b.amountCents || b.priceCents || 0), 0);

    const bookingsDelta = prevMonthBookings.length > 0 ? Math.round((monthBookings.length - prevMonthBookings.length) / prevMonthBookings.length * 100) : null;
    const revenueDelta = prevMonthRevenue > 0 ? Math.round((monthRevenue - prevMonthRevenue) / prevMonthRevenue * 100) : null;

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
        d.className = 'stat-delta';
        d.textContent = 'Erstmonat';
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
        d.className = 'stat-delta';
        d.textContent = 'Erstmonat';
      }
    }
    if (stats[2]) {
      const v = stats[2].querySelector('.stat-value');
      const d = stats[2].querySelector('.stat-delta');
      if (v) v.innerHTML = activeCourses + ' <em>laufend</em>';
      if (d) d.textContent = activeCourses === 0 ? 'Lege deinen ersten Kurs an' : '\\u00A0';
    }
    if (stats[3]) {
      const v = stats[3].querySelector('.stat-value');
      const d = stats[3].querySelector('.stat-delta');
      const pendingCount = bookings.filter(b => b.paymentStatus === 'pending').length;
      const todoCount = pendingCount;
      if (v) v.innerHTML = todoCount + ' <em>Aufgabe' + (todoCount === 1 ? '' : 'n') + '</em>';
      if (d) d.textContent = pendingCount > 0 ? pendingCount + ' offene Zahlung' + (pendingCount === 1 ? '' : 'en') : 'Alles erledigt';
    }

    // Sidebar-Counter
    document.querySelectorAll('button.nav-item .badge').forEach(el => {
      const btn = el.closest('.nav-item');
      const onclick = btn.getAttribute('onclick') || '';
      if (onclick.includes('kurse-preview')) el.textContent = activeCourses;
      else if (onclick.includes('buchungen-preview')) el.textContent = bookings.length;
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

    // 6. Letzte Buchungen-Tabelle (5 letzte)
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
        return '<tr><td><div style="display:flex;align-items:center;gap:10px"><div style="width:32px;height:32px;border-radius:50%;background:var(--surface-alt);color:var(--ink);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px">' + initial + '</div><div><strong>' + cname + '</strong>' + childInfo + '</div></div></td><td>' + (b.activityName || '\\u2014') + '</td><td>' + dateStr + '</td><td><strong>' + amount + '</strong></td><td><span class="agenda-status ' + statusClass + '">' + statusLabel + '</span></td></tr>';
      }).join('');
    } else if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:30px;color:var(--muted);text-align:center">Noch keine Buchungen.</td></tr>';
    }

    console.log('[v3] Backend-Wiring komplett — Provider:', pname, '| Bookings:', bookings.length, '| Activities:', activities.length);
  } catch (e) {
    console.error('[v3] Backend-Wiring failed:', e);
  }
})();

// Logout
document.querySelector('.logout-btn')?.addEventListener('click', async () => {
  // Nur localStorage clearen + reload
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith('sb-')) localStorage.removeItem(k);
  }
  window.location.href = '/';
});
</script>'''

# Find existing script block (between "// dashboard-v3 Backend-Wiring" and "</script>")
old_pattern = re.compile(r'<script>\s*\n//\s*=+\s*\n//\s*dashboard-v3 Backend-Wiring.*?</script>', re.DOTALL)
match = old_pattern.search(src)
if match:
    src = src[:match.start()] + NEW_SCRIPT + src[match.end():]
    print(f'OK: Auth-Hook ersetzt ({match.end() - match.start()} → {len(NEW_SCRIPT)} chars)')
else:
    print('WARNING: alter Auth-Hook nicht gefunden — füge neuen Block vor </body> ein')
    src = src.replace('</body>', NEW_SCRIPT + '\n</body>', 1)

# Sanity-Check
print(f'Tag-Balance: <button>={src.count("<button")}/{src.count("</button>")}, <script>={src.count("<script")}/{src.count("</script>")}')

DV3.write_text(src, encoding='utf-8')
print(f'OK: dashboard-v3.html geschrieben ({len(src)} bytes)')
