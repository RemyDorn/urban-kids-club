/* ============================================================
 * UKC Dashboard · Topbar-Interaktionen
 * ============================================================
 * 1) User-Chip Dropdown (Klick auf "Sophie")
 * 2) Notification-Panel Slide-In (Klick auf Glocke)
 *
 * Rendert sich selbst ein — keine HTML-Änderungen nötig.
 * ============================================================ */
(function () {
  if (window.__ukcTopbarInjected) return;
  window.__ukcTopbarInjected = true;

  // --------------------------------------------------------
  // USER CHIP → DROPDOWN
  // --------------------------------------------------------
  var userDropdown = null;

  function buildUserDropdown(chip) {
    if (userDropdown) return userDropdown;
    userDropdown = document.createElement('div');
    userDropdown.className = 'ukc-user-dropdown';
    userDropdown.innerHTML =
      '<div class="udd-head">' +
        '<div class="udd-avatar">S</div>' +
        '<div class="udd-body">' +
          '<div class="udd-name">Sophie Brandt</div>' +
          '<div class="udd-email">sophie@socialy.club</div>' +
          '<div class="udd-role">Inhaberin · Socialy Berlin</div>' +
        '</div>' +
      '</div>' +
      '<div class="udd-list">' +
        '<button class="udd-item" data-action="profile">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
          '<span>Mein Profil</span>' +
        '</button>' +
        '<button class="udd-item" data-action="settings">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
          '<span>Einstellungen</span>' +
        '</button>' +
        '<button class="udd-item" data-action="team">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
          '<span>Team-Übersicht</span>' +
        '</button>' +
        '<div class="udd-divider"></div>' +
        '<button class="udd-item" data-action="shortcuts">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/><path d="M7 16h10"/></svg>' +
          '<span>Tastatur-Shortcuts</span>' +
          '<kbd class="udd-kbd">?</kbd>' +
        '</button>' +
        '<button class="udd-item" data-action="palette">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<span>Schnell-Navigation</span>' +
          '<kbd class="udd-kbd">⌘K</kbd>' +
        '</button>' +
        '<div class="udd-divider"></div>' +
        '<button class="udd-item udd-item-signal" data-action="logout">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
          '<span>Abmelden</span>' +
        '</button>' +
      '</div>';
    document.body.appendChild(userDropdown);

    // Actions
    userDropdown.addEventListener('click', function (e) {
      var btn = e.target.closest('.udd-item');
      if (!btn) return;
      var action = btn.dataset.action;
      closeUserDropdown();

      if (action === 'profile' || action === 'settings' || action === 'team') {
        var urls = { profile: '/einstellungen-preview', settings: '/einstellungen-preview', team: '/team-preview' };
        if (typeof window.ukcNavigateFade === 'function') window.ukcNavigateFade(urls[action]);
        else window.location.href = urls[action];
      } else if (action === 'shortcuts') {
        if (typeof window.openShortcutsModal === 'function') window.openShortcutsModal();
        else {
          var ev = new KeyboardEvent('keydown', { key: '?' });
          document.dispatchEvent(ev);
        }
      } else if (action === 'palette') {
        if (typeof window.ukcOpenCmdK === 'function') window.ukcOpenCmdK();
      } else if (action === 'logout') {
        if (typeof window.ukcToast === 'function') window.ukcToast('Abmeldung (Demo) — hier würde die Session beendet', 'info', 2400);
      }
    });

    return userDropdown;
  }

  function positionUserDropdown(chip) {
    if (!userDropdown) return;
    var rect = chip.getBoundingClientRect();
    var ddRect = { w: 260, h: userDropdown.offsetHeight || 360 };
    var right = window.innerWidth - rect.right;
    if (right < 12) right = 12;
    userDropdown.style.right = right + 'px';
    userDropdown.style.top = (rect.bottom + 8) + 'px';
  }

  function openUserDropdown(chip) {
    buildUserDropdown(chip);
    positionUserDropdown(chip);
    requestAnimationFrame(function () { userDropdown.classList.add('show'); });
  }
  function closeUserDropdown() {
    if (userDropdown) userDropdown.classList.remove('show');
  }

  // --------------------------------------------------------
  // NOTIFICATION-PANEL (Glocke)
  // --------------------------------------------------------
  var notifPanel = null;

  var NOTIFICATIONS = [
    { type: 'booking',   kicker: 'Neue Buchung',       title: 'Tina Richter',       body: '→ Musikgarten Junior · Mi 29.04 · 09:30',            when: 'Vor 4 Min.',  color: '#CC895E' },
    { type: 'momgraph',  kicker: 'Mom-Graph',          title: 'Anna Klein hat geworben',body: 'Miriam Hartmann hat Schnupper gebucht',           when: 'Vor 22 Min.', color: '#B4523A' },
    { type: 'waitlist',  kicker: 'Warteliste',         title: 'Platz frei in Eltern-Kind-Turnen', body: '3 Wartende automatisch informiert',  when: 'Vor 1 Std.',  color: '#93A388' },
    { type: 'trial',     kicker: 'Probestunde bestätigt',title: 'Oksana Petrov',      body: 'Yoga Mini · Mo 29.04 · 16:00',                       when: 'Vor 2 Std.',  color: '#CC895E' },
    { type: 'booking',   kicker: 'Neue Buchung',       title: 'Denise Koch',        body: '→ Kinder Zumba · 8-Wochen-Block · 199,-€',           when: 'Vor 3 Std.',  color: '#CC895E' },
    { type: 'review',    kicker: 'Neue Bewertung',     title: '★★★★★ von Sarah Vogel', body: '„Leo ist eine Entdeckung — Lea fragt jeden Tag"', when: 'Vor 5 Std.',  color: '#627A5A' },
    { type: 'invoice',   kicker: 'Rechnung bezahlt',   title: 'Carolina Silva',     body: 'R-2026-042 · 149,- € · SEPA eingegangen',             when: 'Heute 08:20', color: '#627A5A' },
    { type: 'momgraph',  kicker: 'Credit ausgezahlt',  title: 'Julia Weber',        body: '+2 Credits · nach 14-Tage-Wartezeit',                when: 'Gestern',     color: '#B4523A' },
  ];

  function buildNotifPanel() {
    if (notifPanel) return notifPanel;
    notifPanel = document.createElement('aside');
    notifPanel.className = 'ukc-notif-panel';

    var itemsHtml = NOTIFICATIONS.map(function (n) {
      return '<article class="notif-item notif-type-' + n.type + '">' +
        '<span class="notif-color-bar" style="background:' + n.color + '"></span>' +
        '<div class="notif-body">' +
          '<div class="notif-kicker" style="color:' + n.color + '">' + esc(n.kicker) + '</div>' +
          '<div class="notif-title">' + esc(n.title) + '</div>' +
          '<div class="notif-sub">' + esc(n.body) + '</div>' +
          '<div class="notif-when">' + esc(n.when) + '</div>' +
        '</div>' +
      '</article>';
    }).join('');

    notifPanel.innerHTML =
      '<header class="ukc-notif-head">' +
        '<div>' +
          '<div class="notif-head-kicker">Heute · 24. April</div>' +
          '<h3 class="notif-head-title">Aktivität</h3>' +
          '<div class="notif-head-sub">8 neue Ereignisse seit gestern</div>' +
        '</div>' +
        '<button class="notif-close" aria-label="Schließen">×</button>' +
      '</header>' +
      '<div class="ukc-notif-filters">' +
        '<button class="notif-filter active">Alle</button>' +
        '<button class="notif-filter">Buchungen</button>' +
        '<button class="notif-filter">Mom-Graph</button>' +
        '<button class="notif-filter">Warteliste</button>' +
      '</div>' +
      '<div class="ukc-notif-list">' + itemsHtml + '</div>' +
      '<footer class="ukc-notif-foot">' +
        '<button class="notif-foot-btn">Alle als gelesen</button>' +
        '<button class="notif-foot-btn notif-foot-primary">Zur Aktivitäts-Seite →</button>' +
      '</footer>';

    document.body.appendChild(notifPanel);

    notifPanel.querySelector('.notif-close').addEventListener('click', closeNotifPanel);

    // Filter-Tabs (statisch, nur visueller State)
    notifPanel.querySelectorAll('.notif-filter').forEach(function (f) {
      f.addEventListener('click', function () {
        notifPanel.querySelectorAll('.notif-filter').forEach(function (x) { x.classList.remove('active'); });
        f.classList.add('active');
        var label = f.textContent.trim();
        filterNotifications(label);
      });
    });

    notifPanel.querySelectorAll('.notif-foot-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var txt = b.textContent.trim();
        if (typeof window.ukcToast === 'function') window.ukcToast(txt + ' (Demo)', 'info', 2000);
      });
    });

    return notifPanel;
  }

  function filterNotifications(label) {
    var items = notifPanel.querySelectorAll('.notif-item');
    items.forEach(function (el) {
      var show = true;
      if (label === 'Buchungen') show = el.classList.contains('notif-type-booking');
      else if (label === 'Mom-Graph') show = el.classList.contains('notif-type-momgraph');
      else if (label === 'Warteliste') show = el.classList.contains('notif-type-waitlist');
      el.style.display = show ? '' : 'none';
    });
  }

  function openNotifPanel() {
    buildNotifPanel();
    requestAnimationFrame(function () { notifPanel.classList.add('show'); });
  }
  function closeNotifPanel() {
    if (notifPanel) notifPanel.classList.remove('show');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  // --------------------------------------------------------
  // STYLES
  // --------------------------------------------------------
  var css = document.createElement('style');
  css.textContent = [
    // User-Dropdown
    '.ukc-user-dropdown {',
    '  position: fixed; width: 260px;',
    '  background: #FFF9F5; border: 1px solid rgba(60,33,36,0.1);',
    '  border-radius: 14px; overflow: hidden;',
    '  box-shadow: 0 20px 50px rgba(60,33,36,0.2);',
    '  opacity: 0; transform: translateY(-6px); pointer-events: none;',
    '  transition: opacity 180ms, transform 180ms cubic-bezier(.2,.8,.2,1);',
    '  z-index: 1300; font-family: "Inter", sans-serif;',
    '}',
    '.ukc-user-dropdown.show { opacity: 1; transform: translateY(0); pointer-events: auto; }',
    '.udd-head {',
    '  display: flex; gap: 12px; padding: 18px 18px 16px;',
    '  border-bottom: 1px solid rgba(60,33,36,0.06);',
    '  background: linear-gradient(180deg, #FFEFE1, #FFF9F5);',
    '}',
    '.udd-avatar {',
    '  width: 40px; height: 40px; border-radius: 50%;',
    '  background: linear-gradient(135deg, #CC895E, #B4523A);',
    '  color: #FFEFE1; display: flex; align-items: center; justify-content: center;',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700; font-size: 18px;',
    '  flex-shrink: 0;',
    '}',
    '.udd-name {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 16px; color: #3C2124; letter-spacing: 0.01em;',
    '}',
    '.udd-email { font-size: 12px; color: #A78776; }',
    '.udd-role {',
    '  font-size: 11px; color: #CC895E; margin-top: 2px;',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  letter-spacing: 0.12em; text-transform: uppercase;',
    '}',
    '.udd-list { padding: 6px; }',
    '.udd-item {',
    '  display: flex; align-items: center; gap: 10px;',
    '  width: 100%; padding: 9px 12px;',
    '  background: transparent; border: none; border-radius: 7px;',
    '  text-align: left; cursor: pointer;',
    '  font-family: inherit; font-size: 13px; color: #3C2124;',
    '  transition: background 100ms; position: relative;',
    '}',
    '.udd-item:hover { background: #FFEFE1; }',
    '.udd-item svg { color: #A78776; flex-shrink: 0; }',
    '.udd-item:hover svg { color: #CC895E; }',
    '.udd-item span { flex: 1; }',
    '.udd-item .udd-kbd {',
    '  font-family: inherit; font-size: 10px; font-weight: 600;',
    '  background: #FFEFE1; color: #3C2124;',
    '  padding: 2px 6px; border-radius: 4px;',
    '  border: 1px solid rgba(60,33,36,0.12);',
    '}',
    '.udd-divider { height: 1px; background: rgba(60,33,36,0.06); margin: 4px 8px; }',
    '.udd-item-signal { color: #B4523A; }',
    '.udd-item-signal svg { color: #B4523A; }',
    '.udd-item-signal:hover { background: rgba(180,82,58,0.08); }',

    // Notification-Panel
    '.ukc-notif-panel {',
    '  position: fixed; top: 0; right: 0; bottom: 0;',
    '  width: 400px; max-width: 100vw;',
    '  background: #FFF9F5; border-left: 1px solid rgba(60,33,36,0.1);',
    '  box-shadow: -20px 0 50px rgba(60,33,36,0.15);',
    '  transform: translateX(420px); transition: transform 280ms cubic-bezier(.2,.8,.2,1);',
    '  z-index: 1350; display: flex; flex-direction: column;',
    '  font-family: "Inter", sans-serif;',
    '}',
    '.ukc-notif-panel.show { transform: translateX(0); }',
    '.ukc-notif-head {',
    '  display: flex; justify-content: space-between; align-items: flex-start;',
    '  padding: 22px 22px 16px; border-bottom: 1px solid rgba(60,33,36,0.06);',
    '}',
    '.notif-head-kicker {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;',
    '  color: #C49980; margin-bottom: 4px;',
    '}',
    '.notif-head-title {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 26px; color: #3C2124; letter-spacing: 0.01em;',
    '}',
    '.notif-head-sub { font-size: 12px; color: #A78776; margin-top: 4px; }',
    '.notif-close {',
    '  width: 32px; height: 32px; border-radius: 50%;',
    '  background: transparent; border: none; cursor: pointer;',
    '  color: #3C2124; font-size: 22px; line-height: 1;',
    '  transition: background .14s;',
    '}',
    '.notif-close:hover { background: rgba(60,33,36,0.08); }',
    '.ukc-notif-filters {',
    '  display: flex; gap: 4px; padding: 12px 22px;',
    '  border-bottom: 1px solid rgba(60,33,36,0.06);',
    '  flex-wrap: wrap;',
    '}',
    '.notif-filter {',
    '  background: transparent; border: 1px solid rgba(60,33,36,0.1);',
    '  padding: 5px 11px; border-radius: 999px;',
    '  font-family: inherit; font-size: 11.5px; font-weight: 500;',
    '  color: #A78776; cursor: pointer;',
    '  transition: all 120ms;',
    '}',
    '.notif-filter:hover { background: #FFEFE1; color: #3C2124; }',
    '.notif-filter.active { background: #3C2124; border-color: #3C2124; color: #FFEFE1; }',
    '.ukc-notif-list {',
    '  flex: 1; overflow-y: auto; padding: 8px;',
    '  scrollbar-width: thin;',
    '}',
    '.ukc-notif-list::-webkit-scrollbar { width: 6px; }',
    '.ukc-notif-list::-webkit-scrollbar-thumb { background: rgba(60,33,36,0.2); border-radius: 4px; }',
    '.notif-item {',
    '  display: flex; gap: 12px; padding: 14px;',
    '  border-radius: 10px; margin-bottom: 4px;',
    '  transition: background 120ms; cursor: pointer;',
    '  background: transparent;',
    '}',
    '.notif-item:hover { background: #FFEFE1; }',
    '.notif-color-bar {',
    '  width: 3px; align-self: stretch; border-radius: 2px; flex-shrink: 0;',
    '}',
    '.notif-body { flex: 1; min-width: 0; }',
    '.notif-kicker {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase;',
    '  margin-bottom: 3px;',
    '}',
    '.notif-title {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 15px; color: #3C2124; line-height: 1.2; margin-bottom: 3px;',
    '}',
    '.notif-sub { font-size: 12.5px; color: #5E3D3F; line-height: 1.4; }',
    '.notif-when { font-size: 11px; color: #A78776; margin-top: 6px; font-variant-numeric: tabular-nums; }',
    '.ukc-notif-foot {',
    '  padding: 12px 16px; border-top: 1px solid rgba(60,33,36,0.06);',
    '  display: flex; gap: 8px; background: rgba(60,33,36,0.02);',
    '}',
    '.notif-foot-btn {',
    '  flex: 1; padding: 9px 12px; border-radius: 999px;',
    '  font-family: inherit; font-size: 12px; font-weight: 600;',
    '  background: transparent; border: 1px solid rgba(60,33,36,0.18);',
    '  color: #3C2124; cursor: pointer;',
    '  transition: all 140ms;',
    '}',
    '.notif-foot-btn:hover { background: #FFEFE1; }',
    '.notif-foot-primary { background: #CC895E; border-color: #CC895E; color: #FFEFE1; }',
    '.notif-foot-primary:hover { background: #B8784F; border-color: #B8784F; }',

    // Backdrop-Overlay nur bei Notif-Panel
    '.ukc-notif-backdrop {',
    '  position: fixed; inset: 0; background: rgba(60,33,36,0.3);',
    '  backdrop-filter: blur(2px);',
    '  opacity: 0; transition: opacity 240ms;',
    '  z-index: 1340; pointer-events: none;',
    '}',
    '.ukc-notif-backdrop.show { opacity: 1; pointer-events: auto; }',
  ].join('\n');
  document.head.appendChild(css);

  // --------------------------------------------------------
  // Backdrop für Notif-Panel
  // --------------------------------------------------------
  var notifBackdrop = null;
  function ensureBackdrop() {
    if (notifBackdrop) return notifBackdrop;
    notifBackdrop = document.createElement('div');
    notifBackdrop.className = 'ukc-notif-backdrop';
    notifBackdrop.addEventListener('click', function () {
      closeNotifPanel();
      hideBackdrop();
    });
    document.body.appendChild(notifBackdrop);
    return notifBackdrop;
  }
  function showBackdrop() { ensureBackdrop(); notifBackdrop.classList.add('show'); }
  function hideBackdrop() { if (notifBackdrop) notifBackdrop.classList.remove('show'); }

  // --------------------------------------------------------
  // Wire Up
  // --------------------------------------------------------
  function bindHandlers() {
    // User-Chip
    document.addEventListener('click', function (e) {
      var chip = e.target.closest('.user-chip');
      if (chip) {
        e.preventDefault();
        e.stopPropagation();
        if (userDropdown && userDropdown.classList.contains('show')) {
          closeUserDropdown();
        } else {
          openUserDropdown(chip);
        }
        return;
      }
      // Klick außerhalb → Dropdown zu
      if (userDropdown && userDropdown.classList.contains('show') && !e.target.closest('.ukc-user-dropdown')) {
        closeUserDropdown();
      }

      // Glocken-Icon: findet alle .icon-btn mit title Benachrichtigungen
      var bell = e.target.closest('.icon-btn[title*="enachrichtigung"]');
      if (bell) {
        e.preventDefault();
        e.stopPropagation();
        if (notifPanel && notifPanel.classList.contains('show')) {
          closeNotifPanel();
          hideBackdrop();
        } else {
          openNotifPanel();
          showBackdrop();
        }
        return;
      }
    });

    // Esc schließt Dropdown/Panel
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeUserDropdown();
        closeNotifPanel();
        hideBackdrop();
      }
    });

    // Resize: Dropdown neu positionieren
    window.addEventListener('resize', function () {
      if (userDropdown && userDropdown.classList.contains('show')) {
        var chip = document.querySelector('.user-chip');
        if (chip) positionUserDropdown(chip);
      }
    });
  }

  // Glocke bekommt einen roten Notification-Dot falls noch nicht da
  function ensureNotifDot() {
    var bells = document.querySelectorAll('.icon-btn[title*="enachrichtigung"]');
    bells.forEach(function (bell) {
      if (bell.querySelector('.dot')) return;
      // Hier bereits existierender .dot im HTML? Falls nicht, aufrufen.
      // Preview hat schon einen .dot laut CSS — lass es wie es ist.
    });
  }

  function init() {
    bindHandlers();
    ensureNotifDot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
