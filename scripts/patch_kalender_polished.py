"""Bring the live /v3#kalender page up to the polished kalender-preview design.

Steps:
  1) Inject calendar CSS (cal-*, day-*, month-*) into dashboard-v3.html style block.
  2) Replace the kalender section markup with the page-head + calendar-toolbar +
     three cal-panel containers (week/day/month).
  3) Rewrite window.sectionLoaders.kalender so it renders the three panels with
     real activities + bookings, lane-system, today/weekend highlights, full-stripe,
     room filter, ICS export, navigation, view-toggle.
"""

import re

fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(fp, 'r', encoding='utf-8').read()

# ============================================================
# 1) Inject CSS — find the closing </style> of the main inline stylesheet
#    (we'll inject right before its end so our rules win cascade).
# ============================================================
CSS_BLOCK = """
/* ============================================================
   KALENDER (week / day / month) — polished from kalender-preview
   ============================================================ */
.calendar-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 14px; margin-bottom: 18px; flex-wrap: wrap;
}
.cal-nav { display: flex; align-items: center; gap: 6px; }
.cal-nav-title {
  font-family: var(--font-heading); font-weight: 700; font-size: 20px;
  color: var(--ink); letter-spacing: 0.01em; min-width: 180px;
}
.cal-nav-title em {
  font-family: var(--font-accent); font-style: italic; font-weight: 500;
  color: var(--primary); margin-left: 4px;
}
.cal-nav-btn {
  width: 32px; height: 32px; border-radius: var(--radius-pill);
  background: var(--surface); border: 1px solid var(--border);
  color: var(--ink); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--motion-fast), border-color var(--motion-fast);
}
.cal-nav-btn:hover { background: var(--surface-alt); }
.cal-today {
  font-family: var(--font-body); font-size: 12.5px; font-weight: 600;
  padding: 7px 14px; background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius-pill); color: var(--ink); cursor: pointer; margin-right: 6px;
}
.cal-view-toggle {
  display: flex; gap: 2px; background: var(--bg); padding: 3px;
  border-radius: var(--radius-pill); border: 1px solid var(--border);
}
.cal-view-btn {
  background: transparent; border: none; font-family: var(--font-body);
  font-size: 12.5px; font-weight: 500; color: var(--ink-2);
  padding: 6px 14px; border-radius: var(--radius-pill); cursor: pointer;
  transition: background var(--motion-fast), color var(--motion-fast);
}
.cal-view-btn.active { background: var(--ink); color: var(--bg); font-weight: 600; }

.cal-grid {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 18px;
}
.cal-grid-head {
  display: grid; grid-template-columns: 60px repeat(7, 1fr);
  background: var(--bg); border-bottom: 1px solid var(--border);
}
.cal-grid-head > div {
  padding: 12px 8px 10px; font-family: var(--font-heading); font-weight: 600;
  font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--muted); text-align: center; border-right: 1px solid var(--border);
}
.cal-grid-head > div:last-child { border-right: none; }
.cal-grid-head .day-label { color: var(--ink); font-size: 11px; }
.cal-grid-head .day-date {
  display: block; font-family: var(--font-heading); font-weight: 700;
  font-size: 18px; color: var(--ink); letter-spacing: -0.01em;
  margin-top: 2px; text-transform: none;
}
.cal-grid-head .today .day-date { color: var(--primary); }
.cal-grid-head .today .day-label { color: var(--primary); }

.cal-grid-body {
  display: grid; grid-template-columns: 60px repeat(7, 1fr); position: relative;
}
.cal-time-col { border-right: 1px solid var(--border); background: var(--bg); }
.cal-time-slot {
  height: 56px; font-family: var(--font-body); font-size: 10.5px;
  color: var(--muted); padding: 4px 6px; text-align: right;
  border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; font-weight: 500;
}
.cal-day-col { border-right: 1px solid var(--border); position: relative; }
.cal-day-col:last-child { border-right: none; }
.cal-day-col.today { background: rgba(255,239,225,0.4); }
.cal-day-col.weekend { background: rgba(60,33,36,0.02); }
.cal-hour {
  height: 56px; border-bottom: 1px solid var(--border);
  transition: background var(--motion-fast);
}
.cal-hour:hover { background: var(--surface-alt); cursor: pointer; }

.cal-event {
  position: absolute; left: 4px; right: 4px; padding: 5px 8px 6px;
  border-radius: var(--radius-sm); cursor: pointer; overflow: hidden;
  border-left: 3px solid;
  transition: transform var(--motion-fast), box-shadow var(--motion-fast),
              left var(--motion-base), width var(--motion-base);
  z-index: 1;
}
.cal-event.lane-0-of-2 { left: 3px; right: auto; width: calc(50% - 5px); }
.cal-event.lane-1-of-2 { left: calc(50% + 2px); right: 3px; width: calc(50% - 5px); }
.cal-event.lane-0-of-3 { left: 3px; right: auto; width: calc(33.333% - 5px); }
.cal-event.lane-1-of-3 { left: calc(33.333% + 1px); right: auto; width: calc(33.333% - 3px); }
.cal-event.lane-2-of-3 { left: calc(66.666% + 1px); right: 3px; width: calc(33.333% - 5px); }
.cal-event.lane-0-of-4 { left: 3px; right: auto; width: calc(25% - 4px); }
.cal-event.lane-1-of-4 { left: calc(25% + 1px); right: auto; width: calc(25% - 3px); }
.cal-event.lane-2-of-4 { left: calc(50% + 1px); right: auto; width: calc(25% - 3px); }
.cal-event.lane-3-of-4 { left: calc(75% + 1px); right: 3px; width: calc(25% - 5px); }
.cal-event:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(60,33,36,0.12); z-index: 2;
}
.cal-event.eltern-kind { background: #FDE4D3; border-left-color: var(--primary); color: var(--signal-hover); }
.cal-event.bewegung    { background: var(--sage-tint); border-left-color: var(--sage-deep); color: var(--sage-deep); }
.cal-event.musik       { background: var(--signal-tint); border-left-color: var(--signal); color: var(--signal-hover); }
.cal-event.kreativ     { background: #F5DCC5; border-left-color: var(--primary-hover); color: var(--primary-hover); }
.cal-event-title {
  font-family: var(--font-heading); font-weight: 700; font-size: 11.5px;
  letter-spacing: 0.02em; line-height: 1.2; margin-bottom: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cal-event-meta {
  font-family: var(--font-body); font-size: 10.5px; opacity: 0.85;
  font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cal-event.full {
  opacity: 0.9;
  background-image: repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(255,255,255,0.25) 4px, rgba(255,255,255,0.25) 8px);
}

.cal-legend {
  display: flex; gap: 16px; padding: 10px 14px; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius-md);
  font-size: 12px; color: var(--muted-2); flex-wrap: wrap;
}
.cal-legend-item { display: inline-flex; align-items: center; gap: 6px; }
.cal-legend-dot { width: 10px; height: 10px; border-radius: 3px; }
.cal-legend-dot.eltern-kind { background: #FDE4D3; border-left: 3px solid var(--primary); }
.cal-legend-dot.bewegung { background: var(--sage-tint); border-left: 3px solid var(--sage-deep); }
.cal-legend-dot.musik { background: var(--signal-tint); border-left: 3px solid var(--signal); }
.cal-legend-dot.kreativ { background: #F5DCC5; border-left: 3px solid var(--primary-hover); }
.cal-panel { display: none; }
.cal-panel.active { display: block; }

/* DAY VIEW */
.day-strip {
  display: flex; gap: 6px; padding: 8px; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius-md);
  margin-bottom: 14px; overflow-x: auto; scrollbar-width: none;
}
.day-strip::-webkit-scrollbar { display: none; }
.day-strip-day {
  flex: 1; min-width: 62px; text-align: center; padding: 10px 8px;
  background: transparent; border: 1px solid transparent;
  border-radius: var(--radius-sm); cursor: pointer;
  transition: background var(--motion-fast), border-color var(--motion-fast);
}
.day-strip-day:hover { background: var(--bg); }
.day-strip-day.active { background: var(--ink); color: var(--bg); }
.day-strip-label {
  font-family: var(--font-heading); font-weight: 600; font-size: 10.5px;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--muted); margin-bottom: 3px;
}
.day-strip-day.active .day-strip-label { color: rgba(255,239,225,0.7); }
.day-strip-date {
  font-family: var(--font-heading); font-weight: 700; font-size: 20px;
  color: var(--ink); line-height: 1; letter-spacing: -0.01em;
}
.day-strip-day.active .day-strip-date { color: var(--bg); }
.day-strip-dots {
  margin-top: 5px; display: flex; justify-content: center; gap: 2px; height: 4px;
}
.day-strip-dots .d { width: 4px; height: 4px; border-radius: 50%; background: var(--primary); }
.day-strip-dots .d.sage { background: var(--sage-deep); }
.day-strip-dots .d.musik { background: var(--signal); }

.day-grid {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); overflow: hidden;
}
.day-grid-head {
  display: grid; grid-template-columns: 80px repeat(3, 1fr);
  background: var(--bg); border-bottom: 1px solid var(--border);
}
.day-grid-head > div {
  padding: 14px 12px; font-family: var(--font-heading); font-weight: 600;
  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--muted); text-align: center; border-right: 1px solid var(--border);
}
.day-grid-head > div:last-child { border-right: none; }
.day-grid-head .room-label { color: var(--ink); font-size: 11.5px; font-weight: 700; }
.day-grid-head .room-sub {
  display: block; font-family: var(--font-body); font-weight: 500;
  font-size: 10.5px; color: var(--muted-2); margin-top: 3px;
  text-transform: none; letter-spacing: 0;
}
.day-grid-body {
  display: grid; grid-template-columns: 80px repeat(3, 1fr); position: relative;
}
.day-time-col { border-right: 1px solid var(--border); background: var(--bg); }
.day-time-slot {
  height: 80px; font-family: var(--font-body); font-size: 12px;
  color: var(--muted); padding: 6px 10px; text-align: right;
  border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; font-weight: 500;
}
.day-room-col { border-right: 1px solid var(--border); position: relative; }
.day-room-col:last-child { border-right: none; }
.day-hour {
  height: 80px; border-bottom: 1px solid var(--border);
  transition: background var(--motion-fast); cursor: pointer;
}
.day-hour:hover { background: var(--surface-alt); }
.day-event {
  position: absolute; left: 6px; right: 6px; padding: 10px 12px;
  border-radius: var(--radius-sm); cursor: pointer; overflow: hidden;
  border-left: 4px solid;
  transition: transform var(--motion-fast), box-shadow var(--motion-fast); z-index: 1;
}
.day-event:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(60,33,36,0.12); z-index: 2; }
.day-event.eltern-kind { background: #FDE4D3; border-left-color: var(--primary); color: var(--signal-hover); }
.day-event.bewegung { background: var(--sage-tint); border-left-color: var(--sage-deep); color: var(--sage-deep); }
.day-event.musik { background: var(--signal-tint); border-left-color: var(--signal); color: var(--signal-hover); }
.day-event.kreativ { background: #F5DCC5; border-left-color: var(--primary-hover); color: var(--primary-hover); }
.day-event-title { font-family: var(--font-heading); font-weight: 700; font-size: 14px; letter-spacing: 0.01em; line-height: 1.2; margin-bottom: 3px; }
.day-event-time { font-family: var(--font-body); font-size: 11.5px; font-weight: 600; opacity: 0.85; letter-spacing: 0.02em; }
.day-event-meta { font-family: var(--font-body); font-size: 11px; opacity: 0.75; margin-top: 4px; }

/* MONTH VIEW */
.month-grid {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); overflow: hidden;
}
.month-head {
  display: grid; grid-template-columns: repeat(7, 1fr);
  background: var(--bg); border-bottom: 1px solid var(--border);
}
.month-head > div {
  padding: 12px 10px; font-family: var(--font-heading); font-weight: 600;
  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--muted); text-align: center; border-right: 1px solid var(--border);
}
.month-head > div:last-child { border-right: none; }
.month-body {
  display: grid; grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: minmax(108px, auto);
}
.month-day {
  border-right: 1px solid var(--border); border-bottom: 1px solid var(--border);
  padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;
  cursor: pointer; transition: background var(--motion-fast);
  position: relative; min-height: 108px;
}
.month-day:hover { background: var(--surface-alt); }
.month-day:nth-child(7n) { border-right: none; }
.month-day.other-month { opacity: 0.4; background: rgba(60,33,36,0.02); }
.month-day.weekend { background: rgba(60,33,36,0.015); }
.month-day.today { background: rgba(204,137,94,0.08); }
.month-day-num {
  font-family: var(--font-heading); font-weight: 600; font-size: 14px;
  color: var(--ink); letter-spacing: -0.01em;
  width: 26px; height: 26px; display: inline-flex; align-items: center;
  justify-content: center; border-radius: 50%; font-variant-numeric: tabular-nums;
}
.month-day.today .month-day-num { background: var(--primary); color: var(--bg); font-weight: 700; }
.month-day.other-month .month-day-num { color: var(--muted-2); }
.month-evt {
  font-family: var(--font-body); font-size: 10.5px; font-weight: 600;
  padding: 2px 6px; border-radius: 3px; border-left: 2px solid;
  line-height: 1.3; letter-spacing: 0.01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: transform var(--motion-fast); cursor: pointer;
}
.month-evt:hover { transform: translateX(2px); }
.month-evt.eltern-kind { background: #FDE4D3; border-left-color: var(--primary); color: var(--signal-hover); }
.month-evt.bewegung { background: var(--sage-tint); border-left-color: var(--sage-deep); color: var(--sage-deep); }
.month-evt.musik { background: var(--signal-tint); border-left-color: var(--signal); color: var(--signal-hover); }
.month-evt.kreativ { background: #F5DCC5; border-left-color: var(--primary-hover); color: var(--primary-hover); }
.month-more { font-size: 10px; color: var(--muted-2); font-weight: 500; margin-top: 2px; }

@media (max-width: 900px) {
  .day-grid-head, .day-grid-body { grid-template-columns: 56px repeat(3, 1fr); }
  .day-time-slot { font-size: 10px; padding: 4px 6px; }
  .month-body { grid-auto-rows: minmax(72px, auto); }
  .month-day { min-height: 72px; padding: 5px 6px; }
  .month-day-num { font-size: 12px; width: 20px; height: 20px; }
  .month-evt { font-size: 9px; padding: 1px 4px; }
  .cal-grid-head, .cal-grid-body { grid-template-columns: 48px repeat(7, 1fr); }
  .cal-grid-head > div { padding: 8px 2px; font-size: 9px; }
  .cal-grid-head .day-date { font-size: 14px; }
  .cal-event-title { font-size: 9.5px; }
  .cal-event-meta { font-size: 9px; }
  .cal-time-slot { font-size: 9px; }
}
"""

