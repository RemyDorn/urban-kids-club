"""Replace alert()-based detail views with branded modal overlays.

- Adds CSS for .ukc-detail-overlay, .ukc-detail-card, .ukc-detail-row
- Adds window.ukcShowDetailModal({title, kicker, rows, footerHtml}) helper
- Rewrites window.viewCourseDetail / window.viewBookingDetail to use it
- Wires Kursblock 'Details' button to a block-detail modal
"""

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(p, 'r', encoding='utf-8').read()

# --------------------------------------------------------------
# 1. Insert CSS right before </style> closing of the main <style> block.
# --------------------------------------------------------------
css = """

/* === UKC Detail Modal (Course/Booking/Block) === */
.ukc-detail-overlay { position: fixed; inset: 0; background: rgba(60,33,36,.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9000; padding: 20px; opacity: 0; transition: opacity .18s ease; }
.ukc-detail-overlay.in { opacity: 1; }
.ukc-detail-card { background: var(--cream-50, #FAF4EE); color: var(--ink); border-radius: 18px; box-shadow: 0 24px 48px rgba(60,33,36,.18); width: min(560px, 100%); max-height: 90vh; overflow: auto; transform: translateY(8px); transition: transform .2s ease; }
.ukc-detail-overlay.in .ukc-detail-card { transform: translateY(0); }
.ukc-detail-head { padding: 22px 26px 14px; border-bottom: 1px solid rgba(60,33,36,.08); position: relative; }
.ukc-detail-kicker { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--apricot-deep, #B8704F); margin-bottom: 8px; }
.ukc-detail-title { font-family: 'Lora', Georgia, serif; font-size: 22px; font-weight: 600; line-height: 1.2; margin: 0; color: var(--ink); }
.ukc-detail-title em { font-style: italic; color: var(--apricot-deep, #B8704F); font-weight: 400; }
.ukc-detail-close { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border: 0; background: transparent; cursor: pointer; font-size: 22px; color: var(--ink-2); border-radius: 50%; transition: background .14s; }
.ukc-detail-close:hover { background: rgba(60,33,36,.06); }
.ukc-detail-body { padding: 18px 26px; }
.ukc-detail-row { display: flex; justify-content: space-between; gap: 14px; padding: 10px 0; border-bottom: 1px dashed rgba(60,33,36,.08); font-size: 14px; }
.ukc-detail-row:last-child { border-bottom: 0; }
.ukc-detail-row-label { color: var(--muted); font-size: 12px; letter-spacing: .04em; text-transform: uppercase; flex: 0 0 auto; min-width: 130px; }
.ukc-detail-row-val { color: var(--ink); text-align: right; font-weight: 500; word-break: break-word; }
.ukc-detail-row-val .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
.ukc-detail-foot { padding: 14px 26px 22px; border-top: 1px solid rgba(60,33,36,.08); display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
.ukc-detail-foot .btn { white-space: nowrap; }
@media (max-width: 540px) {
  .ukc-detail-row { flex-direction: column; gap: 2px; }
  .ukc-detail-row-val { text-align: left; }
}
"""

style_close = "</style>"
# inject at the FIRST </style> we find (the main stylesheet is the first one)
idx = src.index(style_close)
src = src[:idx] + css + "\n" + src[idx:]

