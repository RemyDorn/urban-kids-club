"""Replace alert() stubs in dashboard-v3 Kurse + Buchungen tables with real
action handlers backed by existing API endpoints:

Activities:
  POST /api/activities/:id/publish   -> Veroeffentlichen (in_planning -> active)
  POST /api/activities/:id/duplicate -> Duplizieren
  POST /api/activities/:id/archive   -> Archivieren
  PUT  /api/activities/:id           -> Pause (status='paused') + simple edit

Bookings:
  POST /api/bookings/:id/cancel  -> Stornieren
  POST /api/bookings/:id/pay     -> Als bezahlt markieren
  POST /api/bookings/:id/complete-> Als abgeschlossen markieren

This patch adds:
- window.handleCourseAction(id, action)
- window.handleBookingAction(id, action)
- window.viewCourseDetail(id)  -> simple alert with key fields
- window.viewBookingDetail(id) -> simple alert with key fields
- window.editCourseQuick(id)   -> prompt-based edit for title + capacity (full
  modal-prefill is a follow-up; this is the minimum useful)
- replaces existing alert('...folgt') buttons in both tables with calls to the
  real handlers.
"""

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(p, 'r', encoding='utf-8').read()

# --------------------------------------------------------------
# 1. Replace KURSE row actions (5014..5016)
# --------------------------------------------------------------
old_k = """        + '<button class="row-action-btn" title="Ansehen" onclick="alert(\\'Kurs-Detail folgt\\')">⊙</button> '
        + '<button class="row-action-btn" title="Bearbeiten" onclick="alert(\\'Kurs-Bearbeitung folgt\\')">✎</button> '
        + '<button class="row-action-btn" title="Weitere" onclick="alert(\\'Aktionen folgen\\')">⋯</button>'"""
new_k = """        + '<button class="row-action-btn" title="Ansehen" onclick="window.viewCourseDetail(\\'' + a.id + '\\')">⊙</button> '
        + '<button class="row-action-btn" title="Bearbeiten" onclick="window.editCourseQuick(\\'' + a.id + '\\')">✎</button> '
        + '<button class="row-action-btn" title="Mehr Aktionen" onclick="window.handleCourseAction(\\'' + a.id + '\\', null, this)">⋯</button>'"""
if old_k not in src:
    print('FAIL: kurse row buttons not found'); exit(1)
src = src.replace(old_k, new_k, 1)

# --------------------------------------------------------------
# 2. Replace BUCHUNGEN row actions (5181..5183)
# --------------------------------------------------------------
old_b = """        + '<button class="row-action-btn" title="Ansehen" onclick="alert(\\'Buchung-Detail folgt\\')">⊙</button> '
        + '<button class="row-action-btn" title="Bearbeiten" onclick="alert(\\'Bearbeiten folgt\\')">✎</button> '
        + '<button class="row-action-btn" title="Weitere" onclick="alert(\\'Aktionen folgen\\')">⋯</button>'"""
new_b = """        + '<button class="row-action-btn" title="Ansehen" onclick="window.viewBookingDetail(\\'' + b.id + '\\')">⊙</button> '
        + '<button class="row-action-btn" title="Mehr Aktionen" onclick="window.handleBookingAction(\\'' + b.id + '\\', null, this)">⋯</button>'"""
if old_b not in src:
    print('FAIL: buchungen row buttons not found'); exit(1)
src = src.replace(old_b, new_b, 1)

# --------------------------------------------------------------
# 3. Inject helpers right before Phase 2a SPA-Router marker
# --------------------------------------------------------------
helpers = """
// ============================================================
// Inline Aktionen fuer Kurse + Buchungen (Sprint D Quick-Fix)
// ============================================================
(function() {
  function api(path, opts) {
    var s = window.dashboardState; if (!s || !s.api) throw new Error('Dashboard nicht geladen');
    return s.api(path, opts || {});
  }
  function refreshAll() {
    var s = window.dashboardState; if (!s || !s.api) return;
    Promise.all([
      s.api('/providers/' + s.provider.id + '/activities').then(function(r){ s.activities = r.data || r.activities || r || []; }).catch(function(){}),
      s.api('/providers/' + s.provider.id + '/bookings').then(function(r){ s.bookings = r.data || r.bookings || r || []; }).catch(function(){}),
    ]).then(function() {
      var hash = (location.hash || '').replace('#','');
      if (window.sectionLoaders && window.sectionLoaders[hash]) window.sectionLoaders[hash]();
      if (typeof window.refreshDashboardCards === 'function') window.refreshDashboardCards();
    });
  }
  function toast(msg, kind) {
    if (typeof window.ukcToast === 'function') window.ukcToast(msg, kind || 'info', 2400);
    else alert(msg);
  }

  // ----- KURSE -----
  window.viewCourseDetail = function(id) {
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
  };

  window.editCourseQuick = function(id) {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === id; });
    if (!a) { alert('Kurs nicht gefunden'); return; }
    var newTitle = prompt('Kursname (leer lassen = unveraendert):', a.title || '');
    if (newTitle === null) return; // cancel
    var newCapStr = prompt('Max. Teilnehmer (aktuell ' + (a.capacity || 0) + '):', String(a.capacity || 10));
    if (newCapStr === null) return;
    var update = {};
    if (newTitle && newTitle !== a.title) update.title = newTitle;
    var newCap = parseInt(newCapStr, 10);
    if (newCap > 0 && newCap !== a.capacity) update.capacity = newCap;
    if (Object.keys(update).length === 0) { toast('Keine Aenderung', 'info'); return; }
    api('/activities/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(update) })
      .then(function(){ toast('Kurs gespeichert', 'success'); refreshAll(); })
      .catch(function(e){ alert('Speichern fehlgeschlagen: ' + (e.message || e)); });
  };

  window.handleCourseAction = function(id, action, btn) {
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
  };

  // ----- BUCHUNGEN -----
  window.viewBookingDetail = function(id) {
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
  };

  window.handleBookingAction = function(id, action, btn) {
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
  };
})();
"""

marker = "// Phase 2a: SPA-Router"
if marker not in src:
    print('FAIL: SPA-Router marker not found'); exit(1)
# inject helpers right before that marker (within same script)
src = src.replace(marker, helpers.rstrip() + "\n\n  " + marker, 1)

open(p, 'w', encoding='utf-8').write(src)
print('OK: actions for Kurse + Buchungen wired')
