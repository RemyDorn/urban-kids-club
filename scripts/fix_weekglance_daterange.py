"""Fix renderWeekGlance: respect schedule.startDate / endDate so a course
that starts next week doesn't appear in 'Diese Woche'.
"""
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(fp, 'r', encoding='utf-8').read()

old = """  // Bucket activities by weekday from their schedule.slots (recurring) or schedule.date (single)
  var byDay = { MO: [], TU: [], WE: [], TH: [], FR: [], SA: [], SU: [] };
  activities.forEach(function(a) {
    if (!a || a.status === 'archived' || a.status === 'cancelled') return;
    var sched = a.schedule || {};
    if (sched.type === 'recurring' && Array.isArray(sched.slots)) {
      sched.slots.forEach(function(slot) {
        if (slot && byDay[slot.day]) {
          byDay[slot.day].push({ title: a.title || 'Kurs', startTime: (slot.startTime||'').slice(0,5), endTime: (slot.endTime||'').slice(0,5), category: a.category || 'sonstige', id: a.id });
        }
      });
    } else if (sched.type === 'single' && sched.date) {
      // place on weekday of that date if within this week
      var d = new Date(sched.date + 'T00:00:00');
      if (d >= monday && d - monday < 7*24*3600*1000) {
        var k = dayKeys[(d.getDay()+6) % 7];
        byDay[k].push({ title: a.title || 'Kurs', startTime: (sched.startTime||'').slice(0,5), endTime: (sched.endTime||'').slice(0,5), category: a.category || 'sonstige', id: a.id });
      }
    }
  });"""

new = """  // Build per-day buckets, but check that each cell's date is within
  // the activity's schedule.startDate / endDate window.
  var byDay = { MO: [], TU: [], WE: [], TH: [], FR: [], SA: [], SU: [] };
  // Pre-compute the seven dates of this week
  var weekDates = [];
  for (var di = 0; di < 7; di++) {
    var dd = new Date(monday); dd.setDate(monday.getDate() + di);
    dd.setHours(0,0,0,0);
    weekDates.push(dd);
  }
  function inRange(date, sd, ed) {
    if (sd) {
      var s = new Date(sd + (sd.length === 10 ? 'T00:00:00' : '')); s.setHours(0,0,0,0);
      if (date < s) return false;
    }
    if (ed) {
      var e = new Date(ed + (ed.length === 10 ? 'T23:59:59' : '')); e.setHours(23,59,59,999);
      if (date > e) return false;
    }
    return true;
  }
  activities.forEach(function(a) {
    if (!a || a.status === 'archived' || a.status === 'cancelled' || a.status === 'paused') return;
    var sched = a.schedule || {};
    if (sched.type === 'recurring' && Array.isArray(sched.slots)) {
      sched.slots.forEach(function(slot) {
        if (!slot || !byDay[slot.day]) return;
        var dayIdx = dayKeys.indexOf(slot.day);
        if (dayIdx < 0) return;
        var cellDate = weekDates[dayIdx];
        if (!inRange(cellDate, sched.startDate, sched.endDate)) return;
        byDay[slot.day].push({ title: a.title || 'Kurs', startTime: (slot.startTime||'').slice(0,5), endTime: (slot.endTime||'').slice(0,5), category: a.category || 'sonstige', id: a.id });
      });
    } else if (sched.type === 'single' && sched.date) {
      var d = new Date(sched.date + 'T00:00:00');
      if (d >= monday && d - monday < 7*24*3600*1000) {
        var k = dayKeys[(d.getDay()+6) % 7];
        byDay[k].push({ title: a.title || 'Kurs', startTime: (sched.startTime||'').slice(0,5), endTime: (sched.endTime||'').slice(0,5), category: a.category || 'sonstige', id: a.id });
      }
    }
  });"""

if old not in src:
    print('FAIL: anchor not found'); exit(1)
src = src.replace(old, new, 1)
open(fp, 'w', encoding='utf-8').write(src)
print('OK: renderWeekGlance respects startDate/endDate window + skips paused')