# --------------------------------------------------------------
# 2. Inject ukcShowDetailModal helper + rewrite viewCourseDetail / viewBookingDetail
#    Find existing viewCourseDetail definition and replace.
# --------------------------------------------------------------
old_view_course = """  window.viewCourseDetail = function(id) {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === id; });
    if (!a) { alert('Kurs nicht gefunden'); return; }
    var sched = a.schedule || {};
    var slot = (sched.slots || [])[0] || {};
    var price = (a.pricing && a.pricing[0]) || {};
    var lines = [
      'KURS: ' + (a.title || '—'),
      'Kategorie: ' + (a.category || '—'),
      'Status: ' + (a.status || 'in_planning'),
      'Alter: ' + ((a.ageRange && a.ageRange.min) || 0) + ' - ' + ((a.ageRange && a.ageRange.max) || '?') + ' J.',
      'Kapazitaet: ' + (a.capacity || '?'),
      'Zeitplan: ' + (slot.day || '?') + ' ' + (slot.startTime || '') + '-' + (slot.endTime || ''),
      'Zeitraum: ' + (sched.startDate || '?') + ' bis ' + (sched.endDate || 'offen'),
      'Preis: ' + (price.amount || 0) + ' EUR (' + (price.type || '?') + (price.packageSize ? ', ' + price.packageSize + ' Termine' : '') + ')',
      '',
      'Online-Zahlung: ' + (a.paymentOnline ? 'ja' : 'nein'),
      'Vor-Ort-Zahlung: ' + (a.paymentOnsite !== false ? 'ja' : 'nein'),
    ];
    alert(lines.join('\\n'));
  };"""

new_view_course = """  // ---- Detail-Modal (gebrandet) ---------------------------------
  window.ukcShowDetailModal = function(opts) {
    opts = opts || {};
    var prev = document.querySelector('.ukc-detail-overlay'); if (prev) prev.remove();
    var rowsHtml = (opts.rows || []).map(function(r) {
      if (r === '---') return '<div style="height:6px"></div>';
      var val = r.val == null || r.val === '' ? '—' : r.val;
      return '<div class="ukc-detail-row"><span class="ukc-detail-row-label">' + escapeHtml(r.label) + '</span><span class="ukc-detail-row-val">' + (r.html ? r.html : escapeHtml(String(val))) + '</span></div>';
    }).join('');
    var footHtml = opts.footerHtml || '<button class="btn btn-ghost btn-sm" onclick="this.closest(\\'.ukc-detail-overlay\\').remove()">Schliessen</button>';
    var ov = document.createElement('div');
    ov.className = 'ukc-detail-overlay';
    ov.innerHTML = '<div class="ukc-detail-card" role="dialog" aria-modal="true">'
      + '<div class="ukc-detail-head">'
        + (opts.kicker ? '<div class="ukc-detail-kicker">' + escapeHtml(opts.kicker) + '</div>' : '')
        + '<h2 class="ukc-detail-title">' + (opts.titleHtml || escapeHtml(opts.title || 'Detail')) + '</h2>'
        + '<button class="ukc-detail-close" aria-label="Schliessen" onclick="this.closest(\\'.ukc-detail-overlay\\').remove()">×</button>'
      + '</div>'
      + '<div class="ukc-detail-body">' + rowsHtml + '</div>'
      + '<div class="ukc-detail-foot">' + footHtml + '</div>'
      + '</div>';
    ov.addEventListener('click', function(e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    requestAnimationFrame(function() { ov.classList.add('in'); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', esc); } });
  };

  function statusPillHtml(s) {
    var label = ({active:'Aktiv', paused:'Pausiert', archived:'Archiviert', in_planning:'In Planung', draft:'Entwurf', cancelled:'Storniert', completed:'Abgeschlossen', confirmed:'Bestaetigt', pending:'Offen'})[s] || (s || '—');
    var cls = ({active:'pill-ok', confirmed:'pill-ok', completed:'pill-ok', paused:'pill-pending', in_planning:'pill-pending', pending:'pill-pending', cancelled:'pill-err', archived:'pill-err'})[s] || 'pill-pending';
    return '<span class="pill ' + cls + '">' + label + '</span>';
  }
  function fmtDayCode(c) { return ({MO:'Montag',TU:'Dienstag',WE:'Mittwoch',TH:'Donnerstag',FR:'Freitag',SA:'Samstag',SU:'Sonntag'})[c] || c || '—'; }

  window.viewCourseDetail = function(id) {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === id; });
    if (!a) { alert('Kurs nicht gefunden'); return; }
    var sched = a.schedule || {};
    var slot = (sched.slots || [])[0] || {};
    var price = (a.pricing && a.pricing[0]) || {};
    var ageMin = (a.ageRange && a.ageRange.min != null) ? a.ageRange.min : '?';
    var ageMax = (a.ageRange && a.ageRange.max != null) ? a.ageRange.max : '?';
    var pricingTxt = (price.amount != null ? price.amount + ' EUR' : '—') + (price.type ? ' · ' + price.type : '') + (price.packageSize ? ' · ' + price.packageSize + ' Termine' : '');
    var pay = [];
    if (a.paymentOnline) pay.push('Online');
    if (a.paymentOnsite !== false) pay.push('Vor Ort');
    window.ukcShowDetailModal({
      kicker: 'Kurs · ' + (a.category || 'sonstige'),
      titleHtml: escapeHtml(a.title || 'Kurs') + ' <em>Detail</em>',
      rows: [
        { label: 'Status', html: statusPillHtml(a.status || 'in_planning') },
        { label: 'Alter', val: ageMin + '–' + ageMax + ' J.' },
        { label: 'Kapazitaet', val: a.capacity || '?' },
        { label: 'Tag', val: fmtDayCode(slot.day) },
        { label: 'Uhrzeit', val: (slot.startTime || '?') + (slot.endTime ? '–' + slot.endTime : '') },
        { label: 'Zeitraum', val: (sched.startDate || '?') + (sched.endDate ? ' bis ' + sched.endDate : '') },
        { label: 'Preis', val: pricingTxt },
        { label: 'Zahlung', val: pay.length ? pay.join(' + ') : 'keine' },
      ],
      footerHtml: '<button class="btn btn-ghost btn-sm" onclick="this.closest(\\'.ukc-detail-overlay\\').remove()">Schliessen</button>'
        + ' <button class="btn btn-primary btn-sm" onclick="this.closest(\\'.ukc-detail-overlay\\').remove();window.editCourseQuick(\\'' + a.id + '\\')">Bearbeiten</button>',
    });
  };"""

