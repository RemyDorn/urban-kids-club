// ============================================================
// Test: Kursblock & Guthaben-System – Integrationstest
// ============================================================

import { store } from '../domain/store'
import { ProviderService, ActivityService, ParentService, CourseBlockService, SessionCreditService, MakeupBookingService } from '../services'
import type { Parent } from '../types'

// --- Test Helpers ---

function setup() {
  store.reset()

  // Provider erstellen (Socialy)
  const provider = ProviderService.create({
    name: 'Socialy – The Family Social Club',
    description: 'Family Social Club Düsseldorf',
    address: { street: 'Musterstr. 1', city: 'Düsseldorf', zip: '40210', country: 'DE' },
    contact: { email: 'hallo@socialy.club' },
    categories: ['kinderkurse'],
  })

  // Aktivität erstellen (Little Movers Circle)
  const activityA = ActivityService.create({
    providerId: provider.id,
    title: 'Little Movers Circle A',
    description: 'Spielgruppe für Babys 6–9 Monate',
    category: 'spielgruppe',
    ageRange: { min: 0.5, max: 0.75 },
    schedule: { type: 'recurring', slots: [{ day: 'MO', startTime: '09:00', endTime: '10:00' }], startDate: '2026-05-04' },
    capacity: 10,
    pricing: [{ label: '8-Wochen-Block', type: 'package', amount: 140, currency: 'EUR', packageSize: 8 }],
  })

  // Zweite Gruppe (für Nachholen)
  const activityB = ActivityService.create({
    providerId: provider.id,
    title: 'Little Movers Circle B',
    description: 'Spielgruppe für Babys 6–9 Monate',
    category: 'spielgruppe',
    ageRange: { min: 0.5, max: 0.75 },
    schedule: { type: 'recurring', slots: [{ day: 'WE', startTime: '11:30', endTime: '12:30' }], startDate: '2026-05-06' },
    capacity: 10,
    pricing: [{ label: '8-Wochen-Block', type: 'package', amount: 140, currency: 'EUR', packageSize: 8 }],
  })

  // Elternteil
  const parent = ParentService.create({
    name: 'Anna Müller',
    email: 'anna@example.com',
    phone: '+49 171 1234567',
    children: [{ name: 'Lina', age: 0.6, emergencyContact: 'Anna Müller', emergencyPhone: '+49 171 1234567' }],
  }) as Parent

  return { provider, activityA, activityB, parent }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`❌ FAIL: ${message}`)
  console.log(`  ✅ ${message}`)
}

// --- Tests ---

console.log('\n🧪 === KURSBLOCK & GUTHABEN-SYSTEM TESTS ===\n')

// Test 1: Block erstellen
console.log('📦 Test 1: Block erstellen')
{
  const { provider, activityA } = setup()

  const block = CourseBlockService.createBlock({
    providerId: provider.id,
    activityId: activityA.id,
    activityType: 'little_movers_circle',
    seasonLabel: 'Block 1 – Mai/Juni 2026',
    startDate: '2026-05-04',
    recurringDay: 'MO',
    recurringTime: '09:00',
    capacity: 10,
  })

  assert(!('error' in block), 'Block wurde erstellt')
  if (!('error' in block)) {
    assert(block.totalSessions === 8, 'Block hat 8 Sessions')
    assert(block.pricePerBlock === 140, 'Preis ist 140 €')
    assert(block.makeupCapacity === 2, 'Nachhol-Kapazität ist 2')

    const sessions = CourseBlockService.getSessionsByBlock(block.id)
    assert(sessions.length === 8, '8 Sessions wurden generiert')
    assert(sessions[0].date === '2026-05-04', 'Erste Session ist am 04.05.')
    assert(sessions[7].date === '2026-06-22', 'Letzte Session ist am 22.06.')
    assert(sessions[0].startTime === '09:00', 'Startzeit ist 09:00')
    assert(sessions[0].endTime === '10:00', 'Endzeit ist 10:00')
  }
}

