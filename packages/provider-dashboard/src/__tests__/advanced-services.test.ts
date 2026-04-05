// ============================================================
// Tests: 130% Services (Coupon, Trial, Waitlist, Invoice, etc.)
// ============================================================

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { store } from '../domain/store'
import { ProviderService } from '../services/provider.service'
import { ActivityService } from '../services/activity.service'
import { BookingService } from '../services/booking.service'
import { ParentService } from '../services/parent.service'
import { CouponService } from '../services/coupon.service'
import { TrialService } from '../services/trial.service'
import { WaitlistService } from '../services/waitlist.service'
import { InvoiceService } from '../services/invoice.service'
import { CalendarService } from '../services/calendar.service'
import { SeasonService, HolidayService } from '../services/season.service'
import { ContractService } from '../services/contract.service'
import { TeamService } from '../services/team.service'
import { BuTVoucherService } from '../services/but-voucher.service'
import { TrialConversionWorkflow, WaitlistConversionWorkflow, BackgroundJobs } from '../services/workflows'
import { Validators, schedulesOverlap } from '../services/validators'
import { ReportingService } from '../services/reporting.service'
import { resetIdCounter } from '../services/id'

function resetAll() { store.reset(); resetIdCounter() }

// Type-Narrowing Helpers für Union-Returns
function assertNotError<T>(result: T | { error: string }): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(`Unexpected error: ${result.error}`)
  }
  return result as T
}

function setup() {
  const provider = ProviderService.create({
    name: 'Test Provider', description: '', categories: ['Tanz'],
    address: { street: '', city: 'Köln', zip: '50667', country: 'DE' },
    contact: { email: 'test@test.de' },
  })
  ProviderService.activate(provider.id)

  const activity = ActivityService.create({
    providerId: provider.id, title: 'Testkurs', description: '', category: 'Tanz',
    ageRange: { min: 3, max: 10 }, capacity: 12, waitlistEnabled: true,
    schedule: { type: 'recurring', slots: [{ day: 'MO', startTime: '15:00', endTime: '16:00' }], startDate: '2026-04-06' },
    pricing: [{ label: 'Monat', type: 'subscription', amount: 50, currency: 'EUR', intervalMonths: 1 }],
  })
  ActivityService.publish(activity.id)

  const parent = assertNotError(ParentService.create({
    name: 'Test Eltern', email: 'eltern@test.de',
    children: [
      { name: 'Kind1', age: 5, emergencyContact: 'Test', emergencyPhone: '123' },
      { name: 'Kind2', age: 7, emergencyContact: 'Test', emergencyPhone: '123' },
    ],
  }))

  return { provider, activity, parent }
}

// ============================================================
// COUPON SERVICE
// ============================================================

describe('CouponService', () => {
  beforeEach(resetAll)

  it('should create and validate coupons', () => {
    const { provider, activity } = setup()

    const coupon = CouponService.create({
      providerId: provider.id, code: 'TEST20', type: 'percentage', value: 20,
      maxUses: 10, validFrom: new Date('2026-01-01'), validUntil: new Date('2026-12-31'),
    })
    assert.ok(!('error' in coupon))

    const result = CouponService.validate('TEST20', activity.id, 50)
    assert.equal(result.valid, true)
    assert.equal(result.discount, 10) // 20% of 50
  })

  it('should prevent duplicate codes', () => {
    const { provider } = setup()
    CouponService.create({ providerId: provider.id, code: 'SAME', type: 'fixed_amount', value: 5, validFrom: new Date(), validUntil: new Date('2027-01-01') })
    const dup = CouponService.create({ providerId: provider.id, code: 'SAME', type: 'fixed_amount', value: 5, validFrom: new Date(), validUntil: new Date('2027-01-01') })
    assert.ok('error' in dup)
  })

  it('should apply coupon in booking flow', () => {
    const { provider, activity, parent } = setup()
    CouponService.create({ providerId: provider.id, code: 'GRATIS', type: 'free_trial', value: 0, validFrom: new Date('2026-01-01'), validUntil: new Date('2026-12-31') })

    const result = BookingService.create({
      activityId: activity.id, providerId: provider.id, parentId: parent.id,
      child: parent.children[0], pricingOptionId: activity.pricing[0].id,
      couponCode: 'GRATIS',
    })
    assert.ok(!('error' in result))
    assert.equal(result.discountApplied, 50) // full amount
    assert.equal(result.booking.paymentStatus, 'paid') // free!
  })

  it('should reject expired coupons', () => {
    const { provider, activity } = setup()
    CouponService.create({ providerId: provider.id, code: 'OLD', type: 'percentage', value: 10, validFrom: new Date('2020-01-01'), validUntil: new Date('2020-12-31') })
    const result = CouponService.validate('OLD', activity.id, 50)
    assert.equal(result.valid, false)
  })
})

