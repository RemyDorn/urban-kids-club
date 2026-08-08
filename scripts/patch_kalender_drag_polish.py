"""Polish drag-and-drop:
1. Toast uses German day name instead of API key (TH -> Donnerstag)
2. Lazy-load /api/rooms once and cache in state.rooms; resolve roomId -> name
   so events show "Raum 1" (Bewegung) instead of UUID
3. Add drag-and-drop to the Day view (columns are rooms; drop changes
   roomId AND startTime simultaneously)
"""

import re

fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(fp, 'r', encoding='utf-8').read()

# ============================================================
# 1. Helper: room-name lookup + day-key -> German full name
# ============================================================
HELPERS = r'''
window.__kalDayDE = function(key) {
  var m = { MO: 'Montag', TU: 'Dienstag', WE: 'Mittwoch', TH: 'Donnerstag', FR: 'Freitag', SA: 'Samstag', SU: 'Sonntag' };
  return m[key] || key;
};
window.__kalRoomName = function(roomId) {
  var s = window.dashboardState; if (!s || !roomId) return null;
  var rooms = s.rooms || [];
  var r = rooms.find(function(x) { return x && x.id === roomId; });
  return (r && (r.name || r.title)) || null;
};
window.__kalLoadRooms = async function() {
  var s = window.dashboardState; if (!s) return;
  if (s.rooms && s.rooms.length >= 0) return;  // already attempted
  try {
    var r = await s.api('/rooms');
    s.rooms = r.data || r.rooms || r || [];
  } catch (e) {
    s.rooms = [];
    console.warn('[Kal] /rooms load failed', e);
  }
};
'''
# Insert helpers right after __kalCatClass definition.
anchor = "window.__kalStartOfWeek = function(d) {"
idx = src.find(anchor)
if idx < 0:
    print('FAIL: __kalStartOfWeek anchor not found'); exit(1)
src = src[:idx] + HELPERS + "\n" + src[idx:]
print('OK: helpers (__kalDayDE / __kalRoomName / __kalLoadRooms) injected')

# ============================================================
# 2. Wire __kalLoadRooms into the section loader
# ============================================================
loader_anchor = "window.sectionLoaders.kalender = function() {"
new_loader_top = """window.sectionLoaders.kalender = async function() {
  await window.__kalLoadRooms();"""
src = src.replace("window.sectionLoaders.kalender = function() {", new_loader_top, 1)
print('OK: sectionLoader awaits __kalLoadRooms')

# ============================================================
# 3. Use room-name lookup in week-view meta (replace fallback)
# ============================================================
old_meta = "var meta = ev.startTime + ' · ' + (ev.a.roomName || (ev.a.roomId ? 'Raum ' + ev.a.roomId : '—')) + ' · ' + (isFull ? 'voll' : (booked + '/' + cap));"
new_meta = "var roomLabel = window.__kalRoomName(ev.a.roomId) || ev.a.roomName || '';\n        var meta = ev.startTime + (roomLabel ? ' · ' + roomLabel : '') + ' · ' + (isFull ? 'voll' : (booked + '/' + cap));"
if old_meta not in src:
    print('FAIL: week-view meta line not found'); exit(1)
src = src.replace(old_meta, new_meta, 1)
print('OK: week-view meta uses room-name lookup')

# Same for day-view: room column header label.
old_room_header = "head += '<div><span class=\"room-label\">' + (window.escapeHtml ? window.escapeHtml(roomMap[rid] || rid) : roomMap[rid]) + '</span><span class=\"room-sub\">Heute</span></div>';"
new_room_header = "var rname = window.__kalRoomName(rid) || roomMap[rid] || rid;\n        head += '<div><span class=\"room-label\">' + (window.escapeHtml ? window.escapeHtml(rname) : rname) + '</span><span class=\"room-sub\">Heute</span></div>';"
if old_room_header not in src:
    print('WARN: day-view room header line not found — skipping')
