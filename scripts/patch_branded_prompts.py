"""Three fixes:
1. Edit-Mode in openKursCreatorV2 wrapper: also call populateLists so the
   Room + Trainer selects get filled (was skipped due to early return).
2. Add branded modals: window.ukcConfirm({title, message, okLabel, cancelLabel,
   variant}) and window.ukcChoose({title, message, options:[{value,label,desc}]})
   that return Promises. Both use the existing .ukc-detail-overlay styling.
3. Replace browser confirm/prompt calls in handleCourseAction +
   handleBookingAction with the branded helpers.
"""

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(p, 'r', encoding='utf-8').read()

# --------------------------------------------------------------
# 1. Edit-Mode populateLists fix
# --------------------------------------------------------------
old_edit_branch = """      // Edit-Mode: skip POST wrapper, the userOnSubmit (PUT) handles persistence directly.
      if (opts.mode === 'edit' && typeof userOnSubmit === 'function') {
        var origOpts = opts;
        opts.onSubmit = function(data) { userOnSubmit(data); };
        return origOpen.call(this, opts);
      }"""

new_edit_branch = """      // Edit-Mode: skip POST wrapper, the userOnSubmit (PUT) handles persistence directly.
      if (opts.mode === 'edit' && typeof userOnSubmit === 'function') {
        opts.onSubmit = function(data) { userOnSubmit(data); };
        var resultEdit = origOpen.call(this, opts);
        setTimeout(function() {
          var overlay = document.querySelector('.ukc-kurs-overlay');
          if (overlay) populateLists(overlay);
        }, 50);
        return resultEdit;
      }"""

if old_edit_branch not in src:
    print('FAIL: edit-mode branch anchor not found'); exit(1)
src = src.replace(old_edit_branch, new_edit_branch, 1)
print('OK: edit-mode now populates Room/Trainer lists')

# --------------------------------------------------------------
# 2. Append CSS for choose-list options + variants
# --------------------------------------------------------------
css_extra = """

/* === Branded confirm/choose overlay extras === */
.ukc-detail-card.danger .ukc-detail-title em { color: var(--danger, #B4523A); }
.ukc-detail-msg { padding: 4px 26px 18px; color: var(--ink-2); font-size: 14px; line-height: 1.55; }
.ukc-choose-list { display: flex; flex-direction: column; gap: 8px; padding: 0 26px 18px; }
.ukc-choose-opt { text-align: left; padding: 12px 14px; border-radius: 12px; border: 1.5px solid rgba(60,33,36,.12); background: var(--cream-50, #FAF4EE); cursor: pointer; transition: all .14s ease; font: inherit; color: var(--ink); display: flex; flex-direction: column; gap: 2px; }
.ukc-choose-opt:hover { border-color: var(--apricot-deep, #B8704F); background: var(--apricot-tint, #FDE4D3); }
.ukc-choose-opt.danger:hover { border-color: var(--danger, #B4523A); background: rgba(180,82,58,.08); color: var(--danger, #B4523A); }
.ukc-choose-opt-title { font-weight: 600; font-size: 14px; }
.ukc-choose-opt-desc { font-size: 12px; color: var(--muted-2); line-height: 1.4; }
.ukc-detail-foot .btn-danger { background: var(--danger, #B4523A); color: #fff; border: 0; }
.ukc-detail-foot .btn-danger:hover { background: #963F2D; }
"""
style_close = "</style>"
idx = src.index(style_close)
src = src[:idx] + css_extra + "\n" + src[idx:]

