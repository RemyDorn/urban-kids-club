"""Replace the kalender sectionLoader with a proper weekly/monthly grid calendar.
- View switcher: Woche / Monat
- Week view: 7 columns × hourly grid (07:00-21:00), events positioned absolutely by startTime/endTime
- Month view: classic 7x6 grid, events as colored bars per day
- Navigation: ← Heute → with date range header
- Brand colors: apricot for primary, sage for secondary; today column highlighted
- Click event → viewCourseDetail
- Hover → tooltip
"""

fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
fs = open(fp, 'r', encoding='utf-8').read()

# 1. Replace the sectionLoader with the new implementation.
import re

old_pattern = re.compile(
    r"window\.sectionLoaders\.kalender = function\(\) \{.*?^\};",
    re.DOTALL | re.MULTILINE
)

new_loader = '''window.sectionLoaders.kalender = function() {
  var s = window.dashboardState; if (!s) return;
  var grid = document.getElementById('phKalGrid');
  if (!grid) return;
  if (!window.__kalState) {
    window.__kalState = { view: 'week', anchor: new Date() };
    window.__kalState.anchor.setHours(0,0,0,0);
  }
  window.__renderKalender();
};

window.__renderKalender = function() {
  var s = window.dashboardState; if (!s) return;
  var grid = document.getElementById('phKalGrid');
  var sub = document.getElementById('phKalSub');
  if (!grid) return;

  var ks = window.__kalState;
  var activities = (s.activities || []).filter(function(a){ return a && a.status !== 'archived' && a.status !== 'cancelled'; });
  var bookings = s.bookings || [];

  var months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  var monthsShort = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  var dayLabels = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  var dayLabelsLong = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
  var dayKeys = ['MO','TU','WE','TH','FR','SA','SU'];

  // Color palette per category — falls back to apricot.
  var palette = {
    sport: { bg: '#FDECE0', fg: '#9B3D1B', accent: 'var(--apricot-deep)' },
    music: { bg: '#EDF1EA', fg: '#3F4A37', accent: 'var(--sage-deep)' },
    creative: { bg: '#F5E9F0', fg: '#6B2549', accent: '#A23B6E' },
    education: { bg: '#FAF1DA', fg: '#7A5B12', accent: '#C29327' },
    other: { bg: '#FDECE0', fg: '#9B3D1B', accent: 'var(--apricot-deep)' },
  };
  function colorFor(a) {
    var c = (a.category || '').toLowerCase();
    if (palette[c]) return palette[c];
    // hash by id for stable coloring
    var keys = Object.keys(palette);
    var hash = 0;
    var id = String(a.id || a.title || '');
    for (var i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return palette[keys[hash % keys.length]];
  }

  function startOfWeek(d) {
    var x = new Date(d); x.setHours(0,0,0,0);
    var dow = x.getDay();
    var diff = (dow + 6) % 7;
    x.setDate(x.getDate() - diff);
    return x;
  }

  // ---------- HEADER (always rendered) ----------
  var anchor = ks.anchor;
  var headerLabel = '';
  var subLabel = '';
  if (ks.view === 'week') {
    var ws = startOfWeek(anchor);
    var we = new Date(ws); we.setDate(ws.getDate() + 6);
    if (ws.getMonth() === we.getMonth()) {
      headerLabel = ws.getDate() + '.–' + we.getDate() + '. ' + months[ws.getMonth()] + ' ' + we.getFullYear();
    } else {
      headerLabel = ws.getDate() + '. ' + monthsShort[ws.getMonth()] + ' – ' + we.getDate() + '. ' + monthsShort[we.getMonth()] + ' ' + we.getFullYear();
    }
  } else {
    headerLabel = months[anchor.getMonth()] + ' ' + anchor.getFullYear();
  }

  var toolbar =
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--border);background:#FFFDFA;">'
    + '<div style="display:flex;align-items:center;gap:10px">'
    +   '<button class="btn btn-ghost btn-sm" onclick="window.__kalNav(-1)" title="Zurück" style="width:32px;height:32px;padding:0;display:flex;align-items:center;justify-content:center">‹</button>'
    +   '<button class="btn btn-ghost btn-sm" onclick="window.__kalToday()" style="height:32px">Heute</button>'
    +   '<button class="btn btn-ghost btn-sm" onclick="window.__kalNav(1)" title="Vor" style="width:32px;height:32px;padding:0;display:flex;align-items:center;justify-content:center">›</button>'
    +   '<div style="margin-left:14px;font-family:Lora,serif;font-size:20px;font-weight:600;color:var(--ink)">' + headerLabel + '</div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:0;background:var(--surface-2);padding:3px;border-radius:10px;border:1px solid var(--border)">'
    +   '<button onclick="window.__kalSetView(\\'week\\')" style="border:0;background:' + (ks.view === 'week' ? 'var(--apricot-deep)' : 'transparent') + ';color:' + (ks.view === 'week' ? '#fff' : 'var(--ink-2)') + ';padding:6px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s">Woche</button>'
    +   '<button onclick="window.__kalSetView(\\'month\\')" style="border:0;background:' + (ks.view === 'month' ? 'var(--apricot-deep)' : 'transparent') + ';color:' + (ks.view === 'month' ? '#fff' : 'var(--ink-2)') + ';padding:6px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s">Monat</button>'
    + '</div>'
    + '</div>';

  // ---------- WEEK VIEW ----------
  function renderWeek() {
    var ws = startOfWeek(anchor);
    var today = new Date(); today.setHours(0,0,0,0);
    var hourStart = 7;  // 07:00
    var hourEnd = 21;   // 21:00
    var hourCount = hourEnd - hourStart;
    var pxPerHour = 56;
    var totalH = hourCount * pxPerHour;

    // Header row
    var headRow = '<div style="display:grid;grid-template-columns:60px repeat(7, 1fr);position:sticky;top:0;z-index:3;background:#FFFDFA;border-bottom:1px solid var(--border)">'
      + '<div></div>';
    for (var i = 0; i < 7; i++) {
      var d = new Date(ws); d.setDate(ws.getDate() + i);
      var isToday = d.getTime() === today.getTime();
      var color = isToday ? 'var(--apricot-deep)' : 'var(--ink-2)';
      var weight = isToday ? '700' : '500';
      var bg = isToday ? 'rgba(217,108,69,0.08)' : 'transparent';
      headRow += '<div style="padding:12px 8px;text-align:center;border-left:1px solid var(--border);background:' + bg + '">'
        + '<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:' + color + ';font-weight:600">' + dayLabels[i] + '</div>'
        + '<div style="font-size:22px;font-weight:' + weight + ';color:' + color + ';margin-top:2px;font-family:Lora,serif">' + d.getDate() + '</div>'
        + '<div style="font-size:11px;color:var(--muted);margin-top:1px">' + monthsShort[d.getMonth()] + '</div>'
      + '</div>';
    }
    headRow += '</div>';

    // Body — hours + day columns with positioned events
    var hourCol = '<div style="position:relative">';
    for (var h = 0; h < hourCount; h++) {
      hourCol += '<div style="height:' + pxPerHour + 'px;border-bottom:1px dashed rgba(60,33,36,.06);position:relative">'
        + '<div style="position:absolute;top:-7px;right:6px;font-size:10px;color:var(--muted);background:#FFFDFA;padding:0 4px">' + (hourStart + h).toString().padStart(2,'0') + ':00</div>'
        + '</div>';
    }
    hourCol += '</div>';

    var dayCols = '';
    for (var i = 0; i < 7; i++) {
      var d = new Date(ws); d.setDate(ws.getDate() + i);
      var isToday = d.getTime() === today.getTime();
      var dKey = dayKeys[i];

      var events = [];
      activities.forEach(function(a) {
        var slots = (a.schedule && a.schedule.slots) || [];
        slots.forEach(function(slot) {
          if (slot.day !== dKey) return;
          // Check that activity is active in this date range
          var sd = a.schedule && a.schedule.startDate;
          var ed = a.schedule && a.schedule.endDate;
          if (sd && new Date(sd) > d) return;
          if (ed && new Date(ed) < d) return;
          var st = slot.startTime || '08:00';
          var et = slot.endTime || st;
          var sH = parseInt(st.slice(0,2),10) + parseInt(st.slice(3,5),10)/60;
          var eH = parseInt(et.slice(0,2),10) + parseInt(et.slice(3,5),10)/60;
          if (eH <= sH) eH = sH + 1;
          var top = (sH - hourStart) * pxPerHour;
          var height = (eH - sH) * pxPerHour;
          if (top < 0 || top > totalH) return;
          events.push({ a: a, slot: slot, top: top, height: height, st: st, et: et });
        });
      });

      // Detect overlaps for column splitting
      events.sort(function(a,b){ return a.top - b.top; });
      var lanes = [];
      events.forEach(function(ev) {
        var placed = false;
        for (var li = 0; li < lanes.length; li++) {
          var lane = lanes[li];
          var last = lane[lane.length-1];
          if (last.top + last.height <= ev.top) {
            ev.lane = li;
            lane.push(ev);
            placed = true;
            break;
          }
        }
        if (!placed) {
          ev.lane = lanes.length;
          lanes.push([ev]);
        }
      });
      var laneCount = Math.max(1, lanes.length);

      var eventHtml = events.map(function(ev) {
        var col = colorFor(ev.a);
        var booked = bookings.filter(function(b){ return b && b.activityId === ev.a.id && b.status !== 'cancelled' && b.status !== 'refunded'; }).length;
        var cap = ev.a.capacity || 0;
        var widthPct = 100 / laneCount;
        var leftPct = ev.lane * widthPct;
        var titleEsc = (window.escapeHtml || function(x){return x;})(ev.a.title || 'Kurs');
        var compact = ev.height < 50;
        return '<div onclick="window.viewCourseDetail(\\'' + ev.a.id + '\\')" '
          + 'title="' + titleEsc + ' · ' + ev.st + '–' + ev.et + ' · ' + booked + '/' + cap + '" '
          + 'style="position:absolute;'
          + 'top:' + ev.top + 'px;'
          + 'height:' + Math.max(28, ev.height - 2) + 'px;'
          + 'left:calc(' + leftPct + '% + 2px);'
          + 'width:calc(' + widthPct + '% - 4px);'
          + 'background:' + col.bg + ';'
          + 'border-left:3px solid ' + col.accent + ';'
          + 'border-radius:7px;'
          + 'padding:' + (compact ? '4px 7px' : '6px 9px') + ';'
          + 'cursor:pointer;'
          + 'overflow:hidden;'
          + 'transition:transform .15s, box-shadow .15s;'
          + 'z-index:2"'
          + ' onmouseover="this.style.transform=\\'translateY(-1px)\\';this.style.boxShadow=\\'0 6px 18px -8px rgba(0,0,0,.25)\\';this.style.zIndex=10"'
          + ' onmouseout="this.style.transform=\\'\\';this.style.boxShadow=\\'\\';this.style.zIndex=2">'
          + '<div style="font-size:' + (compact ? '11px' : '12px') + ';font-weight:600;color:' + col.fg + ';line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + titleEsc + '</div>'
          + (compact ? '' : '<div style="font-size:10px;color:' + col.fg + ';opacity:.78;margin-top:2px">' + ev.st + '–' + ev.et + ' · ' + booked + '/' + cap + '</div>')
          + '</div>';
      }).join('');

      // Today highlight
      var todayBg = isToday ? 'background:rgba(217,108,69,0.04);' : '';
      // Now-line
      var nowLine = '';
      if (isToday) {
        var nowD = new Date();
        var nowH = nowD.getHours() + nowD.getMinutes()/60;
        if (nowH >= hourStart && nowH <= hourEnd) {
          var nowTop = (nowH - hourStart) * pxPerHour;
          nowLine = '<div style="position:absolute;left:-2px;right:0;top:' + nowTop + 'px;height:2px;background:var(--apricot-deep);z-index:5;pointer-events:none">'
            + '<div style="position:absolute;left:-6px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--apricot-deep)"></div>'
            + '</div>';
        }
      }
      dayCols += '<div style="position:relative;border-left:1px solid var(--border);height:' + totalH + 'px;' + todayBg + '">';
      // Hour grid lines
      for (var h = 0; h < hourCount; h++) {
        dayCols += '<div style="position:absolute;left:0;right:0;top:' + (h * pxPerHour) + 'px;height:1px;border-top:1px dashed rgba(60,33,36,.06)"></div>';
      }
      dayCols += eventHtml + nowLine + '</div>';
    }

    var body = '<div style="display:grid;grid-template-columns:60px repeat(7, 1fr);position:relative">'
      + hourCol
      + dayCols
      + '</div>';

    return headRow + body;
  }

  // ---------- MONTH VIEW ----------
  function renderMonth() {
    var first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    var firstDow = (first.getDay() + 6) % 7;
    var gridStart = new Date(first); gridStart.setDate(first.getDate() - firstDow);
    var today = new Date(); today.setHours(0,0,0,0);

    var html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);background:var(--border);gap:1px;border:1px solid var(--border)">';
    // Weekday header
    for (var i = 0; i < 7; i++) {
      html += '<div style="background:#FFFDFA;padding:10px 12px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2);text-align:left">' + dayLabelsLong[i] + '</div>';
    }
    // 6 weeks (42 cells)
    for (var c = 0; c < 42; c++) {
      var d = new Date(gridStart); d.setDate(gridStart.getDate() + c);
      var inMonth = d.getMonth() === anchor.getMonth();
      var isToday = d.getTime() === today.getTime();
      var dKey = dayKeys[(d.getDay() + 6) % 7];
      var bg = inMonth ? '#FFFDFA' : '#FAF7F2';
      var dateColor = isToday ? 'var(--apricot-deep)' : (inMonth ? 'var(--ink)' : 'var(--muted)');
      var dateWeight = isToday ? '700' : '500';
      var dateBg = isToday ? 'background:var(--apricot-deep);color:#fff;border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center' : '';

      var events = [];
      activities.forEach(function(a) {
        var slots = (a.schedule && a.schedule.slots) || [];
        slots.forEach(function(slot) {
          if (slot.day !== dKey) return;
          var sd = a.schedule && a.schedule.startDate;
          var ed = a.schedule && a.schedule.endDate;
          if (sd && new Date(sd) > d) return;
          if (ed && new Date(ed) < d) return;
          events.push({ a: a, slot: slot });
        });
      });
      events.sort(function(x,y){ return (x.slot.startTime||'').localeCompare(y.slot.startTime||''); });

      var maxShow = 3;
      var eventHtml = events.slice(0, maxShow).map(function(ev) {
        var col = colorFor(ev.a);
        var time = (ev.slot.startTime || '').slice(0,5);
        var titleEsc = (window.escapeHtml || function(x){return x;})(ev.a.title || 'Kurs');
        return '<div onclick="event.stopPropagation();window.viewCourseDetail(\\'' + ev.a.id + '\\')" '
          + 'title="' + titleEsc + ' · ' + time + '" '
          + 'style="background:' + col.bg + ';color:' + col.fg + ';border-left:2px solid ' + col.accent + ';padding:2px 6px;border-radius:4px;font-size:11px;font-weight:500;line-height:1.3;margin-bottom:2px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
          + '<span style="opacity:.7;margin-right:3px">' + time + '</span>' + titleEsc
          + '</div>';
      }).join('');
      if (events.length > maxShow) {
        eventHtml += '<div style="font-size:10px;color:var(--muted);padding:1px 4px">+' + (events.length - maxShow) + ' weitere</div>';
      }

      html += '<div style="background:' + bg + ';min-height:108px;padding:6px 8px;display:flex;flex-direction:column;gap:1px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
        +   '<div style="font-size:13px;font-weight:' + dateWeight + ';color:' + dateColor + ';' + dateBg + '">' + d.getDate() + '</div>'
        + '</div>'
        + eventHtml
        + '</div>';
    }
    html += '</div>';
    return html;
  }

  var content = ks.view === 'week' ? renderWeek() : renderMonth();

  // Sub label
  var totalThisWeek = 0;
  var ws = startOfWeek(new Date());
  for (var i = 0; i < 7; i++) {
    var d = new Date(ws); d.setDate(ws.getDate() + i);
    var dKey = dayKeys[i];
    activities.forEach(function(a) {
      var slots = (a.schedule && a.schedule.slots) || [];
      slots.forEach(function(slot) {
        if (slot.day === dKey) {
          var sd = a.schedule.startDate, ed = a.schedule.endDate;
          if (sd && new Date(sd) > d) return;
          if (ed && new Date(ed) < d) return;
          totalThisWeek++;
        }
      });
    });
  }
  if (sub) sub.textContent = totalThisWeek + ' Termin' + (totalThisWeek === 1 ? '' : 'e') + ' diese Woche · klick auf einen Termin für Details';

  grid.innerHTML = toolbar + '<div style="max-height:calc(100vh - 280px);overflow-y:auto">' + content + '</div>';
};

window.__kalNav = function(dir) {
  var ks = window.__kalState; if (!ks) return;
  var d = new Date(ks.anchor);
  if (ks.view === 'week') d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);
  ks.anchor = d;
  window.__renderKalender();
};
window.__kalToday = function() {
  if (!window.__kalState) return;
  window.__kalState.anchor = new Date();
  window.__kalState.anchor.setHours(0,0,0,0);
  window.__renderKalender();
};
window.__kalSetView = function(v) {
  if (!window.__kalState) return;
  window.__kalState.view = v;
  window.__renderKalender();
};'''

if not old_pattern.search(fs):
    print('FAIL: kalender sectionLoader pattern not found'); exit(1)
fs = old_pattern.sub(new_loader.replace('\\', '\\\\'), fs, count=1)
# The replace just inserted backslashes — that's wrong. Re.sub treats backslashes as backrefs.
# Reset and use a different strategy.

fs = open(fp, 'r', encoding='utf-8').read()
match = old_pattern.search(fs)
if not match:
    print('FAIL: kalender sectionLoader pattern not found'); exit(1)
fs = fs[:match.start()] + new_loader + fs[match.end():]
print('OK: kalender sectionLoader replaced')

# Reset cached section so the new loader runs on next nav
# (sectionLoaded.kalender flag persists across navigations until reload, but on fresh load it's empty)

open(fp, 'w', encoding='utf-8').write(fs)
print('All patches applied.')
