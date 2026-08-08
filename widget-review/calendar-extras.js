/* ============================================================
 * UKC Calendar · Extras
 * ============================================================
 * Drei Features oben auf dem DnD-Skript:
 *   1) Click-to-Create — Klick auf leeren Slot → Modal → neuer Termin
 *   2) Event-Resize   — Bottom-Handle ziehen → Dauer ändern
 *   3) Hover-Tooltip  — Rich Details beim Hover nach 500 ms
 *
 * Teilt Snap-Logik (15 min) und Style-Tokens mit calendar-dnd.js.
 * ============================================================ */
(function () {
  if (window.__ukcCalExtrasInjected) return;
  window.__ukcCalExtrasInjected = true;

  // Snap + Grid-Konstanten (müssen mit calendar-dnd.js übereinstimmen)
  var STORAGE_KEY_CREATED = 'ukc_cal_created_v1';
  var STORAGE_KEY_EDITS = 'ukc_cal_edits_v1';      // eventId → {title, start, end, room, category, capacity}
  var STORAGE_KEY_DELETED = 'ukc_cal_deleted_v1';  // Array von eventIds
  var SLOT_MINUTES = 15;
  var PX_PER_HOUR = 56;
  var PX_PER_MIN = PX_PER_HOUR / 60;
  var PX_PER_SLOT = PX_PER_MIN * SLOT_MINUTES;
  var START_HOUR = 9;
  var MIN_DURATION_MIN = 30;

  var CATEGORIES = [
    { key: 'eltern-kind', label: 'Eltern-Kind', color: '#FDE4D3' },
    { key: 'bewegung',    label: 'Bewegung',    color: '#E4EBDE' },
    { key: 'musik',       label: 'Musik',       color: '#F5D5C9' },
    { key: 'kreativ',     label: 'Kreativ',     color: '#F5DCC5' },
  ];

  var WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  var ROOMS = ['Raum 1', 'Raum 2', 'Raum 3'];

  function toast(msg, kind, duration) {
    if (typeof window.ukcToast === 'function') window.ukcToast(msg, kind || 'info', duration || 2400);
  }

  function fmtMin(totalMin) {
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function topToMinutes(top) { return START_HOUR * 60 + Math.round(top / PX_PER_MIN); }
  function heightToMin(h) { return Math.round(h / PX_PER_MIN); }
  function minToHeight(m) { return Math.round(m * PX_PER_MIN); }
  function minToTop(startMin) { return (startMin - START_HOUR * 60) * PX_PER_MIN; }

  function loadCreated() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_CREATED) || '[]'); } catch (e) { return []; }
  }
  function saveCreated(list) {
    try { localStorage.setItem(STORAGE_KEY_CREATED, JSON.stringify(list)); } catch (e) {}
  }
  function loadEdits() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_EDITS) || '{}'); } catch (e) { return {}; }
  }
  function saveEdits(map) {
    try { localStorage.setItem(STORAGE_KEY_EDITS, JSON.stringify(map)); } catch (e) {}
  }
  function loadDeleted() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_DELETED) || '[]'); } catch (e) { return []; }
  }
  function saveDeleted(list) {
    try { localStorage.setItem(STORAGE_KEY_DELETED, JSON.stringify(list)); } catch (e) {}
  }

  // Event-ID (stabil) — aus Title+Meta oder dataset
  function eventIdOf(el) {
    if (el.dataset.eventId) return el.dataset.eventId;
    var title = (el.querySelector('.cal-event-title, .day-event-title') || {}).textContent || '';
    var meta = (el.querySelector('.cal-event-meta, .day-event-meta') || {}).textContent || '';
    var col = el.parentElement;
    var colIdx = col ? Array.prototype.indexOf.call(col.parentElement.children, col) : 0;
    var id = 'ev_' + (title + meta).trim().slice(0, 32).replace(/[^a-z0-9]/gi, '_') + '_c' + colIdx;
    el.dataset.eventId = id;
    return id;
  }

  // Current event state aus DOM lesen
  function readEventState(el) {
    var isDay = el.classList.contains('day-event');
    var top = parseFloat(el.style.top) || 0;
    var height = parseFloat(el.style.height) || 60;
    var startMin = topToMinutes(top);
    var endMin = startMin + heightToMin(height);
    var title = (el.querySelector('.cal-event-title, .day-event-title') || {}).textContent || '';
    var cat = 'eltern-kind';
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (el.classList.contains(CATEGORIES[i].key)) { cat = CATEGORIES[i].key; break; }
    }
    // Raum + Capacity aus meta (Format week: "09:30 · Raum 2 · 8/10")
    var room = 'Raum 1';
    var capacity = 10;
    var metaEl = el.querySelector('.cal-event-meta, .day-event-meta');
    if (metaEl) {
      var metaTxt = metaEl.textContent;
      var roomMatch = metaTxt.match(/Raum\s+\d+/i);
      if (roomMatch) room = roomMatch[0];
      var capMatch = metaTxt.match(/(\d+)\s*\/\s*(\d+)/);
      if (capMatch) capacity = parseInt(capMatch[2], 10);
    }
    return {
      mode: isDay ? 'day' : 'week',
      top: top,
      height: height,
      startMin: startMin,
      endMin: endMin,
      title: title.trim(),
      category: cat,
      room: room,
      capacity: capacity,
    };
  }

  // Lane-Helfer (vereinfachte Kopie aus calendar-dnd.js — muss konsistent bleiben)
  function recomputeLanes(column, selector) {
    var events = Array.prototype.slice.call(column.querySelectorAll(selector));
    events.forEach(function (e) {
      for (var i = 0; i < 5; i++) for (var j = 0; j < 5; j++) e.classList.remove('lane-' + i + '-of-' + j);
    });
    var clusters = [];
    events.sort(function (a, b) { return parseFloat(a.style.top) - parseFloat(b.style.top); });
    events.forEach(function (e) {
      var top = parseFloat(e.style.top) || 0;
      var bot = top + (parseFloat(e.style.height) || 60);
      var match = null;
      for (var c = 0; c < clusters.length; c++) {
        var has = clusters[c].items.some(function (o) {
          var ot = parseFloat(o.style.top) || 0; var ob = ot + (parseFloat(o.style.height) || 60);
          return top < ob && bot > ot;
        });
        if (has) { match = clusters[c]; break; }
      }
      if (match) match.items.push(e); else clusters.push({ items: [e] });
    });
    clusters.forEach(function (cl) {
      if (cl.items.length <= 1) return;
      cl.items.forEach(function (e, i) { e.classList.add('lane-' + i + '-of-' + cl.items.length); });
    });
  }

  function hasConflict(column, top, height, ignoreEl, selector) {
    var bot = top + height;
    var others = column.querySelectorAll(selector);
    for (var i = 0; i < others.length; i++) {
      if (others[i] === ignoreEl) continue;
      var ot = parseFloat(others[i].style.top) || 0;
      var ob = ot + (parseFloat(others[i].style.height) || 60);
      if (top < ob && bot > ot) return others[i];
    }
    return null;
  }

  // ==========================================================
  // FEATURE 1: Click-to-Create  (+ Edit-Modus)
  // ==========================================================
  function buildCreateModal(defaults, onSubmit, onDelete) {
    var isEdit = !!defaults.isEdit;
    var overlay = document.createElement('div');
    overlay.className = 'ukc-create-overlay';

    var catOptions = CATEGORIES.map(function (c) {
      var sel = c.key === defaults.category ? ' selected' : '';
      return '<option value="' + c.key + '"' + sel + '>' + c.label + '</option>';
    }).join('');

    var roomOptions = ROOMS.map(function (r) {
      var sel = r === defaults.room ? ' selected' : '';
      return '<option value="' + r + '"' + sel + '>' + r + '</option>';
    }).join('');

    var titleVal = escapeHtml(defaults.title || '');
    var capacityVal = defaults.capacity || 10;
    var kicker = isEdit ? 'Kurs bearbeiten' : 'Neuer Kurs';
    var submitLbl = isEdit ? 'Speichern' : 'Kurs anlegen';
    var deleteBtn = isEdit && typeof onDelete === 'function'
      ? '<button class="ukc-btn ukc-btn-destructive" data-action="delete">Löschen</button>'
      : '<span class="ukc-foot-spacer"></span>';

    overlay.innerHTML =
      '<div class="ukc-create-modal">' +
        '<div class="ukc-create-head">' +
          '<div class="ukc-create-kicker">' + kicker + '</div>' +
          '<h3 class="ukc-create-title">' + defaults.dayLabel + ' · ' + fmtMin(defaults.startMin) + '</h3>' +
          '<button class="ukc-create-close" aria-label="Schließen">×</button>' +
        '</div>' +
        '<div class="ukc-create-body">' +
          '<label class="ukc-field"><span class="ukc-field-label">Kurs-Titel</span>' +
            '<input type="text" class="ukc-field-input" name="title" placeholder="z. B. Musikgarten Junior" value="' + titleVal + '"' + (isEdit ? '' : ' autofocus') + '>' +
          '</label>' +
          '<div class="ukc-field-row">' +
            '<label class="ukc-field"><span class="ukc-field-label">Start</span>' +
              '<input type="time" class="ukc-field-input" name="start" value="' + fmtMin(defaults.startMin) + '" step="900">' +
            '</label>' +
            '<label class="ukc-field"><span class="ukc-field-label">Ende</span>' +
              '<input type="time" class="ukc-field-input" name="end" value="' + fmtMin(defaults.endMin) + '" step="900">' +
            '</label>' +
          '</div>' +
          '<div class="ukc-field-row">' +
            '<label class="ukc-field"><span class="ukc-field-label">Raum</span>' +
              '<select class="ukc-field-input" name="room">' + roomOptions + '</select>' +
            '</label>' +
            '<label class="ukc-field"><span class="ukc-field-label">Kategorie</span>' +
              '<select class="ukc-field-input" name="category">' + catOptions + '</select>' +
            '</label>' +
          '</div>' +
          '<label class="ukc-field"><span class="ukc-field-label">Max. Teilnehmer</span>' +
            '<input type="number" class="ukc-field-input" name="capacity" min="1" max="50" value="' + capacityVal + '">' +
          '</label>' +
        '</div>' +
        '<div class="ukc-create-foot">' +
          deleteBtn +
          '<div class="ukc-foot-right">' +
            '<button class="ukc-btn ukc-btn-ghost" data-action="cancel">Abbrechen</button>' +
            '<button class="ukc-btn ukc-btn-primary" data-action="create">' + submitLbl + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('show'); });

    function close() {
      overlay.classList.remove('show');
      setTimeout(function () { if (overlay.parentElement) overlay.remove(); }, 220);
    }

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);
    overlay.querySelector('.ukc-create-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    overlay.querySelector('[data-action="create"]').addEventListener('click', function () {
      var data = {};
      overlay.querySelectorAll('input, select').forEach(function (f) { data[f.name] = f.value; });
      if (!data.title || !data.title.trim()) {
        var tInput = overlay.querySelector('input[name="title"]');
        tInput.focus();
        tInput.style.borderColor = '#B4523A';
        toast('Bitte Kurs-Titel eingeben', 'warning', 1800);
        return;
      }
      var r = onSubmit(data);
      if (r === false) return; // submit failed (e.g. conflict)
      close();
    });

    var delBtn = overlay.querySelector('[data-action="delete"]');
    if (delBtn) {
      delBtn.addEventListener('click', function () {
        if (onDelete()) close();
      });
    }

    // ESC schließt
    function escHandler(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    }
    document.addEventListener('keydown', escHandler);
  }

  function createEventElement(mode, data) {
    // mode: 'week' | 'day'
    var cls = mode === 'day' ? 'day-event' : 'cal-event';
    var el = document.createElement('div');
    el.className = cls + ' ' + data.category + ' ukc-created-event';

    var startMin = parseTimeToMin(data.start);
    var endMin = parseTimeToMin(data.end);
    if (endMin - startMin < MIN_DURATION_MIN) endMin = startMin + MIN_DURATION_MIN;
    var top = minToTop(startMin);
    var height = minToHeight(endMin - startMin);
    el.style.top = top + 'px';
    el.style.height = height + 'px';

    if (mode === 'day') {
      el.innerHTML =
        '<div class="day-event-title">' + escapeHtml(data.title) + '</div>' +
        '<div class="day-event-time">' + fmtMin(startMin) + ' – ' + fmtMin(endMin) + ' Uhr</div>' +
        '<div class="day-event-meta">0 / ' + data.capacity + ' Kinder · neu angelegt</div>';
    } else {
      el.innerHTML =
        '<div class="cal-event-title">' + escapeHtml(data.title) + '</div>' +
        '<div class="cal-event-meta">' + fmtMin(startMin) + ' · ' + data.room + ' · 0/' + data.capacity + '</div>';
    }
    // ID für DnD-Persistence
    el.dataset.eventId = 'created_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    el.dataset.createdAt = Date.now().toString();
    return el;
  }

  function parseTimeToMin(hhmm) {
    var p = (hhmm || '09:00').split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1] || '0', 10);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function onEmptySlotClick(e) {
    // Ignoriere Klicks auf Events selbst oder resize-Handles
    if (e.target.closest('.cal-event, .day-event, .ukc-resize-handle')) return;

    // Nur linke Taste + kein Drag aktiv
    if (e.button !== 0) return;
    if (window.__ukcDragActive) return; // Flag aus DnD-Skript, falls vorhanden

    var weekBody = e.target.closest('.cal-grid-body');
    var dayBody = e.target.closest('.day-grid-body');
    if (!weekBody && !dayBody) return;

    var mode = dayBody ? 'day' : 'week';
    var columnSelector = mode === 'day' ? '.day-room-col' : '.cal-day-col';
    var eventSelector = mode === 'day' ? '.day-event' : '.cal-event';
    var column = e.target.closest(columnSelector);
    if (!column) return;

    // Klick muss auf einen leeren Bereich / .cal-hour / .day-hour treffen
    if (!e.target.matches('.cal-hour, .day-hour, .cal-day-col, .day-room-col')) return;

    var rect = column.getBoundingClientRect();
    var rawTop = e.clientY - rect.top;
    var snappedTop = Math.max(0, Math.round(rawTop / PX_PER_SLOT) * PX_PER_SLOT);
    var startMin = topToMinutes(snappedTop);
    var endMin = startMin + 60; // default 60min

    // Column-Identifiers (Day / Room)
    var colIdx = Array.prototype.indexOf.call(column.parentElement.children, column);
    var dayLabel, defaultRoom;
    if (mode === 'day') {
      // 4 Kinder im day-grid-body: time-col, raum1, raum2, raum3 → colIdx 1,2,3
      var roomIdx = colIdx - 1;
      defaultRoom = ROOMS[roomIdx] || ROOMS[0];
      dayLabel = 'Donnerstag · ' + defaultRoom;
    } else {
      // 8 Kinder: time-col, Mo..So → colIdx 1..7
      var dayIdx = colIdx - 1;
      dayLabel = WEEKDAYS[dayIdx] || 'Tag';
      defaultRoom = 'Raum 1';
    }

    buildCreateModal({
      startMin: startMin,
      endMin: endMin,
      dayLabel: dayLabel,
      room: defaultRoom,
      category: 'eltern-kind',
    }, function (data) {
      var startM = parseTimeToMin(data.start);
      var endM = parseTimeToMin(data.end);
      if (endM - startM < MIN_DURATION_MIN) {
        toast('Mindestdauer 30 Minuten', 'warning', 2000);
        return false;
      }
      var top = minToTop(startM);
      var height = minToHeight(endM - startM);
      // Konflikt-Check
      var conflict = hasConflict(column, top, height, null, eventSelector);
      if (conflict) {
        var cTitle = (conflict.querySelector('.cal-event-title, .day-event-title') || {}).textContent || 'Anderer Kurs';
        toast('Konflikt: Überschneidung mit "' + cTitle + '"', 'warning', 3000);
        return false;
      }
      var el = createEventElement(mode, data);
      column.appendChild(el);
      recomputeLanes(column, eventSelector);
      // In localStorage persistieren
      var list = loadCreated();
      list.push({
        id: el.dataset.eventId,
        mode: mode,
        colIdx: colIdx,
        title: data.title,
        start: data.start,
        end: data.end,
        room: data.room,
        category: data.category,
        capacity: parseInt(data.capacity, 10) || 10,
      });
      saveCreated(list);
      toast('"' + data.title + '" angelegt · ' + fmtMin(startM) + '–' + fmtMin(endM), 'success', 3000);
      return true;
    });
  }

  // ==========================================================
  // FEATURE 1b: Edit / Delete / Duplicate Helper
  // ==========================================================
  function openEditModal(el) {
    var state = readEventState(el);
    var mode = state.mode;
    var column = el.parentElement;
    var colIdx = Array.prototype.indexOf.call(column.parentElement.children, column);

    var dayLabel;
    if (mode === 'day') {
      var roomIdx = colIdx - 1;
      dayLabel = 'Do · ' + (ROOMS[roomIdx] || state.room);
    } else {
      var dayIdx = colIdx - 1;
      dayLabel = WEEKDAYS[dayIdx] || 'Tag';
    }

    buildCreateModal({
      isEdit: true,
      startMin: state.startMin,
      endMin: state.endMin,
      dayLabel: dayLabel,
      title: state.title,
      room: state.room,
      category: state.category,
      capacity: state.capacity,
    }, function onSubmit(data) {
      return applyEdit(el, data);
    }, function onDelete() {
      return confirmDelete(el);
    });
  }

  function applyEdit(el, data) {
    var state = readEventState(el);
    var column = el.parentElement;
    var eventSelector = state.mode === 'day' ? '.day-event' : '.cal-event';
    var startM = parseTimeToMin(data.start);
    var endM = parseTimeToMin(data.end);
    if (endM - startM < MIN_DURATION_MIN) {
      toast('Mindestdauer 30 Minuten', 'warning', 2000);
      return false;
    }
    var newTop = minToTop(startM);
    var newHeight = minToHeight(endM - startM);
    var conflict = hasConflict(column, newTop, newHeight, el, eventSelector);
    if (conflict) {
      var cTitle = (conflict.querySelector('.cal-event-title, .day-event-title') || {}).textContent || 'Anderer Kurs';
      toast('Konflikt mit "' + cTitle + '"', 'warning', 2800);
      return false;
    }

    // Klassen-Update (Category)
    CATEGORIES.forEach(function (c) { el.classList.remove(c.key); });
    el.classList.add(data.category);

    // Geometry
    el.style.top = newTop + 'px';
    el.style.height = newHeight + 'px';

    // Text-Content
    var titleEl = el.querySelector('.cal-event-title, .day-event-title');
    if (titleEl) titleEl.textContent = data.title;

    if (state.mode === 'day') {
      var timeEl = el.querySelector('.day-event-time');
      if (timeEl) timeEl.textContent = fmtMin(startM) + ' – ' + fmtMin(endM) + ' Uhr';
      var mEl = el.querySelector('.day-event-meta');
      if (mEl) {
        // "8 / 10 Kinder · Warteliste: 2" → Zahlen bewahren, Kapazität ersetzen
        var curCountMatch = mEl.textContent.match(/(\d+)\s*\/\s*\d+/);
        var curCount = curCountMatch ? curCountMatch[1] : '0';
        mEl.textContent = curCount + ' / ' + data.capacity + ' Kinder · ' + (el.dataset.createdAt ? 'bearbeitet' : 'aktualisiert');
      }
    } else {
      var metaEl = el.querySelector('.cal-event-meta');
      if (metaEl) {
        metaEl.textContent = fmtMin(startM) + ' · ' + data.room + ' · 0/' + data.capacity;
      }
    }

    // Persistenz: User-created vs. HTML-template
    var id = eventIdOf(el);
    var created = loadCreated();
    var createdEntry = created.find(function (c) { return c.id === id; });
    if (createdEntry) {
      createdEntry.title = data.title;
      createdEntry.start = data.start;
      createdEntry.end = data.end;
      createdEntry.room = data.room;
      createdEntry.category = data.category;
      createdEntry.capacity = parseInt(data.capacity, 10) || 10;
      saveCreated(created);
    } else {
      var edits = loadEdits();
      edits[id] = {
        title: data.title,
        start: data.start,
        end: data.end,
        room: data.room,
        category: data.category,
        capacity: parseInt(data.capacity, 10) || 10,
      };
      saveEdits(edits);
    }

    recomputeLanes(column, eventSelector);
    toast('"' + data.title + '" aktualisiert', 'success', 2400);
    return true;
  }

  function confirmDelete(el) {
    var state = readEventState(el);
    var title = state.title || 'Termin';
    var column = el.parentElement;
    var eventSelector = state.mode === 'day' ? '.day-event' : '.cal-event';
    var id = eventIdOf(el);

    // Snapshot für Undo
    var snapshot = {
      id: id,
      parent: column,
      nextSibling: el.nextSibling,
      html: el.outerHTML,
    };

    el.remove();
    recomputeLanes(column, eventSelector);

    // Persist
    var created = loadCreated();
    var wasCreated = created.find(function (c) { return c.id === id; });
    if (wasCreated) {
      created = created.filter(function (c) { return c.id !== id; });
      saveCreated(created);
    } else {
      var deleted = loadDeleted();
      if (deleted.indexOf(id) === -1) { deleted.push(id); saveDeleted(deleted); }
    }

    toast('"' + title + '" gelöscht', 'warning', 4000);
    showDeleteUndoChip(snapshot, wasCreated);
    return true;
  }

  function showDeleteUndoChip(snapshot, wasCreated) {
    var chip = document.createElement('div');
    chip.className = 'ukc-undo-chip';
    chip.innerHTML = '<span>Gelöscht</span><button>Zurückholen</button>';
    document.body.appendChild(chip);
    requestAnimationFrame(function () { chip.classList.add('show'); });

    chip.querySelector('button').addEventListener('click', function () {
      // Restore DOM
      var tmp = document.createElement('div');
      tmp.innerHTML = snapshot.html;
      var restored = tmp.firstElementChild;
      if (snapshot.nextSibling && snapshot.parent.contains(snapshot.nextSibling)) {
        snapshot.parent.insertBefore(restored, snapshot.nextSibling);
      } else {
        snapshot.parent.appendChild(restored);
      }
      var selector = restored.classList.contains('day-event') ? '.day-event' : '.cal-event';
      recomputeLanes(snapshot.parent, selector);
      // Resize-Handle wieder ergänzen
      if (!restored.querySelector('.ukc-resize-handle')) {
        var h = document.createElement('div'); h.className = 'ukc-resize-handle'; restored.appendChild(h);
      }

      // Persist-Store
      if (wasCreated) {
        var created = loadCreated();
        created.push(wasCreated);
        saveCreated(created);
      } else {
        var deleted = loadDeleted().filter(function (i) { return i !== snapshot.id; });
        saveDeleted(deleted);
      }

      chip.remove();
      toast('Wiederhergestellt', 'success', 1600);
    });

    setTimeout(function () {
      if (chip.parentElement) chip.classList.remove('show');
      setTimeout(function () { if (chip.parentElement) chip.remove(); }, 300);
    }, 6000);
  }

  function duplicateEvent(el) {
    var state = readEventState(el);
    var column = el.parentElement;
    var eventSelector = state.mode === 'day' ? '.day-event' : '.cal-event';
    var columnSelector = state.mode === 'day' ? '.day-room-col' : '.cal-day-col';

    // Ziel: gleiche Spalte, Start +90min (um direkt sichtbar zu bleiben)
    var newStartMin = state.startMin + 90;
    var duration = state.endMin - state.startMin;
    var newEndMin = newStartMin + duration;
    var newTop = minToTop(newStartMin);
    var newHeight = minToHeight(duration);

    // Nicht aus dem Grid rausdrücken
    var maxTop = 10 * PX_PER_HOUR - newHeight;
    if (newTop > maxTop) {
      // Rutsche hoch: finde ersten konfliktfreien Slot ab top 0
      newTop = 0; newStartMin = START_HOUR * 60; newEndMin = newStartMin + duration;
    }

    // Konflikt-Check: suche freien Slot (in 15-min-Schritten) nach unten
    var candidateTop = newTop;
    var tries = 0;
    while (hasConflict(column, candidateTop, newHeight, null, eventSelector) && tries < 20) {
      candidateTop += PX_PER_SLOT;
      if (candidateTop + newHeight > 10 * PX_PER_HOUR) {
        toast('Kein freier Slot in dieser Spalte gefunden', 'warning', 2800);
        return;
      }
      tries++;
    }
    newTop = candidateTop;
    newStartMin = topToMinutes(newTop);
    newEndMin = newStartMin + duration;

    // Clone
    var clone = createEventElement(state.mode, {
      title: state.title + ' (Kopie)',
      start: fmtMin(newStartMin),
      end: fmtMin(newEndMin),
      room: state.room,
      category: state.category,
      capacity: state.capacity,
    });
    column.appendChild(clone);
    recomputeLanes(column, eventSelector);

    // Persistenz: als "created"
    var colIdx = Array.prototype.indexOf.call(column.parentElement.children, column);
    var list = loadCreated();
    list.push({
      id: clone.dataset.eventId,
      mode: state.mode,
      colIdx: colIdx,
      title: state.title + ' (Kopie)',
      start: fmtMin(newStartMin),
      end: fmtMin(newEndMin),
      room: state.room,
      category: state.category,
      capacity: state.capacity,
    });
    saveCreated(list);

    toast('"' + state.title + '" dupliziert → ' + fmtMin(newStartMin), 'success', 2800);
  }

  // ==========================================================
  // FEATURE 2: Event-Resize (Bottom-Handle)
  // ==========================================================
  function addResizeHandles() {
    document.querySelectorAll('.cal-event, .day-event').forEach(function (el) {
      if (el.querySelector('.ukc-resize-handle')) return;
      var h = document.createElement('div');
      h.className = 'ukc-resize-handle';
      el.appendChild(h);
    });
  }

  var resize = null;

  function onResizeStart(e) {
    var handle = e.target.closest('.ukc-resize-handle');
    if (!handle || e.button !== 0) return;
    var el = handle.parentElement;
    e.preventDefault();
    e.stopPropagation();

    var column = el.parentElement;
    var isDay = el.classList.contains('day-event');

    resize = {
      el: el,
      column: column,
      mode: isDay ? 'day' : 'week',
      eventSelector: isDay ? '.day-event' : '.cal-event',
      origHeight: parseFloat(el.style.height) || 60,
      origTop: parseFloat(el.style.top) || 0,
      startY: e.clientY,
    };
    el.classList.add('resizing');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    window.__ukcDragActive = true;
  }

  function onResizeMove(e) {
    if (!resize) return;
    var delta = e.clientY - resize.startY;
    var rawHeight = resize.origHeight + delta;
    // Snap to PX_PER_SLOT
    var snapped = Math.max(minToHeight(MIN_DURATION_MIN), Math.round(rawHeight / PX_PER_SLOT) * PX_PER_SLOT);
    // Nicht aus Grid raus
    var maxHeight = 10 * PX_PER_HOUR - resize.origTop;
    if (snapped > maxHeight) snapped = maxHeight;

    // Konflikt-Preview
    var conflict = hasConflict(resize.column, resize.origTop, snapped, resize.el, resize.eventSelector);
    resize.el.style.height = snapped + 'px';
    resize.el.classList.toggle('resize-conflict', !!conflict);

    // Live time-text
    var startMin = topToMinutes(resize.origTop);
    var endMin = startMin + heightToMin(snapped);
    resize.el.title = fmtMin(startMin) + ' – ' + fmtMin(endMin);
  }

  function onResizeEnd(e) {
    if (!resize) return;
    var finalHeight = parseFloat(resize.el.style.height);
    var conflict = hasConflict(resize.column, resize.origTop, finalHeight, resize.el, resize.eventSelector);
    resize.el.classList.remove('resizing', 'resize-conflict');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (conflict) {
      var cTitle = (conflict.querySelector('.cal-event-title, .day-event-title') || {}).textContent || 'Anderer Kurs';
      resize.el.style.height = resize.origHeight + 'px';
      toast('Konflikt mit "' + cTitle + '" — Dauer zurückgesetzt', 'warning', 2600);
    } else if (finalHeight !== resize.origHeight) {
      // Update time-text
      var startMin = topToMinutes(resize.origTop);
      var endMin = startMin + heightToMin(finalHeight);
      var timeEl = resize.el.querySelector('.day-event-time');
      if (timeEl) timeEl.textContent = fmtMin(startMin) + ' – ' + fmtMin(endMin) + ' Uhr';
      var metaEl = resize.el.querySelector('.cal-event-meta');
      if (metaEl) {
        var parts = metaEl.textContent.split('·');
        if (parts.length) { parts[0] = ' ' + fmtMin(startMin) + ' '; metaEl.textContent = parts.join('·').trim(); }
      }
      recomputeLanes(resize.column, resize.eventSelector);
      var title = (resize.el.querySelector('.cal-event-title, .day-event-title') || {}).textContent || 'Termin';
      toast(title + ' → ' + fmtMin(startMin) + '–' + fmtMin(endMin) + ' (' + heightToMin(finalHeight) + ' min)', 'success', 2800);
    }
    resize = null;
    setTimeout(function () { window.__ukcDragActive = false; }, 50);
  }

  // ==========================================================
  // FEATURE 3: Hover-Tooltip (rich)
  // ==========================================================
  var tooltipEl = null;
  var tooltipTimer = null;   // pending show-timer
  var tooltipHideTimer = null; // pending hide-timer
  var tooltipTarget = null;

  function cancelTooltipHide() {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
  }
  function scheduleTooltipHide() {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = setTimeout(function () {
      hideTooltip();
    }, 220);
  }

  function buildTooltip() {
    if (tooltipEl) return;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'ukc-event-tooltip';
    // Wenn der User über den Tooltip hovert: Hide canceln
    tooltipEl.addEventListener('mouseenter', cancelTooltipHide);
    // Wenn er den Tooltip verlässt: neue Hide-Timer
    tooltipEl.addEventListener('mouseleave', scheduleTooltipHide);
    document.body.appendChild(tooltipEl);
  }

  function showTooltip(el, x, y) {
    buildTooltip();
    cancelTooltipHide();
    var title = (el.querySelector('.cal-event-title, .day-event-title') || {}).textContent || 'Termin';
    var timeTxt = (el.querySelector('.day-event-time') || el.querySelector('.cal-event-meta') || { textContent: '' }).textContent;
    var metaTxt = (el.querySelector('.day-event-meta') || { textContent: '' }).textContent || timeTxt;

    // Category aus Class-List
    var cat = CATEGORIES.find(function (c) { return el.classList.contains(c.key); }) || CATEGORIES[0];

    tooltipEl.innerHTML =
      '<div class="tt-head" style="background:' + cat.color + '">' +
        '<div class="tt-cat">' + cat.label + '</div>' +
        '<div class="tt-title">' + escapeHtml(title) + '</div>' +
      '</div>' +
      '<div class="tt-body">' +
        '<div class="tt-row"><span class="tt-label">Zeit</span><span class="tt-val">' + escapeHtml(timeTxt) + '</span></div>' +
        (metaTxt !== timeTxt ? '<div class="tt-row"><span class="tt-label">Status</span><span class="tt-val">' + escapeHtml(metaTxt) + '</span></div>' : '') +
      '</div>' +
      '<div class="tt-foot">' +
        '<button class="tt-btn tt-btn-ghost" data-action="duplicate" title="Duplizieren (Ctrl+D)">⎘ Duplizieren</button>' +
        '<button class="tt-btn tt-btn-primary" data-action="edit">Bearbeiten</button>' +
      '</div>';

    // Actions verdrahten — Target des Tooltips = el (closure-capture)
    var tEl = el;
    tooltipEl.querySelector('[data-action="duplicate"]').onclick = function (ev) {
      ev.stopPropagation();
      hideTooltip();
      duplicateEvent(tEl);
    };
    tooltipEl.querySelector('[data-action="edit"]').onclick = function (ev) {
      ev.stopPropagation();
      hideTooltip();
      openEditModal(tEl);
    };

    // Position
    var rect = el.getBoundingClientRect();
    var ttRect = { w: 280, h: 180 };
    var left = rect.right + 12;
    var top = rect.top;
    // Flip wenn aus Viewport
    if (left + ttRect.w > window.innerWidth - 10) left = rect.left - ttRect.w - 12;
    if (left < 10) left = 10;
    if (top + ttRect.h > window.innerHeight - 10) top = window.innerHeight - ttRect.h - 10;
    if (top < 10) top = 10;

    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
    tooltipEl.classList.add('show');
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.classList.remove('show');
    tooltipTarget = null;
  }

  function onEventHoverEnter(e) {
    var el = e.target.closest('.cal-event, .day-event');
    if (!el) return;
    if (el === tooltipTarget) return;
    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(function () {
      tooltipTarget = el;
      showTooltip(el, e.clientX, e.clientY);
    }, 500);
  }

  function onEventHoverLeave(e) {
    var el = e.target.closest('.cal-event, .day-event');
    if (!el) return;
    // Pending Show abbrechen (falls noch nicht gezeigt)
    clearTimeout(tooltipTimer);
    // Hide verzögern — so bleibt Zeit, den Tooltip zu betreten
    scheduleTooltipHide();
  }

  // ==========================================================
  // Restore persisted: created + edits + deletes
  // ==========================================================
  function restoreCreated() {
    // 1) Deleted IDs: HTML-template-Events mit passenden IDs aus DOM entfernen
    var deleted = loadDeleted();
    if (deleted.length) {
      document.querySelectorAll('.cal-event, .day-event').forEach(function (el) {
        var id = eventIdOf(el); // assigned also for HTML-template
        if (deleted.indexOf(id) !== -1) el.remove();
      });
    }

    // 2) Edits auf verbleibende DOM-Events anwenden
    var edits = loadEdits();
    Object.keys(edits).forEach(function (id) {
      var el = document.querySelector('[data-event-id="' + id + '"]');
      if (!el) return;
      var e = edits[id];
      var startM = parseTimeToMin(e.start);
      var endM = parseTimeToMin(e.end);
      CATEGORIES.forEach(function (c) { el.classList.remove(c.key); });
      if (e.category) el.classList.add(e.category);
      el.style.top = minToTop(startM) + 'px';
      el.style.height = minToHeight(endM - startM) + 'px';
      var tEl = el.querySelector('.cal-event-title, .day-event-title');
      if (tEl) tEl.textContent = e.title;
      var isDay = el.classList.contains('day-event');
      if (isDay) {
        var timeEl = el.querySelector('.day-event-time');
        if (timeEl) timeEl.textContent = fmtMin(startM) + ' – ' + fmtMin(endM) + ' Uhr';
        var mEl = el.querySelector('.day-event-meta');
        if (mEl) mEl.textContent = '0 / ' + e.capacity + ' Kinder · bearbeitet';
      } else {
        var metaEl = el.querySelector('.cal-event-meta');
        if (metaEl) metaEl.textContent = fmtMin(startM) + ' · ' + e.room + ' · 0/' + e.capacity;
      }
    });

    // 3) Neue User-Events einspielen
    var list = loadCreated();
    list.forEach(function (entry) {
      if (document.querySelector('[data-event-id="' + entry.id + '"]')) return;
      var body = document.querySelector(entry.mode === 'day' ? '.day-grid-body' : '.cal-grid-body');
      if (!body) return;
      var column = body.children[entry.colIdx];
      if (!column) return;
      var selector = entry.mode === 'day' ? '.day-room-col' : '.cal-day-col';
      if (!column.matches(selector)) return;
      var el = createEventElement(entry.mode, {
        title: entry.title,
        start: entry.start,
        end: entry.end,
        room: entry.room,
        category: entry.category,
        capacity: entry.capacity,
      });
      el.dataset.eventId = entry.id;
      column.appendChild(el);
    });

    document.querySelectorAll('.cal-day-col').forEach(function (c) { recomputeLanes(c, '.cal-event'); });
    document.querySelectorAll('.day-room-col').forEach(function (c) { recomputeLanes(c, '.day-event'); });
  }

  // ==========================================================
  // Styles
  // ==========================================================
  var css = document.createElement('style');
  css.textContent = [
    // --- Resize-Handle ---
    // Kein position: relative Override — .cal-event/.day-event sind bereits position: absolute
    '.ukc-resize-handle {',
    '  position: absolute; left: 0; right: 0; bottom: 0;',
    '  height: 8px; cursor: ns-resize; z-index: 3;',
    '  background: transparent;',
    '  transition: background .14s ease;',
    '}',
    '.ukc-resize-handle::after {',
    '  content: ""; position: absolute; left: 50%; bottom: 2px;',
    '  transform: translateX(-50%);',
    '  width: 20px; height: 3px;',
    '  background: rgba(60,33,36,0.25);',
    '  border-radius: 2px;',
    '  opacity: 0;',
    '  transition: opacity .14s ease;',
    '}',
    '.cal-event:hover .ukc-resize-handle::after,',
    '.day-event:hover .ukc-resize-handle::after { opacity: 1; }',
    '.cal-event.resizing, .day-event.resizing { transition: none !important; box-shadow: 0 10px 30px rgba(60,33,36,0.25) !important; }',
    '.cal-event.resize-conflict, .day-event.resize-conflict { outline: 2px solid #B4523A; outline-offset: -2px; }',

    // --- Hover-Cursor für Empty-Slots ---
    '.cal-hour, .day-hour { cursor: copy; }',
    '.cal-hour:hover, .day-hour:hover { background: rgba(204,137,94,0.08); }',

    // --- Create-Modal ---
    '.ukc-create-overlay {',
    '  position: fixed; inset: 0;',
    '  background: rgba(60,33,36,0.5); backdrop-filter: blur(6px);',
    '  display: flex; align-items: center; justify-content: center;',
    '  padding: 20px; z-index: 1200;',
    '  opacity: 0; transition: opacity 220ms;',
    '}',
    '.ukc-create-overlay.show { opacity: 1; }',
    '.ukc-create-modal {',
    '  background: #FFF9F5; border: 1px solid rgba(60,33,36,0.1);',
    '  border-radius: 16px; max-width: 520px; width: 100%;',
    '  box-shadow: 0 20px 60px rgba(60,33,36,0.25);',
    '  transform: translateY(12px); opacity: 0;',
    '  transition: transform 260ms cubic-bezier(.2,.8,.2,1), opacity 260ms;',
    '  font-family: "Inter", sans-serif;',
    '  overflow: hidden;',
    '}',
    '.ukc-create-overlay.show .ukc-create-modal { transform: translateY(0); opacity: 1; }',
    '.ukc-create-head {',
    '  padding: 22px 28px 16px; border-bottom: 1px solid rgba(60,33,36,0.08);',
    '  position: relative;',
    '}',
    '.ukc-create-kicker {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;',
    '  color: #C49980; margin-bottom: 4px;',
    '}',
    '.ukc-create-title {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 24px; color: #3C2124; letter-spacing: 0.01em;',
    '}',
    '.ukc-create-close {',
    '  position: absolute; top: 14px; right: 16px;',
    '  width: 32px; height: 32px; border-radius: 50%;',
    '  background: transparent; border: none; cursor: pointer;',
    '  color: #3C2124; font-size: 22px; line-height: 1;',
    '  transition: background .14s;',
    '}',
    '.ukc-create-close:hover { background: rgba(60,33,36,0.08); }',
    '.ukc-create-body { padding: 22px 28px; display: flex; flex-direction: column; gap: 14px; }',
    '.ukc-field { display: flex; flex-direction: column; gap: 6px; flex: 1; }',
    '.ukc-field-label {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;',
    '  color: #C49980;',
    '}',
    '.ukc-field-input {',
    '  font-family: "Inter", sans-serif; font-size: 14px;',
    '  padding: 10px 14px; border: 1px solid rgba(60,33,36,0.15);',
    '  border-radius: 10px; background: #FFEFE1; color: #3C2124;',
    '  transition: border-color .14s, box-shadow .14s;',
    '}',
    '.ukc-field-input:focus {',
    '  outline: none; border-color: #CC895E;',
    '  box-shadow: 0 0 0 3px rgba(204,137,94,0.2);',
    '}',
    '.ukc-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }',
    '.ukc-create-foot {',
    '  padding: 16px 28px 22px; display: flex; justify-content: flex-end; gap: 8px;',
    '  border-top: 1px solid rgba(60,33,36,0.08); background: rgba(60,33,36,0.02);',
    '}',
    '.ukc-btn {',
    '  font-family: "Inter", sans-serif; font-weight: 600; font-size: 13px;',
    '  padding: 10px 18px; border-radius: 999px; border: none; cursor: pointer;',
    '  transition: all .14s;',
    '}',
    '.ukc-btn-primary { background: #CC895E; color: #FFEFE1; }',
    '.ukc-btn-primary:hover { background: #B8784F; }',
    '.ukc-btn-ghost { background: transparent; color: #3C2124; border: 1px solid rgba(60,33,36,0.18); }',
    '.ukc-btn-ghost:hover { background: rgba(60,33,36,0.06); }',
    '.ukc-btn-destructive { background: transparent; color: #B4523A; border: 1px solid rgba(180,82,58,0.3); }',
    '.ukc-btn-destructive:hover { background: #B4523A; color: #FFEFE1; border-color: #B4523A; }',
    '.ukc-create-foot { justify-content: space-between !important; }',
    '.ukc-foot-right { display: flex; gap: 8px; }',
    '.ukc-foot-spacer { flex: 0 0 1px; }',

    // --- Hover-Tooltip ---
    '.ukc-event-tooltip {',
    '  position: fixed; width: 280px;',
    '  background: #FFF9F5; border: 1px solid rgba(60,33,36,0.12);',
    '  border-radius: 14px; overflow: hidden;',
    '  box-shadow: 0 20px 50px rgba(60,33,36,0.2);',
    '  font-family: "Inter", sans-serif;',
    '  opacity: 0; transform: translateX(-6px);',
    '  transition: opacity 180ms, transform 180ms cubic-bezier(.2,.8,.2,1);',
    '  z-index: 1150; pointer-events: none;',
    '}',
    '.ukc-event-tooltip.show { opacity: 1; transform: translateX(0); pointer-events: auto; }',
    '.ukc-event-tooltip .tt-head { padding: 14px 16px 12px; }',
    '.ukc-event-tooltip .tt-cat {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;',
    '  color: #3C2124; opacity: 0.65; margin-bottom: 4px;',
    '}',
    '.ukc-event-tooltip .tt-title {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 18px; color: #3C2124; line-height: 1.2;',
    '}',
    '.ukc-event-tooltip .tt-body { padding: 14px 16px; }',
    '.ukc-event-tooltip .tt-row {',
    '  display: flex; justify-content: space-between; gap: 12px;',
    '  padding: 6px 0; border-bottom: 1px solid rgba(60,33,36,0.06);',
    '  font-size: 13px;',
    '}',
    '.ukc-event-tooltip .tt-row:last-child { border-bottom: none; }',
    '.ukc-event-tooltip .tt-label { color: #C49980; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }',
    '.ukc-event-tooltip .tt-val { color: #3C2124; text-align: right; }',
    '.ukc-event-tooltip .tt-foot {',
    '  display: flex; gap: 8px; padding: 12px 16px;',
    '  background: rgba(60,33,36,0.02); border-top: 1px solid rgba(60,33,36,0.06);',
    '}',
    '.ukc-event-tooltip .tt-btn {',
    '  flex: 1; padding: 8px 12px; border-radius: 999px; border: none;',
    '  font-family: "Inter", sans-serif; font-size: 12px; font-weight: 600; cursor: pointer;',
    '  transition: background .14s;',
    '}',
    '.ukc-event-tooltip .tt-btn-primary { background: #CC895E; color: #FFEFE1; }',
    '.ukc-event-tooltip .tt-btn-primary:hover { background: #B8784F; }',
    '.ukc-event-tooltip .tt-btn-ghost { background: rgba(60,33,36,0.06); color: #3C2124; }',
    '.ukc-event-tooltip .tt-btn-ghost:hover { background: rgba(60,33,36,0.12); }',

    // Undo-Chip (falls calendar-dnd.js nicht geladen ist — idempotent)
    '.ukc-undo-chip {',
    '  position: fixed; right: 20px; bottom: 20px;',
    '  background: #3C2124; color: #FFEFE1;',
    '  padding: 10px 14px; border-radius: 999px;',
    '  box-shadow: 0 10px 32px rgba(60,33,36,0.3);',
    '  display: flex; align-items: center; gap: 12px;',
    '  font-family: "Inter", sans-serif; font-size: 13px;',
    '  transform: translateY(24px); opacity: 0;',
    '  transition: transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms;',
    '  z-index: 1100;',
    '}',
    '.ukc-undo-chip.show { transform: translateY(0); opacity: 1; }',
    '.ukc-undo-chip button {',
    '  background: #CC895E; color: #FFEFE1; border: none;',
    '  padding: 6px 14px; border-radius: 999px;',
    '  font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer;',
    '}',
    '.ukc-undo-chip button:hover { background: #B8784F; }',

    // Now-Indicator
    '.ukc-now-indicator {',
    '  position: absolute; left: 0; right: 0; height: 2px;',
    '  background: #B4523A;',
    '  z-index: 40; pointer-events: none;',
    '  transition: top 600ms cubic-bezier(.2,.8,.2,1);',
    '}',
    '.ukc-now-indicator .now-dot {',
    '  position: absolute; left: -4px; top: -4px;',
    '  width: 10px; height: 10px; border-radius: 50%;',
    '  background: #B4523A;',
    '  box-shadow: 0 0 0 3px rgba(180,82,58,0.25);',
    '}',
    '.ukc-now-indicator .now-time {',
    '  position: absolute; left: 8px; top: -9px;',
    '  background: #B4523A; color: #FFEFE1;',
    '  font-family: "Inter", sans-serif; font-size: 10px; font-weight: 700;',
    '  font-variant-numeric: tabular-nums;',
    '  padding: 2px 6px; border-radius: 4px; letter-spacing: 0.02em;',
    '}',

    // Multi-Select Ring
    '.cal-event.ukc-selected, .day-event.ukc-selected {',
    '  outline: 2px solid #CC895E; outline-offset: 2px;',
    '  box-shadow: 0 0 0 4px rgba(204,137,94,0.15), 0 4px 12px rgba(60,33,36,0.12) !important;',
    '}',

    // Selection-Toast (Bottom-Bar mit Bulk-Actions)
    '.ukc-selection-toast {',
    '  position: fixed; left: 50%; bottom: 20px;',
    '  transform: translate(-50%, 24px); opacity: 0;',
    '  background: #3C2124; color: #FFEFE1;',
    '  padding: 10px 14px 10px 18px; border-radius: 999px;',
    '  display: flex; align-items: center; gap: 10px;',
    '  font-family: "Inter", sans-serif; font-size: 13px;',
    '  box-shadow: 0 14px 40px rgba(60,33,36,0.35);',
    '  transition: opacity 220ms, transform 220ms cubic-bezier(.2,.8,.2,1);',
    '  z-index: 1100;',
    '}',
    '.ukc-selection-toast.show { opacity: 1; transform: translate(-50%, 0); }',
    '.ukc-selection-toast .sel-count {',
    '  font-weight: 700; padding-right: 4px;',
    '  border-right: 1px solid rgba(255,239,225,0.15); margin-right: 4px;',
    '}',
    '.ukc-selection-toast button {',
    '  background: transparent; color: #FFEFE1;',
    '  border: 1px solid rgba(255,239,225,0.2); padding: 6px 12px; border-radius: 999px;',
    '  font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer;',
    '  transition: all 140ms;',
    '}',
    '.ukc-selection-toast button:hover { background: rgba(255,239,225,0.12); }',
    '.ukc-selection-toast .sel-clear { border-color: transparent; opacity: 0.6; }',
    '.ukc-selection-toast .sel-clear:hover { opacity: 1; background: transparent; }',

    // Shortcuts-Modal
    '.ukc-shortcuts-modal { max-width: 560px; }',
    '.ukc-shortcuts-modal .sc-group { margin-bottom: 20px; }',
    '.ukc-shortcuts-modal .sc-group:last-child { margin-bottom: 0; }',
    '.ukc-shortcuts-modal .sc-group-label {',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700;',
    '  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;',
    '  color: #C49980; margin-bottom: 8px;',
    '  padding-bottom: 6px; border-bottom: 1px solid rgba(60,33,36,0.06);',
    '}',
    '.ukc-shortcuts-modal .sc-row {',
    '  display: grid; grid-template-columns: auto 1fr; gap: 10px;',
    '  align-items: center; padding: 8px 0; font-size: 13px; color: #3C2124;',
    '}',
    '.ukc-shortcuts-modal .sc-row > span { padding-left: 6px; }',
    '.ukc-shortcuts-fab {',
    '  position: fixed; left: 20px; bottom: 20px;',
    '  width: 36px; height: 36px; border-radius: 50%;',
    '  background: #3C2124; color: #FFEFE1;',
    '  border: none; cursor: pointer;',
    '  font-family: "Barlow Condensed", sans-serif; font-weight: 700; font-size: 18px;',
    '  box-shadow: 0 6px 18px rgba(60,33,36,0.25);',
    '  z-index: 900;',
    '  opacity: 0.78; transition: opacity 140ms, transform 140ms;',
    '  display: flex; align-items: center; justify-content: center;',
    '}',
    '.ukc-shortcuts-fab:hover { opacity: 1; transform: translateY(-2px); }',
    '.ukc-shortcuts-modal .sc-row kbd {',
    '  font-family: "Inter", sans-serif; font-weight: 600; font-size: 11px;',
    '  background: #FFEFE1; color: #3C2124;',
    '  border: 1px solid rgba(60,33,36,0.18);',
    '  border-bottom: 2px solid rgba(60,33,36,0.22);',
    '  padding: 3px 8px; border-radius: 5px;',
    '  margin-right: 4px; letter-spacing: 0.02em;',
    '  min-width: 28px; display: inline-flex; justify-content: center;',
    '}',
  ].join('\n');
  document.head.appendChild(css);

  // ==========================================================
  // FEATURE 4: Now-Indicator (aktuelle Uhrzeit als Linie)
  // ==========================================================
  function renderNowIndicator() {
    var now = new Date();
    var minutes = now.getHours() * 60 + now.getMinutes();
    var inRange = minutes >= START_HOUR * 60 && minutes <= (START_HOUR + 10) * 60;
    var topPx = inRange ? (minutes - START_HOUR * 60) * PX_PER_MIN : -9999;

    // Week-View: nur die today-Column
    var weekToday = document.querySelector('.cal-day-col.today');
    if (weekToday) {
      var ind = weekToday.querySelector('.ukc-now-indicator');
      if (!ind) {
        ind = document.createElement('div');
        ind.className = 'ukc-now-indicator';
        ind.innerHTML = '<span class="now-dot"></span><span class="now-time"></span>';
        weekToday.appendChild(ind);
      }
      ind.style.top = topPx + 'px';
      ind.style.display = inRange ? '' : 'none';
      var tLbl = ind.querySelector('.now-time');
      if (tLbl) tLbl.textContent = fmtMin(minutes);
    }

    // Day-View: über alle 3 Raum-Columns (Day-View IST heute)
    var dayRooms = document.querySelectorAll('.day-room-col');
    dayRooms.forEach(function (col, idx) {
      var ind = col.querySelector('.ukc-now-indicator');
      if (!ind) {
        ind = document.createElement('div');
        ind.className = 'ukc-now-indicator';
        if (idx === 0) ind.innerHTML = '<span class="now-dot"></span><span class="now-time"></span>';
        col.appendChild(ind);
      }
      ind.style.top = topPx + 'px';
      ind.style.display = inRange ? '' : 'none';
      var tL = ind.querySelector('.now-time');
      if (tL) tL.textContent = fmtMin(minutes);
    });
  }

  function startNowTicker() {
    renderNowIndicator();
    setInterval(renderNowIndicator, 60 * 1000);
  }

  // ==========================================================
  // FEATURE 5: Multi-Select (Ctrl/Shift+Click) + Bulk-Actions
  // ==========================================================
  var selectedEvents = [];

  function isSelected(el) { return selectedEvents.indexOf(el) !== -1; }

  function toggleSelected(el) {
    if (isSelected(el)) {
      selectedEvents = selectedEvents.filter(function (e) { return e !== el; });
      el.classList.remove('ukc-selected');
    } else {
      selectedEvents.push(el);
      el.classList.add('ukc-selected');
    }
    updateSelectionToast();
  }

  function clearSelection() {
    selectedEvents.forEach(function (el) { el.classList.remove('ukc-selected'); });
    selectedEvents = [];
    hideSelectionToast();
  }

  var selectionToastEl = null;
  function updateSelectionToast() {
    if (selectedEvents.length === 0) { hideSelectionToast(); return; }
    if (!selectionToastEl) {
      selectionToastEl = document.createElement('div');
      selectionToastEl.className = 'ukc-selection-toast';
      document.body.appendChild(selectionToastEl);
    }
    selectionToastEl.innerHTML =
      '<span class="sel-count">' + selectedEvents.length + ' ausgewählt</span>' +
      '<button data-action="dup">⎘ Duplizieren</button>' +
      '<button data-action="del">🗑 Löschen</button>' +
      '<button data-action="clear" class="sel-clear">Aufheben</button>';
    requestAnimationFrame(function () { selectionToastEl.classList.add('show'); });

    selectionToastEl.querySelector('[data-action="dup"]').onclick = function () {
      var snap = selectedEvents.slice();
      snap.forEach(function (el) { duplicateEvent(el); });
      clearSelection();
    };
    selectionToastEl.querySelector('[data-action="del"]').onclick = function () {
      var snap = selectedEvents.slice();
      snap.forEach(function (el) { confirmDelete(el); });
      clearSelection();
    };
    selectionToastEl.querySelector('[data-action="clear"]').onclick = clearSelection;
  }
  function hideSelectionToast() {
    if (!selectionToastEl) return;
    selectionToastEl.classList.remove('show');
  }

  function onEventSelectClick(e) {
    var el = e.target.closest('.cal-event, .day-event');
    if (!el) {
      // Klick außerhalb → Selection aufheben (aber Buttons im Selection-Toast ausnehmen)
      if (selectionToastEl && selectionToastEl.contains(e.target)) return;
      clearSelection();
      return;
    }
    // Nur mit Modifier: toggle Selection
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      toggleSelected(el);
    }
  }

  // ==========================================================
  // FEATURE 6: Shortcuts-Help-Modal (?)
  // ==========================================================
  function openShortcutsModal() {
    if (document.querySelector('.ukc-shortcuts-overlay')) return;
    var overlay = document.createElement('div');
    overlay.className = 'ukc-create-overlay ukc-shortcuts-overlay';
    overlay.innerHTML =
      '<div class="ukc-create-modal ukc-shortcuts-modal">' +
        '<div class="ukc-create-head">' +
          '<div class="ukc-create-kicker">Tastatur-Shortcuts</div>' +
          '<h3 class="ukc-create-title">Kalender <em style="font-family:Fraunces;font-style:italic;color:#CC895E">schneller</em></h3>' +
          '<button class="ukc-create-close">×</button>' +
        '</div>' +
        '<div class="ukc-create-body">' +
          '<div class="sc-group"><div class="sc-group-label">Auswahl</div>' +
            '<div class="sc-row"><kbd>Ctrl</kbd><kbd>Click</kbd><span>Event zur Auswahl hinzufügen</span></div>' +
            '<div class="sc-row"><kbd>Shift</kbd><kbd>Click</kbd><span>Event zur Auswahl hinzufügen</span></div>' +
            '<div class="sc-row"><kbd>Esc</kbd><span>Auswahl aufheben / Tooltip schließen</span></div>' +
          '</div>' +
          '<div class="sc-group"><div class="sc-group-label">Bearbeiten</div>' +
            '<div class="sc-row"><kbd>Del</kbd><span>Gehovertes Event löschen</span></div>' +
            '<div class="sc-row"><kbd>Ctrl</kbd><kbd>D</kbd><span>Gehovertes Event duplizieren</span></div>' +
          '</div>' +
          '<div class="sc-group"><div class="sc-group-label">Drag &amp; Drop</div>' +
            '<div class="sc-row"><kbd>Alt</kbd><kbd>Drag</kbd><span>Kopieren statt Verschieben</span></div>' +
            '<div class="sc-row"><kbd>Esc</kbd><span>Laufenden Drag abbrechen</span></div>' +
          '</div>' +
          '<div class="sc-group"><div class="sc-group-label">Sonstiges</div>' +
            '<div class="sc-row"><kbd>?</kbd><span>Diese Übersicht anzeigen</span></div>' +
            '<div class="sc-row"><kbd>Click</kbd><span>auf leeren Slot → Neuer Kurs</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="ukc-create-foot"><div></div><div class="ukc-foot-right">' +
          '<button class="ukc-btn ukc-btn-primary" data-action="close">Alles klar</button>' +
        '</div></div>' +
      '</div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('show'); });

    function close() {
      overlay.classList.remove('show');
      setTimeout(function () { if (overlay.parentElement) overlay.remove(); }, 220);
    }
    overlay.querySelector('.ukc-create-close').addEventListener('click', close);
    overlay.querySelector('[data-action="close"]').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }

  // ==========================================================
  // Wire everything up
  // ==========================================================
  function init() {
    // Click-to-Create: Delegation auf beide Grids
    document.addEventListener('click', onEmptySlotClick);

    // Resize-Handles anfügen + pointer-Events
    addResizeHandles();
    document.addEventListener('pointerdown', onResizeStart, true); // capture, vor DnD
    document.addEventListener('pointermove', onResizeMove);
    document.addEventListener('pointerup', onResizeEnd);

    // Hover-Tooltip via Delegation
    document.addEventListener('mouseover', onEventHoverEnter);
    document.addEventListener('mouseout', onEventHoverLeave);
    // Bei Klick auf Event (nicht Tooltip!) sofort Tooltip weg
    document.addEventListener('mousedown', function (e) {
      // Klicks innerhalb des Tooltips NICHT schließen lassen
      if (tooltipEl && tooltipEl.contains(e.target)) return;
      clearTimeout(tooltipTimer);
      cancelTooltipHide();
      hideTooltip();
    });

    // Created events wiederherstellen
    restoreCreated();

    // Multi-Select via Modifier-Click (capture, vor DnD)
    document.addEventListener('click', onEventSelectClick, true);

    // Now-Indicator
    startNowTicker();

    // Shortcuts-Discover-Button (bottom-left, dezent)
    if (document.querySelector('.cal-grid-body, .day-grid-body, .month-grid')) {
      var hbtn = document.createElement('button');
      hbtn.className = 'ukc-shortcuts-fab';
      hbtn.innerHTML = '<span>?</span>';
      hbtn.title = 'Tastatur-Shortcuts (?)';
      hbtn.addEventListener('click', openShortcutsModal);
      document.body.appendChild(hbtn);
    }

    // Keyboard-Shortcuts
    document.addEventListener('keydown', function (e) {
      var isInputFocused = document.activeElement && (
        document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'SELECT' ||
        document.activeElement.tagName === 'TEXTAREA'
      );

      if (e.key === 'Escape') {
        hideTooltip();
        if (selectedEvents.length) clearSelection();
        return;
      }

      // ? → Shortcuts-Modal
      if (!isInputFocused && (e.key === '?' || (e.key === '/' && e.shiftKey))) {
        e.preventDefault();
        openShortcutsModal();
        return;
      }

      if (isInputFocused) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEvents.length) {
          e.preventDefault();
          var snap = selectedEvents.slice();
          clearSelection();
          snap.forEach(function (el) { confirmDelete(el); });
        } else if (tooltipTarget) {
          e.preventDefault();
          var target = tooltipTarget;
          hideTooltip();
          confirmDelete(target);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        if (selectedEvents.length) {
          e.preventDefault();
          var snap2 = selectedEvents.slice();
          clearSelection();
          snap2.forEach(function (el) { duplicateEvent(el); });
        } else if (tooltipTarget) {
          e.preventDefault();
          var t = tooltipTarget;
          hideTooltip();
          duplicateEvent(t);
        }
      }
    });

    // MutationObserver: neue Events bekommen auto-Resize-Handles
    var bodies = document.querySelectorAll('.cal-grid-body, .day-grid-body');
    bodies.forEach(function (b) {
      var mo = new MutationObserver(function () { addResizeHandles(); });
      mo.observe(b, { childList: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
