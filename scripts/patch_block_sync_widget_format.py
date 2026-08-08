"""Patches:
1. activities.ts PUT block-sync: also update total_sessions + end_date so the
   block + widget reflect the saved package_size and date range. If
   recurring_day / recurring_time / start_date or total_sessions changed AND
   the block has zero active enrollments, regenerate block_sessions.
2. parent-course-widget.html: pretty day names (Mo/Di/.../So in German) and
   trim 'HH:MM:SS' -> 'HH:MM' in the recurring time.
"""

# ============================================================
# 1. Backend block-sync expansion
# ============================================================
ap = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/activities.ts'
asrc = open(ap, 'r', encoding='utf-8').read()

old = """    // Sync linked course_block fields (capacity / day / time / price / duration)
    try {
      const updateForBlock: Record<string, any> = {}
      const body = req.body as any
      if (body.capacity != null) updateForBlock.capacity = body.capacity
      if (body.pricing && body.pricing[0] && body.pricing[0].amount != null) updateForBlock.price_per_block = body.pricing[0].amount
      if (body.schedule && body.schedule.slots && body.schedule.slots[0]) {
        const slot0 = body.schedule.slots[0]
        if (slot0.day) updateForBlock.recurring_day = slot0.day
        if (slot0.startTime) updateForBlock.recurring_time = slot0.startTime
        if (slot0.startTime && slot0.endTime) {
          const [sh, sm] = String(slot0.startTime).split(':').map(Number)
          const [eh, em] = String(slot0.endTime).split(':').map(Number)
          updateForBlock.duration_minutes = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))
        }
      }
      if (body.schedule && body.schedule.startDate) updateForBlock.start_date = body.schedule.startDate
      if (Object.keys(updateForBlock).length > 0) {
        const sb = getServiceClient()
        await sb.from('course_blocks').update(updateForBlock)
          .eq('activity_id', req.params.id)
          .in('status', ['active', 'upcoming'])
        console.log('[ActivityPUT] Synced block fields:', Object.keys(updateForBlock).join(','), 'for activity', req.params.id)
      }
    } catch (syncErr: any) {
      console.error('[ActivityPUT] Block sync failed (non-fatal):', syncErr.message || syncErr)
    }
"""

new = """    // Sync linked course_block fields (capacity / day / time / price / duration / sessions)
    try {
      const sb = getServiceClient()
      const body = req.body as any
      const updateForBlock: Record<string, any> = {}
      if (body.capacity != null) updateForBlock.capacity = body.capacity
      const newPkg = body.pricing && body.pricing[0] && body.pricing[0].packageSize
      if (body.pricing && body.pricing[0] && body.pricing[0].amount != null) updateForBlock.price_per_block = body.pricing[0].amount
      if (newPkg && newPkg > 0) updateForBlock.total_sessions = newPkg
      let scheduleChanged = false
      if (body.schedule && body.schedule.slots && body.schedule.slots[0]) {
        const slot0 = body.schedule.slots[0]
        if (slot0.day) { updateForBlock.recurring_day = slot0.day; scheduleChanged = true }
        if (slot0.startTime) { updateForBlock.recurring_time = slot0.startTime; scheduleChanged = true }
        if (slot0.startTime && slot0.endTime) {
          const [sh, sm] = String(slot0.startTime).split(':').map(Number)
          const [eh, em] = String(slot0.endTime).split(':').map(Number)
          updateForBlock.duration_minutes = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))
        }
      }
      if (body.schedule && body.schedule.startDate) { updateForBlock.start_date = body.schedule.startDate; scheduleChanged = true }
      if (body.schedule && body.schedule.endDate) updateForBlock.end_date = body.schedule.endDate

      if (Object.keys(updateForBlock).length > 0) {
        await sb.from('course_blocks').update(updateForBlock)
          .eq('activity_id', req.params.id)
          .in('status', ['active', 'upcoming'])
        console.log('[ActivityPUT] Synced block fields:', Object.keys(updateForBlock).join(','), 'for activity', req.params.id)
      }

      // Regenerate block_sessions ONLY if schedule/sessions changed AND no
      // enrollments exist on this block (safety: never silently shift booked sessions).
      const { data: blocks } = await sb.from('course_blocks')
        .select('id, capacity, total_sessions, start_date, recurring_day, recurring_time, duration_minutes')
        .eq('activity_id', req.params.id).in('status', ['active', 'upcoming'])
      for (const blk of (blocks || [])) {
        const { count: enrollCount } = await sb.from('block_enrollments')
          .select('*', { count: 'exact', head: true })
          .eq('block_id', blk.id).eq('status', 'active')
        if ((enrollCount ?? 0) > 0) {
          console.log('[ActivityPUT] Block', blk.id, 'has', enrollCount, 'active enrollments — keeping existing sessions.')
          continue
        }
        if (!scheduleChanged && (newPkg == null || newPkg === blk.total_sessions)) continue
        // Wipe + regenerate
        await sb.from('block_sessions').delete().eq('block_id', blk.id)
        const dayToNum: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
        const targetDay = dayToNum[String(blk.recurring_day || '').toUpperCase()] ?? 1
        let d = new Date(blk.start_date || new Date().toISOString().slice(0, 10))
        while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1)
        const sessions: any[] = []
        const total = blk.total_sessions || 1
        const dur = blk.duration_minutes || 60
        const [sh, sm] = String(blk.recurring_time || '15:00').split(':').map(Number)
        const totalEndMin = sh * 60 + (sm || 0) + dur
        const endTime = String(Math.floor(totalEndMin / 60)).padStart(2, '0') + ':' + String(totalEndMin % 60).padStart(2, '0')
        for (let i = 0; i < total; i++) {
          sessions.push({
            block_id: blk.id,
            session_number: i + 1,
            date: d.toISOString().slice(0, 10),
            start_time: blk.recurring_time,
            end_time: endTime,
            status: 'scheduled',
          })
          d.setDate(d.getDate() + 7)
        }
        if (sessions.length) {
          await sb.from('block_sessions').insert(sessions)
          await sb.from('course_blocks').update({ end_date: sessions[sessions.length - 1].date }).eq('id', blk.id)
          console.log('[ActivityPUT] Regenerated', sessions.length, 'sessions for block', blk.id)
        }
      }
    } catch (syncErr: any) {
      console.error('[ActivityPUT] Block sync failed (non-fatal):', syncErr.message || syncErr)
    }
"""

