/* ============================================================
 * UKC Dashboard · Command-Palette (Cmd+K / Ctrl+K)
 * ============================================================
 * Universelle Schnell-Navigation + Schnell-Aktionen
 * Fuzzy-Search · Recent-Tracking · Keyboard-first
 * Styled im UKC-Brandbook (Linen / Sienna / Temptress)
 * ============================================================ */
(function () {
  if (window.__ukcCmdKInjected) return;
  window.__ukcCmdKInjected = true;

  var RECENT_KEY = 'ukc_cmdk_recent';
  var RECENT_MAX = 6;

  // --------------------------------------------------------
  // Commands Registry
  // --------------------------------------------------------
  var NAV_ITEMS = [
    { id: 'nav-dashboard',   title: 'Dashboard',         hint: 'Überblick',         url: '/provider-preview',       group: 'Navigation' },
    { id: 'nav-kurse',       title: 'Kurse',             hint: 'Einzeltermine',     url: '/kurse-preview',          group: 'Navigation' },
    { id: 'nav-kursbloecke', title: 'Kursblöcke',        hint: 'Mehrwöchige Serien', url: '/kursbloecke-preview',   group: 'Navigation' },
    { id: 'nav-buchungen',   title: 'Buchungen',         hint: 'Alle Buchungen',    url: '/buchungen-preview',      group: 'Navigation' },
    { id: 'nav-probestunden', title: 'Probestunden',     hint: 'Schnupper-Queue',   url: '/probestunden-preview',   group: 'Navigation' },
    { id: 'nav-kalender',    title: 'Kalender',          hint: 'Woche / Tag / Monat', url: '/kalender-preview',     group: 'Navigation' },
    { id: 'nav-kunden',      title: 'Kunden',            hint: 'Eltern & Kinder',   url: '/kunden-preview',         group: 'Navigation' },
    { id: 'nav-team',        title: 'Team',              hint: 'Mitarbeiter',       url: '/team-preview',           group: 'Navigation' },
    { id: 'nav-rechnungen',  title: 'Rechnungen',        hint: 'Finanzen',          url: '/rechnungen-preview',     group: 'Navigation' },
    { id: 'nav-berichte',    title: 'Berichte',          hint: 'Reports & Export',  url: '/berichte-preview',       group: 'Navigation' },
    { id: 'nav-ferien',      title: 'Ferien & Saisons',  hint: 'Feiertage, Pausen', url: '/ferien-preview',         group: 'Navigation' },
    { id: 'nav-marketing',   title: 'Marketing',         hint: 'Mom-Graph · Funnel',url: '/marketing-preview',      group: 'Navigation' },
    { id: 'nav-einbettung',  title: 'Einbettung',        hint: 'Widget-Code',       url: '/embed-preview',          group: 'Navigation' },
    { id: 'nav-einstellungen', title: 'Einstellungen',   hint: 'Konfiguration',     url: '/einstellungen-preview',  group: 'Navigation' },
  ];

  var ACTIONS = [
    { id: 'act-new-course',   title: 'Neuer Kurs',          hint: 'Kurs anlegen',       icon: '＋', url: '/kurse-preview',       group: 'Aktionen' },
    { id: 'act-new-block',    title: 'Neuer Kursblock',     hint: 'Mehrwöchige Serie', icon: '＋', url: '/kursbloecke-preview', group: 'Aktionen' },
    { id: 'act-new-booking',  title: 'Neue Buchung',        hint: 'Manuell einbuchen', icon: '＋', url: '/buchungen-preview',   group: 'Aktionen' },
    { id: 'act-new-customer', title: 'Neuer Kunde',         hint: 'Eltern anlegen',    icon: '＋', url: '/kunden-preview',      group: 'Aktionen' },
    { id: 'act-new-invoice',  title: 'Rechnung schreiben',  hint: 'Manuell erstellen', icon: '＋', url: '/rechnungen-preview',  group: 'Aktionen' },
    { id: 'act-new-trial',    title: 'Probestunde planen',  hint: 'Schnupper buchen',  icon: '＋', url: '/probestunden-preview',group: 'Aktionen' },
    { id: 'act-invite-team',  title: 'Teammitglied einladen', hint: 'Rolle + Zugriff',  icon: '＋', url: '/team-preview',        group: 'Aktionen' },
    { id: 'act-export-cal',   title: 'Kalender exportieren', hint: '.ics-Download',    icon: '⤓', url: '/kalender-export.ics', group: 'Aktionen' },
    { id: 'act-shortcuts',    title: 'Tastatur-Shortcuts',  hint: 'Alle Kürzel',       icon: '?',  customAction: function () {
      // Nur wenn die Kalender-Extras verfügbar sind
      if (typeof window.openShortcutsModal === 'function') { window.openShortcutsModal(); return; }
      // Hacky Fallback: Dispatch einen "?" Keyevent
      var evt = new KeyboardEvent('keydown', { key: '?' });
      document.dispatchEvent(evt);
    }, group: 'Aktionen' },
  ];

  // Mock Content-Entities — später durch echte API-Calls ersetzbar
  var ENTITIES = [
    // Kunden
    { id: 'k-anna',    title: 'Anna Klein',         hint: 'Kundin · 2 Kinder · Musikgarten',        icon: '👤', url: '/kunden-detail-preview', group: 'Kunden' },
    { id: 'k-miriam',  title: 'Miriam Hartmann',    hint: 'Kundin · 1 Kind · Eltern-Kind Tanzen',   icon: '👤', url: '/kunden-detail-preview', group: 'Kunden' },
    { id: 'k-sarah',   title: 'Sarah Vogel',        hint: 'Kundin · 1 Kind · Krabbel Musik',        icon: '👤', url: '/kunden-detail-preview', group: 'Kunden' },
    { id: 'k-julia',   title: 'Julia Weber',        hint: 'Kundin · 2 Kinder · Top-Inviter',        icon: '👤', url: '/kunden-detail-preview', group: 'Kunden' },
    { id: 'k-oksana',  title: 'Oksana Petrov',      hint: 'Kundin · 1 Kind · Yoga Mini',            icon: '👤', url: '/kunden-detail-preview', group: 'Kunden' },
    { id: 'k-denise',  title: 'Denise Koch',        hint: 'Kundin · 1 Kind · Kinder Zumba',         icon: '👤', url: '/kunden-detail-preview', group: 'Kunden' },
    { id: 'k-carolina',title: 'Carolina Silva',     hint: 'Kundin · 1 Kind · Krabbel Musik',        icon: '👤', url: '/kunden-detail-preview', group: 'Kunden' },
    { id: 'k-tina',    title: 'Tina Richter',       hint: 'Schnupper · Eltern-Kind Tanzen',         icon: '👤', url: '/kunden-detail-preview', group: 'Kunden' },
    { id: 'k-marie',   title: 'Marie Ziegler',      hint: 'Schnupper · Musikgarten Junior',         icon: '👤', url: '/kunden-detail-preview', group: 'Kunden' },

    // Kurse
    { id: 'c-musikj',  title: 'Musikgarten Junior',     hint: 'Kurs · Mi 09:30 · Raum 2',          icon: '♪',  url: '/kurs-detail-preview', group: 'Kurse' },
    { id: 'c-ektanz',  title: 'Eltern-Kind Tanzen',     hint: 'Kurs · Mi 10:00 · Raum 1',          icon: '♪',  url: '/kurs-detail-preview', group: 'Kurse' },
    { id: 'c-krabbel', title: 'Krabbel Musik',          hint: 'Kurs · Di 09:00 · Raum 3',          icon: '♪',  url: '/kurs-detail-preview', group: 'Kurse' },
    { id: 'c-yoga',    title: 'Yoga Mini',              hint: 'Kurs · Mo 16:30 · Raum 1',          icon: '♪',  url: '/kurs-detail-preview', group: 'Kurse' },
    { id: 'c-zumba',   title: 'Kinder Zumba',           hint: 'Kurs · Fr 15:00 · Raum 2',          icon: '♪',  url: '/kurs-detail-preview', group: 'Kurse' },
    { id: 'c-kreativ', title: 'Kreativ-Werkstatt Pilot', hint: 'Kurs · Do 15:00 · Raum 1',         icon: '♪',  url: '/kurs-detail-preview', group: 'Kurse' },
    { id: 'c-babym',   title: 'Babymassage Kompakt',    hint: 'Kurs · Do 11:00 · Raum 3',          icon: '♪',  url: '/kurs-detail-preview', group: 'Kurse' },
    { id: 'c-teens',   title: 'Entspannung Teens',      hint: 'Kurs · 5-10 Jahre',                 icon: '♪',  url: '/kurs-detail-preview', group: 'Kurse' },

    // Rechnungen
    { id: 'r-042', title: 'R-2026-042',   hint: 'Rechnung · Carolina Silva · 149,- € · bezahlt',  icon: '€',  url: '/rechnung-detail-preview', group: 'Rechnungen' },
    { id: 'r-041', title: 'R-2026-041',   hint: 'Rechnung · Oksana Petrov · 99,- € · offen',      icon: '€',  url: '/rechnung-detail-preview', group: 'Rechnungen' },
    { id: 'r-040', title: 'R-2026-040',   hint: 'Rechnung · Denise Koch · 199,- € · bezahlt',     icon: '€',  url: '/rechnung-detail-preview', group: 'Rechnungen' },
    { id: 'r-039', title: 'R-2026-039',   hint: 'Rechnung · Anna Klein · 149,- € · bezahlt',      icon: '€',  url: '/rechnung-detail-preview', group: 'Rechnungen' },
    { id: 'r-038', title: 'R-2026-038',   hint: 'Rechnung · Julia Weber · 249,- € · bezahlt',     icon: '€',  url: '/rechnung-detail-preview', group: 'Rechnungen' },

    // Buchungen
    { id: 'b-1', title: 'Buchung · Anna Klein',     hint: 'Musikgarten Junior · 8-Wochen-Block',    icon: '📝', url: '/buchung-detail-preview', group: 'Buchungen' },
    { id: 'b-2', title: 'Buchung · Miriam Hartmann', hint: 'Eltern-Kind Tanzen · 10-Wochen-Block',  icon: '📝', url: '/buchung-detail-preview', group: 'Buchungen' },
    { id: 'b-3', title: 'Buchung · Sarah Vogel',    hint: 'Krabbel Musik · 12-Wochen-Block',       icon: '📝', url: '/buchung-detail-preview', group: 'Buchungen' },
    { id: 'b-4', title: 'Buchung · Denise Koch',    hint: 'Kinder Zumba · 8-Wochen-Block',         icon: '📝', url: '/buchung-detail-preview', group: 'Buchungen' },
  ];

  var ALL_COMMANDS = NAV_ITEMS.concat(ACTIONS).concat(ENTITIES);

  // --------------------------------------------------------
  // Recent-Store
  // --------------------------------------------------------
  function loadRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveRecent(ids) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, RECENT_MAX))); } catch (e) {}
  }
  function trackUsage(id) {
    var recent = loadRecent().filter(function (x) { return x !== id; });
    recent.unshift(id);
    saveRecent(recent);
  }

  // --------------------------------------------------------
  // Fuzzy-Match Score (einfach, aber schnell)
  // --------------------------------------------------------
  function fuzzyScore(needle, haystack) {
    needle = needle.toLowerCase();
    haystack = haystack.toLowerCase();
    if (!needle) return 1;
    if (haystack === needle) return 1000;
    if (haystack.indexOf(needle) === 0) return 500; // prefix match
    if (haystack.indexOf(needle) !== -1) return 300; // substring
    // Character-by-character fuzzy
    var ni = 0, score = 0;
    for (var hi = 0; hi < haystack.length; hi++) {
      if (haystack[hi] === needle[ni]) { ni++; score++; }
      if (ni === needle.length) return 150 + score;
    }
    return 0;
  }

  function scoreCommand(cmd, query) {
    if (!query) return 1;
    var titleScore = fuzzyScore(query, cmd.title);
    var hintScore = cmd.hint ? fuzzyScore(query, cmd.hint) * 0.5 : 0;
    return Math.max(titleScore, hintScore);
  }

  // --------------------------------------------------------
  // DOM / Rendering
  // --------------------------------------------------------
  var overlay = null;
  var inputEl = null;
  var listEl = null;
  var selectedIdx = 0;
  var currentResults = [];

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'ukc-cmdk-overlay';
    overlay.innerHTML =
      '<div class="ukc-cmdk-panel" role="dialog" aria-label="Schnell-Navigation">' +
        '<div class="ukc-cmdk-search">' +
          '<svg class="ukc-cmdk-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<input type="text" placeholder="Springe zu… oder tippe einen Befehl" autocomplete="off" spellcheck="false" />' +
          '<kbd class="ukc-cmdk-esc">Esc</kbd>' +
        '</div>' +
        '<div class="ukc-cmdk-list" role="listbox"></div>' +
        '<div class="ukc-cmdk-foot">' +
          '<div class="cmdk-hint"><kbd>↑</kbd><kbd>↓</kbd> navigieren</div>' +
          '<div class="cmdk-hint"><kbd>↵</kbd> auswählen</div>' +
          '<div class="cmdk-hint"><kbd>Esc</kbd> schließen</div>' +
          '<div class="cmdk-spacer"></div>' +
          '<div class="cmdk-brand">UKC <em>Navigator</em></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    inputEl = overlay.querySelector('input');
    listEl = overlay.querySelector('.ukc-cmdk-list');

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePalette();
    });
    inputEl.addEventListener('input', function () { render(); });
    inputEl.addEventListener('keydown', onInputKey);
    return overlay;
  }

  function render() {
    var query = (inputEl.value || '').trim();
    var scored = ALL_COMMANDS
      .map(function (c) { return { cmd: c, score: scoreCommand(c, query) }; })
      .filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });

    // Recent-Boost bei leerer Query
    var recent = loadRecent();
    if (!query && recent.length) {
      var recentCmds = recent
        .map(function (id) { return ALL_COMMANDS.find(function (c) { return c.id === id; }); })
        .filter(Boolean);
      // Dedupe: Navigation ohne recent, aber recent zuerst
      var recentIds = {};
      recentCmds.forEach(function (c) { recentIds[c.id] = true; });
      var rest = ALL_COMMANDS.filter(function (c) { return !recentIds[c.id]; });
      currentResults = recentCmds.map(function (c) { return Object.assign({}, c, { group: 'Zuletzt' }); })
        .concat(rest.map(function (c) { return Object.assign({}, c); }));
    } else {
      currentResults = scored.map(function (x) { return x.cmd; });
    }

    selectedIdx = 0;
    renderList();
  }

  function renderList() {
    if (!currentResults.length) {
      listEl.innerHTML = '<div class="ukc-cmdk-empty">Nichts gefunden · versuche <em>Rechnung</em>, <em>Marketing</em> oder <em>Einstellungen</em></div>';
      return;
    }

    // Gruppieren
    var groups = {};
    var groupOrder = [];
    currentResults.forEach(function (c) {
      if (!groups[c.group]) { groups[c.group] = []; groupOrder.push(c.group); }
      groups[c.group].push(c);
    });

    var html = '';
    var globalIdx = 0;
    groupOrder.forEach(function (gname) {
      html += '<div class="ukc-cmdk-group"><div class="ukc-cmdk-group-label">' + esc(gname) + '</div>';
      groups[gname].forEach(function (c) {
        var active = globalIdx === selectedIdx ? ' active' : '';
        var icon = c.icon || (c.group === 'Navigation' ? '›' : '•');
        html += '<button class="ukc-cmdk-item' + active + '" role="option" data-idx="' + globalIdx + '">' +
          '<span class="cmdk-item-icon">' + esc(icon) + '</span>' +
          '<span class="cmdk-item-body">' +
            '<span class="cmdk-item-title">' + esc(c.title) + '</span>' +
            (c.hint ? '<span class="cmdk-item-hint">' + esc(c.hint) + '</span>' : '') +
          '</span>' +
          '<span class="cmdk-item-enter"><kbd>↵</kbd></span>' +
        '</button>';
        globalIdx++;
      });
      html += '</div>';
    });
    listEl.innerHTML = html;

    // Click-Handler
    listEl.querySelectorAll('.ukc-cmdk-item').forEach(function (btn) {
      var idx = parseInt(btn.dataset.idx, 10);
      btn.addEventListener('click', function () { executeCommand(currentResults[idx]); });
      btn.addEventListener('mouseenter', function () { selectedIdx = idx; updateActive(); });
    });

    // Scroll selected into view
    var active = listEl.querySelector('.ukc-cmdk-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function updateActive() {
    var items = listEl.querySelectorAll('.ukc-cmdk-item');
    items.forEach(function (el, i) { el.classList.toggle('active', i === selectedIdx); });
    var active = listEl.querySelector('.ukc-cmdk-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function onInputKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = Math.min(currentResults.length - 1, selectedIdx + 1);
      updateActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = Math.max(0, selectedIdx - 1);
      updateActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentResults[selectedIdx]) executeCommand(currentResults[selectedIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    }
  }

  function executeCommand(cmd) {
    if (!cmd) return;
    trackUsage(cmd.id);
    closePalette();
    setTimeout(function () {
      if (typeof cmd.customAction === 'function') {
        cmd.customAction();
      } else if (cmd.url) {
        window.location.href = cmd.url;
      }
    }, 50);
  }

  function openPalette() {
    ensureOverlay();
    overlay.classList.add('show');
    inputEl.value = '';
    render();
    setTimeout(function () { inputEl.focus(); }, 10);
  }

  function closePalette() {
    if (!overlay) return;
    overlay.classList.remove('show');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  // --------------------------------------------------------
  // Styles
  // --------------------------------------------------------
  var css = document.createElement('style');
  css.textContent = [
    '.ukc-cmdk-overlay {',
    '  position: fixed; inset: 0;',
    '  background: rgba(60,33,36,0.45); backdrop-filter: blur(6px);',
    '  display: none; align-items: flex-start; justify-content: center;',
    '  padding: 14vh 20px 20px; z-index: 1400;',
    '  animation: ukcCmdKFade 160ms ease-out;',
    '}',
    '.ukc-cmdk-overlay.show { display: flex; }',
    '@keyframes ukcCmdKFade { from { opacity: 0 } to { opacity: 1 } }',
    '@keyframes ukcCmdKSlide { from { opacity: 0; transform: translateY(-12px) } to { opacity: 1; transform: translateY(0) } }',
    '.ukc-cmdk-panel {',
    '  width: 100%; max-width: 600px;',
    '  background: #FFF9F5; border: 1px solid rgba(60,33,36,0.1);',
    '  border-radius: 14px; overflow: hidden;',
    '  box-shadow: 0 24px 64px rgba(60,33,36,0.3);',
    '  animation: ukcCmdKSlide 220ms cubic-bezier(.2,.8,.2,1);',
    '  font-family: "Inter", ui-sans-serif, sans-serif;',
    '  display: flex; flex-direction: column; max-height: 72vh;',
    '}',
    '.ukc-cmdk-search {',
    '  display: flex; align-items: center; gap: 12px;',
    '  padding: 16px 18px; border-bottom: 1px solid rgba(60,33,36,0.08);',
    '  background: #FFF9F5;',
    '}',
    '.ukc-cmdk-icon { color: #C49980; flex-shrink: 0; }',
    '.ukc-cmdk-search input {',
    '  flex: 1; border: none; background: transparent; outline: none;',
    '  font-family: inherit; font-size: 15px; color: #3C2124;',
    '  font-weight: 500;',
    '}',
    '.ukc-cmdk-search input::placeholder { color: #C49980; font-weight: 400; }',
    '.ukc-cmdk-esc {',
    '  font-family: inherit; font-size: 10px; font-weight: 600;',
    '  background: #FFEFE1; color: #3C2124;',
    '  padding: 3px 7px; border-radius: 4px;',
    '  border: 1px solid rgba(60,33,36,0.12);',
    '  border-bottom: 2px solid rgba(60,33,36,0.18);',
    '}',
    '.ukc-cmdk-list {',
    '  flex: 1; overflow-y: auto; padding: 8px;',
    '  scrollbar-width: thin;',
    '}',
    '.ukc-cmdk-list::-webkit-scrollbar { width: 6px; }',
    '.ukc-cmdk-list::-webkit-scrollbar-thumb { background: rgba(60,33,36,0.2); border-radius: 4px; }',
    '.ukc-cmdk-group { margin-bottom: 10px; }',
    '.ukc-cmdk-group:last-child { margin-bottom: 0; }',
    '.ukc-cmdk-group-label {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;',
    '  color: #C49980; padding: 8px 12px 4px;',
    '}',
    '.ukc-cmdk-item {',
    '  display: flex; align-items: center; gap: 14px;',
    '  width: 100%; padding: 10px 12px;',
    '  background: transparent; border: none; border-radius: 8px;',
    '  text-align: left; cursor: pointer;',
    '  font-family: inherit; color: #3C2124;',
    '  transition: background 100ms;',
    '}',
    '.ukc-cmdk-item:hover, .ukc-cmdk-item.active { background: #FFEFE1; }',
    '.ukc-cmdk-item.active { background: rgba(204,137,94,0.14); }',
    '.cmdk-item-icon {',
    '  width: 28px; height: 28px; border-radius: 7px;',
    '  background: #FFEFE1; color: #CC895E;',
    '  display: flex; align-items: center; justify-content: center;',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 15px; flex-shrink: 0;',
    '}',
    '.ukc-cmdk-item.active .cmdk-item-icon { background: #CC895E; color: #FFEFE1; }',
    '.cmdk-item-body { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }',
    '.cmdk-item-title { font-size: 13.5px; font-weight: 500; color: #3C2124; }',
    '.cmdk-item-hint { font-size: 11.5px; color: #A78776; }',
    '.cmdk-item-enter {',
    '  opacity: 0; transform: translateX(-4px);',
    '  transition: opacity 140ms, transform 140ms;',
    '}',
    '.ukc-cmdk-item.active .cmdk-item-enter { opacity: 1; transform: translateX(0); }',
    '.cmdk-item-enter kbd {',
    '  font-family: inherit; font-size: 10px; font-weight: 600;',
    '  background: #FFF9F5; color: #3C2124;',
    '  padding: 2px 6px; border-radius: 4px;',
    '  border: 1px solid rgba(60,33,36,0.12);',
    '}',
    '.ukc-cmdk-empty {',
    '  padding: 30px 18px; text-align: center;',
    '  color: #A78776; font-size: 13px;',
    '}',
    '.ukc-cmdk-empty em { color: #CC895E; font-family: "Fraunces", serif; font-style: italic; }',
    '.ukc-cmdk-foot {',
    '  display: flex; align-items: center; gap: 14px;',
    '  padding: 10px 16px; border-top: 1px solid rgba(60,33,36,0.08);',
    '  background: rgba(60,33,36,0.02); font-size: 11px;',
    '}',
    '.cmdk-hint { display: flex; align-items: center; gap: 4px; color: #A78776; }',
    '.cmdk-hint kbd {',
    '  font-family: inherit; font-size: 10px; font-weight: 600;',
    '  background: #FFEFE1; color: #3C2124;',
    '  padding: 2px 6px; border-radius: 4px;',
    '  border: 1px solid rgba(60,33,36,0.12);',
    '}',
    '.cmdk-spacer { flex: 1; }',
    '.cmdk-brand {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;',
    '  color: #C49980;',
    '}',
    '.cmdk-brand em {',
    '  font-family: "Fraunces", serif; font-style: italic; font-weight: 400;',
    '  color: #CC895E; letter-spacing: 0;',
    '}',
    // Discover-Hint in Topbar-Search (wenn vorhanden)
    '.ukc-cmdk-topbar-hint {',
    '  display: inline-flex; align-items: center; gap: 6px;',
    '  padding: 3px 7px 3px 9px; border-radius: 999px;',
    '  background: rgba(60,33,36,0.06); color: #A78776;',
    '  font-family: "Inter", sans-serif; font-size: 11px; font-weight: 500;',
    '  margin-left: 8px; user-select: none; cursor: pointer;',
    '  transition: background 140ms, color 140ms;',
    '}',
    '.ukc-cmdk-topbar-hint:hover { background: rgba(204,137,94,0.14); color: #CC895E; }',
    '.ukc-cmdk-topbar-hint kbd {',
    '  font-family: inherit; font-size: 10px; font-weight: 600;',
    '  background: #FFF9F5; color: #3C2124;',
    '  padding: 1px 5px; border-radius: 3px;',
    '  border: 1px solid rgba(60,33,36,0.1);',
    '}',
  ].join('\n');
  document.head.appendChild(css);

  // --------------------------------------------------------
  // Global Keyboard + Topbar-Hint
  // --------------------------------------------------------
  document.addEventListener('keydown', function (e) {
    // Cmd+K / Ctrl+K
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (overlay && overlay.classList.contains('show')) {
        closePalette();
      } else {
        openPalette();
      }
    }
    // Plain '/' in body context (außerhalb Inputs) → öffne auch
    if (e.key === '/' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      e.preventDefault();
      openPalette();
    }
  });

  // Expose programmatic API
  window.ukcOpenCmdK = openPalette;

  // Auto-hint in Topbar-Search (falls vorhanden)
  function injectTopbarHint() {
    var search = document.querySelector('.topbar .search, header.topbar .search');
    if (!search || search.querySelector('.ukc-cmdk-topbar-hint')) return;
    var hint = document.createElement('span');
    hint.className = 'ukc-cmdk-topbar-hint';
    hint.innerHTML = '<kbd>⌘</kbd><kbd>K</kbd>';
    hint.title = 'Schnell-Navigation (Cmd+K / Ctrl+K)';
    hint.addEventListener('click', openPalette);
    search.appendChild(hint);

    // Klick auf Topbar-Input → Cmd+K öffnen
    var input = search.querySelector('input');
    if (input) {
      input.addEventListener('focus', function () { input.blur(); openPalette(); });
    }
  }

  function init() { injectTopbarHint(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
