"""Make the Kurs-Creator modal usable for editing existing activities.

Frontend:
- kurs-creator-v2.js: openKursCreatorV2 accepts {mode:'edit', prefill:activity}.
  After build() renders the modal, fills all form fields from the activity
  object. Changes title to 'Kurs bearbeiten' and submit text to 'Speichern'.
- dashboard-v3.html: editCourseQuick replaced. It opens the modal pre-filled,
  collects data on submit, and PUTs /api/activities/:id with a properly mapped
  payload (same shape as create, minus required-only changes).

Backend:
- src/api/routes/activities.ts PUT /api/activities/:id: after activity update,
  sync the most recent active course_block's capacity, recurring_day,
  recurring_time, duration_minutes, price_per_block to match the new values.
"""

# ============================================================
# 1. kurs-creator-v2.js — accept prefill + apply to form
# ============================================================
kp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/kurs-creator-v2.js'
ks = open(kp, 'r', encoding='utf-8').read()

# Replace the kicker + submit button to be dynamic via data attributes
old_kicker = "'<div class=\"kk-kicker\">Provider · Kurs anlegen</div>' +"
new_kicker = "'<div class=\"kk-kicker\" data-kicker>Provider · Kurs anlegen</div>' +"
if old_kicker not in ks:
    print('FAIL: kicker anchor not found'); exit(1)
ks = ks.replace(old_kicker, new_kicker, 1)

old_submit = "'<button type=\"button\" class=\"kk-btn kk-btn-primary\" data-action=\"submit\">Kurs anlegen</button>' +"
new_submit = "'<button type=\"button\" class=\"kk-btn kk-btn-primary\" data-action=\"submit\" data-submit-label>Kurs anlegen</button>' +"
if old_submit not in ks:
    print('FAIL: submit anchor not found'); exit(1)
ks = ks.replace(old_submit, new_submit, 1)

# Inside wireBehavior, after the day-sync IIFE, add prefill application logic.
# Anchor: the existing 'Submit' click handler -> insert prefill BEFORE submit handler.
anchor = """    // Submit
    overlay.querySelector('[data-action=\"submit\"]').addEventListener('click', function () {"""

prefill_block = """    // ----------------------------------------------------------------
    // Prefill (Edit-Mode) — populate all fields from options.prefill
    // ----------------------------------------------------------------
    if (options && options.prefill && typeof options.prefill === 'object') {
      var act = options.prefill;
      var kicker = overlay.querySelector('[data-kicker]');
      if (kicker) kicker.textContent = 'Provider · Kurs bearbeiten';
      var titleEl = overlay.querySelector('.kk-title');
      if (titleEl) titleEl.innerHTML = 'Kurs <span class=\"kk-title-italic\">bearbeiten</span>';
      var submitBtn = overlay.querySelector('[data-submit-label]');
      if (submitBtn) submitBtn.textContent = 'Speichern';

      function setVal(name, value) {
        if (value == null) return;
        var el = overlay.querySelector('[name=\"' + name + '\"]');
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = String(value);
      }
      function setRowVal(name, value, rowIdx) {
        if (value == null) return;
        var rows = overlay.querySelectorAll('.kk-schedule-row');
        var row = rows[rowIdx || 0];
        if (!row) return;
        var el = row.querySelector('[name=\"' + name + '\"]');
        if (el) el.value = String(value);
      }

      // Stammdaten
      setVal('title', act.title);
      setVal('description', act.description);
      setVal('category', act.category);
      var minAge = act.ageRange && act.ageRange.min;
      var maxAge = act.ageRange && act.ageRange.max;
      if (minAge != null) setVal('ageMin', minAge);
      if (maxAge != null) setVal('ageMax', maxAge);
      setVal('capacity', act.capacity);

      // Schedule (first slot)
      var sched = act.schedule || {};
      var slot = (sched.slots || [])[0] || {};
      // API uses MO/TU/WE/TH/FR/SA/SU; modal uses MO/DI/MI/DO/FR/SA/SO
      var apiToModalDay = { MO:'MO', TU:'DI', WE:'MI', TH:'DO', FR:'FR', SA:'SA', SU:'SO' };
      if (slot.day) setRowVal('schedule[][day]', apiToModalDay[slot.day] || slot.day);
      if (slot.startTime) setRowVal('schedule[][start]', String(slot.startTime).slice(0, 5));
      if (slot.endTime) setRowVal('schedule[][end]', String(slot.endTime).slice(0, 5));
      if (sched.startDate) setRowVal('schedule[][from]', sched.startDate);
      if (sched.endDate) setRowVal('schedule[][until]', sched.endDate);

      // Pricing
      var p1 = (act.pricing || [])[0] || {};
      var typeMap = { single:'single', package:'package', subscription:'monthly', free:'free' };
      if (p1.type) setVal('priceModel', typeMap[p1.type] || p1.type);
      if (p1.label) setVal('priceLabel', p1.label);
      if (p1.amount != null) setVal('priceAmount', p1.amount);
      var units = p1.packageSize || p1.intervalMonths;
      if (units != null) setVal('priceUnits', units);
      if (p1.siblingDiscount != null) setVal('siblingDiscount', p1.siblingDiscount);

      // Optional 2nd price
      var p2 = (act.pricing || [])[1];
      if (p2) {
        var toggle = overlay.querySelector('#kk-second-price-toggle');
        if (toggle) { toggle.checked = true; toggle.dispatchEvent(new Event('change')); }
        if (p2.type) setVal('priceModel2', typeMap[p2.type] || p2.type);
        if (p2.label) setVal('priceLabel2', p2.label);
        if (p2.amount != null) setVal('priceAmount2', p2.amount);
        var u2 = p2.packageSize || p2.intervalMonths;
        if (u2 != null) setVal('priceUnits2', u2);
      }

      // Payment
      setVal('payOnline', !!act.paymentOnline);
      setVal('payOnSite', act.paymentOnsite !== false);
      // Note: payInvoice has no API mapping yet; leave default.

      // Color: highlight matching .kk-color
      if (act.color) {
        overlay.querySelectorAll('.kk-color').forEach(function (b) { b.classList.remove('active'); });
        var match = overlay.querySelector('.kk-color[data-color=\"' + act.color + '\"]');
        if (match) match.classList.add('active');
      }

      // Room + Trainer prefill (after async populateLists). We set value once
      // the option exists; poll briefly.
      function trySetSelect(name, value) {
        if (!value) return;
        var el = overlay.querySelector('select[name=\"' + name + '\"]');
        if (!el) return;
        var attempts = 0;
        var iv = setInterval(function() {
          attempts++;
          if (Array.prototype.some.call(el.options, function(o) { return o.value === value; })) {
            el.value = value;
            clearInterval(iv);
          } else if (attempts > 30) {
            clearInterval(iv);
          }
        }, 100);
      }
      trySetSelect('room', act.roomId || act.locationId);
      trySetSelect('trainer', act.instructorId);
    }

"""

