// ============================================================
// Tests: Core Services (Provider, Activity, Booking, Parent, etc.)
// ============================================================

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { store } from '../domain/store'
import { ProviderService } from '../services/provider.service'
import { ActivityService } from '../services/activity.service'
import { BookingService } from '../services/booking.service'
import { ParentService } from '../services/parent.service'
import { LocationService } from '../services/location.service'
import { TeamService } from '../services/team.service'
import { ReviewService } from '../services/review.service'
import { AttendanceService } from '../services/attendance.service'
import { MessageService } from '../services/message.service'
import { resetIdCounter } from '../services/id'

function resetAll() {
  store.reset()
  resetIdCounter()
}

// Type-Narrowing Helpers für Union-Returns
function assertNotError<T>(result: T | { error: string }): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(`Unexpected error: ${result.error}`)
  }
  return result as T
}

// --- Fixtures ---

function createTestProvider() {
  return ProviderService.create({
    name: 'Tanzstudio Test',
    description: 'Test-Provider',
    address: { street: 'Teststr. 1', city: 'Köln', zip: '50667', country: 'DE' },
    contact: { email: 'test@example.de' },
    categories: ['Tanz'],
  })
}

function createTestParent() {
  return assertNotError(ParentService.create({
    name: 'Anna Test',
    email: 'anna@test.de',
    children: [
      { name: 'Emma', age: 5, emergencyContact: 'Anna Test', emergencyPhone: '+49 123 456' },
      { name: 'Noah', age: 8, emergencyContact: 'Anna Test', emergencyPhone: '+49 123 456' },
    ],
  }))
}

function createTestActivity(providerId: string) {
  const act = ActivityService.create({
    providerId,
    title: 'Ballett Anfänger',
    description: 'Test-Kurs',
    category: 'Ballett',
    ageRange: { min: 4, max: 7 },
    schedule: { type: 'recurring', slots: [{ day: 'TU', startTime: '15:00', endTime: '16:00' }], startDate: '2026-04-06' },
    capacity: 10,
    waitlistEnabled: true,
    pricing: [{ label: 'Monat', type: 'subscription', amount: 45, currency: 'EUR', intervalMonths: 1 }],
  })
  ActivityService.publish(act.id)
  return act
}

// ============================================================
// PROVIDER SERVICE
// ============================================================

describe('ProviderService', () => {
  beforeEach(resetAll)

  it('should create a provider with correct defaults', () => {
    const p = createTestProvider()
    assert.ok(p.id.startsWith('prov_'))
    assert.equal(p.name, 'Tanzstudio Test')
    assert.equal(p.status, 'onboarding')
    assert.equal(p.subscription, 'free')
    assert.equal(p.slug, 'tanzstudio-test')
  })

  it('should generate unique slugs on collision', () => {
    const p1 = ProviderService.create({ name: 'Test', description: '', address: { street: '', city: '', zip: '', country: 'DE' }, contact: { email: 'a@b.de' }, categories: [] })
    const p2 = ProviderService.create({ name: 'Test', description: '', address: { street: '', city: '', zip: '', country: 'DE' }, contact: { email: 'c@d.de' }, categories: [] })
    assert.notEqual(p1.slug, p2.slug)
  })

  it('should activate a provider', () => {
    const p = createTestProvider()
    const activated = ProviderService.activate(p.id)
    assert.equal(activated?.status, 'active')
  })

  it('should change subscription plan', () => {
    const p = createTestProvider()
    ProviderService.changePlan(p.id, 'pro')
    assert.equal(ProviderService.getById(p.id)?.subscription, 'pro')
  })

  it('should list providers with filters', () => {
    createTestProvider()
    const p2 = ProviderService.create({ name: 'Musik', description: '', address: { street: '', city: '', zip: '', country: 'DE' }, contact: { email: 'x@y.de' }, categories: ['Musik'] })
    ProviderService.activate(p2.id)

    const active = ProviderService.list({ status: 'active' })
    assert.equal(active.length, 1)
    assert.equal(active[0].name, 'Musik')

    const byCategory = ProviderService.list({ category: 'Tanz' })
    assert.equal(byCategory.length, 1)
  })

  it('should handle Umlauts in slugs', () => {
    const p = ProviderService.create({ name: 'Über Grüße Straße', description: '', address: { street: '', city: '', zip: '', country: 'DE' }, contact: { email: 'x@y.de' }, categories: [] })
    assert.ok(!p.slug.includes('ü'))
    assert.ok(!p.slug.includes('ß'))
    assert.ok(p.slug.includes('ueber'))
    assert.ok(p.slug.includes('strasse'))
  })
})

