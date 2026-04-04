// ============================================================
// Provider Dashboard – Typen & Interfaces
// ============================================================

// --- Basis-Typen ---

export type ID = string

export type Currency = 'EUR' | 'CHF' | 'USD'

export type DayOfWeek = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

export interface Address {
  street: string
  city: string
  zip: string
  country: string
  lat?: number
  lng?: number
}

export interface ContactInfo {
  email: string
  phone?: string
  website?: string
}

export interface TimeSlot {
  day: DayOfWeek
  startTime: string   // "HH:mm"
  endTime: string     // "HH:mm"
}

// --- Provider ---

export type ProviderStatus = 'onboarding' | 'active' | 'suspended' | 'archived'

export type SubscriptionPlan = 'free' | 'starter' | 'pro' | 'enterprise'

export interface Provider {
  id: ID
  name: string
  slug: string
  description: string
  logo?: string
  address: Address
  contact: ContactInfo
  categories: string[]
  status: ProviderStatus
  subscription: SubscriptionPlan
  createdAt: Date
  updatedAt: Date
}

// --- Locations (Multi-Standort) ---

export interface Location {
  id: ID
  providerId: ID
  name: string
  address: Address
  rooms?: string[]          // z.B. "Raum A", "Turnhalle"
  capacity?: number
}

// --- Team ---

export type TeamRole = 'owner' | 'admin' | 'instructor' | 'assistant'

export interface TeamMember {
  id: ID
  providerId: ID
  name: string
  email: string
  role: TeamRole
  specializations?: string[]
  avatar?: string
  active: boolean
}

// --- Activities (Kurse/Angebote) ---

export type ActivityStatus = 'draft' | 'published' | 'cancelled' | 'archived'

export type ScheduleType = 'single' | 'recurring' | 'camp' | 'flexible'

export interface AgeRange {
  min: number
  max: number
}

export interface PricingOption {
  id: ID
  label: string             // "Einzelstunde", "10er-Karte", "Monatsabo"
  type: 'single' | 'package' | 'subscription'
  amount: number
  currency: Currency
  packageSize?: number      // bei 10er-Karte: 10
  intervalMonths?: number   // bei Abo: 1 = monatlich
  siblingDiscount?: number  // Prozent
}

export interface RecurringSchedule {
  type: 'recurring'
  slots: TimeSlot[]
  startDate: string         // "YYYY-MM-DD"
  endDate?: string
}

export interface SingleSchedule {
  type: 'single'
  date: string
  startTime: string
  endTime: string
}

export interface CampSchedule {
  type: 'camp'
  startDate: string
  endDate: string
  dailyStartTime: string
  dailyEndTime: string
}

export type Schedule = RecurringSchedule | SingleSchedule | CampSchedule

export interface PlatformListing {
  enabled: boolean            // Auf Kids Club Plattform listen?
  platformCapacity: number    // Wie viele Plätze über die Plattform buchbar?
  featured: boolean           // Hervorgehoben auf der Plattform?
  trialAvailable: boolean     // Probestunde über Plattform buchbar?
}

export interface Activity {
  id: ID
  providerId: ID
  locationId?: ID
  instructorId?: ID
  title: string
  description: string
  category: string
  ageRange: AgeRange
  schedule: Schedule
  capacity: number
  waitlistEnabled: boolean
  pricing: PricingOption[]
  platformListing?: PlatformListing
  trialEnabled: boolean       // Schnupperstunde anbieten?
  media: string[]           // URLs
  tags: string[]
  status: ActivityStatus
  createdAt: Date
  updatedAt: Date
}

// --- Bookings ---

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'waitlisted'
  | 'cancelled'
  | 'completed'
  | 'no_show'

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded' | 'partial'

export interface ChildInfo {
  name: string
  age: number
  emergencyContact: string
  emergencyPhone: string
  medicalNotes?: string
  allergies?: string[]
}

export interface Booking {
  id: ID
  activityId: ID
  providerId: ID
  parentId: ID
  child: ChildInfo
  pricingOptionId: ID
  status: BookingStatus
  paymentStatus: PaymentStatus
  amountPaid: number
  currency: Currency
  notes?: string
  createdAt: Date
  updatedAt: Date
}

// --- Attendance (Check-In) ---

export interface AttendanceRecord {
  id: ID
  bookingId: ID
  activityId: ID
  date: string              // "YYYY-MM-DD"
  checkedIn: boolean
  checkedInAt?: Date
  checkedInBy?: ID          // TeamMember ID
  note?: string
}

// --- Parents / Customers ---