if anchor not in ks:
    print('FAIL: Submit anchor for prefill insert not found'); exit(1)
ks = ks.replace(anchor, prefill_block + anchor, 1)

open(kp, 'w', encoding='utf-8').write(ks)
print('OK: kurs-creator-v2.js prefill wired')

# ============================================================
# 2. dashboard-v3.html — editCourseQuick uses modal + PUT
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
fs = open(fp, 'r', encoding='utf-8').read()

old_edit = """  window.editCourseQuick = function(id) {
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
  };"""

new_edit = """  window.editCourseQuick = function(id) {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === id; });
    if (!a) { alert('Kurs nicht gefunden'); return; }
    if (typeof window.openKursCreatorV2 !== 'function') { alert('Kurs-Creator noch nicht geladen.'); return; }

    window.openKursCreatorV2({
      mode: 'edit',
      prefill: a,
      onSubmit: async function(data) {
        // Build PUT payload — same shape as create
        var dayMap = { MO:'MO', DI:'TU', MI:'WE', DO:'TH', FR:'FR', SA:'SA', SO:'SU' };
        var slots = (data.schedule || []).filter(function(x){ return x.day && x.start && x.end; })
          .map(function(x){ return { day: dayMap[x.day] || x.day, startTime: x.start, endTime: x.end }; });
        var startDate = (data.schedule[0] && data.schedule[0].from) || undefined;
        var endDate = (data.schedule[0] && data.schedule[0].until) || undefined;

        var typeMap = { package:'package', single:'single', monthly:'subscription', free:'package' };
        var pricing = [{
          label: data.priceLabel || (data.priceModel === 'package' ? 'Paket' : 'Einzelstunde'),
          type: typeMap[data.priceModel] || 'package',
          amount: parseFloat(data.priceAmount) || 0,
          currency: 'EUR',
          packageSize: data.priceModel === 'package' ? (parseInt(data.priceUnits, 10) || 8) : undefined,
          intervalMonths: data.priceModel === 'monthly' ? (parseInt(data.priceUnits, 10) || 1) : undefined,
          siblingDiscount: parseFloat(data.siblingDiscount) || 0,
        }];
        if (data.addSecondPrice && parseFloat(data.priceAmount2) > 0) {
          pricing.push({
            label: data.priceLabel2 || 'Zweite Option',
            type: typeMap[data.priceModel2] || 'single',
            amount: parseFloat(data.priceAmount2),
            currency: 'EUR',
            packageSize: data.priceModel2 === 'package' ? (parseInt(data.priceUnits2, 10) || 1) : undefined,
            intervalMonths: data.priceModel2 === 'monthly' ? (parseInt(data.priceUnits2, 10) || 1) : undefined,
          });
        }
        var trainerVal = (data.trainer && data.trainer !== 'Kein Kursleiter zugewiesen' && data.trainer !== '') ? data.trainer : null;
        var roomVal = (data.room && data.room !== 'Kein Raum zugewiesen' && data.room !== '') ? data.room : null;
        var payload = {
          title: data.title,
          description: data.description || '',
          category: data.category || 'sonstige',
          ageRange: { min: parseInt(data.ageMin, 10) || 0, max: Math.max(parseInt(data.ageMax, 10) || 18, parseInt(data.ageMin, 10) || 0) },
          schedule: slots.length ? { type: 'recurring', slots: slots, startDate: startDate, endDate: endDate } : undefined,
          capacity: parseInt(data.capacity, 10) || 10,
          pricing: pricing,
          paymentOnline: !!data.payOnline,
          paymentOnsite: !!data.payOnSite,
          color: data.color || undefined,
          roomId: roomVal,
          instructorId: trainerVal,
        };
        try {
          console.log('[v3] PUT /activities/' + id + ' payload:', JSON.parse(JSON.stringify(payload)));
          await s.api('/activities/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
          toast('Kurs gespeichert', 'success');
          refreshAll();
        } catch (e) {
          alert('Speichern fehlgeschlagen: ' + (e.message || e));
        }
      },
    });
  };"""