// ============================================================
// TRIAL SERVICE + CONVERSION WORKFLOW
// ============================================================

describe('TrialService', () => {
  beforeEach(resetAll)

  it('should create and complete trial lessons', () => {
    const { provider, activity, parent } = setup()

    const trial = TrialService.create({
      activityId: activity.id, providerId: provider.id, parentId: parent.id,
      child: parent.children[0], scheduledDate: '2026-04-08', scheduledTime: '15:00',
    })
    assert.ok(!('error' in trial))
    assert.equal(trial.status, 'scheduled')

    TrialService.complete(trial.id, 'Kind hatte Spaß!')
    assert.equal(TrialService.getById(trial.id)?.status, 'completed')
  })

  it('should prevent duplicate trials', () => {
    const { provider, activity, parent } = setup()
    TrialService.create({ activityId: activity.id, providerId: provider.id, parentId: parent.id, child: parent.children[0], scheduledDate: '2026-04-08', scheduledTime: '15:00' })
    const dup = TrialService.create({ activityId: activity.id, providerId: provider.id, parentId: parent.id, child: parent.children[0], scheduledDate: '2026-04-15', scheduledTime: '15:00' })
    assert.ok('error' in dup)
  })

  it('should convert trial to booking', () => {
    const { provider, activity, parent } = setup()
    const trial = TrialService.create({ activityId: activity.id, providerId: provider.id, parentId: parent.id, child: parent.children[0], scheduledDate: '2026-04-08', scheduledTime: '15:00' })
    assert.ok(!('error' in trial))
    TrialService.complete(trial.id)

    const result = TrialConversionWorkflow.convert(trial.id, activity.pricing[0].id)
    assert.ok(!('error' in result))
    assert.ok(result.bookingId)

    const booking = BookingService.getById(result.bookingId)
    assert.equal(booking?.status, 'confirmed')
    assert.equal(TrialService.getById(trial.id)?.status, 'converted')
  })

  it('should track conversion stats', () => {
    const { provider, activity, parent } = setup()

    // Create 3 trials: 1 converted, 1 completed, 1 no-show
    const t1 = TrialService.create({ activityId: activity.id, providerId: provider.id, parentId: parent.id, child: parent.children[0], scheduledDate: '2026-04-08', scheduledTime: '15:00' })
    assert.ok(!('error' in t1))
    TrialService.complete(t1.id)
    TrialConversionWorkflow.convert(t1.id, activity.pricing[0].id)

    const p2 = assertNotError(ParentService.create({ name: 'P2', email: 'p2@t.de', children: [{ name: 'K2', age: 5, emergencyContact: 'P2', emergencyPhone: '1' }] }))
    const t2 = TrialService.create({ activityId: activity.id, providerId: provider.id, parentId: p2.id, child: p2.children[0], scheduledDate: '2026-04-09', scheduledTime: '15:00' })
    assert.ok(!('error' in t2))
    TrialService.complete(t2.id)

    const p3 = assertNotError(ParentService.create({ name: 'P3', email: 'p3@t.de', children: [{ name: 'K3', age: 5, emergencyContact: 'P3', emergencyPhone: '1' }] }))
    const t3 = TrialService.create({ activityId: activity.id, providerId: provider.id, parentId: p3.id, child: p3.children[0], scheduledDate: '2026-04-10', scheduledTime: '15:00' })
    assert.ok(!('error' in t3))
    TrialService.markNoShow(t3.id)

    const stats = TrialService.getConversionStats(provider.id)
    assert.equal(stats.total, 3)
    assert.equal(stats.converted, 1)
    assert.equal(stats.noShow, 1)
    assert.equal(stats.conversionRate, 0.5) // 1 converted out of 2 completed
  })
})

