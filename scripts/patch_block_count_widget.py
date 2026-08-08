"""Three bug-fixes:
1. Kursblock-Karte: zeige Teilnehmer aus provider_bookings (state) statt
   leerer block_enrollments-Tabelle.
2. Kursblock-Karte: Uhrzeit "14:00:00" -> "14:00 - 15:00" (slice + add end).
3. Widget /api/widget/providers/:slug/course-blocks: zaehle aus
   provider_bookings (active, nicht cancelled/refunded), unabhaengig von
   block_enrollments. Zeige makeup_capacity nicht mit in "Plaetze frei".
"""

import re

# ============================================================
# 1+2. Frontend: kursblock card render
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
fs = open(fp, 'r', encoding='utf-8').read()

old_kb = """      const totalSessions = b.totalSessions || b.total_sessions || 0;
      const completed = b.completedSessions || b.completed_sessions || 0;
      const enrolled = b.enrollmentCount || b.enrolled_count || b.enrolled || 0;
      const cap = b.capacity || 0;
      const pct = totalSessions > 0 ? Math.round(completed/totalSessions*100) : 0;
      const s = statusOf(b);
      const dayMap = { MO:'Mo', TU:'Di', WE:'Mi', TH:'Do', FR:'Fr', SA:'Sa', SU:'So' };
      const dayLabel = dayMap[(b.recurringDay || b.recurring_day || '').toUpperCase()] || '';
      const time = b.recurringTime || b.recurring_time || '';
      const room = b.roomName || (b.room && b.room.name) || '';
      const roomLine = (room || dayLabel) ? (room + (room && (dayLabel || time) ? ' · ' : '') + dayLabel + (time ? ' ' + time : '')) : '—';"""

new_kb = """      const totalSessions = b.totalSessions || b.total_sessions || 0;
      const completed = b.completedSessions || b.completed_sessions || 0;
      // Count from in-memory bookings filtered by activityId (most reliable)
      let enrolled = b.enrollmentCount || b.enrolled_count || b.enrolled;
      if (enrolled == null || enrolled === 0) {
        const dashState = window.dashboardState;
        const allB = (dashState && dashState.bookings) || [];
        enrolled = allB.filter(function(x) {
          return x && x.activityId === (b.activityId || b.activity_id) && x.status !== 'cancelled' && x.status !== 'refunded';
        }).length;
      }
      const cap = b.capacity || 0;
      const pct = totalSessions > 0 ? Math.round(completed/totalSessions*100) : 0;
      const s = statusOf(b);
      const dayMap = { MO:'Mo', TU:'Di', WE:'Mi', TH:'Do', FR:'Fr', SA:'Sa', SU:'So' };
      const dayLabel = dayMap[(b.recurringDay || b.recurring_day || '').toUpperCase()] || '';
      const rawTime = b.recurringTime || b.recurring_time || '';
      const startHM = rawTime ? String(rawTime).slice(0, 5) : '';
      const durMin = b.durationMinutes || b.duration_minutes || 0;
      let endHM = '';
      if (startHM && durMin) {
        const sh = parseInt(startHM.slice(0,2), 10);
        const sm = parseInt(startHM.slice(3,5), 10);
        const total = sh*60 + sm + durMin;
        endHM = String(Math.floor(total/60)).padStart(2,'0') + ':' + String(total%60).padStart(2,'0');
      }
      const time = startHM ? (startHM + (endHM ? '–' + endHM : '')) : '';
      const room = b.roomName || (b.room && b.room.name) || (window.__kalRoomName ? window.__kalRoomName(b.roomId || b.room_id) : '') || '';
      const roomLine = (room || dayLabel) ? (room + (room && (dayLabel || time) ? ' · ' : '') + dayLabel + (time ? ' ' + time : '')) : '—';"""

if old_kb not in fs:
    print('FAIL: kursblock render anchor not found'); exit(1)
fs = fs.replace(old_kb, new_kb, 1)
print('OK: kursblock render uses bookings + sliced time')

open(fp, 'w', encoding='utf-8').write(fs)

# ============================================================
# 3. Widget endpoint: count from provider_bookings instead
# ============================================================
pp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/public.ts'
ps = open(pp, 'r', encoding='utf-8').read()

old_ep = """    // Batch-load enrollment counts for all blocks
    const db = getServiceClient()
    const blockIds = blocks.map((b: any) => b.id).filter(Boolean)
    const enrollmentCounts = new Map<string, number>()
    if (blockIds.length > 0) {
      const { data: countRows } = await db.from('block_enrollments')
        .select('block_id', { count: 'exact', head: false })
        .in('block_id', blockIds)
        .eq('status', 'active')
      // Count per block_id
      for (const row of countRows ?? []) {
        enrollmentCounts.set(row.block_id, (enrollmentCounts.get(row.block_id) || 0) + 1)
      }
    }"""

