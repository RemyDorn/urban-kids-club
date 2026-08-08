"""Sprint A.4: Replace kunden-section with dynamic skeleton + add loader."""
import re

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
with open(p, 'r', encoding='utf-8') as f:
    src = f.read()

m = re.search(r'<div class="section" data-section="kunden"[^>]*>', src)
nm = list(re.finditer(r'<div class="section" data-section', src[m.end():]))
end = m.end() + nm[0].start()
old_content = src[m.start():end]

new_content = '''<div class="section" data-section="kunden" hidden>
        <div class="page">

      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker" id="phKundenKicker">&nbsp;</div>
          <h1 class="page-title">Alle <em>Kunden</em></h1>
          <p class="page-sub" id="phKundenSub">L&auml;dt&hellip;</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="alert('Export folgt in Sprint B')">Exportieren</button>
          <button class="btn btn-primary" onclick="alert('Kunde anlegen folgt in Sprint B')">+ Kunde anlegen</button>
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-label">Aktive Familien</div>
          <div class="stat-value" id="phKundenAktiv">&ndash; <em>aktiv</em></div>
          <div class="stat-delta" id="phKundenAktivDelta">&nbsp;</div>
        </div>
        <div class="stat">
          <div class="stat-label">&Oslash; Umsatz / Kunde</div>
          <div class="stat-value" id="phKundenUmsatz">&ndash;<em>&euro;</em></div>
          <div class="stat-delta" id="phKundenUmsatzDelta">&nbsp;</div>
        </div>
        <div class="stat">
          <div class="stat-label">Warteliste</div>
          <div class="stat-value" id="phKundenWarteliste">&ndash; <em>offen</em></div>
          <div class="stat-delta" id="phKundenWartelisteDelta">&nbsp;</div>
        </div>
        <div class="stat">
          <div class="stat-label">Wiederkehrer</div>
          <div class="stat-value" id="phKundenReturning">&ndash;<em>%</em></div>
          <div class="stat-delta" id="phKundenReturningDelta">&nbsp;</div>
        </div>
      </div>

      <div class="filter-bar">
        <div class="filter-tabs" id="phKundenTabs">
          <button class="filter-tab active" data-status="all">Alle <span class="count" data-count="all">0</span></button>
          <button class="filter-tab" data-status="active">Aktiv <span class="count" data-count="active">0</span></button>
          <button class="filter-tab" data-status="waitlist">Warteliste <span class="count" data-count="waitlist">0</span></button>
          <button class="filter-tab" data-status="inactive">Inaktiv <span class="count" data-count="inactive">0</span></button>
        </div>
        <div class="filter-sep"></div>
        <select class="filter-select" id="phKundenKurs" aria-label="Kurs">
          <option value="all">Alle Kurse</option>
        </select>
        <select class="filter-select" id="phKundenSort" aria-label="Sortierung">
          <option value="lastactive">Sortieren: Zuletzt aktiv</option>
          <option value="name">Name (A-Z)</option>
          <option value="revenue">Umsatz (h&ouml;chster)</option>
          <option value="firstvisit">Erster Besuch</option>
        </select>
      </div>

      <div class="card kurse-table-wrap" style="padding:0;overflow:hidden;">
        <table class="kurse-table">
          <thead>
            <tr>
              <th style="padding-left:20px;">Kunde</th>
              <th>Kind(er)</th>
              <th>Erster Besuch</th>
              <th>Letzte Buchung</th>
              <th>Buchungen</th>
              <th>Umsatz gesamt</th>
              <th>Status</th>
              <th style="padding-right:20px;text-align:right;">Aktionen</th>
            </tr>
          </thead>
          <tbody id="phKundenTbody">
            <tr><td colspan="8" style="padding:30px;color:var(--muted);text-align:center;font-size:13px">L&auml;dt Kunden&hellip;</td></tr>
          </tbody>
        </table>
      </div>

      <div class="pager" id="phKundenPager" style="display:none"></div>

      </div>  <!-- close .page -->
      '''

src = src[:m.start()] + new_content + src[end:]

