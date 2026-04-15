// ============================================================
// Zod Validation Schemas – Runtime Input-Validierung
// ============================================================

import { z } from 'zod'

// --- Basis ---

export const AddressSchema = z.object({
  street: z.string().min(1, 'Straße erforderlich'),
  city: z.string().min(1, 'Stadt erforderlich'),
  zip: z.string().min(4, 'PLZ ungültig').max(10),
  country: z.string().length(2, 'Ländercode muss 2 Zeichen haben').default('DE'),
  lat: z.number().optional(),
  lng: z.number().optional(),
})

export const ContactInfoSchema = z.object({
  email: z.string().email('Ungültige E-Mail'),
  phone: z.string().optional(),
  website: z.string().url('Ungültige URL').optional(),
})

export const ChildInfoSchema = z.object({
  name: z.string().min(1, 'Kindname erforderlich'),
  age: z.number().int().min(0).max(18, 'Alter muss zwischen 0 und 18 liegen'),
  emergencyContact: z.string().min(1, 'Notfallkontakt erforderlich'),
  emergencyPhone: z.string().min(1, 'Notfalltelefon erforderlich'),
  medicalNotes: z.string().optional(),
  allergies: z.array(z.string()).optional(),
})

// --- Provider ---

export const CreateProviderSchema = z.object({
  name: z.string().min(2, 'Name muss mind. 2 Zeichen haben').max(100),
  description: z.string().max(2000).default(''),
  address: AddressSchema,
  contact: ContactInfoSchema,
  categories: z.array(z.string()).min(1, 'Mind. eine Kategorie'),
  logo: z.string().optional(),
  subscription: z.enum(['free', 'starter', 'pro', 'enterprise']).optional(),
})

export const UpdateProviderSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(2000).optional(),
  address: AddressSchema.optional(),
  contact: ContactInfoSchema.optional(),
  categories: z.array(z.string()).optional(),
  logo: z.string().optional(),
  booking_redirect_url: z.string().url().nullable().optional(),
})

// --- Activity ---

const TimeSlotSchema = z.object({
  day: z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:mm'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:mm'),
})

const RecurringScheduleSchema = z.object({
  type: z.literal('recurring'),
  slots: z.array(TimeSlotSchema).min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const SingleScheduleSchema = z.object({
  type: z.literal('single'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
})

const CampScheduleSchema = z.object({
  type: z.literal('camp'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dailyStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  dailyEndTime: z.string().regex(/^\d{2}:\d{2}$/),
})

const ScheduleSchema = z.discriminatedUnion('type', [RecurringScheduleSchema, SingleScheduleSchema, CampScheduleSchema])

const PricingOptionSchema = z.object({
  label: z.string().min(1),
  type: z.enum(['single', 'package', 'subscription']),
  amount: z.number().positive('Preis muss positiv sein'),
  currency: z.enum(['EUR', 'CHF', 'USD']).default('EUR'),
  packageSize: z.number().int().positive().optional(),
  intervalMonths: z.number().int().positive().optional(),
  siblingDiscount: z.number().min(0).max(100).optional(),
})

export const CreateActivitySchema = z.object({
  providerId: z.string().min(1),
  locationId: z.string().optional(),
  instructorId: z.string().optional(),
  title: z.string().min(2, 'Titel muss mind. 2 Zeichen haben').max(200),
  description: z.string().max(5000).default(''),
  category: z.string().min(1),
  ageRange: z.object({ min: z.number().int().min(0), max: z.number().int().max(18) }).refine(d => d.min <= d.max, 'min muss <= max sein'),
  schedule: ScheduleSchema,
  capacity: z.number().int().positive('Kapazität muss positiv sein'),
  waitlistEnabled: z.boolean().optional(),
  trialEnabled: z.boolean().optional(),
  pricing: z.array(PricingOptionSchema).min(1, 'Mind. eine Preisoption'),
  platformListing: z.object({
    enabled: z.boolean(),
    platformCapacity: z.number().int().min(0),
    priorityMode: z.enum(['provider_first', 'equal', 'platform_first']).optional(),
    featured: z.boolean(),
    trialAvailable: z.boolean(),
  }).optional(),
  color: z.string().optional(),
  images: z.array(z.string()).optional(),
  media: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
})

// --- Booking ---

export const CreateBookingSchema = z.object({
  activityId: z.string().min(1),
  providerId: z.string().min(1),
  parentId: z.string().min(1),
  child: ChildInfoSchema,
  pricingOptionId: z.string().min(1),
  couponCode: z.string().optional(),
  source: z.enum(['direct', 'platform']).optional(),
  notes: z.string().max(1000).optional(),
})

// --- Parent ---

export const CreateParentSchema = z.object({
  name: z.string().min(1, 'Name erforderlich').max(100),
  email: z.string().email('Ungültige E-Mail'),
  phone: z.string().optional(),
  children: z.array(ChildInfoSchema).optional(),
})

export const UpdateParentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
})

// --- Team ---

export const CreateTeamMemberSchema = z.object({
  providerId: z.string().min(1),
  name: z.string().min(1, 'Name erforderlich').max(100),
  email: z.string().email('Ungültige E-Mail'),
  role: z.enum(['owner', 'admin', 'instructor', 'assistant']),
  specializations: z.array(z.string()).optional(),
  avatar: z.string().optional(),
})

// --- Invoice ---

export const InvoiceLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  vatRate: z.number().min(0).max(1).optional(),
})

