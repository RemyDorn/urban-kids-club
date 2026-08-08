"""Add Sprint A.2 kurse loader to dashboard-v3.html"""
import re

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
with open(p, 'r', encoding='utf-8') as f:
    src = f.read()

# 1. Cache provider + activities + bookings in window.dashboardState (modify Phase 1d)
old_log_line = "console.log('[v3] Phase 1d komplett — Provider:', pname, '| Activities:', activities.length, '| Bookings:', bookings.length, '| Today:', todaySessions.length, '| Todos:', todos.length);"
new_log_line = """window.dashboardState = { provider: cp, activities, bookings, token, api };
    console.log('[v3] Phase 1d komplett — Provider:', pname, '| Activities:', activities.length, '| Bookings:', bookings.length, '| Today:', todaySessions.length, '| Todos:', todos.length);
    if (location.hash === '#kurse' && window.sectionLoaders && window.sectionLoaders.kurse) { window.sectionLoaders.kurse(); window.sectionLoaded.kurse = true; }"""

if old_log_line in src:
    src = src.replace(old_log_line, new_log_line, 1)
    print('OK: dashboardState exposed via Phase 1d')
else:
    print('WARN: log line not found - dashboardState NOT exposed')

# 2. Build the loader as a Python string with single-quotes carefully escaped
loader = r"""
// ============================================================
// Sprint A.2: Kurse-Section Loader
// ============================================================
window.sectionLoaders.kurse = function() {
  const state = window.dashboardState;
  if (!state) {
    console.warn('[v3] kurse: dashboardState not ready');
    return;
  }
  const { provider, activities, api } = state;

  // ---------- helpers ----------
  function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtPrice(cents) { return cents ? (cents/100).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €' : '—'; }
  function statusOf(a) {
    if (a.archivedAt || a.deletedAt || a.status === 'archived') return 'archived';
    if (a.status === 'paused' || a.pausedAt) return 'paused';
    if (a.status === 'planning' || a.status === 'draft' || (a.startsAt && new Date(a.startsAt) > new Date())) return 'planning';
    return 'active';
  }
  function statusLabel(s) { return ({active:'Aktiv', paused:'Pausiert', planning:'In Planung', archived:'Archiv'})[s] || s; }
  function statusPillClass(s) { return ({active:'pill-ok', paused:'pill-pending', planning:'pill-info', archived:''})[s] || ''; }
  function categoryOf(a) { return a.category || a.kategorie || a.activityType || '—'; }
  function ageOf(a) {
    const min = a.minAgeMonths ?? a.ageMin;
    const max = a.maxAgeMonths ?? a.ageMax;
    if (min == null && max == null) return '—';
    function fmt(m) { if (m == null) return '?'; return m < 24 ? m + ' Mo' : Math.floor(m/12) + ' J'; }
    return fmt(min) + '–' + fmt(max);
  }
  function terminOf(a) {
    const days = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    const day = a.weekday ?? a.dayOfWeek;
    const time = a.startTime || a.time;
    if (day != null && time) return (days[day] || '?') + ' · ' + time;
    return '—';
  }
  function capacityOf(a) {
    const booked = a.bookedCount ?? a.enrollmentCount ?? 0;
    const cap = a.capacity ?? 0;
    return { booked, cap, ratio: cap > 0 ? booked/cap : 0 };
  }

  // ---------- KPIs ----------
  const counts = { all: activities.length, active: 0, paused: 0, planning: 0, archived: 0 };
  let totalKinder = 0, totalCap = 0, totalUmsatz = 0;
  activities.forEach(a => {
    const s = statusOf(a);
    counts[s] = (counts[s] || 0) + 1;
    const { booked, cap } = capacityOf(a);
    if (s === 'active' || s === 'planning') {
      totalKinder += booked;
      totalCap += cap;
      totalUmsatz += (a.priceCents || 0) * booked;
    }
  });
  const auslastung = totalCap > 0 ? Math.round(totalKinder/totalCap*100) : 0;

  document.getElementById('phKurseKicker').textContent = (provider.name || provider.displayName || '');
  const sub = document.getElementById('phKurseSub');
  if (counts.all === 0) {
    sub.textContent = 'Noch keine Kurse angelegt.';
  } else {
    const parts = [counts.all + ' Kurs' + (counts.all === 1 ? '' : 'e') + ' insgesamt'];
    if (counts.active) parts.push(counts.active + ' aktiv');
    if (counts.paused) parts.push(counts.paused + ' pausiert');
    if (counts.planning) parts.push(counts.planning + ' in Planung');
    sub.textContent = parts.join(' · ') + '.';
  }
  document.getElementById('phKurseActive').innerHTML = counts.active + ' <em>laufend</em>';
  document.getElementById('phKurseTeilnehmer').innerHTML = totalKinder + ' <em>Kinder</em>';
  document.getElementById('phKurseAuslastung').innerHTML = auslastung + '<em>%</em>';
  document.getElementById('phKurseUmsatz').innerHTML = (totalUmsatz/100).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + '<em>€</em>';

  // tab counts
  Object.keys(counts).forEach(k => {
    const el = document.querySelector('#phKurseTabs .count[data-count="' + k + '"]');
    if (el) el.textContent = counts[k];
  });

  // categories
  const catSet = new Set(activities.map(categoryOf).filter(c => c && c !== '—'));
  const catSel = document.getElementById('phKurseCat');
  catSet.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    catSel.appendChild(opt);
  });

  // ---------- Render ----------
  let activeStatus = 'all';
  let activeCat = 'all';
  let activeSort = 'newest';

  function render() {
    let list = activities.slice();
    if (activeStatus !== 'all') list = list.filter(a => statusOf(a) === activeStatus);
    if (activeCat !== 'all') list = list.filter(a => categoryOf(a) === activeCat);
    list.sort((a,b) => {
      if (activeSort === 'name') return (a.title || a.name || '').localeCompare(b.title || b.name || '');
      if (activeSort === 'capacity') return capacityOf(b).ratio - capacityOf(a).ratio;
      if (activeSort === 'price') return (b.priceCents||0) - (a.priceCents||0);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    const tbody = document.getElementById('phKurseTbody');
    const mobile = document.getElementById('phKurseMobile');
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:40px;color:var(--muted);text-align:center;font-size:13px">Keine Kurse in dieser Ansicht. <a href="/kurs-anlegen-preview" style="color:var(--primary)">+ Neuen Kurs anlegen</a></td></tr>';
      mobile.innerHTML = '';
      return;
    }
    tbody.innerHTML = list.map(a => {
      const { booked, cap, ratio } = capacityOf(a);
      const s = statusOf(a);
      const fillCls = ratio >= 1 ? 'full' : ratio >= 0.8 ? '' : ratio < 0.4 ? 'low' : '';
      return '<tr style="cursor:default">'
        + '<td style="padding-left:20px;" class="kurs-name-cell"><div class="kurs-name">' + escapeHtml(a.title || a.name || 'Unbenannt') + '</div></td>'
        + '<td><span class="kategorie-tag">' + escapeHtml(categoryOf(a)) + '</span></td>'
        + '<td>' + escapeHtml(ageOf(a)) + '</td>'
        + '<td>' + escapeHtml(terminOf(a)) + '</td>'
        + '<td><div class="auslastung"><div class="auslastung-track"><div class="auslastung-fill ' + fillCls + '" style="width:' + Math.min(100, Math.round(ratio*100)) + '%"></div></div><span class="auslastung-label">' + booked + '/' + cap + '</span></div></td>'
        + '<td>' + fmtPrice(a.priceCents) + '<br><span style="font-size:11px;color:var(--muted)">pro Block</span></td>'
        + '<td><span class="pill ' + statusPillClass(s) + '">' + statusLabel(s) + '</span></td>'
        + '<td style="padding-right:20px;text-align:right;">'
        + '<button class="row-action-btn" title="Ansehen" onclick="alert(\'Kurs-Detail folgt\')">⊙</button> '
        + '<button class="row-action-btn" title="Bearbeiten" onclick="alert(\'Kurs-Bearbeitung folgt\')">✎</button> '
        + '<button class="row-action-btn" title="Weitere" onclick="alert(\'Aktionen folgen\')">⋯</button>'
        + '</td>'
        + '</tr>';
    }).join('');

    mobile.innerHTML = list.map(a => {
      const { booked, cap, ratio } = capacityOf(a);
      const s = statusOf(a);
      const fillCls = ratio >= 1 ? 'full' : ratio >= 0.8 ? '' : ratio < 0.4 ? 'low' : '';
      return '<div class="kurse-mobile-card">'
        + '<div class="kurse-mobile-head"><div><div class="kurs-name">' + escapeHtml(a.title || a.name || 'Unbenannt') + '</div><div class="kurs-meta"><span class="kategorie-tag">' + escapeHtml(categoryOf(a)) + '</span> · ' + escapeHtml(ageOf(a)) + '</div></div><span class="pill ' + statusPillClass(s) + '">' + statusLabel(s) + '</span></div>'
        + '<div class="kurs-meta" style="margin-bottom:4px">' + escapeHtml(terminOf(a)) + '</div>'
        + '<div class="auslastung"><div class="auslastung-track"><div class="auslastung-fill ' + fillCls + '" style="width:' + Math.min(100, Math.round(ratio*100)) + '%"></div></div><span class="auslastung-label">' + booked + '/' + cap + '</span></div>'
        + '<div class="kurse-mobile-stats"><div>Preis<strong>' + fmtPrice(a.priceCents) + '</strong></div><div>Warteliste<strong>' + (a.waitlistCount ?? 0) + '</strong></div></div>'
        + '</div>';
    }).join('');
  }

  // wire filter tabs
  document.querySelectorAll('#phKurseTabs .filter-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#phKurseTabs .filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatus = btn.dataset.status;
      render();
    };
  });
  document.getElementById('phKurseCat').onchange = (e) => { activeCat = e.target.value; render(); };
  document.getElementById('phKurseSort').onchange = (e) => { activeSort = e.target.value; render(); };

  render();
};
"""

# Inject before Phase 2a SPA-Router
marker = '// ============================================================\n// Phase 2a: SPA-Router'
if marker in src:
    src = src.replace(marker, loader + '\n' + marker, 1)
    print('OK: kurse loader inserted before Phase 2a')
else:
    marker2 = 'window.showSection = function(name)'
    if marker2 in src:
        src = src.replace(marker2, loader + '\n' + marker2, 1)
        print('OK: kurse loader inserted before showSection')
    else:
        print('FAIL: no insertion marker found')
        exit(1)

with open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print(f'File size: {len(src)} bytes')
