"""Fix Kurse-Liste table cells:
1. ALTER liest aus a.ageRange.{min,max,unit} (statt minAgeMonths/maxAgeMonths)
2. TERMIN zeigt:
   - oben: Wochentag + Uhrzeit (Do 14:00-15:00)
   - unten: Datum-von-bis + Termine-Zahl (30.04.-18.06.2026 . 8 Termine)
3. PREIS zeigt:
   - oben: Brutto-Preis (140 EUR)
   - unten: Brutto-Preis pro Termin (17,50 EUR / Termin)
4. UMSATZ-KPI nutzt pricing[0].amount statt priceCents (sonst 0).
"""

import re

fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(fp, 'r', encoding='utf-8').read()

# ============================================================
# 1) Replace ageOf + terminOf + add priceOf helper
# ============================================================
old_helpers = """  function ageOf(a) {
    const min = a.minAgeMonths ?? a.ageMin;
    const max = a.maxAgeMonths ?? a.ageMax;
    if (min == null && max == null) return '—';
    function fmt(m) { if (m == null) return '?'; return m < 24 ? m + ' Mo' : Math.floor(m/12) + ' J'; }
    return fmt(min) + '–' + fmt(max);
  }
  function terminOf(a) {
    const days = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    const day = a.weekday ?? a.dayOfWeek;
    const time = a.startTime || a.time;
    if (day != null && time) return (days[day] || '?') + ' · ' + time;
    return '—';
  }"""

new_helpers = """  function ageOf(a) {
    const ar = a.ageRange || {};
    const min = ar.min ?? a.minAgeMonths ?? a.ageMin;
    const max = ar.max ?? a.maxAgeMonths ?? a.ageMax;
    const unit = ar.unit || (a.minAgeMonths != null ? 'months' : 'years');
    if (min == null && max == null) return '—';
    const suffix = unit === 'months' ? ' Mo' : ' J';
    function fmt(v) { return v == null ? '?' : v + suffix; }
    return fmt(min) + '–' + fmt(max);
  }
  function terminOf(a) {
    // Returns the day+time line (use terminSubOf for the date range sub)
    const dayKeys = { MO:'Mo', TU:'Di', WE:'Mi', TH:'Do', FR:'Fr', SA:'Sa', SU:'So' };
    const sched = a.schedule || {};
    const slot = (sched.slots || [])[0] || {};
    const day = dayKeys[slot.day] || (a.weekday != null ? ['So','Mo','Di','Mi','Do','Fr','Sa'][a.weekday] : '');
    const st = (slot.startTime || a.startTime || a.time || '').slice(0,5);
    const et = (slot.endTime || '').slice(0,5);
    if (day && st) return day + ' ' + st + (et ? '–' + et : '');
    if (st) return st;
    return '—';
  }
  function terminSubOf(a) {
    const sched = a.schedule || {};
    const sd = sched.startDate;
    const ed = sched.endDate;
    function fmt(s) {
      if (!s) return '';
      const m = String(s).match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
      if (!m) return s;
      return parseInt(m[3],10) + '.' + parseInt(m[2],10) + '.' + m[1].slice(2);
    }
    let range = '';
    if (sd && ed) range = fmt(sd) + '–' + fmt(ed);
    else if (sd) range = 'ab ' + fmt(sd);
    const pkg = (a.pricing && a.pricing[0] && a.pricing[0].packageSize) || 0;
    const cnt = pkg ? pkg + ' Termine' : '';
    if (range && cnt) return range + ' · ' + cnt;
    return range || cnt || '';
  }
  function priceOf(a) {
    // Brutto Block-Preis aus pricing[0].amount; Fallback priceCents (legacy)
    const p = (a.pricing && a.pricing[0]) || {};
    const amt = (p.amount != null) ? Number(p.amount) : (a.priceCents ? a.priceCents/100 : 0);
    if (!amt) return { total: '—', perSession: '' };
    const totalLabel = amt.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    const pkg = p.packageSize || 0;
    let perSession = '';
    if (pkg > 0) {
      const per = amt / pkg;
      perSession = per.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' € / Termin';
    } else if (p.type === 'subscription') {
      perSession = '/ Monat';
    } else if (p.type === 'single') {
      perSession = '/ Einzelstunde';
    }
    return { total: totalLabel, perSession };
  }"""

