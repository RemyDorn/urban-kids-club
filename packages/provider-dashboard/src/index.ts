// ============================================================
// Provider Dashboard – Public API
// ============================================================
// Dies ist der Einstiegspunkt, den die Plattform konsumiert.
// Alles, was hier exportiert wird, ist die Schnittstelle.
// ============================================================

// Typen
export * from './types'

// Kern-Services (100% – Plattform-relevant)
export {
  ProviderService,
  ActivityService,
  BookingService,
  AttendanceService,
  LocationService,
  TeamService,
  ParentService,
  ReviewService,
  MessageService,
} from './services'

// 130%-Features (Provider-Mehrwert)
export {
  WaitlistService,
  CouponService,
  CalendarService,
  TrialService,
  NotificationService,
  SepaMandateService,
  PaymentService,
  InvoiceService,
  DocumentService,
  ConsentService,
  SeasonService,
  HolidayService,
  AuditService,
  WidgetService,
  CrmService,
  ExportService,
  ReportingService,
} from './services'

// Store (nur für Tests / Reset)
export { store } from './domain/store'
