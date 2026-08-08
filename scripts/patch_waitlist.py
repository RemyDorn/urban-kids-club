"""Wire the Warteliste fully into the dashboard:

Backend:
1. GET /api/activities/:id/waitlist enriches each entry with parent
   name/email + computed child label.
2. POST /api/waitlist/:id/offer uses display_name (Brand) instead of
   company_name.

Frontend:
3. __kdLoadDeps loads waitlist and caches in state.waitlistByActivity.
4. KPI 'Warteliste' shows real count + freshest entry hint.
5. __kdRenderTab('warteliste') renders a real table with Anbieten/Entfernen
   actions.
6. __kdOfferSpot + __kdDeclineWaitlist call the existing API endpoints.
"""

import re

# ============================================================
# 1) Backend: enrich GET /api/activities/:id/waitlist with parent info
# ============================================================
wp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/waitlist.ts'
ws = open(wp, 'r', encoding='utf-8').read()

old_get = """  router.get('/api/activities/:activityId/waitlist', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const courseBlockId = req.query.courseBlockId
    let entries
    if (courseBlockId && typeof WaitlistService.listByCourseBlock === 'function') {
      entries = await WaitlistService.listByCourseBlock(courseBlockId)
    } else {
      entries = await WaitlistService.listByActivity(req.params.activityId)
    }
    res.json({ data: entries, count: entries.length })
  })"""

new_get = """  router.get('/api/activities/:activityId/waitlist', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const courseBlockId = req.query.courseBlockId
    let entries: any[]
    if (courseBlockId && typeof WaitlistService.listByCourseBlock === 'function') {
      entries = await WaitlistService.listByCourseBlock(courseBlockId)
    } else {
      entries = await WaitlistService.listByActivity(req.params.activityId)
    }
    // Enrich with parent info (name/email)
    const parentIds = [...new Set(entries.map((e: any) => e.parentId).filter(Boolean))]
    if (parentIds.length > 0) {
      const sb = getServiceClient()
      const { data: parents } = await sb.from('parents').select('id, name, email, phone').in('id', parentIds)
      const pMap = new Map<string, any>()
      for (const p of (parents ?? [])) pMap.set(p.id, p)
      entries = entries.map((e: any) => {
        const p = pMap.get(e.parentId)
        return {
          ...e,
          parentName: p?.name || '',
          parentEmail: p?.email || '',
          parentPhone: p?.phone || '',
        }
      })
    }
    res.json({ data: entries, count: entries.length })
  })"""

if old_get not in ws:
    print('FAIL: GET waitlist anchor not found'); exit(1)
ws = ws.replace(old_get, new_get, 1)
print('OK: GET /api/activities/:id/waitlist enriched with parent info')

# Also fix offer email to use display_name
old_provider_offer = "const { data: provider } = await db.from('providers').select('company_name, slug').eq('id', auth.providerId).single()"
new_provider_offer = "const { data: provider } = await db.from('providers').select('display_name, company_name, slug').eq('id', auth.providerId).single()"
if old_provider_offer in ws:
    ws = ws.replace(old_provider_offer, new_provider_offer, 1)
    print('OK: offer endpoint queries display_name')

old_provname = "providerName: provider?.company_name || '',"
new_provname = "providerName: provider?.display_name || provider?.company_name || '',"
if old_provname in ws:
    ws = ws.replace(old_provname, new_provname, 1)
    print('OK: offer email uses display_name fallback')

open(wp, 'w', encoding='utf-8').write(ws)

# ============================================================
# 2) Frontend: hook waitlist into Kurs-Detail
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
fs = open(fp, 'r', encoding='utf-8').read()

# 2a. Add waitlist load to __kdLoadDeps
old_deps = """    await Promise.all(jobs);
    // After course-blocks, load sessions for this activity's block(s)"""
new_deps = """    await Promise.all(jobs);
    // Load waitlist (separate per activity, cached)
    if (!s.waitlistByActivity) s.waitlistByActivity = {};
    if (!s.waitlistByActivity[activityId]) {
      try {
        var wr = await s.api('/activities/' + activityId + '/waitlist');
        s.waitlistByActivity[activityId] = wr.data || wr.entries || wr || [];
      } catch (e) { s.waitlistByActivity[activityId] = []; }
    }
    // After course-blocks, load sessions for this activity's block(s)"""
if old_deps not in fs:
    print('FAIL: __kdLoadDeps anchor not found'); exit(1)
fs = fs.replace(old_deps, new_deps, 1)
print('OK: __kdLoadDeps loads waitlist')

# 2b. Replace KPI rendering for waitlist + tab count
old_kpi = """    document.getElementById('phKdKpiWait').innerHTML = '0 <em>offen</em>';
    document.getElementById('phKdKpiWaitDelta').textContent = a.waitlistEnabled ? 'Warteliste aktiv' : 'Warteliste deaktiviert';"""