// ============================================================
// ACTIVITY SERVICE
// ============================================================

describe('ActivityService', () => {
  beforeEach(resetAll)

  it('should create an activity in draft status', () => {
    const p = createTestProvider()
    const act = ActivityService.create({
      providerId: p.id,
      title: 'Test Kurs',
      description: 'Beschreibung',
      category: 'Tanz',
      ageRange: { min: 4, max: 8 },
      schedule: { type: 'single', date: '2026-05-01', startTime: '10:00', endTime: '11:00' },
      capacity: 15,
      pricing: [{ label: 'Einzelpreis', type: 'single', amount: 20, currency: 'EUR' }],
    })
    assert.equal(act.status, 'draft')
    assert.ok(act.id.startsWith('act_'))
  })

  it('should publish and archive', () => {
    const p = createTestProvider()
    const act = createTestActivity(p.id)
    assert.equal(act.status, 'published')

    ActivityService.archive(act.id)
    assert.equal(ActivityService.getById(act.id)?.status, 'archived')
  })

  it('should search by category and age', () => {
    const p = createTestProvider()
    createTestActivity(p.id) // Ballett, 4-7

    const results = ActivityService.search({ category: 'Ballett', status: 'published' })
    assert.equal(results.length, 1)

    const byAge = ActivityService.search({ ageMin: 6 })
    assert.equal(byAge.length, 1) // 4-7 includes 6

    const tooOld = ActivityService.search({ ageMin: 10 })
    assert.equal(tooOld.length, 0) // 4-7 doesn't include 10
  })

  it('should duplicate an activity', () => {
    const p = createTestProvider()
    const act = createTestActivity(p.id)
    const dup = ActivityService.duplicate(act.id)!

    assert.ok(dup)
    assert.notEqual(dup.id, act.id)
    assert.ok(dup.title.includes('(Kopie)'))
    assert.equal(dup.status, 'draft')
    assert.equal(dup.capacity, act.capacity)
  })

  it('should track available spots', () => {
    const p = createTestProvider()
    const act = createTestActivity(p.id)

    assert.equal(ActivityService.getAvailableSpots(act.id), 10)
  })
})

// ============================================================
// BOOKING SERVICE
// ============================================================