# --------------------------------------------------------------
# 3. Inject ukcConfirm + ukcChoose helpers right after ukcShowDetailModal
# --------------------------------------------------------------
helpers = """
  // ---- Promise-based confirm (gebrandet) ------------------------
  window.ukcConfirm = function(opts) {
    return new Promise(function(resolve) {
      opts = opts || {};
      var prev = document.querySelector('.ukc-detail-overlay'); if (prev) prev.remove();
      var ov = document.createElement('div');
      ov.className = 'ukc-detail-overlay';
      ov.innerHTML = '<div class="ukc-detail-card' + (opts.variant === 'danger' ? ' danger' : '') + '" role="dialog" aria-modal="true">'
        + '<div class="ukc-detail-head">'
          + (opts.kicker ? '<div class="ukc-detail-kicker">' + escapeHtml(opts.kicker) + '</div>' : '')
          + '<h2 class="ukc-detail-title">' + (opts.titleHtml || escapeHtml(opts.title || 'Bestaetigen')) + '</h2>'
          + '<button class="ukc-detail-close" aria-label="Schliessen">×</button>'
        + '</div>'
        + (opts.message ? '<div class="ukc-detail-msg">' + escapeHtml(opts.message) + '</div>' : '')
        + '<div class="ukc-detail-foot">'
          + '<button class="btn btn-ghost btn-sm" data-cancel>' + escapeHtml(opts.cancelLabel || 'Abbrechen') + '</button>'
          + '<button class="btn ' + (opts.variant === 'danger' ? 'btn-danger' : 'btn-primary') + ' btn-sm" data-ok>' + escapeHtml(opts.okLabel || 'Bestaetigen') + '</button>'
        + '</div>'
        + '</div>';
      function cleanup(val) { ov.remove(); document.removeEventListener('keydown', onKey); resolve(val); }
      function onKey(e) { if (e.key === 'Escape') cleanup(false); else if (e.key === 'Enter') cleanup(true); }
      ov.querySelector('[data-ok]').addEventListener('click', function() { cleanup(true); });
      ov.querySelector('[data-cancel]').addEventListener('click', function() { cleanup(false); });
      ov.querySelector('.ukc-detail-close').addEventListener('click', function() { cleanup(false); });
      ov.addEventListener('click', function(e) { if (e.target === ov) cleanup(false); });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(ov);
      requestAnimationFrame(function() { ov.classList.add('in'); });
    });
  };

  // ---- Promise-based action picker (gebrandet) -----------------
  window.ukcChoose = function(opts) {
    return new Promise(function(resolve) {
      opts = opts || {};
      var prev = document.querySelector('.ukc-detail-overlay'); if (prev) prev.remove();
      var optsHtml = (opts.options || []).map(function(o, i) {
        return '<button class="ukc-choose-opt' + (o.variant === 'danger' ? ' danger' : '') + '" data-idx="' + i + '">'
          + '<span class="ukc-choose-opt-title">' + escapeHtml(o.label || '') + '</span>'
          + (o.desc ? '<span class="ukc-choose-opt-desc">' + escapeHtml(o.desc) + '</span>' : '')
          + '</button>';
      }).join('');
      var ov = document.createElement('div');
      ov.className = 'ukc-detail-overlay';
      ov.innerHTML = '<div class="ukc-detail-card" role="dialog" aria-modal="true">'
        + '<div class="ukc-detail-head">'
          + (opts.kicker ? '<div class="ukc-detail-kicker">' + escapeHtml(opts.kicker) + '</div>' : '')
          + '<h2 class="ukc-detail-title">' + (opts.titleHtml || escapeHtml(opts.title || 'Aktion waehlen')) + '</h2>'
          + '<button class="ukc-detail-close" aria-label="Schliessen">×</button>'
        + '</div>'
        + (opts.message ? '<div class="ukc-detail-msg">' + escapeHtml(opts.message) + '</div>' : '')
        + '<div class="ukc-choose-list">' + optsHtml + '</div>'
        + '<div class="ukc-detail-foot">'
          + '<button class="btn btn-ghost btn-sm" data-cancel>Abbrechen</button>'
        + '</div>'
        + '</div>';
      function cleanup(val) { ov.remove(); document.removeEventListener('keydown', onKey); resolve(val); }
      function onKey(e) { if (e.key === 'Escape') cleanup(null); }
      ov.querySelector('[data-cancel]').addEventListener('click', function() { cleanup(null); });
      ov.querySelector('.ukc-detail-close').addEventListener('click', function() { cleanup(null); });
      ov.addEventListener('click', function(e) { if (e.target === ov) cleanup(null); });
      ov.querySelectorAll('.ukc-choose-opt').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var idx = parseInt(btn.getAttribute('data-idx'), 10);
          var opt = (opts.options || [])[idx];
          cleanup(opt ? opt.value : null);
        });
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(ov);
      requestAnimationFrame(function() { ov.classList.add('in'); });
    });
  };
"""

anchor = "  // ---- Detail-Modal (gebrandet) ---------------------------------"
if anchor not in src:
    print('FAIL: detail-modal anchor not found'); exit(1)
src = src.replace(anchor, helpers + anchor, 1)
print('OK: ukcConfirm + ukcChoose helpers injected')

