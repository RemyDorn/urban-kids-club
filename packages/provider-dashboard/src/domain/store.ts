// ============================================================
// In-Memory Store – Zentraler Datenspeicher
// ============================================================
// Alle Daten leben im Arbeitsspeicher. Kein externer DB-Server nötig.
// Später ersetzbar durch DB-Adapter ohne Änderung der Service-Schicht.
// ============================================================

import type {
  ID,
  Provider,
  Location,
  TeamMember,
  Activity,
  Booking,
  AttendanceRecord,
  Parent,
  Review,
  Invoice,
  Message,
  Coupon,
  CouponRedemption,
  TrialLesson,
  Season,
  Holiday,
  SepaMandate,
  PaymentRecord,
  ProviderDocument,
  ConsentRecord,
  Notification,
  NotificationPreference,
  CalendarEvent,
  WaitlistEntry,
  WidgetConfig,
  ContactNote,
  ExportRequest,
  AuditLogEntry,
  EInvoice,
  BuTVoucher,
  InstructorContract,
} from '../types'

export interface StoreState {
  // Kern-Entitäten
  providers: Map<ID, Provider>
  locations: Map<ID, Location>
  teamMembers: Map<ID, TeamMember>
  activities: Map<ID, Activity>
  bookings: Map<ID, Booking>
  attendance: Map<ID, AttendanceRecord>
  parents: Map<ID, Parent>
  reviews: Map<ID, Review>
  invoices: Map<ID, Invoice>
  messages: Map<ID, Message>

  // 130%-Features
  coupons: Map<ID, Coupon>
  couponRedemptions: Map<ID, CouponRedemption>
  trialLessons: Map<ID, TrialLesson>
  seasons: Map<ID, Season>
  holidays: Map<ID, Holiday>
  sepaMandates: Map<ID, SepaMandate>
  payments: Map<ID, PaymentRecord>
  documents: Map<ID, ProviderDocument>
  consents: Map<ID, ConsentRecord>
  notifications: Map<ID, Notification>
  notificationPreferences: Map<ID, NotificationPreference>
  calendarEvents: Map<ID, CalendarEvent>
  waitlistEntries: Map<ID, WaitlistEntry>
  widgetConfigs: Map<ID, WidgetConfig>
  contactNotes: Map<ID, ContactNote>
  exportRequests: Map<ID, ExportRequest>
  auditLog: Map<ID, AuditLogEntry>
  eInvoices: Map<ID, EInvoice>
  butVouchers: Map<ID, BuTVoucher>
  instructorContracts: Map<ID, InstructorContract>
}

// --- Sekundärindizes für schnelle Lookups ---

export interface StoreIndexes {
  // Kern
  locationsByProvider: Map<ID, Set<ID>>
  teamByProvider: Map<ID, Set<ID>>
  activitiesByProvider: Map<ID, Set<ID>>
  activitiesByCategory: Map<string, Set<ID>>
  activitiesByLocation: Map<ID, Set<ID>>
  bookingsByActivity: Map<ID, Set<ID>>
  bookingsByProvider: Map<ID, Set<ID>>
  bookingsByParent: Map<ID, Set<ID>>
  attendanceByBooking: Map<ID, Set<ID>>
  attendanceByActivity: Map<ID, Set<ID>>
  attendanceByDate: Map<string, Set<ID>>
  reviewsByProvider: Map<ID, Set<ID>>
  reviewsByActivity: Map<ID, Set<ID>>
  invoicesByProvider: Map<ID, Set<ID>>
  invoicesByParent: Map<ID, Set<ID>>
  messagesByProvider: Map<ID, Set<ID>>
  messagesByParent: Map<ID, Set<ID>>

  // 130%-Features
  couponsByProvider: Map<ID, Set<ID>>
  couponByCode: Map<string, ID>              // code → coupon ID (unique lookup)
  redemptionsByCoupon: Map<ID, Set<ID>>
  redemptionsByParent: Map<ID, Set<ID>>
  trialsByProvider: Map<ID, Set<ID>>
  trialsByActivity: Map<ID, Set<ID>>
  trialsByParent: Map<ID, Set<ID>>
  seasonsByProvider: Map<ID, Set<ID>>
  holidaysByProvider: Map<ID, Set<ID>>
  mandatesByProvider: Map<ID, Set<ID>>
  mandatesByParent: Map<ID, Set<ID>>
  paymentsByProvider: Map<ID, Set<ID>>
  paymentsByParent: Map<ID, Set<ID>>
  paymentsByBooking: Map<ID, Set<ID>>
  paymentsByInvoice: Map<ID, Set<ID>>
  documentsByProvider: Map<ID, Set<ID>>
  documentsByTeamMember: Map<ID, Set<ID>>
  consentsByParent: Map<ID, Set<ID>>
  consentsByProvider: Map<ID, Set<ID>>
  notificationsByRecipient: Map<ID, Set<ID>>
  preferencesByUser: Map<ID, Set<ID>>
  calendarByProvider: Map<ID, Set<ID>>
  calendarByDate: Map<string, Set<ID>>
  calendarByLocation: Map<ID, Set<ID>>
  calendarByInstructor: Map<ID, Set<ID>>
  waitlistByActivity: Map<ID, Set<ID>>
  waitlistByParent: Map<ID, Set<ID>>
  widgetsByProvider: Map<ID, Set<ID>>
  notesByParent: Map<ID, Set<ID>>
  notesByProvider: Map<ID, Set<ID>>
  exportsByProvider: Map<ID, Set<ID>>
  auditByProvider: Map<ID, Set<ID>>
  auditByEntity: Map<string, Set<ID>>        // "entityType:entityId" → audit IDs
  eInvoicesByInvoice: Map<ID, ID>           // invoice ID → eInvoice ID (1:1)
  eInvoicesByProvider: Map<ID, Set<ID>>
  butVouchersByProvider: Map<ID, Set<ID>>
  butVouchersByParent: Map<ID, Set<ID>>
  contractsByProvider: Map<ID, Set<ID>>
  contractsByTeamMember: Map<ID, Set<ID>>
}