describe('BookingService', () => {
  beforeEach(resetAll)

  it('should create a booking with validation', () => {
    const p = createTestProvider()
    const act = createTestActivity(p.id)
    const parent = createTestParent()

    const result = BookingService.create({
      activityId: act.id,
      providerId: p.id,
      parentId: parent.id,
      child: parent.children[0], // Emma, 5
      pricingOptionId: act.pricing[0].id,
    })

    assert.ok(!('error' in result))
    assert.equal(result.booking.status, 'confirmed')
    assert.equal(result.waitlisted, false)
    assert.ok(result.notifications.length > 0) // Confirmation sent
  })

  it('should reject booking for wrong age', () => {
    const p = createTestProvider()
    const act = createTestActivity(p.id) // age 4-7
    const parent = createTestParent()

    const result = BookingService.create({
      activityId: act.id,
      providerId: p.id,
      parentId: parent.id,
      child: parent.children[1], // Noah, 8 – too old!
      pricingOptionId: act.pricing[0].id,
    })

    assert.ok('error' in result)
    assert.ok(result.error.includes('8 Jahre'))
  })

  it('should prevent double booking', () => {
    const p = createTestProvider()
    const act = createTestActivity(p.id)
    const parent = createTestParent()
    const child = parent.children[0]

    BookingService.create({ activityId: act.id, providerId: p.id, parentId: parent.id, child, pricingOptionId: act.pricing[0].id })
    const second = BookingService.create({ activityId: act.id, providerId: p.id, parentId: parent.id, child, pricingOptionId: act.pricing[0].id })

    assert.ok('error' in second)
    assert.ok(second.error.includes('bereits'))
  })

  it('should waitlist when full', () => {
    const p = createTestProvider()
    const act = ActivityService.create({
      providerId: p.id, title: 'Klein', description: '', category: 'Tanz',
      ageRange: { min: 3, max: 10 }, capacity: 1, waitlistEnabled: true,
      schedule: { type: 'single', date: '2026-05-01', startTime: '10:00', endTime: '11:00' },
      pricing: [{ label: 'X', type: 'single', amount: 10, currency: 'EUR' }],
    })
    ActivityService.publish(act.id)

    const p1 = assertNotError(ParentService.create({ name: 'P1', email: 'p1@t.de', children: [{ name: 'K1', age: 5, emergencyContact: 'P1', emergencyPhone: '123' }] }))
    const p2 = assertNotError(ParentService.create({ name: 'P2', email: 'p2@t.de', children: [{ name: 'K2', age: 5, emergencyContact: 'P2', emergencyPhone: '456' }] }))

    const r1 = BookingService.create({ activityId: act.id, providerId: p.id, parentId: p1.id, child: p1.children[0], pricingOptionId: act.pricing[0].id })
    const r2 = BookingService.create({ activityId: act.id, providerId: p.id, parentId: p2.id, child: p2.children[0], pricingOptionId: act.pricing[0].id })

    assert.ok(!('error' in r1))
    assert.equal(r1.booking.status, 'confirmed')
    assert.ok(!('error' in r2))
    assert.equal(r2.booking.status, 'waitlisted')
    assert.equal(r2.waitlisted, true)
  })

  it('should promote waitlist on cancellation', () => {
    const p = createTestProvider()
    const act = ActivityService.create({
      providerId: p.id, title: 'Klein', description: '', category: 'Tanz',
      ageRange: { min: 3, max: 10 }, capacity: 1, waitlistEnabled: true,
      schedule: { type: 'single', date: '2026-05-01', startTime: '10:00', endTime: '11:00' },
      pricing: [{ label: 'X', type: 'single', amount: 10, currency: 'EUR' }],
    })
    ActivityService.publish(act.id)

    const p1 = assertNotError(ParentService.create({ name: 'P1', email: 'p1@t.de', children: [{ name: 'K1', age: 5, emergencyContact: 'P1', emergencyPhone: '123' }] }))
    const p2 = assertNotError(ParentService.create({ name: 'P2', email: 'p2@t.de', children: [{ name: 'K2', age: 5, emergencyContact: 'P2', emergencyPhone: '456' }] }))

    const r1 = BookingService.create({ activityId: act.id, providerId: p.id, parentId: p1.id, child: p1.children[0], pricingOptionId: act.pricing[0].id })
    BookingService.create({ activityId: act.id, providerId: p.id, parentId: p2.id, child: p2.children[0], pricingOptionId: act.pricing[0].id })

    assert.ok(!('error' in r1))
    BookingService.cancel(r1.booking.id)

    // K2 should now be confirmed
    const bookings = BookingService.listByActivity(act.id)
    const k2Booking = bookings.find((b) => b.child.name === 'K2')
    assert.equal(k2Booking?.status, 'confirmed')
  })

  it('should reject booking for unpublished activity', () => {
    const p = createTestProvider()
    const act = ActivityService.create({
      providerId: p.id, title: 'Draft', description: '', category: 'Tanz',
      ageRange: { min: 3, max: 10 }, capacity: 10,
      schedule: { type: 'single', date: '2026-05-01', startTime: '10:00', endTime: '11:00' },
      pricing: [{ label: 'X', type: 'single', amount: 10, currency: 'EUR' }],
    })
    // NOT published
    const parent = createTestParent()
    const result = BookingService.create({ activityId: act.id, providerId: p.id, parentId: parent.id, child: parent.children[0], pricingOptionId: act.pricing[0].id })

    assert.ok('error' in result)
    assert.ok(result.error.includes('nicht buchbar'))
  })

  it('should track stats correctly', () => {
    const p = createTestProvider()
    const act = createTestActivity(p.id)
    const parent = createTestParent()

    BookingService.create({ activityId: act.id, providerId: p.id, parentId: parent.id, child: parent.children[0], pricingOptionId: act.pricing[0].id })

    const stats = BookingService.getStats(p.id)
    assert.equal(stats.total, 1)
    assert.equal(stats.confirmed, 1)
    assert.equal(stats.unpaid, 1)
  })

  it('should handle partial payments', () => {
    const p = createTestProvider()
    const act = createTestActivity(p.id)
    const parent = createTestParent()

    const result = BookingService.create({ activityId: act.id, providerId: p.id, parentId: parent.id, child: parent.children[0], pricingOptionId: act.pricing[0].id })
    assert.ok(!('error' in result))

    BookingService.markPaid(result.booking.id, 20)
    const updated = BookingService.getById(result.booking.id)!
    assert.equal(updated.paymentStatus, 'partial')
    assert.equal(updated.amountPaid, 20)

    BookingService.markPaid(result.booking.id, 25) // 20 + 25 = 45 = full
    const paid = BookingService.getById(result.booking.id)!
    assert.equal(paid.paymentStatus, 'paid')
    assert.equal(paid.amountPaid, 45)
  })
})

