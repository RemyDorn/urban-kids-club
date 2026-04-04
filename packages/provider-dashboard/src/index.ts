// ============================================================
// Provider Dashboard – Public API
// ============================================================
// Dies ist der Einstiegspunkt, den die Plattform konsumiert.
// Alles, was hier exportiert wird, ist die Schnittstelle.
// ============================================================

// Typen
export * from './types'

// Services
export {
  ProviderService,
  ActivityService,
  BookingService,
  AttendanceService,
  InvoiceService,
  ReportingService,
} from './services'

// Store (nur für Tests / Reset)
export { store } from './domain/store'
