"""Add pause/resume notifications:
1. New EmailService.sendCoursePause + sendCourseResume templates
2. PUT /api/activities/:id detects status: active <-> paused transitions and
   sends emails to enrolled parents when body.notifyParents !== false
3. Frontend: __kdTogglePause prompts for "Eltern benachrichtigen?" and
   includes the choice in PUT body
"""

import re

# ============================================================
# 1) Add email templates
# ============================================================
ep = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/lib/email.ts'
es = open(ep, 'r', encoding='utf-8').read()

NEW_METHODS = '''  async sendCoursePause(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    note?: string
    portalUrl?: string
  }): Promise<EmailResult> {
    return this.send({
      to,
      subject: `${data.courseName} pausiert vorübergehend`,
      html: shell({
        preheader: `${data.providerName} pausiert ${data.courseName} vorübergehend.`,
        kicker: 'Kurs pausiert',
        heading: `Kurze <em>Pause</em>.`,
        accent: 'sage',
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`<strong>${esc(data.providerName)}</strong> pausiert den Kurs <strong>${esc(data.courseName)}</strong> (Teilnahme: <strong>${esc(data.childName)}</strong>) vorübergehend. Solange der Kurs pausiert ist, finden keine neuen Termine statt.`)}
          ${data.note ? paragraph(`<em>Notiz von ${esc(data.providerName)}:</em> ${esc(data.note)}`) : ''}
          ${paragraph(`Sobald der Kurs wieder läuft, melden wir uns. Deine Buchung bleibt bestehen — du musst nichts tun.`)}
          ${data.portalUrl ? portalButton(data.portalUrl, 'Zu deinen Kursen') : ''}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName}, ${data.providerName} pausiert "${data.courseName}" vorübergehend. Deine Buchung bleibt bestehen.${data.note ? ' Notiz: ' + data.note : ''}`,
    })
  },

  async sendCourseResume(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    nextSessionLabel?: string
    portalUrl?: string
  }): Promise<EmailResult> {
    return this.send({
      to,
      subject: `${data.courseName} läuft wieder`,
      html: shell({
        preheader: `${data.courseName} ist wieder aktiv — wir freuen uns auf dich.`,
        kicker: 'Kurs aktiv',
        heading: `Es geht <em>weiter</em>.`,
        accent: 'primary',
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`Gute Nachricht: <strong>${esc(data.providerName)}</strong> setzt den Kurs <strong>${esc(data.courseName)}</strong> (Teilnahme: <strong>${esc(data.childName)}</strong>) ab sofort wieder fort. Wir freuen uns, dich und ${esc(data.childName)} bald wiederzusehen.`)}
          ${data.nextSessionLabel ? paragraph(`<strong>Nächster Termin:</strong> ${esc(data.nextSessionLabel)}`) : ''}
          ${data.portalUrl ? portalButton(data.portalUrl, 'Zu deinen Kursen') : ''}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName}, "${data.courseName}" bei ${data.providerName} läuft wieder.${data.nextSessionLabel ? ' Nächster Termin: ' + data.nextSessionLabel : ''}`,
    })
  },

'''

# Insert before sendCourseUpdate
anchor = "  async sendCourseUpdate(to: string, data: {"
if anchor not in es:
    print('FAIL: sendCourseUpdate anchor not found'); exit(1)
es = es.replace(anchor, NEW_METHODS + anchor, 1)
open(ep, 'w', encoding='utf-8').write(es)
print('OK: sendCoursePause + sendCourseResume added to EmailService')

# ============================================================
# 2) Backend PUT handler: dispatch on status transition
# ============================================================
ap = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/activities.ts'
asrc = open(ap, 'r', encoding='utf-8').read()

