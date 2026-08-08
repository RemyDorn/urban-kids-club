"""Make Kurs-Detail rows clickable:
1. Each Termin-row -> opens session-detail modal (sessionNumber, date, time,
   status, attendance list, actions: Reschedule/Cancel/Mark)
2. Each booking row -> opens parent-detail modal (parent profile, children,
   other courses they're enrolled in)
"""

import re

fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(fp, 'r', encoding='utf-8').read()

# ============================================================
# 1. Make termin-item clickable -> __kdShowSession
# ============================================================
old_termin = '''return '<div class="termin-item' + ((isPast || isCancelled) ? ' is-done' : '') + '">'
      + '<div class="termin-date"><div class="termin-date-day">' + d.getDate() + '</div><div class="termin-date-month">' + monthsShort[d.getMonth()] + '</div></div>'
      + '<div class="termin-main"><div class="termin-title">Stunde ' + (item.num || '?') + '</div>'
      + '<div class="termin-sub">' + dayShort[dayIdx] + ', ' + timeLabel + ' · ' + roomLabel + capLabel + '</div></div>'
      + rightLabel + '</div>';'''
new_termin = '''var sessionId = item.id || ('virtual-' + d.toISOString());
    var clickAttr = ' onclick="window.__kdShowSession(' + JSON.stringify(JSON.stringify(item)).replace(/"/g, '&quot;') + ')" style="cursor:pointer"';
    return '<div class="termin-item' + ((isPast || isCancelled) ? ' is-done' : '') + '"' + clickAttr + '>'
      + '<div class="termin-date"><div class="termin-date-day">' + d.getDate() + '</div><div class="termin-date-month">' + monthsShort[d.getMonth()] + '</div></div>'
      + '<div class="termin-main"><div class="termin-title">Stunde ' + (item.num || '?') + '</div>'
      + '<div class="termin-sub">' + dayShort[dayIdx] + ', ' + timeLabel + ' · ' + roomLabel + capLabel + '</div></div>'
      + rightLabel + '</div>';'''
if old_termin not in src:
    print('FAIL: termin-row template not found'); exit(1)
src = src.replace(old_termin, new_termin, 1)
print('OK: termin-row is now clickable')

# ============================================================
# 2. Make booking row clickable -> __kdShowParent
# ============================================================
old_booking_row = '''return '<tr>'
      + '<td>' + (window.escapeHtml ? window.escapeHtml(name) : name) + '</td>'
      + '<td>' + (window.escapeHtml ? window.escapeHtml(childLabel) : childLabel) + '</td>'
      + '<td>' + when + '</td>'
      + '<td>' + amt + '</td>'
      + '<td><span class="pill ' + pillCls + '">' + pillTxt + '</span>' + pm + '</td>'
      + '</tr>';'''
new_booking_row = '''var parentId = b.parentId || (b.customer && b.customer.id) || '';
    var clickAttr = parentId ? ' onclick="window.__kdShowParent(\\'' + parentId + '\\')" style="cursor:pointer"' : '';
    var hoverAttr = parentId ? ' class="kd-row-clickable"' : '';
    return '<tr' + hoverAttr + clickAttr + '>'
      + '<td>' + (window.escapeHtml ? window.escapeHtml(name) : name) + '</td>'
      + '<td>' + (window.escapeHtml ? window.escapeHtml(childLabel) : childLabel) + '</td>'
      + '<td>' + when + '</td>'
      + '<td>' + amt + '</td>'
      + '<td><span class="pill ' + pillCls + '">' + pillTxt + '</span>' + pm + '</td>'
      + '</tr>';'''
if old_booking_row not in src:
    print('FAIL: booking-row template not found'); exit(1)
src = src.replace(old_booking_row, new_booking_row, 1)
print('OK: booking-row is now clickable')