if old not in asrc:
    print('FAIL: existing block-sync block not found'); exit(1)
asrc = asrc.replace(old, new, 1)
open(ap, 'w', encoding='utf-8').write(asrc)
print('OK: activities.ts block-sync extended (total_sessions, end_date, sessions regen)')

# ============================================================
# 2. Widget: pretty day name + trim time
# ============================================================
wp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/widgets/parent-course-widget.html'
ws = open(wp, 'r', encoding='utf-8').read()

# The dayNames map currently uses lowercase keys (mon/tue/...) but the API
# returns MO/TU/WE/TH/FR/SA/SU in uppercase. So `dayNames[block.recurringDay]`
# fails -> fallback to raw. Fix: map both lowercase and uppercase.
old_w1 = "const dayNames = { mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag', fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag' }\n  const day = dayNames[block.recurringDay] || block.recurringDay"
new_w1 = "const dayNames = { mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag', fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag', MO: 'Montag', TU: 'Dienstag', WE: 'Mittwoch', TH: 'Donnerstag', FR: 'Freitag', SA: 'Samstag', SU: 'Sonntag' }\n  const day = dayNames[block.recurringDay] || dayNames[String(block.recurringDay||'').toLowerCase()] || block.recurringDay"
if old_w1 not in ws:
    print('FAIL: widget renderBlockCard dayNames anchor not found'); exit(1)
ws = ws.replace(old_w1, new_w1, 1)

# Trim recurringTime HH:MM:SS -> HH:MM in renderBlockCard.
# Find the inline use: `${block.recurringTime} Uhr` and replace with trimmed.
old_w2 = "${day}, ${block.recurringTime} Uhr"
new_w2 = "${day}, ${String(block.recurringTime || '').slice(0,5)} Uhr"
if old_w2 not in ws:
    print('FAIL: widget recurringTime usage not found'); exit(1)
ws = ws.replace(old_w2, new_w2, 1)

# Repeat for the same display in step-2 booking modal if present
# (look for any other ${block.recurringTime} occurrences)
ws_count = ws.count("${block.recurringTime}")
if ws_count > 0:
    ws = ws.replace("${block.recurringTime}", "${String(block.recurringTime || '').slice(0,5)}")
    print('Also trimmed', ws_count, 'other recurringTime usages')

open(wp, 'w', encoding='utf-8').write(ws)
print('OK: widget day names + time format fixed')
