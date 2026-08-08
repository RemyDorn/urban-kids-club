"""Replace the simple Kurs-Detail modal with a full polished page that
matches kurs-detail-preview.html.

Steps:
  1) Inject CSS (breadcrumb, detail-hero, detail-tabs, detail-grid,
     termin-item, info-row, auslastung-big, teilnehmer-mini, quick-actions).
  2) Add a new <div class="section" data-section="kursdetail" hidden>
     after the kalender section.
  3) Rewrite window.viewCourseDetail to navigate to that section and
     populate everything from state (activities + bookings).
"""

import re

fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(fp, 'r', encoding='utf-8').read()

# ============================================================
# 1) Inject CSS
# ============================================================
CSS = """
/* ============================================================
   KURS-DETAIL — polished page matching kurs-detail-preview
   ============================================================ */
.breadcrumb { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--muted-2); margin-bottom:14px; font-family:var(--font-body); }
.breadcrumb a { color:var(--muted-2); text-decoration:none; transition:color var(--motion-fast); cursor:pointer; }
.breadcrumb a:hover { color:var(--ink); }
.breadcrumb-sep { opacity:0.5; }
.breadcrumb-current { color:var(--ink); font-weight:500; }

.detail-hero { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:24px 26px; margin-bottom:18px; position:relative; overflow:hidden; }
.detail-hero::before { content:''; position:absolute; top:-40px; right:-40px; width:160px; height:160px; background:radial-gradient(circle, rgba(204,137,94,0.12), transparent 70%); pointer-events:none; }
.detail-hero-row { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; flex-wrap:wrap; position:relative; z-index:1; }
.detail-hero-left { flex:1; min-width:240px; }
.detail-title { font-family:var(--font-heading); font-weight:700; font-size:38px; color:var(--ink); letter-spacing:-0.01em; line-height:1.05; margin-bottom:10px; }
.detail-title em { font-family:var(--font-accent); font-style:italic; font-weight:500; color:var(--primary); letter-spacing:0; }
.detail-meta { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:13px; color:var(--ink-2); margin-bottom:6px; }
.detail-meta .sep { color:var(--muted); opacity:0.6; }
.detail-actions { display:flex; gap:8px; flex-wrap:wrap; }

.detail-tabs { display:flex; gap:2px; border-bottom:1px solid var(--border); margin-bottom:22px; overflow-x:auto; scrollbar-width:none; }
.detail-tabs::-webkit-scrollbar { display:none; }
.detail-tab { background:transparent; border:none; font-family:var(--font-body); font-size:13.5px; font-weight:500; color:var(--muted-2); padding:11px 16px; cursor:pointer; position:relative; white-space:nowrap; transition:color var(--motion-fast); display:inline-flex; align-items:center; gap:6px; letter-spacing:0.01em; }
.detail-tab:hover { color:var(--ink); }
.detail-tab.active { color:var(--ink); font-weight:600; }
.detail-tab.active::after { content:''; position:absolute; left:0; right:0; bottom:-1px; height:2px; background:var(--primary); border-radius:2px; }
.detail-tab .tab-count { font-size:11px; font-variant-numeric:tabular-nums; background:var(--surface-alt); padding:2px 7px; border-radius:var(--radius-pill); color:var(--muted-2); font-weight:600; }
.detail-tab.active .tab-count { background:var(--primary-tint); color:var(--primary-hover); }

.detail-grid { display:grid; grid-template-columns:1.7fr 1fr; gap:18px; margin-bottom:22px; }

.description-text { font-size:14px; color:var(--ink); line-height:1.65; white-space:pre-wrap; }
.description-text p { margin-bottom:12px; }
.description-text p:last-child { margin-bottom:0; }

.termin-item { display:flex; align-items:center; gap:14px; padding:14px 0; border-bottom:1px solid var(--border); }
.termin-item:last-child { border-bottom:none; padding-bottom:0; }
.termin-item:first-child { padding-top:0; }
.termin-date { min-width:48px; text-align:center; padding:8px 0; background:var(--bg); border-radius:var(--radius-sm); border:1px solid var(--border); }
.termin-date-day { font-family:var(--font-heading); font-weight:700; font-size:18px; color:var(--ink); line-height:1; }
.termin-date-month { font-size:9.5px; text-transform:uppercase; letter-spacing:0.12em; color:var(--muted); margin-top:2px; font-family:var(--font-heading); font-weight:600; }
.termin-main { flex:1; min-width:0; }
.termin-title { font-family:var(--font-heading); font-weight:600; font-size:14px; color:var(--ink); margin-bottom:2px; }
.termin-sub { font-size:12px; color:var(--muted-2); display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.termin-badge { font-size:10.5px; font-weight:600; padding:2px 8px; border-radius:var(--radius-pill); letter-spacing:0.04em; text-transform:uppercase; }
.termin-badge.next { background:var(--primary-tint); color:var(--primary-hover); }
.termin-badge.done { background:var(--sage-tint); color:var(--sage-deep); }
.termin-item.is-done .termin-date,
.termin-item.is-done .termin-main { opacity:0.6; }

.info-row { display:flex; align-items:flex-start; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border); gap:12px; }
.info-row:last-child { border-bottom:none; padding-bottom:0; }
.info-row:first-child { padding-top:0; }
.info-label { font-size:11.5px; color:var(--muted-2); font-family:var(--font-heading); font-weight:600; text-transform:uppercase; letter-spacing:0.1em; min-width:90px; }
.info-value { font-size:13px; color:var(--ink); text-align:right; font-weight:500; font-variant-numeric:tabular-nums; }

.auslastung-big { text-align:center; padding:10px 0 4px; }
.auslastung-big-value { font-family:var(--font-heading); font-weight:700; font-size:46px; color:var(--ink); line-height:1; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; }
.auslastung-big-value em { font-family:var(--font-accent); font-style:italic; font-weight:400; font-size:26px; color:var(--primary); margin-left:2px; }
.auslastung-big-sub { font-size:12px; color:var(--muted-2); margin-top:6px; }
.auslastung-bar-big { height:10px; background:rgba(60,33,36,0.08); border-radius:999px; overflow:hidden; margin:14px 0 6px; }
.auslastung-bar-big > div { height:100%; background:var(--primary); border-radius:999px; transition:width var(--motion-base); }

.teilnehmer-mini { display:flex; align-items:center; margin-top:14px; }
.teilnehmer-mini .avatar { width:28px; height:28px; border-radius:50%; background:var(--primary-tint); color:var(--primary-hover); display:inline-flex; align-items:center; justify-content:center; font-family:var(--font-heading); font-weight:700; font-size:11px; border:2px solid var(--surface); margin-left:-6px; letter-spacing:0.02em; }
.teilnehmer-mini .avatar:first-child { margin-left:0; }
.teilnehmer-mini .avatar.sage { background:var(--sage-tint); color:var(--sage-deep); }
.teilnehmer-mini .avatar.taupe { background:rgba(196,153,128,0.2); color:var(--muted-2); }
.teilnehmer-mini .more { font-size:12px; color:var(--muted-2); margin-left:10px; font-weight:500; }

.quick-actions { display:flex; flex-direction:column; gap:6px; }
.quick-action { display:flex; align-items:center; gap:10px; width:100%; padding:10px 12px; background:transparent; border:1px solid var(--border); border-radius:var(--radius-sm); font-family:var(--font-body); font-size:13px; font-weight:500; color:var(--ink); cursor:pointer; text-align:left; transition:background var(--motion-fast), border-color var(--motion-fast); }
.quick-action:hover { background:var(--surface-alt); border-color:var(--border-strong); }
.quick-action-icon { width:28px; height:28px; border-radius:var(--radius-sm); background:var(--primary-tint); color:var(--primary-hover); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
.quick-action-icon.sage { background:var(--sage-tint); color:var(--sage-deep); }
.quick-action-icon.signal { background:var(--signal-tint); color:var(--signal); }
.quick-action-sub { font-size:11px; color:var(--muted-2); margin-top:1px; font-weight:400; }

@media (max-width: 1100px) { .detail-grid { grid-template-columns:1fr; } }
@media (max-width: 640px) { .detail-title { font-size:30px; } }

.kdtab-pane[hidden] { display:none; }
.kdtab-pane .empty-state { padding:48px 32px; text-align:center; color:var(--muted-2); }
.kdtab-pane .empty-state-title { font-family:var(--font-accent); font-style:italic; font-size:24px; color:var(--primary); margin-bottom:8px; }
"""

