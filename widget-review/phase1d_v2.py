#!/usr/bin/env python3
"""
Phase 1d (Version 2): HEUTE + ZU TUN + LETZTE BUCHUNGEN mit echten Daten

Fix für die drei Mockup-Sektionen:
1. <div class="grid-2">...</div> komplett ersetzen → leere Container
2. <table class="data-table"> tbody mit Mockup-Buchungen ersetzen → leerer tbody
3. JS-Hook erweitern: Today-Sessions, Trials, Invoices, Messages, Sidebar-Counter
"""
import os
import re
from pathlib import Path

TARGET = os.environ.get('UKC_TARGET', 'sandbox')
BASE = Path('/opt/urban-kids-club-prod-v2' if TARGET == 'prod' else '/opt/urban-kids-club-v2')
PD = BASE / 'packages' / 'provider-dashboard' / 'src'
DV3 = PD / 'frontend' / 'dashboard-v3.html'

src = DV3.read_text(encoding='utf-8')

# ============================================================
# 1. Replace gesamten "HEUTE + ZU TUN" Block (zwischen den Comment-Markern)
# ============================================================
GRID2_NEW = '''<!-- HEUTE + ZU TUN -->
      <div class="grid-2">
        <div class="card" id="phTodayCard">
          <div class="card-head">
            <div class="card-title">Heute · <em id="phTodayWeekday">Heute</em></div>
            <a href="#" class="card-link">Voller Kalender →</a>
          </div>
          <div id="phTodayList"><div style="padding:30px;color:var(--muted);text-align:center;font-size:13px">Lade Termine…</div></div>
        </div>
        <div class="card" id="phTodoCard">
          <div class="card-head">
            <div class="card-title">Zu <em>tun</em></div>
            <a href="#" class="card-link" onclick="window.location.href='/postfach-preview'; return false">Alle →</a>
          </div>
          <div id="phTodoList"><div style="padding:30px;color:var(--muted);text-align:center;font-size:13px">Lade Aufgaben…</div></div>
        </div>
      </div>

      '''

start_marker = '<!-- HEUTE + ZU TUN -->'
end_marker = '<!-- RECENT BUCHUNGEN -->'
start_idx = src.find(start_marker)
end_idx = src.find(end_marker)
if start_idx >= 0 and end_idx > start_idx:
    src = src[:start_idx] + GRID2_NEW + src[end_idx:]
    print(f'OK Step 1: HEUTE + ZU TUN Block ersetzt ({end_idx - start_idx} → {len(GRID2_NEW)} chars)')
else:
    print(f'SKIP Step 1: Marker nicht gefunden (start={start_idx}, end={end_idx})')

# ============================================================
# 2. Replace tbody der Letzte-Buchungen-Tabelle (innerhalb RECENT BUCHUNGEN)
# ============================================================
# Strategie: <tbody>...</tbody> innerhalb der data-table mit "Anna Schmidt" als Sentinel
# Ersetze Inhalt mit leerem placeholder, JS füllt ihn
recent_idx = src.find('<!-- RECENT BUCHUNGEN -->')
if recent_idx >= 0:
    # Suche tbody-Block innerhalb der RECENT BUCHUNGEN Section
    section_end = src.find('</table>', recent_idx)
    if section_end >= 0:
        tbody_pattern = re.compile(r'<tbody>([\s\S]*?)</tbody>')
        tbody_match = tbody_pattern.search(src, recent_idx, section_end)
        if tbody_match:
            new_tbody = '<tbody id="phRecentBookingsBody"><tr><td colspan="5" style="padding:30px;color:var(--muted);text-align:center;font-size:13px">Lade Buchungen…</td></tr></tbody>'
            src = src[:tbody_match.start()] + new_tbody + src[tbody_match.end():]
            print(f'OK Step 2: tbody der LETZTE-Buchungen-Tabelle ersetzt ({tbody_match.end() - tbody_match.start()} → {len(new_tbody)} chars)')
        else:
            print('SKIP Step 2: tbody nicht gefunden')

# ============================================================
# 3. JS-Hook ersetzen — komplett neu (alle Wiring-Logic in einem Block)
# ============================================================
# Find existing <script> block (das mit "dashboard-v3 Backend-Wiring")
old_script_pattern = re.compile(r'<script>\s*\n//\s*=+\s*\n//\s*dashboard-v3 Backend-Wiring.*?</script>', re.DOTALL)
m = old_script_pattern.search(src)