// ============================================================
// WAITLIST SERVICE + CONVERSION
// ============================================================

describe('WaitlistService', () => {
  beforeEach(resetAll)

  it('should manage priority-based waitlist', () => {
    const { activity, parent } = setup()
    const p2 = assertNotError(ParentService.create({ name: 'P2', email: 'p2@t.de', children: [{ name: 'Sibling', age: 5, emergencyContact: 'P2', emergencyPhone: '1' }] }))

    const e1 = assertNotError(WaitlistService.add({ activityId: activity.id, parentId: parent.id, child: parent.children[0], priority: 'normal' }))
    const e2 = assertNotError(WaitlistService.add({ activityId: activity.id, parentId: p2.id, child: p2.children[0], priority: 'sibling' }))

    const list = WaitlistService.listByActivity(activity.id)
    assert.equal(list[0].id, e2.id) // sibling comes first
    assert.equal(list[1].id, e1.id)
  })

  it('should convert waitlist to booking', () => {
    const { provider, activity, parent } = setup()
    const entry = assertNotError(WaitlistService.add({ activityId: activity.id, parentId: parent.id, child: parent.children[0] }))
    WaitlistService.offerNextSpot(activity.id)

    const result = WaitlistConversionWorkflow.acceptAndBook(entry.id, activity.pricing[0].id)
    assert.ok(!('error' in result))

    const booking = BookingService.getById(result.bookingId)
    assert.equal(booking?.status, 'confirmed')
    assert.equal(WaitlistService.getById(entry.id)?.status, 'accepted')
  })
})

// ============================================================
// INVOICE SERVICE
// ============================================================

describe('InvoiceService', () => {
  beforeEach(resetAll)

  it('should create invoice from booking', () => {
    const { provider, activity, parent } = setup()
    const b = BookingService.create({ activityId: activity.id, providerId: provider.id, parentId: parent.id, child: parent.children[0], pricingOptionId: activity.pricing[0].id })
    assert.ok(!('error' in b))

    const inv = InvoiceService.createFromBooking(b.booking.id, 0.19)
    assert.ok(!('error' in inv))
    assert.ok(inv.number.startsWith('INV-'))
    assert.equal(inv.status, 'draft')
    assert.ok(inv.subtotal > 0)
    assert.ok(inv.tax > 0)
  })

  it('should prevent duplicate invoice for same booking', () => {
    const { provider, activity, parent } = setup()
    const b = BookingService.create({ activityId: activity.id, providerId: provider.id, parentId: parent.id, child: parent.children[0], pricingOptionId: activity.pricing[0].id })
    assert.ok(!('error' in b))

    InvoiceService.createFromBooking(b.booking.id)
    const dup = InvoiceService.createFromBooking(b.booking.id)
    assert.ok('error' in dup)
    assert.ok(dup.error.includes('bereits'))
  })

  it('should send and track VAT summary', () => {
    const { provider, activity, parent } = setup()
    const b = BookingService.create({ activityId: activity.id, providerId: provider.id, parentId: parent.id, child: parent.children[0], pricingOptionId: activity.pricing[0].id })
    assert.ok(!('error' in b))
    const inv = InvoiceService.createFromBooking(b.booking.id)
    assert.ok(!('error' in inv))

    InvoiceService.send(inv.id)
    InvoiceService.markPaid(inv.id)

    const summary = InvoiceService.getVatSummary(provider.id, 2026)
    assert.ok(summary.totalGross > 0)
    assert.equal(summary.paidInvoices, 1)
  })
})

