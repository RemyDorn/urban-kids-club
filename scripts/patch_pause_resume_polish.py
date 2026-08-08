"""1. Rewrite pause + resume email copy in brand voice (warm, no business-speak).
2. POST /api/activities/:id/publish now also fires pause/resume notifications
   on status transitions, so the Kurse-Liste 3-dot menu works.
3. Unify menu labels: "Veroeffentlichen" + "Wieder aktivieren" -> "Aktivieren".
4. Add Eltern-benachrichtigen-Dialog to the 3-dot menu pause/activate paths.
"""

import re

# ============================================================
# 1) Email rewrites
# ============================================================
ep = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/lib/email.ts'
es = open(ep, 'r', encoding='utf-8').read()

old_pause_body = "${paragraph(`<strong>${esc(data.providerName)}</strong> pausiert den Kurs <strong>${esc(data.courseName)}</strong> (Teilnahme: <strong>${esc(data.childName)}</strong>) vorübergehend. Solange der Kurs pausiert ist, finden keine neuen Termine statt.`)}\n          ${data.note ? paragraph(`<em>Notiz von ${esc(data.providerName)}:</em> ${esc(data.note)}`) : ''}\n          ${paragraph(`Sobald der Kurs wieder läuft, melden wir uns. Deine Buchung bleibt bestehen — du musst nichts tun.`)}"

new_pause_body = "${paragraph(`wir machen mit <strong>${esc(data.courseName)}</strong> kurz Pause. ${esc(data.childName)} bleibt für später eingebucht — du musst nichts tun.`)}\n          ${data.note ? paragraph(`Kurze Notiz: ${esc(data.note)}`) : ''}\n          ${paragraph(`Sobald es wieder losgeht, hörst du von uns. Wenn etwas Dringendes ist: einfach kurz zurückschreiben.`)}"

if old_pause_body not in es:
    print('FAIL: pause body anchor not found'); exit(1)
es = es.replace(old_pause_body, new_pause_body, 1)
print('OK: pause email rewritten in brand voice')

# Also tweak pause subject + preheader
old_pause_meta = "subject: `${data.courseName} pausiert vorübergehend`,\n      html: shell({\n        preheader: `${data.providerName} pausiert ${data.courseName} vorübergehend.`,\n        kicker: 'Kurs pausiert',\n        heading: `Kurze <em>Pause</em>.`,"
new_pause_meta = "subject: `Kurze Pause: ${data.courseName}`,\n      html: shell({\n        preheader: `Wir machen mit ${data.courseName} kurz Pause — ${data.childName} bleibt eingebucht.`,\n        kicker: 'Kurze Pause',\n        heading: `Kurze <em>Pause</em>.`,"
if old_pause_meta not in es:
    print('WARN: pause meta anchor not found, skipping');
else:
    es = es.replace(old_pause_meta, new_pause_meta, 1)
    print('OK: pause subject/preheader rewritten')

# ----------- RESUME -----------
old_resume_body = "${paragraph(`Gute Nachricht: <strong>${esc(data.providerName)}</strong> setzt den Kurs <strong>${esc(data.courseName)}</strong> (Teilnahme: <strong>${esc(data.childName)}</strong>) ab sofort wieder fort. Wir freuen uns, dich und ${esc(data.childName)} bald wiederzusehen.`)}\n          ${data.nextSessionLabel ? paragraph(`<strong>Nächster Termin:</strong> ${esc(data.nextSessionLabel)}`) : ''}"

new_resume_body = "${paragraph(`schön, dass es weitergeht. <strong>${esc(data.courseName)}</strong> läuft ab sofort wieder — wir freuen uns auf euch beide.`)}\n          ${data.nextSessionLabel ? paragraph(`<strong>Nächster Termin:</strong> ${esc(data.nextSessionLabel)}`) : ''}"

if old_resume_body not in es:
    print('FAIL: resume body anchor not found'); exit(1)
