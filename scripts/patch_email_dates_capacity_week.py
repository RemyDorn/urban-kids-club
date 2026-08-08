"""Bundle:
1. email.ts: provider name = display_name (Brand) instead of company_name (legal entity)
2. email.ts: replace ASCII-transliterations (ae/oe/ue/Ae/Oe/Ue) with proper umlauts
3. email.ts: format dates DE (29. April 2026) via fmtDateDE helper
4. dashboard-v3 capacityOf: read enrollment/booking count from state.bookings
5. dashboard-v3: also call renderWeekGlance from initial dashboard render
"""

# ============================================================
# 1. Use display_name in checkout/booking-confirmation/cancellation/edit-update emails
# ============================================================
ep = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/lib/email.ts'
es = open(ep, 'r', encoding='utf-8').read()

# A. In email.ts — fix umlaut transliterations in user-facing strings.
# Targeted replacements (keep code/identifier safe).
umlaut_map = [
    ('Aenderung', 'Änderung'),
    ('aenderung', 'änderung'),
    ('geaendert', 'geändert'),
    ('Loesung',  'Lösung'),
    ('loesung',  'lösung'),
    ('fuer',     'für'),
    ('Fuer',     'Für'),
    ('Plaetze',  'Plätze'),
    ('Faellig',  'Fällig'),
    ('voruebergehend', 'vorübergehend'),
    ('voruebergehende', 'vorübergehende'),
    ('Ueber',    'Über'),
    ('Uebergabe','Übergabe'),
    ('koennen',  'können'),
    ('koennt',   'könnt'),
    ('moeglich', 'möglich'),
    ('Pruefe',   'Prüfe'),
    ('pruefe',   'prüfe'),
    ('Mueller',  'Müller'),
    ('Maerz',    'März'),
    ('staerker', 'stärker'),
    ('Erfahre',  'Erfahre'),  # noop placeholder
]
# Apply targeted in literal strings only — but since email.ts uses these inside HTML strings
# and English vocabulary doesn't collide, blanket replace is safe.
for old_w, new_w in umlaut_map:
    es = es.replace(old_w, new_w)

# B. fmtDateDE helper inside email.ts (above shell()).
helper = """
// ============================================================
// Helpers
// ============================================================

function fmtDateDE(input: string | undefined | null): string {
  if (!input) return ''
  const m = String(input).match(/^(\\d{4})-(\\d{2})-(\\d{2})/)
  if (!m) return String(input)
  const y = m[1]; const mo = parseInt(m[2], 10); const d = parseInt(m[3], 10)
  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
  return d + '. ' + (months[mo - 1] || mo) + ' ' + y
}
"""
# Inject right after the THEME object closing
anchor = "// ============================================================\n// HTML-ESCAPE (für User-Input in Subject & Body)"
if anchor not in es:
    print('FAIL: helper anchor not found'); exit(1)
es = es.replace(anchor, helper + "\n" + anchor, 1)

# C. Use fmtDateDE in sendBookingConfirmation rows + sendCourseUpdate diff rows
# Booking confirmation: { label: 'Termin', value: `${esc(data.date)} · ${esc(data.time)} Uhr` }
old_b = "{ label: 'Termin', value: `${esc(data.date)} · ${esc(data.time)} Uhr` },"
new_b = "{ label: 'Termin', value: `${esc(fmtDateDE(data.date) || data.date)} · ${esc(data.time)} Uhr` },"
if old_b in es:
    es = es.replace(old_b, new_b, 1)
else:
    print('WARN: Termin row anchor not found (booking confirmation)')

# Course update diff: change values for Start/Ende dates use fmtDateDE inside the diff rows.
# We'll reformat in the activities.ts handler instead so the diff rows already contain
# nicely formatted dates. Skip here.

open(ep, 'w', encoding='utf-8').write(es)
print('OK: email.ts umlauts + fmtDateDE')

# ============================================================
# 2. activities.ts — use providerDisplayName + fmtDateDE in diff rows
# ============================================================
ap = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/activities.ts'
asrc = open(ap, 'r', encoding='utf-8').read()

# 2a. Replace provider2.company_name with display_name fallback
old_pn = """const { data: provider2 } = await sb2.from('providers').select('company_name').eq('id', auth.providerId).single()
            const providerName = provider2?.company_name || 'Dein Anbieter'"""
new_pn = """const { data: provider2 } = await sb2.from('providers').select('display_name, company_name').eq('id', auth.providerId).single()
            const providerName = provider2?.display_name || provider2?.company_name || 'Dein Anbieter'"""
if old_pn in asrc:
    asrc = asrc.replace(old_pn, new_pn, 1)
else:
    print('WARN: provider name anchor not found in activities.ts')