// ============================================================
// SEASON & HOLIDAYS
// ============================================================

describe('SeasonService & HolidayService', () => {
  beforeEach(resetAll)

  it('should manage seasons', () => {
    const { provider } = setup()
    const s1 = SeasonService.create({ providerId: provider.id, name: '1. HJ', type: 'school_term', startDate: '2026-02-01', endDate: '2026-07-31' })
    const s2 = SeasonService.create({ providerId: provider.id, name: '2. HJ', type: 'school_term', startDate: '2026-08-01', endDate: '2027-01-31' })

    SeasonService.activate(s1.id)
    assert.equal(SeasonService.getActiveSeason(provider.id)?.id, s1.id)

    SeasonService.activate(s2.id)
    assert.equal(SeasonService.getActiveSeason(provider.id)?.id, s2.id)
    assert.equal(SeasonService.getById(s1.id)?.isActive, false) // deactivated
  })

  it('should import NRW holidays', () => {
    const { provider } = setup()
    const holidays = HolidayService.importGermanHolidays(provider.id, 'NRW')
    assert.ok(holidays.length >= 4) // At least Oster, Sommer, Herbst, Weihnachten

    const summer = holidays.find((h) => h.name.includes('Sommer'))
    assert.ok(summer)
  })

  it('should detect holiday conflicts', () => {
    const { provider } = setup()
    HolidayService.create({ providerId: provider.id, name: 'Ferien', startDate: '2026-04-06', endDate: '2026-04-10', cancelActivities: true })

    const check = Validators.dateNotInHoliday(provider.id, '2026-04-07')
    assert.equal(check.valid, false)
    assert.ok(check.errors[0].includes('Ferien'))

    const ok = Validators.dateNotInHoliday(provider.id, '2026-04-15')
    assert.equal(ok.valid, true)
  })
})

// ============================================================
// CONTRACT SERVICE (Scheinselbständigkeit)
// ============================================================

describe('ContractService', () => {
  beforeEach(resetAll)

  it('should assess freelance risk', () => {
    const { provider } = setup()
    const trainer = assertNotError(TeamService.create({ providerId: provider.id, name: 'Lisa', email: 'l@t.de', role: 'instructor' }))

    // High risk: no freelance indicators documented
    const contract = ContractService.create({
      providerId: provider.id, teamMemberId: trainer.id, type: 'freelance',
      title: 'Honorarvertrag', startDate: '2026-01-01',
      compensation: { type: 'hourly', amount: 30 },
    })
    ContractService.activate(contract.id)

    const risk = ContractService.assessFreelanceRisk(contract.id)
    assert.equal(risk.riskLevel, 'critical')
    assert.ok(risk.recommendations.length > 0)
  })

  it('should score lower risk with good indicators', () => {
    const { provider } = setup()
    const trainer = assertNotError(TeamService.create({ providerId: provider.id, name: 'Marco', email: 'm@t.de', role: 'instructor' }))

    const contract = ContractService.create({
      providerId: provider.id, teamMemberId: trainer.id, type: 'freelance',
      title: 'Honorarvertrag', startDate: '2026-01-01',
      compensation: { type: 'per_session', amount: 60 },
      freelanceIndicators: {
        ownSchedule: true, ownStudents: true, ownMaterials: true,
        ownLocation: false, multipleClients: true, substitutionRight: true, noInstructions: true,
      },
    })

    const risk = ContractService.assessFreelanceRisk(contract.id)
    assert.equal(risk.riskLevel, 'low')
    assert.ok(risk.positiveIndicators.length >= 5)
  })

  it('should warn about transition deadline', () => {
    const warning = ContractService.getTransitionDeadlineWarning()
    assert.equal(warning.deadline, '2026-12-31')
    assert.ok(warning.daysRemaining > 0)
    assert.ok(warning.message.includes('Übergangsfrist'))
  })
})