NEW_SCRIPT = '''<script>
// ============================================================
// dashboard-v3 Backend-Wiring (Phase 1d)
// ============================================================
(async function() {
  // 1. Find Supabase session
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
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#B4523A;color:#FFEFE1;padding:12px 20px;text-align:center;z-index:99999;font-family:Inter,sans-serif;font-size:13px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.15)';
    banner.innerHTML = 'Bitte zuerst auf <a href="/" style="color:#FDE4D3;text-decoration:underline">app.urbankids.club</a> einloggen.';
    document.body.appendChild(banner);
    setTimeout(() => { window.location.href = '/'; }, 3000);
    return;
  }

  const token = session.access_token;
  async function api(path, opts = {}) {
    const headers = { 'Authorization': 'Bearer ' + token, ...(opts.headers || {}) };
    const res = await fetch('/api' + path, { ...opts, headers });
    if (res.status === 401) {
      window.location.href = '/';
      throw new Error('unauthorized');
    }
    if (!res.ok) throw new Error('API ' + path + ' → ' + res.status);
    return res.json();
  }

  function fmtEuros(cents) {
    return (cents / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  try {
    // 2. Provider laden
    const provRes = await api('/providers');
    const providers = provRes.data || provRes.providers || provRes || [];
    if (!providers.length) {
      console.warn('[v3] Keine Provider gefunden');
      return;
    }
    const cp = providers[0];
    const pname = cp.displayName || cp.name || 'Provider';
    const pinitial = pname.charAt(0).toUpperCase();

    // 3. Greeting + Header
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
    const days = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
    const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    const today = new Date();
    const dateStr = days[today.getDay()] + ', ' + today.getDate() + '. ' + months[today.getMonth()];
    const todayWeekday = days[today.getDay()];

    document.querySelectorAll('.user-chip-name').forEach(el => el.textContent = pname);
    document.querySelectorAll('.user-avatar').forEach(el => el.textContent = pinitial);
    document.querySelectorAll('.page-title').forEach(el => {
      el.innerHTML = greeting + ', <em>' + escapeHtml(pname) + '</em>.';
    });
    document.querySelectorAll('.page-kicker').forEach(el => el.textContent = dateStr);
    const phTodayWeekday = document.getElementById('phTodayWeekday');
    if (phTodayWeekday) phTodayWeekday.textContent = todayWeekday;

    // 4. Activities + Bookings parallel
    let activities = [], bookings = [];
    try {
      const r = await api('/providers/' + cp.id + '/activities');
      activities = r.data || r.activities || r || [];
    } catch (e) { console.warn('[v3] activities load failed', e); }

    try {
      const r = await api('/providers/' + cp.id + '/bookings');
      bookings = r.data || r.bookings || r || [];
    } catch (e) { console.warn('[v3] bookings load failed', e); }

    // 5. KPI-Werte
    const activeCourses = activities.filter(a => !a.archivedAt && !a.deletedAt && a.status !== 'archived' && a.status !== 'cancelled').length;
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthBookings = bookings.filter(b => {
      const d = new Date(b.createdAt || b.bookedAt || 0);
      return d >= monthStart && b.status !== 'cancelled';
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

    // 6. Letzte Buchungen-Tabelle (5 letzte) — nutzt class="data-table" + .cust pattern
    const recentBookings = [...bookings].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
    const tbody = document.getElementById('phRecentBookingsBody') || document.querySelector('.data-table tbody');
    if (tbody) {
      if (recentBookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding:30px;color:var(--muted);text-align:center;font-size:13px">Noch keine Buchungen.</td></tr>';
      } else {
        tbody.innerHTML = recentBookings.map(b => {
          const c = b.customer || {};
          const cname = c.name || c.email || (b.customerName) || 'Unbekannt';
          const childName = b.childName || (b.child && b.child.name) || '';
          const childAge = b.childAge || (b.child && b.child.age) || '';
          const childInfo = childName ? '<div class="cust-sub">Kind: ' + escapeHtml(childName) + (childAge ? ' (' + childAge + ')' : '') + '</div>' : '';
          const date = new Date(b.createdAt || 0);
          const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ', ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
          const amount = ((b.amountCents || b.priceCents || 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €';
          const status = (b.paymentStatus || b.status || 'pending').toLowerCase();
          const statusLabels = { paid: 'Bezahlt', pending: 'Offen', failed: 'Fehlgeschlagen', cancelled: 'Storniert', waitlisted: 'Warteliste', confirmed: 'Bestätigt' };
          const statusLabel = statusLabels[status] || status.charAt(0).toUpperCase() + status.slice(1);
          const pillCls = { paid: 'pill-ok', pending: 'pill-pending', confirmed: 'pill-ok', waitlisted: 'pill-pending', cancelled: 'pill-err', failed: 'pill-err' }[status] || 'pill-pending';
          const initial = cname.charAt(0).toUpperCase();
          const avCls = ['', 'sage', ''][Math.floor(Math.random()*3)]; // optional sage-Variant
          return '<tr><td><div class="cust"><div class="cust-av' + (avCls ? ' ' + avCls : '') + '">' + escapeHtml(initial) + '</div><div class="cust-info"><div class="cust-name">' + escapeHtml(cname) + '</div>' + childInfo + '</div></div></td><td>' + escapeHtml(b.activityName || b.activityTitle || '\\u2014') + '</td><td>' + dateStr + '</td><td>' + amount + '</td><td><span class="pill ' + pillCls + '">' + statusLabel + '</span></td></tr>';
        }).join('');
      }
    }

    // 7. Heute-Sessions
    let todaySessions = [];
    try {
      const r = await api('/attendance/today');
      todaySessions = r.data?.sessions || r.data || r.sessions || [];
      if (!Array.isArray(todaySessions)) todaySessions = [];
    } catch (e) { console.warn('[v3] /attendance/today failed', e); }

    const todayList = document.getElementById('phTodayList');
    if (todayList) {
      if (!todaySessions.length) {
        todayList.innerHTML = '<div style="padding:30px;color:var(--muted);text-align:center;font-size:13px">Heute keine Termine.</div>';
      } else {
        todayList.innerHTML = todaySessions.slice(0, 5).map(s => {
          const time = s.startsAt || s.startTime || s.time || '';
          const hour = time ? new Date(time).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}) : '\\u2014';
          const dur = s.durationMin || s.duration || 60;
          const title = s.activityTitle || s.title || s.activityName || '\\u2014';
          const room = s.locationName || s.room || s.roomName || '';
          const booked = s.bookedCount ?? s.attendees ?? s.bookings?.length ?? 0;
          const cap = s.capacity ?? 0;
          const isFull = cap > 0 && booked >= cap;
          const isAlmost = cap > 0 && booked / cap >= 0.8 && !isFull;
          const statusCls = isFull ? 'full' : isAlmost ? 'warn' : 'ok';
          const statusLabel = isFull ? 'Ausgebucht' : isAlmost ? 'Fast voll' : 'Alles gut';
          return '<div class="agenda-item"><div class="agenda-time"><div class="agenda-time-hour">' + hour + '</div><div class="agenda-time-min">' + dur + ' Min</div></div><div class="agenda-body"><div class="agenda-name">' + escapeHtml(title) + '</div><div class="agenda-meta"><strong>' + booked + ' von ' + cap + '</strong> Teilnehmer' + (room ? ' · ' + escapeHtml(room) : '') + '</div></div><span class="agenda-status ' + statusCls + '">' + statusLabel + '</span></div>';
        }).join('');
      }
    }

    // 8. Zu-Tun-Liste
    const todos = [];
    let trialsCount = 0;
    try {
      const r = await api('/providers/' + cp.id + '/trials');
      const trials = r.data || r.trials || r || [];
      const pending = trials.filter(t => t.status === 'pending' || t.status === 'requested' || t.status === 'open' || !t.status);
      trialsCount = pending.length;
      if (pending.length > 0) {
        todos.push({
          icon: '!',
          iconCls: '',
          title: pending.length + ' offene Probestund' + (pending.length === 1 ? 'e' : 'en'),
          meta: 'Anfrage prüfen und bestätigen',
        });
      }
    } catch (e) { console.warn('[v3] trials failed', e); }

    try {
      const r = await api('/providers/' + cp.id + '/invoices?status=open');
      const openInv = r.data || r.invoices || r || [];
      const overdue = openInv.filter(i => i.dueAt && new Date(i.dueAt) < new Date());
      if (overdue.length > 0) {
        todos.push({
          icon: '€',
          iconCls: 'sage',
          title: overdue.length + ' überfällige Rechnung' + (overdue.length === 1 ? '' : 'en'),
          meta: 'Mahnung versenden',
        });
      }
      const dueOpen = openInv.length - overdue.length;
      if (dueOpen > 0) {
        todos.push({
          icon: '€',
          iconCls: 'sage',
          title: dueOpen + ' offene Rechnung' + (dueOpen === 1 ? '' : 'en'),
          meta: 'Zahlungseingang prüfen',
        });
      }
    } catch (e) { console.warn('[v3] invoices failed', e); }

    let unreadMessages = 0;
    try {
      const r = await api('/providers/' + cp.id + '/messages?unread=true');
      unreadMessages = r.unreadCount ?? (r.data || r.messages || r || []).length;
      if (unreadMessages > 0) {
        todos.push({
          icon: '✉',
          iconCls: 'sage',
          title: unreadMessages + ' ungelesene Nachricht' + (unreadMessages === 1 ? '' : 'en'),
          meta: 'Postfach öffnen',
        });
      }
    } catch (e) { console.warn('[v3] messages failed', e); }

    const todoList = document.getElementById('phTodoList');
    if (todoList) {
      if (!todos.length) {
        todoList.innerHTML = '<div style="padding:30px;color:var(--muted);text-align:center;font-size:13px">Alles erledigt 🎉</div>';
      } else {
        todoList.innerHTML = todos.slice(0, 6).map(t => {
          const iconClass = t.iconCls ? 'action-icon ' + t.iconCls : 'action-icon';
          return '<div class="action-item"><div class="' + iconClass + '">' + t.icon + '</div><div class="action-body"><div class="action-title">' + escapeHtml(t.title) + '</div><div class="action-meta">' + escapeHtml(t.meta) + '</div></div></div>';
        }).join('');
      }
    }

    // 9. KPI "Heute zu tun" mit echtem Count
    if (stats[3]) {
      const v = stats[3].querySelector('.stat-value');
      const d = stats[3].querySelector('.stat-delta');
      if (v) v.innerHTML = todos.length + ' <em>Aufgabe' + (todos.length === 1 ? '' : 'n') + '</em>';
      if (d) d.textContent = todos.length === 0 ? 'Alles erledigt' : todos.length + ' offen';
    }

    // 10. Sub-Headline
    const sub = document.querySelector('.page-sub');
    if (sub) {
      const parts = [];
      if (todaySessions.length > 0) parts.push(todaySessions.length + ' Termin' + (todaySessions.length === 1 ? '' : 'e') + ' heute');
      if (todos.length > 0) parts.push(todos.length + ' offene Aufgabe' + (todos.length === 1 ? '' : 'n'));
      sub.textContent = parts.length > 0 ? 'Heute: ' + parts.join(' · ') + '.' : 'Heute: alles ruhig.';
    }

    // 11. Sidebar-Counter (alle Items)
    document.querySelectorAll('button.nav-item .badge').forEach(el => {
      const btn = el.closest('.nav-item');
      const onclick = btn.getAttribute('onclick') || '';
      if (onclick.includes('kurse-preview')) el.textContent = activeCourses;
      else if (onclick.includes('buchungen-preview')) el.textContent = bookings.length;
      else if (onclick.includes('kunden-preview')) {
        const customers = new Set(bookings.map(b => (b.customer && b.customer.email) || b.customerEmail).filter(Boolean));
        el.textContent = customers.size;
      }
      else if (onclick.includes('postfach-preview')) el.textContent = unreadMessages;
      else if (onclick.includes('probestunden-preview')) el.textContent = trialsCount;
    });

    console.log('[v3] Phase 1d komplett — Provider:', pname, '| Activities:', activities.length, '| Bookings:', bookings.length, '| Today:', todaySessions.length, '| Todos:', todos.length);
  } catch (e) {
    console.error('[v3] Backend-Wiring failed:', e);
  }
})();

// Logout — global function (called via onclick attribute)
window.dashboardV3Logout = function() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith('sb-')) localStorage.removeItem(k);
  }
  window.location.href = '/';
};
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.logout-btn').forEach(btn => {
    btn.onclick = window.dashboardV3Logout;
  });
});
document.querySelectorAll('.logout-btn').forEach(btn => {
  btn.onclick = window.dashboardV3Logout;
});
</script>'''

