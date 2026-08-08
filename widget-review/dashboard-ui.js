/* ============================================================
 * UKC Dashboard · Interaktions-Layer für Previews
 * ============================================================
 * - Generisches Modal (Create/Edit/Info)
 * - Toast für Feedback
 * - Filter-Tab-Logik (status-basiert)
 * - Search-Filter (Topbar)
 * - Destructive-Confirm
 * ============================================================ */
(function () {
  if (window.__ukcUiInjected) return;
  window.__ukcUiInjected = true;

  // --------------------------------------------------------
  // DOM Templates
  // --------------------------------------------------------
  var styles = `
    .ukc-modal-overlay {
      position: fixed; inset: 0;
      background: rgba(60,33,36,0.5);
      backdrop-filter: blur(6px);
      display: none;
      align-items: center; justify-content: center;
      z-index: 1000;
      padding: 20px;
      animation: ukc-fadein 180ms ease-out;
    }
    .ukc-modal-overlay.active { display: flex; }
    @keyframes ukc-fadein { from { opacity: 0 } to { opacity: 1 } }
    @keyframes ukc-slideup { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
    .ukc-modal {
      background: #FFF9F5;
      border: 1px solid rgba(60,33,36,0.1);
      border-radius: 16px;
      padding: 26px 28px 22px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(60,33,36,0.25);
      animation: ukc-slideup 220ms cubic-bezier(.2,.8,.2,1);
      font-family: "Inter", sans-serif;
    }
    .ukc-modal-icon {
      width: 40px; height: 40px;
      border-radius: 50%;
      background: #FDE4D3;
      color: #B4523A;
      display: inline-flex;
      align-items: center; justify-content: center;
      margin-bottom: 14px;
    }
    .ukc-modal-icon.signal { background: #F5D5C9; color: #9A4432; }
    .ukc-modal-icon.sage { background: #E4EBDE; color: #627A5A; }
    .ukc-modal-title {
      font-family: "Barlow Condensed", sans-serif;
      font-weight: 700;
      font-size: 22px;
      color: #3C2124;
      margin-bottom: 4px;
      letter-spacing: 0.01em;
    }
    .ukc-modal-title em {
      font-family: "Fraunces", serif;
      font-style: italic;
      font-weight: 500;
      color: #CC895E;
    }
    .ukc-modal-sub {
      font-size: 13.5px;
      color: #5E3D3F;
      line-height: 1.55;
      margin-bottom: 16px;
    }
    .ukc-modal-fields {
      display: flex; flex-direction: column; gap: 10px;
      margin-bottom: 18px;
    }
    .ukc-modal-field {
      padding: 10px 12px;
      background: #FFEFE1;
      border: 1px solid rgba(60,33,36,0.1);
      border-radius: 8px;
      font-size: 13.5px;
      color: #3C2124;
    }
    .ukc-modal-field-label {
      display: block;
      font-size: 10.5px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #A78776;
      font-weight: 600;
      margin-bottom: 3px;
    }
    .ukc-modal-info {
      background: #FDE4D3;
      border: 1px solid rgba(204,137,94,0.3);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12px;
      color: #9A4432;
      margin-bottom: 18px;
      line-height: 1.55;
    }
    .ukc-modal-actions {
      display: flex; gap: 8px; justify-content: flex-end;
    }
    .ukc-btn {
      font-family: "Inter", sans-serif;
      font-size: 13px;
      font-weight: 600;
      border: none;
      border-radius: 999px;
      padding: 9px 18px;
      cursor: pointer;
      transition: background 160ms, transform 140ms;
    }
    .ukc-btn-primary { background: #3C2124; color: #FFEFE1; }
    .ukc-btn-primary:hover { background: #2A1619; }
    .ukc-btn-ghost { background: transparent; color: #3C2124; border: 1px solid rgba(60,33,36,0.14); }
    .ukc-btn-ghost:hover { background: rgba(60,33,36,0.04); }
    .ukc-btn-destructive { background: transparent; color: #B4523A; text-decoration: underline; text-underline-offset: 3px; }
    .ukc-btn-destructive:hover { color: #9A4432; }

    /* Toast */
    .ukc-toast {
      position: fixed; top: 20px; right: 20px;
      background: #3C2124; color: #FFEFE1;
      padding: 12px 18px;
      border-radius: 10px;
      font-family: "Inter", sans-serif;
      font-size: 13.5px;
      font-weight: 500;
      box-shadow: 0 10px 30px rgba(60,33,36,0.3);
      z-index: 2000;
      animation: ukc-slidein 280ms cubic-bezier(.2,.8,.2,1);
      display: flex; align-items: center; gap: 10px;
      max-width: 340px;
    }
    .ukc-toast.success { background: #627A5A; }
    .ukc-toast.info { background: #3C2124; }
    .ukc-toast.warning { background: #CC895E; }
    .ukc-toast.error { background: #B4523A; }
    @keyframes ukc-slidein { from { opacity: 0; transform: translateY(-12px) } to { opacity: 1; transform: translateY(0) } }
    @keyframes ukc-slideout { from { opacity: 1 } to { opacity: 0; transform: translateY(-12px) } }
    .ukc-toast.leaving { animation: ukc-slideout 200ms ease-in forwards; }
  `;
  var styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // --------------------------------------------------------
  // Modal
  // --------------------------------------------------------
  function showModal(opts) {
    closeModal();
    var overlay = document.createElement('div');
    overlay.className = 'ukc-modal-overlay active';
    overlay.id = 'ukc-modal';

    var iconKind = opts.iconKind || 'default';
    var iconSvg = opts.iconSvg || '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

    var fieldsHtml = '';
    if (opts.fields && opts.fields.length) {
      fieldsHtml = '<div class="ukc-modal-fields">' + opts.fields.map(function (f) {
        return '<div>' +
          '<span class="ukc-modal-field-label">' + f.label + '</span>' +
          '<div class="ukc-modal-field">' + f.value + '</div>' +
          '</div>';
      }).join('') + '</div>';
    }

    var infoHtml = opts.info ? '<div class="ukc-modal-info">' + opts.info + '</div>' : '';

    var actionsHtml = (opts.actions || []).map(function (a) {
      return '<button class="ukc-btn ukc-btn-' + (a.kind || 'ghost') + '" data-action="' + (a.id || '') + '">' + a.label + '</button>';
    }).join('');

    overlay.innerHTML =
      '<div class="ukc-modal" role="dialog" aria-modal="true" aria-labelledby="ukc-modal-title">' +
      '<div class="ukc-modal-icon ' + iconKind + '">' + iconSvg + '</div>' +
      '<div class="ukc-modal-title" id="ukc-modal-title">' + opts.title + '</div>' +
      '<div class="ukc-modal-sub">' + (opts.sub || '') + '</div>' +
      fieldsHtml +
      infoHtml +
      '<div class="ukc-modal-actions">' + actionsHtml + '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
      var btn = e.target.closest('button[data-action]');
      if (btn) {
        var id = btn.dataset.action;
        var action = (opts.actions || []).find(function (a) { return a.id === id; });
        if (action && action.onClick) {
          var result = action.onClick();
          if (result !== false) closeModal();
        } else {
          closeModal();
        }
      }
    });
  }

  function closeModal() {
    var existing = document.getElementById('ukc-modal');
    if (existing) existing.remove();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  // --------------------------------------------------------
  // Toast
  // --------------------------------------------------------
  function toast(message, kind, durationMs) {
    kind = kind || 'info';
    durationMs = durationMs || 2800;
    // Remove existing toast
    var existing = document.querySelector('.ukc-toast');
    if (existing) existing.remove();

    var el = document.createElement('div');
    el.className = 'ukc-toast ' + kind;
    var iconSvg = kind === 'success'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
      : (kind === 'warning' || kind === 'error')
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    el.innerHTML = iconSvg + '<span>' + message + '</span>';
    document.body.appendChild(el);
    setTimeout(function () {
      el.classList.add('leaving');
      setTimeout(function () { el.remove(); }, 220);
    }, durationMs);
  }

  window.ukcToast = toast;
  window.ukcModal = showModal;
  window.ukcCloseModal = closeModal;

  // --------------------------------------------------------
  // Action handlers by button text
  // --------------------------------------------------------
  var CREATE_HANDLERS = {
    '+ Neuer Kurs': {
      title: 'Neuen <em>Kurs</em> anlegen',
      sub: 'Ein neuer Kurs-Typ — du kannst später Blöcke und Termine dafür planen.',
      fields: [
        { label: 'Name', value: 'z.B. PEKiP Basis · Frühjahr 2026' },
        { label: 'Kategorie · Alter', value: 'Eltern-Kind · 0-6 Mo' },
        { label: 'Dauer · Raum', value: '8 Einheiten · Raum 2' },
      ],
      info: 'In der Vollversion öffnet sich hier ein 3-Schritte-Assistent: Stammdaten → Termine → Preis. Die Preview zeigt nur den Abschluss-State.',
      successToast: 'Kurs angelegt &middot; PEKiP Basis'
    },
    '+ Neue Buchung': {
      title: 'Neue <em>Buchung</em> erfassen',
      sub: 'Manuell einbuchen — z.B. für Kund:innen ohne Online-Anmeldung.',
      fields: [
        { label: 'Kunde', value: 'Anna Schmidt · anna.schmidt@mail.de' },
        { label: 'Kurs · Block', value: 'PEKiP Basis · Frühjahr 2026' },
        { label: 'Zahlung', value: 'Rechnung per E-Mail' },
      ],
      successToast: 'Buchung erfasst &middot; Rechnung wird versendet'
    },
    '+ Kunde anlegen': {
      title: 'Kund:in <em>hinzufügen</em>',
      sub: 'Manuell ein neues Eltern-Profil anlegen.',
      fields: [
        { label: 'Name · E-Mail', value: 'Neuer Kunde · email@domain.de' },
        { label: 'Kind (optional)', value: 'Name · Geburtsdatum' },
      ],
      successToast: 'Kund:in angelegt'
    },
    '+ Rechnung erstellen': {
      title: 'Neue <em>Rechnung</em> erstellen',
      sub: 'Freie Rechnung außerhalb einer regulären Buchung.',
      fields: [
        { label: 'Empfänger', value: 'Kund:in wählen' },
        { label: 'Position', value: 'Leistung + Betrag' },
      ],
      info: 'Rechnungsnummer wird erst beim Versenden vergeben (GoBD-konform fortlaufend).',
      successToast: 'Rechnungs-Entwurf gespeichert'
    },
    '+ Termin anlegen': {
      title: 'Termin <em>anlegen</em>',
      sub: 'Zusatz-Termin oder Nachhol-Stunde — außerhalb der regulären Serie.',
      fields: [
        { label: 'Datum · Zeit', value: 'Mi, 07. Mai · 10:00' },
        { label: 'Kurs · Raum', value: 'PEKiP Basis · Raum 2' },
      ],
      successToast: 'Termin angelegt &middot; 07.05. 10:00'
    },
    '+ Kunde': {
      title: 'Kund:in <em>hinzufügen</em>',
      sub: 'Manuell ein neues Eltern-Profil anlegen.',
      fields: [
        { label: 'Name · E-Mail', value: 'Neuer Kunde · email@domain.de' },
      ],
      successToast: 'Kund:in angelegt'
    }
  };

  var EDIT_HANDLERS = {
    'Bearbeiten': {
      title: 'Eintrag <em>bearbeiten</em>',
      sub: 'In der Vollversion werden alle Felder editierbar. Die Preview zeigt nur den Abschluss-State.',
      successToast: 'Änderungen gespeichert'
    },
    'Änderungen speichern': {
      title: 'Einstellungen <em>gespeichert</em>',
      sub: 'Deine Änderungen wurden übernommen. Bei Provider-Settings kann es bis zu 60 Sekunden dauern, bis sie im Widget sichtbar sind.',
      successToast: 'Einstellungen gespeichert',
      autoConfirmOnly: true
    },
    'Bestätigung erneut senden': { successToast: 'Bestätigungs-Mail versendet', directToast: true },
    'Bestätigung': { successToast: 'Bestätigungs-Mail versendet', directToast: true },
    'PDF': { successToast: 'PDF wird generiert...', directToast: true },
    'PDF herunterladen': { successToast: 'PDF-Download startet...', directToast: true },
    'Teilen': { successToast: 'Link kopiert', directToast: true },
    'Exportieren': { successToast: 'Export wird vorbereitet...', directToast: true },
    'Importieren': {
      title: 'Kurse <em>importieren</em>',
      sub: 'CSV-Import für Massen-Upload bestehender Kurse.',
      info: 'Unterstützt: .csv · .xlsx · Acuity-Export',
      successToast: 'Import-Queue gestartet'
    },
    'DATEV-Export': { successToast: 'DATEV-Datei wird generiert...', directToast: true },
    'Kalender exportieren (.ics)': { passthrough: true },  // echter Download, nicht abfangen
    'Affiliate-Config': { passthrough: true },
  };

  var DESTRUCTIVE_HANDLERS = {
    'Stornieren': {
      title: 'Buchung <em>stornieren</em>?',
      sub: 'Die Buchung wird storniert und eine Rückzahlung eingeleitet. Der Platz wird wieder freigegeben.',
      iconKind: 'signal',
      iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
      confirmLabel: 'Ja, stornieren',
      confirmKind: 'destructive',
      successToast: 'Buchung storniert'
    },
    'Kurs pausieren': {
      title: 'Kurs <em>pausieren</em>?',
      sub: 'Der Kurs wird im Portal nicht mehr angezeigt. Bestehende Buchungen bleiben erhalten.',
      iconKind: 'signal',
      confirmLabel: 'Pausieren',
      confirmKind: 'destructive',
      successToast: 'Kurs pausiert'
    },
    'Storno-Rechnung': {
      title: 'Storno-<em>Rechnung</em> erstellen?',
      sub: 'Erstellt eine Gegen-Rechnung. Die Originalrechnung bleibt unverändert (GoBD-konform).',
      iconKind: 'signal',
      confirmLabel: 'Storno erstellen',
      confirmKind: 'destructive',
      successToast: 'Storno-Rechnung erstellt'
    },
    'Portal pausieren': {
      title: 'Portal <em>pausieren</em>?',
      sub: 'Dein Eltern-Portal geht offline. Bestehende Kurse und Buchungen bleiben, neue Anmeldungen sind blockiert.',
      iconKind: 'signal',
      confirmLabel: 'Portal offline schalten',
      confirmKind: 'destructive',
      successToast: 'Portal ist jetzt pausiert'
    },
    'Account löschen': {
      title: 'Account <em>unwiderruflich</em> löschen?',
      sub: 'Alle Daten werden nach 30 Tagen entfernt. Rechnungsdaten werden laut GoBD 10 Jahre archiviert, sind aber nicht mehr zugänglich.',
      iconKind: 'signal',
      confirmLabel: 'Ich verstehe, löschen',
      confirmKind: 'destructive',
      successToast: 'Löschung beantragt &middot; 30 Tage Karenzzeit'
    }
  };

  function handleCreate(key) {
    var h = CREATE_HANDLERS[key];
    if (!h) return false;
    showModal({
      title: h.title,
      sub: h.sub,
      fields: h.fields,
      info: h.info,
      actions: [
        { id: 'cancel', label: 'Abbrechen', kind: 'ghost' },
        { id: 'confirm', label: 'Anlegen', kind: 'primary', onClick: function () { toast(h.successToast || 'Angelegt', 'success'); } }
      ]
    });
    return true;
  }

  function handleEdit(key) {
    var h = EDIT_HANDLERS[key];
    if (!h) return false;
    if (h.passthrough) return false;
    if (h.directToast) { toast(h.successToast || 'OK', 'success'); return true; }
    if (h.autoConfirmOnly) { toast(h.successToast || 'Gespeichert', 'success'); return true; }
    showModal({
      title: h.title,
      sub: h.sub,
      info: h.info,
      actions: [
        { id: 'cancel', label: 'Abbrechen', kind: 'ghost' },
        { id: 'confirm', label: 'Übernehmen', kind: 'primary', onClick: function () { toast(h.successToast || 'Gespeichert', 'success'); } }
      ]
    });
    return true;
  }

  function handleDestructive(key) {
    var h = DESTRUCTIVE_HANDLERS[key];
    if (!h) return false;
    showModal({
      title: h.title,
      sub: h.sub,
      iconKind: h.iconKind,
      iconSvg: h.iconSvg,
      actions: [
        { id: 'cancel', label: 'Abbrechen', kind: 'ghost' },
        { id: 'confirm', label: h.confirmLabel, kind: h.confirmKind || 'primary', onClick: function () { toast(h.successToast || 'OK', 'success'); } }
      ]
    });
    return true;
  }

  // --------------------------------------------------------
  // Event delegation
  // --------------------------------------------------------
  document.addEventListener('click', function (e) {
    // Don't intercept navigation (anchors, buttons with onclick already)
    if (e.target.closest('a[href]')) return;

    var btn = e.target.closest('button');
    if (!btn) return;

    // Skip buttons with explicit onclick (likely real interactions)
    var hasOnclick = btn.getAttribute('onclick');

    var text = (btn.textContent || '').trim();

    // Normalize: strip trailing arrows and extra whitespace
    var key = text.replace(/\s*[→→]\s*$/, '').replace(/\s+/g, ' ').trim();

    // Try handlers in priority order; destructive first (specific)
    if (DESTRUCTIVE_HANDLERS[key] && !hasOnclick) {
      e.preventDefault(); e.stopPropagation();
      handleDestructive(key);
      return;
    }
    if (CREATE_HANDLERS[key] && !hasOnclick) {
      e.preventDefault(); e.stopPropagation();
      handleCreate(key);
      return;
    }
    if (EDIT_HANDLERS[key] && !hasOnclick) {
      var handled = handleEdit(key);
      if (handled) {
        var h = EDIT_HANDLERS[key];
        if (!h.passthrough) { e.preventDefault(); e.stopPropagation(); }
      }
      return;
    }

    // Filter-Tabs: class="filter-tab"
    if (btn.classList.contains('filter-tab') && !hasOnclick) {
      e.preventDefault();
      var tabs = btn.parentElement.querySelectorAll('.filter-tab');
      tabs.forEach(function (t) { t.classList.remove('active'); });
      btn.classList.add('active');
      var label = (btn.childNodes[0] && btn.childNodes[0].textContent || '').trim();
      applyRowFilter(label);
      return;
    }

    // Pager (disabled)
    if (btn.classList.contains('pager-btn') && !btn.disabled && !hasOnclick) {
      e.preventDefault();
      var pagers = btn.parentElement.querySelectorAll('.pager-btn');
      pagers.forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      toast('Seite ' + btn.textContent.trim(), 'info', 1500);
      return;
    }
  });

  // --------------------------------------------------------
  // Row-Filter-Logik (status-Pills auf Zeilen lesen)
  // --------------------------------------------------------
  function applyRowFilter(filterLabel) {
    var tables = document.querySelectorAll('.kurse-table tbody');
    tables.forEach(function (tbody) {
      var rows = tbody.querySelectorAll('tr');
      rows.forEach(function (row) {
        if (filterLabel === 'Alle' || filterLabel === '') {
          row.style.display = '';
          return;
        }
        var pill = row.querySelector('.pill');
        var pillText = pill ? pill.textContent.trim().toLowerCase() : '';
        var match = pillText.indexOf(filterLabel.toLowerCase()) !== -1;
        row.style.display = match ? '' : 'none';
      });
    });
    // Mobile Card-View auch
    var cards = document.querySelectorAll('.kurse-mobile-card');
    cards.forEach(function (card) {
      if (filterLabel === 'Alle' || filterLabel === '') {
        card.style.display = '';
        return;
      }
      var pill = card.querySelector('.pill');
      var pillText = pill ? pill.textContent.trim().toLowerCase() : '';
      var match = pillText.indexOf(filterLabel.toLowerCase()) !== -1;
      card.style.display = match ? '' : 'none';
    });
  }

  // --------------------------------------------------------
  // Search-Input in Topbar (filter rows live)
  // --------------------------------------------------------
  var searchInputs = document.querySelectorAll('.search input[type="search"]');
  searchInputs.forEach(function (inp) {
    inp.addEventListener('input', function () {
      var q = inp.value.trim().toLowerCase();
      var rows = document.querySelectorAll('.kurse-table tbody tr, .data-table tbody tr');
      rows.forEach(function (row) {
        if (!q) { row.style.display = ''; return; }
        var text = (row.textContent || '').toLowerCase();
        row.style.display = text.indexOf(q) !== -1 ? '' : 'none';
      });
      var cards = document.querySelectorAll('.kurse-mobile-card');
      cards.forEach(function (card) {
        if (!q) { card.style.display = ''; return; }
        var text = (card.textContent || '').toLowerCase();
        card.style.display = text.indexOf(q) !== -1 ? '' : 'none';
      });
    });
  });

  // --------------------------------------------------------
  // Einstellungen · Toggle-Switches · localStorage persist
  // --------------------------------------------------------
  document.querySelectorAll('.toggle').forEach(function (toggle, idx) {
    var key = 'ukc_toggle_' + idx;
    var saved = localStorage.getItem(key);
    if (saved !== null) toggle.classList.toggle('on', saved === '1');
    toggle.addEventListener('click', function () {
      toggle.classList.toggle('on');
      localStorage.setItem(key, toggle.classList.contains('on') ? '1' : '0');
      var label = toggle.closest('.toggle-row');
      var titleEl = label ? label.querySelector('.toggle-title') : null;
      var t = titleEl ? titleEl.textContent.trim() : 'Einstellung';
      toast(t + (toggle.classList.contains('on') ? ' aktiviert' : ' deaktiviert'), 'info', 1800);
    });
  });

  // --------------------------------------------------------
  // Settings-Nav (Sticky-Sidebar)
  // --------------------------------------------------------
  document.querySelectorAll('.settings-nav-item').forEach(function (item) {
    item.addEventListener('click', function () {
      document.querySelectorAll('.settings-nav-item').forEach(function (i) { i.classList.remove('active'); });
      item.classList.add('active');
      var label = item.textContent.trim();
      toast(label + ' — Bereich kommt bald', 'info', 1600);
    });
  });

  // --------------------------------------------------------
  // Form-Field Persistence · localStorage
  // --------------------------------------------------------
  // Persistiert alle <input>, <select>, <textarea> innerhalb von
  // .settings-section (auto-key via Sektionstitel + Feld-Index).
  // Echte Form-Persistence für die Einstellungen-Seite.
  //
  // Änderungen werden:
  //  1) direkt bei 'input' / 'change' in localStorage geschrieben
  //  2) wiederhergestellt beim Laden
  //  3) beim "Änderungen speichern"-Klick mit Toast bestätigt
  // --------------------------------------------------------
  function slug(s) {
    return String(s || '').toLowerCase()
      .replace(/[äöüß]/g, function (c) { return { 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' }[c] || c; })
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  }

  var sections = document.querySelectorAll('.settings-section');
  sections.forEach(function (section, sidx) {
    var titleEl = section.querySelector('.settings-section-title');
    var sectionKey = titleEl ? slug(titleEl.textContent) : ('section_' + sidx);
    var fields = section.querySelectorAll('input, select, textarea');
    fields.forEach(function (field, fidx) {
      // Skip Buttons
      if (field.type === 'button' || field.type === 'submit') return;

      // Label finden: vorheriges .form-label-Geschwister oder Vorfahre
      var labelText = '';
      var row = field.closest('.form-group, .field-row, .settings-row, label');
      if (row) {
        var lbl = row.querySelector('.form-label, label');
        if (lbl) labelText = lbl.textContent.trim();
      }
      // Fallback: placeholder
      if (!labelText) labelText = field.placeholder || field.name || ('field_' + fidx);

      var key = 'ukc_form_' + sectionKey + '__' + slug(labelText) + '__' + fidx;

      // Restore
      try {
        var saved = localStorage.getItem(key);
        if (saved !== null) {
          if (field.type === 'checkbox' || field.type === 'radio') {
            field.checked = (saved === '1');
          } else {
            field.value = saved;
          }
        }
      } catch (e) { /* localStorage blockiert — still works */ }

      // Persist on change
      var evt = (field.tagName === 'SELECT' || field.type === 'checkbox' || field.type === 'radio') ? 'change' : 'input';
      field.addEventListener(evt, function () {
        try {
          var val = (field.type === 'checkbox' || field.type === 'radio') ? (field.checked ? '1' : '0') : field.value;
          localStorage.setItem(key, val);
        } catch (e) {}
      });
    });
  });

  // --------------------------------------------------------
  // "Änderungen speichern"-Button → Bestätigung
  // --------------------------------------------------------
  document.querySelectorAll('.btn-primary').forEach(function (btn) {
    var txt = (btn.textContent || '').trim().toLowerCase();
    if (txt.indexOf('änderungen speichern') !== -1 || txt.indexOf('speichern & schließen') !== -1) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var count = document.querySelectorAll('.settings-section input, .settings-section select, .settings-section textarea').length;
        toast('Einstellungen gespeichert · ' + count + ' Felder übernommen', 'success', 2400);
      }, true); // capture phase so we beat the generic CREATE handler
    }
  });
})();