m_style = re.search(r'</style>', src)
if not m_style:
    print('FAIL: </style> not found'); exit(1)
src = src[:m_style.start()] + CSS + "\n" + src[m_style.start():]
print('OK: kurs-detail CSS injected')

# ============================================================
# 2) Add the new section <div data-section="kursdetail">
#    Insert AFTER the kalender section (before kursbloecke).
# ============================================================
SECTION = '''<div class="section" data-section="kursdetail" hidden>
        <div class="page">

      <!-- BREADCRUMB -->
      <div class="breadcrumb">
        <a onclick="window.showSection('kurse')">Kurse</a>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current" id="phKdBreadcrumb">—</span>
      </div>

      <!-- HERO -->
      <div class="detail-hero">
        <div class="detail-hero-row">
          <div class="detail-hero-left">
            <h1 class="detail-title" id="phKdTitle">— <em>—</em></h1>
            <div class="detail-meta" id="phKdMetaRow1">
              <span class="kategorie-tag" id="phKdKategorie">—</span>
              <span class="sep">·</span>
              <span id="phKdAge">—</span>
              <span class="sep">·</span>
              <span id="phKdSchedule">—</span>
              <span class="sep">·</span>
              <span class="pill pill-ok" id="phKdStatus" style="margin-left:2px;">Aktiv</span>
            </div>
            <div class="detail-meta" id="phKdMetaRow2" style="margin-top:4px;">
              <span id="phKdSessionsLabel">—</span>
              <span class="sep">·</span>
              <span id="phKdPriceLabel">—</span>
              <span class="sep">·</span>
              <span id="phKdLocation">—</span>
            </div>
          </div>
          <div class="detail-actions">
            <button class="btn btn-ghost btn-sm" id="phKdBtnShare" onclick="window.__kdShare()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Teilen
            </button>
            <button class="btn btn-primary btn-sm" id="phKdBtnEdit" onclick="window.__kdEdit()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Bearbeiten
            </button>
          </div>
        </div>
      </div>

      <!-- KPI STATS -->
      <div class="stats">
        <div class="stat">
          <div class="stat-label">Teilnehmer</div>
          <div class="stat-value" id="phKdKpiBooked">— <em>/—</em></div>
          <div class="stat-delta" id="phKdKpiBookedDelta"> </div>
        </div>
        <div class="stat">
          <div class="stat-label">Umsatz · Block</div>
          <div class="stat-value" id="phKdKpiRevenue">— <em>€</em></div>
          <div class="stat-delta" id="phKdKpiRevenueDelta"> </div>
        </div>
        <div class="stat">
          <div class="stat-label">Warteliste</div>
          <div class="stat-value" id="phKdKpiWait">— <em>offen</em></div>
          <div class="stat-delta" id="phKdKpiWaitDelta"> </div>
        </div>
        <div class="stat">
          <div class="stat-label">Stunden</div>
          <div class="stat-value" id="phKdKpiSessions">— <em>/—</em></div>
          <div class="stat-delta" id="phKdKpiSessionsDelta"> </div>
        </div>
      </div>

      <!-- TABS -->
      <div class="detail-tabs" id="phKdTabs" role="tablist">
        <button class="detail-tab active" data-kdtab="overview">Übersicht</button>
        <button class="detail-tab" data-kdtab="bloecke">Kursblöcke <span class="tab-count" id="phKdTabCntBloecke">0</span></button>
        <button class="detail-tab" data-kdtab="teilnehmer">Teilnehmer <span class="tab-count" id="phKdTabCntTeilnehmer">0</span></button>
        <button class="detail-tab" data-kdtab="warteliste">Warteliste <span class="tab-count" id="phKdTabCntWarteliste">0</span></button>
        <button class="detail-tab" data-kdtab="finanzen">Finanzen</button>
        <button class="detail-tab" data-kdtab="settings">Einstellungen</button>
      </div>

      <!-- PANES -->
      <div class="kdtab-pane" data-kdpane="overview">
        <div class="detail-grid">
          <div>
            <div class="card" style="margin-bottom:18px;">
              <div class="card-head">
                <div class="card-title">Die <em>Beschreibung</em></div>
                <a class="card-link" onclick="window.__kdEdit()">Bearbeiten →</a>
              </div>
              <div class="description-text" id="phKdDescription"></div>
            </div>

            <div class="card" style="margin-bottom:18px;">
              <div class="card-head">
                <div class="card-title">Nächste <em>Termine</em></div>
                <a class="card-link" onclick="window.__kdSwitchTab('bloecke')">Alle <span id="phKdAllSessionsCount">0</span> Termine →</a>
              </div>
              <div id="phKdSessionsList"></div>
            </div>

            <div class="card">
              <div class="card-head">
                <div class="card-title">Neueste <em>Buchungen</em></div>
                <a class="card-link" onclick="window.showSection('buchungen')">Alle Buchungen →</a>
              </div>
              <table class="data-table">
                <thead><tr><th>Kunde</th><th>Kind</th><th>Datum</th><th>Betrag</th><th>Zahlung</th></tr></thead>
                <tbody id="phKdBookingsTbody"></tbody>
              </table>
            </div>
          </div>

          <div>
            <div class="card" style="margin-bottom:18px;">
              <div class="card-head"><div class="card-title">Die <em>Auslastung</em></div></div>
              <div class="auslastung-big">
                <div class="auslastung-big-value" id="phKdAuslVal">— <em>/—</em></div>
                <div class="auslastung-big-sub" id="phKdAuslSub">—</div>
              </div>
              <div class="auslastung-bar-big"><div id="phKdAuslBar" style="width:0%;"></div></div>
              <div class="teilnehmer-mini" id="phKdAvatarStrip"></div>
            </div>

            <div class="card" style="margin-bottom:18px;">
              <div class="card-head"><div class="card-title">Im <em>Detail</em></div></div>
              <div>
                <div class="info-row"><div class="info-label">Kursleitung</div><div class="info-value" id="phKdInfoTrainer">—</div></div>
                <div class="info-row"><div class="info-label">Raum</div><div class="info-value" id="phKdInfoRoom">—</div></div>
                <div class="info-row"><div class="info-label">Max. Gruppe</div><div class="info-value" id="phKdInfoMax">—</div></div>
                <div class="info-row"><div class="info-label">Dauer</div><div class="info-value" id="phKdInfoDuration">—</div></div>
                <div class="info-row"><div class="info-label">Start Block</div><div class="info-value" id="phKdInfoStart">—</div></div>
                <div class="info-row"><div class="info-label">Ende Block</div><div class="info-value" id="phKdInfoEnd">—</div></div>
                <div class="info-row"><div class="info-label">Preis</div><div class="info-value" id="phKdInfoPrice">—</div></div>
              </div>
            </div>

            <div class="card">
              <div class="card-head"><div class="card-title">Schnell<em>-Aktionen</em></div></div>
              <div class="quick-actions">
                <button class="quick-action" onclick="window.__kdAddParticipant()">
                  <div class="quick-action-icon">＋</div>
                  <div><div>Teilnehmer hinzufügen</div><div class="quick-action-sub">Eltern einladen oder manuell eintragen</div></div>
                </button>
                <button class="quick-action" onclick="window.__kdAddSession()">
                  <div class="quick-action-icon sage">📅</div>
                  <div><div>Termin hinzufügen</div><div class="quick-action-sub">Zusatz-Stunde oder Nachhol-Termin</div></div>
                </button>
                <button class="quick-action" onclick="window.__kdMessageAll()">
                  <div class="quick-action-icon">✉</div>
                  <div><div>Nachricht an alle</div><div class="quick-action-sub">E-Mail an aktive Teilnehmer</div></div>
                </button>
                <button class="quick-action" onclick="window.__kdTogglePause()">
                  <div class="quick-action-icon signal">⏸</div>
                  <div><div id="phKdPauseLabel">Kurs pausieren</div><div class="quick-action-sub">Verbirgt Kurs im Widget</div></div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="kdtab-pane" data-kdpane="bloecke" hidden><div id="phKdPaneBloecke"></div></div>
      <div class="kdtab-pane" data-kdpane="teilnehmer" hidden><div id="phKdPaneTeilnehmer"></div></div>
      <div class="kdtab-pane" data-kdpane="warteliste" hidden><div id="phKdPaneWarteliste"></div></div>
      <div class="kdtab-pane" data-kdpane="finanzen" hidden><div id="phKdPaneFinanzen"></div></div>
      <div class="kdtab-pane" data-kdpane="settings" hidden><div id="phKdPaneSettings"></div></div>

      </div>  <!-- close .page -->
      </div>  <!-- close section -->'''