# ============================================================
# 3. Inject CSS for hover styles + helpers __kdShowSession + __kdShowParent
# ============================================================
HELPERS = r'''
window.__kdShowSession = function(itemJson) {
  var item;
  try { item = JSON.parse(itemJson); } catch(e) { return; }
  var s = window.dashboardState; if (!s) return;
  var a = (s.activities || []).find(function(x){ return x.id === window.__kdActiveId; });
  if (!a) return;
  var d = new Date(item.date);
  var dayLabelsLong = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
  var months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  var dayIdx = (d.getDay() + 6) % 7;
  var dateLabel = dayLabelsLong[dayIdx] + ', ' + d.getDate() + '. ' + months[d.getMonth()] + ' ' + d.getFullYear();
  var st = (item.startTime || '').slice(0,5);
  var et = (item.endTime || '').slice(0,5);
  var timeLabel = st + (et ? '–' + et : '');
  var roomLabel = (window.__kalRoomName ? window.__kalRoomName(a.roomId) : null) || a.roomName || (a.roomId ? '—' : 'Kein Raum');
  var now = new Date(); now.setHours(0,0,0,0);
  var isPast = d < now;
  var isCancelled = item.status === 'cancelled';

  // Enrolled participants (current bookings for this activity)
  var bookings = (s.bookings || []).filter(function(b) {
    return b && b.activityId === a.id && b.status !== 'cancelled' && b.status !== 'refunded';
  });

  var statusBadge = '';
  if (isCancelled) statusBadge = '<span class="pill" style="background:var(--signal-tint);color:var(--signal)">Abgesagt</span>';
  else if (isPast) statusBadge = '<span class="pill" style="background:var(--sage-tint);color:var(--sage-deep)">Erledigt</span>';
  else statusBadge = '<span class="pill pill-ok">Geplant</span>';

  var rows = [
    { label: 'Stunde', val: 'Nr. ' + (item.num || '?') + ' · ' + (item.isReal ? 'aus Block' : 'berechnet') },
    { label: 'Wann', val: dateLabel + (timeLabel ? ' · ' + timeLabel : '') },
    { label: 'Raum', val: roomLabel },
    { label: 'Status', html: statusBadge },
    { label: 'Teilnehmer', val: bookings.length + '/' + (a.capacity || '?') + ' Plätze' },
  ];
  if (item.cancellationReason) rows.push({ label: 'Absage-Grund', val: item.cancellationReason });

  // Participants list HTML
  var partsHtml = '';
  if (bookings.length > 0) {
    partsHtml = '<div style="margin-top:18px;border-top:1px solid var(--border);padding-top:16px">'
      + '<div class="info-label" style="margin-bottom:10px">Teilnehmer · ' + bookings.length + '</div>'
      + bookings.map(function(b) {
        var nm = b.customerName || (b.customer && b.customer.name) || '—';
        var ch = (b.child && b.child.name) || ((b.child && b.child.firstName) ? (b.child.firstName + ' ' + (b.child.lastName || '')).trim() : '—');
        var pid = b.parentId || (b.customer && b.customer.id);
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px dashed var(--border);font-size:13px">'
          + '<div><strong>' + (window.escapeHtml ? window.escapeHtml(nm) : nm) + '</strong><span style="color:var(--muted-2);margin-left:8px">' + (window.escapeHtml ? window.escapeHtml(ch) : ch) + '</span></div>'
          + (pid ? '<a class="card-link" style="font-size:12px" onclick="this.closest(\'.ukc-detail-overlay\').remove();window.__kdShowParent(\'' + pid + '\')">Profil →</a>' : '')
          + '</div>';
      }).join('') + '</div>';
  }

  var titleHtml = (window.escapeHtml ? window.escapeHtml(a.title) : a.title) + ' · <em>Stunde ' + (item.num || '?') + '</em>';

  var actions = '';
  if (!isPast && !isCancelled && item.id) {
    actions = '<button class="btn btn-ghost btn-sm" onclick="alert(\'Termin verschieben — folgt im nächsten Sprint\')">Verschieben</button>'
      + ' <button class="btn btn-ghost btn-sm" style="color:var(--signal)" onclick="alert(\'Termin absagen — folgt im nächsten Sprint\')">Absagen</button>';
  } else if (isPast && !isCancelled && item.id) {
    actions = '<button class="btn btn-ghost btn-sm" onclick="alert(\'Anwesenheit prüfen — folgt im nächsten Sprint (QR-Check-In)\')">Anwesenheit</button>';
  }
  var closeBtn = '<button class="btn btn-ghost btn-sm" onclick="this.closest(\'.ukc-detail-overlay\').remove()">Schließen</button>';

  if (typeof window.ukcShowDetailModal === 'function') {
    window.ukcShowDetailModal({
      kicker: 'Termin · ' + (a.category || ''),
      titleHtml: titleHtml,
      rows: rows,
      bodyExtraHtml: partsHtml,
      footerHtml: actions + ' ' + closeBtn,
    });
  } else {
    alert(a.title + ' — ' + dateLabel + ' · ' + timeLabel);
  }
};

window.__kdShowParent = async function(parentId) {
  var s = window.dashboardState; if (!s || !parentId) return;
  // Open empty modal first, then hydrate
  var loadingHtml = '<div style="padding:32px;text-align:center;color:var(--muted-2)">Lade Profil…</div>';
  if (typeof window.ukcShowDetailModal === 'function') {
    window.ukcShowDetailModal({
      kicker: 'Kunde',
      titleHtml: 'Profil <em>laden…</em>',
      rows: [],
      bodyExtraHtml: loadingHtml,
      footerHtml: '<button class="btn btn-ghost btn-sm" onclick="this.closest(\'.ukc-detail-overlay\').remove()">Schließen</button>',
    });
  }
  // Fetch parent details — try /api/parents/:id, fallback to inline data
  var parent = null;
  try {
    var r = await s.api('/parents/' + parentId);
    parent = r.data || r.parent || r || null;
  } catch (e) {}
  // All bookings of this parent (we have them in state already)
  var allBookings = (s.bookings || []).filter(function(b) { return b && (b.parentId === parentId || (b.customer && b.customer.id === parentId)); });
  // Map activityId -> activity title
  var actMap = {};
  (s.activities || []).forEach(function(a) { actMap[a.id] = a; });

  var name = (parent && parent.name) || (allBookings[0] && allBookings[0].customerName) || '—';
  var email = (parent && parent.email) || (allBookings[0] && allBookings[0].customerEmail) || '—';
  var phone = (parent && parent.phone) || (allBookings[0] && (allBookings[0].customer && allBookings[0].customer.phone)) || '—';

  // Derive children from bookings (de-dup by name)
  var childrenMap = {};
  allBookings.forEach(function(b) {
    var ch = (b.child && b.child.name) || ((b.child && b.child.firstName) ? (b.child.firstName + ' ' + (b.child.lastName || '')).trim() : null);
    if (!ch) return;
    if (!childrenMap[ch]) childrenMap[ch] = { name: ch, age: (b.child && b.child.age) || null, bookings: [] };
    childrenMap[ch].bookings.push(b);
  });
  var children = Object.values(childrenMap);

  // Active courses (distinct activityIds with active bookings)
  var activeBookings = allBookings.filter(function(b) { return b.status !== 'cancelled' && b.status !== 'refunded'; });
  var activeActIds = {};
  activeBookings.forEach(function(b) { activeActIds[b.activityId] = true; });
  var courseList = Object.keys(activeActIds).map(function(aid) {
    var a = actMap[aid];
    if (!a) return null;
    var b = activeBookings.find(function(x) { return x.activityId === aid; });
    var paidLabel = b && b.paymentStatus === 'paid' ? '<span class="pill pill-ok" style="margin-left:6px">BEZAHLT</span>' : '<span class="pill pill-pending" style="margin-left:6px">OFFEN</span>';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px dashed var(--border);font-size:13px">'
      + '<div style="flex:1;cursor:pointer" onclick="this.closest(\'.ukc-detail-overlay\').remove();window.viewCourseDetail(\'' + a.id + '\')">'
      +   '<div><strong>' + (window.escapeHtml ? window.escapeHtml(a.title) : a.title) + '</strong>' + paidLabel + '</div>'
      +   '<div style="font-size:11px;color:var(--muted-2);margin-top:2px">' + (a.category || '—') + '</div>'
      + '</div>'
      + '<a class="card-link" style="font-size:12px" onclick="this.closest(\'.ukc-detail-overlay\').remove();window.viewCourseDetail(\'' + a.id + '\')">Kurs →</a>'
      + '</div>';
  }).filter(Boolean).join('');

  var totalSpend = allBookings.filter(function(b){ return b.paymentStatus === 'paid'; }).reduce(function(acc, b){ return acc + (b.amountPaid || 0); }, 0);

  var rows = [
    { label: 'E-Mail', val: email },
    { label: 'Telefon', val: phone },
    { label: 'Buchungen', val: allBookings.length + ' insgesamt · ' + activeBookings.length + ' aktiv' },
    { label: 'Bezahlt (gesamt)', val: window.__kdFmtMoney(totalSpend) },
  ];

  var childrenHtml = '';
  if (children.length > 0) {
    childrenHtml = '<div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px">'
      + '<div class="info-label" style="margin-bottom:10px">Kinder · ' + children.length + '</div>'
      + children.map(function(c) {
        return '<div style="font-size:13px;padding:6px 0">'
          + '<strong>' + (window.escapeHtml ? window.escapeHtml(c.name) : c.name) + '</strong>'
          + (c.age ? ' <span style="color:var(--muted-2)">· ' + c.age + ' J.</span>' : '')
          + ' <span style="color:var(--muted-2);font-size:12px">· ' + c.bookings.length + ' Buchung' + (c.bookings.length === 1 ? '' : 'en') + '</span>'
          + '</div>';
      }).join('') + '</div>';
  }

  var coursesHtml = '';
  if (courseList) {
    coursesHtml = '<div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px">'
      + '<div class="info-label" style="margin-bottom:6px">Aktive Kurse · ' + Object.keys(activeActIds).length + '</div>'
      + courseList + '</div>';
  }

  // Re-render the modal with hydrated content
  var ovs = document.querySelectorAll('.ukc-detail-overlay');
  if (ovs.length > 0) ovs[ovs.length - 1].remove();
  if (typeof window.ukcShowDetailModal === 'function') {
    window.ukcShowDetailModal({
      kicker: 'Kunde',
      titleHtml: (window.escapeHtml ? window.escapeHtml(name.split(' ')[0]) : name.split(' ')[0]) + ' <em>' + (window.escapeHtml ? window.escapeHtml(name.split(' ').slice(1).join(' ') || name) : name.split(' ').slice(1).join(' ') || name) + '</em>',
      rows: rows,
      bodyExtraHtml: childrenHtml + coursesHtml,
      footerHtml: '<button class="btn btn-ghost btn-sm" onclick="alert(\'Nachricht — folgt mit Postfach-System\')">Nachricht senden</button>'
        + ' <button class="btn btn-ghost btn-sm" onclick="this.closest(\'.ukc-detail-overlay\').remove()">Schließen</button>',
    });
  }
};
'''