if old_view_course not in src:
    print('FAIL: viewCourseDetail anchor not found'); exit(1)
src = src.replace(old_view_course, new_view_course, 1)

# --------------------------------------------------------------
# 3. Rewrite viewBookingDetail
# --------------------------------------------------------------
old_view_booking = """  window.viewBookingDetail = function(id) {
    var s = window.dashboardState; if (!s) return;
    var b = (s.bookings || []).find(function(x){ return x.id === id; });
    if (!b) { alert('Buchung nicht gefunden'); return; }
    var c = b.customer || {};
    var ch = b.child || {};
    var lines = [
      'BUCHUNG: ' + (b.id || '').slice(0,8),
      'Kunde: ' + (c.name || b.customerName || 'Unbekannt') + (c.email ? ' <' + c.email + '>' : ''),
      'Kind: ' + (ch.firstName || ch.name || '?') + ' ' + (ch.lastName || '') + (ch.birthYear ? ' ('+(new Date().getFullYear() - ch.birthYear)+' J.)' : ''),
      'Kurs: ' + (b.activityTitle || b.activityName || '—'),
      'Status: ' + (b.status || 'pending'),
      'Zahlung: ' + (b.paymentStatus || 'unpaid') + ' / ' + (b.paymentMethod || '?'),
      'Betrag: ' + (b.amountPaid != null ? b.amountPaid : 0) + ' ' + (b.currency || 'EUR'),
      'Erstellt: ' + new Date(b.createdAt || 0).toLocaleString('de-DE'),
    ];
    alert(lines.join('\\n'));
  };"""