loader = r"""
// ============================================================
// Sprint A.4: Kunden-Section Loader
// ============================================================
window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaded = window.sectionLoaded || {};
window.sectionLoaders.kunden = async function() {
  const state = window.dashboardState;
  if (!state) { console.warn('[v3] kunden: state not ready'); return; }
  const { provider, bookings, api } = state;

  function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtPrice(cents) { return ((cents||0)/100).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €'; }
  function fmtMonthYear(d) { if (!d) return '—'; const x = new Date(d); const months = ['Jan','Feb','Mrz','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']; return months[x.getMonth()] + ' ' + x.getFullYear(); }
  function fmtDateShort(d) { if (!d) return '—'; const x = new Date(d); const today = new Date(); const days = Math.floor((today - x)/86400000); if (days === 0) return 'heute'; if (days === 1) return 'gestern'; if (days < 31) return new Date(d).toLocaleDateString('de-DE',{day:'2-digit',month:'short'}); return new Date(d).toLocaleDateString('de-DE',{day:'2-digit',month:'short'}); }
  function ageOfChild(c) { if (c.birthDate) { const m = (Date.now() - new Date(c.birthDate))/86400000/30.44; return m < 24 ? Math.floor(m) + ' Mo' : Math.floor(m/12) + ' J'; } if (c.ageMonths != null) return c.ageMonths < 24 ? c.ageMonths + ' Mo' : Math.floor(c.ageMonths/12) + ' J'; if (c.age != null) return c.age + ' J'; return '?'; }

  // Fetch full parents list (parents include children, status)
  let parents = [];
  try {
    const r = await api('/parents');
    parents = r.data || r.parents || r || [];
  } catch (e) { console.warn('[v3] /parents failed', e); }

  // Aggregate per-parent bookings + revenue
  const byEmail = {};
  bookings.forEach(b => {
    const key = (b.customer && b.customer.email) || b.customerEmail || (b.parent && b.parent.email);
    if (!key) return;
    if (!byEmail[key]) byEmail[key] = { count: 0, revenue: 0, lastBooking: null, firstBooking: null };
    byEmail[key].count++;
    if ((b.status || b.paymentStatus || '').toLowerCase() === 'paid' || b.paidAt) {
      byEmail[key].revenue += (b.amountCents || b.priceCents || 0);
    }
    const d = new Date(b.createdAt || b.bookedAt || 0);
    if (!byEmail[key].lastBooking || d > new Date(byEmail[key].lastBooking)) byEmail[key].lastBooking = b.createdAt || b.bookedAt;
    if (!byEmail[key].firstBooking || d < new Date(byEmail[key].firstBooking)) byEmail[key].firstBooking = b.createdAt || b.bookedAt;
  });

  // Determine status per parent
  function statusOfParent(p) {
    if ((p.status || '').toLowerCase() === 'waitlist' || p.onWaitlist) return 'waitlist';
    const stats = byEmail[p.email] || {};
    if (!stats.lastBooking) return p.createdAt ? 'inactive' : 'active';
    const days = (Date.now() - new Date(stats.lastBooking))/86400000;
    if (days > 90) return 'inactive';
    return 'active';
  }
  function statusLabel(s) { return ({active:'Aktiv', waitlist:'Warteliste', inactive:'Inaktiv'})[s] || s; }
  function statusPill(s) { return ({active:'pill-ok', waitlist:'pill-pending', inactive:''})[s] || ''; }

  // KPIs
  const counts = { all: parents.length, active: 0, waitlist: 0, inactive: 0 };
  let totalRevenue = 0, returning = 0;
  parents.forEach(p => {
    const s = statusOfParent(p);
    counts[s]++;
    const stats = byEmail[p.email] || {};
    totalRevenue += stats.revenue || 0;
    if ((stats.count || 0) >= 2) returning++;
  });
  const avgRev = parents.length > 0 ? Math.round(totalRevenue / parents.length / 100) : 0;
  const returningPct = parents.length > 0 ? Math.round(returning / parents.length * 100) : 0;

  document.getElementById('phKundenKicker').textContent = 'Menschen · ' + parents.length + ' Famili' + (parents.length === 1 ? 'e' : 'en') + ' insgesamt';
  const sub = document.getElementById('phKundenSub');
  if (parents.length === 0) {
    sub.textContent = 'Noch keine Kunden — komme nach erster Buchung.';
  } else {
    sub.textContent = counts.active + ' aktive Famili' + (counts.active === 1 ? 'e' : 'en') + ' · ' + counts.waitlist + ' auf Warteliste · ' + counts.inactive + ' inaktiv seit > 90 Tagen.';
  }
  document.getElementById('phKundenAktiv').innerHTML = counts.active + ' <em>aktiv</em>';
  document.getElementById('phKundenAktivDelta').textContent = parents.length === 0 ? 'Noch leer' : ' ';
  document.getElementById('phKundenUmsatz').innerHTML = avgRev.toLocaleString('de-DE') + '<em>€</em>';
  document.getElementById('phKundenUmsatzDelta').textContent = parents.length === 0 ? ' ' : 'pro Familie · gesamt';
  document.getElementById('phKundenWarteliste').innerHTML = counts.waitlist + ' <em>offen</em>';
  document.getElementById('phKundenWartelisteDelta').textContent = ' ';
  document.getElementById('phKundenReturning').innerHTML = returningPct + '<em>%</em>';
  document.getElementById('phKundenReturningDelta').textContent = parents.length === 0 ? ' ' : 'mit ≥2 Buchungen';

  // tab counts
  Object.keys(counts).forEach(k => {
    const el = document.querySelector('#phKundenTabs .count[data-count="' + k + '"]');
    if (el) el.textContent = counts[k];
  });

  // course filter
  const courseSel = document.getElementById('phKundenKurs');
  const courseTitles = new Set();
  bookings.forEach(b => { const t = b.activityName || b.activityTitle; if (t) courseTitles.add(t); });
  Array.from(courseTitles).sort().forEach(t => {
    const opt = document.createElement('option'); opt.value = t; opt.textContent = t; courseSel.appendChild(opt);
  });

  let activeStatus = 'all', activeCourse = 'all', activeSort = 'lastactive';

  function render() {
    let list = parents.slice();
    if (activeStatus !== 'all') list = list.filter(p => statusOfParent(p) === activeStatus);
    if (activeCourse !== 'all') {
      const emails = new Set(bookings.filter(b => (b.activityName || b.activityTitle) === activeCourse).map(b => (b.customer && b.customer.email) || b.customerEmail).filter(Boolean));
      list = list.filter(p => emails.has(p.email));
    }
    list.sort((a,b) => {
      const sa = byEmail[a.email] || {}, sb = byEmail[b.email] || {};
      if (activeSort === 'name') return (a.name || '').localeCompare(b.name || '');
      if (activeSort === 'revenue') return (sb.revenue || 0) - (sa.revenue || 0);
      if (activeSort === 'firstvisit') return new Date(sa.firstBooking || a.createdAt || 0) - new Date(sb.firstBooking || b.createdAt || 0);
      return new Date(sb.lastBooking || b.createdAt || 0) - new Date(sa.lastBooking || a.createdAt || 0);
    });

    const tbody = document.getElementById('phKundenTbody');
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:40px;color:var(--muted);text-align:center;font-size:13px">Keine Kunden in dieser Ansicht.</td></tr>';
      return;
    }
    tbody.innerHTML = list.slice(0, 50).map(p => {
      const stats = byEmail[p.email] || {};
      const s = statusOfParent(p);
      const initial = (p.name || p.email || '?').charAt(0).toUpperCase();
      const children = Array.isArray(p.children) ? p.children : [];
      const kidsStr = children.length > 0 ? children.map(c => (c.name || 'Kind') + ' (' + ageOfChild(c) + ')').join(', ') : '—';
      return '<tr style="cursor:default">'
        + '<td style="padding-left:20px;"><div class="cust"><div class="cust-av">' + escapeHtml(initial) + '</div><div class="cust-info"><div class="cust-name">' + escapeHtml(p.name || 'Unbekannt') + '</div><div class="cust-sub">' + escapeHtml(p.email || '') + '</div></div></div></td>'
        + '<td>' + escapeHtml(kidsStr) + '</td>'
        + '<td>' + fmtMonthYear(stats.firstBooking || p.createdAt) + '</td>'
        + '<td>' + fmtDateShort(stats.lastBooking) + '</td>'
        + '<td>' + (stats.count || 0) + '</td>'
        + '<td>' + fmtPrice(stats.revenue) + '<br><span style="font-size:11px;color:var(--muted)">insgesamt</span></td>'
        + '<td><span class="pill ' + statusPill(s) + '">' + statusLabel(s) + '</span></td>'
        + '<td style="padding-right:20px;text-align:right;">'
        + '<button class="row-action-btn" title="Profil" onclick="alert(\'Kunden-Profil folgt\')">⊙</button> '
        + '<button class="row-action-btn" title="Mail" onclick="window.location.href=\'mailto:' + escapeHtml(p.email || '') + '\'">✉</button> '
        + '<button class="row-action-btn" title="Weitere" onclick="alert(\'Aktionen folgen\')">⋯</button>'
        + '</td>'
        + '</tr>';
    }).join('');

    const pager = document.getElementById('phKundenPager');
    if (list.length > 50) {
      pager.style.display = 'flex';
      pager.innerHTML = '<div>1–50 von ' + list.length + ' Kunden</div>';
    } else {
      pager.style.display = 'none';
    }
  }

  document.querySelectorAll('#phKundenTabs .filter-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#phKundenTabs .filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatus = btn.dataset.status;
      render();
    };
  });
  document.getElementById('phKundenKurs').onchange = (e) => { activeCourse = e.target.value; render(); };
  document.getElementById('phKundenSort').onchange = (e) => { activeSort = e.target.value; render(); };

  render();
};
"""

marker = '// ============================================================\n// Phase 2a: SPA-Router'
if marker not in src:
    print('FAIL: marker not found'); exit(1)
src = src.replace(marker, loader + '\n' + marker, 1)

with open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print(f'OK: kunden skeleton + loader added. File: {len(src)} bytes')
