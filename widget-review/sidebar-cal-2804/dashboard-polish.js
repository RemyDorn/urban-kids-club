/* ============================================================
 * UKC Dashboard · Cross-Page Polish
 * ============================================================
 * 1) Page-Transitions (smooth fade on internal nav)
 * 2) Mini-Kalender in Sidebar (Bottom)
 * 3) Empty-State Auto-Injection bei leeren Tabellen
 * ============================================================ */
(function () {
  if (window.__ukcPolishInjected) return;
  window.__ukcPolishInjected = true;

  // ========================================================
  // FEATURE 1: Page-Transitions
  // ========================================================
  var TRANSITION_MS = 180;

  function wirePageTransitions() {
    document.body.classList.add('ukc-page-fade');

    // Beim Laden: wenn die Session gerade mitten im Fade-Out steckt, sanft reinfaden
    // dashboard-ui.js hat bereits <html>.opacity = 0 gesetzt (synchron, kein Flash)
    if (sessionStorage.getItem('ukc_transitioning') === '1') {
      sessionStorage.removeItem('ukc_transitioning');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          document.documentElement.style.opacity = '';
        });
      });
    } else {
      // Safety: falls ohne Transition geladen, Opacity zurücksetzen
      document.documentElement.style.opacity = '';
    }

    // Interne Navigation abfangen → Fade-Out → navigate
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href], button[onclick]');
      if (!link) return;

      var url = null;
      if (link.tagName === 'A' && link.href) {
        // Nur interne Links
        try {
          var u = new URL(link.href, window.location.origin);
          if (u.origin !== window.location.origin) return;
          if (u.pathname === window.location.pathname) return; // gleiche Seite
          // Skip Download-Links (wie .ics)
          if (link.hasAttribute('download')) return;
          if (u.pathname.endsWith('.ics') || u.pathname.endsWith('.pdf')) return;
          url = u.pathname + u.search + u.hash;
        } catch (err) { return; }
      } else if (link.tagName === 'BUTTON' && link.getAttribute('onclick')) {
        var m = link.getAttribute('onclick').match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (!m) return;
        url = m[1];
        if (!url.startsWith('/')) return; // nur interne
        if (url === window.location.pathname) return;
      }

      if (!url) return;

      e.preventDefault();
      e.stopPropagation();
      navigateWithFade(url);
    }, true); // capture, damit wir vor dashboard-ui.js feuern können
  }

  function navigateWithFade(url) {
    sessionStorage.setItem('ukc_transitioning', '1');
    // Setze <html>.opacity direkt — body-Klasse reicht nicht immer gegen alle Overlays
    document.documentElement.style.transition = 'opacity ' + TRANSITION_MS + 'ms ease-out';
    document.documentElement.style.opacity = '0';
    setTimeout(function () {
      window.location.href = url;
    }, TRANSITION_MS);
  }

  // Programmtisch verfügbar machen — andere Scripts können auch faden
  window.ukcNavigateFade = navigateWithFade;

  // ========================================================
  // FEATURE 2: Mini-Kalender in Sidebar — wired to v3 state
  // ========================================================
  var MC_MONTH_NAMES = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  var mcState = (function () {
    var n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  })();

  // Count real activity-events on a date via v3-state
  function mcEventCount(date) {
    if (typeof window.__kalActivitiesOnDate !== 'function') return 0;
    try {
      var evs = window.__kalActivitiesOnDate(date);
      return Array.isArray(evs) ? evs.length : 0;
    } catch (e) { return 0; }
  }

  function mcGoToV3Calendar(targetDate) {
    if (typeof window.showSection === 'function') {
      window.showSection('kalender');
      // Falls ein Datum übergeben wurde: in v3-Calendar darauf springen
      if (targetDate && typeof window.__kalSetDay === 'function') {
        try { window.__kalSetDay(targetDate.toISOString()); } catch (e) {}
      } else if (!targetDate && typeof window.__kalToday === 'function') {
        try { window.__kalToday(); } catch (e) {}
      }
    } else {
      // Fallback: Hash-Route
      window.location.hash = '#kalender';
    }
  }

  function buildMiniCalHtml() {
    var year = mcState.year, monthIdx = mcState.month;
    var label = MC_MONTH_NAMES[monthIdx] + ' ' + year;
    var daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    var firstDow = (new Date(year, monthIdx, 1).getDay() + 6) % 7; // Mo=0
    var today = new Date(); today.setHours(0,0,0,0);

    var dayLabels = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
    var cells = [];
    for (var i = 0; i < firstDow; i++) {
      cells.push('<span class="mc-day mc-empty"></span>');
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var dt = new Date(year, monthIdx, d);
      var isToday = dt.getTime() === today.getTime();
      var classes = 'mc-day';
      if (isToday) classes += ' mc-today';
      var n = Math.min(mcEventCount(dt), 3);
      var dots = '';
      if (n > 0) {
        for (var j = 0; j < n; j++) dots += '<span class="mc-dot"></span>';
        dots = '<span class="mc-dots">' + dots + '</span>';
      }
      cells.push('<button class="' + classes + '" data-day="' + d + '">' + d + dots + '</button>');
    }

    return '<div class="mc-head">' +
        '<button class="mc-nav" data-nav="prev" aria-label="Voriger Monat">‹</button>' +
        '<div class="mc-label">' + label + '</div>' +
        '<button class="mc-nav" data-nav="next" aria-label="Nächster Monat">›</button>' +
      '</div>' +
      '<div class="mc-grid">' +
        dayLabels.map(function (l) { return '<span class="mc-dl">' + l + '</span>'; }).join('') +
        cells.join('') +
      '</div>' +
      '<div class="mc-foot">' +
        '<button class="mc-foot-btn" data-action="today">Heute</button>' +
        '<button class="mc-foot-btn mc-foot-primary" data-action="open">Kalender öffnen</button>' +
      '</div>';
  }

  function bindMiniCal(box) {
    box.querySelectorAll('.mc-day').forEach(function (btn) {
      if (btn.classList.contains('mc-empty')) return;
      btn.addEventListener('click', function () {
        var day = parseInt(btn.dataset.day, 10);
        if (!day) return;
        var target = new Date(mcState.year, mcState.month, day);
        mcGoToV3Calendar(target);
      });
    });
    var tBtn = box.querySelector('[data-action="today"]');
    if (tBtn) tBtn.addEventListener('click', function () {
      var t = new Date();
      mcState.year = t.getFullYear();
      mcState.month = t.getMonth();
      refreshMiniCal();
      mcGoToV3Calendar(null);
    });
    var oBtn = box.querySelector('[data-action="open"]');
    if (oBtn) oBtn.addEventListener('click', function () {
      mcGoToV3Calendar(null);
    });
    box.querySelectorAll('.mc-nav').forEach(function (b) {
      b.addEventListener('click', function () {
        var dir = b.dataset.nav === 'prev' ? -1 : 1;
        var ny = mcState.year, nm = mcState.month + dir;
        if (nm < 0) { nm = 11; ny -= 1; }
        if (nm > 11) { nm = 0; ny += 1; }
        mcState.year = ny; mcState.month = nm;
        refreshMiniCal();
      });
    });
  }

  function refreshMiniCal() {
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    var box = sidebar.querySelector('.ukc-mini-cal');
    if (!box) return;
    box.innerHTML = buildMiniCalHtml();
    bindMiniCal(box);
  }

  function renderMiniCal() {
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    if (sidebar.querySelector('.ukc-mini-cal')) return; // nur 1x

    var box = document.createElement('div');
    box.className = 'ukc-mini-cal';
    box.innerHTML = buildMiniCalHtml();

    var footer = sidebar.querySelector('.sidebar-footer');
    if (footer) sidebar.insertBefore(box, footer);
    else sidebar.appendChild(box);

    bindMiniCal(box);

    // Activities laden asynchron — nach erstem Mount mehrfach neu rendern,
    // bis dashboardState.activities verfügbar ist (max 8s).
    var tries = 0;
    var poll = setInterval(function () {
      tries += 1;
      var s = window.dashboardState;
      var hasActs = s && Array.isArray(s.activities) && s.activities.length > 0;
      // Auch wenn 0 Activities geladen sind: nach 1.5s nicht weiter pollen
      if (hasActs || tries >= 16) {
        refreshMiniCal();
        clearInterval(poll);
      }
    }, 500);
  }

  // ========================================================
  // FEATURE 3: Empty-State Auto-Injection
  // ========================================================
  function injectEmptyStates() {
    var tables = document.querySelectorAll('.data-table, table.data-table');
    tables.forEach(function (table) {
      var tbody = table.querySelector('tbody');
      if (!tbody) return;
      observeEmpty(tbody, table);
    });
  }

  function observeEmpty(tbody, table) {
    function check() {
      var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
      // Ignoriere schon gerenderten empty-state
      var real = rows.filter(function (r) { return !r.classList.contains('ukc-empty-row'); });
      var visible = real.filter(function (r) {
        var cs = window.getComputedStyle(r);
        return cs.display !== 'none';
      });

      var existingEmpty = tbody.querySelector('.ukc-empty-row');
      if (visible.length === 0 && real.length > 0) {
        // Es gibt Rows, aber alle sind gefiltert weg
        if (!existingEmpty) {
          var tr = document.createElement('tr');
          tr.className = 'ukc-empty-row';
          // Anzahl Spalten herausfinden (aus thead)
          var headRow = table.querySelector('thead tr');
          var colspan = headRow ? headRow.children.length : 4;
          tr.innerHTML = '<td colspan="' + colspan + '">' +
            '<div class="ukc-empty-state">' +
              '<div class="ukc-empty-icon">🔎</div>' +
              '<div class="ukc-empty-title">Keine Treffer</div>' +
              '<div class="ukc-empty-sub">Versuche den Filter zurückzusetzen oder den Suchbegriff zu ändern.</div>' +
              '<button class="ukc-empty-reset">Filter zurücksetzen</button>' +
            '</div>' +
          '</td>';
          tbody.appendChild(tr);
          tr.querySelector('.ukc-empty-reset').addEventListener('click', function () {
            // Filter-Tabs "Alle" setzen (wenn vorhanden)
            var all = document.querySelector('.filter-tab, .filter-tabs button');
            if (all) all.click();
            // Search-Input leeren
            var search = document.querySelector('.topbar input[type="search"], .topbar .search input');
            if (search) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
            if (typeof window.ukcToast === 'function') window.ukcToast('Filter zurückgesetzt', 'info', 1400);
          });
        }
      } else if (existingEmpty) {
        existingEmpty.remove();
      }
    }

    var mo = new MutationObserver(function () { check(); });
    mo.observe(tbody, { attributes: true, childList: true, subtree: true, attributeFilter: ['style', 'class'] });
    // Initial check nach kurzer Verzögerung (nach anderen Filter-Scripts)
    setTimeout(check, 200);
  }

  // ========================================================
  // STYLES
  // ========================================================
  var css = document.createElement('style');
  css.textContent = [
    // Page-Transitions
    '.ukc-page-fade { transition: opacity ' + TRANSITION_MS + 'ms ease-out; }',
    '.ukc-page-fade-out { opacity: 0 !important; }',
    '.ukc-page-fade-in { opacity: 0 !important; }',

    // Mini-Kalender in Sidebar
    '.ukc-mini-cal {',
    '  margin: 16px 6px 10px;',
    '  padding: 14px 12px 10px;',
    '  background: rgba(255,239,225,0.04);',
    '  border: 1px solid rgba(255,239,225,0.06);',
    '  border-radius: 10px;',
    '  font-family: "Inter", sans-serif;',
    '}',
    '.mc-head {',
    '  display: flex; justify-content: space-between; align-items: center;',
    '  margin-bottom: 10px;',
    '}',
    '.mc-label {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 12px; letter-spacing: 0.08em;',
    '  color: rgba(255,239,225,0.9); text-transform: uppercase;',
    '}',
    '.mc-nav {',
    '  width: 22px; height: 22px; border-radius: 5px;',
    '  background: transparent; border: none; cursor: pointer;',
    '  color: rgba(255,239,225,0.5); font-size: 14px; line-height: 1;',
    '  transition: all .14s;',
    '}',
    '.mc-nav:hover { background: rgba(255,239,225,0.08); color: #FFEFE1; }',
    '.mc-grid {',
    '  display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px;',
    '}',
    '.mc-dl {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 9px; letter-spacing: 0.1em;',
    '  color: rgba(255,239,225,0.35); text-align: center;',
    '  padding: 4px 0 6px;',
    '}',
    '.mc-day {',
    '  aspect-ratio: 1; background: transparent; border: none;',
    '  font-family: "Inter", sans-serif; font-weight: 500;',
    '  font-size: 10.5px; font-variant-numeric: tabular-nums;',
    '  color: rgba(255,239,225,0.6);',
    '  border-radius: 5px; cursor: pointer;',
    '  position: relative; padding: 0;',
    '  transition: all .14s;',
    '  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;',
    '}',
    '.mc-day:hover { background: rgba(255,239,225,0.1); color: #FFEFE1; }',
    '.mc-day.mc-empty { cursor: default; pointer-events: none; }',
    '.mc-day.mc-today {',
    '  background: #CC895E; color: #FFEFE1;',
    '  font-weight: 700;',
    '}',
    '.mc-day.mc-today:hover { background: #B8784F; }',
    '.mc-dots { display: flex; gap: 1.5px; margin-top: -1px; }',
    '.mc-dot { width: 3px; height: 3px; border-radius: 50%; background: #CC895E; display: block; }',
    '.mc-day.mc-today .mc-dot { background: #FFEFE1; }',
    '.mc-foot {',
    '  display: flex; gap: 6px; margin-top: 10px;',
    '  padding-top: 10px; border-top: 1px solid rgba(255,239,225,0.06);',
    '}',
    '.mc-foot-btn {',
    '  flex: 1; background: transparent;',
    '  border: 1px solid rgba(255,239,225,0.12); border-radius: 999px;',
    '  padding: 6px 10px; cursor: pointer;',
    '  font-family: "Inter", sans-serif; font-size: 10.5px; font-weight: 600;',
    '  color: rgba(255,239,225,0.8);',
    '  transition: all .14s;',
    '}',
    '.mc-foot-btn:hover { background: rgba(255,239,225,0.08); color: #FFEFE1; }',
    '.mc-foot-primary { background: #CC895E; border-color: #CC895E; color: #FFEFE1; }',
    '.mc-foot-primary:hover { background: #B8784F; border-color: #B8784F; color: #FFEFE1; }',

    // Empty-State
    '.ukc-empty-state {',
    '  text-align: center; padding: 36px 20px;',
    '  display: flex; flex-direction: column; align-items: center; gap: 8px;',
    '  font-family: "Inter", sans-serif;',
    '}',
    '.ukc-empty-icon { font-size: 34px; margin-bottom: 4px; opacity: 0.55; }',
    '.ukc-empty-title {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 18px; color: #3C2124; letter-spacing: 0.02em;',
    '}',
    '.ukc-empty-sub { font-size: 13px; color: #A78776; max-width: 320px; line-height: 1.5; }',
    '.ukc-empty-reset {',
    '  margin-top: 8px; padding: 8px 16px; border-radius: 999px;',
    '  background: #CC895E; color: #FFEFE1; border: none; cursor: pointer;',
    '  font-family: inherit; font-size: 12px; font-weight: 600;',
    '  transition: background .14s;',
    '}',
    '.ukc-empty-reset:hover { background: #B8784F; }',

    // Column-Sorting
    '.data-table thead th.ukc-sortable {',
    '  cursor: pointer; user-select: none; position: relative;',
    '  padding-right: 24px !important;',
    '  transition: color .14s;',
    '}',
    '.data-table thead th.ukc-sortable:hover { color: #CC895E !important; }',
    '.data-table thead th.ukc-sortable::after {',
    '  content: "↕"; position: absolute; right: 8px; top: 50%;',
    '  transform: translateY(-50%); opacity: 0.3; font-size: 10px;',
    '  transition: opacity .14s;',
    '}',
    '.data-table thead th.ukc-sortable:hover::after { opacity: 0.7; }',
    '.data-table thead th.ukc-sortable.sort-asc::after {',
    '  content: "↑"; opacity: 1; color: #CC895E;',
    '}',
    '.data-table thead th.ukc-sortable.sort-desc::after {',
    '  content: "↓"; opacity: 1; color: #CC895E;',
    '}',

    // Back-Chip
    '.ukc-back-chip {',
    '  display: inline-flex; align-items: center; gap: 6px;',
    '  padding: 6px 12px; border-radius: 999px;',
    '  background: rgba(60,33,36,0.06); color: #5E3D3F;',
    '  border: none; cursor: pointer;',
    '  font-family: "Inter", sans-serif; font-size: 12px; font-weight: 500;',
    '  transition: all .14s;',
    '  white-space: nowrap;',
    '}',
    '.ukc-back-chip:hover { background: rgba(204,137,94,0.14); color: #3C2124; }',
    '.ukc-back-chip .bc-arrow { font-weight: 700; }',
    '.ukc-back-chip strong { font-weight: 600; color: #3C2124; }',

    // Help-Hint
    '.ukc-help-hint {',
    '  display: inline-flex; align-items: center; justify-content: center;',
    '  width: 13px; height: 13px; border-radius: 50%;',
    '  background: rgba(60,33,36,0.1); color: #A78776;',
    '  font-family: "Inter", sans-serif; font-weight: 700; font-size: 9px;',
    '  margin-left: 6px; cursor: help;',
    '  transition: all .14s;',
    '  vertical-align: 1px;',
    '}',
    '.ukc-help-hint:hover { background: #CC895E; color: #FFEFE1; }',
    '.ukc-help-tip {',
    '  position: fixed; max-width: 280px;',
    '  background: #3C2124; color: #FFEFE1;',
    '  padding: 10px 14px; border-radius: 8px;',
    '  font-family: "Inter", sans-serif; font-size: 12px; line-height: 1.5;',
    '  box-shadow: 0 10px 30px rgba(60,33,36,0.3);',
    '  pointer-events: none; z-index: 1400;',
    '  opacity: 0; transform: translate(-50%, calc(-100% + 4px));',
    '  transition: opacity 160ms, transform 160ms cubic-bezier(.2,.8,.2,1);',
    '}',
    '.ukc-help-tip.show { opacity: 1; transform: translate(-50%, -100%) translateY(-4px); }',
    '.ukc-help-tip::after {',
    '  content: ""; position: absolute; bottom: -5px; left: 50%;',
    '  transform: translateX(-50%) rotate(45deg);',
    '  width: 10px; height: 10px; background: #3C2124;',
    '}',
  ].join('\n');
  document.head.appendChild(css);

  // ========================================================
  // FEATURE 4: Column Sorting
  // ========================================================
  function wireColumnSorting() {
    var tables = document.querySelectorAll('.data-table');
    tables.forEach(function (table) {
      var ths = table.querySelectorAll('thead th');
      ths.forEach(function (th, colIdx) {
        // Skip Header ohne Text (z.B. Action-Spalte)
        var text = (th.textContent || '').trim();
        if (!text || text === 'Aktion' || text === '') return;
        th.classList.add('ukc-sortable');
        th.dataset.sortState = 'none';
        th.addEventListener('click', function () { sortByColumn(table, th, colIdx); });
      });
    });
  }

  function sortByColumn(table, th, colIdx) {
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr:not(.ukc-empty-row)'));
    if (!rows.length) return;

    // Sort-State zyklen: none → asc → desc → none
    var currentState = th.dataset.sortState || 'none';
    var newState = currentState === 'none' ? 'asc' : (currentState === 'asc' ? 'desc' : 'none');

    // Reset alle THs
    table.querySelectorAll('thead th.ukc-sortable').forEach(function (t) {
      t.dataset.sortState = 'none';
      t.classList.remove('sort-asc', 'sort-desc');
    });

    if (newState === 'none') {
      // Original-Reihenfolge kann nicht wiederhergestellt werden ohne Snapshot — wir bleiben beim aktuellen Sort
      // und toggeln statt zu "none" lieber auf "asc". Aber logischer: einfach asc.
      newState = 'asc';
    }

    th.dataset.sortState = newState;
    th.classList.add('sort-' + newState);

    // Comparator
    function getValue(row) {
      var cell = row.children[colIdx];
      if (!cell) return '';
      // Prefer <strong> Content für Umsätze (z.B. 2.160 €)
      var strong = cell.querySelector('strong');
      var raw = (strong ? strong.textContent : cell.textContent).trim();
      // Euro/Zahl
      var numMatch = raw.replace(/[.\s]/g, '').match(/(-?\d+(?:,\d+)?)/);
      if (numMatch && /[€%]/.test(raw) || /^\d/.test(raw)) {
        return { num: parseFloat(numMatch[1].replace(',', '.')), str: raw.toLowerCase() };
      }
      // Datum DD.MM.YYYY
      var dMatch = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
      if (dMatch) {
        var y = parseInt(dMatch[3], 10);
        if (y < 100) y += 2000;
        var ts = Date.UTC(y, parseInt(dMatch[2], 10) - 1, parseInt(dMatch[1], 10));
        return { num: ts, str: raw.toLowerCase() };
      }
      return { num: NaN, str: raw.toLowerCase() };
    }

    rows.sort(function (a, b) {
      var va = getValue(a), vb = getValue(b);
      var cmp;
      if (!isNaN(va.num) && !isNaN(vb.num)) {
        cmp = va.num - vb.num;
      } else {
        cmp = va.str.localeCompare(vb.str, 'de');
      }
      return newState === 'asc' ? cmp : -cmp;
    });

    // Re-append
    rows.forEach(function (r) { tbody.appendChild(r); });
    if (typeof window.ukcToast === 'function') {
      var colLabel = (th.textContent || '').trim().split('\n')[0].slice(0, 30);
      window.ukcToast('Sortiert nach "' + colLabel + '" · ' + (newState === 'asc' ? 'aufsteigend' : 'absteigend'), 'info', 1600);
    }
  }

  // ========================================================
  // FEATURE 5: Smart Breadcrumbs (Back-Hint)
  // ========================================================
  function trackNavigation() {
    // Bei internen Klicks die aktuelle URL als "Zurück-Quelle" merken
    var prev = sessionStorage.getItem('ukc_last_page');
    var current = window.location.pathname;
    if (prev && prev !== current) {
      // Zeige oben im Topbar einen "Zurück zu …"-Chip
      renderBackChip(prev);
    }
    sessionStorage.setItem('ukc_last_page', current);
  }

  function pageLabel(path) {
    var map = {
      '/provider-preview': 'Dashboard',
      '/kurse-preview': 'Kurse',
      '/kursbloecke-preview': 'Kursblöcke',
      '/buchungen-preview': 'Buchungen',
      '/probestunden-preview': 'Probestunden',
      '/kalender-preview': 'Kalender',
      '/kunden-preview': 'Kunden',
      '/team-preview': 'Team',
      '/rechnungen-preview': 'Rechnungen',
      '/berichte-preview': 'Berichte',
      '/ferien-preview': 'Ferien & Saisons',
      '/marketing-preview': 'Marketing',
      '/embed-preview': 'Einbettung',
      '/einstellungen-preview': 'Einstellungen',
      '/kurs-detail-preview': 'Kurs-Detail',
      '/buchung-detail-preview': 'Buchungs-Detail',
      '/kunden-detail-preview': 'Kunden-Detail',
      '/rechnung-detail-preview': 'Rechnungs-Detail',
    };
    return map[path] || null;
  }

  function renderBackChip(prev) {
    var topbar = document.querySelector('.topbar');
    if (!topbar) return;
    if (topbar.querySelector('.ukc-back-chip')) return;
    var label = pageLabel(prev);
    if (!label) return;

    var chip = document.createElement('button');
    chip.className = 'ukc-back-chip';
    chip.innerHTML = '<span class="bc-arrow">←</span> Zurück zu <strong>' + label + '</strong>';
    chip.addEventListener('click', function () {
      if (typeof window.ukcNavigateFade === 'function') window.ukcNavigateFade(prev);
      else window.location.href = prev;
    });

    // Einfügen zwischen menu-toggle und search, oder am Anfang
    var search = topbar.querySelector('.search');
    if (search) {
      topbar.insertBefore(chip, search);
    } else {
      topbar.insertBefore(chip, topbar.firstChild);
    }
  }

  // ========================================================
  // FEATURE 6: Help-Tooltips für KPI-Labels
  // ========================================================
  var KPI_EXPLAIN = {
    'umsatz': 'Summe aller bezahlten Rechnungen im ausgewählten Zeitraum. Gutschriften werden abgezogen.',
    'auslastung': 'Belegte Plätze ÷ verfügbare Plätze aller Kurse im Zeitraum. 100% bedeutet voll ausgelastet.',
    'neue kunden': 'Eltern, die im Zeitraum zum ersten Mal einen Kurs gebucht haben (inkl. Schnupper).',
    'stornierungen': 'Buchungen, die nach der Widerrufsfrist zurückgezogen wurden. Absagen vorher zählen nicht.',
    'diese woche': 'Probestunden in der aktuellen Kalenderwoche (Mo–So).',
    'conversion': 'Anteil der Schnupper, die in eine zahlende Buchung übergegangen sind.',
    'offen': 'Probestunden ohne Folge-Status — brauchen Nachfassen innerhalb 48 Std.',
    'via mom-graph': 'Durch Parent-zu-Parent Empfehlung gewonnene Schnupper-Teilnehmer.',
    'aktive mitarbeiter': 'Team-Accounts mit gültigem Login-Status. Eingeladene aber nicht angemeldete zählen separat.',
    'einladungen offen': 'Team-Einladungen, die noch nicht akzeptiert wurden.',
    'trainer-nps': 'Net Promoter Score aus Eltern-Feedback zu Trainern. Skala −100 bis +100.',
    'feiertage 2026': 'Gesetzliche Feiertage im gewählten Bundesland. Werden automatisch im Kalender blockiert.',
    'eigene pausen': 'Betriebsferien, Renovierungen, andere Schließzeiten, die du selbst angelegt hast.',
    'saison-kurse': 'Kurzfristige Pop-Up-Kurse außerhalb der regulären Blöcke.',
    'next check-in': 'Tage bis zur nächsten Schließung oder zum nächsten wichtigen Datum.',
    'k-faktor': 'Durchschnittliche Anzahl neuer Kundinnen pro einladender Kundin. Mom-Graph-Multiplikator.',
    'credits ausgezahlt': 'Über den Mom-Graph vergebene Gutschrift-Credits nach der 14-Tage-Wartefrist.',
  };

  function wireHelpTooltips() {
    var kpis = document.querySelectorAll('.kpi-label');
    kpis.forEach(function (label) {
      var text = (label.textContent || '').trim().toLowerCase();
      var explain = KPI_EXPLAIN[text];
      if (!explain) return;
      if (label.querySelector('.ukc-help-hint')) return;
      var hint = document.createElement('span');
      hint.className = 'ukc-help-hint';
      hint.textContent = '?';
      hint.setAttribute('data-explain', explain);
      label.appendChild(hint);
    });
  }

  // Ein gemeinsamer Hover-Tooltip (shared)
  var helpTipEl = null;
  var helpHideTimer = null;
  function ensureHelpTip() {
    if (helpTipEl) return helpTipEl;
    helpTipEl = document.createElement('div');
    helpTipEl.className = 'ukc-help-tip';
    document.body.appendChild(helpTipEl);
    return helpTipEl;
  }

  document.addEventListener('mouseover', function (e) {
    var hint = e.target.closest('.ukc-help-hint');
    if (!hint) return;
    clearTimeout(helpHideTimer);
    var tip = ensureHelpTip();
    tip.textContent = hint.dataset.explain;
    var r = hint.getBoundingClientRect();
    tip.classList.add('show');
    // Position above hint
    tip.style.left = (r.left + r.width / 2) + 'px';
    tip.style.top = (r.top - 12) + 'px';
    tip.style.transform = 'translate(-50%, -100%)';
  });
  document.addEventListener('mouseout', function (e) {
    var hint = e.target.closest('.ukc-help-hint');
    if (!hint) return;
    helpHideTimer = setTimeout(function () {
      if (helpTipEl) helpTipEl.classList.remove('show');
    }, 100);
  });

  // ========================================================
  // Init
  // ========================================================
  function init() {
    wirePageTransitions();
    renderMiniCal();
    injectEmptyStates();
    wireColumnSorting();
    trackNavigation();
    wireHelpTooltips();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
