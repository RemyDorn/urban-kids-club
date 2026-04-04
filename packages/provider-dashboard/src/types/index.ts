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
