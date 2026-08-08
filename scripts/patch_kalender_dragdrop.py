"""Add drag & drop to the polished kalender week view.

Plan:
  1. Annotate cal-day-col with data-iso so we know which day a drop target is.
  2. Annotate cal-event with draggable + data-act-id + data-dur (duration min).
  3. Add a delegated event-handler block (window.__kalDragInit) invoked from
     the week-view renderer once, that handles dragstart/dragover/drop on
     the calendar container.
  4. On drop:
       - compute new day-key from column data-iso
       - compute new startTime from drop offsetY (snap 15min)
       - send PUT /api/activities/:id with new schedule
       - optimistic in-memory update + immediate re-render
       - on server error: revert + show alert
"""

import re

fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(fp, 'r', encoding='utf-8').read()

# ============================================================
# 1. Annotate the day-columns: add data-iso (already there), data-min-h, data-slot-px
# ============================================================
old_col_open = '''var col = '<div class="' + classes.join(' ') + '" data-date="' + d.toISOString() + '">';'''
new_col_open = '''var col = '<div class="' + classes.join(' ') + '" data-iso="' + d.toISOString() + '" data-min-h="' + minH + '" data-slot-px="' + slotPx + '">';'''
if old_col_open not in src:
    print('FAIL: day-col open anchor not found'); exit(1)
src = src.replace(old_col_open, new_col_open, 1)
print('OK: day-col annotated with data-iso/data-min-h/data-slot-px')

# ============================================================
# 2. Annotate each cal-event with draggable + data-act-id + data-dur
# ============================================================
old_evt_html = """col += '<div class=\"' + cls.join(' ') + '\" style=\"top:' + ev.top + 'px;height:' + ev.height + 'px;\" onclick=\"event.stopPropagation();window.viewCourseDetail(\\'' + ev.a.id + '\\')\" title=\"' + titleEsc + ' · ' + meta + '\">'"""
new_evt_html = """col += '<div class=\"' + cls.join(' ') + '\" draggable=\"true\" data-act-id=\"' + ev.a.id + '\" data-dur=\"' + (ev.endMin - ev.startMin) + '\" data-orig-day=\"' + ev.slot.day + '\" data-orig-start=\"' + ev.startTime + '\" data-orig-end=\"' + ev.endTime + '\" style=\"top:' + ev.top + 'px;height:' + ev.height + 'px;\" onclick=\"event.stopPropagation();if(!window.__kalSuppressClick){window.viewCourseDetail(\\'' + ev.a.id + '\\')}\" title=\"' + titleEsc + ' · ' + meta + ' · Ziehen zum Verschieben\">'"""
if old_evt_html not in src:
    print('FAIL: cal-event template not found'); exit(1)
src = src.replace(old_evt_html, new_evt_html, 1)
print('OK: cal-event template annotated for drag')

# ============================================================
# 3. Inject __kalDragInit + call it from the week-view branch
# ============================================================
init_call = '''
    document.getElementById('phKalWeek').innerHTML = head + body;
    window.__kalDragInit && window.__kalDragInit();'''
old_inject_anchor = "document.getElementById('phKalWeek').innerHTML = head + body;"
if old_inject_anchor not in src:
    print('FAIL: phKalWeek inject anchor not found'); exit(1)
src = src.replace(old_inject_anchor, init_call.strip(), 1)
print('OK: __kalDragInit invocation wired into week-view render')