# Insert just before the existing edit-notification email block; keep both blocks side by side
PAUSE_BLOCK = '''
    // Status transition notifications (pause/resume) — separate from generic update
    try {
      if (req.body?.notifyParents !== false && originalActivity && (req.body as any)?.status && (req.body as any).status !== originalActivity.status) {
        const oldStatus = originalActivity.status
        const newStatus = (req.body as any).status
        const isPause = (oldStatus === 'active' || oldStatus === 'in_planning') && newStatus === 'paused'
        const isResume = oldStatus === 'paused' && (newStatus === 'active')
        if (isPause || isResume) {
          const sb3 = getServiceClient()
          const { data: blocksST } = await sb3.from('course_blocks').select('id').eq('activity_id', req.params.id).in('status', ['active', 'upcoming'])
          const blockIdsST = (blocksST || []).map((b: any) => b.id)
          if (blockIdsST.length > 0) {
            const { data: enrollmentsST } = await sb3.from('block_enrollments')
              .select('parent_id, child_name')
              .in('block_id', blockIdsST)
              .eq('status', 'active')
            const byParentST = new Map<string, { childNames: Set<string> }>()
            for (const e of (enrollmentsST || [])) {
              if (!e.parent_id) continue
              const entry = byParentST.get(e.parent_id) || { childNames: new Set<string>() }
              if (e.child_name) entry.childNames.add(e.child_name)
              byParentST.set(e.parent_id, entry)
            }
            if (byParentST.size > 0) {
              const parentIdsST = Array.from(byParentST.keys())
              const { data: parentsST } = await sb3.from('parents').select('id, name, email').in('id', parentIdsST)
              const { data: providerST } = await sb3.from('providers').select('display_name, company_name').eq('id', auth.providerId).single()
              const providerNameST = providerST?.display_name || providerST?.company_name || 'Dein Anbieter'
              const { EmailService } = await import('../../lib/email')
              const courseTitle = (activity as any)?.title || 'Kurs'
              for (const p of (parentsST || [])) {
                const entry = byParentST.get(p.id)
                if (!entry || !p.email) continue
                const childName = Array.from(entry.childNames).join(' & ') || 'dein Kind'
                try {
                  if (isPause) {
                    await EmailService.sendCoursePause(p.email, {
                      parentName: p.name || '',
                      childName, courseName: courseTitle, providerName: providerNameST,
                      note: (req.body as any)?.pauseNote,
                    })
                  } else {
                    await EmailService.sendCourseResume(p.email, {
                      parentName: p.name || '',
                      childName, courseName: courseTitle, providerName: providerNameST,
                    })
                  }
                } catch (mailErr: any) {
                  console.error('[ActivityPUT] Pause/Resume email failed for', p.email, mailErr.message)
                }
              }
              console.log('[ActivityPUT] Sent', byParentST.size, (isPause ? 'pause' : 'resume'), 'emails for activity', req.params.id)
            }
          }
        }
      }
    } catch (statusErr: any) {
      console.error('[ActivityPUT] Pause/Resume notification failed (non-fatal):', statusErr.message || statusErr)
    }
'''

# Find a good insertion point: just before "// Notify enrolled parents about the change (best-effort, non-blocking)"
notify_anchor = "    // Notify enrolled parents about the change (best-effort, non-blocking)"
if notify_anchor not in asrc:
    print('FAIL: notify-block anchor not found'); exit(1)
asrc = asrc.replace(notify_anchor, PAUSE_BLOCK + "\n" + notify_anchor, 1)
open(ap, 'w', encoding='utf-8').write(asrc)
print('OK: PUT route now sends pause/resume emails on status change')

# ============================================================
# 3) Frontend: __kdTogglePause asks for "Eltern benachrichtigen?"
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
fs = open(fp, 'r', encoding='utf-8').read()

old_pause = "  window.__kdTogglePause = function() {\n    var s = window.dashboardState; if (!s) return;\n    var a = (s.activities || []).find(function(x){ return x.id === window.__kdActiveId; });\n    if (!a) return;\n    var newStatus = a.status === 'paused' ? 'active' : 'paused';\n    var label = newStatus === 'paused' ? 'Pausieren' : 'Aktivieren';\n    var msg = newStatus === 'paused'\n      ? 'Den Kurs „' + a.title + '\" wirklich pausieren? Er wird im Widget verborgen.'\n      : 'Den Kurs „' + a.title + '\" wieder aktivieren?';\n    var go = function() {\n      a.status = newStatus;\n      window.__kdRender();\n      fetch('/api/activities/' + a.id, {\n        method: 'PUT',\n        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.token || '') },\n        body: JSON.stringify({ status: newStatus }),\n      }).then(function(r) {\n        if (!r.ok) throw new Error('Server-Fehler');\n        if (window.ukcToast) window.ukcToast('Kurs ' + (newStatus === 'paused' ? 'pausiert' : 'aktiviert'));\n      }).catch(function() {\n        a.status = newStatus === 'paused' ? 'active' : 'paused';\n        window.__kdRender();\n        alert('Konnte Status nicht ändern.');\n      });\n    };\n    if (typeof window.ukcConfirm === 'function') {\n      window.ukcConfirm({ title: label + '?', body: msg, confirmLabel: label }).then(function(ok) { if (ok) go(); });\n    } else {\n      if (confirm(msg)) go();\n    }\n  };"

