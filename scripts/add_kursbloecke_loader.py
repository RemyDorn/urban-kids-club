"""Sprint B.2: Kursbloecke-Section dynamic."""
import re

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
with open(p, 'r', encoding='utf-8') as f:
    src = f.read()

m = re.search(r'<div class="section" data-section="kursbloecke"[^>]*>', src)
nm = list(re.finditer(r'<div class="section" data-section', src[m.end():]))
end = m.end() + nm[0].start()

new_content = '''<div class="section" data-section="kursbloecke" hidden>
        <div class="page">

      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">Kursserien &middot; Bl&ouml;cke &middot; Kurzstrecken</div>
          <h1 class="page-title">Deine <em class="italic">Kursbl&ouml;cke</em></h1>
          <p class="page-sub" id="phBlocksSub">L&auml;dt&hellip;</p>
        </div>
        <div>
          <button class="btn btn-primary" onclick="alert('Neuer Kursblock folgt — aktuell wird Block automatisch beim Kurs anlegen erstellt')">+ Neuer Kursblock</button>
        </div>
      </div>

      <!-- Filter-Bar -->
      <div class="filter-tabs" id="phBlocksTabs" role="tablist" aria-label="Kursblock-Filter">
        <button class="filter-tab active" data-status="all">Alle <span class="badge" data-count="all">0</span></button>
        <button class="filter-tab" data-status="active">Laufend <span class="badge" data-count="active">0</span></button>
        <button class="filter-tab" data-status="planning">Geplant <span class="badge" data-count="planning">0</span></button>
        <button class="filter-tab" data-status="archived">Archiviert <span class="badge" data-count="archived">0</span></button>
      </div>

      <!-- Kursblock-Grid -->
      <div class="block-grid" id="phBlocksGrid">
        <div style="grid-column:1/-1;padding:40px;color:var(--muted);text-align:center;font-size:13px">L&auml;dt Kursbl&ouml;cke&hellip;</div>
      </div>

      </div>  <!-- close .page -->
      '''

src = src[:m.start()] + new_content + src[end:]

loader = r"""
// ============================================================
// Sprint B.2: Kursbloecke-Section Loader
// ============================================================
window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaded = window.sectionLoaded || {};
window.sectionLoaders.kursbloecke = async function() {
  const state = window.dashboardState;
  if (!state) { console.warn('[v3] kursbloecke: state not ready'); return; }
  const { provider, api } = state;

  function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtDate(d) {
    if (!d) return '—';
    const x = new Date(d);
    const months = ['Jan','Feb','Mrz','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    return x.getDate() + '. ' + months[x.getMonth()] + ' ' + x.getFullYear();
  }
  function statusOf(b) {
    const s = (b.status || '').toLowerCase();
    if (s === 'archived' || b.archivedAt) return 'archived';
    if (s === 'planning' || s === 'draft' || (b.startDate && new Date(b.startDate) > new Date())) return 'planning';
    return 'active';
  }
  function statusLabel(s) { return ({active:'Laufend', planning:'Geplant', archived:'Archiviert'})[s] || s; }
  function statusCls(s) { return ({active:'status-active', planning:'status-info', archived:'status-archived'})[s] || ''; }

  let blocks = [];
  try {
    const r = await api('/providers/' + provider.id + '/course-blocks');
    blocks = r.data || r.blocks || r || [];
  } catch (e) { console.warn('[v3] /course-blocks failed', e); }

  const counts = { all: blocks.length, active: 0, planning: 0, archived: 0 };
  blocks.forEach(b => { counts[statusOf(b)]++; });

  document.getElementById('phBlocksSub').textContent = blocks.length === 0
    ? 'Noch keine Kursblöcke. Wenn du einen Kurs anlegst, wird automatisch ein Block 1 mit Sessions erstellt.'
    : counts.active + ' laufend · ' + counts.planning + ' geplant · ' + counts.archived + ' archiviert.';

  Object.keys(counts).forEach(k => {
    const el = document.querySelector('#phBlocksTabs .badge[data-count="' + k + '"]');
    if (el) el.textContent = counts[k];
  });

  let activeStatus = 'all';

  function render() {
    let list = blocks.slice();
    if (activeStatus !== 'all') list = list.filter(b => statusOf(b) === activeStatus);
    list.sort((a,b) => new Date(b.startDate || b.createdAt || 0) - new Date(a.startDate || a.createdAt || 0));
    const grid = document.getElementById('phBlocksGrid');
    if (list.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;color:var(--muted);text-align:center;font-size:13px">Keine Blöcke in dieser Ansicht.</div>';
      return;
    }
    grid.innerHTML = list.map(b => {
      const totalSessions = b.totalSessions || b.total_sessions || 0;
      const completed = b.completedSessions || b.completed_sessions || 0;
      const enrolled = b.enrollmentCount || b.enrolled_count || b.enrolled || 0;
      const cap = b.capacity || 0;
      const pct = totalSessions > 0 ? Math.round(completed/totalSessions*100) : 0;
      const s = statusOf(b);
      const dayMap = { MO:'Mo', TU:'Di', WE:'Mi', TH:'Do', FR:'Fr', SA:'Sa', SU:'So' };
      const dayLabel = dayMap[(b.recurringDay || b.recurring_day || '').toUpperCase()] || '';
      const time = b.recurringTime || b.recurring_time || '';
      const room = b.roomName || (b.room && b.room.name) || '';
      const roomLine = (room || dayLabel) ? (room + (room && (dayLabel || time) ? ' · ' : '') + dayLabel + (time ? ' ' + time : '')) : '—';
      const seasonLabel = b.seasonLabel || b.season_label || ('Block ' + (b.blockNumber || 1));
      return '<article class="block-card">'
        + '<div class="block-card-head"><div class="block-badge">' + totalSessions + ' Wochen</div><div class="status-pill ' + statusCls(s) + '">' + statusLabel(s) + '</div></div>'
        + '<h3 class="block-title">' + escapeHtml(b.activityName || b.activityTitle || 'Block') + ' <em class="italic">' + escapeHtml(seasonLabel) + '</em></h3>'
        + '<div class="block-meta">'
        + '<div class="block-meta-row"><span class="block-meta-label">Start</span><span class="block-meta-val">' + fmtDate(b.startDate || b.start_date) + '</span></div>'
        + '<div class="block-meta-row"><span class="block-meta-label">Ende</span><span class="block-meta-val">' + fmtDate(b.endDate || b.end_date) + '</span></div>'
        + '<div class="block-meta-row"><span class="block-meta-label">Teilnehmer</span><span class="block-meta-val">' + enrolled + ' · ' + cap + '</span></div>'
        + '<div class="block-meta-row"><span class="block-meta-label">Raum</span><span class="block-meta-val">' + escapeHtml(roomLine) + '</span></div>'
        + '</div>'
        + '<div class="progress-wrap"><div class="progress-bar" style="width:' + pct + '%"></div></div>'
        + '<div class="block-foot"><span class="progress-label">Woche ' + completed + ' · ' + completed + ' / ' + totalSessions + '</span><button class="btn btn-ghost btn-sm" onclick="alert(\'Block-Detail folgt\')">Details</button></div>'
        + '</article>';
    }).join('');
  }

  document.querySelectorAll('#phBlocksTabs .filter-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#phBlocksTabs .filter-tab').forEach(b => b.classList.remove('active'));
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
print(f'OK: kursbloecke migrated. File: {len(src)} bytes')