// ============================================================
// PARENT SERVICE
// ============================================================

describe('ParentService', () => {
  beforeEach(resetAll)

  it('should create parent with children', () => {
    const p = createTestParent()
    assert.equal(p.children.length, 2)
    assert.equal(p.children[0].name, 'Emma')
  })

  it('should find by email (case-insensitive)', () => {
    createTestParent()
    const found = ParentService.getByEmail('ANNA@TEST.DE')
    assert.ok(found)
    assert.equal(found!.name, 'Anna Test')
  })

  it('should add and remove children', () => {
    const p = createTestParent()
    ParentService.addChild(p.id, { name: 'Mia', age: 3, emergencyContact: 'Anna', emergencyPhone: '123' })
    assert.equal(ParentService.getById(p.id)!.children.length, 3)

    ParentService.removeChild(p.id, 2)
    assert.equal(ParentService.getById(p.id)!.children.length, 2)
  })

  it('should search by name and child name', () => {
    createTestParent()
    assert.equal(ParentService.list({ query: 'Anna' }).length, 1)
    assert.equal(ParentService.list({ query: 'Emma' }).length, 1)
    assert.equal(ParentService.list({ query: 'nobody' }).length, 0)
  })
})

// ============================================================
// LOCATION SERVICE
// ============================================================

describe('LocationService', () => {
  beforeEach(resetAll)

  it('should create and list locations', () => {
    const p = createTestProvider()
    LocationService.create({ providerId: p.id, name: 'Studio A', address: { street: 'A', city: 'K', zip: '5', country: 'DE' }, rooms: ['Saal 1'] })
    LocationService.create({ providerId: p.id, name: 'Studio B', address: { street: 'B', city: 'K', zip: '5', country: 'DE' } })

    assert.equal(LocationService.listByProvider(p.id).length, 2)
  })

  it('should manage rooms', () => {
    const p = createTestProvider()
    const loc = LocationService.create({ providerId: p.id, name: 'Studio', address: { street: '', city: '', zip: '', country: 'DE' } })

    LocationService.addRoom(loc.id, 'Saal 1')
    LocationService.addRoom(loc.id, 'Saal 2')
    assert.equal(LocationService.getById(loc.id)!.rooms!.length, 2)

    LocationService.removeRoom(loc.id, 'Saal 1')
    assert.equal(LocationService.getById(loc.id)!.rooms!.length, 1)
  })
})

// ============================================================
// TEAM SERVICE
// ============================================================