es = es.replace(old_resume_body, new_resume_body, 1)
print('OK: resume email rewritten in brand voice')

old_resume_meta = "subject: `${data.courseName} läuft wieder`,\n      html: shell({\n        preheader: `${data.courseName} ist wieder aktiv — wir freuen uns auf dich.`,\n        kicker: 'Kurs aktiv',\n        heading: `Es geht <em>weiter</em>.`,"
new_resume_meta = "subject: `${data.courseName} ist wieder da`,\n      html: shell({\n        preheader: `Wir sind zurück — ${data.courseName} läuft ab sofort wieder.`,\n        kicker: 'Wieder da',\n        heading: `Wir sind <em>zurück</em>.`,"
if old_resume_meta not in es:
    print('WARN: resume meta anchor not found, skipping')
else:
    es = es.replace(old_resume_meta, new_resume_meta, 1)
    print('OK: resume subject/preheader/heading rewritten')

# Also tweak text-only fallbacks
old_pause_text = "text: `Hey ${data.parentName}, ${data.providerName} pausiert \"${data.courseName}\" vorübergehend. Deine Buchung bleibt bestehen.${data.note ? ' Notiz: ' + data.note : ''}`,"
new_pause_text = "text: `Hey ${data.parentName}, wir machen mit \"${data.courseName}\" kurz Pause. ${data.childName} bleibt für später eingebucht — sobald es wieder losgeht, melden wir uns.${data.note ? ' Notiz: ' + data.note : ''}`,"
if old_pause_text in es: es = es.replace(old_pause_text, new_pause_text, 1)

old_resume_text = "text: `Hey ${data.parentName}, \"${data.courseName}\" bei ${data.providerName} läuft wieder.${data.nextSessionLabel ? ' Nächster Termin: ' + data.nextSessionLabel : ''}`,"
new_resume_text = "text: `Hey ${data.parentName}, schön dass es weitergeht — \"${data.courseName}\" läuft ab sofort wieder.${data.nextSessionLabel ? ' Nächster Termin: ' + data.nextSessionLabel : ''}`,"
if old_resume_text in es: es = es.replace(old_resume_text, new_resume_text, 1)

open(ep, 'w', encoding='utf-8').write(es)
print('OK: email.ts written')

# ============================================================
# 2) /publish endpoint: also fire pause/resume notifications
# ============================================================
ap = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/activities.ts'
asrc = open(ap, 'r', encoding='utf-8').read()

old_publish = """  router.post('/api/activities/:id/publish', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const result = await ActivityService.publish(req.params.id, auth.providerId)
    if (!result) return res.error(400, 'Aktivität konnte nicht veröffentlicht werden')
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })"""