// Test 2: Kind einschreiben
console.log('\n📝 Test 2: Kind in Block einschreiben')
{
  const { provider, activityA, parent } = setup()

  const block = CourseBlockService.createBlock({
    providerId: provider.id,
    activityId: activityA.id,
    activityType: 'little_movers_circle',
    seasonLabel: 'Block 1',
    startDate: '2026-05-04',
    recurringDay: 'MO',
    recurringTime: '09:00',
    capacity: 10,
  })
  if ('error' in block) throw new Error(block.error)

  const enrollment = CourseBlockService.enrollChild({
    blockId: block.id,
    parentId: parent.id,
    childId: 'child-lina',
    childName: 'Lina',
    childAge: 0.6,
  })

  assert(!('error' in enrollment), 'Kind wurde eingeschrieben')
  if (!('error' in enrollment)) {
    assert(enrollment.pricePaid === 140, 'Preis ist 140 €')
    assert(enrollment.creditsEarned === 0, 'Noch keine Credits')
    assert(enrollment.status === 'active', 'Status ist active')
  }

  // Doppel-Einschreibung verhindern
  const double = CourseBlockService.enrollChild({
    blockId: block.id,
    parentId: parent.id,
    childId: 'child-lina',
    childName: 'Lina',
    childAge: 0.6,
  })
  assert('error' in double, 'Doppel-Einschreibung wird verhindert')
}

// Test 3: Eltern-Absage mit Guthaben (rechtzeitig)
console.log('\n🎫 Test 3: Eltern-Absage → Guthaben')
{
  const { provider, activityA, parent } = setup()

  const block = CourseBlockService.createBlock({
    providerId: provider.id,
    activityId: activityA.id,
    activityType: 'little_movers_circle',
    seasonLabel: 'Block 1',
    startDate: '2026-05-04',
    recurringDay: 'MO',
    recurringTime: '09:00',
    capacity: 10,
  })
  if ('error' in block) throw new Error(block.error)

  const enrollment = CourseBlockService.enrollChild({
    blockId: block.id,
    parentId: parent.id,
    childId: 'child-lina',
    childName: 'Lina',
    childAge: 0.6,
  })
  if ('error' in enrollment) throw new Error(enrollment.error)

  // Session-Attendance für erste Session finden
  const sessions = CourseBlockService.getSessionsByBlock(block.id)
  const attendance = CourseBlockService.getAttendanceBySession(sessions[0].id)
  assert(attendance.length >= 1, 'Attendance-Record existiert')

  // Absage durchführen (> 24h vorher, da Session in der Zukunft)
  const cancelResult = SessionCreditService.handleParentCancellation(attendance[0].id)
  assert(!('error' in cancelResult), 'Absage erfolgreich')
  if (!('error' in cancelResult)) {
    assert(cancelResult.credit !== undefined, 'Credit wurde ausgestellt')
    assert(cancelResult.credit!.activityType === 'little_movers_circle', 'Credit hat richtigen Kurstyp')
    assert(cancelResult.credit!.status === 'available', 'Credit ist verfügbar')
  }

  // Enrollment-Zähler prüfen
  const updatedEnrollment = store.state.blockEnrollments.get(enrollment.id)
  assert(updatedEnrollment!.creditsEarned === 1, 'Credits earned = 1')

  // Credits des Kindes abrufen
  const credits = SessionCreditService.getCreditsByChild('child-lina', 'available')
  assert(credits.length === 1, '1 verfügbares Guthaben')
}

// Test 4: Max Credits Limit (2 pro Block)
console.log('\n🚫 Test 4: Max Credits Limit')
{
  const { provider, activityA, parent } = setup()

  const block = CourseBlockService.createBlock({
    providerId: provider.id,
    activityId: activityA.id,
    activityType: 'little_movers_circle',
    seasonLabel: 'Block 1',
    startDate: '2026-05-04',
    recurringDay: 'MO',
    recurringTime: '09:00',
    capacity: 10,
  })
  if ('error' in block) throw new Error(block.error)

  const enrollment = CourseBlockService.enrollChild({
    blockId: block.id,
    parentId: parent.id,
    childId: 'child-lina',
    childName: 'Lina',
    childAge: 0.6,
  })
  if ('error' in enrollment) throw new Error(enrollment.error)

  const sessions = CourseBlockService.getSessionsByBlock(block.id)

  // Absage 1 → Credit
  const att1 = CourseBlockService.getAttendanceBySession(sessions[0].id)
  const cancel1 = SessionCreditService.handleParentCancellation(att1[0].id)
  assert(!('error' in cancel1) && cancel1.credit !== undefined, 'Credit 1 ausgestellt')

  // Absage 2 → Credit
  const att2 = CourseBlockService.getAttendanceBySession(sessions[1].id)
  const cancel2 = SessionCreditService.handleParentCancellation(att2[0].id)
  assert(!('error' in cancel2) && cancel2.credit !== undefined, 'Credit 2 ausgestellt')

  // Absage 3 → KEIN Credit (Limit erreicht)
  const att3 = CourseBlockService.getAttendanceBySession(sessions[2].id)
  const cancel3 = SessionCreditService.handleParentCancellation(att3[0].id)
  assert(!('error' in cancel3), 'Absage 3 geht durch')
  if (!('error' in cancel3)) {
    assert(cancel3.credit === undefined, 'Kein 3. Credit (Limit erreicht)')
    assert(cancel3.message.includes('max'), 'Message erwähnt max Guthaben')
  }
}

