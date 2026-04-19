// ============================================================
// Supabase Services – Barrel Export
// ============================================================

export { SupabaseProviderService } from './provider.service'
export { SupabaseActivityService } from './activity.service'
export { SupabaseBookingService } from './booking.service'
export { SupabaseParentService } from './parent.service'
export { SupabaseLocationService } from './location.service'
export { SupabaseInvoiceService } from './invoice.service'
export { SupabasePaymentService, SupabaseSepaMandateService } from './payment.service'
export { SupabaseCalendarService } from './calendar.service'
export { SupabaseCouponService } from './coupon.service'
export { SupabaseWidgetService } from './widget.service'
export { SupabaseCourseBlockService } from './course-block.service'
export { SupabaseSessionCreditService } from './session-credit.service'
export { SupabaseMakeupBookingService } from './makeup-booking.service'
export { SupabaseReportingService } from './reporting.service'
export { SupabaseMarketingService } from './marketing.service'
export { SupabaseSeasonService, SupabaseHolidayService } from './season.service'
export { SupabaseAuditService } from './audit.service'
export { SupabaseWaitlistService } from './waitlist.service'
export { SupabaseExportService } from './export.service'
export { SupabaseCrmService } from './crm.service'
export { SupabaseNotificationService } from './notification.service'

export { SupabaseTeamService } from './team.service'
export { SupabaseAttendanceService } from './attendance.service'

// Re-export mappers for consumers that need direct DB conversion
export * from './mappers'