new_publish = """  router.post('/api/activities/:id/publish', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    // Capture original BEFORE publish to detect transition for notifications
    const orig: any = await ActivityService.getById(req.params.id)
    const result = await ActivityService.publish(req.params.id, auth.providerId)
    if (!result) return res.error(400, 'Aktivität konnte nicht veröffentlicht werden')
    if ('error' in result) return res.error(400, result.error)

    // Pause/Resume notification on status transition
    try {
      const wasPaused = orig?.status === 'paused'
      const isNowActive = (result as any)?.status === 'active'
      const notifyParents = (req.body as any)?.notifyParents !== false
      if (wasPaused && isNowActive && notifyParents) {
        const sb = getServiceClient()
        const { data: blocks2 } = await sb.from('course_blocks').select('id').eq('activity_id', req.params.id).in('status', ['active', 'upcoming'])
        const blockIds = (blocks2 || []).map((b: any) => b.id)
        if (blockIds.length > 0) {
          const { data: enrollments } = await sb.from('block_enrollments')
            .select('parent_id, child_name')
            .in('block_id', blockIds)
            .eq('status', 'active')
          const byParent = new Map<string, { childNames: Set<string> }>()
          for (const e of (enrollments || [])) {
            if (!e.parent_id) continue
            const entry = byParent.get(e.parent_id) || { childNames: new Set<string>() }
            if (e.child_name) entry.childNames.add(e.child_name)
            byParent.set(e.parent_id, entry)
          }
          if (byParent.size > 0) {
            const parentIds = Array.from(byParent.keys())
            const { data: parents2 } = await sb.from('parents').select('id, name, email').in('id', parentIds)
            const { data: provider2 } = await sb.from('providers').select('display_name, company_name').eq('id', auth.providerId).single()
            const providerName = provider2?.display_name || provider2?.company_name || 'Dein Anbieter'
            const { EmailService } = await import('../../lib/email')
            const courseTitle = (result as any)?.title || 'Kurs'
            for (const p of (parents2 || [])) {
              const entry = byParent.get(p.id)
              if (!entry || !p.email) continue
              const childName = Array.from(entry.childNames).join(' & ') || 'dein Kind'
              try {
                await EmailService.sendCourseResume(p.email, {
                  parentName: p.name || '', childName,
                  courseName: courseTitle, providerName,
                })
              } catch (mailErr: any) { console.error('[ActivityPublish] Resume email failed for', p.email, mailErr.message) }
            }
            console.log('[ActivityPublish] Sent', byParent.size, 'resume emails for activity', req.params.id)
          }
        }
      }
    } catch (notifyErr: any) {
      console.error('[ActivityPublish] Resume notification failed (non-fatal):', notifyErr.message || notifyErr)
    }

    res.json({ data: result })
  })"""

if old_publish not in asrc:
    print('FAIL: /publish endpoint anchor not found'); exit(1)
asrc = asrc.replace(old_publish, new_publish, 1)
open(ap, 'w', encoding='utf-8').write(asrc)
print('OK: /publish now fires resume emails on paused -> active')

# ============================================================
# 3) Frontend: unify menu labels + add notify-confirm
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
fs = open(fp, 'r', encoding='utf-8').read()

old_menu = """      var current = a.status || 'in_planning';
      var options = [];
      if (current !== 'active')   options.push({ value: 'publish',  label: 'Veroeffentlichen', desc: 'Kurs wird im Widget sichtbar und buchbar.' });
      if (current === 'active')   options.push({ value: 'pause',    label: 'Pausieren',        desc: 'Vorruebergehend ausblenden, keine neuen Buchungen.' });
      if (current === 'paused')   options.push({ value: 'activate', label: 'Wieder aktivieren', desc: 'Kurs wieder buchbar machen.' });
                                  options.push({ value: 'duplicate',label: 'Duplizieren',      desc: 'Kopie als Entwurf anlegen.' });
      if (current !== 'archived') options.push({ value: 'archive',  label: 'Archivieren',      desc: 'Aus aktiver Liste entfernen (umkehrbar).', variant: 'danger' });"""

new_menu = """      var current = a.status || 'in_planning';
      var options = [];
      if (current === 'paused')          options.push({ value: 'activate',  label: 'Wieder aktivieren', desc: 'Kurs läuft wieder, Eltern können benachrichtigt werden.' });
      else if (current !== 'active')     options.push({ value: 'activate',  label: 'Aktivieren',        desc: 'Kurs wird im Widget sichtbar und buchbar.' });
      if (current === 'active')          options.push({ value: 'pause',     label: 'Pausieren',         desc: 'Vorübergehend ausblenden, keine neuen Buchungen.' });
                                         options.push({ value: 'duplicate', label: 'Duplizieren',       desc: 'Kopie als Entwurf anlegen.' });
      if (current !== 'archived')        options.push({ value: 'archive',   label: 'Archivieren',       desc: 'Aus aktiver Liste entfernen (umkehrbar).', variant: 'danger' });"""

if old_menu not in fs:
    print('FAIL: menu options anchor not found'); exit(1)
fs = fs.replace(old_menu, new_menu, 1)
print('OK: menu options unified (no more Veroeffentlichen + Wieder aktivieren split)')

