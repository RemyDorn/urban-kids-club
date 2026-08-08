"""Polish the Kurs-Detail page so it actually shows real data and the
five non-overview tabs work.

Changes:
  1) viewCourseDetail becomes async; preloads /rooms, /team, course-block,
     block-sessions for this activity once, caches in window state.
  2) Sessions list (Uebersicht):
        - real sessions from API if available; falls back to computed
        - sort: future first ascending, past last (most recent first)
        - per-row: "Stunde N", date tile, day-name, real start-end times,
          room, capacity (X/Y) for future or attendance count for past
        - "Naechster" / "Erledigt" / "Abgesagt" badges
  3) Bookings table (Uebersicht): customer + child + age + booked date +
     amount + paymentStatus pill
  4) Im Detail: trainer name resolved via team lookup; room via room lookup;
     dauer pulled from slot
  5) Tabs Kursblocke, Teilnehmer, Warteliste, Finanzen, Einstellungen all
     populated with real content (Warteliste = empty-state)
"""

import re

fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(fp, 'r', encoding='utf-8').read()

# ============================================================
# Replace the entire viewCourseDetail + helpers + render block.
# Anchor: from `window.viewCourseDetail = function` to end of `__kdRenderTab` definition.
# ============================================================

new_block = r'''window.viewCourseDetail = async function(id) {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === id; });
    if (!a) { alert('Kurs nicht gefunden'); return; }
    window.__kdActiveId = id;
    window.showSection('kursdetail');
    // Show overview tab by default
    window.__kdActiveTab = 'overview';
    document.querySelectorAll('#phKdTabs .detail-tab').forEach(function(b) {
      b.classList.toggle('active', b.dataset.kdtab === 'overview');
    });
    document.querySelectorAll('.kdtab-pane').forEach(function(p) {
      p.hidden = (p.dataset.kdpane !== 'overview');
    });
    // Render skeleton immediately
    window.__kdRender();
    // Load deps in parallel
    await window.__kdLoadDeps(id);
    // Re-render with hydrated data
    window.__kdRender();
  };

  window.__kdActiveTab = 'overview';
  window.__kdSessionsCache = window.__kdSessionsCache || {};

  window.__kdLoadDeps = async function(activityId) {
    var s = window.dashboardState; if (!s) return;
    var jobs = [];
    if (typeof window.__kalLoadRooms === 'function' && !s.rooms) {
      jobs.push(window.__kalLoadRooms());
    }
    if (!s.team) {
      jobs.push((async function() {
        try {
          var r = await s.api('/providers/' + s.provider.id + '/team');
          s.team = r.data || r.team || r || [];
        } catch (e) { s.team = []; }
      })());
    }
    if (!s.courseBlocks) {
      jobs.push((async function() {
        try {
          var r = await s.api('/providers/' + s.provider.id + '/course-blocks');
          s.courseBlocks = r.data || r.courseBlocks || r || [];
        } catch (e) { s.courseBlocks = []; }
      })());
    }
    await Promise.all(jobs);
    // After course-blocks, load sessions for this activity's block(s)
    var blocks = (s.courseBlocks || []).filter(function(b) { return b && b.activityId === activityId; });
    if (blocks.length > 0 && !window.__kdSessionsCache[activityId]) {
      var allSessions = [];
      await Promise.all(blocks.map(async function(b) {
        try {
          var r = await s.api('/course-blocks/' + b.id + '/sessions');
          var sess = r.data || r.sessions || r || [];
          sess.forEach(function(x) { x.__blockId = b.id; });
          allSessions = allSessions.concat(sess);
        } catch (e) {}
      }));
      window.__kdSessionsCache[activityId] = allSessions;
    }
  };

  window.__kdSwitchTab = function(key) {
    window.__kdActiveTab = key;
    document.querySelectorAll('#phKdTabs .detail-tab').forEach(function(b) {
      b.classList.toggle('active', b.dataset.kdtab === key);
    });
    document.querySelectorAll('.kdtab-pane').forEach(function(p) {
      p.hidden = (p.dataset.kdpane !== key);
    });
    if (key !== 'overview') window.__kdRenderTab(key);
  };

  if (!window.__kdTabsWired) {
    document.addEventListener('click', function(e) {
      var t = e.target.closest('#phKdTabs .detail-tab');
      if (!t) return;
      window.__kdSwitchTab(t.dataset.kdtab);
    });
    window.__kdTabsWired = true;
  }

  // ---------- Helpers ----------
  window.__kdFmtMoney = function(n) {
    return (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' €';
  };
  window.__kdFmtMoneyNum = function(n) {
    return (Math.round(Number(n || 0) * 100) / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  window.__kdFmtDateDE = function(s) {
    if (!s) return '—';
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    return parseInt(m[3],10) + '.' + parseInt(m[2],10) + '.' + m[1];
  };
  window.__kdSeason = function(iso) {
    var m = String(iso).match(/^(\d{4})-(\d{2})/);
    if (!m) return '';
    var month = parseInt(m[2], 10); var year = m[1];
    if (month >= 3 && month <= 5) return 'Frühjahr ' + year;
    if (month >= 6 && month <= 8) return 'Sommer ' + year;
    if (month >= 9 && month <= 11) return 'Herbst ' + year;
    return 'Winter ' + year;
  };
  window.__kdRelTime = function(iso) {
    if (!iso) return '—';
    var d = new Date(iso); var now = new Date();
    var diff = Math.floor((now - d) / 86400000);
    if (diff < 0) return window.__kdFmtDateDE(iso);
    var hh = String(d.getHours()).padStart(2,'0'); var mm = String(d.getMinutes()).padStart(2,'0');
    if (diff === 0) return 'heute, ' + hh + ':' + mm;
    if (diff === 1) return 'gestern, ' + hh + ':' + mm;
    if (diff < 7) return 'vor ' + diff + ' Tagen';
    return window.__kdFmtDateDE(iso);
  };
  window.__kdTrainerName = function(instructorId) {
    var s = window.dashboardState; if (!s || !instructorId) return null;
    var t = (s.team || []).find(function(x) { return x && x.id === instructorId; });
    return (t && (t.name || ((t.firstName || '') + ' ' + (t.lastName || '')).trim())) || null;
  };

  // Build session list — prefer real API sessions, fall back to computed
  window.__kdGetSessions = function(activityId) {
    var s = window.dashboardState; if (!s) return [];
    var a = (s.activities || []).find(function(x){ return x.id === activityId; });
    if (!a) return [];
    var apiSess = window.__kdSessionsCache[activityId];
    if (apiSess && apiSess.length > 0) {
      return apiSess.map(function(x) {
        var d = new Date(x.date);
        return {
          id: x.id, blockId: x.__blockId,
          date: d, num: x.sessionNumber || 0,
          startTime: x.startTime || '', endTime: x.endTime || '',
          status: x.status || 'scheduled',
          isReal: true,
        };
      });
    }
    // Fallback compute from schedule
    var sched = a.schedule || {}; var slot = (sched.slots || [])[0] || {};
    if (!slot.day || !sched.startDate) return [];
    var dayKeys = ['MO','TU','WE','TH','FR','SA','SU'];
    var sd = dayKeys.indexOf(slot.day);
    if (sd < 0) return [];
    var startD = new Date(sched.startDate); startD.setHours(0,0,0,0);
    var endD = sched.endDate ? new Date(sched.endDate) : new Date(startD.getTime() + 365*86400000);
    var pkg = (a.pricing && a.pricing[0] && a.pricing[0].packageSize) || 0;
    var out = []; var d = new Date(startD); var iter = 0; var n = 1;
    while (d <= endD && out.length < (pkg || 50) && iter < 400) {
      if (((d.getDay() + 6) % 7) === sd) {
        out.push({ date: new Date(d), num: n++, startTime: slot.startTime || '', endTime: slot.endTime || '', status: 'scheduled', isReal: false });
      }
      d.setDate(d.getDate() + 1); iter++;
    }
    return out;
  };

  // Sort: future ascending (next first), then past in reverse chrono (newest past after future).
  window.__kdSortSessions = function(list) {
    var now = new Date(); now.setHours(0,0,0,0);
    var future = list.filter(function(x) { return x.date >= now; }).sort(function(a, b) { return a.date - b.date; });
    var past = list.filter(function(x) { return x.date < now; }).sort(function(a, b) { return b.date - a.date; });
    return future.concat(past);
  };

  // ---------- Render: main page ----------
  window.__kdRender = function() {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === window.__kdActiveId; });
    if (!a) return;
    var sched = a.schedule || {};
    var slot = (sched.slots || [])[0] || {};
    var price = (a.pricing && a.pricing[0]) || {};
    var bookings = (s.bookings || []).filter(function(b) {
      return b && b.activityId === a.id && b.status !== 'cancelled' && b.status !== 'refunded';
    });
    var booked = bookings.length;
    var cap = a.capacity || 0;
    var roomLabel = (window.__kalRoomName ? window.__kalRoomName(a.roomId) : null) || a.roomName || (a.roomId ? '—' : 'Kein Raum');
    var trainerName = window.__kdTrainerName(a.instructorId) || a.instructorName || a.trainerName || (a.instructorId ? '—' : 'Kein Kursleiter');

    // Title — split last word into <em>
    var title = a.title || 'Kurs';
    var parts = title.split(' ');
    var titleHtml;
    if (parts.length >= 2) {
      var last = parts.pop();
      titleHtml = (window.escapeHtml ? window.escapeHtml(parts.join(' ')) : parts.join(' ')) + ' <em>' + (window.escapeHtml ? window.escapeHtml(last) : last) + '</em>';
    } else {
      titleHtml = '<em>' + (window.escapeHtml ? window.escapeHtml(title) : title) + '</em>';
    }
    document.getElementById('phKdTitle').innerHTML = titleHtml;
    document.getElementById('phKdBreadcrumb').textContent = title;

    // Meta row 1
    document.getElementById('phKdKategorie').textContent = a.category || 'Sonstige';
    var ageMin = (a.ageRange && a.ageRange.min != null) ? a.ageRange.min : null;
    var ageMax = (a.ageRange && a.ageRange.max != null) ? a.ageRange.max : null;
    var ageUnit = (a.ageRange && a.ageRange.unit) || 'years';
    var ageLabel = '—';
    if (ageMin != null && ageMax != null) {
      ageLabel = ageMin + '–' + ageMax + ' ' + (ageUnit === 'months' ? 'Monate' : 'J.');
    }
    document.getElementById('phKdAge').textContent = ageLabel;
    var dayDe = (window.fmtDayCode ? window.fmtDayCode(slot.day) : (slot.day || '—'));
    var schedLabel = dayDe + 's' + (slot.startTime ? ' · ' + slot.startTime.slice(0,5) : '') + (slot.endTime ? '–' + slot.endTime.slice(0,5) : '');
    document.getElementById('phKdSchedule').textContent = schedLabel;
    var statusEl = document.getElementById('phKdStatus');
    if (a.status === 'paused') { statusEl.textContent = 'Pausiert'; statusEl.className = 'pill pill-pending'; }
    else if (a.status === 'archived' || a.status === 'cancelled') { statusEl.textContent = 'Archiviert'; statusEl.className = 'pill'; }
    else { statusEl.textContent = 'Aktiv'; statusEl.className = 'pill pill-ok'; }

    // Meta row 2
    var pkgSize = price.packageSize;
    document.getElementById('phKdSessionsLabel').textContent = (pkgSize ? pkgSize + ' Termine' : 'Laufend') + (sched.startDate ? ' · ' + window.__kdSeason(sched.startDate) : '');
    var amount = price.amount != null ? price.amount : 0;
    document.getElementById('phKdPriceLabel').textContent = window.__kdFmtMoney(amount) + (price.type === 'package' ? ' pro Block' : (price.type === 'subscription' ? ' / Monat' : ''));
    document.getElementById('phKdLocation').textContent = roomLabel;

    // KPI Stats
    document.getElementById('phKdKpiBooked').innerHTML = booked + ' <em>/' + cap + '</em>';
    var weekAgo = Date.now() - 7*86400000;
    var bookedThisWeek = bookings.filter(function(b) { return new Date(b.createdAt || 0) >= weekAgo; }).length;
    document.getElementById('phKdKpiBookedDelta').textContent = bookedThisWeek > 0 ? '+' + bookedThisWeek + ' diese Woche' : 'Keine neuen';
    var rev = booked * (price.amount || 0);
    document.getElementById('phKdKpiRevenue').innerHTML = window.__kdFmtMoneyNum(rev) + ' <em>€</em>';
    var paid = bookings.filter(function(b) { return b.paymentStatus === 'paid'; }).length;
    document.getElementById('phKdKpiRevenueDelta').textContent = paid + ' von ' + booked + ' bezahlt';
    document.getElementById('phKdKpiWait').innerHTML = '0 <em>offen</em>';
    document.getElementById('phKdKpiWaitDelta').textContent = a.waitlistEnabled ? 'Warteliste aktiv' : 'Warteliste deaktiviert';

    // Sessions metrics
    var sessions = window.__kdSortSessions(window.__kdGetSessions(a.id));
    var now = new Date(); now.setHours(0,0,0,0);
    var sessTotal = pkgSize || sessions.length;
    var sessDone = sessions.filter(function(x) { return x.date < now && x.status !== 'cancelled'; }).length;
    document.getElementById('phKdKpiSessions').innerHTML = sessDone + ' <em>/' + sessTotal + '</em>';
    var nextSess = sessions.filter(function(x){ return x.date >= now && x.status !== 'cancelled'; })[0];
    if (nextSess) {
      var dayLabels = ['So','Mo','Di','Mi','Do','Fr','Sa'];
      document.getElementById('phKdKpiSessionsDelta').textContent = 'Nächste: ' + dayLabels[nextSess.date.getDay()] + ', ' + window.__kdFmtDateDE(nextSess.date.toISOString().slice(0,10));
    } else {
      document.getElementById('phKdKpiSessionsDelta').textContent = '—';
    }

    // Tab counts
    document.getElementById('phKdTabCntBloecke').textContent = sessions.length;
    document.getElementById('phKdTabCntTeilnehmer').textContent = booked;
    document.getElementById('phKdTabCntWarteliste').textContent = '0';

    // Description
    var descEl = document.getElementById('phKdDescription');
    if (a.description) {
      var paras = String(a.description).split(/\n\n+/).map(function(p) {
        return '<p>' + (window.escapeHtml ? window.escapeHtml(p) : p) + '</p>';
      }).join('');
      descEl.innerHTML = paras;
    } else {
      descEl.innerHTML = '<p style="color:var(--muted-2);font-style:italic">Noch keine Beschreibung. Klick "Bearbeiten" oben rechts.</p>';
    }

    // Sessions list (overview — first 5 with proper sort)
    document.getElementById('phKdAllSessionsCount').textContent = sessions.length;
    var sListEl = document.getElementById('phKdSessionsList');
    var topSessions = sessions.slice(0, 5);
    if (topSessions.length === 0) {
      sListEl.innerHTML = '<div style="padding:24px 0;color:var(--muted-2);text-align:center;font-size:13px">Keine Termine geplant.</div>';
    } else {
      var nextIdx = topSessions.findIndex(function(x){ return x.date >= now && x.status !== 'cancelled'; });
      sListEl.innerHTML = topSessions.map(function(item, i) {
        return window.__kdRenderTermin(item, a, roomLabel, dayDe, i === nextIdx);
      }).join('');
    }

    // Recent bookings
    var sortedB = bookings.slice().sort(function(x, y) {
      return new Date(y.createdAt || 0) - new Date(x.createdAt || 0);
    }).slice(0, 5);
    var tbody = document.getElementById('phKdBookingsTbody');
    if (sortedB.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;color:var(--muted-2);text-align:center">Noch keine Buchungen.</td></tr>';
    } else {
      tbody.innerHTML = sortedB.map(function(b) { return window.__kdRenderBookingRow(b); }).join('');
    }

    // Auslastung
    var pct = cap > 0 ? Math.round(booked / cap * 100) : 0;
    document.getElementById('phKdAuslVal').innerHTML = booked + ' <em>/ ' + cap + '</em>';
    document.getElementById('phKdAuslSub').textContent = pct + ' % · ' + Math.max(0, cap - booked) + ' Plätze frei';
    document.getElementById('phKdAuslBar').style.width = Math.min(100, pct) + '%';

    // Avatar strip
    var avatars = bookings.slice(0, 5).map(function(b, i) {
      var name = (b.customerName || (b.customer && b.customer.name) || (b.child && b.child.name) || '?');
      var ini = name.charAt(0).toUpperCase();
      var tones = ['', 'sage', 'taupe', '', 'sage'];
      return '<span class="avatar ' + tones[i] + '">' + ini + '</span>';
    }).join('');
    var moreCount = Math.max(0, booked - 5);
    document.getElementById('phKdAvatarStrip').innerHTML = avatars + (moreCount > 0 ? '<span class="more">+ ' + moreCount + ' weitere</span>' : '');

    // Info list
    document.getElementById('phKdInfoTrainer').textContent = trainerName;
    document.getElementById('phKdInfoRoom').textContent = roomLabel;
    document.getElementById('phKdInfoMax').textContent = (a.capacity || '—') + (a.capacity ? ' Plätze' : '');
    var dur = '—';
    if (slot.startTime && slot.endTime) {
      var sm = parseInt(slot.startTime.slice(0,2),10)*60 + parseInt(slot.startTime.slice(3,5),10);
      var em = parseInt(slot.endTime.slice(0,2),10)*60 + parseInt(slot.endTime.slice(3,5),10);
      dur = (em - sm) + ' Minuten';
    }
    document.getElementById('phKdInfoDuration').textContent = dur;
    document.getElementById('phKdInfoStart').textContent = sched.startDate ? window.__kdFmtDateDE(sched.startDate) : '—';
    document.getElementById('phKdInfoEnd').textContent = sched.endDate ? window.__kdFmtDateDE(sched.endDate) : 'offen';
    document.getElementById('phKdInfoPrice').textContent = window.__kdFmtMoney(amount) + (price.type === 'package' ? ' / Block' : '');

    // Pause label
    document.getElementById('phKdPauseLabel').textContent = a.status === 'paused' ? 'Kurs aktivieren' : 'Kurs pausieren';

    // If a non-overview tab was active, re-render it (so counts/data refresh)
    if (window.__kdActiveTab !== 'overview') window.__kdRenderTab(window.__kdActiveTab);
  };

  // ---------- Termin-row template ----------
  window.__kdRenderTermin = function(item, activity, roomLabel, dayDeLong, isNext) {
    var monthsShort = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    var dayShort = ['Mo','Di','Mi','Do','Fr','Sa','So'];
    var d = item.date;
    var now = new Date(); now.setHours(0,0,0,0);
    var isPast = d < now;
    var isCancelled = item.status === 'cancelled';
    var dayIdx = (d.getDay() + 6) % 7;

    var st = (item.startTime || '').slice(0,5);
    var et = (item.endTime || '').slice(0,5);
    var timeLabel = st + (et ? '–' + et : '');

    var rightLabel = '';
    if (isCancelled) {
      rightLabel = '<span class="termin-badge" style="background:var(--signal-tint);color:var(--signal)">Abgesagt</span>';
    } else if (isPast) {
      // Attendance count if available; else "X Plätze"
      var attLabel = (item.attendanceCount != null) ? item.attendanceCount + ' anwesend' : '';
      rightLabel = '<span class="termin-badge done">Erledigt</span>';
      if (attLabel) rightLabel = '<span style="font-size:12px;color:var(--muted-2);margin-right:8px">' + attLabel + '</span>' + rightLabel;
    } else if (isNext) {
      rightLabel = '<span class="termin-badge next">Nächster</span>';
    }

    var booked = (window.dashboardState.bookings || []).filter(function(b) {
      return b && b.activityId === activity.id && b.status !== 'cancelled' && b.status !== 'refunded';
    }).length;
    var cap = activity.capacity || 0;
    var capLabel = isPast ? '' : ' · ' + booked + '/' + cap + ' Plätze';

    return '<div class="termin-item' + ((isPast || isCancelled) ? ' is-done' : '') + '">'
      + '<div class="termin-date"><div class="termin-date-day">' + d.getDate() + '</div><div class="termin-date-month">' + monthsShort[d.getMonth()] + '</div></div>'
      + '<div class="termin-main"><div class="termin-title">Stunde ' + (item.num || '?') + '</div>'
      + '<div class="termin-sub">' + dayShort[dayIdx] + ', ' + timeLabel + ' · ' + roomLabel + capLabel + '</div></div>'
      + rightLabel + '</div>';
  };

  // ---------- Booking-row template ----------
  window.__kdRenderBookingRow = function(b) {
    var name = b.customerName || (b.customer && b.customer.name) || '—';
    var childName = (b.child && b.child.name) || (b.child && (b.child.firstName + ' ' + (b.child.lastName || '')).trim()) || '—';
    var childAge = (b.child && b.child.age) || '';
    var childLabel = childName + (childAge ? ' (' + childAge + ' J.)' : '');
    var when = window.__kdRelTime(b.createdAt);
    var amt = (b.amountPaid != null ? window.__kdFmtMoney(b.amountPaid) : '—');
    var status = b.paymentStatus || 'unpaid';
    var pillCls = 'pill-pending', pillTxt = 'OFFEN';
    if (status === 'paid') { pillCls = 'pill-ok'; pillTxt = 'BEZAHLT'; }
    else if (status === 'refunded') { pillCls = ''; pillTxt = 'STORNIERT'; }
    else if (status === 'partial') { pillCls = 'pill-pending'; pillTxt = 'TEILZAHLUNG'; }
    var pm = (b.paymentMethod === 'stripe') ? '' : ' <span style="font-size:9px;color:var(--muted-2);margin-left:4px">vor Ort</span>';
    return '<tr>'
      + '<td>' + (window.escapeHtml ? window.escapeHtml(name) : name) + '</td>'
      + '<td>' + (window.escapeHtml ? window.escapeHtml(childLabel) : childLabel) + '</td>'
      + '<td>' + when + '</td>'
      + '<td>' + amt + '</td>'
      + '<td><span class="pill ' + pillCls + '">' + pillTxt + '</span>' + pm + '</td>'
      + '</tr>';
  };

  // ---------- Quick-action wrappers ----------
  window.__kdShare = function() {
    var a = (window.dashboardState.activities || []).find(function(x){ return x.id === window.__kdActiveId; });
    if (!a) return;
    var url = location.origin + '/v3#kursdetail-' + a.id;
    if (navigator.share) navigator.share({ title: a.title, url: url }).catch(function(){});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function() {
      if (window.ukcToast) window.ukcToast('Link kopiert');
    });
    else alert(url);
  };
  window.__kdEdit = function() {
    if (typeof window.editCourseQuick === 'function') window.editCourseQuick(window.__kdActiveId);
  };
  window.__kdAddParticipant = function() {
    alert('Teilnehmer hinzufügen — folgt im nächsten Sprint (verknüpft mit Kurs-Einladungen-Flow).');
  };
  window.__kdAddSession = function() {
    alert('Zusatz-Termin — folgt im nächsten Sprint.');
  };
  window.__kdMessageAll = function() {
    alert('Nachricht an alle — folgt im nächsten Sprint (verknüpft mit Postfach-System).');
  };
  window.__kdTogglePause = function() {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === window.__kdActiveId; });
    if (!a) return;
    var newStatus = a.status === 'paused' ? 'active' : 'paused';
    var label = newStatus === 'paused' ? 'Pausieren' : 'Aktivieren';
    var msg = newStatus === 'paused'
      ? 'Den Kurs „' + a.title + '" wirklich pausieren? Er wird im Widget verborgen.'
      : 'Den Kurs „' + a.title + '" wieder aktivieren?';
    var go = function() {
      a.status = newStatus;
      window.__kdRender();
      fetch('/api/activities/' + a.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.token || '') },
        body: JSON.stringify({ status: newStatus }),
      }).then(function(r) {
        if (!r.ok) throw new Error('Server-Fehler');
        if (window.ukcToast) window.ukcToast('Kurs ' + (newStatus === 'paused' ? 'pausiert' : 'aktiviert'));
      }).catch(function() {
        a.status = newStatus === 'paused' ? 'active' : 'paused';
        window.__kdRender();
        alert('Konnte Status nicht ändern.');
      });
    };
    if (typeof window.ukcConfirm === 'function') {
      window.ukcConfirm({ title: label + '?', body: msg, confirmLabel: label }).then(function(ok) { if (ok) go(); });
    } else {
      if (confirm(msg)) go();
    }
  };

  // ---------- Tab content renderers ----------
  window.__kdRenderTab = function(key) {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === window.__kdActiveId; });
    if (!a) return;
    var pane = document.querySelector('[data-kdpane="' + key + '"] > div');
    if (!pane) return;

    var bookings = (s.bookings || []).filter(function(b) {
      return b && b.activityId === a.id && b.status !== 'cancelled' && b.status !== 'refunded';
    });
    var roomLabel = (window.__kalRoomName ? window.__kalRoomName(a.roomId) : null) || a.roomName || (a.roomId ? '—' : 'Kein Raum');
    var slot = ((a.schedule || {}).slots || [])[0] || {};
    var dayDe = (window.fmtDayCode ? window.fmtDayCode(slot.day) : (slot.day || '—'));

    if (key === 'bloecke') {
      var sessions = window.__kdSortSessions(window.__kdGetSessions(a.id));
      if (sessions.length === 0) {
        pane.innerHTML = '<div class="card"><div class="card-head"><div class="card-title">Alle <em>Termine</em></div></div>'
          + '<div class="empty-state"><div class="empty-state-title">Keine Termine</div><div>Der Kurs hat noch keine geplanten Termine. Bearbeite Start- und Enddatum oder das Termine-Paket.</div></div></div>';
        return;
      }
      var rows = sessions.map(function(item) {
        var now = new Date(); now.setHours(0,0,0,0);
        var isNext = item.date >= now && item.status !== 'cancelled';
        // mark only the very first upcoming as next
        return window.__kdRenderTermin(item, a, roomLabel, dayDe, false);
      });
      // Tag the first future as Nächster
      var firstFuture = sessions.findIndex(function(x){ return x.date >= new Date() && x.status !== 'cancelled'; });
      if (firstFuture >= 0) rows[firstFuture] = window.__kdRenderTermin(sessions[firstFuture], a, roomLabel, dayDe, true);
      pane.innerHTML = '<div class="card"><div class="card-head"><div class="card-title">Alle <em>Termine</em> · ' + sessions.length + '</div>'
        + '<a class="card-link" onclick="window.__kdEdit()">Block bearbeiten →</a></div>'
        + '<div>' + rows.join('') + '</div></div>';
      return;
    }

    if (key === 'teilnehmer') {
      if (bookings.length === 0) {
        pane.innerHTML = '<div class="card"><div class="card-head"><div class="card-title">Alle <em>Teilnehmer</em></div></div>'
          + '<div class="empty-state"><div class="empty-state-title">Noch keine Teilnehmer</div><div>Sobald die ersten Eltern buchen, erscheinen sie hier mit Kontakt und Zahlungsstatus.</div></div></div>';
        return;
      }
      var sortedB = bookings.slice().sort(function(x, y) {
        return new Date(y.createdAt || 0) - new Date(x.createdAt || 0);
      });
      var rows = sortedB.map(function(b) { return window.__kdRenderBookingRow(b); }).join('');
      pane.innerHTML = '<div class="card"><div class="card-head"><div class="card-title">Alle <em>Teilnehmer</em> · ' + bookings.length + '/' + (a.capacity || '?') + '</div>'
        + '<button class="btn btn-ghost btn-sm" onclick="window.__kdAddParticipant()">+ Teilnehmer hinzufügen</button></div>'
        + '<table class="data-table"><thead><tr><th>Kunde</th><th>Kind</th><th>Datum</th><th>Betrag</th><th>Zahlung</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
      return;
    }

    if (key === 'warteliste') {
      pane.innerHTML = '<div class="card"><div class="card-head"><div class="card-title">Die <em>Warteliste</em></div></div>'
        + '<div class="empty-state"><div class="empty-state-title">Warteliste leer</div>'
        + '<div>Wenn der Kurs voll ist und Eltern sich melden, erscheinen sie hier. '
        + 'Du kannst per Klick auf <strong>Anbieten</strong> einen frei werdenden Platz weiterreichen.</div></div></div>';
      return;
    }

    if (key === 'finanzen') {
      var price = (a.pricing && a.pricing[0]) || {};
      var amount = price.amount || 0;
      var booked = bookings.length;
      var paid = bookings.filter(function(b){ return b.paymentStatus === 'paid'; });
      var open = bookings.filter(function(b){ return b.paymentStatus === 'unpaid' || b.paymentStatus === 'pending'; });
      var refunded = (s.bookings || []).filter(function(b){ return b.activityId === a.id && b.paymentStatus === 'refunded'; });
      var sumPaid = paid.reduce(function(acc, b){ return acc + (b.amountPaid || 0); }, 0);
      var sumOpen = open.length * amount;
      var sumRef = refunded.reduce(function(acc, b){ return acc + (b.amountPaid || 0); }, 0);
      var sumPlanned = booked * amount;

      pane.innerHTML = '<div class="card" style="margin-bottom:18px;">'
        + '<div class="card-head"><div class="card-title">Kurs<em>-Finanzen</em></div></div>'
        + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:6px 0">'
        + '<div><div class="info-label">Geplant</div><div class="info-value" style="text-align:left;font-size:18px;font-family:var(--font-heading);font-weight:700">' + window.__kdFmtMoney(sumPlanned) + '</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">' + booked + ' × ' + window.__kdFmtMoney(amount) + '</div></div>'
        + '<div><div class="info-label">Bezahlt</div><div class="info-value" style="text-align:left;font-size:18px;font-family:var(--font-heading);font-weight:700;color:var(--sage-deep)">' + window.__kdFmtMoney(sumPaid) + '</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">' + paid.length + ' Buchungen</div></div>'
        + '<div><div class="info-label">Offen</div><div class="info-value" style="text-align:left;font-size:18px;font-family:var(--font-heading);font-weight:700;color:var(--signal)">' + window.__kdFmtMoney(sumOpen) + '</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">' + open.length + ' Buchungen</div></div>'
        + '<div><div class="info-label">Storno/Refund</div><div class="info-value" style="text-align:left;font-size:18px;font-family:var(--font-heading);font-weight:700;color:var(--muted-2)">' + window.__kdFmtMoney(sumRef) + '</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">' + refunded.length + ' Buchungen</div></div>'
        + '</div></div>'
        + '<div class="card"><div class="card-head"><div class="card-title">Buchungen mit <em>Zahlungsstatus</em></div>'
        + '<a class="card-link" onclick="window.showSection(\'rechnungen\')">Zu Rechnungen →</a></div>'
        + '<table class="data-table"><thead><tr><th>Kunde</th><th>Kind</th><th>Gebucht</th><th>Betrag</th><th>Status</th></tr></thead>'
        + '<tbody>' + bookings.map(function(b){ return window.__kdRenderBookingRow(b); }).join('') + '</tbody></table></div>';
      return;
    }

    if (key === 'settings') {
      pane.innerHTML = '<div class="card"><div class="card-head"><div class="card-title">Kurs<em>-Einstellungen</em></div></div>'
        + '<div style="padding:24px 4px;display:flex;flex-direction:column;gap:16px;max-width:560px">'
        + '<div><div class="info-label">Bearbeiten</div><div style="font-size:13px;color:var(--ink-2);margin:6px 0 10px">Titel, Beschreibung, Termine, Preis, Raum, Kapazität — alles im Kurs-Creator.</div>'
        + '<button class="btn btn-primary btn-sm" onclick="window.__kdEdit()">Kurs bearbeiten →</button></div>'
        + '<div><div class="info-label">Pause</div><div style="font-size:13px;color:var(--ink-2);margin:6px 0 10px">Verbirgt den Kurs im Eltern-Widget. Bestehende Buchungen bleiben aktiv.</div>'
        + '<button class="btn btn-ghost btn-sm" onclick="window.__kdTogglePause()">' + (a.status === 'paused' ? 'Wieder aktivieren' : 'Kurs pausieren') + '</button></div>'
        + '<div><div class="info-label" style="color:var(--signal)">Gefahrenzone</div><div style="font-size:13px;color:var(--ink-2);margin:6px 0 10px">Archiviert den Kurs unwiderruflich. Bestehende Buchungen bleiben sichtbar.</div>'
        + '<button class="btn btn-ghost btn-sm" style="color:var(--signal);border-color:var(--signal)" onclick="window.__kdArchive()">Kurs archivieren</button></div>'
        + '</div></div>';
      return;
    }
  };

  window.__kdArchive = function() {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === window.__kdActiveId; });
    if (!a) return;
    var go = function() {
      fetch('/api/activities/' + a.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.token || '') },
        body: JSON.stringify({ status: 'archived' }),
      }).then(function(r) {
        if (!r.ok) throw new Error('Server-Fehler');
        a.status = 'archived';
        window.showSection('kurse');
        if (window.ukcToast) window.ukcToast('Kurs archiviert');
      }).catch(function(e) { alert('Konnte nicht archivieren: ' + (e.message || e)); });
    };
    if (typeof window.ukcConfirm === 'function') {
      window.ukcConfirm({ title: 'Kurs archivieren?', body: '„' + a.title + '" wird archiviert. Bestehende Buchungen bleiben.', confirmLabel: 'Archivieren', destructive: true }).then(function(ok) { if (ok) go(); });
    } else {
      if (confirm('Kurs „' + a.title + '" archivieren?')) go();
    }
  };'''

old_pat = re.compile(
    r"window\.viewCourseDetail = function\(id\) \{[\s\S]*?\n  \};\s*\n  // wire tabs once[\s\S]*?\n  window\.__kdRenderTab = function\(key\) \{[\s\S]*?\n  \};",
    re.MULTILINE
)

# fall-back simpler match — find from viewCourseDetail to end of __kdRenderTab
m = re.search(
    r"window\.viewCourseDetail = function\(id\) \{[\s\S]*?^  window\.__kdRenderTab = function\(key\) \{[\s\S]*?\n  \};",
    src,
    re.MULTILINE
)
if not m:
    print('FAIL: kurs-detail block not found'); exit(1)
src = src[:m.start()] + new_block + src[m.end():]
print('OK: viewCourseDetail block fully replaced')

open(fp, 'w', encoding='utf-8').write(src)
print('All patches applied.')