export interface Parent {
  id: ID
  name: string
  email: string
  phone?: string
  children: ChildInfo[]
  createdAt: Date
}

// --- Reviews ---

export interface Review {
  id: ID
  activityId: ID
  providerId: ID
  parentId: ID
  rating: number            // 1–5
  comment?: string
  createdAt: Date
}

// --- Finanzen (130%-Features) ---

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'

export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface Invoice {
  id: ID
  providerId: ID
  parentId: ID
  bookingIds: ID[]
  number: string            // "INV-2026-0001"
  lineItems: InvoiceLineItem[]
  subtotal: number
  tax: number
  total: number
  currency: Currency
  status: InvoiceStatus
  issuedAt: Date
  dueDate: Date
  paidAt?: Date
}

// --- Reports (130%-Features) ---

export interface RevenueReport {
  providerId: ID
  period: string            // "2026-Q1", "2026-03"
  totalRevenue: number
  totalBookings: number
  occupancyRate: number     // 0–1
  topActivities: Array<{ activityId: ID; title: string; revenue: number; bookings: number }>
  newCustomers: number
  returningCustomers: number
}

// --- Nachrichten (130%-Features) ---

export type MessageType = 'direct' | 'broadcast' | 'system'

export interface Message {
  id: ID
  providerId: ID
  parentId?: ID             // null bei Broadcast
  activityId?: ID           // Kontext
  type: MessageType
  subject?: string
  body: string
  read: boolean
  sentAt: Date
}

// --- Gutscheine & Rabatte (130%-Feature) ---

export type CouponType = 'percentage' | 'fixed_amount' | 'free_trial'

export interface Coupon {
  id: ID
  providerId: ID
  code: string              // z.B. "SOMMER2026"
  type: CouponType
  value: number             // Prozent oder Betrag
  currency?: Currency
  activityIds?: ID[]        // Beschränkung auf bestimmte Kurse (leer = alle)
  maxUses: number           // 0 = unbegrenzt
  usedCount: number
  minBookingAmount?: number
  validFrom: Date
  validUntil: Date
  active: boolean
  createdAt: Date
}

export interface CouponRedemption {
  id: ID
  couponId: ID
  bookingId: ID
  parentId: ID
  discountAmount: number
  redeemedAt: Date
}

// --- Probestunden / Trial Lessons (130%-Feature) ---

export type TrialStatus = 'scheduled' | 'completed' | 'no_show' | 'converted' | 'cancelled'

export interface TrialLesson {
  id: ID
  activityId: ID
  providerId: ID
  parentId: ID
  child: ChildInfo
  scheduledDate: string     // "YYYY-MM-DD"
  scheduledTime: string     // "HH:mm"
  status: TrialStatus
  convertedToBookingId?: ID // Falls aus Probestunde eine Buchung wurde
  feedback?: string         // Feedback vom Provider
  parentFeedback?: string   // Feedback vom Elternteil
  createdAt: Date
  updatedAt: Date
}

// --- Saisons & Schulferien (130%-Feature) ---

export type SeasonType = 'school_term' | 'holiday' | 'summer_break' | 'winter_break' | 'custom'

export interface Season {
  id: ID
  providerId: ID
  name: string              // "Schuljahr 2026/27 - 1. Halbjahr"
  type: SeasonType
  startDate: string
  endDate: string
  isActive: boolean
  createdAt: Date
}

export interface Holiday {
  id: ID
  providerId: ID
  name: string              // "Herbstferien NRW 2026"
  startDate: string
  endDate: string
  cancelActivities: boolean // Kurse automatisch absagen?
  region?: string           // Bundesland
}

// --- SEPA & Zahlungen (130%-Feature) ---

export type PaymentMethod = 'sepa_direct_debit' | 'bank_transfer' | 'cash' | 'card' | 'paypal'

export type SepaStatus = 'pending' | 'active' | 'failed' | 'cancelled'

export interface SepaMandate {
  id: ID
  providerId: ID
  parentId: ID
  mandateReference: string  // "MNDT-2026-0001"
  iban: string              // Verschlüsselt speichern!
  bic?: string
  accountHolder: string
  signedAt: Date
  status: SepaStatus
  createdAt: Date
}

export interface PaymentRecord {
  id: ID
  providerId: ID
  parentId: ID
  bookingId?: ID
  invoiceId?: ID
  method: PaymentMethod
  amount: number
  currency: Currency
  reference: string         // Verwendungszweck
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  sepaMandateId?: ID
  processedAt?: Date
  createdAt: Date
}

// --- Dokumente & Compliance (130%-Feature) ---