describe('TeamService', () => {
  beforeEach(resetAll)

  it('should create and filter team members', () => {
    const p = createTestProvider()
    assertNotError(TeamService.create({ providerId: p.id, name: 'Lisa', email: 'l@t.de', role: 'instructor' }))
    assertNotError(TeamService.create({ providerId: p.id, name: 'Sarah', email: 's@t.de', role: 'admin' }))

    assert.equal(TeamService.listByProvider(p.id).length, 2)
    assert.equal(TeamService.listByProvider(p.id, { role: 'instructor' }).length, 1)
  })

  it('should deactivate members', () => {
    const p = createTestProvider()
    const m = assertNotError(TeamService.create({ providerId: p.id, name: 'Lisa', email: 'l@t.de', role: 'instructor' }))
    TeamService.deactivate(m.id)

    assert.equal(TeamService.getById(m.id)!.active, false)
    assert.equal(TeamService.listByProvider(p.id, { active: true }).length, 0)
  })
})

// ============================================================
// REVIEW SERVICE
// ============================================================

describe('ReviewService', () => {
  beforeEach(resetAll)

  it('should only allow reviews for completed bookings', () => {
    const p = createTestProvider()
    const act = createTestActivity(p.id)
    const parent = createTestParent()

    // No booking → no review
    const result = ReviewService.create({ activityId: act.id, providerId: p.id, parentId: parent.id, rating: 5 })
    assert.ok('error' in result)

    // Book and complete
    const booking = BookingService.create({ activityId: act.id, providerId: p.id, parentId: parent.id, child: parent.children[0], pricingOptionId: act.pricing[0].id })
    assert.ok(!('error' in booking))
    BookingService.complete(booking.booking.id)

    // Now review works
    const review = ReviewService.create({ activityId: act.id, providerId: p.id, parentId: parent.id, rating: 4, comment: 'Super!' })
    assert.ok(!('error' in review))
    assert.equal(review.rating, 4)
  })

  it('should prevent duplicate reviews', () => {
    const p = createTestProvider()
    const act = createTestActivity(p.id)
    const parent = createTestParent()

    const b = BookingService.create({ activityId: act.id, providerId: p.id, parentId: parent.id, child: parent.children[0], pricingOptionId: act.pricing[0].id })
    assert.ok(!('error' in b))
    BookingService.complete(b.booking.id)

    ReviewService.create({ activityId: act.id, providerId: p.id, parentId: parent.id, rating: 5 })
    const dup = ReviewService.create({ activityId: act.id, providerId: p.id, parentId: parent.id, rating: 3 })
    assert.ok('error' in dup)
    assert.ok(dup.error.includes('bereits bewertet'))
  })

  it('should calculate averages and distributions', () => {
    const p = createTestProvider()
    const act = createTestActivity(p.id)

    // Create 2 parents, book, complete, review
    for (const [name, email, rating] of [['A', 'a@t.de', 5], ['B', 'b@t.de', 3]] as const) {
      const par = assertNotError(ParentService.create({ name, email, children: [{ name: `K${name}`, age: 5, emergencyContact: name, emergencyPhone: '1' }] }))
      const b = BookingService.create({ activityId: act.id, providerId: p.id, parentId: par.id, child: par.children[0], pricingOptionId: act.pricing[0].id })
      assert.ok(!('error' in b))
      BookingService.complete(b.booking.id)
      ReviewService.create({ activityId: act.id, providerId: p.id, parentId: par.id, rating })
    }

    const avg = ReviewService.getAverageRating(act.id)
    assert.equal(avg.average, 4)
    assert.equal(avg.count, 2)

    const dist = ReviewService.getRatingDistribution(p.id)
    assert.equal(dist[5], 1)
    assert.equal(dist[3], 1)
  })
})

// ============================================================
// ATTENDANCE SERVICE
// ============================================================

