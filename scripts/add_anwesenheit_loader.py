"""Sprint B.4: Anwesenheit-Section dynamic."""
import re

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
with open(p, 'r', encoding='utf-8') as f:
    src = f.read()

m = re.search(r'<div class="section" data-section="anwesenheit"[^>]*>', src)
nm = list(re.finditer(r'<div class="section" data-section', src[m.end():]))
end = m.end() + nm[0].start()

new_content = '''<div class="section" data-section="anwesenheit" hidden>
        <div class="page">
      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">Anwesenheit &middot; Echtzeit-Tracking</div>
          <h1 class="page-title">Anwesenheits-<em>Tracking</em></h1>
          <p class="page-sub" id="phAttSub">L&auml;dt&hellip;</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="alert('CSV-Export folgt')">Export &middot; CSV</button>
          <button class="btn btn-primary" onclick="alert('QR-Check-In folgt')">QR-Check-In</button>
        </div>
      </div>

      <div class="stats" style="margin-bottom:22px;">
        <div class="stat">
          <div class="stat-label" id="phAttHeuteLabel">Heute</div>
          <div class="stat-value" id="phAttKurseHeute">&ndash; <em>Kurse</em></div>
          <div class="stat-delta" id="phAttKurseDelta">&nbsp;</div>
        </div>
        <div class="stat">
          <div class="stat-label">Anwesend &middot; jetzt</div>
          <div class="stat-value" id="phAttAnwesend">&ndash;</div>
          <div class="stat-delta" id="phAttQuote">&nbsp;</div>
        </div>
        <div class="stat">
          <div class="stat-label">Krank gemeldet</div>
          <div class="stat-value" id="phAttKrank">&ndash;</div>
          <div class="stat-delta" id="phAttKrankDelta">&nbsp;</div>
        </div>
        <div class="stat">
          <div class="stat-label">No-Shows &middot; 30d</div>
          <div class="stat-value" id="phAttNoShow">&ndash; <em>%</em></div>
          <div class="stat-delta" id="phAttNoShowDelta">&nbsp;</div>
        </div>
      </div>

      <div class="att-toolbar">
        <div class="att-date-pick" id="phAttDatePicker">
          <div class="date-arrow" id="phAttPrev" style="cursor:pointer">&larr;</div>
          <div>
            <div class="date" id="phAttDate">L&auml;dt&hellip;</div>
            <div id="phAttDateMeta" style="font-size:12px;color:var(--muted-2);margin-top:1px;">&nbsp;</div>
          </div>
          <div class="date-arrow" id="phAttNext" style="cursor:pointer">&rarr;</div>
        </div>
        <div class="att-quick">
          <span class="quick" data-when="yesterday">Gestern</span>
          <span class="quick active" data-when="today">Heute</span>
          <span class="quick" data-when="tomorrow">Morgen</span>
          <span class="quick" data-when="week">Diese Woche</span>
        </div>
      </div>

      <div class="att-class-list" id="phAttClassList">
        <div style="padding:40px;color:var(--muted);text-align:center;font-size:13px">L&auml;dt Anwesenheit&hellip;</div>
      </div>

      </div>  <!-- close .page -->
      '''

src = src[:m.start()] + new_content + src[end:]

