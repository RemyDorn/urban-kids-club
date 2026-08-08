"""Sync 'Wochen/Einheiten' (priceUnits) <-> Schedule date range automatically:
- When user changes 'Bis Datum', recalc priceUnits from weekly diff
- When user changes priceUnits, recalc 'Bis Datum'
- Improve label + hint to make the relationship clear

Patches src/frontend/kurs-creator-v2.js
"""
import re

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/kurs-creator-v2.js'
src = open(p, 'r', encoding='utf-8').read()

# 1) Improve label + add inline hint
old_lbl = """                  '<span class="kk-label">Wochen / Einheiten</span>' +
                  '<input class="kk-input" type="number" name="priceUnits" value="8" min="1">' +"""
new_lbl = """                  '<span class="kk-label">Termine im Block <span class="kk-hint">(z.&nbsp;B. 8 fuer 8&nbsp;Wochen)</span></span>' +
                  '<input class="kk-input" type="number" name="priceUnits" value="8" min="1" data-auto-sync="weeks">' +"""

if old_lbl not in src:
    print('FAIL: priceUnits primary label block not found'); exit(1)
src = src.replace(old_lbl, new_lbl, 1)

# 2) Add reactive sync wiring inside wireBehavior, right before the Submit handler.
#    Find anchor: '// Submit\n    overlay.querySelector(\'[data-action="submit"]\').addEventListener'
anchor = """    // Submit
    overlay.querySelector('[data-action=\"submit\"]').addEventListener('click', function () {"""

sync_block = """    // ----------------------------------------------------------------
    // Auto-sync: 'Termine im Block' (priceUnits) <-> Schedule 'Bis Datum'
    // - User picks 'Ab Datum' + 'Bis Datum'  -> priceUnits = weeks + 1 (inclusive count of weekly sessions)
    // - User changes priceUnits             -> 'Bis Datum' = 'Ab Datum' + (priceUnits-1)*7 days
    // Each priceUnit represents one weekly session in the block.
    // ----------------------------------------------------------------
    (function setupSessionsDateSync() {
      var priceUnitsInput = overlay.querySelector('input[name=\"priceUnits\"]');
      if (!priceUnitsInput) return;
      var firstRow = overlay.querySelector('.kk-schedule-row');
      if (!firstRow) return;
      var fromInput = firstRow.querySelector('input[name=\"schedule[][from]\"]');
      var untilInput = firstRow.querySelector('input[name=\"schedule[][until]\"]');
      if (!fromInput || !untilInput) return;

      function parseISODate(s) { return s ? new Date(s + 'T00:00:00') : null; }
      function toISO(d) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + dd;
      }

      var syncing = false;
      function recalcUnitsFromDates() {
        if (syncing) return;
        var from = parseISODate(fromInput.value);
        var until = parseISODate(untilInput.value);
        if (!from || !until || until < from) return;
        var weeks = Math.round((until - from) / (7 * 24 * 60 * 60 * 1000)) + 1;
        if (weeks > 0 && weeks <= 104) {
          syncing = true;
          priceUnitsInput.value = weeks;
          syncing = false;
        }
      }
      function recalcUntilFromUnits() {
        if (syncing) return;
        var from = parseISODate(fromInput.value);
        var n = parseInt(priceUnitsInput.value, 10);
        if (!from || !n || n < 1) return;
        var d = new Date(from);
        d.setDate(d.getDate() + (n - 1) * 7);
        syncing = true;
        untilInput.value = toISO(d);
        syncing = false;
      }

      fromInput.addEventListener('change', function () {
        // when 'from' changes, recompute 'until' from current priceUnits
        recalcUntilFromUnits();
      });
      untilInput.addEventListener('change', recalcUnitsFromDates);
      priceUnitsInput.addEventListener('change', recalcUntilFromUnits);
      priceUnitsInput.addEventListener('input', recalcUntilFromUnits);

      // Initial: with default value=8 and from=today, also pre-fill until
      recalcUntilFromUnits();
    })();

"""

if anchor not in src:
    print('FAIL: Submit anchor not found'); exit(1)
src = src.replace(anchor, sync_block + anchor, 1)

open(p, 'w', encoding='utf-8').write(src)
print('OK: Termine im Block <-> Bis Datum sync wired')