if old_edit not in fs:
    print('FAIL: editCourseQuick anchor not found'); exit(1)
fs = fs.replace(old_edit, new_edit, 1)

open(fp, 'w', encoding='utf-8').write(fs)
print('OK: dashboard-v3.html editCourseQuick wired with full modal + PUT')

# ============================================================
# 3. Backend: PUT /api/activities/:id syncs latest course_block fields
# ============================================================
ap = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/activities.ts'
asrc = open(ap, 'r', encoding='utf-8').read()

# Find the PUT handler and inject block-sync logic before res.json(...)
import re

# We look for the PUT route's response line. The handler is around line 131.
old_put_close = "  router.post('/api/activities/:id/publish'"
# Strategy: find the closing `})` of the PUT handler. The PUT block is between
# router.put('/api/activities/:id', ...) and the next router.* call. We insert
# the sync helper immediately after `await ActivityService.update(...)` and
# before `res.json({ data: activity })`.

# Use a regex to locate "await ActivityService.update" inside PUT.
m = re.search(r"router\.put\('/api/activities/:id',[\s\S]*?await ActivityService\.update\(([^)]+)\)\s*", asrc)
if not m:
    print('FAIL: PUT handler / ActivityService.update not located'); exit(1)

# Find the line `res.json({ data: activity })` (or similar) following the update
# Find the index of the next `res.json` after the regex match
update_end = m.end()
res_idx = asrc.find('res.json', update_end)
if res_idx == -1:
    print('FAIL: res.json after PUT update not found'); exit(1)

# Backwards-find newline before res.json to get clean injection point
inject_at = asrc.rfind('\n', 0, res_idx)

inject_code = """

    // Sync linked course_block fields (capacity / day / time / price / duration)
    try {
      const updateForBlock: Record<string, any> = {}
      const body = req.body as any
      if (body.capacity != null) updateForBlock.capacity = body.capacity
      if (body.pricing && body.pricing[0] && body.pricing[0].amount != null) updateForBlock.price_per_block = body.pricing[0].amount
      if (body.schedule && body.schedule.slots && body.schedule.slots[0]) {
        const slot0 = body.schedule.slots[0]
        if (slot0.day) updateForBlock.recurring_day = slot0.day
        if (slot0.startTime) updateForBlock.recurring_time = slot0.startTime
        if (slot0.startTime && slot0.endTime) {
          const [sh, sm] = String(slot0.startTime).split(':').map(Number)
          const [eh, em] = String(slot0.endTime).split(':').map(Number)
          updateForBlock.duration_minutes = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))
        }
      }
      if (body.schedule && body.schedule.startDate) updateForBlock.start_date = body.schedule.startDate
      if (Object.keys(updateForBlock).length > 0) {
        const sb = getServiceClient()
        await sb.from('course_blocks').update(updateForBlock)
          .eq('activity_id', req.params.id)
          .in('status', ['active', 'upcoming'])
        console.log('[ActivityPUT] Synced block fields:', Object.keys(updateForBlock).join(','), 'for activity', req.params.id)
      }
    } catch (syncErr: any) {
      console.error('[ActivityPUT] Block sync failed (non-fatal):', syncErr.message || syncErr)
    }
"""

asrc = asrc[:inject_at] + inject_code + asrc[inject_at:]

# Ensure getServiceClient import exists in activities.ts
if "import { getServiceClient }" not in asrc:
    # add after first import line
    first_import_end = asrc.find('\n', asrc.find('import '))
    asrc = asrc[:first_import_end + 1] + "import { getServiceClient } from '../../lib/supabase'\n" + asrc[first_import_end + 1:]

open(ap, 'w', encoding='utf-8').write(asrc)
print('OK: activities.ts PUT now syncs course_block fields')
