"""1. Add EmailService.sendCourseUpdate(to, data) — branded update email with
   change-diff (what changed, old -> new value).
2. Hook PUT /api/activities/:id to compute the diff (title, schedule day/time,
   start/end date, capacity, price) and send the update email to every parent
   that has an active enrollment in any block of this activity.
"""

# ============================================================
# 1. Append sendCourseUpdate to EmailService
# ============================================================
ep = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/lib/email.ts'
es = open(ep, 'r', encoding='utf-8').read()

# Insert before the closing of EmailService object — find a stable anchor.
# Use the sendCancellation function as the anchor; we insert right after it.
anchor = """  async sendCancellation(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    refundInfo?: string
  }): Promise<EmailResult> {"""

new_method = """  // ------------------------------------------------------------
  // 12b. Kurs-Aenderung (Provider hat den Kurs editiert)
  // ------------------------------------------------------------
  async sendCourseUpdate(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    changes: Array<{ label: string; oldValue: string; newValue: string }>
    portalUrl?: string
  }): Promise<EmailResult> {
    if (!data.changes || data.changes.length === 0) {
      return { success: true, messageId: 'noop-empty-changes' }
    }
    const changeRows = data.changes.map(c =>
      `<tr>
        <td style=\"padding:10px 0;border-bottom:1px dashed rgba(217,108,69,0.18);width:130px;vertical-align:top;\">
          <div style=\"font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${THEME.primary};\">${esc(c.label)}</div>
        </td>
        <td style=\"padding:10px 0;border-bottom:1px dashed rgba(217,108,69,0.18);vertical-align:top;\">
          <div style=\"font-size:13px;color:${THEME.inkMuted};text-decoration:line-through;\">${esc(c.oldValue || '—')}</div>
          <div style=\"font-size:15px;font-weight:600;color:${THEME.ink};margin-top:3px;\">${esc(c.newValue || '—')}</div>
        </td>
      </tr>`
    ).join('')
    const changesBlock = `
      <div style=\"background:${THEME.surface};border:1px solid ${THEME.border};border-radius:14px;padding:6px 22px;margin:22px 0;box-shadow:0 1px 2px rgba(31,29,24,0.04);\">
        <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" width=\"100%\">
          ${changeRows}
        </table>
      </div>`

    return this.send({
      to,
      subject: `Hinweis: ${data.courseName} wurde aktualisiert`,
      html: shell({
        preheader: `${data.courseName} wurde von ${data.providerName} aktualisiert.`,
        kicker: 'Kurs aktualisiert',
        heading: `Es gibt eine <em>kleine Aenderung</em>.`,
        accent: 'sage',
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`<strong>${esc(data.providerName)}</strong> hat den Kurs <strong>${esc(data.courseName)}</strong> (Teilnahme: <strong>${esc(data.childName)}</strong>) angepasst. Hier auf einen Blick was sich geaendert hat:`)}
          ${changesBlock}
          ${paragraph(`Falls eine Aenderung fuer dich nicht passt, melde dich kurz bei ${esc(data.providerName)} — sie schauen mit dir nach einer Loesung.`)}
          ${data.portalUrl ? portalButton(data.portalUrl, 'Zu deinen Kursen') : ''}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName}, ${data.providerName} hat \"${data.courseName}\" angepasst. Aenderungen: ` + data.changes.map(c => `${c.label}: ${c.oldValue} -> ${c.newValue}`).join('; '),
    })
  },

  async sendCancellation(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    refundInfo?: string
  }): Promise<EmailResult> {"""

if anchor not in es:
    print('FAIL: sendCancellation anchor not found'); exit(1)
es = es.replace(anchor, new_method, 1)
open(ep, 'w', encoding='utf-8').write(es)
print('OK: sendCourseUpdate added to EmailService')

# ============================================================
# 2. Hook into PUT /api/activities/:id
# ============================================================
ap = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/activities.ts'
asrc = open(ap, 'r', encoding='utf-8').read()

# We want to diff BEFORE updating, so capture the original activity first.
# Insert "before-update" snapshot AND "after-update" notification.
# The PUT handler currently goes:
#   const allowed = whitelist
#   ...validation...
#   const activity = await ActivityService.update(req.params.id, allowed, auth.providerId)
#   ...sync block...
#   res.json({ data: activity })

# Step 2a: capture original BEFORE the update call.
old_pre = """    const activity = await ActivityService.update(req.params.id, allowed, auth.providerId)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')"""

new_pre = """    // Snapshot original activity for diff (sendCourseUpdate)
    const originalActivity: any = await ActivityService.getById(req.params.id)
    const activity = await ActivityService.update(req.params.id, allowed, auth.providerId)
    if (!activity) return res.error(404, 'Aktivität nicht gefunden')"""

if old_pre not in asrc:
    print('FAIL: PUT update anchor not found'); exit(1)
asrc = asrc.replace(old_pre, new_pre, 1)

