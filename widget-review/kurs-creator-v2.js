/* ============================================================
 * UKC Provider · Kurs-Creator V2
 * ============================================================
 * Voller Kurs-anlegen-Modal im UKC-Brandbook
 * (Linen / Sienna / Brown / Temptress · Barlow / Fraunces / Inter)
 *
 * window.openKursCreatorV2()  → öffnet Modal
 * window.openKursCreatorV2({ onSubmit: fn })  → mit eigenem Callback
 *
 * Hookt automatisch in alle „Neuer Kurs"-Buttons im Dashboard.
 * ============================================================ */
(function () {
  if (window.__ukcKursCreatorInjected) return;
  window.__ukcKursCreatorInjected = true;

  // ============================================================
  // Config
  // ============================================================
  var CATEGORIES = [
    { value: 'eltern-kind', label: 'Eltern-Kind', dot: '#FDE4D3', border: '#CC895E' },
    { value: 'bewegung',    label: 'Bewegung',    dot: '#E4EBDE', border: '#627A5A' },
    { value: 'musik',       label: 'Musik',       dot: '#F5D5C9', border: '#B4523A' },
    { value: 'kreativ',     label: 'Kreativ',     dot: '#F5DCC5', border: '#B8784F' },
    { value: 'tanz',        label: 'Tanz',        dot: '#E2B48E', border: '#CC895E' },
    { value: 'sprache',     label: 'Sprache',     dot: '#D7C5BA', border: '#A78776' },
    { value: 'natur',       label: 'Natur & Outdoor', dot: '#C8D4BC', border: '#627A5A' },
    { value: 'sonstige',    label: 'Sonstige',    dot: '#E5DAD0', border: '#A78776' },
  ];

  var WEEKDAYS = [
    { value: 'MO', label: 'Mo' }, { value: 'DI', label: 'Di' },
    { value: 'MI', label: 'Mi' }, { value: 'DO', label: 'Do' },
    { value: 'FR', label: 'Fr' }, { value: 'SA', label: 'Sa' }, { value: 'SO', label: 'So' },
  ];

  var ROOMS = ['Kein Raum zugewiesen', 'Raum 1', 'Raum 2', 'Raum 3', 'Außenbereich'];
  var TRAINERS = ['Kein Kursleiter zugewiesen', 'Sophie Brandt', 'Julia Weber', 'Miriam Tanzpädagogin', 'Leo Musikgarten', 'Pia Yogalehrerin'];

  var PRICE_MODELS = [
    { value: 'package', label: 'Paket (z.B. 8er-Block)' },
    { value: 'single',  label: 'Einzelstunde' },
    { value: 'monthly', label: 'Monatsabo' },
    { value: 'free',    label: 'Kostenlos' },
  ];

  // KI-Beschreibungs-Mock (deterministisch, nach Kategorie)
  var AI_DESC = {
    'eltern-kind': 'Ein liebevoller Bewegungs- und Spielraum für die wertvolle Zeit zwischen Eltern und Kind. In kleinen Gruppen entdecken die Kleinen mit ihrer Bezugsperson erste motorische Erfahrungen, Lieder und Rituale — alles in geschütztem Rahmen.',
    'bewegung': 'Spielerische Bewegung, die Koordination, Mut und Selbstvertrauen wachsen lässt. Mit Geräten, Musik und altersgerechten Spielen erleben die Kinder ihren Körper neu — und haben dabei eine Menge Spaß.',
    'musik': 'Musikalische Früherziehung mit Stimme, Rhythmus und ersten Instrumenten. Kinder erleben Musik mit allen Sinnen, lernen Lieder kennen und entwickeln spielerisch Rhythmusgefühl und Melodieverständnis.',
    'kreativ': 'Mit den Händen denken: Malen, Werken, Gestalten in einer Atmosphäre, die jeden eigenen Ausdruck willkommen heißt. Kein „richtig oder falsch" — nur Material, Zeit und das Vertrauen, dass jedes Kind seinen Weg findet.',
    'tanz': 'Bewegung trifft Musik trifft Phantasie. Erste Tanzschritte, freies Improvisieren und kleine Choreografien — altersgerecht aufgebaut, immer mit Freude und ohne Leistungsdruck.',
    'sprache': 'Sprache spielerisch erleben: Reime, Geschichten, Lieder und Rollenspiele begleiten Kinder beim Wortschatzaufbau und Sprechmut. In kleinen Gruppen, mit Liebe zum Detail.',
    'natur': 'Raus an die frische Luft — bei jedem Wetter. Mit Wald, Wiese und Wasser entdecken die Kinder Tiere, Pflanzen und Jahreszeiten ganz unmittelbar. Robuste Kleidung empfohlen.',
    'sonstige': 'Ein liebevoll konzipiertes Angebot mit Raum für Bewegung, Begegnung und Entwicklung. Genaueres erfährst du in der Kursbeschreibung — oder direkt bei einer Schnupperstunde.',
  };

  // ============================================================
  // Modal-Builder
  // ============================================================
  function build(options) {
    options = options || {};
    var existing = document.querySelector('.ukc-kurs-overlay');
    if (existing) return existing;

    var overlay = document.createElement('div');
    overlay.className = 'ukc-kurs-overlay';
    overlay.innerHTML = renderModal();
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('show'); });

    wireBehavior(overlay, options);
    setTimeout(function () {
      var first = overlay.querySelector('input[name="title"]');
      if (first) first.focus();
    }, 50);
    return overlay;
  }

  function close(overlay) {
    if (!overlay) overlay = document.querySelector('.ukc-kurs-overlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    setTimeout(function () { if (overlay.parentElement) overlay.remove(); }, 240);
  }

  function renderModal() {
    var catOptions = CATEGORIES.map(function (c) {
      return '<option value="' + c.value + '">' + c.label + '</option>';
    }).join('');
    var ageOptions = '';
    for (var y = 0; y <= 14; y++) ageOptions += '<option value="' + y + '">' + y + ' J.</option>';

    var weekdayOptions = WEEKDAYS.map(function (d) {
      return '<option value="' + d.value + '">' + d.label + '</option>';
    }).join('');

    var roomOptions = ROOMS.map(function (r) {
      return '<option value="' + escAttr(r) + '">' + escHtml(r) + '</option>';
    }).join('');
    var trainerOptions = TRAINERS.map(function (t) {
      return '<option value="' + escAttr(t) + '">' + escHtml(t) + '</option>';
    }).join('');

    var priceModelOptions = PRICE_MODELS.map(function (p) {
      return '<option value="' + p.value + '">' + p.label + '</option>';
    }).join('');

    var colorPicker = CATEGORIES.map(function (c, i) {
      return '<button type="button" class="kk-color' + (i === 0 ? ' active' : '') + '" data-color="' + c.value + '" style="--dot:' + c.dot + ';--ring:' + c.border + '" title="' + escAttr(c.label) + '" aria-label="Farbe: ' + escAttr(c.label) + '"></button>';
    }).join('');

    var today = new Date();
    var todayISO = today.toISOString().slice(0, 10);

    return '' +
      '<div class="ukc-kurs-modal" role="dialog" aria-labelledby="kk-title">' +
        '<header class="kk-head">' +
          '<div>' +
            '<div class="kk-kicker">Provider · Kurs anlegen</div>' +
            '<h2 class="kk-title" id="kk-title">Neuer <em>Kurs</em></h2>' +
          '</div>' +
          '<button type="button" class="kk-close" aria-label="Schließen">×</button>' +
        '</header>' +

        '<div class="kk-body">' +

          // STAMMDATEN
          '<section class="kk-section">' +
            '<div class="kk-section-label">Stammdaten</div>' +
            '<label class="kk-field">' +
              '<span class="kk-label">Kursname <span class="kk-req">*</span></span>' +
              '<input class="kk-input" type="text" name="title" placeholder="z. B. Musikgarten Junior" required>' +
            '</label>' +
            '<label class="kk-field">' +
              '<span class="kk-label-row">' +
                '<span class="kk-label">Beschreibung</span>' +
                '<button type="button" class="kk-ai-btn" data-action="ai-describe">' +
                  '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.5 5L18 8l-4.5 1L12 14l-1.5-5L6 8l4.5-1L12 2zm6 12l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3zM5 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/></svg>' +
                  '<span>Mit KI generieren</span>' +
                '</button>' +
              '</span>' +
              '<textarea class="kk-input kk-textarea" name="description" rows="3" placeholder="Beschreibe deinen Kurs… oder lass es die KI für dich machen."></textarea>' +
            '</label>' +
            '<div class="kk-grid-3">' +
              '<label class="kk-field">' +
                '<span class="kk-label">Kategorie <span class="kk-req">*</span></span>' +
                '<select class="kk-input" name="category" required>' + catOptions + '</select>' +
              '</label>' +
              '<div class="kk-field">' +
                '<span class="kk-label">Alter (ab — bis)</span>' +
                '<div class="kk-age-row">' +
                  '<select class="kk-input" name="ageMin">' + ageOptions + '</select>' +
                  '<span class="kk-age-sep">–</span>' +
                  '<select class="kk-input" name="ageMax">' + ageOptions.replace('value="0"', 'value="0" selected="false"') + '</select>' +
                '</div>' +
              '</div>' +
              '<label class="kk-field">' +
                '<span class="kk-label">Max. Teilnehmer <span class="kk-req">*</span></span>' +
                '<input class="kk-input" type="number" name="capacity" value="12" min="1" max="50" required>' +
              '</label>' +
            '</div>' +
            '<div class="kk-grid-2">' +
              '<label class="kk-field">' +
                '<span class="kk-label">Raum (optional)</span>' +
                '<select class="kk-input" name="room">' + roomOptions + '</select>' +
              '</label>' +
              '<label class="kk-field">' +
                '<span class="kk-label">Kursleiter:in (optional)</span>' +
                '<select class="kk-input" name="trainer">' + trainerOptions + '</select>' +
              '</label>' +
            '</div>' +
          '</section>' +

          // ZEITPLAN
          '<section class="kk-section kk-section-fieldset">' +
            '<div class="kk-section-label">Zeitplan</div>' +
            '<div class="kk-schedule" id="kk-schedule">' +
              renderScheduleRow(weekdayOptions, todayISO, true) +
            '</div>' +
            '<button type="button" class="kk-add" data-action="add-day">' +
              '<span class="kk-add-icon">+</span>' +
              '<span>Weiteren Tag hinzufügen</span>' +
            '</button>' +
          '</section>' +

          // PREIS
          '<section class="kk-section kk-section-fieldset">' +
            '<div class="kk-section-label">Preismodell</div>' +
            '<div class="kk-price-row" data-price-row="primary">' +
              '<div class="kk-grid-4">' +
                '<label class="kk-field">' +
                  '<span class="kk-label">Art <span class="kk-req">*</span></span>' +
                  '<select class="kk-input" name="priceModel">' + priceModelOptions + '</select>' +
                '</label>' +
                '<label class="kk-field">' +
                  '<span class="kk-label">Bezeichnung</span>' +
                  '<input class="kk-input" type="text" name="priceLabel" value="8er-Paket">' +
                '</label>' +
                '<label class="kk-field">' +
                  '<span class="kk-label">Preis (EUR) <span class="kk-req">*</span></span>' +
                  '<input class="kk-input" type="number" name="priceAmount" value="96" min="0" step="0.50" required>' +
                '</label>' +
                '<label class="kk-field">' +
                  '<span class="kk-label">Wochen / Einheiten</span>' +
                  '<input class="kk-input" type="number" name="priceUnits" value="8" min="1">' +
                '</label>' +
              '</div>' +
              '<label class="kk-field" style="max-width:240px">' +
                '<span class="kk-label">Geschwisterrabatt (%)</span>' +
                '<input class="kk-input" type="number" name="siblingDiscount" value="10" min="0" max="100">' +
              '</label>' +
            '</div>' +
            '<label class="kk-checkbox">' +
              '<input type="checkbox" name="addSecondPrice" id="kk-second-price-toggle">' +
              '<span class="kk-checkbox-box"></span>' +
              '<span>Zweite Preisoption hinzufügen <span class="kk-hint">(z. B. Einzelstunde)</span></span>' +
            '</label>' +
            '<div class="kk-price-row kk-price-secondary" id="kk-price-secondary" style="display:none">' +
              '<div class="kk-grid-4">' +
                '<label class="kk-field">' +
                  '<span class="kk-label">Art</span>' +
                  '<select class="kk-input" name="priceModel2">' + priceModelOptions + '</select>' +
                '</label>' +
                '<label class="kk-field">' +
                  '<span class="kk-label">Bezeichnung</span>' +
                  '<input class="kk-input" type="text" name="priceLabel2" placeholder="z. B. Drop-in">' +
                '</label>' +
                '<label class="kk-field">' +
                  '<span class="kk-label">Preis (EUR)</span>' +
                  '<input class="kk-input" type="number" name="priceAmount2" min="0" step="0.50" placeholder="15">' +
                '</label>' +
                '<label class="kk-field">' +
                  '<span class="kk-label">Wochen / Einheiten</span>' +
                  '<input class="kk-input" type="number" name="priceUnits2" min="1" placeholder="1">' +
                '</label>' +
              '</div>' +
            '</div>' +
          '</section>' +

          // ZAHLUNG
          '<section class="kk-section">' +
            '<div class="kk-section-label">Zahlungsoptionen</div>' +
            '<div class="kk-pay-row">' +
              '<label class="kk-checkbox">' +
                '<input type="checkbox" name="payOnline" checked>' +
                '<span class="kk-checkbox-box"></span>' +
                '<span>Online bezahlen <span class="kk-hint">(Stripe / PayPal)</span></span>' +
              '</label>' +
              '<label class="kk-checkbox">' +
                '<input type="checkbox" name="payOnSite" checked>' +
                '<span class="kk-checkbox-box"></span>' +
                '<span>Vor Ort bezahlen</span>' +
              '</label>' +
              '<label class="kk-checkbox">' +
                '<input type="checkbox" name="payInvoice">' +
                '<span class="kk-checkbox-box"></span>' +
                '<span>Auf Rechnung <span class="kk-hint">(SEPA-Lastschrift)</span></span>' +
              '</label>' +
            '</div>' +
          '</section>' +

          // KALENDERFARBE
          '<section class="kk-section">' +
            '<div class="kk-section-label">Kalenderfarbe</div>' +
            '<div class="kk-color-picker" role="radiogroup" aria-label="Kalenderfarbe">' + colorPicker + '</div>' +
          '</section>' +

        '</div>' +

        '<footer class="kk-foot">' +
          '<button type="button" class="kk-btn kk-btn-ghost" data-action="cancel">Abbrechen</button>' +
          '<button type="button" class="kk-btn kk-btn-primary" data-action="submit">Kurs anlegen</button>' +
        '</footer>' +
      '</div>';
  }

  function renderScheduleRow(weekdayOptions, todayISO, isFirst) {
    return '<div class="kk-schedule-row">' +
      '<div class="kk-grid-5">' +
        '<label class="kk-field">' +
          '<span class="kk-label">Tag</span>' +
          '<select class="kk-input" name="schedule[][day]">' + weekdayOptions + '</select>' +
        '</label>' +
        '<label class="kk-field">' +
          '<span class="kk-label">Von</span>' +
          '<input class="kk-input" type="time" name="schedule[][start]" value="15:00" step="900">' +
        '</label>' +
        '<label class="kk-field">' +
          '<span class="kk-label">Bis</span>' +
          '<input class="kk-input" type="time" name="schedule[][end]" value="16:00" step="900">' +
        '</label>' +
        '<label class="kk-field">' +
          '<span class="kk-label">Ab Datum</span>' +
          '<input class="kk-input" type="date" name="schedule[][from]" value="' + todayISO + '">' +
        '</label>' +
        '<label class="kk-field">' +
          '<span class="kk-label">Bis Datum <span class="kk-hint">(optional)</span></span>' +
          '<input class="kk-input" type="date" name="schedule[][until]">' +
        '</label>' +
      '</div>' +
      (isFirst ? '' : '<button type="button" class="kk-row-remove" aria-label="Tag entfernen" data-action="remove-day">×</button>') +
    '</div>';
  }

  // ============================================================
  // Wiring
  // ============================================================
  function wireBehavior(overlay, options) {
    var modal = overlay.querySelector('.ukc-kurs-modal');

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close(overlay);
    });
    overlay.querySelector('.kk-close').addEventListener('click', function () { close(overlay); });
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', function () { close(overlay); });

    // ESC
    var escHandler = function (e) {
      if (e.key === 'Escape' && overlay.parentElement) {
        close(overlay);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // AI-Generate
    var aiBtn = overlay.querySelector('[data-action="ai-describe"]');
    aiBtn.addEventListener('click', function () {
      var cat = overlay.querySelector('[name="category"]').value;
      var ta = overlay.querySelector('[name="description"]');
      var orig = aiBtn.innerHTML;
      aiBtn.disabled = true;
      aiBtn.classList.add('loading');
      aiBtn.innerHTML = '<span class="kk-mini-spinner"></span><span>Generiere…</span>';
      ta.classList.add('kk-pulse');
      setTimeout(function () {
        ta.value = AI_DESC[cat] || AI_DESC.sonstige;
        ta.classList.remove('kk-pulse');
        aiBtn.disabled = false;
        aiBtn.classList.remove('loading');
        aiBtn.innerHTML = orig;
        toast('Beschreibung von KI generiert · feel free to refine', 'success', 2400);
      }, 1300);
    });

    // Add/Remove Schedule-Day
    var schedule = overlay.querySelector('#kk-schedule');
    var addBtn = overlay.querySelector('[data-action="add-day"]');
    addBtn.addEventListener('click', function () {
      var weekdayOptions = WEEKDAYS.map(function (d) { return '<option value="' + d.value + '">' + d.label + '</option>'; }).join('');
      var todayISO = new Date().toISOString().slice(0, 10);
      var wrapper = document.createElement('div');
      wrapper.innerHTML = renderScheduleRow(weekdayOptions, todayISO, false);
      schedule.appendChild(wrapper.firstChild);
      // Animation
      var newRow = schedule.lastChild;
      newRow.classList.add('kk-row-entering');
      requestAnimationFrame(function () {
        newRow.classList.remove('kk-row-entering');
      });
    });
    schedule.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-action="remove-day"]');
      if (!rm) return;
      var row = rm.closest('.kk-schedule-row');
      if (!row) return;
      row.classList.add('kk-row-leaving');
      setTimeout(function () { row.remove(); }, 200);
    });

    // Zweite Preisoption Toggle
    var secondToggle = overlay.querySelector('#kk-second-price-toggle');
    var secondRow = overlay.querySelector('#kk-price-secondary');
    secondToggle.addEventListener('change', function () {
      secondRow.style.display = secondToggle.checked ? '' : 'none';
    });

    // Color-Picker
    overlay.querySelectorAll('.kk-color').forEach(function (btn) {
      btn.addEventListener('click', function () {
        overlay.querySelectorAll('.kk-color').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    // Submit
    overlay.querySelector('[data-action="submit"]').addEventListener('click', function () {
      var data = collectData(overlay);
      if (!data.title) {
        toast('Bitte einen Kursnamen eingeben', 'warning', 2200);
        var t = overlay.querySelector('[name="title"]');
        if (t) { t.focus(); t.classList.add('kk-error'); setTimeout(function () { t.classList.remove('kk-error'); }, 1500); }
        return;
      }
      if (!data.priceAmount || data.priceAmount <= 0) {
        toast('Bitte einen Preis größer als 0 eingeben', 'warning', 2200);
        var p = overlay.querySelector('[name="priceAmount"]');
        if (p) { p.focus(); p.classList.add('kk-error'); setTimeout(function () { p.classList.remove('kk-error'); }, 1500); }
        return;
      }
      // Submit
      var submitBtn = this;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="kk-mini-spinner"></span><span>Speichern…</span>';
      setTimeout(function () {
        toast('„' + data.title + '" angelegt · Kursblock erstellt', 'success', 3000);
        close(overlay);
        if (typeof options.onSubmit === 'function') options.onSubmit(data);
      }, 900);
    });
  }

  function collectData(overlay) {
    var data = {};
    overlay.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.name && !el.name.includes('[]')) {
        if (el.type === 'checkbox') data[el.name] = el.checked;
        else data[el.name] = el.type === 'number' ? parseFloat(el.value) : el.value;
      }
    });
    // Schedule (multiple)
    var rows = overlay.querySelectorAll('.kk-schedule-row');
    data.schedule = Array.prototype.map.call(rows, function (row) {
      return {
        day: row.querySelector('[name="schedule[][day]"]').value,
        start: row.querySelector('[name="schedule[][start]"]').value,
        end: row.querySelector('[name="schedule[][end]"]').value,
        from: row.querySelector('[name="schedule[][from]"]').value,
        until: row.querySelector('[name="schedule[][until]"]').value || null,
      };
    });
    // Color
    var color = overlay.querySelector('.kk-color.active');
    data.color = color ? color.dataset.color : 'eltern-kind';
    return data;
  }

  function toast(msg, kind, duration) {
    if (typeof window.ukcToast === 'function') window.ukcToast(msg, kind || 'info', duration || 2400);
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function escAttr(s) { return escHtml(s); }

  // ============================================================
  // Auto-Hook in „Neuer Kurs"-Buttons
  // ============================================================
  function hookButtons() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('button, a');
      if (!btn) return;
      var txt = (btn.textContent || '').trim().toLowerCase();
      if (/^[+\s]*neuer kurs|^[+\s]*kurs anlegen|^[+\s]*neuen kurs/.test(txt)) {
        // Skip wenn schon Modal offen oder Button im Selection-Toast
        if (document.querySelector('.ukc-kurs-overlay')) return;
        if (btn.closest('.ukc-selection-toast, .ukc-undo-chip')) return;
        e.preventDefault();
        e.stopPropagation();
        build({});
      }
    }, true); // capture vor dashboard-ui.js' generic handlers
  }

  // ============================================================
  // Styles
  // ============================================================
  var css = document.createElement('style');
  css.textContent = [
    '.ukc-kurs-overlay {',
    '  position: fixed; inset: 0;',
    '  background: rgba(60,33,36,0.55); backdrop-filter: blur(6px);',
    '  display: flex; align-items: flex-start; justify-content: center;',
    '  padding: 5vh 20px 5vh; z-index: 1500;',
    '  opacity: 0; transition: opacity 220ms;',
    '  overflow-y: auto;',
    '}',
    '.ukc-kurs-overlay.show { opacity: 1; }',
    '.ukc-kurs-modal {',
    '  width: 100%; max-width: 720px;',
    '  background: #FFF9F5; border-radius: 18px;',
    '  box-shadow: 0 30px 80px rgba(60,33,36,0.3);',
    '  font-family: "Inter", ui-sans-serif, sans-serif;',
    '  color: #3C2124;',
    '  display: flex; flex-direction: column;',
    '  max-height: calc(100vh - 80px);',
    '  transform: translateY(16px); opacity: 0;',
    '  transition: transform 280ms cubic-bezier(.2,.8,.2,1), opacity 240ms;',
    '  overflow: hidden;',
    '}',
    '.ukc-kurs-overlay.show .ukc-kurs-modal { transform: translateY(0); opacity: 1; }',

    // Head
    '.kk-head {',
    '  padding: 22px 28px 18px; border-bottom: 1px solid rgba(60,33,36,0.08);',
    '  display: flex; justify-content: space-between; align-items: flex-start;',
    '  background: linear-gradient(180deg, #FFEFE1, #FFF9F5);',
    '  flex-shrink: 0;',
    '}',
    '.kk-kicker {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;',
    '  color: #C49980; margin-bottom: 4px;',
    '}',
    '.kk-title {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 28px; color: #3C2124; line-height: 1.1; letter-spacing: 0.005em;',
    '}',
    '.kk-title em {',
    '  font-family: "Fraunces", serif; font-style: italic; font-weight: 400;',
    '  color: #CC895E; letter-spacing: 0;',
    '}',
    '.kk-close {',
    '  width: 32px; height: 32px; border-radius: 50%;',
    '  background: transparent; border: none; cursor: pointer;',
    '  color: #3C2124; font-size: 22px; line-height: 1;',
    '  transition: background 140ms;',
    '}',
    '.kk-close:hover { background: rgba(60,33,36,0.08); }',

    // Body
    '.kk-body { padding: 22px 28px; overflow-y: auto; flex: 1; }',
    '.kk-body::-webkit-scrollbar { width: 6px; }',
    '.kk-body::-webkit-scrollbar-thumb { background: rgba(60,33,36,0.18); border-radius: 4px; }',

    '.kk-section { margin-bottom: 22px; }',
    '.kk-section:last-child { margin-bottom: 0; }',
    '.kk-section-fieldset {',
    '  background: rgba(255,239,225,0.5);',
    '  border: 1px solid rgba(60,33,36,0.06);',
    '  border-radius: 12px; padding: 16px 18px;',
    '}',
    '.kk-section-label {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;',
    '  color: #A78776; margin-bottom: 12px;',
    '}',

    // Field
    '.kk-field { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; }',
    '.kk-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
    '.kk-label {',
    '  font-family: "Inter", sans-serif; font-weight: 600;',
    '  font-size: 11.5px; color: #5E3D3F; letter-spacing: 0.02em;',
    '}',
    '.kk-req { color: #B4523A; }',
    '.kk-hint { color: #A78776; font-weight: 400; font-size: 11px; }',
    '.kk-input {',
    '  font-family: "Inter", sans-serif; font-size: 13.5px; color: #3C2124;',
    '  padding: 9px 12px; border: 1px solid rgba(60,33,36,0.14);',
    '  border-radius: 9px; background: #FFFFFF;',
    '  transition: border 140ms, box-shadow 140ms;',
    '  width: 100%;',
    '  appearance: none;',
    '}',
    '.kk-input:focus {',
    '  outline: none; border-color: #CC895E;',
    '  box-shadow: 0 0 0 3px rgba(204,137,94,0.18);',
    '}',
    '.kk-input.kk-error { border-color: #B4523A; box-shadow: 0 0 0 3px rgba(180,82,58,0.16); }',
    '.kk-input.kk-pulse { animation: kkPulse 800ms ease; }',
    '@keyframes kkPulse { 0%,100% { background:#FFFFFF } 50% { background:#FFEFE1 } }',
    '.kk-textarea { resize: vertical; min-height: 70px; font-family: "Inter", sans-serif; }',
    'select.kk-input {',
    '  background-image: url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%23C49980\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E");',
    '  background-repeat: no-repeat; background-position: right 12px center;',
    '  padding-right: 30px;',
    '}',

    // Layouts
    '.kk-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }',
    '.kk-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 10px; }',
    '.kk-grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; }',
    '.kk-grid-5 { display: grid; grid-template-columns: 0.8fr 1fr 1fr 1fr 1fr; gap: 10px; }',
    '@media (max-width: 640px) {',
    '  .kk-grid-3, .kk-grid-4, .kk-grid-5 { grid-template-columns: 1fr 1fr; }',
    '  .kk-grid-2 { grid-template-columns: 1fr; }',
    '}',
    '.kk-age-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: 6px; align-items: end; }',
    '.kk-age-sep { padding: 9px 0; color: #A78776; font-weight: 600; }',

    // Schedule
    '.kk-schedule { display: flex; flex-direction: column; gap: 12px; }',
    '.kk-schedule-row {',
    '  position: relative; padding: 12px 14px;',
    '  background: #FFFFFF; border-radius: 10px;',
    '  border: 1px solid rgba(60,33,36,0.08);',
    '  transition: opacity 200ms, transform 200ms;',
    '}',
    '.kk-schedule-row.kk-row-entering { opacity: 0; transform: translateY(-6px); }',
    '.kk-schedule-row.kk-row-leaving { opacity: 0; transform: translateY(-6px); }',
    '.kk-row-remove {',
    '  position: absolute; top: 8px; right: 8px;',
    '  width: 24px; height: 24px; border-radius: 50%;',
    '  background: transparent; border: none; cursor: pointer;',
    '  color: #B4523A; font-size: 18px; line-height: 1;',
    '  transition: background 140ms;',
    '}',
    '.kk-row-remove:hover { background: rgba(180,82,58,0.12); }',
    '.kk-add {',
    '  display: inline-flex; align-items: center; gap: 6px;',
    '  margin-top: 10px; padding: 7px 14px;',
    '  background: transparent; border: 1px dashed rgba(204,137,94,0.5);',
    '  border-radius: 999px; color: #CC895E; cursor: pointer;',
    '  font-family: inherit; font-size: 12.5px; font-weight: 600;',
    '  transition: all 140ms;',
    '}',
    '.kk-add:hover { background: rgba(204,137,94,0.08); border-style: solid; }',
    '.kk-add-icon { font-weight: 700; font-size: 14px; }',

    // Price
    '.kk-price-row { margin-bottom: 12px; }',
    '.kk-price-secondary {',
    '  border-top: 1px dashed rgba(60,33,36,0.1);',
    '  padding-top: 12px; margin-top: 12px;',
    '  animation: kkSlide 220ms cubic-bezier(.2,.8,.2,1);',
    '}',
    '@keyframes kkSlide { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }',

    // Checkbox (custom)
    '.kk-checkbox {',
    '  display: inline-flex; align-items: center; gap: 9px;',
    '  cursor: pointer; user-select: none;',
    '  font-size: 13px; color: #3C2124;',
    '  margin-top: 8px;',
    '}',
    '.kk-checkbox input { position: absolute; opacity: 0; pointer-events: none; }',
    '.kk-checkbox-box {',
    '  width: 18px; height: 18px; border-radius: 5px;',
    '  border: 1.5px solid rgba(60,33,36,0.25);',
    '  background: #FFFFFF; flex-shrink: 0;',
    '  transition: all 140ms;',
    '  position: relative;',
    '}',
    '.kk-checkbox input:checked + .kk-checkbox-box {',
    '  background: #CC895E; border-color: #CC895E;',
    '}',
    '.kk-checkbox input:checked + .kk-checkbox-box::after {',
    '  content: ""; position: absolute; left: 5px; top: 1px;',
    '  width: 5px; height: 9px;',
    '  border: solid #FFEFE1; border-width: 0 2px 2px 0;',
    '  transform: rotate(45deg);',
    '}',
    '.kk-checkbox input:focus + .kk-checkbox-box { box-shadow: 0 0 0 3px rgba(204,137,94,0.18); }',
    '.kk-pay-row { display: flex; flex-wrap: wrap; gap: 18px; }',
    '.kk-pay-row .kk-checkbox { margin-top: 0; }',

    // AI-Button
    '.kk-ai-btn {',
    '  display: inline-flex; align-items: center; gap: 5px;',
    '  padding: 4px 11px; border-radius: 999px;',
    '  background: linear-gradient(135deg, #FDE4D3, #F5DCC5);',
    '  color: #B4523A; border: 1px solid rgba(204,137,94,0.3);',
    '  font-family: inherit; font-weight: 600; font-size: 11px;',
    '  cursor: pointer; transition: all 140ms;',
    '}',
    '.kk-ai-btn:hover { background: linear-gradient(135deg, #F5DCC5, #E2B48E); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(180,82,58,0.18); }',
    '.kk-ai-btn:disabled { opacity: 0.7; cursor: progress; transform: none; }',
    '.kk-ai-btn svg { transition: transform 1.5s linear; }',
    '.kk-ai-btn.loading svg { transform: rotate(360deg); }',
    '.kk-mini-spinner {',
    '  display: inline-block; width: 11px; height: 11px;',
    '  border: 1.5px solid rgba(180,82,58,0.25);',
    '  border-top-color: #B4523A; border-radius: 50%;',
    '  animation: kkSpin 700ms linear infinite;',
    '}',
    '@keyframes kkSpin { to { transform: rotate(360deg); } }',

    // Color-Picker
    '.kk-color-picker { display: flex; flex-wrap: wrap; gap: 8px; }',
    '.kk-color {',
    '  width: 30px; height: 30px; border-radius: 50%;',
    '  border: 2px solid transparent;',
    '  background: var(--dot); cursor: pointer;',
    '  transition: all 160ms cubic-bezier(.2,.8,.2,1);',
    '  position: relative;',
    '  padding: 0;',
    '}',
    '.kk-color:hover { transform: scale(1.12); }',
    '.kk-color.active {',
    '  border-color: var(--ring);',
    '  transform: scale(1.1);',
    '  box-shadow: 0 0 0 3px rgba(255,239,225,1), 0 0 0 4px var(--ring);',
    '}',
    '.kk-color.active::after {',
    '  content: ""; position: absolute; inset: 0;',
    '  display: flex; align-items: center; justify-content: center;',
    '  background-image: url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'9\' viewBox=\'0 0 12 9\'%3E%3Cpath d=\'M1 4l3 3 7-7\' stroke=\'%233C2124\' stroke-width=\'1.8\' fill=\'none\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E");',
    '  background-repeat: no-repeat; background-position: center;',
    '}',

    // Foot
    '.kk-foot {',
    '  padding: 16px 28px 22px; border-top: 1px solid rgba(60,33,36,0.08);',
    '  background: rgba(60,33,36,0.025);',
    '  display: flex; justify-content: flex-end; gap: 8px;',
    '  flex-shrink: 0;',
    '}',
    '.kk-btn {',
    '  font-family: "Inter", sans-serif; font-weight: 600; font-size: 13.5px;',
    '  padding: 10px 22px; border-radius: 999px;',
    '  border: none; cursor: pointer; transition: all 140ms;',
    '  display: inline-flex; align-items: center; gap: 7px; min-height: 40px;',
    '}',
    '.kk-btn-ghost { background: transparent; color: #3C2124; border: 1px solid rgba(60,33,36,0.18); }',
    '.kk-btn-ghost:hover { background: rgba(60,33,36,0.06); }',
    '.kk-btn-primary { background: #CC895E; color: #FFEFE1; }',
    '.kk-btn-primary:hover { background: #B8784F; transform: translateY(-1px); box-shadow: 0 6px 14px rgba(204,137,94,0.3); }',
    '.kk-btn-primary:disabled { opacity: 0.7; cursor: progress; transform: none; }',
  ].join('\n');
  document.head.appendChild(css);

  // ============================================================
  // Public API
  // ============================================================
  window.openKursCreatorV2 = build;
  window.closeKursCreatorV2 = close;

  // Auto-Hook nach DOMContentLoaded
  function init() { hookButtons(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
