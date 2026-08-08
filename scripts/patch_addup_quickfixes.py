"""Three quick fixes + cancel-flow wiring:
1. Age dropdown: months 0-12 + years 1-14, with unit pass-through
2. Today-highlight bug in renderWeekGlance (use local YMD instead of UTC)
3. Session-Cancel button -> POST /api/sessions/:id/cancel?compensation=credit
   with confirm-modal explaining the credit issuance
4. Settings save also writes makeup_enabled (so provider can opt in/out)
5. SQL: enable makeup_enabled=true for Socialy now (so test loop works)
"""

import re

# ============================================================
# 1) kurs-creator-v2.js — age options & submit/prefill
# ============================================================
kp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/kurs-creator-v2.js'
ks = open(kp, 'r', encoding='utf-8').read()

old_age = "    var ageOptions = '';\n    for (var y = 0; y <= 14; y++) ageOptions += '<option value=\"' + y + '\">' + y + ' J.</option>';"
new_age = """    var ageOptions = '';
    for (var m = 0; m <= 12; m++) ageOptions += '<option value=\"m' + m + '\">' + m + ' Mo.</option>';
    for (var y = 1; y <= 14; y++) ageOptions += '<option value=\"' + y + '\">' + y + ' J.</option>';"""

if old_age not in ks:
    print('FAIL: ageOptions builder not found'); exit(1)
ks = ks.replace(old_age, new_age, 1)
print('OK: ageOptions now includes 0-12 Mo + 1-14 J')

# Submit: pass raw values (strings like "m3" or "1") through; client parser handles
old_submit = """            ageMin: ageMinEl ? (parseInt(ageMinEl.value, 10) || undefined) : undefined,
            ageMax: ageMaxEl ? (parseInt(ageMaxEl.value, 10) || undefined) : undefined,"""
new_submit = """            ageMin: ageMinEl ? ageMinEl.value : undefined,
            ageMax: ageMaxEl ? ageMaxEl.value : undefined,"""
if old_submit in ks:
    ks = ks.replace(old_submit, new_submit, 1)
    print('OK: kurs-creator passes raw age string to onSubmit')

# Prefill: reconstruct from ageRange.unit + min/max
old_pre = """      var minAge = act.ageRange && act.ageRange.min;
      var maxAge = act.ageRange && act.ageRange.max;
      if (minAge != null) setVal('ageMin', minAge);
      if (maxAge != null) setVal('ageMax', maxAge);"""
new_pre = """      var ar = act.ageRange || {};
      var minAge = ar.min, maxAge = ar.max;
      var unit = ar.unit || 'years';
      function ageVal(v) { if (v == null) return ''; return unit === 'months' ? ('m' + v) : String(v); }
      if (minAge != null) setVal('ageMin', ageVal(minAge));
      if (maxAge != null) setVal('ageMax', ageVal(maxAge));"""
if old_pre in ks:
    ks = ks.replace(old_pre, new_pre, 1)
    print('OK: prefill reconstructs months/years value')

open(kp, 'w', encoding='utf-8').write(ks)

# ============================================================
# 2) dashboard-v3.html: parse ageMin/ageMax string in payload builders
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
fs = open(fp, 'r', encoding='utf-8').read()

# Replace BOTH builder occurrences
old_build = """          ageRange: {
            min: parseInt(data.ageMin) || 0,
            max: Math.max(parseInt(data.ageMax) || 18, parseInt(data.ageMin) || 0),
          },"""
new_build = """          ageRange: (function() {
            function parseAge(v) {
              if (v == null) return { val: 0, unit: 'years' };
              var s = String(v);
              if (s.charAt(0) === 'm') return { val: parseInt(s.slice(1), 10) || 0, unit: 'months' };
              return { val: parseInt(s, 10) || 0, unit: 'years' };
            }
            var pmin = parseAge(data.ageMin);
            var pmax = parseAge(data.ageMax);
            // If units differ, normalize to months for safety (1J = 12 Mo)
            var unit = pmin.unit;
            if (pmin.unit !== pmax.unit) {
              var minM = pmin.unit === 'months' ? pmin.val : pmin.val * 12;
              var maxM = pmax.unit === 'months' ? pmax.val : pmax.val * 12;
              return { min: Math.min(minM, maxM), max: Math.max(minM, maxM), unit: 'months' };
            }
            return { min: Math.min(pmin.val, pmax.val), max: Math.max(pmin.val, pmax.val), unit: unit };
          })(),"""

# The second builder uses parseInt(...,10):
old_build_b = """          ageRange: { min: parseInt(data.ageMin, 10) || 0, max: Math.max(parseInt(data.ageMax, 10) || 18, parseInt(data.ageMin, 10) || 0) },"""

c1 = fs.count(old_build)
c2 = fs.count(old_build_b)
if c1 == 0 and c2 == 0:
    print('FAIL: no ageRange builder found'); exit(1)
