// Barrel Export – alle Services
// Conditional Supabase/In-Memory switching via USE_SUPABASE env

const USE_SUPABASE = process.env.USE_SUPABASE === 'true'

// ============================================================
// Static imports from both implementations
// ============================================================

// In-memory services
import { ProviderService as MemProviderService } from './provider.service'
import { ActivityService as MemActivityService } from './activity.service'
import { BookingService as MemBookingService } from './booking.service'
import { ParentService as MemParentService } from './parent.service'
import { LocationService as MemLocationService } from './location.service'
import { InvoiceService as MemInvoiceService } from './invoice.service'
import { PaymentService as MemPaymentService, SepaMandateService as MemSepaMandateService } from './payment.service'
import { CalendarService as MemCalendarService } from './calendar.service'
import { CouponService as MemCouponService } from './coupon.service'
import { WidgetService as MemWidgetService } from './widget.service'
import { CourseBlockService as MemCourseBlockService } from './course-block.service'
import { SessionCreditService as MemSessionCreditService } from './session-credit.service'
import { MakeupBookingService as MemMakeupBookingService } from './makeup-booking.service'
import { ReportingService as MemReportingService } from './reporting.service'
import { SeasonService as MemSeasonService, HolidayService as MemHolidayService } from './season.service'
import { AuditService as MemAuditService } from './audit.service'
import { WaitlistService as MemWaitlistService } from './waitlist.service'
import { ExportService as MemExportService } from './export.service'
import { CrmService as MemCrmService } from './crm.service'
import { NotificationService as MemNotificationService } from './notification.service'

// Supabase services
import { SupabaseProviderService } from './supabase/provider.service'
import { SupabaseActivityService } from './supabase/activity.service'
import { SupabaseBookingService } from './supabase/booking.service'
import { SupabaseParentService } from './supabase/parent.service'
import { SupabaseLocationService } from './supabase/location.service'
import { SupabaseInvoiceService } from './supabase/invoice.service'
import { SupabasePaymentService, SupabaseSepaMandateService } from './supabase/payment.service'
import { SupabaseCalendarService } from './supabase/calendar.service'
import { SupabaseCouponService } from './supabase/coupon.service'
import { SupabaseWidgetService } from './supabase/widget.service'
import { SupabaseCourseBlockService } from './supabase/course-block.service'
import { SupabaseSessionCreditService } from './supabase/session-credit.service'
import { SupabaseMakeupBookingService } from './supabase/makeup-booking.service'
import { SupabaseReportingService } from './supabase/reporting.service'
import { SupabaseSeasonService, SupabaseHolidayService } from './supabase/season.service'
import { SupabaseAuditService } from './supabase/audit.service'
import { SupabaseWaitlistService } from './supabase/waitlist.service'
import { SupabaseExportService } from './supabase/export.service'
import { SupabaseCrmService } from './supabase/crm.service'
import { SupabaseNotificationService } from './supabase/notification.service'

// ============================================================
// Export the active implementation
// ============================================================

export const ProviderService = USE_SUPABASE ? SupabaseProviderService : MemProviderService
export const ActivityService = USE_SUPABASE ? SupabaseActivityService : MemActivityService
export const BookingService = USE_SUPABASE ? SupabaseBookingService : MemBookingService
export const ParentService = USE_SUPABASE ? SupabaseParentService : MemParentService
export const LocationService = USE_SUPABASE ? SupabaseLocationService : MemLocationService
export const InvoiceService = USE_SUPABASE ? SupabaseInvoiceService : MemInvoiceService
export const PaymentService = USE_SUPABASE ? SupabasePaymentService : MemPaymentService
export const SepaMandateService = USE_SUPABASE ? SupabaseSepaMandateService : MemSepaMandateService
export const CalendarService = USE_SUPABASE ? SupabaseCalendarService : MemCalendarService
export const CouponService = USE_SUPABASE ? SupabaseCouponService : MemCouponService
export const WidgetService = USE_SUPABASE ? SupabaseWidgetService : MemWidgetService
export const CourseBlockService = USE_SUPABASE ? SupabaseCourseBlockService : MemCourseBlockService
export const SessionCreditService = USE_SUPABASE ? SupabaseSessionCreditService : MemSessionCreditService
export const MakeupBookingService = USE_SUPABASE ? SupabaseMakeupBookingService : MemMakeupBookingService
export const ReportingService = USE_SUPABASE ? SupabaseReportingService : MemReportingService
export const SeasonService = USE_SUPABASE ? SupabaseSeasonService : MemSeasonService
export const HolidayService = USE_SUPABASE ? SupabaseHolidayService : MemHolidayService
export const AuditService = USE_SUPABASE ? SupabaseAuditService : MemAuditService
export const WaitlistService = USE_SUPABASE ? SupabaseWaitlistService : MemWaitlistService
export const ExportService = USE_SUPABASE ? SupabaseExportService : MemExportService
export const CrmService = USE_SUPABASE ? SupabaseCrmService : MemCrmService
export const NotificationService = USE_SUPABASE ? SupabaseNotificationService : MemNotificationService

// ============================================================
// Services WITHOUT Supabase implementations (deferred) – always in-memory
// ============================================================

export { AttendanceService } from './attendance.service'
export { TeamService } from './team.service'
export { ReviewService } from './review.service'
export { MessageService } from './message.service'
export { TrialService } from './trial.service'
export { DocumentService, ConsentService } from './document.service'
export { EInvoiceService } from './einvoice.service'
export { BuTVoucherService } from './but-voucher.service'
export { ContractService } from './contract.service'

// ============================================================
// Shared Helpers & Validierung – always from in-memory
// ============================================================

export { createNotification, createAuditEntry, calcDocumentStatus, getEntitiesFromIndex } from './helpers'
export { Validators, WAITLIST_SIGNAL } from './validators'
export { TrialConversionWorkflow, WaitlistConversionWorkflow, BackgroundJobs, CascadeDelete } from './workflows'