export type DocumentType =
  | 'fuehrungszeugnis'      // Erweitertes Führungszeugnis
  | 'insurance'             // Haftpflichtversicherung
  | 'first_aid'             // Erste-Hilfe-Nachweis
  | 'qualification'         // Qualifikationsnachweis
  | 'contract'              // AGB / Vertrag
  | 'consent_form'          // Einverständniserklärung
  | 'medical_form'          // Gesundheitsbogen
  | 'photo_consent'         // Foto-Einwilligung
  | 'data_processing'       // Auftragsverarbeitung (DSGVO)
  | 'custom'

export type DocumentStatus = 'valid' | 'expiring_soon' | 'expired' | 'pending_review'

export interface ProviderDocument {
  id: ID
  providerId: ID
  teamMemberId?: ID         // Falls Dokument einem Trainer gehört
  type: DocumentType
  name: string
  fileUrl?: string
  issuedAt?: Date
  expiresAt?: Date
  status: DocumentStatus
  verifiedBy?: string       // Admin der Plattform
  verifiedAt?: Date
  notes?: string
  createdAt: Date
}

export interface ConsentRecord {
  id: ID
  parentId: ID
  childName: string
  providerId: ID
  documentType: DocumentType
  consentGiven: boolean
  consentedAt: Date
  ipAddress?: string
  revokedAt?: Date
}

// --- Benachrichtigungen (130%-Feature) ---

export type NotificationType =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_reminder'      // 24h vorher
  | 'waitlist_promoted'
  | 'payment_received'
  | 'payment_overdue'
  | 'invoice_sent'
  | 'activity_cancelled'
  | 'activity_changed'
  | 'trial_reminder'
  | 'review_request'
  | 'message_received'
  | 'document_expiring'
  | 'season_starting'
  | 'custom'

export type NotificationChannel = 'email' | 'push' | 'sms' | 'in_app'

export interface Notification {
  id: ID
  recipientType: 'parent' | 'provider' | 'team_member'
  recipientId: ID
  type: NotificationType
  channel: NotificationChannel
  title: string
  body: string
  data?: Record<string, string>  // Kontext-Daten (activityId, bookingId, etc.)
  read: boolean
  sentAt: Date
  readAt?: Date
}

export interface NotificationPreference {
  id: ID
  userId: ID
  userType: 'parent' | 'provider'
  type: NotificationType
  channels: NotificationChannel[]
  enabled: boolean
}

// --- Kalender & Konflikte (130%-Feature) ---

export interface CalendarEvent {
  id: ID
  providerId: ID
  activityId?: ID
  locationId?: ID
  instructorId?: ID
  title: string
  description?: string
  date: string              // "YYYY-MM-DD"
  startTime: string         // "HH:mm"
  endTime: string           // "HH:mm"
  recurring: boolean
  recurrenceRule?: string   // iCal RRULE
  color?: string            // Farbkodierung im Kalender
  type: 'activity' | 'blocked' | 'holiday' | 'meeting' | 'custom'
}

export interface CalendarConflict {
  eventA: CalendarEvent
  eventB: CalendarEvent
  conflictType: 'room_overlap' | 'instructor_overlap' | 'time_overlap'
  description: string
}

// --- Warteliste erweitert ---

export interface WaitlistEntry {
  id: ID
  activityId: ID
  parentId: ID
  child: ChildInfo
  position: number
  priority: 'normal' | 'sibling' | 'returning' | 'high'  // Geschwister / Stammkunden bevorzugt
  addedAt: Date
  notifiedAt?: Date
  expiresAt?: Date          // Frist zur Annahme des Platzes
  status: 'waiting' | 'offered' | 'accepted' | 'declined' | 'expired'
}

// --- Widget & Einbettung (130%-Feature) ---

export interface WidgetConfig {
  id: ID
  providerId: ID
  type: 'booking_button' | 'course_list' | 'calendar' | 'review_badge'
  theme: 'light' | 'dark' | 'auto'
  primaryColor?: string
  activityIds?: ID[]        // Beschränkung auf bestimmte Kurse
  showPrices: boolean
  showAvailability: boolean
  showReviews: boolean
  embedCode?: string        // Generierter HTML/JS Code
  createdAt: Date
}

// --- Kontakte / CRM (130%-Feature) ---

export type ContactTag = 'prospect' | 'active' | 'inactive' | 'vip' | 'problem' | string

export interface ContactNote {
  id: ID
  parentId: ID
  providerId: ID
  authorId: ID              // TeamMember ID
  content: string
  createdAt: Date
}