if old_helpers not in src:
    print('FAIL: helpers anchor not found'); exit(1)
src = src.replace(old_helpers, new_helpers, 1)
print('OK: ageOf + terminOf rewritten + terminSubOf + priceOf added')

# ============================================================
# 2) Update the kurs row template — TERMIN cell + PREIS cell
# ============================================================
old_row_termin = "+ '<td>' + escapeHtml(terminOf(a)) + '</td>'"
new_row_termin = "+ '<td>' + escapeHtml(terminOf(a)) + (terminSubOf(a) ? '<br><span style=\"font-size:11px;color:var(--muted)\">' + escapeHtml(terminSubOf(a)) + '</span>' : '') + '</td>'"
if old_row_termin not in src:
    print('FAIL: termin <td> not found'); exit(1)
src = src.replace(old_row_termin, new_row_termin, 1)
print('OK: termin cell now shows day+time + date-range/Termine sub')

old_row_price = "+ '<td>' + fmtPrice(a.priceCents) + '<br><span style=\"font-size:11px;color:var(--muted)\">pro Block</span></td>'"
new_row_price = """+ '<td>' + (function() {
            var p = priceOf(a);
            return p.total + (p.perSession ? '<br><span style=\"font-size:11px;color:var(--muted)\">' + escapeHtml(p.perSession) + '</span>' : '<br><span style=\"font-size:11px;color:var(--muted)\">pro Block</span>');
          })() + '</td>'"""
if old_row_price not in src:
    print('FAIL: price <td> not found'); exit(1)
src = src.replace(old_row_price, new_row_price, 1)
print('OK: price cell now shows Block-Preis + perSession-Aufschlüsselung')

# ============================================================
# 3) UMSATZ-KPI: priceCents fallback to pricing[0].amount
# ============================================================
old_umsatz = "      totalUmsatz += (a.priceCents || 0) * booked;"
new_umsatz = "      totalUmsatz += ((a.pricing && a.pricing[0] && a.pricing[0].amount) || ((a.priceCents || 0) / 100)) * booked;"
if old_umsatz in src:
    src = src.replace(old_umsatz, new_umsatz, 1)
    print('OK: totalUmsatz reads pricing[0].amount as primary source')
else:
    print('WARN: totalUmsatz line not found, leaving alone')

# Also adjust where the umsatz KPI is rendered — find phKurseUmsatz
# Existing format probably divides by 100. Let me check.
# We changed the calc so totalUmsatz is now in EUR (not cents) when pricing[0] is used.
# We need to check the render logic.

m = re.search(r"phKurseUmsatz['\"]\)\.innerHTML[^;]*", src)
if m:
    print('UMSATZ render line:', m.group(0)[:200])

# Looking for how total is formatted
m2 = re.search(r"totalUmsatz[/]100|totalUmsatz \* 0\.01|fmtPrice\(totalUmsatz", src)
if m2:
    print('Found EUR conversion:', m2.group(0))
    # Since priceCents was assumed cents, the divide-by-100 is now wrong.
    # Convert totalUmsatz back to cents form? Easier: keep totalUmsatz semantics consistent.
    # Better fix: in the new line above, multiply by 100 to keep cents semantics.
    src = src.replace(new_umsatz,
        "      totalUmsatz += (((a.pricing && a.pricing[0] && a.pricing[0].amount) ? a.pricing[0].amount * 100 : (a.priceCents || 0))) * booked;",
        1)
    print('OK: totalUmsatz kept in cents semantics for downstream formatter')

open(fp, 'w', encoding='utf-8').write(src)
print('All patches applied.')