else:
    src = src.replace(old_room_header, new_room_header, 1)
    print('OK: day-view room header uses lookup')

# Day-view roomMap build also: use lookup when building map
old_map = "roomMap[rid] = rname;"
# leave alone — it already uses a.roomName

# Day-view dropdown population
old_dd = """    Object.keys(roomMap).forEach(function(rid) {
      var o = document.createElement('option');
      o.value = rid; o.textContent = roomMap[rid];
      roomSel.appendChild(o);
    });"""
new_dd = """    Object.keys(roomMap).forEach(function(rid) {
      var o = document.createElement('option');
      o.value = rid;
      o.textContent = window.__kalRoomName(rid) || roomMap[rid];
      roomSel.appendChild(o);
    });"""
if old_dd in src:
    src = src.replace(old_dd, new_dd, 1)
    print('OK: room dropdown uses lookup')

# Day-view roomMap build (in renderKalender for day view) — also use lookup
old_dayview_map = """    todayEvs.forEach(function(e) {
      var rid = e.a.roomId || '_none_';
      var rname = e.a.roomName || (e.a.roomId ? 'Raum ' + e.a.roomId : 'Ohne Raum');
      roomMap[rid] = rname;
    });"""
new_dayview_map = """    todayEvs.forEach(function(e) {
      var rid = e.a.roomId || '_none_';
      var rname = window.__kalRoomName(e.a.roomId) || e.a.roomName || (e.a.roomId ? 'Raum' : 'Ohne Raum');
      roomMap[rid] = rname;
    });"""
if old_dayview_map in src:
    src = src.replace(old_dayview_map, new_dayview_map, 1)
    print('OK: day-view roomMap uses lookup')

# ============================================================
# 4. Toast: German day name
# ============================================================
old_toast = "window.ukcToast('Kurs verschoben: ' + newDayKey + ' ' + newStart);"
new_toast = "window.ukcToast('Kurs verschoben: ' + window.__kalDayDE(newDayKey) + ' ' + newStart);"
if old_toast not in src:
    print('FAIL: toast line not found'); exit(1)
src = src.replace(old_toast, new_toast, 1)
print('OK: toast uses German day name')

# ============================================================
# 5. Day-view drag-and-drop
# ============================================================
# 5a. Annotate day-room-col with data attributes for drop targets.
old_dayroom_col = "var col = '<div class=\"day-room-col\">';"
new_dayroom_col = "var col = '<div class=\"day-room-col\" data-room-id=\"' + rid + '\" data-iso=\"' + ks.dayDate.toISOString() + '\" data-min-h=\"' + minH + '\" data-slot-px=\"' + slotPx + '\">';"
if old_dayroom_col not in src:
    print('FAIL: day-room-col anchor not found'); exit(1)
src = src.replace(old_dayroom_col, new_dayroom_col, 1)
print('OK: day-room-col annotated for drop')

# 5b. Annotate day-event with draggable + data attrs
old_day_event = """col += '<div class="' + cls.join(' ') + '" style="top:' + ev.top + 'px;height:' + ev.height + 'px;" onclick="event.stopPropagation();window.viewCourseDetail(\\'' + ev.a.id + '\\')">'"""
new_day_event = """col += '<div class="' + cls.join(' ') + '" draggable="true" data-act-id="' + ev.a.id + '" data-dur="' + Math.round(((parseInt(ev.endTime.slice(0,2),10)*60+parseInt(ev.endTime.slice(3,5),10)) - (parseInt(ev.startTime.slice(0,2),10)*60+parseInt(ev.startTime.slice(3,5),10)))) + '" data-orig-start="' + ev.startTime + '" data-orig-end="' + ev.endTime + '" data-orig-room="' + (ev.a.roomId || '') + '" style="top:' + ev.top + 'px;height:' + ev.height + 'px;" onclick="event.stopPropagation();if(!window.__kalSuppressClick){window.viewCourseDetail(\\'' + ev.a.id + '\\')}">'"""
if old_day_event not in src:
    print('FAIL: day-event template not found'); exit(1)