export interface ParentExtended extends Parent {
  tags: ContactTag[]
  notes: ContactNote[]
  totalSpent: number
  bookingCount: number
  firstBookingAt?: Date
  lastBookingAt?: Date
  preferredPaymentMethod?: PaymentMethod
  language: string          // "de", "en", "tr", etc.
  source?: string           // "website", "instagram", "referral", "walk_in"
}

// --- Export & Integration (130%-Feature) ---

export type ExportFormat = 'csv' | 'pdf' | 'xlsx' | 'json' | 'datev'

export interface ExportRequest {
  id: ID
  providerId: ID
  type: 'bookings' | 'invoices' | 'attendance' | 'customers' | 'revenue'
  format: ExportFormat
  dateRange?: { from: string; to: string }
  filters?: Record<string, string>
  status: 'pending' | 'processing' | 'completed' | 'failed'
  fileUrl?: string
  createdAt: Date
  completedAt?: Date
}

// --- E-Rechnung / ZUGFeRD / XRechnung (Gesetzliche Pflicht ab 2027/28) ---

export type EInvoiceFormat = 'zugferd' | 'xrechnung' | 'pdf'

export interface EInvoice {
  id: ID
  invoiceId: ID
  providerId: ID
  format: EInvoiceFormat
  xmlContent?: string         // XRechnung XML oder ZUGFeRD XML
  pdfContent?: string         // PDF/A-3 mit eingebettetem XML (ZUGFeRD)
  leitweg_id?: string         // Leitweg-ID für öffentliche Auftraggeber
  status: 'draft' | 'generated' | 'sent' | 'accepted' | 'rejected'
  generatedAt?: Date
  sentAt?: Date
}

// GoBD-konforme Rechnungspflichtangaben
export interface GoBDInvoiceData {
  providerName: string
  providerAddress: Address
  providerTaxId: string       // Steuernummer
  providerVatId?: string      // USt-IdNr. (optional)
  customerName: string
  customerAddress: Address
  invoiceNumber: string       // Fortlaufend!
  invoiceDate: Date
  deliveryDate?: Date         // Leistungsdatum
  lineItems: Array<{
    description: string
    quantity: number
    unitPrice: number
    vatRate: number           // 0.19 oder 0.07 (ermäßigt)
    netAmount: number
    vatAmount: number
    grossAmount: number
  }>
  netTotal: number
  vatBreakdown: Array<{ rate: number; net: number; vat: number }>
  grossTotal: number
  paymentTerms: string        // "Zahlbar innerhalb von 14 Tagen"
  bankDetails?: {
    iban: string
    bic?: string
    bankName?: string
  }
}

// --- Bildungs- und Teilhabepaket / BuT (Soziale Verantwortung) ---

export type BuTVoucherStatus = 'submitted' | 'approved' | 'redeemed' | 'settled' | 'rejected' | 'expired'

export interface BuTVoucher {
  id: ID
  providerId: ID
  parentId: ID
  childName: string
  bookingId?: ID
  voucherNumber: string       // Gutscheinnummer vom Jobcenter
  issuingAuthority: string    // "Jobcenter Köln", "Sozialamt Düsseldorf"
  monthlyAmount: number       // Typisch 15 €/Monat
  validFrom: string           // "YYYY-MM-DD"
  validUntil: string
  status: BuTVoucherStatus
  totalRedeemed: number       // Bisher eingelöster Betrag
  settlementReference?: string
  notes?: string
  createdAt: Date
  updatedAt: Date
}

// --- Honorarverträge / Instructor Contracts (Scheinselbständigkeit) ---

export type ContractType = 'employed' | 'freelance' | 'volunteer' | 'mini_job'

export type ContractStatus = 'draft' | 'active' | 'terminated' | 'expired'

export interface InstructorContract {
  id: ID
  providerId: ID
  teamMemberId: ID
  type: ContractType
  title: string               // "Honorarvertrag Tanzunterricht"
  startDate: string
  endDate?: string
  status: ContractStatus

  // Freelance-Nachweis (gegen Scheinselbständigkeit)
  freelanceIndicators?: {
    ownSchedule: boolean      // Bestimmt eigene Zeiten
    ownStudents: boolean      // Eigener Kundenstamm
    ownMaterials: boolean     // Eigene Arbeitsmittel
    ownLocation: boolean      // Eigene Räumlichkeiten (teilweise)
    multipleClients: boolean  // Mehrere Auftraggeber
    substitutionRight: boolean // Darf Vertretung schicken
    noInstructions: boolean   // Keine Weisungsgebundenheit
  }