export const CreateInvoiceSchema = z.object({
  providerId: z.string().min(1),
  parentId: z.string().min(1),
  bookingIds: z.array(z.string()).optional(),
  lineItems: z.array(InvoiceLineItemSchema).min(1, 'Mind. eine Rechnungsposition'),
  currency: z.enum(['EUR', 'CHF', 'USD']).optional(),
  dueInDays: z.number().int().positive().max(365).optional(),
})

// --- Payment ---

export const CreatePaymentSchema = z.object({
  providerId: z.string().min(1),
  parentId: z.string().min(1),
  bookingId: z.string().optional(),
  invoiceId: z.string().optional(),
  method: z.enum(['sepa_direct_debit', 'bank_transfer', 'cash', 'card', 'paypal']),
  amount: z.number().positive('Betrag muss positiv sein'),
  currency: z.enum(['EUR', 'CHF', 'USD']).optional(),
  reference: z.string().min(1),
  sepaMandateId: z.string().optional(),
})

// --- SEPA ---

const ibanRegex = /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/
export const CreateSepaMandateSchema = z.object({
  providerId: z.string().min(1),
  parentId: z.string().min(1),
  iban: z.string().transform(v => v.replace(/\s/g, '').toUpperCase()).pipe(z.string().regex(ibanRegex, 'Ungültiges IBAN-Format')),
  bic: z.string().optional(),
  accountHolder: z.string().min(1, 'Kontoinhaber erforderlich'),
})

// --- Coupon ---