if m:
    src = src[:m.start()] + NEW_SCRIPT + src[m.end():]
    print(f'OK Step 3: JS-Hook komplett ersetzt ({m.end() - m.start()} → {len(NEW_SCRIPT)} chars)')
else:
    # Vor </body> einfügen
    src = src.replace('</body>', NEW_SCRIPT + '\n</body>', 1)
    print('OK Step 3: JS-Hook neu eingefügt vor </body>')

# ============================================================
# 4. Logout-Button HTML — onclick-Attribut sicherstellen
# ============================================================
old_logout = '<button class="logout-btn">Abmelden</button>'
new_logout = '<button class="logout-btn" onclick="window.dashboardV3Logout && window.dashboardV3Logout()">Abmelden</button>'
if old_logout in src:
    src = src.replace(old_logout, new_logout, 1)
    print('OK Step 4: Logout-Button HTML onclick')

# Sanity
print(f'\nTag-Balance: <button>={src.count("<button")}/{src.count("</button>")}, <div>={src.count("<div")}/{src.count("</div>")}, <script>={src.count("<script")}/{src.count("</script>")}, <table>={src.count("<table")}/{src.count("</table>")}')

DV3.write_text(src, encoding='utf-8')
print(f'OK: dashboard-v3.html geschrieben ({len(src)} bytes)')
