"""Add the 'Diese Woche'-Kalender below the Letzte Buchungen card on the
Dashboard. Renders 7 days (Mo-So) with mini-event tiles for active activities
matching each weekday.
"""

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(p, 'r', encoding='utf-8').read()

# 1. Inject HTML right before closing of dashboard section (.page close)
old_html = """            <tbody id=\"phRecentBookingsBody\"><tr><td colspan=\"5\" style=\"padding:30px;color:var(--muted);text-align:center;font-size:13px\">Lade Buchungen…</td></tr></tbody>
          </table>
        </div>
      </div>

      </div>  <!-- close .page -->
      </div>  <!-- close dashboard section -->"""

new_html = """            <tbody id=\"phRecentBookingsBody\"><tr><td colspan=\"5\" style=\"padding:30px;color:var(--muted);text-align:center;font-size:13px\">Lade Buchungen…</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- DIESE WOCHE -->
      <div class=\"card\" style=\"margin-bottom:26px\" id=\"phWeekGlanceCard\">
        <div class=\"card-head\">
          <div class=\"card-title\">Diese <em>Woche</em></div>
          <a href=\"#\" class=\"card-link\" onclick=\"showSection('kursbloecke'); return false\">Voller Kalender →</a>
        </div>
        <div class=\"week\" id=\"phWeekGlance\">
          <div style=\"grid-column:1 / -1; padding:24px; color:var(--muted); text-align:center; font-size:13px\">Lade Wochenübersicht…</div>
        </div>
      </div>

      </div>  <!-- close .page -->
      </div>  <!-- close dashboard section -->"""

if old_html not in src:
    print('FAIL: dashboard close anchor not found'); exit(1)
src = src.replace(old_html, new_html, 1)

# 2. Inject CSS additions for week-day event tiles (the existing .week, .week-day,
#    .week-label, .week-date already exist — we only add the event chip styling).
css_inject = """

/* === Dashboard Week-Glance event chips === */
.week-event { background: var(--apricot-tint, #FDE4D3); color: var(--apricot-deep, #B8704F); border-radius: 8px; padding: 4px 6px; font-size: 11px; font-weight: 500; line-height: 1.25; margin-top: 4px; cursor: pointer; transition: background .12s ease; overflow: hidden; text-overflow: ellipsis; }
.week-event:hover { background: var(--apricot-light, #F5D3B6); }
.week-event.cat-bewegung,
.week-event.cat-natur { background: var(--sage-tint, #E4EBDE); color: var(--sage-deep, #627A5A); }
.week-event.cat-bewegung:hover,
.week-event.cat-natur:hover { background: #D4DECB; }
.week-event-time { font-weight: 600; color: var(--ink); margin-right: 4px; font-size: 10px; }
.week-empty { color: var(--muted-2); font-size: 11px; text-align: center; padding: 8px 0; opacity: .7; }
"""
style_close = "</style>"
idx = src.index(style_close)
src = src[:idx] + css_inject + "\n" + src[idx:]

# 3. Inject render logic: append a renderWeekGlance() call at the end of the
#    main dashboard load IIFE (Phase 1d). Anchor: end of recentBookings rendering.
#    Find a good anchor — the recent bookings tbody set ends with `}).join('');` followed by `}`.
#    Easier: just inject a window.renderWeekGlance helper + call it on every dashboard load.

helper = """
// === Dashboard Week-Glance Renderer ===
window.renderWeekGlance = function() {
  var c = document.getElementById('phWeekGlance');
  if (!c) return;
  var s = window.dashboardState; if (!s) return;
  var activities = s.activities || [];
  var dayKeys = ['MO','TU','WE','TH','FR','SA','SU'];
  var dayLabels = ['MON','DIE','MIT','DON','FRE','SAM','SON'];
  // Build dates for current week (Monday-based)
  var now = new Date();
  var dow = now.getDay(); // 0..6, 0=Sun
  var diffToMon = (dow + 6) % 7;
  var monday = new Date(now); monday.setDate(now.getDate() - diffToMon); monday.setHours(0,0,0,0);
  var todayKey = now.toISOString().slice(0, 10);

  // Bucket activities by weekday from their schedule.slots (recurring) or schedule.date (single)
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
  });

  var html = '';
  for (var i = 0; i < 7; i++) {
    var d = new Date(monday); d.setDate(monday.getDate() + i);
    var iso = d.toISOString().slice(0, 10);
    var isToday = iso === todayKey;
    var key = dayKeys[i];
    var label = dayLabels[i];
    var datStr = String(d.getDate()).padStart(2, '0');
    var monthStr = String(d.getMonth() + 1).padStart(2, '0');
    var events = byDay[key] || [];
    events.sort(function(a, b) { return (a.startTime || '').localeCompare(b.startTime || ''); });
    html += '<div class="week-day' + (isToday ? ' today' : '') + '">'
      + '<div class="week-label">' + label + '</div>'
      + '<div class="week-date">' + datStr + '.' + monthStr + '</div>';
    if (events.length === 0) {
      html += '<div class="week-empty">—</div>';
    } else {
      events.slice(0, 4).forEach(function(ev) {
        var catCls = ev.category ? (' cat-' + String(ev.category).toLowerCase().replace(/[^a-z0-9-]/g,'')) : '';
        var timeTxt = ev.startTime || '';
        html += '<div class="week-event' + catCls + '" onclick="window.viewCourseDetail(\\'' + ev.id + '\\')" title="' + escapeHtml(ev.title) + '">'
          + (timeTxt ? '<span class="week-event-time">' + timeTxt + '</span>' : '')
          + escapeHtml(ev.title)
          + '</div>';
      });
      if (events.length > 4) {
        html += '<div class="week-empty">+ ' + (events.length - 4) + ' weitere</div>';
      }
    }
    html += '</div>';
  }
  c.innerHTML = html;
};
"""

# Inject helper near other window.* dashboard helpers (right before SPA-Router marker)
marker = "// Phase 2a: SPA-Router"
if marker not in src:
    print('FAIL: SPA-Router marker not found'); exit(1)
src = src.replace(marker, helper.rstrip() + "\n\n  " + marker, 1)

# 4. Auto-call renderWeekGlance after dashboard data loads. Hook into existing
#    refreshDashboardCards if it exists, else call it from the dashboard
#    sectionLoader area.
old_refresh = "if (typeof window.refreshDashboardCards === 'function') window.refreshDashboardCards();"
new_refresh = "if (typeof window.refreshDashboardCards === 'function') window.refreshDashboardCards(); if (typeof window.renderWeekGlance === 'function') window.renderWeekGlance();"
# Replace ALL occurrences (we may have multiple call-sites)
count = src.count(old_refresh)
if count > 0:
    src = src.replace(old_refresh, new_refresh)
    print('Hooked renderWeekGlance into', count, 'refresh sites')

# Also call on initial dashboard render. Find the recent-bookings render anchor
recent_anchor = "// 6. Letzte Buchungen-Tabelle (5 letzte) — nutzt class=\"data-table\" + .cust pattern"
if recent_anchor in src:
    # inject after the recent-bookings block ends; simplest: add call after the
    # dashboard's render finishes. The function refreshDashboardCards already
    # exists and gets called — let's also wire renderWeekGlance into THAT.
    # We already did that above with replace_all of old_refresh.
    pass

open(p, 'w', encoding='utf-8').write(src)
print('OK: Dashboard Week-Glance injected (HTML + CSS + renderer)')