export const CreateCouponSchema = z.object({
  providerId: z.string().min(1),
  code: z.string().min(3, 'Code mind. 3 Zeichen').max(20),
  type: z.enum(['percentage', 'fixed_amount', 'free_trial']),
  value: z.number().positive(),
  currency: z.enum(['EUR', 'CHF', 'USD']).optional(),
  activityIds: z.array(z.string()).optional(),
  maxUses: z.number().int().min(0).optional(),
  minBookingAmount: z.number().min(0).optional(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date(),
}).refine(d => d.type !== 'percentage' || (d.value >= 1 && d.value <= 100), 'Prozent-Rabatt muss 1-100 sein')

// --- Trial ---

export const CreateTrialSchema = z.object({
  activityId: z.string().min(1),
  providerId: z.string().min(1),
  parentId: z.string().min(1),
  child: ChildInfoSchema,
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
})

// --- Waitlist ---

export const AddToWaitlistSchema = z.object({
  activityId: z.string().min(1),
  parentId: z.string().min(1),
  child: ChildInfoSchema,
  priority: z.enum(['normal', 'sibling', 'returning', 'high']).optional(),
})

// --- Consent ---

export const CreateConsentSchema = z.object({
  parentId: z.string().min(1),
  childName: z.string().min(1),
  providerId: z.string().min(1),
  documentType: z.string().min(1),
  ipAddress: z.string().optional(),
})

// --- Message ---

export const SendMessageSchema = z.object({
  providerId: z.string().min(1),
  parentId: z.string().optional(),
  activityId: z.string().optional(),
  type: z.enum(['direct', 'broadcast', 'system']),
  subject: z.string().optional(),
  body: z.string().min(1, 'Nachricht darf nicht leer sein').max(10000),
})

// --- Review ---

export const CreateReviewSchema = z.object({
  activityId: z.string().min(1),
  providerId: z.string().min(1),
  parentId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
})

// --- Location ---

export const CreateLocationSchema = z.object({
  providerId: z.string().min(1),
  name: z.string().min(1).max(100),
  address: AddressSchema,
  rooms: z.array(z.string()).optional(),
  capacity: z.number().int().positive().optional(),
})

// --- Season ---

export const CreateSeasonSchema = z.object({
  providerId: z.string().min(1),
  name: z.string().min(1).max(200),
  type: z.enum(['school_term', 'holiday', 'summer_break', 'winter_break', 'custom']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// --- Holiday ---

export const CreateHolidaySchema = z.object({
  providerId: z.string().min(1),
  name: z.string().min(1).max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cancelActivities: z.boolean().optional(),
  region: z.string().optional(),
})

// --- Contract ---

export const CreateContractSchema = z.object({
  providerId: z.string().min(1),
  teamMemberId: z.string().min(1),
  type: z.enum(['employed', 'freelance', 'volunteer', 'mini_job']),
  title: z.string().min(1).max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  compensation: z.object({
    type: z.enum(['hourly', 'monthly', 'per_session', 'per_student']),
    amount: z.number().positive(),
    currency: z.enum(['EUR', 'CHF', 'USD']).optional(),
  }),
  hoursPerWeek: z.number().positive().optional(),
  taxId: z.string().optional(),
  freelanceIndicators: z.object({
    ownSchedule: z.boolean(),
    ownStudents: z.boolean(),
    ownMaterials: z.boolean(),
    ownLocation: z.boolean(),
    multipleClients: z.boolean(),
    substitutionRight: z.boolean(),
    noInstructions: z.boolean(),
  }).optional(),
})

// --- BuT Voucher ---

export const CreateBuTVoucherSchema = z.object({
  providerId: z.string().min(1),
  parentId: z.string().min(1),
  childName: z.string().min(1),
  bookingId: z.string().optional(),
  voucherNumber: z.string().min(1),
  issuingAuthority: z.string().min(1),
  monthlyAmount: z.number().positive().optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
})

// --- Document ---

export const CreateDocumentSchema = z.object({
  providerId: z.string().min(1),
  teamMemberId: z.string().optional(),
  type: z.string().min(1),
  name: z.string().min(1).max(200),
  fileUrl: z.string().optional(),
  issuedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  notes: z.string().optional(),
})

// --- Attendance ---

export const CheckInSchema = z.object({
  bookingId: z.string().min(1),
  activityId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkedInBy: z.string().optional(),
})

// --- E-Invoice ---

export const GenerateEInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
  format: z.enum(['zugferd', 'xrechnung', 'pdf']),
  leitweg_id: z.string().optional(),
})

// --- Export ---

export const CreateExportSchema = z.object({
  providerId: z.string().min(1),
  type: z.enum(['bookings', 'invoices', 'attendance', 'customers', 'revenue']),
  format: z.enum(['csv', 'pdf', 'xlsx', 'json', 'datev']),
  dateRange: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).optional(),
  filters: z.record(z.string(), z.string()).optional(),
})

// --- Widget ---

export const CreateWidgetSchema = z.object({
  providerId: z.string().min(1),
  type: z.enum(['booking_button', 'course_list', 'calendar', 'review_badge']),
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  primaryColor: z.string().optional(),
  activityIds: z.array(z.string()).optional(),
  showPrices: z.boolean().optional(),
  showAvailability: z.boolean().optional(),
  showReviews: z.boolean().optional(),
})

// --- Validation Helper ---

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { data: T } | { error: string } {
  const result = schema.safeParse(data)
  if (result.success) {
    return { data: result.data }
  }
  const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
  return { error: errors }
}