new_pause = '''  window.__kdTogglePause = function() {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === window.__kdActiveId; });
    if (!a) return;
    var newStatus = a.status === 'paused' ? 'active' : 'paused';
    var verbInf = newStatus === 'paused' ? 'pausieren' : 'aktivieren';
    var verbDone = newStatus === 'paused' ? 'pausiert' : 'aktiviert';
    var enrolled = (s.bookings || []).filter(function(b) {
      return b && b.activityId === a.id && b.status !== 'cancelled' && b.status !== 'refunded';
    }).length;

    var go = function(notifyParents) {
      a.status = newStatus;
      window.__kdRender();
      fetch('/api/activities/' + a.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.token || '') },
        body: JSON.stringify({ status: newStatus, notifyParents: notifyParents }),
      }).then(function(r) {
        if (!r.ok) throw new Error('Server-Fehler');
        if (window.ukcToast) {
          var note = notifyParents && enrolled > 0 ? ' · ' + enrolled + ' Eltern benachrichtigt' : '';
          window.ukcToast('Kurs ' + verbDone + note);
        }
      }).catch(function() {
        a.status = newStatus === 'paused' ? 'active' : 'paused';
        window.__kdRender();
        alert('Konnte Status nicht ändern.');
      });
    };

    var heading = newStatus === 'paused' ? 'Kurs pausieren?' : 'Kurs wieder aktivieren?';
    var bodyLead = newStatus === 'paused'
      ? 'Der Kurs <strong>' + a.title + '</strong> wird im Widget verborgen. Bestehende Buchungen bleiben gültig.'
      : 'Der Kurs <strong>' + a.title + '</strong> wird im Widget wieder sichtbar und neu buchbar.';

    if (enrolled === 0) {
      // Niemand eingebucht -> einfacher Confirm
      if (typeof window.ukcConfirm === 'function') {
        window.ukcConfirm({ title: heading, body: bodyLead, confirmLabel: verbInf.charAt(0).toUpperCase() + verbInf.slice(1) }).then(function(ok) { if (ok) go(false); });
      } else {
        if (confirm(heading)) go(false);
      }
      return;
    }

    // Mit eingebuchten Eltern: 3-Wege-Dialog
    if (typeof window.ukcChoose === 'function') {
      window.ukcChoose({
        title: heading,
        body: bodyLead + '<br><br>Es sind aktuell <strong>' + enrolled + ' Familie' + (enrolled === 1 ? '' : 'n') + '</strong> eingebucht. Sollen wir sie per E-Mail informieren?',
        choices: [
          { id: 'notify', label: verbInf.charAt(0).toUpperCase() + verbInf.slice(1) + ' & E-Mail an Eltern', tone: 'primary' },
          { id: 'silent', label: 'Nur ' + verbInf + ' (ohne E-Mail)', tone: 'ghost' },
          { id: 'cancel', label: 'Abbrechen', tone: 'ghost' },
        ],
      }).then(function(choice) {
        if (choice === 'notify') go(true);
        else if (choice === 'silent') go(false);
      });
    } else if (typeof window.ukcConfirm === 'function') {
      window.ukcConfirm({
        title: heading,
        body: bodyLead + '<br><br><strong>' + enrolled + ' Familie' + (enrolled === 1 ? '' : 'n') + '</strong> wird/werden per E-Mail informiert.',
        confirmLabel: verbInf.charAt(0).toUpperCase() + verbInf.slice(1) + ' & benachrichtigen',
      }).then(function(ok) { if (ok) go(true); });
    } else {
      var notify = confirm(enrolled + ' Eltern per E-Mail informieren? OK = ja, Abbrechen = nur Status ändern.');
      go(notify);
    }
  };'''

if old_pause not in fs:
    print('FAIL: __kdTogglePause exact match not found'); exit(1)
fs = fs.replace(old_pause, new_pause, 1)
open(fp, 'w', encoding='utf-8').write(fs)
print('OK: __kdTogglePause asks for E-Mail-Benachrichtigung')
print('All patches applied.')
