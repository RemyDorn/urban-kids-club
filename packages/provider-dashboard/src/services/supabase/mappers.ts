// ============================================================
// Supabase Mappers – DB (snake_case) ↔ App (camelCase)
// ============================================================

import type {
  Provider, Activity, Booking, Parent, Invoice, CalendarEvent,
  Location, CourseBlock, BlockSession, BlockEnrollment, SessionCredit,
  MakeupBooking, WidgetConfig, Coupon, CouponRedemption, PaymentRecord,
  SepaMandate, Season, Holiday, Notification, AuditLogEntry,
  WaitlistEntry, ExportRequest, ContactNote, AutomationFlow,
  MessageTemplate, MarketingCampaign, TrialLesson, Message,
  ProviderDocument,
  Address, ContactInfo, AgeRange, PricingOption, Schedule,
  PlatformListing, ChildInfo, InvoiceLineItem,
  ID,
} from '../../types'

// --- Helpers ---

function toDate(v: string | null | undefined): Date {
  return v ? new Date(v) : new Date()
}

function toDateOrUndef(v: string | null | undefined): Date | undefined {
  return v ? new Date(v) : undefined
}

function toIso(d: Date | undefined | null): string | null {
  return d ? d.toISOString() : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

// ============================================================
// Provider
// ============================================================

export function providerFromDb(r: Row): Provider {
  return {
    id: r.id,
    name: r.company_name ?? '',
    slug: r.slug ?? '',
    description: r.description ?? '',
    logo: r.logo_url ?? undefined,
    address: {
      street: r.address_street ?? '',
      city: r.address_city ?? '',
      zip: r.address_zip ?? '',
      country: 'DE',
      lat: r.latitude ?? undefined,
      lng: r.longitude ?? undefined,
    },
    contact: {
      email: r.email ?? '',
      phone: r.phone ?? undefined,
      website: r.website_url ?? undefined,
    },
    categories: r.categories ?? [],
    status: r.status ?? 'onboarding',
    subscription: r.subscription ?? 'free',
    platformEnabled: r.platform_enabled ?? false,
    roomCount: r.room_count ?? 1,
    openingHours: r.opening_hours ?? undefined,
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
  }
}

export function providerToDb(p: Partial<Provider> & { id?: ID }): Row {
  const row: Row = {}
  if (p.id !== undefined) row.id = p.id
  if (p.name !== undefined) row.company_name = p.name
  if (p.slug !== undefined) row.slug = p.slug
  if (p.description !== undefined) row.description = p.description
  if (p.logo !== undefined) row.logo_url = p.logo
  if (p.address) {
    row.address_street = p.address.street
    row.address_city = p.address.city
    row.address_zip = p.address.zip
    row.latitude = p.address.lat ?? null
    row.longitude = p.address.lng ?? null
  }
  if (p.contact) {
    row.email = p.contact.email
    row.phone = p.contact.phone ?? null
    row.website_url = p.contact.website ?? null
  }
  if (p.categories !== undefined) row.categories = p.categories
  if (p.status !== undefined) row.status = p.status
  if (p.subscription !== undefined) row.subscription = p.subscription
  if ((p as any).booking_redirect_url !== undefined) row.booking_redirect_url = (p as any).booking_redirect_url
  if (p.roomCount !== undefined) row.room_count = p.roomCount
  if ((p as any).room_count !== undefined) row.room_count = (p as any).room_count
  if (p.openingHours !== undefined) row.opening_hours = p.openingHours
  if ((p as any).opening_hours !== undefined) row.opening_hours = (p as any).opening_hours
  return row
}

// ============================================================
// Activity
// ============================================================

export function activityFromDb(r: Row): Activity {
  return {
    id: r.id,
    providerId: r.provider_id,
    locationId: r.location_id ?? undefined,
    instructorId: r.instructor_id ?? undefined,
    title: r.title ?? '',
    description: r.description ?? '',
    category: r.category ?? '',
    ageRange: { min: r.age_group_min ?? 0, max: r.age_group_max ?? 18 },
    schedule: r.schedule ?? { type: 'recurring', slots: [], startDate: '' },
    capacity: r.capacity ?? 0,
    waitlistEnabled: r.waitlist_enabled ?? false,
    trialEnabled: r.trial_enabled ?? false,
    pricing: r.pricing ?? [],
    platformListing: r.platform_listing ?? undefined,
    color: r.color ?? undefined,
    images: r.images ?? [],
    media: r.images ?? [],
    tags: r.tags ?? [],
    paymentOnline: r.payment_online ?? false,
    paymentOnsite: r.payment_onsite ?? true,
    status: r.status ?? 'draft',
    slug: r.slug,
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
  } as Activity & { slug?: string }
}

export function activityToDb(a: Partial<Activity> & { id?: ID; providerId?: ID }): Row {
  const row: Row = {}
  if (a.id !== undefined) row.id = a.id
  if (a.providerId !== undefined) row.provider_id = a.providerId
  if (a.title !== undefined) row.title = a.title
  if (a.description !== undefined) row.description = a.description
  if (a.category !== undefined) row.category = a.category
  if (a.ageRange) {
    row.age_group_min = a.ageRange.min
    row.age_group_max = a.ageRange.max
  }
  if (a.schedule !== undefined) row.schedule = a.schedule
  if (a.capacity !== undefined) row.capacity = a.capacity
  if (a.pricing !== undefined) row.pricing = a.pricing
  if (a.platformListing !== undefined) row.platform_listing = a.platformListing
  if (a.color !== undefined) row.color = a.color
  if (a.images !== undefined) row.images = a.images
  if (a.tags !== undefined) row.tags = a.tags
  if (a.status !== undefined) row.status = a.status
  if ((a as Record<string, unknown>).locationId !== undefined) row.location_id = (a as Record<string, unknown>).locationId ?? null
  if ((a as Record<string, unknown>).instructorId !== undefined) row.instructor_id = (a as Record<string, unknown>).instructorId ?? null
  if (a.waitlistEnabled !== undefined) row.waitlist_enabled = a.waitlistEnabled
  if (a.trialEnabled !== undefined) row.trial_enabled = a.trialEnabled
  if ((a as Record<string, unknown>).paymentOnline !== undefined) row.payment_online = (a as Record<string, unknown>).paymentOnline ?? false
  if ((a as Record<string, unknown>).paymentOnsite !== undefined) row.payment_onsite = (a as Record<string, unknown>).paymentOnsite ?? true
  // Calculate duration from schedule if available, default 60
  if (a.schedule && (a.schedule as any).slots?.[0]) {
    const slot = (a.schedule as any).slots[0]
    if (slot.startTime && slot.endTime) {
      const [sh, sm] = slot.startTime.split(':').map(Number)
      const [eh, em] = slot.endTime.split(':').map(Number)
      row.duration_minutes = (eh * 60 + em) - (sh * 60 + sm)
    }
  }
  if (!row.duration_minutes) row.duration_minutes = 60
  return row
}

// ============================================================
// Booking (provider_bookings table)
// ============================================================

export function bookingFromDb(r: Row): Booking {
  const ci = r.child_info ?? {} as any
  const childName = ci.name || [ci.firstName, ci.lastName].filter(Boolean).join(' ') || ''
  const childAge = ci.age || (ci.birthYear ? new Date().getFullYear() - ci.birthYear : 0)
  return {
    id: r.id,
    activityId: r.activity_id,
    providerId: r.provider_id,
    parentId: r.parent_id,
    child: { name: childName, age: childAge, firstName: ci.firstName, lastName: ci.lastName, birthYear: ci.birthYear },
    pricingOptionId: r.pricing_option_id ?? '',
    status: r.status ?? 'pending',
    paymentStatus: r.payment_status ?? 'unpaid',
    amountPaid: r.amount_paid ?? 0,
    currency: r.currency ?? 'EUR',
    source: r.source ?? 'direct',
    notes: r.notes ?? undefined,
    paymentMethod: r.payment_method ?? 'onsite',
    stripeSessionId: r.stripe_session_id ?? null,
    paypalOrderId: r.paypal_order_id ?? null,
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
  }
}

export function bookingToDb(b: Partial<Booking> & { id?: ID }): Row {
  const row: Row = {}
  if (b.id !== undefined) row.id = b.id
  if (b.activityId !== undefined) row.activity_id = b.activityId
  if (b.providerId !== undefined) row.provider_id = b.providerId
  if (b.parentId !== undefined) row.parent_id = b.parentId
  if (b.child !== undefined) row.child_info = b.child
  if (b.pricingOptionId !== undefined) row.pricing_option_id = b.pricingOptionId
  if (b.status !== undefined) row.status = b.status
  if (b.paymentStatus !== undefined) row.payment_status = b.paymentStatus
  if (b.amountPaid !== undefined) row.amount_paid = b.amountPaid
  if (b.currency !== undefined) row.currency = b.currency
  if (b.source !== undefined) row.source = b.source
  if (b.notes !== undefined) row.notes = b.notes
  return row
}

// ============================================================
// Parent
// ============================================================

export function parentFromDb(r: Row): Parent {
  return {
    id: r.id,
    name: r.name ?? '',
    email: r.email ?? '',
    phone: r.phone ?? undefined,
    children: r.children ?? [],
    createdAt: toDate(r.created_at),
  }
}

export function parentToDb(p: Partial<Parent> & { id?: ID }): Row {
  const row: Row = {}
  if (p.id !== undefined) row.id = p.id
  if (p.name !== undefined) row.name = p.name
  if (p.email !== undefined) row.email = p.email
  if (p.phone !== undefined) row.phone = p.phone
  if (p.children !== undefined) row.children = p.children
  return row
}

// ============================================================
// Invoice
// ============================================================

export function invoiceFromDb(r: Row): Invoice {
  return {
    id: r.id,
    providerId: r.provider_id,
    parentId: r.parent_id,
    bookingIds: r.booking_ids ?? [],
    number: r.number ?? '',
    lineItems: r.line_items ?? [],
    subtotal: r.subtotal ?? 0,
    tax: r.tax ?? 0,
    total: r.total ?? 0,
    currency: r.currency ?? 'EUR',
    status: r.status ?? 'draft',
    issuedAt: toDate(r.issued_at),
    dueDate: toDate(r.due_date),
    paidAt: toDateOrUndef(r.paid_at),
  }
}

export function invoiceToDb(i: Partial<Invoice> & { id?: ID }): Row {
  const row: Row = {}
  if (i.id !== undefined) row.id = i.id
  if (i.providerId !== undefined) row.provider_id = i.providerId
  if (i.parentId !== undefined) row.parent_id = i.parentId
  if (i.bookingIds !== undefined) row.booking_ids = i.bookingIds
  if (i.number !== undefined) row.number = i.number
  if (i.lineItems !== undefined) row.line_items = i.lineItems
  if (i.subtotal !== undefined) row.subtotal = i.subtotal
  if (i.tax !== undefined) row.tax = i.tax
  if (i.total !== undefined) row.total = i.total
  if (i.currency !== undefined) row.currency = i.currency
  if (i.status !== undefined) row.status = i.status
  if (i.issuedAt !== undefined) row.issued_at = toIso(i.issuedAt)
  if (i.dueDate !== undefined) row.due_date = toIso(i.dueDate)
  if (i.paidAt !== undefined) row.paid_at = toIso(i.paidAt)
  return row
}

// ============================================================
// CalendarEvent
// ============================================================

export function calendarEventFromDb(r: Row): CalendarEvent {
  return {
    id: r.id,
    providerId: r.provider_id,
    activityId: r.activity_id ?? undefined,
    locationId: r.location_id ?? undefined,
    instructorId: r.instructor_id ?? undefined,
    title: r.title ?? '',
    description: r.description ?? undefined,
    date: r.date ?? '',
    startTime: r.start_time ?? '',
    endTime: r.end_time ?? '',
    recurring: r.recurring ?? false,
    recurrenceRule: r.recurrence_rule ?? undefined,
    color: r.color ?? undefined,
    type: r.type ?? 'custom',
  }
}

export function calendarEventToDb(e: Partial<CalendarEvent> & { id?: ID }): Row {
  const row: Row = {}
  if (e.id !== undefined) row.id = e.id
  if (e.providerId !== undefined) row.provider_id = e.providerId
  if (e.activityId !== undefined) row.activity_id = e.activityId ?? null
  if (e.locationId !== undefined) row.location_id = e.locationId ?? null
  if (e.instructorId !== undefined) row.instructor_id = e.instructorId ?? null
  if (e.title !== undefined) row.title = e.title
  if (e.description !== undefined) row.description = e.description
  if (e.date !== undefined) row.date = e.date
  if (e.startTime !== undefined) row.start_time = e.startTime
  if (e.endTime !== undefined) row.end_time = e.endTime
  if (e.recurring !== undefined) row.recurring = e.recurring
  if (e.recurrenceRule !== undefined) row.recurrence_rule = e.recurrenceRule
  if (e.color !== undefined) row.color = e.color
  if (e.type !== undefined) row.type = e.type
  return row
}

// ============================================================
// Location
// ============================================================

export function locationFromDb(r: Row): Location {
  return {
    id: r.id,
    providerId: r.provider_id,
    name: r.name ?? '',
    address: {
      street: r.street ?? '',
      city: r.city ?? '',
      zip: r.zip ?? '',
      country: r.country ?? 'DE',
      lat: r.lat ?? undefined,
      lng: r.lng ?? undefined,
    },
    rooms: r.rooms ?? undefined,
    capacity: r.capacity ?? undefined,
  }
}

export function locationToDb(l: Partial<Location> & { id?: ID }): Row {
  const row: Row = {}
  if (l.id !== undefined) row.id = l.id
  if (l.providerId !== undefined) row.provider_id = l.providerId
  if (l.name !== undefined) row.name = l.name
  if (l.address) {
    row.street = l.address.street
    row.city = l.address.city
    row.zip = l.address.zip
    row.country = l.address.country ?? 'DE'
    row.lat = l.address.lat ?? null
    row.lng = l.address.lng ?? null
  }
  if (l.rooms !== undefined) row.rooms = l.rooms
  if (l.capacity !== undefined) row.capacity = l.capacity
  return row
}

// ============================================================
// CourseBlock
// ============================================================

export function courseBlockFromDb(r: Row): CourseBlock {
  return {
    id: r.id,
    providerId: r.provider_id,
    activityId: r.activity_id,
    activityType: r.activity_type ?? '',
    seasonLabel: r.season_label ?? '',
    totalSessions: r.total_sessions ?? 8,
    startDate: r.start_date ?? '',
    endDate: r.end_date ?? '',
    extendedEndDate: r.extended_end_date ?? undefined,
    recurringDay: r.recurring_day ?? 'MO',
    recurringTime: r.recurring_time ?? '00:00',
    durationMinutes: r.duration_minutes ?? 60,
    pricePerBlock: r.price_per_block ?? 0,
    currency: r.currency ?? 'EUR',
    capacity: r.capacity ?? 10,
    makeupCapacity: r.makeup_capacity ?? 2,
    maxCreditsPerEnrollment: r.max_credits_per_enrollment ?? 2,
    cancellationDeadlineMinutes: r.cancellation_deadline_minutes ?? 1440,
    status: r.status ?? 'upcoming',
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
  }
}

export function courseBlockToDb(b: Partial<CourseBlock> & { id?: ID }): Row {
  const row: Row = {}
  if (b.id !== undefined) row.id = b.id
  if (b.providerId !== undefined) row.provider_id = b.providerId
  if (b.activityId !== undefined) row.activity_id = b.activityId
  if (b.activityType !== undefined) row.activity_type = b.activityType
  if (b.seasonLabel !== undefined) row.season_label = b.seasonLabel
  if (b.totalSessions !== undefined) row.total_sessions = b.totalSessions
  if (b.startDate !== undefined) row.start_date = b.startDate
  if (b.endDate !== undefined) row.end_date = b.endDate
  if (b.extendedEndDate !== undefined) row.extended_end_date = b.extendedEndDate ?? null
  if (b.recurringDay !== undefined) row.recurring_day = b.recurringDay
  if (b.recurringTime !== undefined) row.recurring_time = b.recurringTime
  if (b.durationMinutes !== undefined) row.duration_minutes = b.durationMinutes
  if (b.pricePerBlock !== undefined) row.price_per_block = b.pricePerBlock
  if (b.currency !== undefined) row.currency = b.currency
  if (b.capacity !== undefined) row.capacity = b.capacity
  if (b.makeupCapacity !== undefined) row.makeup_capacity = b.makeupCapacity
  if (b.maxCreditsPerEnrollment !== undefined) row.max_credits_per_enrollment = b.maxCreditsPerEnrollment
  if (b.cancellationDeadlineMinutes !== undefined) row.cancellation_deadline_minutes = b.cancellationDeadlineMinutes
  if (b.status !== undefined) row.status = b.status
  return row
}

// ============================================================
// BlockSession
// ============================================================

export function blockSessionFromDb(r: Row): BlockSession {
  return {
    id: r.id,
    blockId: r.block_id,
    sessionNumber: r.session_number ?? 0,
    date: r.date ?? '',
    startTime: r.start_time ?? '',
    endTime: r.end_time ?? '',
    status: r.status ?? 'scheduled',
    cancellationReason: r.cancellation_reason ?? undefined,
    compensationType: r.compensation_type ?? undefined,
    createdAt: toDate(r.created_at),
  }
}

export function blockSessionToDb(s: Partial<BlockSession> & { id?: ID }): Row {
  const row: Row = {}
  if (s.id !== undefined) row.id = s.id
  if (s.blockId !== undefined) row.block_id = s.blockId
  if (s.sessionNumber !== undefined) row.session_number = s.sessionNumber
  if (s.date !== undefined) row.date = s.date
  if (s.startTime !== undefined) row.start_time = s.startTime
  if (s.endTime !== undefined) row.end_time = s.endTime
  if (s.status !== undefined) row.status = s.status
  if (s.cancellationReason !== undefined) row.cancellation_reason = s.cancellationReason
  if (s.compensationType !== undefined) row.compensation_type = s.compensationType
  return row
}

// ============================================================
// BlockEnrollment
// ============================================================

export function blockEnrollmentFromDb(r: Row): BlockEnrollment {
  return {
    id: r.id,
    blockId: r.block_id,
    activityType: r.activity_type ?? '',
    providerId: r.provider_id,
    parentId: r.parent_id,
    childId: r.child_id ?? '',
    childName: r.child_name ?? '',
    childAge: r.child_age ?? 0,
    bookingId: r.booking_id ?? undefined,
    status: r.status ?? 'active',
    pricePaid: r.price_paid ?? 0,
    currency: r.currency ?? 'EUR',
    creditsEarned: r.credits_earned ?? 0,
    creditsUsed: r.credits_used ?? 0,
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
  }
}

export function blockEnrollmentToDb(e: Partial<BlockEnrollment> & { id?: ID }): Row {
  const row: Row = {}
  if (e.id !== undefined) row.id = e.id
  if (e.blockId !== undefined) row.block_id = e.blockId
  if (e.activityType !== undefined) row.activity_type = e.activityType
  if (e.providerId !== undefined) row.provider_id = e.providerId
  if (e.parentId !== undefined) row.parent_id = e.parentId
  if (e.childId !== undefined) row.child_id = e.childId
  if (e.childName !== undefined) row.child_name = e.childName
  if (e.childAge !== undefined) row.child_age = e.childAge
  if (e.bookingId !== undefined) row.booking_id = e.bookingId ?? null
  if (e.status !== undefined) row.status = e.status
  if (e.pricePaid !== undefined) row.price_paid = e.pricePaid
  if (e.currency !== undefined) row.currency = e.currency
  if (e.creditsEarned !== undefined) row.credits_earned = e.creditsEarned
  if (e.creditsUsed !== undefined) row.credits_used = e.creditsUsed
  return row
}

// ============================================================
// SessionCredit
// ============================================================

export function sessionCreditFromDb(r: Row): SessionCredit {
  return {
    id: r.id,
    enrollmentId: r.enrollment_id,
    blockId: r.block_id,
    providerId: r.provider_id,
    parentId: r.parent_id,
    childId: r.child_id ?? '',
    activityType: r.activity_type ?? '',
    reason: r.reason ?? 'parent_cancellation',
    isProviderCancellation: r.is_provider_cancellation ?? false,
    originalSessionId: r.original_session_id ?? '',
    originalSessionDate: r.original_session_date ?? '',
    status: r.status ?? 'available',
    validUntil: r.valid_until ?? '',
    usedInSessionId: r.used_in_session_id ?? undefined,
    usedAt: toDateOrUndef(r.used_at),
    createdAt: toDate(r.created_at),
  }
}

export function sessionCreditToDb(c: Partial<SessionCredit> & { id?: ID }): Row {
  const row: Row = {}
  if (c.id !== undefined) row.id = c.id
  if (c.enrollmentId !== undefined) row.enrollment_id = c.enrollmentId
  if (c.blockId !== undefined) row.block_id = c.blockId
  if (c.providerId !== undefined) row.provider_id = c.providerId
  if (c.parentId !== undefined) row.parent_id = c.parentId
  if (c.childId !== undefined) row.child_id = c.childId
  if (c.activityType !== undefined) row.activity_type = c.activityType
  if (c.reason !== undefined) row.reason = c.reason
  if (c.isProviderCancellation !== undefined) row.is_provider_cancellation = c.isProviderCancellation
  if (c.originalSessionId !== undefined) row.original_session_id = c.originalSessionId
  if (c.originalSessionDate !== undefined) row.original_session_date = c.originalSessionDate
  if (c.status !== undefined) row.status = c.status
  if (c.validUntil !== undefined) row.valid_until = c.validUntil
  if (c.usedInSessionId !== undefined) row.used_in_session_id = c.usedInSessionId ?? null
  if (c.usedAt !== undefined) row.used_at = toIso(c.usedAt)
  return row
}

// ============================================================
// MakeupBooking
// ============================================================

export function makeupBookingFromDb(r: Row): MakeupBooking {
  return {
    id: r.id,
    creditId: r.credit_id,
    targetBlockId: r.target_block_id,
    targetSessionId: r.target_session_id,
    providerId: r.provider_id,
    parentId: r.parent_id,
    childId: r.child_id ?? '',
    childName: r.child_name ?? '',
    status: r.status ?? 'confirmed',
    bookedBy: r.booked_by ?? 'parent',
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
  }
}

export function makeupBookingToDb(m: Partial<MakeupBooking> & { id?: ID }): Row {
  const row: Row = {}
  if (m.id !== undefined) row.id = m.id
  if (m.creditId !== undefined) row.credit_id = m.creditId
  if (m.targetBlockId !== undefined) row.target_block_id = m.targetBlockId
  if (m.targetSessionId !== undefined) row.target_session_id = m.targetSessionId
  if (m.providerId !== undefined) row.provider_id = m.providerId
  if (m.parentId !== undefined) row.parent_id = m.parentId
  if (m.childId !== undefined) row.child_id = m.childId
  if (m.childName !== undefined) row.child_name = m.childName
  if (m.status !== undefined) row.status = m.status
  if (m.bookedBy !== undefined) row.booked_by = m.bookedBy
  return row
}

// ============================================================
// WidgetConfig
// ============================================================

export function widgetConfigFromDb(r: Row): WidgetConfig {
  return {
    id: r.id,
    providerId: r.provider_id,
    type: r.type ?? 'booking_button',
    theme: r.theme ?? 'light',
    primaryColor: r.primary_color ?? undefined,
    logoUrl: r.logo_url ?? undefined,
    activityIds: r.activity_ids ?? undefined,
    showPrices: r.show_prices ?? true,
    showAvailability: r.show_availability ?? true,
    showReviews: r.show_reviews ?? false,
    embedCode: r.embed_code ?? undefined,
    createdAt: toDate(r.created_at),
  }
}

export function widgetConfigToDb(w: Partial<WidgetConfig> & { id?: ID }): Row {
  const row: Row = {}
  if (w.id !== undefined) row.id = w.id
  if (w.providerId !== undefined) row.provider_id = w.providerId
  if (w.type !== undefined) row.type = w.type
  if (w.theme !== undefined) row.theme = w.theme
  if (w.primaryColor !== undefined) row.primary_color = w.primaryColor
  if (w.logoUrl !== undefined) row.logo_url = w.logoUrl
  if (w.activityIds !== undefined) row.activity_ids = w.activityIds
  if (w.showPrices !== undefined) row.show_prices = w.showPrices
  if (w.showAvailability !== undefined) row.show_availability = w.showAvailability
  if (w.showReviews !== undefined) row.show_reviews = w.showReviews
  if (w.embedCode !== undefined) row.embed_code = w.embedCode
  return row
}

// ============================================================
// Coupon
// ============================================================

export function couponFromDb(r: Row): Coupon {
  return {
    id: r.id,
    providerId: r.provider_id,
    code: r.code ?? '',
    type: r.type ?? 'percentage',
    value: r.value ?? 0,
    currency: r.currency ?? undefined,
    activityIds: r.activity_ids ?? undefined,
    maxUses: r.max_uses ?? 0,
    usedCount: r.used_count ?? 0,
    minBookingAmount: r.min_booking_amount ?? undefined,
    validFrom: toDate(r.valid_from),
    validUntil: toDate(r.valid_until),
    active: r.active ?? true,
    createdAt: toDate(r.created_at),
  }
}

export function couponToDb(c: Partial<Coupon> & { id?: ID }): Row {
  const row: Row = {}
  if (c.id !== undefined) row.id = c.id
  if (c.providerId !== undefined) row.provider_id = c.providerId
  if (c.code !== undefined) row.code = c.code
  if (c.type !== undefined) row.type = c.type
  if (c.value !== undefined) row.value = c.value
  if (c.currency !== undefined) row.currency = c.currency
  if (c.activityIds !== undefined) row.activity_ids = c.activityIds
  if (c.maxUses !== undefined) row.max_uses = c.maxUses
  if (c.usedCount !== undefined) row.used_count = c.usedCount
  if (c.minBookingAmount !== undefined) row.min_booking_amount = c.minBookingAmount
  if (c.validFrom !== undefined) row.valid_from = toIso(c.validFrom)
  if (c.validUntil !== undefined) row.valid_until = toIso(c.validUntil)
  if (c.active !== undefined) row.active = c.active
  return row
}

// ============================================================
// CouponRedemption
// ============================================================

export function couponRedemptionFromDb(r: Row): CouponRedemption {
  return {
    id: r.id,
    couponId: r.coupon_id,
    bookingId: r.booking_id,
    parentId: r.parent_id,
    discountAmount: r.discount_amount ?? 0,
    redeemedAt: toDate(r.redeemed_at),
  }
}

// ============================================================
// PaymentRecord
// ============================================================

export function paymentFromDb(r: Row): PaymentRecord {
  return {
    id: r.id,
    providerId: r.provider_id,
    parentId: r.parent_id,
    bookingId: r.booking_id ?? undefined,
    invoiceId: r.invoice_id ?? undefined,
    method: r.method ?? 'bank_transfer',
    amount: r.amount ?? 0,
    currency: r.currency ?? 'EUR',
    reference: r.reference ?? '',
    status: r.status ?? 'pending',
    sepaMandateId: r.sepa_mandate_id ?? undefined,
    processedAt: toDateOrUndef(r.processed_at),
    createdAt: toDate(r.created_at),
  }
}

export function paymentToDb(p: Partial<PaymentRecord> & { id?: ID }): Row {
  const row: Row = {}
  if (p.id !== undefined) row.id = p.id
  if (p.providerId !== undefined) row.provider_id = p.providerId
  if (p.parentId !== undefined) row.parent_id = p.parentId
  if (p.bookingId !== undefined) row.booking_id = p.bookingId ?? null
  if (p.invoiceId !== undefined) row.invoice_id = p.invoiceId ?? null
  if (p.method !== undefined) row.method = p.method
  if (p.amount !== undefined) row.amount = p.amount
  if (p.currency !== undefined) row.currency = p.currency
  if (p.reference !== undefined) row.reference = p.reference
  if (p.status !== undefined) row.status = p.status
  if (p.sepaMandateId !== undefined) row.sepa_mandate_id = p.sepaMandateId ?? null
  if (p.processedAt !== undefined) row.processed_at = toIso(p.processedAt)
  return row
}

// ============================================================
// SepaMandate
// ============================================================

export function sepaMandateFromDb(r: Row): SepaMandate {
  return {
    id: r.id,
    providerId: r.provider_id,
    parentId: r.parent_id,
    mandateReference: r.mandate_reference ?? '',
    iban: r.iban_encrypted ?? r.iban ?? '',
    ibanMasked: r.iban_masked ?? '',
    bic: r.bic ?? undefined,
    accountHolder: r.account_holder ?? '',
    signedAt: toDate(r.signed_at),
    status: r.status ?? 'pending',
    createdAt: toDate(r.created_at),
  }
}

export function sepaMandateToDb(s: Partial<SepaMandate> & { id?: ID }): Row {
  const row: Row = {}
  if (s.id !== undefined) row.id = s.id
  if (s.providerId !== undefined) row.provider_id = s.providerId
  if (s.parentId !== undefined) row.parent_id = s.parentId
  if (s.mandateReference !== undefined) row.mandate_reference = s.mandateReference
  if (s.iban !== undefined) row.iban_encrypted = s.iban
  if (s.ibanMasked !== undefined) row.iban_masked = s.ibanMasked
  if (s.bic !== undefined) row.bic = s.bic
  if (s.accountHolder !== undefined) row.account_holder = s.accountHolder
  if (s.signedAt !== undefined) row.signed_at = toIso(s.signedAt)
  if (s.status !== undefined) row.status = s.status
  return row
}

// ============================================================
// Season
// ============================================================

export function seasonFromDb(r: Row): Season {
  return {
    id: r.id,
    providerId: r.provider_id,
    name: r.name ?? '',
    type: r.type ?? 'custom',
    startDate: r.start_date ?? '',
    endDate: r.end_date ?? '',
    isActive: r.is_active ?? false,
    createdAt: toDate(r.created_at),
  }
}

export function seasonToDb(s: Partial<Season> & { id?: ID }): Row {
  const row: Row = {}
  if (s.id !== undefined) row.id = s.id
  if (s.providerId !== undefined) row.provider_id = s.providerId
  if (s.name !== undefined) row.name = s.name
  if (s.type !== undefined) row.type = s.type
  if (s.startDate !== undefined) row.start_date = s.startDate
  if (s.endDate !== undefined) row.end_date = s.endDate
  if (s.isActive !== undefined) row.is_active = s.isActive
  return row
}

// ============================================================
// Holiday
// ============================================================

export function holidayFromDb(r: Row): Holiday {
  return {
    id: r.id,
    providerId: r.provider_id,
    name: r.name ?? '',
    startDate: r.start_date ?? '',
    endDate: r.end_date ?? '',
    cancelActivities: r.cancel_activities ?? false,
    region: r.region ?? undefined,
  }
}

export function holidayToDb(h: Partial<Holiday> & { id?: ID }): Row {
  const row: Row = {}
  if (h.id !== undefined) row.id = h.id
  if (h.providerId !== undefined) row.provider_id = h.providerId
  if (h.name !== undefined) row.name = h.name
  if (h.startDate !== undefined) row.start_date = h.startDate
  if (h.endDate !== undefined) row.end_date = h.endDate
  if (h.cancelActivities !== undefined) row.cancel_activities = h.cancelActivities
  if (h.region !== undefined) row.region = h.region
  return row
}

// ============================================================
// Notification
// ============================================================

export function notificationFromDb(r: Row): Notification {
  return {
    id: r.id,
    recipientType: r.recipient_type ?? 'parent',
    recipientId: r.recipient_id ?? '',
    type: r.type ?? 'custom',
    channel: r.channel ?? 'in_app',
    title: r.title ?? '',
    body: r.body ?? '',
    data: r.data ?? undefined,
    read: r.read ?? false,
    sentAt: toDate(r.sent_at),
    readAt: toDateOrUndef(r.read_at),
  }
}

export function notificationToDb(n: Partial<Notification> & { id?: ID }): Row {
  const row: Row = {}
  if (n.id !== undefined) row.id = n.id
  if (n.recipientType !== undefined) row.recipient_type = n.recipientType
  if (n.recipientId !== undefined) row.recipient_id = n.recipientId
  if (n.type !== undefined) row.type = n.type
  if (n.channel !== undefined) row.channel = n.channel
  if (n.title !== undefined) row.title = n.title
  if (n.body !== undefined) row.body = n.body
  if (n.data !== undefined) row.data = n.data
  if (n.read !== undefined) row.read = n.read
  if (n.sentAt !== undefined) row.sent_at = toIso(n.sentAt)
  if (n.readAt !== undefined) row.read_at = toIso(n.readAt)
  return row
}

// ============================================================
// AuditLogEntry
// ============================================================

export function auditLogFromDb(r: Row): AuditLogEntry {
  return {
    id: r.id,
    providerId: r.provider_id,
    userId: r.user_id ?? '',
    userType: r.user_type ?? 'provider',
    action: r.action ?? '',
    entityType: r.entity_type ?? '',
    entityId: r.entity_id ?? '',
    changes: r.changes ?? undefined,
    ipAddress: r.ip_address ?? undefined,
    timestamp: toDate(r.timestamp),
  }
}

export function auditLogToDb(a: Partial<AuditLogEntry>): Row {
  const row: Row = {}
  if (a.providerId !== undefined) row.provider_id = a.providerId
  if (a.userId !== undefined) row.user_id = a.userId
  if (a.userType !== undefined) row.user_type = a.userType
  if (a.action !== undefined) row.action = a.action
  if (a.entityType !== undefined) row.entity_type = a.entityType
  if (a.entityId !== undefined) row.entity_id = a.entityId
  if (a.changes !== undefined) row.changes = a.changes
  if (a.ipAddress !== undefined) row.ip_address = a.ipAddress
  return row
}

// ============================================================
// WaitlistEntry
// ============================================================

export function waitlistEntryFromDb(r: Row): WaitlistEntry {
  return {
    id: r.id,
    activityId: r.activity_id,
    courseBlockId: r.course_block_id ?? undefined,
    parentId: r.parent_id,
    child: r.child_info ?? { name: '', age: 0, emergencyContact: '', emergencyPhone: '' },
    position: r.position ?? 0,
    priority: r.priority ?? 'normal',
    addedAt: toDate(r.added_at),
    notifiedAt: toDateOrUndef(r.notified_at),
    expiresAt: toDateOrUndef(r.expires_at),
    status: r.status ?? 'waiting',
  }
}

export function waitlistEntryToDb(w: Partial<WaitlistEntry> & { id?: ID }): Row {
  const row: Row = {}
  if (w.id !== undefined) row.id = w.id
  if (w.activityId !== undefined) row.activity_id = w.activityId
  if (w.courseBlockId !== undefined) row.course_block_id = w.courseBlockId
  if (w.parentId !== undefined) row.parent_id = w.parentId
  if (w.child !== undefined) row.child_info = w.child
  if (w.position !== undefined) row.position = w.position
  if (w.priority !== undefined) row.priority = w.priority
  if (w.status !== undefined) row.status = w.status
  if (w.notifiedAt !== undefined) row.notified_at = toIso(w.notifiedAt)
  if (w.expiresAt !== undefined) row.expires_at = toIso(w.expiresAt)
  return row
}

// ============================================================
// ExportRequest
// ============================================================

export function exportRequestFromDb(r: Row): ExportRequest {
  return {
    id: r.id,
    providerId: r.provider_id,
    type: r.type ?? 'bookings',
    format: r.format ?? 'csv',
    dateRange: r.date_range ?? undefined,
    filters: r.filters ?? undefined,
    status: r.status ?? 'pending',
    fileUrl: r.file_url ?? undefined,
    createdAt: toDate(r.created_at),
    completedAt: toDateOrUndef(r.completed_at),
  }
}

export function exportRequestToDb(e: Partial<ExportRequest> & { id?: ID }): Row {
  const row: Row = {}
  if (e.id !== undefined) row.id = e.id
  if (e.providerId !== undefined) row.provider_id = e.providerId
  if (e.type !== undefined) row.type = e.type
  if (e.format !== undefined) row.format = e.format
  if (e.dateRange !== undefined) row.date_range = e.dateRange
  if (e.filters !== undefined) row.filters = e.filters
  if (e.status !== undefined) row.status = e.status
  if (e.fileUrl !== undefined) row.file_url = e.fileUrl
  if (e.completedAt !== undefined) row.completed_at = toIso(e.completedAt)
  return row
}

// ============================================================
// ContactNote
// ============================================================

export function contactNoteFromDb(r: Row): ContactNote {
  return {
    id: r.id,
    parentId: r.parent_id,
    providerId: r.provider_id,
    authorId: r.author_id ?? '',
    content: r.content ?? '',
    createdAt: toDate(r.created_at),
  }
}

export function contactNoteToDb(n: Partial<ContactNote> & { id?: ID }): Row {
  const row: Row = {}
  if (n.id !== undefined) row.id = n.id
  if (n.parentId !== undefined) row.parent_id = n.parentId
  if (n.providerId !== undefined) row.provider_id = n.providerId
  if (n.authorId !== undefined) row.author_id = n.authorId
  if (n.content !== undefined) row.content = n.content
  return row
}

// ============================================================
// AutomationFlow
// ============================================================

export function automationFlowFromDb(r: Row): AutomationFlow {
  return {
    id: r.id,
    providerId: r.provider_id,
    name: r.name ?? '',
    trigger: r.trigger_type ?? 'customer_signup',
    channel: r.channel ?? 'email',
    delayMinutes: r.delay_minutes ?? 0,
    templateId: r.template_id ?? '',
    status: r.status ?? 'draft',
    conditions: r.conditions ?? undefined,
    stats: {
      sent: r.stats_sent ?? 0,
      opened: r.stats_opened ?? 0,
      clicked: r.stats_clicked ?? 0,
    },
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
  }
}

export function automationFlowToDb(f: Partial<AutomationFlow> & { id?: ID }): Row {
  const row: Row = {}
  if (f.id !== undefined) row.id = f.id
  if (f.providerId !== undefined) row.provider_id = f.providerId
  if (f.name !== undefined) row.name = f.name
  if (f.trigger !== undefined) row.trigger_type = f.trigger
  if (f.channel !== undefined) row.channel = f.channel
  if (f.delayMinutes !== undefined) row.delay_minutes = f.delayMinutes
  if (f.templateId !== undefined) row.template_id = f.templateId
  if (f.status !== undefined) row.status = f.status
  if (f.conditions !== undefined) row.conditions = f.conditions
  if (f.stats) {
    row.stats_sent = f.stats.sent
    row.stats_opened = f.stats.opened
    row.stats_clicked = f.stats.clicked
  }
  return row
}

// ============================================================
// MessageTemplate
// ============================================================

export function messageTemplateFromDb(r: Row): MessageTemplate {
  return {
    id: r.id,
    providerId: r.provider_id,
    name: r.name ?? '',
    channel: r.channel ?? 'email',
    subject: r.subject ?? undefined,
    body: r.body ?? '',
    variables: r.variables ?? [],
    isDefault: r.is_default ?? false,
    createdAt: toDate(r.created_at),
  }
}

export function messageTemplateToDb(t: Partial<MessageTemplate> & { id?: ID }): Row {
  const row: Row = {}
  if (t.id !== undefined) row.id = t.id
  if (t.providerId !== undefined) row.provider_id = t.providerId
  if (t.name !== undefined) row.name = t.name
  if (t.channel !== undefined) row.channel = t.channel
  if (t.subject !== undefined) row.subject = t.subject
  if (t.body !== undefined) row.body = t.body
  if (t.variables !== undefined) row.variables = t.variables
  if (t.isDefault !== undefined) row.is_default = t.isDefault
  return row
}

// ============================================================
// MarketingCampaign
// ============================================================

export function marketingCampaignFromDb(r: Row): MarketingCampaign {
  return {
    id: r.id,
    providerId: r.provider_id,
    name: r.name ?? '',
    channel: r.channel ?? 'email',
    templateId: r.template_id ?? '',
    targetSegment: r.target_segment ?? 'all',
    targetActivityIds: r.target_activity_ids ?? undefined,
    status: r.status ?? 'draft',
    scheduledAt: toDateOrUndef(r.scheduled_at),
    sentAt: toDateOrUndef(r.sent_at),
    stats: {
      recipients: r.stats_recipients ?? 0,
      sent: r.stats_sent ?? 0,
      opened: r.stats_opened ?? 0,
      clicked: r.stats_clicked ?? 0,
    },
    createdAt: toDate(r.created_at),
  }
}

export function marketingCampaignToDb(c: Partial<MarketingCampaign> & { id?: ID }): Row {
  const row: Row = {}
  if (c.id !== undefined) row.id = c.id
  if (c.providerId !== undefined) row.provider_id = c.providerId
  if (c.name !== undefined) row.name = c.name
  if (c.channel !== undefined) row.channel = c.channel
  if (c.templateId !== undefined) row.template_id = c.templateId
  if (c.targetSegment !== undefined) row.target_segment = c.targetSegment
  if (c.targetActivityIds !== undefined) row.target_activity_ids = c.targetActivityIds
  if (c.status !== undefined) row.status = c.status
  if (c.scheduledAt !== undefined) row.scheduled_at = toIso(c.scheduledAt)
  if (c.sentAt !== undefined) row.sent_at = toIso(c.sentAt)
  if (c.stats) {
    row.stats_recipients = c.stats.recipients
    row.stats_sent = c.stats.sent
    row.stats_opened = c.stats.opened
    row.stats_clicked = c.stats.clicked
  }
  return row
}

// ============================================================
// TrialLesson
// ============================================================

export function trialFromDb(r: Row): TrialLesson {
  return {
    id: r.id,
    activityId: r.activity_id,
    providerId: r.provider_id,
    parentId: r.parent_id,
    child: r.child_info ?? { name: '', age: 0 },
    scheduledDate: r.scheduled_date ?? '',
    scheduledTime: r.scheduled_time ?? '',
    status: r.status ?? 'scheduled',
    convertedToBookingId: r.converted_to_booking_id ?? undefined,
    feedback: r.feedback ?? undefined,
    parentFeedback: r.parent_feedback ?? undefined,
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
  }
}

export function trialToDb(t: Partial<TrialLesson> & { id?: ID }): Row {
  const row: Row = {}
  if (t.id !== undefined) row.id = t.id
  if (t.activityId !== undefined) row.activity_id = t.activityId
  if (t.providerId !== undefined) row.provider_id = t.providerId
  if (t.parentId !== undefined) row.parent_id = t.parentId
  if (t.child !== undefined) row.child_info = t.child
  if (t.scheduledDate !== undefined) row.scheduled_date = t.scheduledDate
  if (t.scheduledTime !== undefined) row.scheduled_time = t.scheduledTime
  if (t.status !== undefined) row.status = t.status
  if (t.convertedToBookingId !== undefined) row.converted_to_booking_id = t.convertedToBookingId
  if (t.feedback !== undefined) row.feedback = t.feedback
  if (t.parentFeedback !== undefined) row.parent_feedback = t.parentFeedback
  return row
}

// ============================================================
// Message
// ============================================================

export function messageFromDb(r: Row): Message {
  return {
    id: r.id,
    providerId: r.provider_id,
    parentId: r.parent_id ?? undefined,
    activityId: r.activity_id ?? undefined,
    type: r.type ?? 'direct',
    subject: r.subject ?? undefined,
    body: r.body ?? '',
    read: r.read ?? false,
    sentAt: toDate(r.sent_at ?? r.created_at),
  }
}

export function messageToDb(m: Partial<Message> & { id?: ID }): Row {
  const row: Row = {}
  if (m.id !== undefined) row.id = m.id
  if (m.providerId !== undefined) row.provider_id = m.providerId
  if (m.parentId !== undefined) row.parent_id = m.parentId
  if (m.activityId !== undefined) row.activity_id = m.activityId
  if (m.type !== undefined) row.type = m.type
  if (m.subject !== undefined) row.subject = m.subject
  if (m.body !== undefined) row.body = m.body
  if (m.read !== undefined) row.read = m.read
  if (m.sentAt !== undefined) row.sent_at = toIso(m.sentAt)
  return row
}

// ============================================================
// ProviderDocument
// ============================================================

export function documentFromDb(r: Row): ProviderDocument {
  return {
    id: r.id,
    providerId: r.provider_id,
    teamMemberId: r.team_member_id ?? undefined,
    type: r.type ?? 'custom',
    name: r.name ?? '',
    fileUrl: r.file_url ?? undefined,
    issuedAt: toDateOrUndef(r.issued_at),
    expiresAt: toDateOrUndef(r.expires_at),
    status: r.status ?? 'pending_review',
    verifiedBy: r.verified_by ?? undefined,
    verifiedAt: toDateOrUndef(r.verified_at),
    notes: r.notes ?? undefined,
    createdAt: toDate(r.created_at),
  }
}

export function documentToDb(d: Partial<ProviderDocument> & { id?: ID }): Row {
  const row: Row = {}
  if (d.id !== undefined) row.id = d.id
  if (d.providerId !== undefined) row.provider_id = d.providerId
  if (d.teamMemberId !== undefined) row.team_member_id = d.teamMemberId
  if (d.type !== undefined) row.type = d.type
  if (d.name !== undefined) row.name = d.name
  if (d.fileUrl !== undefined) row.file_url = d.fileUrl
  if (d.issuedAt !== undefined) row.issued_at = toIso(d.issuedAt)
  if (d.expiresAt !== undefined) row.expires_at = toIso(d.expiresAt)
  if (d.status !== undefined) row.status = d.status
  if (d.verifiedBy !== undefined) row.verified_by = d.verifiedBy
  if (d.verifiedAt !== undefined) row.verified_at = toIso(d.verifiedAt)
  if (d.notes !== undefined) row.notes = d.notes
  return row
}