new_kpi = """    var wlEntries = (s.waitlistByActivity && s.waitlistByActivity[a.id]) || [];
    var wlOpen = wlEntries.filter(function(w) { return w.status === 'waiting'; }).length;
    var wlOffered = wlEntries.filter(function(w) { return w.status === 'offered'; }).length;
    document.getElementById('phKdKpiWait').innerHTML = wlOpen + ' <em>offen</em>';
    if (wlEntries.length === 0) {
      document.getElementById('phKdKpiWaitDelta').textContent = a.waitlistEnabled ? 'Warteliste aktiv · noch keine Anfragen' : 'Warteliste deaktiviert';
    } else if (wlOffered > 0) {
      document.getElementById('phKdKpiWaitDelta').textContent = wlOffered + ' Angebot' + (wlOffered === 1 ? '' : 'e') + ' versendet';
    } else {
      var newest = wlEntries.slice().sort(function(a,b){ return new Date(b.addedAt || 0) - new Date(a.addedAt || 0); })[0];
      document.getElementById('phKdKpiWaitDelta').textContent = newest ? ('zuletzt: ' + window.__kdRelTime(newest.addedAt)) : '—';
    }"""
if old_kpi not in fs:
    print('FAIL: waitlist KPI anchor not found'); exit(1)
fs = fs.replace(old_kpi, new_kpi, 1)
print('OK: waitlist KPI shows real count + delta')

# 2c. Update tab count
old_tabcnt = "document.getElementById('phKdTabCntWarteliste').textContent = '0';"
new_tabcnt = "document.getElementById('phKdTabCntWarteliste').textContent = (wlOpen + wlOffered) || '0';"
if old_tabcnt not in fs:
    print('FAIL: waitlist tab count anchor not found'); exit(1)
fs = fs.replace(old_tabcnt, new_tabcnt, 1)
print('OK: waitlist tab count uses real data')

# 2d. Replace tab content render for warteliste
old_wl_pane = """    if (key === 'warteliste') {
      pane.innerHTML = '<div class="card"><div class="card-head"><div class="card-title">Die <em>Warteliste</em></div></div>'
        + '<div class="empty-state"><div class="empty-state-title">Warteliste leer</div>'
        + '<div>Wenn der Kurs voll ist und Eltern sich melden, erscheinen sie hier. '
        + 'Du kannst per Klick auf <strong>Anbieten</strong> einen frei werdenden Platz weiterreichen.</div></div></div>';
      return;
    }"""

new_wl_pane = """    if (key === 'warteliste') {
      var wlList = (s.waitlistByActivity && s.waitlistByActivity[a.id]) || [];
      if (wlList.length === 0) {
        pane.innerHTML = '<div class="card"><div class="card-head"><div class="card-title">Die <em>Warteliste</em></div></div>'
          + '<div class="empty-state"><div class="empty-state-title">Warteliste leer</div>'
          + '<div>Wenn der Kurs voll ist und Eltern sich melden, erscheinen sie hier. '
          + 'Du kannst per Klick auf <strong>Anbieten</strong> einen frei werdenden Platz weiterreichen.</div></div></div>';
        return;
      }
      // Sort: waiting (oldest first) then offered (newest first)
      wlList = wlList.slice().sort(function(x, y) {
        var prio = function(e) { return e.status === 'waiting' ? 0 : (e.status === 'offered' ? 1 : 2); };
        var dp = prio(x) - prio(y);
        if (dp !== 0) return dp;
        return new Date(x.addedAt || 0) - new Date(y.addedAt || 0);
      });
      var rows = wlList.map(function(e, i) {
        var nm = e.parentName || '—';
        var ch = (e.child && (e.child.firstName || e.child.name)) || '—';
        if (e.child && e.child.firstName && e.child.lastName) ch = (e.child.firstName + ' ' + e.child.lastName).trim();
        var birthYear = e.child && (e.child.birthYear || e.child.year);
        var ageStr = birthYear ? ' (' + (new Date().getFullYear() - birthYear) + ' J.)' : '';
        var status = e.status || 'waiting';
        var pillCls = status === 'offered' ? 'pill-pending' : (status === 'waiting' ? 'pill-info' : '');
        var pillTxt = status === 'offered' ? 'ANGEBOTEN' : (status === 'waiting' ? 'WARTET' : status.toUpperCase());
        var actions = '';
        if (status === 'waiting') {
          actions = '<button class="btn btn-primary btn-sm" onclick="window.__kdOfferSpot(\\'' + e.id + '\\')">Platz anbieten</button>'
            + ' <button class="btn btn-ghost btn-sm" onclick="window.__kdDeclineWaitlist(\\'' + e.id + '\\')" style="color:var(--signal)">Entfernen</button>';
        } else if (status === 'offered') {
          var expLabel = e.expiresAt ? 'läuft ab: ' + window.__kdRelTime(e.expiresAt) : 'wartet auf Antwort';
          actions = '<span style="font-size:11px;color:var(--muted-2)">' + expLabel + '</span>'
            + ' <button class="btn btn-ghost btn-sm" onclick="window.__kdDeclineWaitlist(\\'' + e.id + '\\')" style="color:var(--signal)">Entfernen</button>';
        }
        return '<tr>'
          + '<td>' + (i + 1) + '</td>'
          + '<td>' + (window.escapeHtml ? window.escapeHtml(nm) : nm) + '<div style="font-size:11px;color:var(--muted-2)">' + (window.escapeHtml ? window.escapeHtml(e.parentEmail || '') : (e.parentEmail || '')) + '</div></td>'
          + '<td>' + (window.escapeHtml ? window.escapeHtml(ch) : ch) + ageStr + '</td>'
          + '<td>' + window.__kdRelTime(e.addedAt) + '</td>'
          + '<td><span class="pill ' + pillCls + '">' + pillTxt + '</span></td>'
          + '<td style="text-align:right;white-space:nowrap">' + actions + '</td>'
          + '</tr>';
      }).join('');
      pane.innerHTML = '<div class="card"><div class="card-head">'
        + '<div class="card-title">Die <em>Warteliste</em> · ' + wlList.length + '</div>'
        + '<div style="font-size:12px;color:var(--muted-2)">Sortiert: Wartend (älteste zuerst), dann Angebote</div>'
        + '</div>'
        + '<table class="data-table"><thead><tr><th>#</th><th>Eltern</th><th>Kind</th><th>Eingegangen</th><th>Status</th><th></th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
      return;
    }"""