// Test 5: Provider-Absage → Credits für alle (kein Limit)
console.log('\n🏢 Test 5: Provider-Absage → Credits für alle')
{
  const { provider, activityA, parent } = setup()

  const block = CourseBlockService.createBlock({
    providerId: provider.id,
    activityId: activityA.id,
    activityType: 'little_movers_circle',
    seasonLabel: 'Block 1',
    startDate: '2026-05-04',
    recurringDay: 'MO',
    recurringTime: '09:00',
    capacity: 10,
  })
  if ('error' in block) throw new Error(block.error)

  CourseBlockService.enrollChild({
    blockId: block.id,
    parentId: parent.id,
    childId: 'child-lina',
    childName: 'Lina',
    childAge: 0.6,
  })

  const sessions = CourseBlockService.getSessionsByBlock(block.id)

  // Provider sagt Session ab → Credit
  const result = CourseBlockService.cancelSession({
    sessionId: sessions[0].id,
    reason: 'Kursleiterin krank',
    compensation: 'credit',
    cancelledBy: provider.id,
  })

  assert(!('error' in result), 'Provider-Absage erfolgreich')
  if (!('error' in result)) {
    assert(result.affected >= 1, 'Mindestens 1 Teilnehmer betroffen')
    assert(result.compensation === 'credit', 'Kompensation ist Credit')
  }

  // Credit prüfen
  const credits = SessionCreditService.getCreditsByChild('child-lina')
  assert(credits.length >= 1, 'Kind hat Credit erhalten')
  assert(credits[0].isProviderCancellation === true, 'Credit ist Provider-Credit')
}

// Test 6: Block verlängern statt Credits
console.log('\n📅 Test 6: Block verlängern')
{
  const { provider, activityA, parent } = setup()

  const block = CourseBlockService.createBlock({
    providerId: provider.id,
    activityId: activityA.id,
    activityType: 'little_movers_circle',
    seasonLabel: 'Block 1',
    startDate: '2026-05-04',
    recurringDay: 'MO',
    recurringTime: '09:00',
    capacity: 10,
  })
  if ('error' in block) throw new Error(block.error)

  CourseBlockService.enrollChild({
    blockId: block.id,
    parentId: parent.id,
    childId: 'child-lina',
    childName: 'Lina',
    childAge: 0.6,
  })

  const sessions = CourseBlockService.getSessionsByBlock(block.id)
  const originalEnd = block.endDate

  // Provider sagt ab → Block verlängern
  CourseBlockService.cancelSession({
    sessionId: sessions[0].id,
    reason: 'Feiertag',
    compensation: 'extension',
    cancelledBy: provider.id,
  })

  const updatedBlock = store.state.courseBlocks.get(block.id)!
  assert(updatedBlock.extendedEndDate !== undefined, 'Block hat extendedEndDate')
  assert(updatedBlock.extendedEndDate! > originalEnd, 'Neues Enddatum ist nach Original')
  assert(updatedBlock.totalSessions === 9, 'Block hat jetzt 9 Sessions')

  const updatedSessions = CourseBlockService.getSessionsByBlock(block.id)
  assert(updatedSessions.length === 9, '9 Sessions in der DB')
}