# --------------------------------------------------------------
# 4. Replace handleCourseAction + handleBookingAction prompts with branded versions
# --------------------------------------------------------------
old_course_action = """  window.handleCourseAction = function(id, action, btn) {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === id; });
    if (!a) { alert('Kurs nicht gefunden'); return; }
    if (!action) {
      var current = a.status || 'in_planning';
      var menu = [];
      if (current !== 'active')   menu.push('1: Veroeffentlichen (sichtbar im Widget)');
      if (current === 'active')   menu.push('2: Pausieren');
      if (current === 'paused')   menu.push('3: Wieder aktivieren');
                                  menu.push('4: Duplizieren');
      if (current !== 'archived') menu.push('5: Archivieren');
      var pick = prompt('Aktion fuer "' + (a.title || '') + '":\\n' + menu.join('\\n') + '\\n\\nNummer eingeben:', '');
      if (!pick) return;
      var map = { '1':'publish','2':'pause','3':'activate','4':'duplicate','5':'archive' };
      action = map[pick.trim()];
      if (!action) { toast('Ungueltige Auswahl', 'warning'); return; }
    }
    var promise;
    if (action === 'publish')     promise = api('/activities/' + id + '/publish',    { method: 'POST' });
    else if (action === 'duplicate') promise = api('/activities/' + id + '/duplicate', { method: 'POST' });
    else if (action === 'archive')   promise = api('/activities/' + id + '/archive',   { method: 'POST' });
    else if (action === 'pause')     promise = api('/activities/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: 'paused' }) });
    else if (action === 'activate')  promise = api('/activities/' + id + '/publish',   { method: 'POST' });
    else { toast('Aktion nicht implementiert: ' + action, 'warning'); return; }
    promise.then(function(){ toast('Erledigt: ' + action, 'success'); refreshAll(); })
           .catch(function(e){ alert('Fehler: ' + (e.message || e)); });
  };"""

new_course_action = """  window.handleCourseAction = async function(id, action, btn) {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === id; });
    if (!a) { alert('Kurs nicht gefunden'); return; }
    if (!action) {
      var current = a.status || 'in_planning';
      var options = [];
      if (current !== 'active')   options.push({ value: 'publish',  label: 'Veroeffentlichen', desc: 'Kurs wird im Widget sichtbar und buchbar.' });
      if (current === 'active')   options.push({ value: 'pause',    label: 'Pausieren',        desc: 'Vorruebergehend ausblenden, keine neuen Buchungen.' });
      if (current === 'paused')   options.push({ value: 'activate', label: 'Wieder aktivieren', desc: 'Kurs wieder buchbar machen.' });
                                  options.push({ value: 'duplicate',label: 'Duplizieren',      desc: 'Kopie als Entwurf anlegen.' });
      if (current !== 'archived') options.push({ value: 'archive',  label: 'Archivieren',      desc: 'Aus aktiver Liste entfernen (umkehrbar).', variant: 'danger' });
      action = await window.ukcChoose({
        kicker: 'Kurs',
        titleHtml: escapeHtml(a.title || '') + ' <em>Aktion</em>',
        message: 'Status aktuell: ' + (current),
        options: options,
      });
      if (!action) return;
    }
    var promise;
    if (action === 'publish')     promise = api('/activities/' + id + '/publish',    { method: 'POST' });
    else if (action === 'duplicate') promise = api('/activities/' + id + '/duplicate', { method: 'POST' });
    else if (action === 'archive')   promise = api('/activities/' + id + '/archive',   { method: 'POST' });
    else if (action === 'pause')     promise = api('/activities/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: 'paused' }) });
    else if (action === 'activate')  promise = api('/activities/' + id + '/publish',   { method: 'POST' });
    else { toast('Aktion nicht implementiert: ' + action, 'warning'); return; }
    promise.then(function(){ toast('Erledigt', 'success'); refreshAll(); })
           .catch(function(e){ alert('Fehler: ' + (e.message || e)); });
  };"""

if old_course_action not in src:
    print('FAIL: handleCourseAction anchor not found'); exit(1)
src = src.replace(old_course_action, new_course_action, 1)
print('OK: handleCourseAction uses ukcChoose')