new_view_booking = """  window.viewBookingDetail = function(id) {
    var s = window.dashboardState; if (!s) return;
    var b = (s.bookings || []).find(function(x){ return x.id === id; });
    if (!b) { alert('Buchung nicht gefunden'); return; }
    var c = b.customer || {};
    var ch = b.child || {};
    var ageStr = ch.birthYear ? (new Date().getFullYear() - ch.birthYear) + ' J.' : '';
    var childName = ((ch.firstName || ch.name || '') + ' ' + (ch.lastName || '')).trim() || '—';
    var paymentTxt = (({stripe:'Stripe', paypal:'PayPal', onsite:'Vor Ort', invoice:'Rechnung'})[b.paymentMethod] || b.paymentMethod || '?');
    var amount = (b.amountPaid != null ? b.amountPaid : 0).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' ' + (b.currency || 'EUR');
    window.ukcShowDetailModal({
      kicker: 'Buchung · ' + (b.id || '').slice(0,8),
      titleHtml: escapeHtml(c.name || b.customerName || 'Unbekannt') + ' <em>Detail</em>',
      rows: [
        { label: 'Kind', val: childName + (ageStr ? ' (' + ageStr + ')' : '') },
        { label: 'Email', val: c.email || b.customerEmail || '—' },
        { label: 'Kurs', val: b.activityTitle || b.activityName || '—' },
        { label: 'Status', html: statusPillHtml(b.status || 'pending') },
        { label: 'Zahlung', val: paymentTxt + ' · ' + (b.paymentStatus || 'unpaid') },
        { label: 'Betrag', val: amount },
        { label: 'Erstellt', val: new Date(b.createdAt || 0).toLocaleString('de-DE') },
      ],
      footerHtml: '<button class="btn btn-ghost btn-sm" onclick="this.closest(\\'.ukc-detail-overlay\\').remove()">Schliessen</button>'
        + ' <button class="btn btn-primary btn-sm" onclick="this.closest(\\'.ukc-detail-overlay\\').remove();window.handleBookingAction(\\'' + b.id + '\\')">Aktionen</button>',
    });
  };

  // Block-Detail (Kursbloecke)
  window.viewBlockDetail = function(blockId) {
    var s = window.dashboardState; if (!s) return;
    s.api('/course-blocks/' + blockId).then(function(r) {
      var b = r.data || r;
      if (!b || !b.id) { alert('Block nicht gefunden'); return; }
      var dayLabel = fmtDayCode((b.recurringDay || b.recurring_day || '').toUpperCase());
      var time = (b.recurringTime || b.recurring_time || '').slice(0,5);
      window.ukcShowDetailModal({
        kicker: 'Kursblock',
        titleHtml: escapeHtml(b.activityName || b.activityTitle || 'Block') + ' <em>' + escapeHtml(b.seasonLabel || b.season_label || 'Block 1') + '</em>',
        rows: [
          { label: 'Status', html: statusPillHtml(b.status || 'active') },
          { label: 'Start', val: b.startDate || b.start_date || '—' },
          { label: 'Ende', val: b.endDate || b.end_date || '—' },
          { label: 'Termine', val: (b.totalSessions || b.total_sessions || '?') + ' Wochen · ' + (b.durationMinutes || b.duration_minutes || 60) + ' Min' },
          { label: 'Tag/Zeit', val: dayLabel + (time ? ' · ' + time : '') },
          { label: 'Kapazitaet', val: (b.capacity || '?') + (b.makeupCapacity || b.makeup_capacity ? ' (+' + (b.makeupCapacity || b.makeup_capacity) + ' Add-Up)' : '') },
          { label: 'Preis', val: (b.pricePerBlock || b.price_per_block || 0) + ' ' + (b.currency || 'EUR') },
        ],
      });
    }).catch(function(e) { alert('Block-Detail laden fehlgeschlagen: ' + (e.message || e)); });
  };"""

if old_view_booking not in src:
    print('FAIL: viewBookingDetail anchor not found'); exit(1)
src = src.replace(old_view_booking, new_view_booking, 1)

# --------------------------------------------------------------
# 4. Wire Kursbloecke "Details" button to viewBlockDetail
# --------------------------------------------------------------
old_block_btn = "<button class=\"btn btn-ghost btn-sm\" onclick=\"alert(\\'Block-Detail folgt\\')\">Details</button>"
new_block_btn = "<button class=\"btn btn-ghost btn-sm\" onclick=\"window.viewBlockDetail(\\'' + b.id + '\\')\">Details</button>"
if old_block_btn not in src:
    print('FAIL: block details button not found'); exit(1)
src = src.replace(old_block_btn, new_block_btn, 1)

open(p, 'w', encoding='utf-8').write(src)
print('OK: branded detail modals + block detail wired')