src = src.replace(old_day_event, new_day_event, 1)
print('OK: day-event template annotated for drag')

# 5c. Wire __kalDayDragInit call into day renderer
old_day_inject = "document.getElementById('phKalDay').innerHTML = stripHtml + head + body;"
new_day_inject = "document.getElementById('phKalDay').innerHTML = stripHtml + head + body;\n    window.__kalDayDragInit && window.__kalDayDragInit();"
if old_day_inject not in src:
    print('FAIL: phKalDay inject anchor not found'); exit(1)
src = src.replace(old_day_inject, new_day_inject, 1)
print('OK: __kalDayDragInit invocation wired')

# 5d. Inject __kalDayDragInit definition after __kalDragInit (week-view init)
DAY_DRAG = r'''
window.__kalDayDragInit = function() {
  var root = document.getElementById('phKalDay');
  if (!root || root.__dragWired) return;
  root.__dragWired = true;
  var dragData = null;
  var ghostEl = null;

  function pad2(n) { n = Math.round(n); return (n < 10 ? '0' : '') + n; }
  function snap15(min) { return Math.round(min / 15) * 15; }
  function timeFromMin(m) {
    var h = Math.floor(m / 60); var mm = m % 60;
    if (h < 0) h = 0; if (h > 23) h = 23;
    return pad2(h) + ':' + pad2(mm);
  }

  root.addEventListener('dragstart', function(e) {
    var ev = e.target.closest('.day-event');
    if (!ev) return;
    var col = ev.parentElement;
    dragData = {
      actId: ev.dataset.actId,
      dur: parseInt(ev.dataset.dur, 10) || 60,
      origStart: ev.dataset.origStart,
      origEnd: ev.dataset.origEnd,
      origRoom: ev.dataset.origRoom,
      minH: parseInt(col.dataset.minH || '9', 10),
      slotPx: parseInt(col.dataset.slotPx || '80', 10),
      offsetY: e.offsetY || 0,
      el: ev,
    };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', ev.dataset.actId); } catch (_) {}
    ev.style.opacity = '0.4';
    window.__kalSuppressClick = true;
  });

  root.addEventListener('dragend', function() {
    if (dragData && dragData.el) dragData.el.style.opacity = '';
    if (ghostEl && ghostEl.parentElement) ghostEl.parentElement.removeChild(ghostEl);
    ghostEl = null;
    dragData = null;
    setTimeout(function() { window.__kalSuppressClick = false; }, 50);
  });

  root.addEventListener('dragover', function(e) {
    if (!dragData) return;
    var col = e.target.closest('.day-room-col');
    if (!col || !col.dataset.roomId || col.dataset.roomId.indexOf('_pad_') === 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var rect = col.getBoundingClientRect();
    var y = e.clientY - rect.top - dragData.offsetY;
    if (y < 0) y = 0;
    var minH = parseInt(col.dataset.minH, 10);
    var slotPx = parseInt(col.dataset.slotPx, 10);
    var minutes = (y / slotPx) * 60 + minH * 60;
    minutes = snap15(minutes);
    var top = (minutes - minH * 60) / 60 * slotPx;
    var heightPx = (dragData.dur / 60) * slotPx;
    if (!ghostEl) {
      ghostEl = document.createElement('div');
      ghostEl.style.cssText = 'position:absolute;left:6px;right:6px;background:rgba(204,137,94,0.18);border:2px dashed var(--primary);border-radius:8px;pointer-events:none;z-index:10;';
      ghostEl.innerHTML = '<div style="position:absolute;top:6px;left:10px;font-size:12px;font-weight:700;color:var(--primary);">' + timeFromMin(minutes) + '</div>';
    }
    if (ghostEl.parentElement !== col) col.appendChild(ghostEl);
    ghostEl.style.top = top + 'px';
    ghostEl.style.height = Math.max(40, heightPx) + 'px';
    ghostEl.firstChild.textContent = timeFromMin(minutes);
  });

  root.addEventListener('drop', async function(e) {
    if (!dragData) return;
    var col = e.target.closest('.day-room-col');
    if (!col || !col.dataset.roomId || col.dataset.roomId.indexOf('_pad_') === 0) return;
    e.preventDefault();
    var rect = col.getBoundingClientRect();
    var y = e.clientY - rect.top - dragData.offsetY;
    if (y < 0) y = 0;
    var minH = parseInt(col.dataset.minH, 10);
    var slotPx = parseInt(col.dataset.slotPx, 10);
    var startMin = snap15((y / slotPx) * 60 + minH * 60);
    var endMin = startMin + dragData.dur;
    var newStart = timeFromMin(startMin);
    var newEnd = timeFromMin(endMin);
    var newRoomId = col.dataset.roomId === '_none_' ? null : col.dataset.roomId;

    if (newRoomId === (dragData.origRoom || null) && newStart === dragData.origStart) {
      if (ghostEl && ghostEl.parentElement) ghostEl.parentElement.removeChild(ghostEl);
      ghostEl = null;
      return;
    }

    var s = window.dashboardState; if (!s) return;
    var act = (s.activities || []).find(function(a) { return a && a.id === dragData.actId; });
    if (!act) return;
    var origSchedule = act.schedule;
    var origRoomId = act.roomId;
    var newSchedule = JSON.parse(JSON.stringify(act.schedule || { slots: [] }));
    if (!newSchedule.slots || !newSchedule.slots.length) newSchedule.slots = [{}];
    newSchedule.slots[0].startTime = newStart;
    newSchedule.slots[0].endTime = newEnd;
    act.schedule = newSchedule;
    if (newRoomId !== undefined) act.roomId = newRoomId;

    window.__renderKalender();

    try {
      var token = (s.token) || '';
      var resp = await fetch('/api/activities/' + dragData.actId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ schedule: newSchedule, roomId: newRoomId }),
      });
      if (!resp.ok) {
        var errBody = await resp.json().catch(function() { return {}; });
        throw new Error((errBody && (errBody.error || errBody.message)) || ('Server-Fehler ' + resp.status));
      }
      var roomLabel = window.__kalRoomName(newRoomId) || 'Ohne Raum';
      if (typeof window.ukcToast === 'function') {
        window.ukcToast('Kurs verschoben: ' + newStart + ' · ' + roomLabel);
      } else {
        var t = document.createElement('div');
        t.textContent = 'Kurs verschoben auf ' + newStart;
        t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 18px;border-radius:999px;font-size:13px;font-weight:500;z-index:10000;box-shadow:0 6px 24px rgba(0,0,0,.2)';
        document.body.appendChild(t);
        setTimeout(function() { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 1800);
        setTimeout(function() { t.remove(); }, 2200);
      }
    } catch (err) {
      act.schedule = origSchedule;
      act.roomId = origRoomId;
      window.__renderKalender();
      var msg = err && err.message ? err.message : 'Konnte Kurs nicht verschieben.';
      if (typeof window.ukcShowDetailModal === 'function') {
        window.ukcShowDetailModal({ title: 'Verschieben fehlgeschlagen', body: '<p style="color:var(--signal)">' + msg + '</p>' });
      } else {
        alert(msg);
      }
    }
  });
};
'''

# Insert at end of __kalDragInit definition (before its closing) — actually, place
# right after window.__kalDragInit's closing }; line. We can find the end by
# searching for the last `};` after __kalDragInit and inserting after it.
m = re.search(r"window\.__kalDragInit = function\(\) \{[\s\S]*?\n\};", src)
if not m:
    print('FAIL: __kalDragInit closing not found'); exit(1)
src = src[:m.end()] + DAY_DRAG + src[m.end():]
print('OK: __kalDayDragInit appended')

open(fp, 'w', encoding='utf-8').write(src)
print('All patches applied.')