describe('AttendanceService', () => {
  beforeEach(resetAll)

  it('should check in and track rate', () => {
    const p = createTestProvider()
    const act = createTestActivity(p.id)
    const parent = createTestParent()
    const b = BookingService.create({ activityId: act.id, providerId: p.id, parentId: parent.id, child: parent.children[0], pricingOptionId: act.pricing[0].id })
    assert.ok(!('error' in b))

    assertNotError(AttendanceService.checkIn(b.booking.id, act.id, '2026-04-06'))
    assertNotError(AttendanceService.markAbsent(b.booking.id, act.id, '2026-04-13', 'Krank'))

    const rate = AttendanceService.getAttendanceRate(act.id)
    assert.equal(rate.total, 2)
    assert.equal(rate.present, 1)
    assert.equal(rate.rate, 0.5)
  })
})

// ============================================================
// MESSAGE SERVICE
// ============================================================

describe('MessageService', () => {
  beforeEach(resetAll)

  it('should send and track messages', () => {
    const p = createTestProvider()
    const parent = createTestParent()

    MessageService.send({ providerId: p.id, parentId: parent.id, type: 'direct', subject: 'Hallo', body: 'Test-Nachricht' })
    MessageService.send({ providerId: p.id, parentId: parent.id, type: 'direct', body: 'Zweite Nachricht' })

    assert.equal(MessageService.getUnreadCount(p.id), 2)
    const inbox = MessageService.getInbox(p.id)
    assert.equal(inbox.length, 2)

    MessageService.markAsRead(inbox[0].id)
    assert.equal(MessageService.getUnreadCount(p.id), 1)
  })

  it('should broadcast to activity participants', () => {
    const p = createTestProvider()
    const act = createTestActivity(p.id)
    const p1 = assertNotError(ParentService.create({ name: 'P1', email: 'p1@t.de', children: [{ name: 'K1', age: 5, emergencyContact: 'P1', emergencyPhone: '1' }] }))
    const p2 = assertNotError(ParentService.create({ name: 'P2', email: 'p2@t.de', children: [{ name: 'K2', age: 5, emergencyContact: 'P2', emergencyPhone: '2' }] }))

    BookingService.create({ activityId: act.id, providerId: p.id, parentId: p1.id, child: p1.children[0], pricingOptionId: act.pricing[0].id })
    BookingService.create({ activityId: act.id, providerId: p.id, parentId: p2.id, child: p2.children[0], pricingOptionId: act.pricing[0].id })

    const msgs = MessageService.broadcast(p.id, act.id, 'Info', 'Kurs fällt aus')
    assert.equal(msgs.length, 2)
  })
})

// ============================================================
// EXPANDED TESTS – Negative/Boundary Cases
// ============================================================

describe('ParentService – Email Uniqueness', () => {
  beforeEach(resetAll)

  it('should reject duplicate email', () => {
    const parent1 = ParentService.create({ name: 'A', email: 'test@test.de', children: [] })
    assert(!('error' in parent1))
    const parent2 = ParentService.create({ name: 'B', email: 'test@test.de', children: [] })
    assert('error' in parent2)
    assert(parent2.error.includes('bereits vergeben'))
  })

  it('should allow different emails', () => {
    const parent1 = ParentService.create({ name: 'A', email: 'a@test.de', children: [] })
    const parent2 = ParentService.create({ name: 'B', email: 'b@test.de', children: [] })
    assert(!('error' in parent1))
    assert(!('error' in parent2))
  })
})

describe('TeamService – Email Uniqueness', () => {
  beforeEach(resetAll)

  it('should reject duplicate email in same provider', () => {
    const provider = createTestProvider()
    ProviderService.activate(provider.id)
    const m1 = TeamService.create({ providerId: provider.id, name: 'A', email: 'trainer@test.de', role: 'instructor' })
    assert(!('error' in m1))
    const m2 = TeamService.create({ providerId: provider.id, name: 'B', email: 'trainer@test.de', role: 'instructor' })
    assert('error' in m2)
  })
})