if old_wl_pane not in fs:
    print('FAIL: waitlist pane anchor not found'); exit(1)
fs = fs.replace(old_wl_pane, new_wl_pane, 1)
print('OK: warteliste pane shows real entries with actions')

# 2e. Add __kdOfferSpot + __kdDeclineWaitlist helpers after __kdArchive
HELPERS = r'''
window.__kdOfferSpot = async function(entryId) {
  var s = window.dashboardState; if (!s) return;
  var go = async function() {
    try {
      var resp = await fetch('/api/waitlist/' + entryId + '/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.token || '') },
      });
      if (!resp.ok) {
        var err = await resp.json().catch(function() { return {}; });
        throw new Error(err.error || ('HTTP ' + resp.status));
      }
      // Update local cache: mark this entry as offered
      var wlList = (s.waitlistByActivity && s.waitlistByActivity[window.__kdActiveId]) || [];
      var entry = wlList.find(function(e) { return e.id === entryId; });
      if (entry) {
        entry.status = 'offered';
        entry.notifiedAt = new Date().toISOString();
        entry.expiresAt = new Date(Date.now() + 3*60*60*1000).toISOString();
      }
      window.__kdRender();
      if (window.ukcToast) window.ukcToast('Platz angeboten · E-Mail an Eltern raus');
    } catch (e) {
      alert('Fehler: ' + (e.message || e));
    }
  };
  if (typeof window.ukcConfirm === 'function') {
    window.ukcConfirm({
      title: 'Platz anbieten?',
      body: 'Wir schicken eine E-Mail mit Buchungslink. Die Eltern haben <strong>3 Stunden</strong>, um zuzusagen — danach geht das Angebot automatisch an die nächste Familie auf der Warteliste.',
      confirmLabel: 'Anbieten',
    }).then(function(ok) { if (ok) go(); });
  } else {
    if (confirm('Platz anbieten? E-Mail geht raus, Eltern haben 3 Stunden zum Zusagen.')) go();
  }
};

window.__kdDeclineWaitlist = async function(entryId) {
  var s = window.dashboardState; if (!s) return;
  var go = async function() {
    try {
      var resp = await fetch('/api/waitlist/' + entryId + '/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.token || '') },
      });
      if (!resp.ok) {
        var err = await resp.json().catch(function() { return {}; });
        throw new Error(err.error || ('HTTP ' + resp.status));
      }
      // Remove from local cache
      var wlList = (s.waitlistByActivity && s.waitlistByActivity[window.__kdActiveId]) || [];
      s.waitlistByActivity[window.__kdActiveId] = wlList.filter(function(e) { return e.id !== entryId; });
      window.__kdRender();
      if (window.ukcToast) window.ukcToast('Aus Warteliste entfernt');
    } catch (e) {
      alert('Fehler: ' + (e.message || e));
    }
  };
  if (typeof window.ukcConfirm === 'function') {
    window.ukcConfirm({
      title: 'Aus Warteliste entfernen?',
      body: 'Der Eintrag wird gelöscht. Die Eltern bekommen keine Benachrichtigung.',
      confirmLabel: 'Entfernen',
      destructive: true,
    }).then(function(ok) { if (ok) go(); });
  } else {
    if (confirm('Aus Warteliste entfernen?')) go();
  }
};
'''

# Insert after __kdArchive function definition
m = re.search(r"window\.__kdArchive = function\(\) \{[\s\S]*?\n  \};", fs)
if not m:
    print('FAIL: __kdArchive anchor not found'); exit(1)
fs = fs[:m.end()] + HELPERS + fs[m.end():]
print('OK: __kdOfferSpot + __kdDeclineWaitlist helpers added')

open(fp, 'w', encoding='utf-8').write(fs)
print('All patches applied.')