// Test 7: Nachhol-Buchung
console.log('\n🔄 Test 7: Nachholtermin buchen')
{
  const { provider, activityA, activityB, parent } = setup()

  // Block A (Mo)
  const blockA = CourseBlockService.createBlock({
    providerId: provider.id,
    activityId: activityA.id,
    activityType: 'little_movers_circle',
    seasonLabel: 'Block 1 A',
    startDate: '2026-05-04',
    recurringDay: 'MO',
    recurringTime: '09:00',
    capacity: 10,
  })
  if ('error' in blockA) throw new Error(blockA.error)

  // Block B (Mi) – selber Kurstyp!
  const blockB = CourseBlockService.createBlock({
    providerId: provider.id,
    activityId: activityB.id,
    activityType: 'little_movers_circle',
    seasonLabel: 'Block 1 B',
    startDate: '2026-05-06',
    recurringDay: 'WE',
    recurringTime: '11:30',
    capacity: 10,
  })
  if ('error' in blockB) throw new Error(blockB.error)

  // Kind in Block A einschreiben
  const enrollment = CourseBlockService.enrollChild({
    blockId: blockA.id,
    parentId: parent.id,
    childId: 'child-lina',
    childName: 'Lina',
    childAge: 0.6,
  })
  if ('error' in enrollment) throw new Error(enrollment.error)

  // Session absagen → Credit erhalten
  const sessionsA = CourseBlockService.getSessionsByBlock(blockA.id)
  const att = CourseBlockService.getAttendanceBySession(sessionsA[0].id)
  const cancelResult = SessionCreditService.handleParentCancellation(att[0].id)
  if ('error' in cancelResult) throw new Error(cancelResult.error)
  const credit = cancelResult.credit!

  // Verfügbare Nachhol-Slots
  const slots = CourseBlockService.getAvailableMakeupSlots(
    credit.activityType,
    credit.validUntil
  )
  assert(slots.length > 0, 'Es gibt verfügbare Nachhol-Slots')

  // Nachhol-Buchung in Block B
  const sessionsB = CourseBlockService.getSessionsByBlock(blockB.id)
  const targetSession = sessionsB[0]

  const makeup = MakeupBookingService.bookMakeup({
    creditId: credit.id,
    targetSessionId: targetSession.id,
    bookedBy: 'parent',
  })

  assert(!('error' in makeup), 'Nachholtermin gebucht')
  if (!('error' in makeup)) {
    assert(makeup.status === 'confirmed', 'Status ist confirmed')
    assert(makeup.childName === 'Lina', 'Kindname ist korrekt')
  }

  // Credit ist jetzt used
  const updatedCredit = store.state.sessionCredits.get(credit.id)!
  assert(updatedCredit.status === 'used', 'Credit ist used')

  // Nachhol-Attendance existiert
  const targetAttendances = CourseBlockService.getAttendanceBySession(targetSession.id)
  const makeupAtt = targetAttendances.find(a => a.isMakeup)
  assert(makeupAtt !== undefined, 'Makeup-Attendance existiert')
}

// Test 8: Nachholtermin stornieren → Credit wieder verfügbar
console.log('\n❌ Test 8: Nachholtermin stornieren')
{
  const { provider, activityA, activityB, parent } = setup()

  const blockA = CourseBlockService.createBlock({
    providerId: provider.id, activityId: activityA.id,
    activityType: 'little_movers_circle', seasonLabel: 'A',
    startDate: '2026-05-04', recurringDay: 'MO', recurringTime: '09:00', capacity: 10,
  })
  if ('error' in blockA) throw new Error(blockA.error)

  const blockB = CourseBlockService.createBlock({
    providerId: provider.id, activityId: activityB.id,
    activityType: 'little_movers_circle', seasonLabel: 'B',
    startDate: '2026-05-06', recurringDay: 'WE', recurringTime: '11:30', capacity: 10,
  })
  if ('error' in blockB) throw new Error(blockB.error)

  const enrollment = CourseBlockService.enrollChild({
    blockId: blockA.id, parentId: parent.id,
    childId: 'child-lina', childName: 'Lina', childAge: 0.6,
  })
  if ('error' in enrollment) throw new Error(enrollment.error)

  // Absage → Credit → Makeup buchen
  const sessionsA = CourseBlockService.getSessionsByBlock(blockA.id)
  const att = CourseBlockService.getAttendanceBySession(sessionsA[0].id)
  const cancelResult = SessionCreditService.handleParentCancellation(att[0].id)
  if ('error' in cancelResult) throw new Error(cancelResult.error)

  const sessionsB = CourseBlockService.getSessionsByBlock(blockB.id)
  const makeup = MakeupBookingService.bookMakeup({
    creditId: cancelResult.credit!.id,
    targetSessionId: sessionsB[0].id,
    bookedBy: 'parent',
  })
  if ('error' in makeup) throw new Error(makeup.error)

  // Jetzt stornieren
  const cancelMakeup = MakeupBookingService.cancelMakeup(makeup.id, 'parent')
  assert(!('error' in cancelMakeup), 'Stornierung erfolgreich')

  // Credit wieder available
  const credit = store.state.sessionCredits.get(cancelResult.credit!.id)!
  assert(credit.status === 'available', 'Credit ist wieder available')
}

console.log('\n✅ === ALLE TESTS BESTANDEN ===\n')