  compensation: {
    type: 'hourly' | 'monthly' | 'per_session' | 'per_student'
    amount: number
    currency: Currency
  }

  hoursPerWeek?: number
  taxId?: string              // Steuernummer des Freelancers
  insuranceConfirmed?: boolean // Eigene Haftpflicht?
  socialInsuranceExempt?: boolean

  createdAt: Date
  updatedAt: Date
}

// --- Loyalty / Treueprogramm (130%-Feature) ---

export interface LoyaltyConfig {
  id: ID
  providerId: ID
  enabled: boolean
  pointsPerBooking: number      // Punkte pro abgeschlossener Buchung
  pointsPerEuro: number         // Punkte pro ausgegebenem Euro (z.B. 1 Punkt/10€)
  tiers: LoyaltyTier[]
}

export interface LoyaltyTier {
  name: string                  // "Bronze", "Silber", "Gold"
  minPoints: number             // Ab wie vielen Punkten?
  discountPercent: number       // Rabatt in Prozent
  color: string                 // Farbcode für Badge
  perks: string[]               // z.B. ["5% Rabatt", "Priorität bei Warteliste"]
}

export interface LoyaltyAccount {
  parentId: ID
  providerId: ID
  totalPoints: number
  currentTier: string
  bookingsCompleted: number
  totalSpent: number
  memberSince: Date
}

// --- Marketing Automation ---

export type AutomationTrigger =
  | 'customer_signup'         // Neuer Kunde registriert sich
  | 'booking_confirmed'       // Buchung bestätigt
  | 'booking_reminder_24h'    // 24h vor Kurstermin
  | 'booking_completed'       // Kurs abgeschlossen
  | 'trial_completed'         // Probestunde abgeschlossen
  | 'trial_no_conversion'     // Probestunde ohne Buchung (nach X Tagen)
  | 'payment_received'        // Zahlung eingegangen
  | 'payment_overdue'         // Zahlung überfällig
  | 'waitlist_spot_available' // Platz auf Warteliste frei
  | 'child_birthday'          // Geburtstag des Kindes
  | 'inactive_customer'       // Kunde seit X Wochen inaktiv
  | 'course_ending_soon'      // Kurspaket endet in X Tagen
  | 'loyalty_tier_upgrade'    // Treuestufe aufgestiegen
  | 'review_request'          // Bewertung anfordern (nach Kurs)
  | 'seasonal_reminder'       // Saisonstart / Neues Halbjahr

export type AutomationChannel = 'whatsapp' | 'email' | 'sms'

export type AutomationStatus = 'active' | 'paused' | 'draft'

export interface AutomationFlow {
  id: ID
  providerId: ID
  name: string
  trigger: AutomationTrigger
  channel: AutomationChannel
  delayMinutes: number        // Verzögerung nach Trigger (0 = sofort)
  templateId: ID
  status: AutomationStatus
  conditions?: {
    minBookings?: number      // Nur wenn Kunde X+ Buchungen hat
    loyaltyTier?: string      // Nur für bestimmten Rang
    activityIds?: ID[]        // Nur für bestimmte Kurse
  }
  stats: {
    sent: number
    opened: number
    clicked: number
  }
  createdAt: Date
  updatedAt: Date
}

export interface MessageTemplate {
  id: ID
  providerId: ID
  name: string
  channel: AutomationChannel
  subject?: string            // Nur bei E-Mail
  body: string                // Mit Platzhaltern: {{childName}}, {{courseName}}, etc.
  variables: string[]         // Verfügbare Platzhalter
  isDefault: boolean          // System-Template oder benutzerdefiniert
  createdAt: Date
}

export interface MarketingCampaign {
  id: ID
  providerId: ID
  name: string
  channel: AutomationChannel
  templateId: ID
  targetSegment: 'all' | 'active' | 'inactive' | 'vip' | 'prospects' | 'custom'
  targetActivityIds?: ID[]
  status: 'draft' | 'scheduled' | 'sent'
  scheduledAt?: Date
  sentAt?: Date
  stats: {
    recipients: number
    sent: number
    opened: number
    clicked: number
  }
  createdAt: Date
}

// --- Audit Log (Compliance) ---

export interface AuditLogEntry {
  id: ID
  providerId: ID
  userId: ID
  userType: 'provider' | 'team_member' | 'parent' | 'admin'
  action: string            // "booking.created", "invoice.sent", "activity.published"
  entityType: string
  entityId: ID
  changes?: Record<string, { old: unknown; new: unknown }>
  ipAddress?: string
  timestamp: Date
}