describe('AttendanceService – Duplicate Prevention', () => {
  beforeEach(resetAll)

  it('should prevent duplicate check-in for same date', () => {
    const provider = createTestProvider()
    ProviderService.activate(provider.id)
    const activity = createTestActivity(provider.id)
    const parent = assertNotError(ParentService.create({ name: 'Test', email: 'att@test.de', children: [{ name: 'Kind', age: 5, emergencyContact: 'EC', emergencyPhone: '123' }] }))
    const result = BookingService.create({ activityId: activity.id, providerId: provider.id, parentId: parent.id, child: parent.children[0], pricingOptionId: activity.pricing[0].id })
    assert(!('error' in result), `Booking failed: ${'error' in result ? result.error : ''}`)

    const checkin1 = AttendanceService.checkIn(result.booking.id, activity.id, '2026-01-15')
    assert(!('error' in checkin1))
    const checkin2 = AttendanceService.checkIn(result.booking.id, activity.id, '2026-01-15')
    assert('error' in checkin2)
  })
})

describe('ProviderService – Status Transitions', () => {
  beforeEach(resetAll)

  it('should not activate archived provider', () => {
    const provider = createTestProvider()
    ProviderService.archive(provider.id)
    const result = ProviderService.activate(provider.id)
    assert.equal(result, undefined)
  })

  it('should not suspend archived provider', () => {
    const provider = createTestProvider()
    ProviderService.archive(provider.id)
    const result = ProviderService.suspend(provider.id)
    assert.equal(result, undefined)
  })
})

describe('BookingService – Confirm Waitlisted', () => {
  beforeEach(resetAll)

  it('should confirm a waitlisted booking', () => {
    const provider = createTestProvider()
    ProviderService.activate(provider.id)
    const activity = ActivityService.create({
      providerId: provider.id, title: 'Tiny Class', description: '', category: 'Sport',
      ageRange: { min: 3, max: 10 }, schedule: { type: 'recurring', slots: [{ day: 'MO', startTime: '10:00', endTime: '11:00' }], startDate: '2026-01-01' },
      capacity: 1, waitlistEnabled: true,
      pricing: [{ label: 'Single', type: 'single', amount: 50, currency: 'EUR' }],
    })
    ActivityService.publish(activity.id)

    const parent1 = assertNotError(ParentService.create({ name: 'P1', email: 'p1@test.de', children: [{ name: 'K1', age: 5, emergencyContact: 'EC', emergencyPhone: '123' }] }))
    const parent2 = assertNotError(ParentService.create({ name: 'P2', email: 'p2@test.de', children: [{ name: 'K2', age: 6, emergencyContact: 'EC', emergencyPhone: '456' }] }))

    const b1 = BookingService.create({ activityId: activity.id, providerId: provider.id, parentId: parent1.id, child: parent1.children[0], pricingOptionId: activity.pricing[0].id })
    assert(!('error' in b1) && b1.booking.status === 'confirmed')

    const b2 = BookingService.create({ activityId: activity.id, providerId: provider.id, parentId: parent2.id, child: parent2.children[0], pricingOptionId: activity.pricing[0].id })
    assert(!('error' in b2) && b2.booking.status === 'waitlisted')

    // Waitlisted Buchung direkt bestätigen
    const confirmed = BookingService.confirm(b2.booking.id)
    assert(confirmed !== undefined)
    assert.equal(confirmed!.status, 'confirmed')
  })
})

describe('ReviewService – Only Completed Bookings', () => {
  beforeEach(resetAll)

  it('should reject review for merely confirmed booking', () => {
    const provider = createTestProvider()
    ProviderService.activate(provider.id)
    const activity = createTestActivity(provider.id)
    const parent = assertNotError(ParentService.create({ name: 'Rev', email: 'rev@test.de', children: [{ name: 'K', age: 5, emergencyContact: 'EC', emergencyPhone: '123' }] }))
    const booking = BookingService.create({ activityId: activity.id, providerId: provider.id, parentId: parent.id, child: parent.children[0], pricingOptionId: activity.pricing[0].id })
    assert(!('error' in booking))
    // Booking is 'confirmed', NOT 'completed'
    const review = ReviewService.create({ activityId: activity.id, providerId: provider.id, parentId: parent.id, rating: 5 })
    assert('error' in review)
  })
})