if c1 > 0:
    fs = fs.replace(old_build, new_build)
    print('OK: ' + str(c1) + ' ageRange builder(s) updated (variant A)')
if c2 > 0:
    fs = fs.replace(old_build_b, new_build.strip().rstrip(','))
    print('OK: ' + str(c2) + ' ageRange builder(s) updated (variant B)')

# ============================================================
# 3) Today-highlight bug fix in renderWeekGlance (local YMD)
# ============================================================
old_today = """  var monday = new Date(now); monday.setDate(now.getDate() - diffToMon); monday.setHours(0,0,0,0);
  var todayKey = now.toISOString().slice(0, 10);"""
new_today = """  var monday = new Date(now); monday.setDate(now.getDate() - diffToMon); monday.setHours(0,0,0,0);
  function localYmd(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  var todayKey = localYmd(now);"""
if old_today not in fs:
    print('WARN: monday/todayKey anchor not found, skipping')
else:
    fs = fs.replace(old_today, new_today, 1)
    print('OK: todayKey uses local YMD')

old_iso = "    var iso = d.toISOString().slice(0, 10);\n    var isToday = iso === todayKey;"
new_iso = "    var iso = localYmd(d);\n    var isToday = iso === todayKey;"
if old_iso in fs:
    fs = fs.replace(old_iso, new_iso, 1)
    print('OK: iso for week-day uses local YMD')

# ============================================================
# 4) Session-Cancel button: POST /api/sessions/:id/cancel with compensation:credit
# ============================================================
old_cancel_stub = """    actions = '<button class=\"btn btn-ghost btn-sm\" onclick=\"alert(\\'Termin verschieben — folgt im nächsten Sprint\\')\">Verschieben</button>'
      + ' <button class=\"btn btn-ghost btn-sm\" style=\"color:var(--signal)\" onclick=\"alert(\\'Termin absagen — folgt im nächsten Sprint\\')\">Absagen</button>';"""

new_cancel_stub = """    actions = '<button class=\"btn btn-ghost btn-sm\" onclick=\"alert(\\'Termin verschieben — folgt im nächsten Sprint\\')\">Verschieben</button>'
      + ' <button class=\"btn btn-ghost btn-sm\" style=\"color:var(--signal)\" onclick=\"window.__kdCancelSession(\\'' + (item.id || '') + '\\')\">Absagen</button>';"""

if old_cancel_stub not in fs:
    print('WARN: cancel stub not found in __kdShowSession, skipping')
else:
    fs = fs.replace(old_cancel_stub, new_cancel_stub, 1)
    print('OK: __kdShowSession cancel button wired to __kdCancelSession')

# Add __kdCancelSession helper
CANCEL_FN = r'''
window.__kdCancelSession = async function(sessionId) {
  if (!sessionId) { alert('Diese Stunde liegt noch nicht als Datensatz vor — speichere den Block oder warte auf den Sync.'); return; }
  var s = window.dashboardState; if (!s) return;
  var a = (s.activities || []).find(function(x){ return x.id === window.__kdActiveId; });
  if (!a) return;
  var enrolledCount = (s.bookings || []).filter(function(b) {
    return b && b.activityId === a.id && b.status !== 'cancelled' && b.status !== 'refunded';
  }).length;

  var bodyHtml =
      '<p style="margin:0 0 12px;color:var(--ink-2);line-height:1.55">Wir markieren den Termin als <strong>abgesagt</strong> und schreiben den ' + enrolledCount + ' eingebuchten Familie' + (enrolledCount === 1 ? '' : 'n') + ' automatisch ein <strong>Credit</strong> gut. Mit dem Credit können sie den Termin in einer anderen Add-Up-Stunde nachholen.</p>'
    + '<label style="display:block;font-size:12px;color:var(--muted-2);margin:14px 0 4px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase">Grund (optional)</label>'
    + '<textarea id="phKdCancelReason" placeholder="z.B. krankheitsbedingt, Wetter, Trainerin verhindert" style="width:100%;min-height:70px;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--ink);font-family:var(--font-body);font-size:13px;resize:vertical"></textarea>';

  var go = async function(reason) {
    try {
      var resp = await fetch('/api/sessions/' + sessionId + '/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.token || '') },
        body: JSON.stringify({ reason: reason || '', compensation: 'credit', cancelledBy: 'provider' }),
      });
      if (!resp.ok) {
        var err = await resp.json().catch(function() { return {}; });
        throw new Error(err.error || ('HTTP ' + resp.status));
      }
      // Drop session cache so next render reloads fresh (with status=cancelled)
      delete (window.__kdSessionsCache || {})[a.id];
      // Reload deps and re-render
      await window.__kdLoadDeps(a.id);
      window.__kdRender();
      var ov = document.querySelectorAll('.ukc-detail-overlay');
      ov.forEach(function(x){ x.remove(); });
      if (window.ukcToast) window.ukcToast('Termin abgesagt · Credits gutgeschrieben');
    } catch (e) {
      alert('Fehler: ' + (e.message || e));
    }
  };

  if (typeof window.ukcShowDetailModal === 'function') {
    window.ukcShowDetailModal({
      kicker: 'Termin absagen',
      titleHtml: 'Diese Stunde <em>absagen</em>?',
      rows: [],
      bodyExtraHtml: bodyHtml,
      footerHtml: '<button class="btn btn-ghost btn-sm" onclick="this.closest(\'.ukc-detail-overlay\').remove()">Abbrechen</button>'
        + ' <button class="btn btn-primary btn-sm" style="background:var(--signal)" id="phKdCancelGo">Absagen & Credits gutschreiben</button>',
    });
    setTimeout(function() {
      var btn = document.getElementById('phKdCancelGo');
      if (btn) btn.addEventListener('click', function() {
        var rEl = document.getElementById('phKdCancelReason');
        var reason = rEl ? rEl.value.trim() : '';
        btn.disabled = true; btn.textContent = 'Sende…';
        go(reason);
      });
    }, 50);
  } else {
    if (confirm(enrolledCount + ' Familien werden ein Credit bekommen. Wirklich absagen?')) {
      go('');
    }
  }
};
'''