loader = r"""
// ============================================================
// Sprint B.4: Anwesenheit-Section Loader
// ============================================================
window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaded = window.sectionLoaded || {};
window.sectionLoaders.anwesenheit = async function() {
  const state = window.dashboardState;
  if (!state) { console.warn('[v3] anwesenheit: state not ready'); return; }
  const { provider, api } = state;

  function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtDayDate(d) {
    const days = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
    const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    return days[d.getDay()] + ', ' + d.getDate() + '. <em>' + months[d.getMonth()] + '</em> ' + d.getFullYear();
  }
  function getKW(d) { const t = new Date(d); t.setHours(0,0,0,0); t.setDate(t.getDate() + 4 - (t.getDay()||7)); const ys = new Date(t.getFullYear(),0,1); return Math.ceil((((t-ys)/86400000) + 1)/7); }

  // Try to load today overview — may fail if attendance.provider_id schema is missing
  let todayResp = null;
  try {
    const r = await api('/attendance/today');
    todayResp = r.data || r;
  } catch (e) {
    console.warn('[v3] /attendance/today failed (likely schema bug)', e);
  }

  const sessions = (todayResp && (todayResp.sessions || (Array.isArray(todayResp) ? todayResp : []))) || [];
  const records = (todayResp && (todayResp.records || [])) || [];

  const today = new Date();
  const expected = sessions.reduce((s, x) => s + (x.expected || x.bookedCount || 0), 0);
  const present = records.filter(r => r.checkedIn || r.checked_in).length;
  const sick = sessions.reduce((s, x) => s + (x.sickCount || 0), 0);
  const quote = expected > 0 ? Math.round(present/expected*100) : 0;

  // KPIs
  document.getElementById('phAttHeuteLabel').textContent = 'Heute · ' + today.toLocaleDateString('de-DE');
  document.getElementById('phAttKurseHeute').innerHTML = sessions.length + ' <em>Kurse</em>';
  document.getElementById('phAttKurseDelta').textContent = expected > 0 ? expected + ' Anmeldungen erwartet' : 'Keine Termine heute';
  document.getElementById('phAttAnwesend').textContent = present || '0';
  document.getElementById('phAttQuote').innerHTML = expected > 0 ? '<strong>' + quote + '%</strong> Auslastung' : ' ';
  document.getElementById('phAttKrank').textContent = sick || '0';
  document.getElementById('phAttKrankDelta').textContent = sick > 0 ? 'Add-Up automatisch gutgeschrieben' : ' ';
  document.getElementById('phAttNoShow').innerHTML = '– <em>%</em>';  // would need 30d aggregation API
  document.getElementById('phAttNoShowDelta').textContent = '30-Tage-Statistik in Sprint C';

  // Date picker
  const dateEl = document.getElementById('phAttDate');
  const dateMeta = document.getElementById('phAttDateMeta');
  dateEl.innerHTML = 'Heute, ' + today.getDate() + '. <em>' + ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'][today.getMonth()] + '</em> ' + today.getFullYear();
  const dayName = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][today.getDay()];
  dateMeta.textContent = dayName + ' · KW ' + getKW(today) + ' · ' + sessions.length + ' Kurs' + (sessions.length === 1 ? '' : 'e') + ' · ' + expected + ' erwartet';

  // Sub headline
  document.getElementById('phAttSub').textContent = sessions.length === 0
    ? (todayResp ? 'Heute keine Termine geplant.' : 'Anwesenheit-API nicht verfügbar — Schema-Migration ausstehend (siehe Memory).')
    : 'Wer ist heute da, wer fehlt? Eine Geste pro Kind reicht — alles synchronisiert ins Eltern-Portal.';

  // Class list
  const classList = document.getElementById('phAttClassList');
  if (sessions.length === 0) {
    classList.innerHTML = '<div style="padding:60px 40px;text-align:center;color:var(--muted)">'
      + '<div style="font-size:32px;margin-bottom:12px">📋</div>'
      + '<div style="font-size:15px;font-weight:500;margin-bottom:6px;color:var(--ink-2)">' + (todayResp ? 'Heute keine Kurse.' : 'Anwesenheit derzeit nicht verfügbar') + '</div>'
      + '<div style="font-size:13px">' + (todayResp ? 'Sobald Kurse angelegt sind und Sessions heute stattfinden, erscheinen sie hier.' : 'Backend-Schema-Migration für attendance.provider_id ausstehend. Code-Fix bereit, wartet auf Apply-OK.') + '</div>'
      + '</div>';
    return;
  }

  classList.innerHTML = sessions.map(sess => {
    const title = sess.activityTitle || sess.activityName || sess.title || 'Kurs';
    const startTime = sess.startTime || sess.start_time || '—';
    const endTime = sess.endTime || sess.end_time || '';
    const room = sess.roomName || sess.room || '';
    const trainer = sess.trainerName || sess.trainer || sess.instructorName || '';
    const expected = sess.expected || sess.bookedCount || 0;
    const sessRecords = records.filter(r => r.activityId === sess.activityId || r.sessionId === sess.id);
    const presentCount = sessRecords.filter(r => r.checkedIn || r.checked_in).length;
    const sickCount = sessRecords.filter(r => !(r.checkedIn || r.checked_in) && r.note).length;
    const sessQuote = expected > 0 ? Math.round(presentCount/expected*100) : 0;

    return '<div class="att-class">'
      + '<div class="att-class-head">'
      + '<div><div class="att-class-title">' + escapeHtml(title) + ' · ' + startTime + (endTime ? ' – ' + endTime : '') + '</div>'
      + '<div class="att-class-meta">' + (room ? escapeHtml(room) + ' · ' : '') + (trainer ? escapeHtml(trainer) + ' · ' : '') + expected + ' Anmeldung' + (expected === 1 ? '' : 'en') + '</div></div>'
      + '<div class="att-class-stats">'
      + '<div class="stat-item"><div class="stat-num" style="color:var(--sage-deep);">' + presentCount + '</div><div class="stat-label">Anwesend</div></div>'
      + '<div class="stat-item"><div class="stat-num" style="color:var(--signal);">' + sickCount + '</div><div class="stat-label">Krank</div></div>'
      + '<div class="stat-item"><div class="stat-num">' + sessQuote + '<span style="font-size:13px;">%</span></div><div class="stat-label">Quote</div></div>'
      + '</div>'
      + '<button class="btn btn-ghost btn-sm" onclick="alert(\'Bulk check-in folgt\')">Alle markieren</button>'
      + '</div>'
      + '<div class="att-rows">'
      + (sessRecords.length === 0
        ? '<div style="padding:20px;color:var(--muted);font-size:13px;text-align:center">Noch keine Anmeldungen geladen</div>'
        : sessRecords.slice(0, 12).map(r => {
            const name = r.parentName || r.childName || 'Teilnehmer';
            const initial = name.charAt(0).toUpperCase();
            const isPresent = r.checkedIn || r.checked_in;
            return '<div class="att-row"><div class="att-avatar">' + escapeHtml(initial) + '</div>'
              + '<div><div class="att-name">' + escapeHtml(name) + '</div></div>'
              + '<div class="att-toggle">'
              + '<button class="' + (isPresent ? 'active' : '') + '" onclick="alert(\'Check-in API folgt\')">Anwesend</button>'
              + '<button onclick="alert(\'Späte API folgt\')">Spät</button>'
              + '<button onclick="alert(\'Fehlt API folgt\')">Fehlt</button>'
              + '<button onclick="alert(\'Krank API folgt\')">Krank</button>'
              + '</div></div>';
          }).join(''))
      + '</div></div>';
  }).join('');
};
"""

marker = '// ============================================================\n// Phase 2a: SPA-Router'
if marker not in src:
    print('FAIL: marker not found'); exit(1)
src = src.replace(marker, loader + '\n' + marker, 1)

with open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print(f'OK: anwesenheit migrated. File: {len(src)} bytes')