# Step 2b: insert email-notification logic right BEFORE res.json. Find anchor:
# the existing block-sync `try { ... } catch (syncErr ...)` ends, then res.json.
# We'll inject a new try-block right after the block-sync catch block but
# before res.json. Use the marker `} catch (syncErr: any) {` -> find following
# closing brace + res.json line.

import re
# Find the syncErr catch block end
m = re.search(r"console\.error\('\[ActivityPUT\] Block sync failed[^\n]*\n\s*\}", asrc)
if not m:
    print('FAIL: block-sync catch end anchor not found'); exit(1)
inject_at = m.end()

email_block = """

    // Notify enrolled parents about the change (best-effort, non-blocking)
    try {
      const sb2 = getServiceClient()
      const orig = originalActivity || {}
      const next = activity as any
      const changes: Array<{ label: string; oldValue: string; newValue: string }> = []

      const fmtTime = (t: string | undefined) => t ? String(t).slice(0, 5) : ''
      const fmtMoney = (v: any) => v != null ? `${v} EUR` : '—'
      const dayMap: Record<string, string> = { MO: 'Montag', TU: 'Dienstag', WE: 'Mittwoch', TH: 'Donnerstag', FR: 'Freitag', SA: 'Samstag', SU: 'Sonntag' }

      if (orig.title !== next.title && next.title != null) {
        changes.push({ label: 'Titel', oldValue: String(orig.title || ''), newValue: String(next.title) })
      }
      const oSlot = (orig.schedule?.slots || [])[0] || {}
      const nSlot = (next.schedule?.slots || [])[0] || {}
      if (oSlot.day !== nSlot.day && nSlot.day) {
        changes.push({ label: 'Tag', oldValue: dayMap[oSlot.day] || oSlot.day || '—', newValue: dayMap[nSlot.day] || nSlot.day })
      }
      const oTime = `${fmtTime(oSlot.startTime)}${oSlot.endTime ? '-' + fmtTime(oSlot.endTime) : ''}`
      const nTime = `${fmtTime(nSlot.startTime)}${nSlot.endTime ? '-' + fmtTime(nSlot.endTime) : ''}`
      if (oTime !== nTime && nTime !== '-') {
        changes.push({ label: 'Uhrzeit', oldValue: oTime || '—', newValue: nTime })
      }
      if (orig.schedule?.startDate !== next.schedule?.startDate && next.schedule?.startDate) {
        changes.push({ label: 'Start', oldValue: orig.schedule?.startDate || '—', newValue: next.schedule.startDate })
      }
      if (orig.schedule?.endDate !== next.schedule?.endDate && next.schedule?.endDate) {
        changes.push({ label: 'Ende', oldValue: orig.schedule?.endDate || 'offen', newValue: next.schedule.endDate })
      }
      if (orig.capacity !== next.capacity && next.capacity != null) {
        changes.push({ label: 'Plaetze', oldValue: String(orig.capacity ?? '?'), newValue: String(next.capacity) })
      }
      const oPrice = orig.pricing?.[0]?.amount
      const nPrice = next.pricing?.[0]?.amount
      if (oPrice !== nPrice && nPrice != null) {
        changes.push({ label: 'Preis', oldValue: fmtMoney(oPrice), newValue: fmtMoney(nPrice) })
      }

      if (changes.length > 0) {
        // Find every parent enrolled in any active block of this activity
        const { data: blocks2 } = await sb2.from('course_blocks').select('id').eq('activity_id', req.params.id).in('status', ['active', 'upcoming'])
        const blockIds = (blocks2 || []).map((b: any) => b.id)
        if (blockIds.length > 0) {
          const { data: enrollments } = await sb2.from('block_enrollments')
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
            const { data: parents2 } = await sb2.from('parents').select('id, name, email').in('id', parentIds)
            const { data: provider2 } = await sb2.from('providers').select('company_name').eq('id', auth.providerId).single()
            const providerName = provider2?.company_name || 'Dein Anbieter'
            const { EmailService } = await import('../../lib/email')
            for (const p of (parents2 || [])) {
              const entry = byParent.get(p.id)
              if (!entry || !p.email) continue
              const childName = Array.from(entry.childNames).join(' & ') || 'dein Kind'
              try {
                await EmailService.sendCourseUpdate(p.email, {
                  parentName: p.name || '',
                  childName,
                  courseName: next.title || 'Kurs',
                  providerName,
                  changes,
                })
              } catch (mailErr: any) {
                console.error('[ActivityPUT] sendCourseUpdate failed for', p.email, mailErr.message)
              }
            }
            console.log('[ActivityPUT] Sent', byParent.size, 'update emails for activity', req.params.id, 'with', changes.length, 'changes')
          }
        }
      }
    } catch (notifyErr: any) {
      console.error('[ActivityPUT] Update notification failed (non-fatal):', notifyErr.message || notifyErr)
    }
"""

asrc = asrc[:inject_at] + email_block + asrc[inject_at:]

open(ap, 'w', encoding='utf-8').write(asrc)
print('OK: PUT /api/activities/:id sends update email to enrolled parents')