// ============================================================
// BuT VOUCHER SERVICE
// ============================================================

describe('BuTVoucherService', () => {
  beforeEach(resetAll)

  it('should create and redeem vouchers', () => {
    const { provider, parent } = setup()

    const voucher = BuTVoucherService.create({
      providerId: provider.id, parentId: parent.id, childName: 'Kind1',
      voucherNumber: 'BUT-2026-001', issuingAuthority: 'Jobcenter Köln',
      validFrom: '2026-01-01', validUntil: '2026-12-31',
    })
    assert.equal(voucher.monthlyAmount, 15)
    assert.equal(voucher.status, 'submitted')

    BuTVoucherService.approve(voucher.id)
    BuTVoucherService.redeemMonthly(voucher.id, '2026-04')

    const updated = BuTVoucherService.getById(voucher.id)!
    assert.equal(updated.totalRedeemed, 15)
    assert.equal(updated.status, 'redeemed')
  })

  it('should track stats', () => {
    const { provider, parent } = setup()
    BuTVoucherService.create({ providerId: provider.id, parentId: parent.id, childName: 'Kind1', voucherNumber: 'V1', issuingAuthority: 'JC', validFrom: '2026-01-01', validUntil: '2026-12-31' })
    BuTVoucherService.create({ providerId: provider.id, parentId: parent.id, childName: 'Kind2', voucherNumber: 'V2', issuingAuthority: 'JC', validFrom: '2026-01-01', validUntil: '2026-12-31' })

    const stats = BuTVoucherService.getStats(provider.id)
    assert.equal(stats.totalVouchers, 2)
    assert.equal(stats.childrenSupported, 2)
  })
})

// ============================================================
// REPORTING SERVICE
// ============================================================

describe('ReportingService', () => {
  beforeEach(resetAll)

  it('should generate dashboard summary', () => {
    const { provider, activity, parent } = setup()
    BookingService.create({ activityId: activity.id, providerId: provider.id, parentId: parent.id, child: parent.children[0], pricingOptionId: activity.pricing[0].id })

    const summary = ReportingService.getDashboardSummary(provider.id)
    assert.equal(summary.totalActivities, 1)
    assert.equal(summary.publishedActivities, 1)
    assert.equal(summary.totalBookings, 1)
    assert.equal(summary.confirmedBookings, 1)
    assert.equal(summary.unpaidBookings, 1)
  })

  it('should parse period filters correctly', () => {
    const { provider, activity, parent } = setup()
    const b = BookingService.create({ activityId: activity.id, providerId: provider.id, parentId: parent.id, child: parent.children[0], pricingOptionId: activity.pricing[0].id })
    assert.ok(!('error' in b))
    BookingService.markPaid(b.booking.id, 50)

    const report = ReportingService.getRevenueReport(provider.id, '2026-Q2')
    assert.equal(report.totalBookings, 1)
    assert.equal(report.totalRevenue, 50)
  })

  it('should calculate churn rate', () => {
    const { provider, activity, parent } = setup()
    BookingService.create({ activityId: activity.id, providerId: provider.id, parentId: parent.id, child: parent.children[0], pricingOptionId: activity.pricing[0].id })

    const churn = ReportingService.getChurnRate(provider.id, 3)
    assert.equal(churn.totalCustomers, 1)
    assert.equal(churn.activeCustomers, 1)
    assert.equal(churn.churnedCustomers, 0)
  })
})

// ============================================================
// VALIDATORS
// ============================================================