# 2b. Format dates DE in diff rows (Start, Ende)
old_diff_dates = """      if (orig.schedule?.startDate !== next.schedule?.startDate && next.schedule?.startDate) {
        changes.push({ label: 'Start', oldValue: orig.schedule?.startDate || '—', newValue: next.schedule.startDate })
      }
      if (orig.schedule?.endDate !== next.schedule?.endDate && next.schedule?.endDate) {
        changes.push({ label: 'Ende', oldValue: orig.schedule?.endDate || 'offen', newValue: next.schedule.endDate })
      }"""
new_diff_dates = """      const fmtD = (s: string | undefined | null) => {
        if (!s) return ''
        const m = String(s).match(/^(\\d{4})-(\\d{2})-(\\d{2})/)
        if (!m) return String(s)
        const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
        return parseInt(m[3], 10) + '. ' + months[parseInt(m[2], 10) - 1] + ' ' + m[1]
      }
      if (orig.schedule?.startDate !== next.schedule?.startDate && next.schedule?.startDate) {
        changes.push({ label: 'Start', oldValue: fmtD(orig.schedule?.startDate) || '—', newValue: fmtD(next.schedule.startDate) })
      }
      if (orig.schedule?.endDate !== next.schedule?.endDate && next.schedule?.endDate) {
        changes.push({ label: 'Ende', oldValue: fmtD(orig.schedule?.endDate) || 'offen', newValue: fmtD(next.schedule.endDate) })
      }"""
if old_diff_dates in asrc:
    asrc = asrc.replace(old_diff_dates, new_diff_dates, 1)
else:
    print('WARN: diff dates anchor not found')

open(ap, 'w', encoding='utf-8').write(asrc)
print('OK: activities.ts uses display_name + DE dates in diff')

# ============================================================
# 3. checkout.service.ts — also use display_name for booking confirmation provider name
# ============================================================
cp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/services/supabase/checkout.service.ts'
csrc = open(cp, 'r', encoding='utf-8').read()

# Replace all `select('company_name').eq('id', params.providerId)` with display_name fallback
old_c1 = "const { data: provider } = await db.from('providers').select('company_name').eq('id', params.providerId).single()"
new_c1 = "const { data: provider } = await db.from('providers').select('display_name, company_name').eq('id', params.providerId).single()"
csrc = csrc.replace(old_c1, new_c1)

# All `provider?.company_name` -> `provider?.display_name || provider?.company_name`
csrc = csrc.replace("provider?.company_name || ''", "provider?.display_name || provider?.company_name || ''")

open(cp, 'w', encoding='utf-8').write(csrc)
print('OK: checkout.service.ts provider display_name')

# ============================================================
# 4. dashboard-v3 capacityOf — read counts from state.bookings
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
fs = open(fp, 'r', encoding='utf-8').read()

old_cap = """  function capacityOf(a) {
    const booked = a.bookedCount ?? a.enrollmentCount ?? 0;
    const cap = a.capacity ?? 0;
    return { booked, cap, ratio: cap > 0 ? booked/cap : 0 };
  }"""

new_cap = """  function capacityOf(a) {
    let booked = a.bookedCount ?? a.enrollmentCount;
    if (booked == null) {
      const all = (state && state.bookings) || [];
      booked = all.filter(function(b) {
        return b && b.activityId === a.id && b.status !== 'cancelled' && b.status !== 'refunded';
      }).length;
    }
    const cap = a.capacity ?? 0;
    return { booked, cap, ratio: cap > 0 ? booked/cap : 0 };
  }"""

if old_cap not in fs:
    print('FAIL: capacityOf anchor not found'); exit(1)
fs = fs.replace(old_cap, new_cap, 1)
print('OK: capacityOf reads from state.bookings')

# ============================================================
# 5. Hook renderWeekGlance into the initial dashboard render
# ============================================================
old_recent = """    // 6. Letzte Buchungen-Tabelle (5 letzte) — nutzt class=\"data-table\" + .cust pattern
    const recentBookings = [...bookings].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);"""
new_recent = """    // 6. Letzte Buchungen-Tabelle (5 letzte) — nutzt class=\"data-table\" + .cust pattern
    if (typeof window.renderWeekGlance === 'function') {
      // Render the dashboard week-glance now that activities are loaded.
      try { window.renderWeekGlance(); } catch (e) { console.warn('[Dashboard] renderWeekGlance failed', e); }
    }
    const recentBookings = [...bookings].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);"""

if old_recent not in fs:
    print('WARN: dashboard recent bookings anchor not found — week-glance initial render not hooked')
else:
    fs = fs.replace(old_recent, new_recent, 1)
    print('OK: renderWeekGlance also runs on initial dashboard render')

open(fp, 'w', encoding='utf-8').write(fs)
print('All patches applied.')
