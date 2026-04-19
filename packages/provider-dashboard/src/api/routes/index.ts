// ============================================================
// Route Module Barrel — re-exports registerRoutes
// ============================================================

import { Router } from '../router'
import { getClientIp, rateLimit } from './helpers'
import { registerHealthRoutes } from './health'
import { registerProviderRoutes } from './providers'
import { registerActivityRoutes } from './activities'
import { registerBookingRoutes } from './bookings'
import { registerParentRoutes } from './parents'
import { registerWaitlistRoutes } from './waitlist'
import { registerTrialRoutes } from './trials'
import { registerInvoiceRoutes } from './invoices'
import { registerComplianceRoutes } from './compliance'
import { registerCourseBlockRoutes } from './course-blocks'
import { registerPublicRoutes } from './public'
import { registerAdminRoutes } from './admin'
import { registerAuthRoutes } from './auth'
import { registerPortalRoutes } from './portal'
import { registerSettingsRoutes } from './settings'
import { registerMarketingRoutes } from './marketing'
import { registerMiscRoutes } from './misc'
import { registerInvitationRoutes } from './invitations'

export function registerRoutes(router: Router) {

  // Global rate limit: 1000 requests per IP per minute (DDoS protection)
  // NOTE: In-memory — resets on restart, per-instance only. For production multi-instance, use Redis.
  router.use(async (req, res, next) => {
    const ip = getClientIp(req)
    if (!rateLimit(`global:${ip}`, 1000, 60 * 1000)) {
      res.error(429, 'Rate limit exceeded')
      return
    }
    await next()
  })

  registerHealthRoutes(router)
  registerProviderRoutes(router)
  registerActivityRoutes(router)
  registerBookingRoutes(router)
  registerParentRoutes(router)
  registerWaitlistRoutes(router)
  registerTrialRoutes(router)
  registerInvoiceRoutes(router)
  registerComplianceRoutes(router)
  registerCourseBlockRoutes(router)
  registerPublicRoutes(router)
  registerAdminRoutes(router)
  registerAuthRoutes(router)
  registerPortalRoutes(router)
  registerSettingsRoutes(router)
  registerMarketingRoutes(router)
  registerMiscRoutes(router)
  registerInvitationRoutes(router)
}