new_ep = """    // Count enrollments from BOTH block_enrollments AND provider_bookings
    // (since some bookings may not produce enrollments, e.g. on-site Stripe success)
    const db = getServiceClient()
    const blockIds = blocks.map((b: any) => b.id).filter(Boolean)
    const enrollmentCounts = new Map<string, number>()
    if (blockIds.length > 0) {
      const { data: enrollRows } = await db.from('block_enrollments')
        .select('block_id')
        .in('block_id', blockIds)
        .eq('status', 'active')
      for (const row of enrollRows ?? []) {
        enrollmentCounts.set(row.block_id, (enrollmentCounts.get(row.block_id) || 0) + 1)
      }
      // Also count provider_bookings linked to these blocks
      const { data: bookingRows } = await db.from('provider_bookings')
        .select('course_block_id, activity_id, status, payment_status')
        .in('course_block_id', blockIds)
      for (const row of bookingRows ?? []) {
        if (row.status === 'cancelled') continue
        if (row.payment_status === 'refunded') continue
        if (!row.course_block_id) continue
        // Avoid double-counting if both records exist for same booking
        // Heuristic: take the maximum of the two counts per block
        // (block_enrollments is the canonical source if it exists)
      }
      // Fallback: if a block has 0 enrollments but has bookings, count bookings
      const bookingCountByBlock = new Map<string, number>()
      for (const row of bookingRows ?? []) {
        if (row.status === 'cancelled' || row.payment_status === 'refunded' || !row.course_block_id) continue
        bookingCountByBlock.set(row.course_block_id, (bookingCountByBlock.get(row.course_block_id) || 0) + 1)
      }
      for (const [bid, cnt] of bookingCountByBlock) {
        const enrollCnt = enrollmentCounts.get(bid) || 0
        if (cnt > enrollCnt) enrollmentCounts.set(bid, cnt)
      }
      // Final fallback: also count by activity_id for blocks that have NO course_block_id-linked bookings
      const blocksByActivityId = new Map<string, string>() // activityId -> blockId (one canonical block per activity)
      for (const b of blocks as any[]) {
        if (b.activityId && !blocksByActivityId.has(b.activityId)) blocksByActivityId.set(b.activityId, b.id)
      }
      const activityIdsToCount = [...blocksByActivityId.keys()]
      if (activityIdsToCount.length > 0) {
        const { data: actBookings } = await db.from('provider_bookings')
          .select('activity_id, status, payment_status, course_block_id')
          .in('activity_id', activityIdsToCount)
        const byActivity = new Map<string, number>()
        for (const row of actBookings ?? []) {
          if (row.status === 'cancelled' || row.payment_status === 'refunded') continue
          if (row.course_block_id) continue // already counted via block path
          const aid = (row as any).activity_id
          byActivity.set(aid, (byActivity.get(aid) || 0) + 1)
        }
        for (const [aid, cnt] of byActivity) {
          const blockId = blocksByActivityId.get(aid)
          if (!blockId) continue
          const cur = enrollmentCounts.get(blockId) || 0
          enrollmentCounts.set(blockId, cur + cnt)
        }
      }
    }"""

if old_ep not in ps:
    print('FAIL: enrollment-count endpoint anchor not found'); exit(1)
ps = ps.replace(old_ep, new_ep, 1)
open(pp, 'w', encoding='utf-8').write(ps)
print('OK: widget endpoint counts from provider_bookings (canonical fallback)')

# ============================================================
# 4. Widget frontend: do not add makeup_capacity to "Plätze frei"
# ============================================================
wp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/widgets/parent-course-widget.html'
ws = open(wp, 'r', encoding='utf-8').read()

old_wc = """  const totalCapacity = block.capacity + (block.makeupCapacity || block.makeup_capacity || 0)
  const spotsLeft = totalCapacity - (block._enrollmentCount || 0)"""

new_wc = """  // Real spots = capacity - enrollments. Makeup capacity is for special cases,
  // not regular bookable seats — don't show it as "Plätze frei".
  const baseCapacity = block.capacity || 0
  const spotsLeft = Math.max(0, baseCapacity - (block._enrollmentCount || 0))"""

if old_wc not in ws:
    print('FAIL: widget capacity calc anchor not found'); exit(1)
ws = ws.replace(old_wc, new_wc, 1)
open(wp, 'w', encoding='utf-8').write(ws)
print('OK: widget shows real spotsLeft without makeup_capacity inflation')

print('All patches applied.')