class Store {
  state: StoreState
  indexes: StoreIndexes

  constructor() {
    this.state = {
      providers: new Map(),
      locations: new Map(),
      teamMembers: new Map(),
      activities: new Map(),
      bookings: new Map(),
      attendance: new Map(),
      parents: new Map(),
      reviews: new Map(),
      invoices: new Map(),
      messages: new Map(),
      coupons: new Map(),
      couponRedemptions: new Map(),
      trialLessons: new Map(),
      seasons: new Map(),
      holidays: new Map(),
      sepaMandates: new Map(),
      payments: new Map(),
      documents: new Map(),
      consents: new Map(),
      notifications: new Map(),
      notificationPreferences: new Map(),
      calendarEvents: new Map(),
      waitlistEntries: new Map(),
      widgetConfigs: new Map(),
      contactNotes: new Map(),
      exportRequests: new Map(),
      auditLog: new Map(),
      eInvoices: new Map(),
      butVouchers: new Map(),
      instructorContracts: new Map(),
    }

    this.indexes = {
      locationsByProvider: new Map(),
      teamByProvider: new Map(),
      activitiesByProvider: new Map(),
      activitiesByCategory: new Map(),
      activitiesByLocation: new Map(),
      bookingsByActivity: new Map(),
      bookingsByProvider: new Map(),
      bookingsByParent: new Map(),
      attendanceByBooking: new Map(),
      attendanceByActivity: new Map(),
      attendanceByDate: new Map(),
      reviewsByProvider: new Map(),
      reviewsByActivity: new Map(),
      invoicesByProvider: new Map(),
      invoicesByParent: new Map(),
      messagesByProvider: new Map(),
      messagesByParent: new Map(),
      couponsByProvider: new Map(),
      couponByCode: new Map(),
      redemptionsByCoupon: new Map(),
      redemptionsByParent: new Map(),
      trialsByProvider: new Map(),
      trialsByActivity: new Map(),
      trialsByParent: new Map(),
      seasonsByProvider: new Map(),
      holidaysByProvider: new Map(),
      mandatesByProvider: new Map(),
      mandatesByParent: new Map(),
      paymentsByProvider: new Map(),
      paymentsByParent: new Map(),
      paymentsByBooking: new Map(),
      paymentsByInvoice: new Map(),
      documentsByProvider: new Map(),
      documentsByTeamMember: new Map(),
      consentsByParent: new Map(),
      consentsByProvider: new Map(),
      notificationsByRecipient: new Map(),
      preferencesByUser: new Map(),
      calendarByProvider: new Map(),
      calendarByDate: new Map(),
      calendarByLocation: new Map(),
      calendarByInstructor: new Map(),
      waitlistByActivity: new Map(),
      waitlistByParent: new Map(),
      widgetsByProvider: new Map(),
      notesByParent: new Map(),
      notesByProvider: new Map(),
      exportsByProvider: new Map(),
      auditByProvider: new Map(),
      auditByEntity: new Map(),
      eInvoicesByInvoice: new Map(),
      eInvoicesByProvider: new Map(),
      butVouchersByProvider: new Map(),
      butVouchersByParent: new Map(),
      contractsByProvider: new Map(),
      contractsByTeamMember: new Map(),
    }
  }

  // --- Index-Helfer ---

  addToIndex(index: Map<string, Set<string>>, key: string, value: string): void {
    if (!index.has(key)) {
      index.set(key, new Set())
    }
    index.get(key)!.add(value)
  }

  removeFromIndex(index: Map<string, Set<string>>, key: string, value: string): void {
    const set = index.get(key)
    if (set) {
      set.delete(value)
      if (set.size === 0) index.delete(key)
    }
  }

  getFromIndex(index: Map<string, Set<string>>, key: string): Set<string> {
    return index.get(key) ?? new Set()
  }

  // --- Reset (für Tests) ---

  reset(): void {
    for (const map of Object.values(this.state)) {
      (map as Map<unknown, unknown>).clear()
    }
    for (const map of Object.values(this.indexes)) {
      (map as Map<unknown, unknown>).clear()
    }
  }
}

// Singleton – eine Instanz für die gesamte App
export const store = new Store()
