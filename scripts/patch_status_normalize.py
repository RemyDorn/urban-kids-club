"""Status-Normalisierung:
- Backend: ActivityService.publish setzt 'active' (statt 'published') ODER
  /publish-Endpoint behandelt published als active fuer Notification-Trigger
- Frontend Menu: nutzt statusOf(a) damit 'published' zu 'active' wird
- Frontend __kdRender + handleCourseAction: dito normalisieren
"""

import re

# ============================================================
# 1) ActivityService.publish: status 'active' (canonical) statt 'published'
# ============================================================
sp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/services/supabase/activity.service.ts'
ss = open(sp, 'r', encoding='utf-8').read()

old_publish = ".update({ status: 'published', updated_at: new Date().toISOString() })"
new_publish = ".update({ status: 'active', updated_at: new Date().toISOString() })"
if old_publish not in ss:
    print('FAIL: publish update anchor not found'); exit(1)
ss = ss.replace(old_publish, new_publish, 1)
open(sp, 'w', encoding='utf-8').write(ss)
print('OK: ActivityService.publish setzt jetzt status=active')

# ============================================================
# 2) Backend /publish endpoint: tolerant fuer beide Werte
# ============================================================
ap = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/activities.ts'
asrc = open(ap, 'r', encoding='utf-8').read()

old_check = "const wasPaused = orig?.status === 'paused'\n      const isNowActive = (result as any)?.status === 'active'"
new_check = "const wasPaused = orig?.status === 'paused'\n      const newSt = (result as any)?.status\n      const isNowActive = newSt === 'active' || newSt === 'published'"
if old_check in asrc:
    asrc = asrc.replace(old_check, new_check, 1)
    print('OK: /publish notification check accepts both active+published')
else:
    print('WARN: publish notification anchor not found')

# Same for PUT route — pause/resume detection
old_put = """const oldStatus = originalActivity.status
        const newStatus = (req.body as any).status
        const isPause = (oldStatus === 'active' || oldStatus === 'in_planning') && newStatus === 'paused'
        const isResume = oldStatus === 'paused' && (newStatus === 'active')"""
new_put = """const oldStatus = originalActivity.status
        const newStatus = (req.body as any).status
        const wasActive = oldStatus === 'active' || oldStatus === 'published' || oldStatus === 'in_planning'
        const willBeActive = newStatus === 'active' || newStatus === 'published'
        const isPause = wasActive && newStatus === 'paused'
        const isResume = oldStatus === 'paused' && willBeActive"""
if old_put in asrc:
    asrc = asrc.replace(old_put, new_put, 1)
    print('OK: PUT pause/resume detection accepts both active+published')
else:
    print('WARN: PUT pause/resume anchor not found')

open(ap, 'w', encoding='utf-8').write(asrc)

# ============================================================
# 3) Frontend Menu: nutze statusOf(a) statt a.status direkt
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
fs = open(fp, 'r', encoding='utf-8').read()

old_menu = """      var current = a.status || 'in_planning';
      var options = [];"""
new_menu = """      var current = (typeof statusOf === 'function') ? statusOf(a) : (a.status || 'in_planning');
      var options = [];"""
if old_menu not in fs:
    print('FAIL: menu current-status anchor not found'); exit(1)
fs = fs.replace(old_menu, new_menu, 1)
print('OK: menu uses statusOf(a) for consistent normalization')

# Also: status display in modal "Status aktuell: ..." line uses `current` already; keep.

# ============================================================
# 4) Kurs-Detail status pill: normalize ebenfalls
# ============================================================
old_kd_status = """    if (a.status === 'paused') { statusEl.textContent = 'Pausiert'; statusEl.className = 'pill pill-pending'; }
    else if (a.status === 'archived' || a.status === 'cancelled') { statusEl.textContent = 'Archiviert'; statusEl.className = 'pill'; }
    else { statusEl.textContent = 'Aktiv'; statusEl.className = 'pill pill-ok'; }"""
new_kd_status = """    if (a.status === 'paused') { statusEl.textContent = 'Pausiert'; statusEl.className = 'pill pill-pending'; }
    else if (a.status === 'archived' || a.status === 'cancelled') { statusEl.textContent = 'Archiviert'; statusEl.className = 'pill'; }
    else if (a.status === 'planning' || a.status === 'draft' || a.status === 'in_planning') { statusEl.textContent = 'In Planung'; statusEl.className = 'pill pill-pending'; }
    else { statusEl.textContent = 'Aktiv'; statusEl.className = 'pill pill-ok'; }"""
if old_kd_status in fs:
    fs = fs.replace(old_kd_status, new_kd_status, 1)
    print('OK: kurs-detail status pill normalized')

# Kurs-Detail TogglePause: should also accept published as active
old_toggle = "    var newStatus = a.status === 'paused' ? 'active' : 'paused';"
new_toggle = "    var isCurrentlyActive = a.status !== 'paused' && a.status !== 'archived' && a.status !== 'cancelled';\n    var newStatus = isCurrentlyActive ? 'paused' : 'active';"
if old_toggle in fs:
    fs = fs.replace(old_toggle, new_toggle, 1)
    print('OK: __kdTogglePause normalizes published-as-active')

# Kurs-Detail Pause-Label
old_pause_lbl = "    document.getElementById('phKdPauseLabel').textContent = a.status === 'paused' ? 'Kurs aktivieren' : 'Kurs pausieren';"
new_pause_lbl = "    document.getElementById('phKdPauseLabel').textContent = (a.status === 'paused') ? 'Kurs aktivieren' : 'Kurs pausieren';"
# Already correct, leave; but ensure label "Wieder aktivieren" for paused state in settings tab
old_settings_btn = "+ '<button class=\"btn btn-ghost btn-sm\" onclick=\"window.__kdTogglePause()\">' + (a.status === 'paused' ? 'Wieder aktivieren' : 'Kurs pausieren') + '</button></div>'"
# this is already right, skip

open(fp, 'w', encoding='utf-8').write(fs)
print('All patches applied.')