# Insert before the kursbloecke section
anchor = '<div class="section" data-section="kursbloecke" hidden>'
if anchor not in src:
    print('FAIL: kursbloecke anchor not found'); exit(1)
src = src.replace(anchor, SECTION + "\n\n" + anchor, 1)
print('OK: kursdetail section inserted before kursbloecke')

# ============================================================
# 3) Replace viewCourseDetail to navigate + fill, and add helpers
# ============================================================
old_view_pat = re.compile(
    r"window\.viewCourseDetail = function\(id\) \{[\s\S]*?\n  \};",
    re.MULTILINE
)

NEW_VIEW = r'''window.viewCourseDetail = function(id) {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === id; });
    if (!a) { alert('Kurs nicht gefunden'); return; }
    window.__kdActiveId = id;
    window.showSection('kursdetail');
    window.__kdRender();
  };

  window.__kdActiveTab = 'overview';

  window.__kdSwitchTab = function(key) {
    window.__kdActiveTab = key;
    document.querySelectorAll('#phKdTabs .detail-tab').forEach(function(b) {
      b.classList.toggle('active', b.dataset.kdtab === key);
    });
    document.querySelectorAll('.kdtab-pane').forEach(function(p) {
      p.hidden = (p.dataset.kdpane !== key);
    });
    if (key !== 'overview') window.__kdRenderTab(key);
  };

  // wire tabs once
  if (!window.__kdTabsWired) {
    document.addEventListener('click', function(e) {
      var t = e.target.closest('#phKdTabs .detail-tab');
      if (!t) return;
      window.__kdSwitchTab(t.dataset.kdtab);
    });
    window.__kdTabsWired = true;
  }

  window.__kdRender = function() {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === window.__kdActiveId; });
    if (!a) return;
    var sched = a.schedule || {};
    var slot = (sched.slots || [])[0] || {};
    var price = (a.pricing && a.pricing[0]) || {};
    var bookings = (s.bookings || []).filter(function(b) {
      return b && b.activityId === a.id && b.status !== 'cancelled' && b.status !== 'refunded';
    });
    var booked = bookings.length;
    var cap = a.capacity || 0;

    // Title — split last word into <em>
    var title = a.title || 'Kurs';
    var parts = title.split(' ');
    var titleHtml;
    if (parts.length >= 2) {
      var last = parts.pop();
      titleHtml = (window.escapeHtml ? window.escapeHtml(parts.join(' ')) : parts.join(' ')) + ' <em>' + (window.escapeHtml ? window.escapeHtml(last) : last) + '</em>';
    } else {
      titleHtml = '<em>' + (window.escapeHtml ? window.escapeHtml(title) : title) + '</em>';
    }
    document.getElementById('phKdTitle').innerHTML = titleHtml;
    document.getElementById('phKdBreadcrumb').textContent = title;

    // Meta row 1
    document.getElementById('phKdKategorie').textContent = a.category || 'Sonstige';
    var ageMin = (a.ageRange && a.ageRange.min != null) ? a.ageRange.min : null;
    var ageMax = (a.ageRange && a.ageRange.max != null) ? a.ageRange.max : null;
    var ageUnit = (a.ageRange && a.ageRange.unit) || 'years';
    var ageLabel = '—';
    if (ageMin != null && ageMax != null) {
      ageLabel = ageMin + '–' + ageMax + ' ' + (ageUnit === 'months' ? 'Mon.' : 'J.');
    }
    document.getElementById('phKdAge').textContent = ageLabel;
    var dayDe = (window.fmtDayCode ? window.fmtDayCode(slot.day) : (slot.day || '—'));
    var schedLabel = dayDe + 's' + (slot.startTime ? ' · ' + slot.startTime.slice(0,5) : '') + (slot.endTime ? '–' + slot.endTime.slice(0,5) : '');
    document.getElementById('phKdSchedule').textContent = schedLabel;
    var statusEl = document.getElementById('phKdStatus');
    if (a.status === 'paused') { statusEl.textContent = 'Pausiert'; statusEl.className = 'pill pill-pending'; }
    else if (a.status === 'archived' || a.status === 'cancelled') { statusEl.textContent = 'Archiviert'; statusEl.className = 'pill'; }
    else { statusEl.textContent = 'Aktiv'; statusEl.className = 'pill pill-ok'; }

    // Meta row 2
    var pkgSize = price.packageSize;
    document.getElementById('phKdSessionsLabel').textContent = (pkgSize ? pkgSize + ' Termine' : 'Laufend') + (sched.startDate ? ' · ' + window.__kdSeason(sched.startDate) : '');
    var amount = price.amount != null ? price.amount : 0;
    document.getElementById('phKdPriceLabel').textContent = window.__kdFmtMoney(amount) + (price.type === 'package' ? ' pro Block' : (price.type === 'subscription' ? ' / Monat' : ''));
    var roomLabel = (window.__kalRoomName ? window.__kalRoomName(a.roomId) : null) || a.roomName || (a.roomId ? 'Raum' : '—');
    document.getElementById('phKdLocation').textContent = roomLabel;

    // KPI Stats
    document.getElementById('phKdKpiBooked').innerHTML = booked + ' <em>/' + cap + '</em>';
    var weekAgo = Date.now() - 7*86400000;
    var bookedThisWeek = bookings.filter(function(b) { return new Date(b.createdAt || 0) >= weekAgo; }).length;
    document.getElementById('phKdKpiBookedDelta').textContent = bookedThisWeek > 0 ? '+' + bookedThisWeek + ' diese Woche' : '—';
    var rev = booked * (price.amount || 0);
    document.getElementById('phKdKpiRevenue').innerHTML = window.__kdFmtMoneyNum(rev) + ' <em>€</em>';
    var paid = bookings.filter(function(b) { return b.paymentStatus === 'paid'; }).length;
    document.getElementById('phKdKpiRevenueDelta').textContent = paid + ' von ' + booked + ' bezahlt';
    document.getElementById('phKdKpiWait').innerHTML = '0 <em>offen</em>';
    document.getElementById('phKdKpiWaitDelta').textContent = a.waitlistEnabled ? 'Warteliste aktiv' : 'Warteliste deaktiviert';

    // Sessions count from schedule (rough)
    var sessTotal = pkgSize || 0;
    var sessDone = 0;
    if (sched.startDate) {
      var st = new Date(sched.startDate);
      var now = new Date();
      // count past slots since startDate weekly
      var dayKeys = ['MO','TU','WE','TH','FR','SA','SU'];
      var sd = (slot.day) ? dayKeys.indexOf(slot.day) : -1;
      if (sd >= 0) {
        var d = new Date(st);
        while (d <= now && sessDone < (sessTotal || 99)) {
          if (((d.getDay() + 6) % 7) === sd && d >= st) sessDone++;
          d.setDate(d.getDate() + 1);
        }
      }
    }
    document.getElementById('phKdKpiSessions').innerHTML = sessDone + ' <em>/' + (sessTotal || '∞') + '</em>';
    document.getElementById('phKdKpiSessionsDelta').textContent = window.__kdNextSessionLabel(a) || '—';

    // Tab counts
    document.getElementById('phKdTabCntBloecke').textContent = sessTotal || (sched.slots || []).length;
    document.getElementById('phKdTabCntTeilnehmer').textContent = booked;
    document.getElementById('phKdTabCntWarteliste').textContent = '0';

    // Description
    var descEl = document.getElementById('phKdDescription');
    if (a.description) {
      var paras = a.description.split(/\n\n+/).map(function(p) {
        return '<p>' + (window.escapeHtml ? window.escapeHtml(p) : p) + '</p>';
      }).join('');
      descEl.innerHTML = paras;
    } else {
      descEl.innerHTML = '<p style="color:var(--muted-2);font-style:italic">Noch keine Beschreibung hinterlegt. Klick "Bearbeiten" oben rechts.</p>';
    }

    // Sessions list
    var sessList = window.__kdComputeSessions(a, 5);
    document.getElementById('phKdAllSessionsCount').textContent = sessTotal || sessList.length;
    var monthsShort = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    var sListEl = document.getElementById('phKdSessionsList');
    if (sessList.length === 0) {
      sListEl.innerHTML = '<div style="padding:24px 0;color:var(--muted-2);text-align:center;font-size:13px">Keine Termine geplant.</div>';
    } else {
      sListEl.innerHTML = sessList.map(function(item, i) {
        var isDone = item.date < new Date();
        var isNext = !isDone && i === sessList.findIndex(function(x){ return x.date >= new Date(); });
        var d = item.date;
        var sub = (slot.startTime || '?').slice(0,5) + (slot.endTime ? '–' + slot.endTime.slice(0,5) : '') + ' · ' + roomLabel;
        return '<div class="termin-item' + (isDone ? ' is-done' : '') + '">'
          + '<div class="termin-date"><div class="termin-date-day">' + d.getDate() + '</div><div class="termin-date-month">' + monthsShort[d.getMonth()] + '</div></div>'
          + '<div class="termin-main"><div class="termin-title">Stunde ' + (i + 1) + (item.label ? ' · ' + item.label : '') + '</div><div class="termin-sub">' + dayDe.slice(0,2) + ', ' + sub + '</div></div>'
          + (isNext ? '<span class="termin-badge next">Nächster</span>' : (isDone ? '<span class="termin-badge done">Erledigt</span>' : ''))
          + '</div>';
      }).join('');
    }

    // Recent bookings
    var sortedB = bookings.slice().sort(function(x, y) {
      return new Date(y.createdAt || 0) - new Date(x.createdAt || 0);
    }).slice(0, 5);
    var tbody = document.getElementById('phKdBookingsTbody');
    if (sortedB.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;color:var(--muted-2);text-align:center">Noch keine Buchungen.</td></tr>';
    } else {
      tbody.innerHTML = sortedB.map(function(b) {
        var paid = b.paymentStatus === 'paid';
        var pillCls = paid ? 'pill-ok' : 'pill-pending';
        var pillTxt = paid ? 'BEZAHLT' : 'OFFEN';
        var when = window.__kdRelTime(b.createdAt);
        var amt = (b.amount != null ? window.__kdFmtMoney(b.amount) : '—');
        return '<tr>'
          + '<td>' + (window.escapeHtml ? window.escapeHtml(b.customerName || b.customer || '—') : (b.customerName || '—')) + '</td>'
          + '<td>' + (window.escapeHtml ? window.escapeHtml(b.childName || '—') : (b.childName || '—')) + '</td>'
          + '<td>' + when + '</td>'
          + '<td>' + amt + '</td>'
          + '<td><span class="pill ' + pillCls + '">' + pillTxt + '</span></td>'
          + '</tr>';
      }).join('');
    }

    // Auslastung
    var pct = cap > 0 ? Math.round(booked / cap * 100) : 0;
    document.getElementById('phKdAuslVal').innerHTML = booked + ' <em>/ ' + cap + '</em>';
    document.getElementById('phKdAuslSub').textContent = pct + ' % · ' + Math.max(0, cap - booked) + ' Plätze frei';
    document.getElementById('phKdAuslBar').style.width = Math.min(100, pct) + '%';

    // Avatar strip
    var avatars = bookings.slice(0, 5).map(function(b, i) {
      var name = b.customerName || b.customer || b.childName || '?';
      var ini = name.charAt(0).toUpperCase();
      var tones = ['', 'sage', 'taupe', '', 'sage'];
      return '<span class="avatar ' + tones[i] + '">' + ini + '</span>';
    }).join('');
    var moreCount = Math.max(0, booked - 5);
    document.getElementById('phKdAvatarStrip').innerHTML = avatars + (moreCount > 0 ? '<span class="more">+ ' + moreCount + ' weitere</span>' : '');

    // Info list
    document.getElementById('phKdInfoTrainer').textContent = a.instructorName || a.trainerName || '—';
    document.getElementById('phKdInfoRoom').textContent = roomLabel;
    document.getElementById('phKdInfoMax').textContent = (a.capacity || '—') + (a.capacity ? ' Plätze' : '');
    var dur = '—';
    if (slot.startTime && slot.endTime) {
      var sm = parseInt(slot.startTime.slice(0,2),10)*60 + parseInt(slot.startTime.slice(3,5),10);
      var em = parseInt(slot.endTime.slice(0,2),10)*60 + parseInt(slot.endTime.slice(3,5),10);
      dur = (em - sm) + ' Minuten';
    }
    document.getElementById('phKdInfoDuration').textContent = dur;
    document.getElementById('phKdInfoStart').textContent = sched.startDate ? window.__kdFmtDateDE(sched.startDate) : '—';
    document.getElementById('phKdInfoEnd').textContent = sched.endDate ? window.__kdFmtDateDE(sched.endDate) : 'offen';
    document.getElementById('phKdInfoPrice').textContent = window.__kdFmtMoney(amount) + (price.type === 'package' ? ' / Block' : '');

    // Pause label
    document.getElementById('phKdPauseLabel').textContent = a.status === 'paused' ? 'Kurs aktivieren' : 'Kurs pausieren';
  };

  // Helpers
  window.__kdFmtMoney = function(n) {
    return (Math.round(Number(n) * 100) / 100).toFixed(2).replace('.', ',') + ' €';
  };
  window.__kdFmtMoneyNum = function(n) {
    return (Math.round(Number(n) * 100) / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  window.__kdFmtDateDE = function(s) {
    if (!s) return '—';
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    return parseInt(m[3],10) + '.' + parseInt(m[2],10) + '.' + m[1];
  };
  window.__kdSeason = function(iso) {
    var m = String(iso).match(/^(\d{4})-(\d{2})/);
    if (!m) return '';
    var month = parseInt(m[2], 10);
    var year = m[1];
    if (month >= 3 && month <= 5) return 'Frühjahr ' + year;
    if (month >= 6 && month <= 8) return 'Sommer ' + year;
    if (month >= 9 && month <= 11) return 'Herbst ' + year;
    return 'Winter ' + year;
  };
  window.__kdRelTime = function(iso) {
    if (!iso) return '—';
    var d = new Date(iso); var now = new Date();
    var diff = Math.floor((now - d) / 86400000);
    if (diff < 0) return window.__kdFmtDateDE(iso);
    if (diff === 0) return 'heute, ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    if (diff === 1) return 'gestern, ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    if (diff < 7) return 'vor ' + diff + ' Tagen';
    return window.__kdFmtDateDE(iso);
  };
  window.__kdNextSessionLabel = function(a) {
    var sessList = window.__kdComputeSessions(a, 1, true);
    if (!sessList.length) return null;
    var d = sessList[0].date;
    var dayLabels = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    return 'Nächste: ' + dayLabels[d.getDay()] + ', ' + window.__kdFmtDateDE(d.toISOString().slice(0,10));
  };
  window.__kdComputeSessions = function(a, max, futureOnly) {
    var sched = a.schedule || {}; var slot = (sched.slots || [])[0] || {};
    if (!slot.day || !sched.startDate) return [];
    var dayKeys = ['MO','TU','WE','TH','FR','SA','SU'];
    var sd = dayKeys.indexOf(slot.day);
    if (sd < 0) return [];
    var startD = new Date(sched.startDate); startD.setHours(0,0,0,0);
    var endD = sched.endDate ? new Date(sched.endDate) : new Date(startD.getTime() + 365*86400000);
    var pkg = (a.pricing && a.pricing[0] && a.pricing[0].packageSize) || 0;
    var sessions = [];
    var d = new Date(startD);
    var iter = 0;
    while (d <= endD && sessions.length < (pkg || 50) && iter < 400) {
      if (((d.getDay() + 6) % 7) === sd) sessions.push({ date: new Date(d), label: '' });
      d.setDate(d.getDate() + 1);
      iter++;
    }
    if (futureOnly) {
      var now = new Date(); now.setHours(0,0,0,0);
      sessions = sessions.filter(function(s) { return s.date >= now; });
    } else {
      // include up to max future + at most 1 past for context
      var now = new Date(); now.setHours(0,0,0,0);
      var future = sessions.filter(function(s){ return s.date >= now; }).slice(0, max - 1);
      var past = sessions.filter(function(s){ return s.date < now; }).slice(-1);
      sessions = past.concat(future);
    }
    return sessions.slice(0, max);
  };

  // Quick-action wrappers
  window.__kdShare = function() {
    var a = (window.dashboardState.activities || []).find(function(x){ return x.id === window.__kdActiveId; });
    if (!a) return;
    var url = location.origin + '/v3#kursdetail-' + a.id;
    if (navigator.share) navigator.share({ title: a.title, url: url }).catch(function(){});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function() {
      if (window.ukcToast) window.ukcToast('Link kopiert');
    });
    else alert(url);
  };
  window.__kdEdit = function() {
    if (typeof window.editCourseQuick === 'function') window.editCourseQuick(window.__kdActiveId);
  };
  window.__kdAddParticipant = function() {
    alert('Teilnehmer hinzufügen — folgt im nächsten Sprint.');
  };
  window.__kdAddSession = function() {
    alert('Zusatz-Termin — folgt im nächsten Sprint.');
  };
  window.__kdMessageAll = function() {
    alert('Nachricht an alle — folgt im nächsten Sprint.');
  };
  window.__kdTogglePause = function() {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === window.__kdActiveId; });
    if (!a) return;
    var newStatus = a.status === 'paused' ? 'active' : 'paused';
    var label = newStatus === 'paused' ? 'Pausieren' : 'Aktivieren';
    var msg = newStatus === 'paused'
      ? 'Den Kurs „' + a.title + '" wirklich pausieren? Er wird im Widget verborgen.'
      : 'Den Kurs „' + a.title + '" wieder aktivieren?';
    var go = function() {
      a.status = newStatus;
      window.__kdRender();
      fetch('/api/activities/' + a.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.token || '') },
        body: JSON.stringify({ status: newStatus }),
      }).then(function(r) {
        if (!r.ok) throw new Error('Server-Fehler');
        if (window.ukcToast) window.ukcToast('Kurs ' + (newStatus === 'paused' ? 'pausiert' : 'aktiviert'));
      }).catch(function() {
        a.status = newStatus === 'paused' ? 'active' : 'paused';
        window.__kdRender();
        alert('Konnte Status nicht ändern.');
      });
    };
    if (typeof window.ukcConfirm === 'function') {
      window.ukcConfirm({ title: label + '?', body: msg, confirmLabel: label }).then(function(ok) { if (ok) go(); });
    } else {
      if (confirm(msg)) go();
    }
  };

  window.__kdRenderTab = function(key) {
    var pane = document.querySelector('[data-kdpane="' + key + '"] > div');
    if (!pane) return;
    var labels = {
      bloecke: 'Kursblöcke',
      teilnehmer: 'Teilnehmer',
      warteliste: 'Warteliste',
      finanzen: 'Finanzen',
      settings: 'Einstellungen',
    };
    pane.innerHTML = '<div class="empty-state"><div class="empty-state-title">' + labels[key] + '</div>'
      + '<div>Detail-Ansicht für „' + labels[key] + '" folgt im nächsten Sprint. '
      + 'Übersicht auf der Hauptseite zeigt schon das Wesentliche.</div></div>';
  };'''

m = old_view_pat.search(src)
if not m:
    print('FAIL: viewCourseDetail pattern not found'); exit(1)
src = src[:m.start()] + NEW_VIEW + src[m.end():]
print('OK: viewCourseDetail rewritten with full-page rendering')

open(fp, 'w', encoding='utf-8').write(src)
print('All patches applied.')
