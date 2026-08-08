"""Two patches:
1. Backend (src/api/routes/bookings.ts): enrich listByProvider response with
   customer (parent JOIN) + activityTitle (activity JOIN) + paymentMethod label.
2. Frontend (src/frontend/dashboard-v3.html): also accept amountPaid (EUR) as
   amount source, not just legacy amountCents/priceCents.
"""

# ============================================================
# 1. Backend: bookings.ts — enrich list endpoint
# ============================================================
bp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/bookings.ts'
b = open(bp, 'r', encoding='utf-8').read()

old_b = """  router.get('/api/providers/:providerId/bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const bookings = await BookingService.listByProvider(auth.providerId, {
      status: req.query.status as any,
      paymentStatus: req.query.paymentStatus as any,
    })
    res.json({ data: bookings, count: bookings.length })
  })"""

new_b = """  router.get('/api/providers/:providerId/bookings', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const bookings = await BookingService.listByProvider(auth.providerId, {
      status: req.query.status as any,
      paymentStatus: req.query.paymentStatus as any,
    })

    // Enrich with parent (customer) + activity title for dashboard display
    if (bookings.length > 0) {
      const db = getServiceClient()
      const parentIds = [...new Set(bookings.map(b => b.parentId).filter(Boolean))]
      const activityIds = [...new Set(bookings.map(b => b.activityId).filter(Boolean))]

      const [parentsRes, activitiesRes] = await Promise.all([
        parentIds.length
          ? db.from('parents').select('id, name, email, phone').in('id', parentIds)
          : Promise.resolve({ data: [] }),
        activityIds.length
          ? db.from('activities').select('id, title').in('id', activityIds)
          : Promise.resolve({ data: [] }),
      ])

      const parentMap = new Map<string, any>()
      for (const p of (parentsRes.data ?? [])) parentMap.set(p.id, p)
      const actMap = new Map<string, any>()
      for (const a of (activitiesRes.data ?? [])) actMap.set(a.id, a)

      const enriched = bookings.map(b => {
        const p = parentMap.get(b.parentId)
        const a = actMap.get(b.activityId)
        return {
          ...b,
          customer: p ? { name: p.name, email: p.email, phone: p.phone } : undefined,
          customerName: p?.name,
          customerEmail: p?.email,
          activityTitle: a?.title,
          activityName: a?.title,
        }
      })
      return res.json({ data: enriched, count: enriched.length })
    }

    res.json({ data: bookings, count: bookings.length })
  })"""

if old_b not in b:
    print('FAIL: bookings list handler not found'); exit(1)
b = b.replace(old_b, new_b, 1)

# Make sure getServiceClient is imported in bookings.ts
if "import { getServiceClient }" not in b:
    # add after first import line
    import_line = "import { BookingService"
    if import_line not in b:
        print('FAIL: cannot locate import anchor in bookings.ts'); exit(1)
    b = b.replace(import_line, "import { getServiceClient } from '../../lib/supabase'\nimport { BookingService", 1)

open(bp, 'w', encoding='utf-8').write(b)
print('OK: bookings.ts list-handler enriched')

# ============================================================
# 2. Frontend: dashboard-v3.html — accept amountPaid (EUR)
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
f = open(fp, 'r', encoding='utf-8').read()

# In recent bookings table:
old_amt1 = "const amount = ((b.amountCents || b.priceCents || 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €';"
new_amt1 = "const amount = (typeof b.amountPaid === 'number' ? b.amountPaid : ((b.amountCents || b.priceCents || 0) / 100)).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €';"
if old_amt1 not in f:
    print('FAIL: recent bookings amount line not found'); exit(1)
f = f.replace(old_amt1, new_amt1, 1)

open(fp, 'w', encoding='utf-8').write(f)
print('OK: dashboard-v3.html amount lookup also accepts amountPaid')
