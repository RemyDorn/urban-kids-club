"""Sprint B.1: Probestunden-Section dynamic."""
import re

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
with open(p, 'r', encoding='utf-8') as f:
    src = f.read()

m = re.search(r'<div class="section" data-section="probestunden"[^>]*>', src)
nm = list(re.finditer(r'<div class="section" data-section', src[m.end():]))
end = m.end() + nm[0].start()

new_content = '''<div class="section" data-section="probestunden" hidden>
        <div class="page">

      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">Schnupper &middot; Conversion &middot; Follow-up</div>
          <h1 class="page-title">Offene <em class="italic">Probestunden</em></h1>
          <p class="page-sub" id="phTrialsSub">L&auml;dt&hellip;</p>
        </div>
        <div>
          <button class="btn btn-primary" onclick="alert('Probestunde planen folgt')">+ Probestunde planen</button>
        </div>
      </div>

      <!-- KPI Row -->
      <div class="kpi-row">
        <div class="kpi">
          <div class="kpi-label">Diese Woche</div>
          <div class="kpi-value" id="phTrialsWeek">&ndash;</div>
          <div class="kpi-trend" id="phTrialsWeekDelta">&nbsp;</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Conversion</div>
          <div class="kpi-value" id="phTrialsConv">&ndash;</div>
          <div class="kpi-trend">Schnupper &rarr; Buchung</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Offen</div>
          <div class="kpi-value" id="phTrialsOpen">&ndash;</div>
          <div class="kpi-trend">Folgen ausstehend</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Via Mom-Graph</div>
          <div class="kpi-value" id="phTrialsMG">&ndash;</div>
          <div class="kpi-trend" id="phTrialsMGDelta">&nbsp;</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="filter-tabs" id="phTrialsTabs" role="tablist" aria-label="Probestunden-Filter">
        <button class="filter-tab active" data-status="upcoming">Bevorstehend <span class="badge" data-count="upcoming">0</span></button>
        <button class="filter-tab" data-status="today">Heute <span class="badge" data-count="today">0</span></button>
        <button class="filter-tab" data-status="followup">Folge-Aufruf <span class="badge" data-count="followup">0</span></button>
        <button class="filter-tab" data-status="cancelled">Absagen <span class="badge" data-count="cancelled">0</span></button>
        <button class="filter-tab" data-status="all">Alle</button>
      </div>

      <!-- Tabelle -->
      <div class="card">
        <div class="table-head">
          <div class="table-title">Kommende <em class="italic">Schnupperstunden</em></div>
          <button class="btn btn-primary btn-sm" onclick="alert('Probestunde planen folgt')">+ Neue Probestunde</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Datum &middot; Zeit</th>
              <th>Kurs</th>
              <th>Kind</th>
              <th>Elternteil</th>
              <th>Herkunft</th>
              <th>Status</th>
              <th style="text-align:right">Aktion</th>
            </tr>
          </thead>
          <tbody id="phTrialsTbody">
            <tr><td colspan="7" style="padding:30px;color:var(--muted);text-align:center;font-size:13px">L&auml;dt Probestunden&hellip;</td></tr>
          </tbody>
        </table>
      </div>

      </div>  <!-- close .page -->
      '''

src = src[:m.start()] + new_content + src[end:]