# Insert the __kalDragInit definition after __kalCellClick.
DRAG_INIT = r'''
window.__kalDragInit = function() {
  var root = document.getElementById('phKalWeek');
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
  function dayKeyFromIso(iso) {
    var d = new Date(iso);
    var keys = ['MO','TU','WE','TH','FR','SA','SU'];
    return keys[(d.getDay() + 6) % 7];
  }

  root.addEventListener('dragstart', function(e) {
    var ev = e.target.closest('.cal-event');
    if (!ev) return;
    var col = ev.parentElement;
    var minH = parseInt(col.dataset.minH || '9', 10);
    var slotPx = parseInt(col.dataset.slotPx || '56', 10);
    dragData = {
      actId: ev.dataset.actId,
      dur: parseInt(ev.dataset.dur, 10),
      origDay: ev.dataset.origDay,
      origStart: ev.dataset.origStart,
      origEnd: ev.dataset.origEnd,
      minH: minH,
      slotPx: slotPx,
      offsetY: e.offsetY || 0,
      el: ev,
    };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', ev.dataset.actId); } catch (_) {}
    ev.style.opacity = '0.4';
    window.__kalSuppressClick = true;
  });

  root.addEventListener('dragend', function(e) {
    if (dragData && dragData.el) dragData.el.style.opacity = '';
    if (ghostEl && ghostEl.parentElement) ghostEl.parentElement.removeChild(ghostEl);
    ghostEl = null;
    dragData = null;
    setTimeout(function() { window.__kalSuppressClick = false; }, 50);
  });

  root.addEventListener('dragover', function(e) {
    if (!dragData) return;
    var col = e.target.closest('.cal-day-col');
    if (!col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Place ghost
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
      ghostEl.innerHTML = '<div style="position:absolute;top:4px;left:8px;font-size:11px;font-weight:700;color:var(--primary);">' + timeFromMin(minutes) + '</div>';
    }
    if (ghostEl.parentElement !== col) col.appendChild(ghostEl);
    ghostEl.style.top = top + 'px';
    ghostEl.style.height = Math.max(28, heightPx) + 'px';
    ghostEl.firstChild.textContent = timeFromMin(minutes);
    ghostEl.dataset.iso = col.dataset.iso;
    ghostEl.dataset.minutes = minutes;
  });

  root.addEventListener('drop', async function(e) {
    if (!dragData) return;
    var col = e.target.closest('.cal-day-col');
    if (!col) return;
    e.preventDefault();
    var rect = col.getBoundingClientRect();
    var y = e.clientY - rect.top - dragData.offsetY;
    if (y < 0) y = 0;
    var minH = parseInt(col.dataset.minH, 10);
    var slotPx = parseInt(col.dataset.slotPx, 10);
    var startMin = snap15((y / slotPx) * 60 + minH * 60);
    var endMin = startMin + dragData.dur;
    var newDayKey = dayKeyFromIso(col.dataset.iso);
    var newStart = timeFromMin(startMin);
    var newEnd = timeFromMin(endMin);

    if (newDayKey === dragData.origDay && newStart === dragData.origStart) {
      // No effective change — clean up
      if (ghostEl && ghostEl.parentElement) ghostEl.parentElement.removeChild(ghostEl);
      ghostEl = null;
      return;
    }

    // Optimistic update
    var s = window.dashboardState; if (!s) return;
    var act = (s.activities || []).find(function(a) { return a && a.id === dragData.actId; });
    if (!act) return;
    var newSchedule = JSON.parse(JSON.stringify(act.schedule || { slots: [] }));
    if (!newSchedule.slots || !newSchedule.slots.length) newSchedule.slots = [{}];
    newSchedule.slots[0].day = newDayKey;
    newSchedule.slots[0].startTime = newStart;
    newSchedule.slots[0].endTime = newEnd;

    var origSchedule = act.schedule;
    act.schedule = newSchedule;
    window.__renderKalender();

    // Send PUT
    try {
      var token = (s.token) || '';
      var resp = await fetch('/api/activities/' + dragData.actId, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ schedule: newSchedule }),
      });
      if (!resp.ok) {
        var errBody = await resp.json().catch(function() { return {}; });
        throw new Error((errBody && (errBody.error || errBody.message)) || ('Server-Fehler ' + resp.status));
      }
      // Toast
      if (typeof window.ukcToast === 'function') {
        window.ukcToast('Kurs verschoben: ' + newDayKey + ' ' + newStart);
      } else {
        var t = document.createElement('div');
        t.textContent = 'Kurs verschoben auf ' + newStart;
        t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 18px;border-radius:999px;font-size:13px;font-weight:500;z-index:10000;box-shadow:0 6px 24px rgba(0,0,0,.2)';
        document.body.appendChild(t);
        setTimeout(function() { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 1800);
        setTimeout(function() { t.remove(); }, 2200);
      }
    } catch (err) {
      // Revert
      act.schedule = origSchedule;
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

# Inject after __kalCellClick
anchor = '''window.__kalCellClick = function(iso, hr) {'''
idx = src.find(anchor)
if idx < 0:
    print('FAIL: __kalCellClick anchor not found'); exit(1)
# Find the closing }; of __kalCellClick
end_idx = src.find('};', idx)
end_idx = src.find('\n', end_idx) + 1
src = src[:end_idx] + DRAG_INIT + src[end_idx:]
print('OK: __kalDragInit appended after __kalCellClick')

open(fp, 'w', encoding='utf-8').write(src)
print('All patches applied.')