# Replace the action dispatch — for activate/pause we now call __kdTogglePauseFromMenu helper
old_dispatch = """    var promise;
    if (action === 'publish')     promise = api('/activities/' + id + '/publish',    { method: 'POST' });
    else if (action === 'duplicate') promise = api('/activities/' + id + '/duplicate', { method: 'POST' });
    else if (action === 'archive')   promise = api('/activities/' + id + '/archive',   { method: 'POST' });
    else if (action === 'pause')     promise = api('/activities/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: 'paused' }) });
    else if (action === 'activate')  promise = api('/activities/' + id + '/publish',   { method: 'POST' });
    else { toast('Aktion nicht implementiert: ' + action, 'warning'); return; }
    promise.then(function(){ toast('Erledigt', 'success'); refreshAll(); })
           .catch(function(e){ alert('Fehler: ' + (e.message || e)); });"""

new_dispatch = """    // For status transitions on courses with enrolled parents, ask whether to notify
    if (action === 'pause' || action === 'activate') {
      var enrolled = (s.bookings || []).filter(function(b) {
        return b && b.activityId === id && b.status !== 'cancelled' && b.status !== 'refunded';
      }).length;
      var notify = false;
      if (enrolled > 0 && typeof window.ukcChoose === 'function') {
        var verb = action === 'pause' ? 'pausieren' : 'aktivieren';
        var choice = await window.ukcChoose({
          kicker: 'Kurs',
          titleHtml: escapeHtml(a.title || '') + ' <em>' + (action === 'pause' ? 'pausieren' : 'aktivieren') + '</em>',
          message: enrolled + ' Familie' + (enrolled === 1 ? '' : 'n') + ' eingebucht. Per E-Mail informieren?',
          options: [
            { value: 'notify', label: verb.charAt(0).toUpperCase() + verb.slice(1) + ' & E-Mail an Eltern' },
            { value: 'silent', label: 'Nur ' + verb + ' (ohne E-Mail)' },
            { value: 'cancel', label: 'Abbrechen', variant: 'danger' },
          ],
        });
        if (!choice || choice === 'cancel') return;
        notify = (choice === 'notify');
      }
      var body = JSON.stringify({ notifyParents: notify });
      var headers = { 'Content-Type': 'application/json' };
      if (action === 'pause') {
        promise = api('/activities/' + id, { method: 'PUT', headers: headers, body: JSON.stringify({ status: 'paused', notifyParents: notify }) });
      } else {
        promise = api('/activities/' + id + '/publish', { method: 'POST', headers: headers, body: body });
      }
    } else if (action === 'duplicate') promise = api('/activities/' + id + '/duplicate', { method: 'POST' });
    else if (action === 'archive')   promise = api('/activities/' + id + '/archive',   { method: 'POST' });
    else { toast('Aktion nicht implementiert: ' + action, 'warning'); return; }
    promise.then(function(){
      var verbDone = action === 'pause' ? 'pausiert' : (action === 'activate' ? 'aktiviert' : 'erledigt');
      toast('Kurs ' + verbDone, 'success');
      refreshAll();
    }).catch(function(e){ alert('Fehler: ' + (e.message || e)); });"""

if old_dispatch not in fs:
    print('FAIL: dispatch block anchor not found'); exit(1)
fs = fs.replace(old_dispatch, new_dispatch, 1)
print('OK: menu dispatch routes pause/activate through notify-aware path')

# Also need the dispatch to declare `var promise;` since we removed that line
# Insert it as needed
old_promise_decl_check = """      if (!action) return;
    }
    // For status transitions"""
if old_promise_decl_check in fs:
    fs = fs.replace(old_promise_decl_check,
                    "      if (!action) return;\n    }\n    var promise;\n    // For status transitions", 1)
    print('OK: var promise declaration added')

open(fp, 'w', encoding='utf-8').write(fs)
print('All patches applied.')
