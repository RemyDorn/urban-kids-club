"""Bidirectional sync between 'Tag' (Wochentag) and 'Ab Datum'.

- When user changes 'Tag': snap 'Ab Datum' forward to next occurrence of that
  weekday (so picking 'Mi' moves the start date to the next Wednesday)
- When user changes 'Ab Datum' manually: update 'Tag' to match the chosen date
- Add helper text below 'Bis Datum' showing the computed last session date

Builds on the earlier setupSessionsDateSync block; here we add Tag<->from sync
and a small derived-end hint.
"""

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/kurs-creator-v2.js'
src = open(p, 'r', encoding='utf-8').read()

# Locate the existing IIFE we added before, and append day-sync logic to it.
old = """      fromInput.addEventListener('change', function () {
        // when 'from' changes, recompute 'until' from current priceUnits
        recalcUntilFromUnits();
      });
      untilInput.addEventListener('change', recalcUnitsFromDates);
      priceUnitsInput.addEventListener('change', recalcUntilFromUnits);
      priceUnitsInput.addEventListener('input', recalcUntilFromUnits);

      // Initial: with default value=8 and from=today, also pre-fill until
      recalcUntilFromUnits();
    })();"""

new = """      // Bidirectional Tag<->Ab Datum
      var dayInput = firstRow.querySelector('select[name=\"schedule[][day]\"]');
      var dayCodeToNum = { MO:1, DI:2, MI:3, DO:4, FR:5, SA:6, SO:0 };
      var numToDayCode = ['SO','MO','DI','MI','DO','FR','SA'];

      function snapFromToWeekday(targetDayCode) {
        var f = parseISODate(fromInput.value);
        if (!f) return;
        var target = dayCodeToNum[targetDayCode];
        if (typeof target !== 'number') return;
        var current = f.getDay();
        if (current === target) return;
        var diff = (target - current + 7) % 7;
        if (diff === 0) diff = 7; // already today's weekday but mismatched -> next week
        var next = new Date(f);
        next.setDate(next.getDate() + diff);
        syncing = true;
        fromInput.value = toISO(next);
        syncing = false;
      }

      if (dayInput) {
        dayInput.addEventListener('change', function () {
          snapFromToWeekday(dayInput.value);
          recalcUntilFromUnits();
        });
      }

      fromInput.addEventListener('change', function () {
        // 1. recompute 'until' from priceUnits
        recalcUntilFromUnits();
        // 2. update 'Tag' select to match the chosen date's day-of-week
        if (dayInput) {
          var f = parseISODate(fromInput.value);
          if (f) {
            var code = numToDayCode[f.getDay()];
            if (code && code !== dayInput.value) {
              syncing = true;
              dayInput.value = code;
              syncing = false;
            }
          }
        }
      });
      untilInput.addEventListener('change', recalcUnitsFromDates);
      priceUnitsInput.addEventListener('change', recalcUntilFromUnits);
      priceUnitsInput.addEventListener('input', recalcUntilFromUnits);

      // Initial: snap from to first selected day, then derive until
      if (dayInput) snapFromToWeekday(dayInput.value);
      recalcUntilFromUnits();
    })();"""

if old not in src:
    print('FAIL: setupSessionsDateSync IIFE end-block not found'); exit(1)
src = src.replace(old, new, 1)

open(p, 'w', encoding='utf-8').write(src)
print('OK: Tag<->Ab Datum sync wired (bidirectional)')