# Inject before the first </style> closer in the file head.
m_style = re.search(r"</style>", src)
if not m_style:
    print('FAIL: no </style> tag found'); exit(1)
src = src[:m_style.start()] + CSS_BLOCK + "\n" + src[m_style.start():]
print('OK: kalender CSS injected before </style>')

# ============================================================
# 2) Replace section markup
# ============================================================
old_section_pat = re.compile(
    r'<div class="section" data-section="kalender" hidden>.*?</div>\s*<!-- close section -->',
    re.DOTALL
)
new_section = '''<div class="section" data-section="kalender" hidden>
        <div class="page">
      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker" id="phKalKicker">Termin&uuml;bersicht</div>
          <h1 class="page-title">Dein <em>Kalender</em></h1>
          <p class="page-sub" id="phKalSub">L&auml;dt&hellip;</p>
        </div>
        <div style="display:flex;gap:8px;">
          <a href="#" id="phKalIcsBtn" class="btn btn-ghost btn-sm" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Kalender exportieren (.ics)
          </a>
          <button class="btn btn-primary" onclick="window.openKursCreatorV2 && window.openKursCreatorV2({})">+ Termin anlegen</button>
        </div>
      </div>

      <div class="calendar-toolbar">
        <div class="cal-nav">
          <button class="cal-today" onclick="window.__kalToday()">Heute</button>
          <button class="cal-nav-btn" title="Zur&uuml;ck" onclick="window.__kalNav(-1)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
          <button class="cal-nav-btn" title="Vor" onclick="window.__kalNav(1)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
          <div class="cal-nav-title" id="phKalTitle" style="margin-left:10px;">&nbsp;</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <select class="filter-select" id="phKalRoom" aria-label="Raum" onchange="window.__kalSetRoom(this.value)">
            <option value="">Alle R&auml;ume</option>
          </select>
          <div class="cal-view-toggle">
            <button class="cal-view-btn" data-view="day" onclick="window.__kalSetView(\\'day\\')">Tag</button>
            <button class="cal-view-btn active" data-view="week" onclick="window.__kalSetView(\\'week\\')">Woche</button>
            <button class="cal-view-btn" data-view="month" onclick="window.__kalSetView(\\'month\\')">Monat</button>
          </div>
        </div>
      </div>

      <div class="cal-panel active" data-view="week" id="phKalWeek"></div>
      <div class="cal-panel" data-view="day" id="phKalDay"></div>
      <div class="cal-panel" data-view="month" id="phKalMonth"></div>

      <div class="cal-legend" style="margin-top:14px;">
        <div class="cal-legend-item"><span class="cal-legend-dot eltern-kind"></span>Eltern-Kind</div>
        <div class="cal-legend-item"><span class="cal-legend-dot bewegung"></span>Bewegung</div>
        <div class="cal-legend-item"><span class="cal-legend-dot musik"></span>Musik</div>
        <div class="cal-legend-item"><span class="cal-legend-dot kreativ"></span>Kreativ</div>
        <div style="margin-left:auto;font-size:11.5px;">Linien-Muster = ausgebucht &middot; Klick in Zeitzelle: neuer Termin &middot; Klick auf Event: &ouml;ffnet Kurs</div>
      </div>

      </div>  <!-- close .page -->
      </div>  <!-- close section -->'''