loader = r"""
// ============================================================
// Sprint B.1: Probestunden-Section Loader
// ============================================================
window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaded = window.sectionLoaded || {};
window.sectionLoaders.probestunden = async function() {
  const state = window.dashboardState;
  if (!state) { console.warn('[v3] probestunden: state not ready'); return; }
  const { provider, api } = state;

  function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtDate(d) {
    if (!d) return '—';
    const x = new Date(d);
    const days = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    const months = ['Jan','Feb','Mrz','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    return days[x.getDay()] + ' ' + x.getDate() + '. ' + months[x.getMonth()];
  }
  function fmtTime(d, dur) {
    if (!d) return '';
    const x = new Date(d);
    const start = x.toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'});
    if (!dur) return start;
    const end = new Date(x.getTime() + dur*60000);
    return start + ' – ' + end.toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'});
  }

  let trials = [];
  try {
    const r = await api('/providers/' + provider.id + '/trials');
    trials = r.data || r.trials || r || [];
  } catch (e) { console.warn('[v3] /trials failed', e); }

  // Status-Buckets
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const weekStart = new Date(todayStart.getTime() - todayStart.getDay() * 86400000);
  const weekEnd = new Date(weekStart.getTime() + 7*86400000);

  function bucketOf(t) {
    const s = (t.status || '').toLowerCase();
    if (s === 'cancelled' || s === 'canceled' || s === 'no_show' || s === 'noshow' || t.cancelledAt) return 'cancelled';
    const d = new Date(t.scheduledAt || t.dateTime || t.startsAt || 0);
    if (s === 'completed' && !t.convertedAt) return 'followup';
    if (d >= todayStart && d < todayEnd) return 'today';
    if (d >= now) return 'upcoming';
    return 'all';
  }

  const counts = { upcoming: 0, today: 0, followup: 0, cancelled: 0, all: trials.length };
  let weekCount = 0, momGraphCount = 0, completedCount = 0, convertedCount = 0;
  trials.forEach(t => {
    counts[bucketOf(t)] = (counts[bucketOf(t)] || 0) + 1;
    const d = new Date(t.scheduledAt || t.dateTime || t.startsAt || 0);
    if (d >= weekStart && d < weekEnd) weekCount++;
    if (t.via === 'mom-graph' || t.source === 'mom-graph' || t.referredBy) momGraphCount++;
    if ((t.status || '').toLowerCase() === 'completed' || t.convertedAt) completedCount++;
    if (t.convertedAt || (t.status || '').toLowerCase() === 'converted') convertedCount++;
  });
  const conv = completedCount > 0 ? Math.round(convertedCount / completedCount * 100) : 0;
  const mgPct = trials.length > 0 ? Math.round(momGraphCount / trials.length * 100) : 0;

  document.getElementById('phTrialsSub').textContent = trials.length === 0
    ? 'Noch keine Probestunden geplant.'
    : counts.upcoming + ' bevorstehend · ' + counts.today + ' heute · ' + counts.followup + ' Follow-ups · aus Schnuppern werden Buchungen.';

  document.getElementById('phTrialsWeek').textContent = weekCount;
  document.getElementById('phTrialsWeekDelta').textContent = weekCount === 0 ? 'Noch leer' : ' ';
  document.getElementById('phTrialsConv').textContent = trials.length === 0 ? '–' : conv + '%';
  document.getElementById('phTrialsOpen').textContent = counts.followup;
  document.getElementById('phTrialsMG').textContent = momGraphCount;
  document.getElementById('phTrialsMGDelta').textContent = trials.length === 0 ? ' ' : mgPct + '% aller Trials';

  Object.keys(counts).forEach(k => {
    const el = document.querySelector('#phTrialsTabs .badge[data-count="' + k + '"]');
    if (el) el.textContent = counts[k];
  });

  let activeStatus = 'upcoming';

  function render() {
    let list = trials.slice();
    if (activeStatus !== 'all') list = list.filter(t => bucketOf(t) === activeStatus);
    list.sort((a,b) => new Date(a.scheduledAt || a.dateTime || a.startsAt || 0) - new Date(b.scheduledAt || b.dateTime || b.startsAt || 0));
    const tbody = document.getElementById('phTrialsTbody');
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;color:var(--muted);text-align:center;font-size:13px">Keine Probestunden in dieser Ansicht.</td></tr>';
      return;
    }
    tbody.innerHTML = list.slice(0, 50).map(t => {
      const d = t.scheduledAt || t.dateTime || t.startsAt;
      const dur = t.durationMinutes || t.duration || 45;
      const child = t.childName || (t.child && t.child.name) || '—';
      const childAge = t.childAgeMonths ? (t.childAgeMonths < 24 ? t.childAgeMonths + ' Mo' : Math.floor(t.childAgeMonths/12) + ' J.') : '';
      const parent = t.parentName || (t.parent && t.parent.name) || '—';
      const phone = (t.parent && t.parent.phone) || t.parentPhone || '';
      const room = t.roomName || (t.room && t.room.name) || '';
      const origin = t.via || t.source || (t.referredBy ? 'mom-graph' : 'direkt');
      const originLabel = origin === 'mom-graph' ? 'Mom-Graph' : (origin === 'widget' ? 'Widget' : 'Direkt');
      const originPill = origin === 'mom-graph' ? 'origin-momgraph' : (origin === 'widget' ? 'origin-widget' : 'origin-direct');
      const refBy = t.referredByName ? '<br><span class="cell-sub">via ' + escapeHtml(t.referredByName) + '</span>' : '';
      const status = (t.status || '').toLowerCase();
      const statusLabels = { confirmed: 'Bestätigt', scheduled: 'Geplant', completed: 'Abgeschlossen', no_show: 'No-Show', cancelled: 'Storniert', converted: 'Konvertiert' };
      const statusClasses = { confirmed: 'status-active', scheduled: 'status-active', completed: 'status-info', no_show: 'status-warn', cancelled: 'status-err', converted: 'status-success' };
      const statusLabel = statusLabels[status] || (status.charAt(0).toUpperCase() + status.slice(1)) || 'Geplant';
      const statusCls = statusClasses[status] || 'status-active';
      return '<tr>'
        + '<td><strong>' + fmtDate(d) + '</strong><br><span class="cell-sub">' + fmtTime(d, dur) + '</span></td>'
        + '<td>' + escapeHtml(t.activityName || t.activityTitle || '—') + (room ? '<br><span class="cell-sub">' + escapeHtml(room) + '</span>' : '') + '</td>'
        + '<td>' + escapeHtml(child) + (childAge ? '<br><span class="cell-sub">' + childAge + '</span>' : '') + '</td>'
        + '<td>' + escapeHtml(parent) + (phone ? '<br><span class="cell-sub">' + escapeHtml(phone) + '</span>' : '') + '</td>'
        + '<td><span class="origin-pill ' + originPill + '">' + originLabel + '</span>' + refBy + '</td>'
        + '<td><span class="status-pill ' + statusCls + '">' + statusLabel + '</span></td>'
        + '<td class="table-actions"><button class="btn btn-ghost btn-sm" onclick="alert(\'Bearbeiten folgt\')">Bearbeiten</button></td>'
        + '</tr>';
    }).join('');
  }

  document.querySelectorAll('#phTrialsTabs .filter-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#phTrialsTabs .filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatus = btn.dataset.status;
      render();
    };
  });

  render();
};
"""

marker = '// ============================================================\n// Phase 2a: SPA-Router'
if marker not in src:
    print('FAIL: marker not found'); exit(1)
src = src.replace(marker, loader + '\n' + marker, 1)

with open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print(f'OK: probestunden migrated. File: {len(src)} bytes')