describe('Validators', () => {
  beforeEach(resetAll)

  it('should validate IBAN format', () => {
    assert.equal(Validators.ibanValid('DE89370400440532013000').valid, true)
    assert.equal(Validators.ibanValid('DE123').valid, false) // too short
    assert.equal(Validators.ibanValid('INVALID').valid, false)
  })

  it('should validate email format', () => {
    assert.equal(Validators.emailValid('test@example.de').valid, true)
    assert.equal(Validators.emailValid('not-an-email').valid, false)
  })

  it('should validate date ranges', () => {
    assert.equal(Validators.dateRangeValid('2026-01-01', '2026-12-31').valid, true)
    assert.equal(Validators.dateRangeValid('2026-12-31', '2026-01-01').valid, false)
  })

  it('should validate child age in range', () => {
    const child = { name: 'Test', age: 5, emergencyContact: 'X', emergencyPhone: '1' }
    assert.equal(Validators.childAgeInRange(child, { min: 3, max: 7 }).valid, true)
    assert.equal(Validators.childAgeInRange(child, { min: 6, max: 10 }).valid, false)
  })
})

// ============================================================
// EXPANDED TESTS – Negative/Boundary Cases
// ============================================================

function setupWithBooking() {
  const s = setup()
  const result = BookingService.create({
    activityId: s.activity.id, providerId: s.provider.id, parentId: s.parent.id,
    child: s.parent.children[0], pricingOptionId: s.activity.pricing[0].id,
  })
  assert(!('error' in result))
  return { ...s, booking: (result as any).booking }
}

describe('WaitlistService – Duplicate Prevention', () => {
  beforeEach(resetAll)

  it('should reject duplicate child on waitlist', () => {
    const { activity, parent } = setupWithBooking()
    const entry1 = WaitlistService.add({ activityId: activity.id, parentId: parent.id, child: parent.children[0] })
    assert(!('error' in entry1))
    const entry2 = WaitlistService.add({ activityId: activity.id, parentId: parent.id, child: parent.children[0] })
    assert('error' in entry2)
  })
})

describe('CouponService – Re-validation on Redeem', () => {
  beforeEach(resetAll)

  it('should reject redeem of deactivated coupon', () => {
    const s = setup()
    const coupon = CouponService.create({ providerId: s.provider.id, code: 'TEST10', type: 'percentage', value: 10, validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000) })
    assert(!('error' in coupon))
    CouponService.deactivate(coupon.id)
    const result = CouponService.redeem(coupon.id, 'fake-booking', 'fake-parent', 5)
    assert('error' in result)
    assert(result.error.includes('nicht mehr aktiv'))
  })
})

describe('Validators – IBAN MOD-97', () => {
  beforeEach(resetAll)

  it('should accept valid German IBAN', () => {
    const result = Validators.ibanValid('DE89 3704 0044 0532 0130 00')
    assert.equal(result.valid, true)
  })

  it('should reject IBAN with wrong checksum', () => {
    const result = Validators.ibanValid('DE00 3704 0044 0532 0130 00')
    assert.equal(result.valid, false)
    assert(result.errors.some((e: string) => e.includes('Prüfsumme')))
  })
})

describe('Validators – Mixed Schedule Overlap', () => {
  beforeEach(resetAll)

  it('should detect single vs recurring overlap', () => {
    const single = { type: 'single' as const, date: '2026-01-05', startTime: '10:00', endTime: '11:00' }
    const recurring = { type: 'recurring' as const, slots: [{ day: 'MO' as const, startTime: '09:30', endTime: '10:30' }], startDate: '2026-01-01' }
    // 2026-01-05 is a Monday
    assert.equal(schedulesOverlap(single, recurring), true)
  })

  it('should not detect single vs recurring on different day', () => {
    const single = { type: 'single' as const, date: '2026-01-06', startTime: '10:00', endTime: '11:00' }
    const recurring = { type: 'recurring' as const, slots: [{ day: 'MO' as const, startTime: '09:30', endTime: '10:30' }], startDate: '2026-01-01' }
    // 2026-01-06 is a Tuesday
    assert.equal(schedulesOverlap(single, recurring), false)
  })
})