# Note: the JS block uses `\\'` because we are writing the string into a .py file
# that holds a Python string. We want literal `\'` to land in the HTML inside
# inline onclick attributes. Replace the placeholder.
new_section = new_section.replace("\\'", "'")

if not old_section_pat.search(src):
    print('FAIL: kalender section pattern not found'); exit(1)
src = old_section_pat.sub(lambda m: new_section, src, count=1)
print('OK: kalender section markup replaced with polished structure')

# ============================================================
# 3) Replace sectionLoader with the new renderer
# ============================================================
old_loader_pat = re.compile(
    r"window\.sectionLoaders\.kalender = function\(\) \{.*?^window\.__kalSetView = function\(v\) \{[^}]*\};",
    re.DOTALL | re.MULTILINE
)

NEW_LOADER = r'''window.sectionLoaders.kalender = function() {
  var s = window.dashboardState; if (!s) return;
  if (!window.__kalState) {
    var today = new Date(); today.setHours(0,0,0,0);
    window.__kalState = { view: 'week', anchor: today, dayDate: new Date(today), room: '' };
  }
  // Populate room dropdown once
  var roomSel = document.getElementById('phKalRoom');
  if (roomSel && roomSel.options.length <= 1) {
    var roomMap = {};
    (s.activities || []).forEach(function(a) {
      if (a && a.roomId) roomMap[a.roomId] = a.roomName || ('Raum ' + a.roomId);
    });
    Object.keys(roomMap).forEach(function(rid) {
      var o = document.createElement('option');
      o.value = rid; o.textContent = roomMap[rid];
      roomSel.appendChild(o);
    });
  }
  // ICS export wiring (best-effort link to API; fallback alert)
  var ics = document.getElementById('phKalIcsBtn');
  if (ics && !ics.__wired) {
    ics.addEventListener('click', function(ev) {
      ev.preventDefault();
      var token = (s && s.token) || '';
      var url = '/api/calendar/export.ics' + (token ? ('?token=' + encodeURIComponent(token)) : '');
      window.open(url, '_blank');
    });
    ics.__wired = true;
  }
  window.__renderKalender();
};

// Helpers
window.__kalCatClass = function(a) {
  var c = ((a && a.category) || '').toLowerCase();
  if (/eltern|baby|peki|p[ae]kip/.test(c)) return 'eltern-kind';
  if (/yoga|turn|sport|beweg/.test(c)) return 'bewegung';
  if (/music|musik|gesang|gitarr|klavier/.test(c)) return 'musik';
  if (/kreat|mal|kunst|werk|bast/.test(c)) return 'kreativ';
  // hash fallback so each course gets a stable color
  var keys = ['eltern-kind','bewegung','musik','kreativ'];
  var h = 0; var id = String((a && (a.id || a.title)) || '');
  for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return keys[h % keys.length];
};
window.__kalStartOfWeek = function(d) {
  var x = new Date(d); x.setHours(0,0,0,0);
  var dow = x.getDay();
  var diff = (dow + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
};
window.__kalActivitiesOnDate = function(date) {
  var s = window.dashboardState; if (!s) return [];
  var ks = window.__kalState;
  var dayKeys = ['MO','TU','WE','TH','FR','SA','SU'];
  var dKey = dayKeys[(date.getDay() + 6) % 7];
  var out = [];
  (s.activities || []).forEach(function(a) {
    if (!a || a.status === 'archived' || a.status === 'cancelled') return;
    if (ks.room && a.roomId !== ks.room) return;
    var slots = (a.schedule && a.schedule.slots) || [];
    slots.forEach(function(slot) {
      if (slot.day !== dKey) return;
      var sd = a.schedule && a.schedule.startDate;
      var ed = a.schedule && a.schedule.endDate;
      if (sd && new Date(sd) > date) return;
      if (ed && new Date(ed) < date) return;
      out.push({ a: a, slot: slot });
    });
  });
  return out;
};
window.__kalCountBooked = function(a) {
  var s = window.dashboardState; if (!s) return 0;
  return (s.bookings || []).filter(function(b) {
    return b && b.activityId === a.id && b.status !== 'cancelled' && b.status !== 'refunded';
  }).length;
};
window.__kalAssignLanes = function(events) {
  events.sort(function(x, y) { return (x.startMin - y.startMin) || (x.endMin - y.endMin); });
  var lanes = []; // each lane = list of placed events
  events.forEach(function(ev) {
    var placed = false;
    for (var li = 0; li < lanes.length; li++) {
      var last = lanes[li][lanes[li].length - 1];
      if (last.endMin <= ev.startMin) {
        ev.lane = li; lanes[li].push(ev); placed = true; break;
      }
    }
    if (!placed) { ev.lane = lanes.length; lanes.push([ev]); }
  });
  events.forEach(function(ev) { ev.laneCount = lanes.length; });
  return events;
};

window.__renderKalender = function() {
  var s = window.dashboardState; if (!s) return;
  var ks = window.__kalState;
  var months = ['Januar','Februar','Mär'+'z','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  var monthsShort = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  var dayLabels = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  var dayLabelsLong = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];

  // ---------- toggle buttons + panel visibility ----------
  document.querySelectorAll('.cal-view-btn').forEach(function(btn) {
    if (btn.dataset.view === ks.view) btn.classList.add('active');
    else btn.classList.remove('active');
  });
  document.querySelectorAll('#phKalWeek, #phKalDay, #phKalMonth').forEach(function(p) {
    if (p.dataset.view === ks.view) p.classList.add('active');
    else p.classList.remove('active');
  });

  // ---------- header label ----------
  var titleEl = document.getElementById('phKalTitle');
  var subEl = document.getElementById('phKalSub');
  var kickerEl = document.getElementById('phKalKicker');
  var headerLabel = '', kickerLabel = '';
  if (ks.view === 'week') {
    var ws = window.__kalStartOfWeek(ks.anchor);
    var we = new Date(ws); we.setDate(ws.getDate() + 6);
    var jsWeekNum = (function(d) {
      var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      var dow = t.getUTCDay() || 7;
      t.setUTCDate(t.getUTCDate() + 4 - dow);
      var ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      return Math.ceil(((t - ys) / 86400000 + 1) / 7);
    })(ws);
    kickerLabel = 'Woche ' + jsWeekNum + ' · ' + ws.getDate() + '. ' + monthsShort[ws.getMonth()] + ' – ' + we.getDate() + '. ' + monthsShort[we.getMonth()] + ' ' + we.getFullYear();
    headerLabel = months[ws.getMonth()] + ' <em>' + ws.getFullYear() + '</em>';
  } else if (ks.view === 'day') {
    kickerLabel = 'Tagesansicht';
    headerLabel = dayLabelsLong[(ks.dayDate.getDay() + 6) % 7] + ' ' + ks.dayDate.getDate() + '. ' + monthsShort[ks.dayDate.getMonth()] + ' <em>' + ks.dayDate.getFullYear() + '</em>';
  } else {
    kickerLabel = 'Monatsansicht';
    headerLabel = months[ks.anchor.getMonth()] + ' <em>' + ks.anchor.getFullYear() + '</em>';
  }
  if (titleEl) titleEl.innerHTML = headerLabel;
  if (kickerEl) kickerEl.textContent = kickerLabel;

  // ---------- WEEK ----------
  if (ks.view === 'week') {
    var ws = window.__kalStartOfWeek(ks.anchor);
    var today = new Date(); today.setHours(0,0,0,0);

    // Find min/max hours from events to size grid (default 09-18, expand if needed)
    var minH = 9, maxH = 18;
    for (var di = 0; di < 7; di++) {
      var dd = new Date(ws); dd.setDate(ws.getDate() + di);
      var evs = window.__kalActivitiesOnDate(dd);
      evs.forEach(function(e) {
        var st = (e.slot.startTime || '09:00');
        var et = (e.slot.endTime || st);
        var sH = parseInt(st.slice(0,2),10);
        var eH = parseInt(et.slice(0,2),10) + (parseInt(et.slice(3,5),10) > 0 ? 1 : 0);
        if (sH < minH) minH = sH;
        if (eH > maxH) maxH = eH;
      });
    }
    if (minH > 7) minH = Math.max(7, minH);
    if (maxH < 19) maxH = Math.min(22, Math.max(maxH, 18));
    var hourCount = maxH - minH;
    var slotPx = 56;

    // header row
    var head = '<div class="cal-grid"><div class="cal-grid-head"><div></div>';
    var totalThisWeek = 0;
    for (var i = 0; i < 7; i++) {
      var d = new Date(ws); d.setDate(ws.getDate() + i);
      var isToday = d.getTime() === today.getTime();
      head += '<div' + (isToday ? ' class="today"' : '') + '><span class="day-label">' + dayLabels[i] + '</span><span class="day-date">' + String(d.getDate()).padStart(2,'0') + '</span></div>';
    }
    head += '</div>';

    // body
    var body = '<div class="cal-grid-body">';
    var timeCol = '<div class="cal-time-col">';
    for (var h = 0; h < hourCount; h++) {
      timeCol += '<div class="cal-time-slot">' + String(minH + h).padStart(2,'0') + ':00</div>';
    }
    timeCol += '</div>';
    body += timeCol;

    var totalParticipants = 0;
    for (var i = 0; i < 7; i++) {
      var d = new Date(ws); d.setDate(ws.getDate() + i);
      var isToday = d.getTime() === today.getTime();
      var isWeekend = (i === 5 || i === 6);
      var classes = ['cal-day-col'];
      if (isToday) classes.push('today');
      if (isWeekend) classes.push('weekend');
      var col = '<div class="' + classes.join(' ') + '" data-date="' + d.toISOString() + '">';
      // hour cells
      for (var h = 0; h < hourCount; h++) {
        var hr = String(minH + h).padStart(2,'0') + ':00';
        col += '<div class="cal-hour" onclick="window.__kalCellClick(\'' + d.toISOString() + '\',\'' + hr + '\')"></div>';
      }
      // events
      var evs = window.__kalActivitiesOnDate(d);
      var evBlocks = evs.map(function(e) {
        var st = (e.slot.startTime || '09:00');
        var et = (e.slot.endTime || st);
        var sH = parseInt(st.slice(0,2),10) + parseInt(st.slice(3,5),10)/60;
        var eH = parseInt(et.slice(0,2),10) + parseInt(et.slice(3,5),10)/60;
        if (eH <= sH) eH = sH + 1;
        return {
          a: e.a, slot: e.slot,
          startMin: sH * 60, endMin: eH * 60,
          top: (sH - minH) * slotPx,
          height: Math.max(28, (eH - sH) * slotPx - 2),
          startTime: st, endTime: et,
        };
      });
      window.__kalAssignLanes(evBlocks);
      evBlocks.forEach(function(ev) {
        var booked = window.__kalCountBooked(ev.a);
        var cap = ev.a.capacity || 0;
        var isFull = cap > 0 && booked >= cap;
        var meta = ev.startTime + ' · ' + (ev.a.roomName || (ev.a.roomId ? 'Raum ' + ev.a.roomId : '—')) + ' · ' + (isFull ? 'voll' : (booked + '/' + cap));
        var cls = ['cal-event', window.__kalCatClass(ev.a)];
        if (isFull) cls.push('full');
        if (ev.laneCount > 1) cls.push('lane-' + ev.lane + '-of-' + ev.laneCount);
        var titleEsc = (window.escapeHtml || function(x){ return x; })(ev.a.title || 'Kurs');
        col += '<div class="' + cls.join(' ') + '" style="top:' + ev.top + 'px;height:' + ev.height + 'px;" onclick="event.stopPropagation();window.viewCourseDetail(\'' + ev.a.id + '\')" title="' + titleEsc + ' · ' + meta + '">'
          + '<div class="cal-event-title">' + titleEsc + '</div>'
          + '<div class="cal-event-meta">' + meta + '</div>'
          + '</div>';
      });
      // now-line on today
      if (isToday) {
        var nowD = new Date();
        var nowH = nowD.getHours() + nowD.getMinutes()/60;
        if (nowH >= minH && nowH <= maxH) {
          var nowTop = (nowH - minH) * slotPx;
          col += '<div style="position:absolute;left:0;right:0;top:' + nowTop + 'px;height:2px;background:var(--primary);z-index:5;pointer-events:none">'
            + '<div style="position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--primary)"></div>'
            + '</div>';
        }
      }
      col += '</div>';
      body += col;
      totalThisWeek += evs.length;
      evs.forEach(function(e) { totalParticipants += window.__kalCountBooked(e.a); });
    }
    body += '</div></div>';
    document.getElementById('phKalWeek').innerHTML = head + body;

    if (subEl) subEl.textContent = totalThisWeek + ' Termin' + (totalThisWeek === 1 ? '' : 'e') + ' in dieser Woche · ' + totalParticipants + ' Teilnehmer';
  }

  // ---------- DAY ----------
  if (ks.view === 'day') {
    var ws = window.__kalStartOfWeek(ks.anchor);
    var today = new Date(); today.setHours(0,0,0,0);

    // Day strip
    var stripHtml = '<div class="day-strip">';
    for (var i = 0; i < 7; i++) {
      var d = new Date(ws); d.setDate(ws.getDate() + i);
      var isActive = d.getTime() === ks.dayDate.getTime();
      var evs = window.__kalActivitiesOnDate(d);
      var dotsHtml = '<div class="day-strip-dots">';
      evs.slice(0, 3).forEach(function(e) {
        var cc = window.__kalCatClass(e.a);
        var cls = (cc === 'eltern-kind' || cc === 'kreativ') ? '' : (cc === 'bewegung' ? 'sage' : 'musik');
        dotsHtml += '<span class="d ' + cls + '"></span>';
      });
      dotsHtml += '</div>';
      stripHtml += '<button class="day-strip-day' + (isActive ? ' active' : '') + '" onclick="window.__kalSetDay(\'' + d.toISOString() + '\')">'
        + '<div class="day-strip-label">' + dayLabels[i] + '</div>'
        + '<div class="day-strip-date">' + String(d.getDate()).padStart(2,'0') + '</div>'
        + dotsHtml
        + '</button>';
    }
    stripHtml += '</div>';

    // Build room columns from filter or all distinct rooms found in today's events
    var todayEvs = window.__kalActivitiesOnDate(ks.dayDate);
    var roomMap = {};
    todayEvs.forEach(function(e) {
      var rid = e.a.roomId || '_none_';
      var rname = e.a.roomName || (e.a.roomId ? 'Raum ' + e.a.roomId : 'Ohne Raum');
      roomMap[rid] = rname;
    });
    var roomIds = Object.keys(roomMap);
    if (roomIds.length === 0) roomIds = ['_none_'];
    var roomCount = Math.min(3, roomIds.length);
    if (roomCount < 3) {
      // pad to 3 columns visually
      while (roomIds.length < 3) roomIds.push('_pad_' + roomIds.length);
    }

    // Determine hour range
    var minH = 9, maxH = 18;
    todayEvs.forEach(function(e) {
      var st = e.slot.startTime || '09:00';
      var et = e.slot.endTime || st;
      var sH = parseInt(st.slice(0,2),10);
      var eH = parseInt(et.slice(0,2),10) + (parseInt(et.slice(3,5),10) > 0 ? 1 : 0);
      if (sH < minH) minH = Math.max(7, sH);
      if (eH > maxH) maxH = Math.min(22, eH);
    });
    var hourCount = maxH - minH;
    var slotPx = 80;

    // Head
    var head = '<div class="day-grid"><div class="day-grid-head"><div></div>';
    roomIds.slice(0, roomCount > 0 ? Math.max(roomCount, roomIds.length) : 1).forEach(function(rid) {
      if (rid.indexOf('_pad_') === 0) {
        head += '<div><span class="room-label">—</span><span class="room-sub">frei</span></div>';
      } else {
        head += '<div><span class="room-label">' + (window.escapeHtml ? window.escapeHtml(roomMap[rid] || rid) : roomMap[rid]) + '</span><span class="room-sub">Heute</span></div>';
      }
    });
    head += '</div>';
    // body
    var body = '<div class="day-grid-body" style="grid-template-columns:80px repeat(' + roomIds.length + ', 1fr)">';
    var timeCol = '<div class="day-time-col">';
    for (var h = 0; h < hourCount; h++) {
      timeCol += '<div class="day-time-slot">' + String(minH + h).padStart(2,'0') + ':00</div>';
    }
    timeCol += '</div>';
    body += timeCol;

    roomIds.forEach(function(rid) {
      var col = '<div class="day-room-col">';
      for (var h = 0; h < hourCount; h++) {
        var hr = String(minH + h).padStart(2,'0') + ':00';
        col += '<div class="day-hour" onclick="window.__kalCellClick(\'' + ks.dayDate.toISOString() + '\',\'' + hr + '\')"></div>';
      }
      if (rid.indexOf('_pad_') !== 0) {
        var roomEvs = todayEvs.filter(function(e) { return (e.a.roomId || '_none_') === rid; });
        var blocks = roomEvs.map(function(e) {
          var st = e.slot.startTime || '09:00';
          var et = e.slot.endTime || st;
          var sH = parseInt(st.slice(0,2),10) + parseInt(st.slice(3,5),10)/60;
          var eH = parseInt(et.slice(0,2),10) + parseInt(et.slice(3,5),10)/60;
          if (eH <= sH) eH = sH + 1;
          return { a: e.a, top: (sH - minH) * slotPx, height: Math.max(40, (eH - sH) * slotPx - 4), startTime: st, endTime: et };
        });
        blocks.forEach(function(ev) {
          var booked = window.__kalCountBooked(ev.a);
          var cap = ev.a.capacity || 0;
          var isFull = cap > 0 && booked >= cap;
          var cls = ['day-event', window.__kalCatClass(ev.a)];
          if (isFull) cls.push('full');
          var titleEsc = (window.escapeHtml || function(x){ return x; })(ev.a.title || 'Kurs');
          col += '<div class="' + cls.join(' ') + '" style="top:' + ev.top + 'px;height:' + ev.height + 'px;" onclick="event.stopPropagation();window.viewCourseDetail(\'' + ev.a.id + '\')">'
            + '<div class="day-event-title">' + titleEsc + '</div>'
            + '<div class="day-event-time">' + ev.startTime + ' – ' + ev.endTime + '</div>'
            + '<div class="day-event-meta">' + (isFull ? 'ausgebucht' : (booked + '/' + cap + ' Pl' + 'ä' + 'tze')) + '</div>'
            + '</div>';
        });
      }
      col += '</div>';
      body += col;
    });
    body += '</div></div>';
    document.getElementById('phKalDay').innerHTML = stripHtml + head + body;
    if (subEl) subEl.textContent = todayEvs.length + ' Termin' + (todayEvs.length === 1 ? '' : 'e') + ' an diesem Tag';
  }

  // ---------- MONTH ----------
  if (ks.view === 'month') {
    var first = new Date(ks.anchor.getFullYear(), ks.anchor.getMonth(), 1);
    var firstDow = (first.getDay() + 6) % 7;
    var gridStart = new Date(first); gridStart.setDate(first.getDate() - firstDow);
    var today = new Date(); today.setHours(0,0,0,0);

    var html = '<div class="month-grid"><div class="month-head">';
    dayLabelsLong.forEach(function(l) { html += '<div>' + l + '</div>'; });
    html += '</div><div class="month-body">';

    var monthCount = 0;
    for (var c = 0; c < 42; c++) {
      var d = new Date(gridStart); d.setDate(gridStart.getDate() + c);
      var inMonth = d.getMonth() === ks.anchor.getMonth();
      var isToday = d.getTime() === today.getTime();
      var isWeekend = ((d.getDay() + 6) % 7) >= 5;
      var classes = ['month-day'];
      if (!inMonth) classes.push('other-month');
      if (isToday) classes.push('today');
      if (isWeekend) classes.push('weekend');

      var evs = window.__kalActivitiesOnDate(d);
      evs.sort(function(x, y) { return (x.slot.startTime || '').localeCompare(y.slot.startTime || ''); });
      if (inMonth) monthCount += evs.length;

      var maxShow = 3;
      var evHtml = evs.slice(0, maxShow).map(function(e) {
        var st = (e.slot.startTime || '').slice(0,5);
        var titleEsc = (window.escapeHtml || function(x){ return x; })(e.a.title || 'Kurs');
        return '<div class="month-evt ' + window.__kalCatClass(e.a) + '" onclick="event.stopPropagation();window.viewCourseDetail(\'' + e.a.id + '\')"><span style="opacity:.7;margin-right:3px">' + st + '</span>' + titleEsc + '</div>';
      }).join('');
      if (evs.length > maxShow) evHtml += '<div class="month-more">+' + (evs.length - maxShow) + ' weitere</div>';

      html += '<div class="' + classes.join(' ') + '" onclick="window.__kalSetDay(\'' + d.toISOString() + '\')">'
        + '<div class="month-day-num">' + d.getDate() + '</div>'
        + evHtml
        + '</div>';
    }
    html += '</div></div>';
    document.getElementById('phKalMonth').innerHTML = html;
    if (subEl) subEl.textContent = monthCount + ' Termin' + (monthCount === 1 ? '' : 'e') + ' in diesem Monat';
  }
};

window.__kalNav = function(dir) {
  var ks = window.__kalState; if (!ks) return;
  var d = new Date(ks.anchor);
  if (ks.view === 'week') d.setDate(d.getDate() + dir * 7);
  else if (ks.view === 'day') {
    d = new Date(ks.dayDate); d.setDate(d.getDate() + dir);
    ks.dayDate = d; ks.anchor = d;
    return window.__renderKalender();
  }
  else d.setMonth(d.getMonth() + dir);
  ks.anchor = d;
  window.__renderKalender();
};
window.__kalToday = function() {
  if (!window.__kalState) return;
  var t = new Date(); t.setHours(0,0,0,0);
  window.__kalState.anchor = t;
  window.__kalState.dayDate = new Date(t);
  window.__renderKalender();
};
window.__kalSetView = function(v) {
  if (!window.__kalState) return;
  window.__kalState.view = v;
  window.__renderKalender();
};
window.__kalSetDay = function(iso) {
  if (!window.__kalState) return;
  var d = new Date(iso); d.setHours(0,0,0,0);
  window.__kalState.dayDate = d;
  window.__kalState.anchor = d;
  window.__kalState.view = 'day';
  window.__renderKalender();
};
window.__kalSetRoom = function(rid) {
  if (!window.__kalState) return;
  window.__kalState.room = rid || '';
  window.__renderKalender();
};
window.__kalCellClick = function(iso, hr) {
  // Create a course at this slot — pre-fill kurs creator if possible
  if (typeof window.openKursCreatorV2 === 'function') {
    var d = new Date(iso);
    var dayKeys = ['MO','TU','WE','TH','FR','SA','SU'];
    var dKey = dayKeys[(d.getDay() + 6) % 7];
    window.openKursCreatorV2({ prefill: { schedule: { slots: [{ day: dKey, startTime: hr, endTime: '' }] } } });
  }
};'''

m = old_loader_pat.search(src)
if not m:
    print('FAIL: kalender loader pattern not found'); exit(1)
src = src[:m.start()] + NEW_LOADER + src[m.end():]
print('OK: kalender loader replaced (week/day/month + lanes + room filter + cell-click + ICS)')

# Reset section-loaded flag block (we want it to re-run on first nav after reload)
# But window.sectionLoaded persists per-page; on hard refresh it's empty anyway.

open(fp, 'w', encoding='utf-8').write(src)
print('All patches applied.')
