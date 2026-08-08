/* ============================================================
 * UKC Calendar · Drag & Drop (Desktop)
 * ============================================================
 * Kurse per Maus verschieben, Konflikt-Check, Toast + Undo,
 * localStorage-Persistence. Scope: Week- und Day-View.
 * Month-View bleibt Read-Only (Drag day→day → Feature v2).
 *
 * Snap: 15 Minuten (14px bei 56px/Stunde).
 * Conflict: Overlap im selben Column (Raum/Tag).
 * ============================================================ */
(function () {
  if (window.__ukcCalDnDInjected) return;
  window.__ukcCalDnDInjected = true;

  var STORAGE_KEY = 'ukc_cal_dnd_v1';
  var SLOT_MINUTES = 15;
  var PX_PER_HOUR = 56;
  var PX_PER_MIN = PX_PER_HOUR / 60;
  var PX_PER_SLOT = PX_PER_MIN * SLOT_MINUTES; // 14px
  var START_HOUR = 9; // Raster beginnt 09:00

  function toast(msg, kind, duration) {
    if (typeof window.ukcToast === 'function') {
      window.ukcToast(msg, kind || 'info', duration || 2400);
    }
  }

  function makeId(el, fallbackIdx) {
    if (el.dataset.eventId) return el.dataset.eventId;
    var title = (el.querySelector('.cal-event-title, .day-event-title') || {}).textContent || '';
    var meta = (el.querySelector('.cal-event-meta, .day-event-meta') || {}).textContent || '';
    var col = el.parentElement;
    var colIdx = col ? Array.prototype.indexOf.call(col.parentElement.children, col) : 0;
    return 'ev_' + (title + meta).trim().slice(0, 32).replace(/[^a-z0-9]/gi, '_') + '_c' + colIdx + '_i' + fallbackIdx;
  }

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveStore(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function fmtMinutes(totalMin) {
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function topToMinutes(topPx) {
    return START_HOUR * 60 + Math.round(topPx / PX_PER_MIN);
  }

  function heightToMinutes(heightPx) {
    return Math.round(heightPx / PX_PER_MIN);
  }

  // Zeitfenster im event-meta-Text aktualisieren
  function updateEventTimeText(el, startMin, endMin, isDay) {
    if (isDay) {
      var timeEl = el.querySelector('.day-event-time');
      if (timeEl) timeEl.textContent = fmtMinutes(startMin) + ' – ' + fmtMinutes(endMin) + ' Uhr';
    } else {
      var metaEl = el.querySelector('.cal-event-meta');
      if (!metaEl) return;
      var txt = metaEl.textContent;
      // Format: "09:30 · Raum 2 · 8/10" → ersetze nur den Zeit-Prefix vor dem ersten "·"
      var parts = txt.split('·');
      if (parts.length > 0) {
        parts[0] = ' ' + fmtMinutes(startMin) + ' ';
        metaEl.textContent = parts.join('·').trim();
      }
    }
  }

  // Lane-Klassen entfernen (nach Drop neu vergeben für saubere Breite)
  function stripLaneClasses(el) {
    for (var i = 0; i < 5; i++) {
      for (var j = 0; j < 5; j++) {
        el.classList.remove('lane-' + i + '-of-' + j);
      }
    }
  }

  // Lanes im Column neu berechnen: alle Events im Column, die sich überlappen, teilen die Breite
  function recomputeLanes(column, eventSelector) {
    var events = Array.prototype.slice.call(column.querySelectorAll(eventSelector));
    events.forEach(function (e) { stripLaneClasses(e); });
    // Sortiere nach top
    events.sort(function (a, b) { return parseFloat(a.style.top) - parseFloat(b.style.top); });
    // Simple Greedy-Lane-Assignment
    var groups = [];
    events.forEach(function (e) {
      var top = parseFloat(e.style.top) || 0;
      var bot = top + (parseFloat(e.style.height) || 60);
      var placed = false;
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        var overlaps = group.some(function (other) {
          var otop = parseFloat(other.style.top) || 0;
          var obot = otop + (parseFloat(other.style.height) || 60);
          return top < obot && bot > otop;
        });
        if (!overlaps) { group.push(e); placed = true; break; }
      }
      if (!placed) groups.push([e]);
    });
    // Overlapping-Gruppen verschmelzen: find all events that overlap each other (transitive)
    // Simpler Weg: clusterweise overlap berechnen
    var clusters = [];
    events.forEach(function (e) {
      var top = parseFloat(e.style.top) || 0;
      var bot = top + (parseFloat(e.style.height) || 60);
      var match = null;
      for (var c = 0; c < clusters.length; c++) {
        var cluster = clusters[c];
        var overlaps = cluster.items.some(function (other) {
          var otop = parseFloat(other.style.top) || 0;
          var obot = otop + (parseFloat(other.style.height) || 60);
          return top < obot && bot > otop;
        });
        if (overlaps) { match = cluster; break; }
      }
      if (match) match.items.push(e);
      else clusters.push({ items: [e] });
    });
    clusters.forEach(function (cluster) {
      var n = cluster.items.length;
      if (n <= 1) return; // keine Lane-Klasse nötig
      cluster.items.forEach(function (e, idx) {
        e.classList.add('lane-' + idx + '-of-' + n);
      });
    });
  }

  // Konflikt-Check: Event-Overlap im Zielspalten + ausschließlich fremde Events
  function hasConflict(column, top, height, ignoreEl, eventSelector) {
    var bot = top + height;
    var others = column.querySelectorAll(eventSelector);
    for (var i = 0; i < others.length; i++) {
      if (others[i] === ignoreEl) continue;
      var otop = parseFloat(others[i].style.top) || 0;
      var obot = otop + (parseFloat(others[i].style.height) || 60);
      if (top < obot && bot > otop) return others[i];
    }
    return null;
  }

  // Finde Column unter Cursor
  function findColumnUnderCursor(x, y, columnSelector) {
    var cols = document.querySelectorAll(columnSelector);
    for (var i = 0; i < cols.length; i++) {
      var r = cols[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return cols[i];
    }
    return null;
  }

  // --------------------------------------------------------
  // DnD-State (eins pro aktiver Drag)
  // --------------------------------------------------------
  var drag = null;

  // --------------------------------------------------------
  // Drag-Time-Badge + Snap-Line
  // --------------------------------------------------------
  var timeBadgeEl = null;
  var snapLineEl = null;

  function showTimeBadge(x, y, text) {
    if (!timeBadgeEl) {
      timeBadgeEl = document.createElement('div');
      timeBadgeEl.className = 'ukc-drag-time-badge';
      document.body.appendChild(timeBadgeEl);
    }
    timeBadgeEl.textContent = text;
    timeBadgeEl.style.left = (x + 18) + 'px';
    timeBadgeEl.style.top = (y + 12) + 'px';
    timeBadgeEl.classList.add('show');
  }
  function hideTimeBadge() {
    if (timeBadgeEl) timeBadgeEl.classList.remove('show');
  }

  function showSnapLine(column, top, isDay) {
    if (!snapLineEl) {
      snapLineEl = document.createElement('div');
      snapLineEl.className = 'ukc-snap-line';
    }
    if (snapLineEl.parentElement !== column) column.appendChild(snapLineEl);
    snapLineEl.style.top = top + 'px';
    snapLineEl.classList.add('show');
  }
  function hideSnapLine() {
    if (snapLineEl && snapLineEl.parentElement) snapLineEl.parentElement.removeChild(snapLineEl);
    if (snapLineEl) snapLineEl.classList.remove('show');
  }

  function endDragVisual() {
    if (!drag) return;
    drag.el.classList.remove('dragging');
    if (drag.preview && drag.preview.parentElement) drag.preview.remove();
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    hideTimeBadge();
    hideSnapLine();
    // Flag verzögert zurücksetzen, damit ein nachfolgender Click-Event ignoriert werden kann
    setTimeout(function () { window.__ukcDragActive = false; }, 80);
  }

  function startDrag(evt, eventEl, mode) {
    // mode: 'week' oder 'day'
    // Alt-Key → Duplicate-Modus: Clone anlegen und DIE ziehen, Original bleibt
    var isCopyMode = !!evt.altKey;
    var actualEl = eventEl;
    if (isCopyMode) {
      var clone = eventEl.cloneNode(true);
      clone.classList.remove('dragging');
      // ResizeHandle darf nicht doppelt gesetzt sein — beim Clone-Appendix wird er ohnehin übernommen
      clone.removeAttribute('data-event-id'); // neue ID beim Persist
      eventEl.parentElement.appendChild(clone);
      actualEl = clone;
    }
    var rect = actualEl.getBoundingClientRect();
    var parentCol = actualEl.parentElement;

    drag = {
      mode: mode,
      el: actualEl,
      isClone: isCopyMode,
      origParent: parentCol,
      origTop: parseFloat(actualEl.style.top) || 0,
      origHeight: parseFloat(actualEl.style.height) || 60,
      origClasses: actualEl.className,
      origMetaText: (actualEl.querySelector('.cal-event-meta, .day-event-time') || {}).textContent || '',
      offsetY: evt.clientY - rect.top,
      columnSelector: mode === 'day' ? '.day-room-col' : '.cal-day-col',
      eventSelector: mode === 'day' ? '.day-event' : '.cal-event',
      currentTop: parseFloat(actualEl.style.top) || 0,
      currentCol: parentCol,
    };

    actualEl.classList.add('dragging');
    if (isCopyMode) actualEl.classList.add('drag-copy');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = isCopyMode ? 'copy' : 'grabbing';
    window.__ukcDragActive = true;
    evt.preventDefault();
  }

  function onPointerMove(evt) {
    if (!drag) return;

    var col = findColumnUnderCursor(evt.clientX, evt.clientY, drag.columnSelector);
    if (!col) return;

    var colRect = col.getBoundingClientRect();
    var rawTop = evt.clientY - colRect.top - drag.offsetY;
    // Snap auf PX_PER_SLOT (14px)
    var snappedTop = Math.max(0, Math.round(rawTop / PX_PER_SLOT) * PX_PER_SLOT);
    // Cap nach unten: nicht aus Grid raushängen
    var maxTop = 10 * PX_PER_HOUR - drag.origHeight; // 10 Stunden (09-18)
    if (snappedTop > maxTop) snappedTop = maxTop;

    // Move in neue Spalte falls geändert
    if (col !== drag.el.parentElement) {
      col.appendChild(drag.el);
    }
    drag.el.style.top = snappedTop + 'px';
    drag.currentTop = snappedTop;
    drag.currentCol = col;

    // Zeige aktuelle Zeit als Tooltip am Element (temporary)
    var startMin = topToMinutes(snappedTop);
    var endMin = startMin + heightToMinutes(drag.origHeight);
    drag.el.title = 'Neue Zeit: ' + fmtMinutes(startMin) + ' – ' + fmtMinutes(endMin);

    // Drag-Time-Badge + Snap-Line
    var prefix = drag.isClone ? 'Kopie · ' : '';
    showTimeBadge(evt.clientX, evt.clientY, prefix + fmtMinutes(startMin) + ' – ' + fmtMinutes(endMin));
    showSnapLine(col, snappedTop, drag.mode === 'day');
  }

  function onPointerUp(evt) {
    if (!drag) return;

    // Rechte Maustaste / andere Buttons: abbrechen
    if (evt.type === 'pointerup' && evt.button !== 0) {
      revert('Drag abgebrochen');
      return;
    }

    var col = drag.currentCol;
    var top = drag.currentTop;
    var height = drag.origHeight;
    var conflict = hasConflict(col, top, height, drag.el, drag.eventSelector);

    // Wenn Clone nicht bewegt wurde → Clone wieder entfernen, kein Toast
    if (drag.isClone && col === drag.origParent && top === drag.origTop) {
      if (drag.el.parentElement) drag.el.remove();
      endDragVisual();
      drag = null;
      return;
    }
    // Wenn Original nicht bewegt wurde → einfach abbrechen (kein Toast)
    if (!drag.isClone && col === drag.origParent && top === drag.origTop) {
      endDragVisual();
      drag = null;
      return;
    }

    if (conflict) {
      var conflictTitle = (conflict.querySelector('.cal-event-title, .day-event-title') || {}).textContent || 'Anderes Event';
      if (drag.isClone) {
        // Clone einfach verwerfen, Original bleibt
        if (drag.el.parentElement) drag.el.remove();
        if (typeof window.ukcToast === 'function') window.ukcToast('Konflikt mit "' + conflictTitle + '" — Kopie nicht eingefügt', 'warning', 2800);
        endDragVisual();
        drag = null;
        return;
      }
      revert('Konflikt mit "' + conflictTitle + '" — Zeit überschneidet sich');
      return;
    }

    // Commit: Zeiten-Text updaten, Lanes neu berechnen (alte + neue Column)
    var startMin = topToMinutes(top);
    var endMin = startMin + heightToMinutes(height);
    updateEventTimeText(drag.el, startMin, endMin, drag.mode === 'day');

    // Lanes neu berechnen
    recomputeLanes(drag.origParent, drag.eventSelector);
    if (col !== drag.origParent) recomputeLanes(col, drag.eventSelector);

    // Persist
    persist(drag.el, col, top);

    // Toast mit Undo
    var origState = {
      parent: drag.origParent,
      top: drag.origTop,
      mode: drag.mode,
      eventSelector: drag.eventSelector,
      origMetaText: drag.origMetaText,
      origStartMin: topToMinutes(drag.origTop),
      origEndMin: topToMinutes(drag.origTop) + heightToMinutes(drag.origHeight),
    };
    var evEl = drag.el;
    var newStart = fmtMinutes(startMin);
    var newEnd = fmtMinutes(endMin);
    var eventTitle = (evEl.querySelector('.cal-event-title, .day-event-title') || {}).textContent || 'Termin';

    if (drag.isClone) {
      // Clone hat eigene ID bekommen → als Created persistieren
      drag.el.classList.remove('drag-copy');
      drag.el.dataset.eventId = 'clone_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      toast('Kopie eingefügt: ' + eventTitle + ' → ' + newStart + '–' + newEnd, 'success', 3400);
    } else {
      toast(eventTitle + ' → ' + newStart + '–' + newEnd, 'success', 4200);
      // Undo-Chip nur für Move (nicht für Copy)
      setTimeout(function () { showUndoChip(evEl, origState); }, 50);
    }

    endDragVisual();
    drag = null;
  }

  function revert(message) {
    if (!drag) return;
    if (drag.isClone) {
      // Clone komplett entfernen
      if (drag.el.parentElement) drag.el.remove();
    } else {
      // Original zurück an Position
      if (drag.el.parentElement !== drag.origParent) {
        drag.origParent.appendChild(drag.el);
      }
      drag.el.style.top = drag.origTop + 'px';
      drag.el.className = drag.origClasses;
      drag.el.removeAttribute('title');
    }
    toast(message, 'warning', 2800);
    endDragVisual();
    drag = null;
  }

  function persist(el, column, top) {
    var store = loadStore();
    // Event-ID: bevorzuge dataset, sonst bilde aus ursprünglichem Text
    if (!el.dataset.eventId) {
      var allEvs = document.querySelectorAll('.cal-event, .day-event');
      var idx = Array.prototype.indexOf.call(allEvs, el);
      el.dataset.eventId = makeId(el, idx);
    }
    var key = el.dataset.eventId;
    // Column-Identifier: Index innerhalb des Parents des Columns
    var colIdx = Array.prototype.indexOf.call(column.parentElement.children, column);
    store[key] = {
      top: top,
      colIdx: colIdx,
      colClass: column.className,
    };
    saveStore(store);
  }

  function showUndoChip(el, origState) {
    var chip = document.createElement('div');
    chip.className = 'ukc-undo-chip';
    chip.innerHTML = '<span>Rückgängig?</span><button>Zurücksetzen</button>';
    document.body.appendChild(chip);
    requestAnimationFrame(function () { chip.classList.add('show'); });

    var btn = chip.querySelector('button');
    btn.addEventListener('click', function () {
      // Zurück an Ursprungs-Position + Text
      if (el.parentElement !== origState.parent) origState.parent.appendChild(el);
      el.style.top = origState.top + 'px';
      updateEventTimeText(el, origState.origStartMin, origState.origEndMin, origState.mode === 'day');
      // Store-Eintrag entfernen
      var store = loadStore();
      if (el.dataset.eventId) delete store[el.dataset.eventId];
      saveStore(store);
      // Lanes neu
      recomputeLanes(origState.parent, origState.eventSelector);
      chip.remove();
      toast('Verschiebung rückgängig gemacht', 'info', 1800);
    });

    setTimeout(function () {
      if (chip.parentElement) chip.classList.remove('show');
      setTimeout(function () { if (chip.parentElement) chip.remove(); }, 300);
    }, 4000);
  }

  // --------------------------------------------------------
  // Persistence-Restore beim Laden
  // --------------------------------------------------------
  function restorePersisted() {
    var store = loadStore();
    var weekEvents = document.querySelectorAll('.cal-event');
    var dayEvents = document.querySelectorAll('.day-event');
    var all = Array.prototype.slice.call(weekEvents).concat(Array.prototype.slice.call(dayEvents));
    all.forEach(function (el, idx) {
      var id = makeId(el, idx);
      el.dataset.eventId = id;
      var entry = store[id];
      if (!entry) return;
      // Column nach colIdx wiederherstellen
      var parent = el.parentElement;
      var grandparent = parent ? parent.parentElement : null;
      if (!grandparent) return;
      var targetCol = grandparent.children[entry.colIdx];
      var isDay = el.classList.contains('day-event');
      var validSelector = isDay ? '.day-room-col' : '.cal-day-col';
      if (!targetCol || !targetCol.matches(validSelector)) return;
      if (targetCol !== parent) targetCol.appendChild(el);
      el.style.top = entry.top + 'px';
      // Time-Text aktualisieren
      var height = parseFloat(el.style.height) || 60;
      var startMin = topToMinutes(entry.top);
      var endMin = startMin + heightToMinutes(height);
      updateEventTimeText(el, startMin, endMin, isDay);
    });

    // Lanes für alle Columns neu berechnen
    document.querySelectorAll('.cal-day-col').forEach(function (c) { recomputeLanes(c, '.cal-event'); });
    document.querySelectorAll('.day-room-col').forEach(function (c) { recomputeLanes(c, '.day-event'); });
  }

  // ==========================================================
  // MONTH-VIEW: day → day Drag
  // ==========================================================
  var MONTH_STORAGE_KEY = 'ukc_cal_month_dnd_v1';
  var monthDrag = null;

  function monthMakeId(el, fallbackIdx) {
    if (el.dataset.eventId) return el.dataset.eventId;
    var text = (el.textContent || '').trim().slice(0, 32).replace(/[^a-z0-9]/gi, '_');
    var day = el.parentElement;
    var dayIdx = day ? Array.prototype.indexOf.call(day.parentElement.children, day) : 0;
    return 'mevt_' + text + '_d' + dayIdx + '_i' + fallbackIdx;
  }

  function loadMonthStore() {
    try { return JSON.parse(localStorage.getItem(MONTH_STORAGE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveMonthStore(s) {
    try { localStorage.setItem(MONTH_STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function findMonthDayUnderCursor(x, y) {
    var days = document.querySelectorAll('.month-day');
    for (var i = 0; i < days.length; i++) {
      var r = days[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return days[i];
    }
    return null;
  }

  function startMonthDrag(evt, evtEl) {
    var rect = evtEl.getBoundingClientRect();
    monthDrag = {
      el: evtEl,
      origParent: evtEl.parentElement,
      origNextSibling: evtEl.nextSibling,
      offsetX: evt.clientX - rect.left,
      offsetY: evt.clientY - rect.top,
      ghost: null,
      currentTarget: null,
    };
    var ghost = evtEl.cloneNode(true);
    ghost.classList.add('month-evt-ghost');
    ghost.style.position = 'fixed';
    ghost.style.left = (evt.clientX - monthDrag.offsetX) + 'px';
    ghost.style.top = (evt.clientY - monthDrag.offsetY) + 'px';
    ghost.style.width = rect.width + 'px';
    ghost.style.zIndex = '1000';
    ghost.style.pointerEvents = 'none';
    document.body.appendChild(ghost);
    monthDrag.ghost = ghost;
    evtEl.classList.add('dragging');
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    window.__ukcDragActive = true;
    evt.preventDefault();
  }

  function onMonthPointerMove(evt) {
    if (!monthDrag) return;
    monthDrag.ghost.style.left = (evt.clientX - monthDrag.offsetX) + 'px';
    monthDrag.ghost.style.top = (evt.clientY - monthDrag.offsetY) + 'px';
    document.querySelectorAll('.month-day.drop-target').forEach(function (d) { d.classList.remove('drop-target'); });
    var target = findMonthDayUnderCursor(evt.clientX, evt.clientY);
    if (target && target !== monthDrag.origParent) target.classList.add('drop-target');
    monthDrag.currentTarget = target;
  }

  function cleanupMonthDrag() {
    if (!monthDrag) return;
    document.querySelectorAll('.month-day.drop-target').forEach(function (d) { d.classList.remove('drop-target'); });
    if (monthDrag.ghost && monthDrag.ghost.parentElement) monthDrag.ghost.remove();
    monthDrag.el.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setTimeout(function () { window.__ukcDragActive = false; }, 80);
  }

  function onMonthPointerUp(evt) {
    if (!monthDrag) return;
    var target = monthDrag.currentTarget;
    var origParent = monthDrag.origParent;
    var el = monthDrag.el;

    if (!target || target === origParent) {
      cleanupMonthDrag();
      monthDrag = null;
      return;
    }

    // Move DOM
    target.appendChild(el);
    persistMonthMove(el, target);

    var origDayNum = (origParent.querySelector('.month-day-num') || {}).textContent || '?';
    var targetDayNum = (target.querySelector('.month-day-num') || {}).textContent || '?';
    var title = (el.textContent || 'Termin').trim();

    toast(title + ' → ' + origDayNum + '. → ' + targetDayNum + '.', 'success', 3200);
    showMonthUndoChip(el, origParent, origDayNum);

    cleanupMonthDrag();
    monthDrag = null;
  }

  function persistMonthMove(el, target) {
    if (!el.dataset.eventId) {
      var allEvs = document.querySelectorAll('.month-evt');
      var idx = Array.prototype.indexOf.call(allEvs, el);
      el.dataset.eventId = monthMakeId(el, idx);
    }
    var store = loadMonthStore();
    var dayIdx = Array.prototype.indexOf.call(target.parentElement.children, target);
    store[el.dataset.eventId] = { dayIdx: dayIdx };
    saveMonthStore(store);
  }

  function showMonthUndoChip(el, origParent, origDayNum) {
    var chip = document.createElement('div');
    chip.className = 'ukc-undo-chip';
    chip.innerHTML = '<span>Verschoben zu Tag ' + (el.parentElement.querySelector('.month-day-num') || { textContent: '?' }).textContent + '</span><button>Zurücksetzen</button>';
    document.body.appendChild(chip);
    requestAnimationFrame(function () { chip.classList.add('show'); });

    chip.querySelector('button').addEventListener('click', function () {
      origParent.appendChild(el);
      var store = loadMonthStore();
      if (el.dataset.eventId) delete store[el.dataset.eventId];
      saveMonthStore(store);
      chip.remove();
      toast('Verschiebung rückgängig', 'info', 1600);
    });

    setTimeout(function () {
      if (chip.parentElement) chip.classList.remove('show');
      setTimeout(function () { if (chip.parentElement) chip.remove(); }, 300);
    }, 4500);
  }

  function restoreMonthPersisted() {
    var store = loadMonthStore();
    var evts = document.querySelectorAll('.month-evt');
    evts.forEach(function (el, idx) {
      var id = monthMakeId(el, idx);
      el.dataset.eventId = id;
      var entry = store[id];
      if (!entry) return;
      var monthBody = document.querySelector('.month-body');
      if (!monthBody) return;
      var target = monthBody.children[entry.dayIdx];
      if (target && target !== el.parentElement) target.appendChild(el);
    });
  }

  function bindMonthHandlers() {
    var monthGrid = document.querySelector('.month-grid');
    if (!monthGrid) return;
    monthGrid.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      var evtEl = e.target.closest('.month-evt');
      if (!evtEl) return;
      startMonthDrag(e, evtEl);
    });
    document.addEventListener('pointermove', onMonthPointerMove);
    document.addEventListener('pointerup', onMonthPointerUp);
    document.addEventListener('pointercancel', function () {
      if (!monthDrag) return;
      // Revert: zurück an Originalposition via nextSibling-Anchor
      if (monthDrag.origNextSibling) {
        monthDrag.origParent.insertBefore(monthDrag.el, monthDrag.origNextSibling);
      } else {
        monthDrag.origParent.appendChild(monthDrag.el);
      }
      cleanupMonthDrag();
      monthDrag = null;
    });
    // Escape → revert
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && monthDrag) {
        if (monthDrag.origNextSibling) {
          monthDrag.origParent.insertBefore(monthDrag.el, monthDrag.origNextSibling);
        } else {
          monthDrag.origParent.appendChild(monthDrag.el);
        }
        cleanupMonthDrag();
        monthDrag = null;
      }
    });
  }

  // --------------------------------------------------------
  // Event-Wiring
  // --------------------------------------------------------
  function bindEventHandlers() {
    // Delegation: wir fangen pointerdown auf .cal-grid-body und .day-grid-body
    var weekBody = document.querySelector('.cal-grid-body');
    var dayBody = document.querySelector('.day-grid-body');

    function handler(body, mode) {
      body.addEventListener('pointerdown', function (e) {
        // Maus-Link-Klick only
        if (e.button !== 0) return;
        // Ctrl/Shift+Click ist Multi-Select, kein Drag
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        var eventEl = e.target.closest(mode === 'day' ? '.day-event' : '.cal-event');
        if (!eventEl || !body.contains(eventEl)) return;
        startDrag(e, eventEl, mode);
      });
    }

    if (weekBody) handler(weekBody, 'week');
    if (dayBody) handler(dayBody, 'day');

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', function () {
      if (drag) revert('Drag abgebrochen');
    });

    // Escape während Drag → abbrechen
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drag) revert('Drag abgebrochen');
    });
  }

  // Styles für .dragging + Undo-Chip
  var css = document.createElement('style');
  css.textContent = [
    '.cal-event, .day-event { cursor: grab; user-select: none; touch-action: none; }',
    '.cal-event.dragging, .day-event.dragging { cursor: grabbing; opacity: 0.82; z-index: 99 !important; transform: scale(1.02); box-shadow: 0 10px 30px rgba(60,33,36,0.25) !important; transition: none !important; }',
    '.cal-event:active, .day-event:active { cursor: grabbing; }',
    // Month-View DnD
    '.month-evt { cursor: grab; user-select: none; touch-action: none; }',
    '.month-evt:active { cursor: grabbing; }',
    '.month-evt.dragging { opacity: 0.28; pointer-events: none; }',
    '.month-evt-ghost {',
    '  position: fixed !important; border-radius: 3px;',
    '  box-shadow: 0 10px 30px rgba(60,33,36,0.3);',
    '  transform: scale(1.04) rotate(-1.5deg);',
    '  transition: none !important; pointer-events: none !important;',
    '}',
    '.month-day.drop-target {',
    '  background: rgba(204,137,94,0.18) !important;',
    '  outline: 2px dashed #CC895E; outline-offset: -3px;',
    '}',
    // Drag-Time-Badge
    '.ukc-drag-time-badge {',
    '  position: fixed; background: #3C2124; color: #FFEFE1;',
    '  padding: 6px 12px; border-radius: 999px;',
    '  font-family: "Inter", sans-serif; font-size: 12px; font-weight: 600;',
    '  font-variant-numeric: tabular-nums;',
    '  box-shadow: 0 8px 20px rgba(60,33,36,0.3);',
    '  pointer-events: none; z-index: 1200;',
    '  opacity: 0; transform: translateY(4px);',
    '  transition: opacity 120ms, transform 120ms;',
    '  white-space: nowrap;',
    '}',
    '.ukc-drag-time-badge.show { opacity: 1; transform: translateY(0); }',
    // Snap-Line
    '.ukc-snap-line {',
    '  position: absolute; left: 3px; right: 3px; height: 2px;',
    '  background: repeating-linear-gradient(90deg, #CC895E 0 6px, transparent 6px 10px);',
    '  box-shadow: 0 0 0 1px rgba(204,137,94,0.2);',
    '  z-index: 50; opacity: 0;',
    '  transition: opacity 100ms;',
    '  pointer-events: none;',
    '}',
    '.ukc-snap-line.show { opacity: 0.85; }',
    // Copy-Drag (Alt-Key)
    '.cal-event.drag-copy, .day-event.drag-copy {',
    '  outline: 2px dashed #CC895E; outline-offset: -2px;',
    '}',
    '.cal-event.drag-copy::before, .day-event.drag-copy::before {',
    '  content: "+"; position: absolute; top: 4px; right: 6px;',
    '  width: 18px; height: 18px; border-radius: 50%;',
    '  background: #CC895E; color: #FFEFE1;',
    '  display: flex; align-items: center; justify-content: center;',
    '  font-weight: 700; font-size: 14px; line-height: 1;',
    '  box-shadow: 0 2px 6px rgba(60,33,36,0.2);',
    '}',
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
    '.ukc-undo-chip button { background: #CC895E; color: #FFEFE1; border: none; padding: 6px 14px; border-radius: 999px; font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }',
    '.ukc-undo-chip button:hover { background: #B8784F; }',
  ].join('\n');
  document.head.appendChild(css);

  function init() {
    bindEventHandlers();
    restorePersisted();
    bindMonthHandlers();
    restoreMonthPersisted();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