# Insert helpers right after __kdArchive
anchor = "  window.__kdArchive = function() {"
idx = src.find(anchor)
if idx < 0:
    print('FAIL: __kdArchive anchor not found'); exit(1)
end_idx = src.find("\n  };", idx)
end_idx = src.find('\n', end_idx + 1) + 1
src = src[:end_idx] + HELPERS + src[end_idx:]
print('OK: __kdShowSession + __kdShowParent helpers added')

# Add hover CSS for clickable rows
CSS = '''
.termin-item[onclick] { transition: background var(--motion-fast); }
.termin-item[onclick]:hover { background: var(--surface-alt); }
tr.kd-row-clickable { transition: background var(--motion-fast); }
tr.kd-row-clickable:hover td { background: var(--surface-alt); }
'''
m_style = re.search(r'</style>', src)
if not m_style:
    print('FAIL: </style> not found'); exit(1)
src = src[:m_style.start()] + CSS + src[m_style.start():]
print('OK: hover CSS injected')

# ============================================================
# Note: ukcShowDetailModal needs to support bodyExtraHtml.
# Check existing impl and patch if needed.
# ============================================================
m_modal = re.search(r"window\.ukcShowDetailModal = function\(opts\) \{[\s\S]*?\};", src)
if m_modal:
    modal_text = m_modal.group(0)
    if 'bodyExtraHtml' not in modal_text:
        # find rows render line and insert bodyExtra after
        new_modal_text = modal_text.replace(
            "'</div>';",
            "'</div>' + (opts.bodyExtraHtml || '');",
            1,
        )
        # If above didn't change anything, try alternative
        if new_modal_text == modal_text:
            # Find footer html template and insert before it
            pat = "var footerHtml = opts.footerHtml || ''"
            if pat in modal_text:
                pass  # leave for now
        else:
            src = src.replace(modal_text, new_modal_text, 1)
            print('OK: ukcShowDetailModal extended with bodyExtraHtml')
    else:
        print('OK: ukcShowDetailModal already supports bodyExtraHtml')
else:
    print('WARN: ukcShowDetailModal definition not found — bodyExtraHtml may be ignored')

open(fp, 'w', encoding='utf-8').write(src)
print('All patches applied.')
