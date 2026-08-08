// One-shot Helper: Test-Eltern-Account anlegen + Buchung beim Test-Provider 2
// Run on prod-v2 server: tsx create-test-parent.ts
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.SUPABASE_URL!
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SB_URL || !SB_KEY) { console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1) }

const sb = createClient(SB_URL, SB_KEY)

const TEST_PROVIDER_ID = 'ccdd8df9-eb4c-425c-852c-1dff788576a6' // Kindertanz Köln
const TEST_BLOCK_ID = '43f5c686-ec36-4cec-a891-181b459d45e1'    // Tanzmäuse Block
const TEST_ACTIVITY_ID = '0fdcf041-a4b7-42ca-a6b5-82a034490631'

const EMAIL = 'parent2@ukc-test.local'
const PASSWORD = 'TestEltern_2026!'
const NAME = 'Test-Mama Anna'
const CHILD_NAME = 'Mia'
const CHILD_BIRTH_YEAR = 2022

async function main() {
  // 1) Auth-User anlegen (oder bestehenden finden)
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
    user_metadata: { role: 'parent' },
  })
  let authUserId: string | null = null
  if (cErr) {
    if (cErr.message?.includes('already been registered')) {
      const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 })
      const existing = list?.users?.find(u => (u.email || '').toLowerCase() === EMAIL)
      if (existing) authUserId = existing.id
    } else { throw cErr }
  } else { authUserId = created?.user?.id ?? null }
  if (!authUserId) throw new Error('Could not get auth user id')
  console.log('Auth user:', authUserId)

  // 2) Parent-Row anlegen (ON CONFLICT email → update)
  const { data: existing } = await sb.from('parents').select('id').ilike('email', EMAIL).maybeSingle()
  let parentId: string
  if (existing) {
    parentId = existing.id
    console.log('Parent existed:', parentId)
  } else {
    const { data: newP, error: pErr } = await sb.from('parents').insert({
      name: NAME, email: EMAIL, phone: '+49 221 0000000',
      children: [{ id: 'mia-' + CHILD_BIRTH_YEAR, firstName: CHILD_NAME, lastName: 'Test', birthYear: CHILD_BIRTH_YEAR, name: CHILD_NAME + ' Test' }],
    }).select('id').single()
    if (pErr) throw pErr
    parentId = newP!.id
    console.log('Parent created:', parentId)
  }

  // 3) Update auth user metadata mit parent_id
  await sb.auth.admin.updateUserById(authUserId, { user_metadata: { role: 'parent', parent_id: parentId } })

  // 4) provider_booking + block_enrollment beim Test-Provider 2
  const { data: existingBooking } = await sb.from('provider_bookings').select('id').eq('parent_id', parentId).eq('provider_id', TEST_PROVIDER_ID).limit(1).maybeSingle()
  if (existingBooking) {
    console.log('Booking + enrollment already exist:', existingBooking.id)
    return
  }
  const childAge = new Date().getFullYear() - CHILD_BIRTH_YEAR
  const { data: bk, error: bErr } = await sb.from('provider_bookings').insert({
    provider_id: TEST_PROVIDER_ID, activity_id: TEST_ACTIVITY_ID, parent_id: parentId,
    child_info: { firstName: CHILD_NAME, lastName: 'Test', birthYear: CHILD_BIRTH_YEAR, name: CHILD_NAME + ' Test' },
    payment_method: 'onsite', payment_status: 'unpaid',
    amount_paid: 140, currency: 'EUR', source: 'manual',
    status: 'confirmed',
  }).select('id').single()
  if (bErr) throw bErr
  console.log('Booking created:', bk.id)

  const { data: enr, error: eErr } = await sb.from('block_enrollments').insert({
    block_id: TEST_BLOCK_ID, activity_type: 'tanz',
    provider_id: TEST_PROVIDER_ID, parent_id: parentId,
    child_id: 'mia-' + CHILD_BIRTH_YEAR, child_name: CHILD_NAME + ' Test', child_age: childAge,
    booking_id: bk.id, status: 'active',
    price_paid: 140, currency: 'EUR', credits_earned: 0, credits_used: 0,
  }).select('id').single()
  if (eErr) throw eErr
  console.log('Enrollment created:', enr.id)

  console.log('\n=== Test Parent Account Ready ===')
  console.log('URL:      https://app.urbankids.club/portal/')
  console.log('Email:   ', EMAIL)
  console.log('Passwort:', PASSWORD)
  console.log('Provider:', 'Kindertanz Köln (Test-Provider 2)')
  console.log('Buchung: ', 'Tanzmäuse · Mo 10:00, ab 04.05.2026')
}

main().catch(e => { console.error(e); process.exit(1) })