old_book_action = """  window.handleBookingAction = function(id, action, btn) {
    var s = window.dashboardState; if (!s) return;
    var b = (s.bookings || []).find(function(x){ return x.id === id; });
    if (!b) { alert('Buchung nicht gefunden'); return; }
    if (!action) {
      var menu = [];
      if (b.status !== 'cancelled')             menu.push('1: Stornieren (mit optionalem Stripe-Refund)');
      if (b.paymentStatus !== 'paid')           menu.push('2: Als bezahlt markieren');
      if (b.status !== 'completed' && b.status !== 'cancelled') menu.push('3: Als abgeschlossen markieren');
      var pick = prompt('Aktion fuer Buchung von ' + ((b.customer && b.customer.name) || 'Unbekannt') + ':\\n' + menu.join('\\n') + '\\n\\nNummer eingeben:', '');
      if (!pick) return;
      var map = { '1':'cancel','2':'pay','3':'complete' };
      action = map[pick.trim()];
      if (!action) { toast('Ungueltige Auswahl', 'warning'); return; }
    }
    var body = null;
    if (action === 'cancel') {
      var refund = confirm('Mit Stripe-Refund stornieren? OK = ja, Cancel = nur Status setzen');
      body = JSON.stringify({ refund: !!refund });
    }
    var promise;
    if (action === 'cancel')        promise = api('/bookings/' + id + '/cancel',   { method: 'POST', headers: {'Content-Type':'application/json'}, body: body || '{}' });
    else if (action === 'pay')      promise = api('/bookings/' + id + '/pay',      { method: 'POST' });
    else if (action === 'complete') promise = api('/bookings/' + id + '/complete', { method: 'POST' });
    else { toast('Aktion nicht implementiert: ' + action, 'warning'); return; }
    promise.then(function(){ toast('Erledigt: ' + action, 'success'); refreshAll(); })
           .catch(function(e){ alert('Fehler: ' + (e.message || e)); });
  };"""

new_book_action = """  window.handleBookingAction = async function(id, action, btn) {
    var s = window.dashboardState; if (!s) return;
    var b = (s.bookings || []).find(function(x){ return x.id === id; });
    if (!b) { alert('Buchung nicht gefunden'); return; }
    if (!action) {
      var options = [];
      if (b.status !== 'cancelled')             options.push({ value: 'cancel',   label: 'Stornieren', desc: 'Buchung absagen, optional Stripe-Refund.', variant: 'danger' });
      if (b.paymentStatus !== 'paid')           options.push({ value: 'pay',      label: 'Als bezahlt markieren', desc: 'Vor-Ort-Zahlung erhalten?' });
      if (b.status !== 'completed' && b.status !== 'cancelled') options.push({ value: 'complete', label: 'Als abgeschlossen markieren', desc: 'Buchung ist erfuellt.' });
      action = await window.ukcChoose({
        kicker: 'Buchung',
        titleHtml: escapeHtml((b.customer && b.customer.name) || 'Unbekannt') + ' <em>Aktion</em>',
        message: 'Kurs: ' + (b.activityTitle || b.activityName || '—'),
        options: options,
      });
      if (!action) return;
    }
    var body = null;
    if (action === 'cancel') {
      var refund = await window.ukcConfirm({
        kicker: 'Stornierung',
        titleHtml: 'Mit Stripe-<em>Refund</em>?',
        message: 'OK = Buchung stornieren UND ' + ((b.amountPaid || 0) > 0 ? (b.amountPaid + ' ' + (b.currency || 'EUR')) : 'Betrag') + ' an Kunde zurueckerstatten. Abbrechen = nur Status auf "storniert" setzen, kein Refund.',
        okLabel: 'Stornieren + Refund',
        cancelLabel: 'Nur stornieren',
        variant: 'danger',
      });
      // ukcConfirm returns true (OK) or false (Cancel/Esc); we treat false as 'no refund'.
      body = JSON.stringify({ refund: !!refund });
    }
    var promise;
    if (action === 'cancel')        promise = api('/bookings/' + id + '/cancel',   { method: 'POST', headers: {'Content-Type':'application/json'}, body: body || '{}' });
    else if (action === 'pay')      promise = api('/bookings/' + id + '/pay',      { method: 'POST' });
    else if (action === 'complete') promise = api('/bookings/' + id + '/complete', { method: 'POST' });
    else { toast('Aktion nicht implementiert: ' + action, 'warning'); return; }
    promise.then(function(){ toast('Erledigt', 'success'); refreshAll(); })
           .catch(function(e){ alert('Fehler: ' + (e.message || e)); });
  };"""

if old_book_action not in src:
    print('FAIL: handleBookingAction anchor not found'); exit(1)
src = src.replace(old_book_action, new_book_action, 1)
print('OK: handleBookingAction uses ukcChoose + ukcConfirm')

open(p, 'w', encoding='utf-8').write(src)
print('All patches applied.')
