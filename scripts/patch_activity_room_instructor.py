"""Wire up Room/Trainer pickers in kurs creator with correct FK targets.

Backend:
- src/lib/schemas.ts: add roomId to CreateActivitySchema
- src/services/supabase/mappers.ts: add roomId <-> room_id mapping (read+write)

Frontend:
- src/frontend/dashboard-v3.html: payload now sends roomId (FK -> rooms) and
  instructorId (FK -> team_members) when user picked a real value.
"""

# ============================================================
# 1. Backend schema
# ============================================================
schema_p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/lib/schemas.ts'
s = open(schema_p, 'r', encoding='utf-8').read()

old_s = """  locationId: z.string().optional(),
  instructorId: z.string().optional(),
  title: z.string().min(2, 'Titel muss mind. 2 Zeichen haben').max(200),"""
new_s = """  locationId: z.string().optional(),
  roomId: z.string().optional(),
  instructorId: z.string().optional(),
  title: z.string().min(2, 'Titel muss mind. 2 Zeichen haben').max(200),"""

if old_s not in s:
    print('FAIL: CreateActivitySchema anchor not found'); exit(1)
s = s.replace(old_s, new_s, 1)
open(schema_p, 'w', encoding='utf-8').write(s)
print('OK: schemas.ts roomId added')

# ============================================================
# 2. Backend mappers (activity)
# ============================================================
mp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/services/supabase/mappers.ts'
m = open(mp, 'r', encoding='utf-8').read()

# 2a. Read mapper: activityFromDb (around line 117)
old_m1 = """    locationId: r.location_id ?? undefined,
    instructorId: r.instructor_id ?? undefined,"""
new_m1 = """    locationId: r.location_id ?? undefined,
    roomId: r.room_id ?? undefined,
    instructorId: r.instructor_id ?? undefined,"""
if old_m1 not in m:
    print('FAIL: activityFromDb anchor not found'); exit(1)
m = m.replace(old_m1, new_m1, 1)

# 2b. Write mapper: activityToRow (around line 161)
old_m2 = """  if ((a as Record<string, unknown>).locationId !== undefined) row.location_id = (a as Record<string, unknown>).locationId ?? null
  if ((a as Record<string, unknown>).instructorId !== undefined) row.instructor_id = (a as Record<string, unknown>).instructorId ?? null"""
new_m2 = """  if ((a as Record<string, unknown>).locationId !== undefined) row.location_id = (a as Record<string, unknown>).locationId ?? null
  if ((a as Record<string, unknown>).roomId !== undefined) row.room_id = (a as Record<string, unknown>).roomId ?? null
  if ((a as Record<string, unknown>).instructorId !== undefined) row.instructor_id = (a as Record<string, unknown>).instructorId ?? null"""
if old_m2 not in m:
    print('FAIL: activityToRow anchor not found'); exit(1)
m = m.replace(old_m2, new_m2, 1)

open(mp, 'w', encoding='utf-8').write(m)
print('OK: mappers.ts roomId read/write added')

# ============================================================
# 3. Frontend payload — replace placeholder block
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
f = open(fp, 'r', encoding='utf-8').read()

old_f = """          paymentOnsite: !!data.payOnSite,
          color: data.color || undefined,
          // locationId/instructorId weggelassen: rooms-Tabelle != locations-FK,
          // Trainer-IDs aus /providers/:id/team != Auth-User-IDs (FK-Mismatch).
          // Raum/Trainer-Zuordnung folgt in eigenem Step (Settings -> Räume / Team).
        };"""

new_f = """          paymentOnsite: !!data.payOnSite,
          color: data.color || undefined,
          // roomId  -> activities.room_id  (FK rooms.id)
          // instructorId -> activities.instructor_id (FK team_members.id)
          roomId: roomVal,
          instructorId: trainerVal,
        };"""

if old_f not in f:
    print('FAIL: payload trailer not found'); exit(1)
f = f.replace(old_f, new_f, 1)

open(fp, 'w', encoding='utf-8').write(f)
print('OK: dashboard-v3.html sends roomId + instructorId')