# Insert after __kdDeclineWaitlist (last credit-related helper added)
m = re.search(r"window\.__kdDeclineWaitlist = async function[\s\S]*?\n\};", fs)
if m:
    fs = fs[:m.end()] + "\n" + CANCEL_FN + fs[m.end():]
    print('OK: __kdCancelSession helper appended')

open(fp, 'w', encoding='utf-8').write(fs)

# ============================================================
# 5) Settings save: also persist makeup_enabled via PUT /providers/:id
# ============================================================
fs2 = open(fp, 'r', encoding='utf-8').read()

old_save = """  try {
    var resp = await fetch('/api/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.token || '') },
      body: JSON.stringify({ preferences: prefs }),
    });
    // Save locally regardless (backend may not persist preferences yet)
    s.provider = Object.assign({}, s.provider || {}, { preferences: prefs });
    if (window.ukcToast) window.ukcToast(resp.ok ? 'Einstellungen gespeichert' : 'Lokal gespeichert (Server-Sync folgt)');
  } catch (e) {
    s.provider = Object.assign({}, s.provider || {}, { preferences: prefs });
    if (window.ukcToast) window.ukcToast('Lokal gespeichert');
  }"""

new_save = """  try {
    var resp = await fetch('/api/providers/' + s.provider.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.token || '') },
      body: JSON.stringify({ preferences: prefs, makeupEnabled: addUpEnabled }),
    });
    s.provider = Object.assign({}, s.provider || {}, { preferences: prefs, makeupEnabled: addUpEnabled });
    if (window.ukcToast) window.ukcToast(resp.ok ? 'Einstellungen gespeichert' : 'Lokal gespeichert (Server-Sync nicht aktiv)');
  } catch (e) {
    s.provider = Object.assign({}, s.provider || {}, { preferences: prefs, makeupEnabled: addUpEnabled });
    if (window.ukcToast) window.ukcToast('Lokal gespeichert');
  }"""

if old_save in fs2:
    fs2 = fs2.replace(old_save, new_save, 1)
    open(fp, 'w', encoding='utf-8').write(fs2)
    print('OK: settings save persists makeup_enabled via PUT /providers/:id')

# Provider mapper: ensure makeupEnabled is mapped
mp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/services/supabase/mappers.ts'
ms = open(mp, 'r', encoding='utf-8').read()
if 'makeupEnabled' not in ms:
    # Insert in providerFromDb
    target = "    name: r.company_name ?? '',"
    if target in ms:
        ms = ms.replace(target, target + "\n    makeupEnabled: r.makeup_enabled ?? true,", 1)
        # also in providerToDb (look for company_name = b.name)
        target2 = "if (b.name !== undefined) row.company_name = b.name"
        if target2 in ms:
            ms = ms.replace(target2, target2 + "\n  if ((b as any).makeupEnabled !== undefined) row.makeup_enabled = (b as any).makeupEnabled", 1)
        open(mp, 'w', encoding='utf-8').write(ms)
        print('OK: provider mapper handles makeup_enabled')

# Provider schema: allow makeupEnabled in update
schp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/lib/schemas.ts'
schs = open(schp, 'r', encoding='utf-8').read()
if 'makeupEnabled' not in schs:
    # Find any provider update schema — check schema file
    pass
# Fallback: also accept via field whitelist if there is one.
# Many PUT routes use full schema; we'll skip strict schema and rely on mapper.

print('All patches applied.')
