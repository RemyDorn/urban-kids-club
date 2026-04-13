# Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Urban Kids Club Provider Dashboard from in-memory Maps to Supabase PostgreSQL with auth, multi-tenancy, and persistent cloud storage.

**Architecture:** Service companion pattern — each in-memory service gets a `.supabase.ts` companion implementing the same interface with Supabase queries. A barrel file (`services/index.ts`) switches implementations based on `USE_SUPABASE` env. Frontend gets a login screen; JWT auth enforced on all API routes.

**Tech Stack:** Node.js, TypeScript, Supabase (PostgreSQL + Auth + RLS), existing zero-dependency HTTP router

**Spec:** `docs/superpowers/specs/2026-04-13-supabase-migration-design.md`

---

## File Structure

### New Files

```
src/
  services/
    supabase/                         # All Supabase service implementations
      provider.service.ts             # Provider CRUD via Supabase
      activity.service.ts             # Activity CRUD via Supabase  
      booking.service.ts              # Booking CRUD via Supabase
      parent.service.ts               # Parent CRUD via Supabase
      invoice.service.ts              # Invoice CRUD via Supabase
      payment.service.ts              # Payment + SEPA via Supabase
      calendar.service.ts             # Calendar events via Supabase
      coupon.service.ts               # Coupon CRUD via Supabase
      widget.service.ts               # Widget config CRUD via Supabase
      course-block.service.ts         # Course blocks via Supabase
      session-credit.service.ts       # Session credits via Supabase
      makeup-booking.service.ts       # Makeup bookings via Supabase
      reporting.service.ts            # Report aggregations via Supabase
      marketing.service.ts            # Automation flows/templates via Supabase
      season.service.ts               # Seasons + holidays via Supabase
      audit.service.ts                # Audit log via Supabase
      location.service.ts             # Location CRUD via Supabase
      waitlist.service.ts             # Waitlist via Supabase
      export.service.ts               # Export requests via Supabase
      crm.service.ts                  # CRM (basic parent tags/notes) via Supabase
      notification.service.ts         # Notifications via Supabase
      mappers.ts                      # Shared DB↔App object mappers
      index.ts                        # Barrel export for all Supabase services
  lib/
    auth-middleware.ts                # JWT validation middleware (replaces requireAuth placeholder)
  db/
    migrations/                       # SQL migration files
      001-missing-tables.sql          # Create course_blocks, marketing tables, etc.
      002-rls-policies.sql            # RLS for new tables
      003-indexes.sql                 # Performance indexes
    seed-supabase.ts                  # Seed script for demo data in Supabase

tests/
  services/
    supabase/
      provider.test.ts
      activity.test.ts
      booking.test.ts
      auth.test.ts
```

### Modified Files

```
src/services/index.ts               # Add USE_SUPABASE switch
src/api/routes.ts                   # Wire auth middleware, async handlers
src/api/server.ts                   # Load Supabase config, skip persistence when USE_SUPABASE
src/api/router.ts                   # Support async route handlers
src/lib/supabase.ts                 # Add service_role key from env
src/lib/auth.ts                     # Implement real JWT validation
src/frontend/dashboard.html         # Add login screen, JWT handling, remove provider dropdown
```

---

## Phase 1: Foundation (Auth + Infrastructure)

### Task 1: Make Router Support Async Handlers

The current router only supports sync handlers. Supabase calls are async. We need to support `async (req, res) => {}`.

**Files:**
- Modify: `src/api/router.ts`

- [ ] **Step 1: Read the current router handler type**

```bash
cd "C:/Users/Z/Claude Code/urban-kids-club/packages/provider-dashboard"
grep -n "handler" src/api/router.ts | head -20
```

- [ ] **Step 2: Update handler type to support async**

In `src/api/router.ts`, find the `RouteHandler` type and the `handle()` method. Change the handler type to allow `Promise<void>` returns, and `await` the handler call in `handle()`:

```typescript
// Change handler type from:
type RouteHandler = (req: ParsedRequest, res: ApiResponse) => void
// To:
type RouteHandler = (req: ParsedRequest, res: ApiResponse) => void | Promise<void>
```

In the `handle()` method, wrap the handler call:

```typescript
// Change from:
handler(req, res)
// To:
try {
  await handler(req, res)
} catch (err) {
  const message = err instanceof Error ? err.message : 'Internal Server Error'
  console.error(`Error handling ${req.method} ${req.path}:`, message)
  if (!res.headersSent) {
    res.error(500, message)
  }
}
```

Make the `handle()` method `async`.

- [ ] **Step 3: Verify existing sync handlers still work**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/api/router.ts
git commit -m "feat: support async route handlers in router"
```

---

### Task 2: Implement Auth Middleware

Replace the `requireAuth()` placeholder with real JWT validation via Supabase.

**Files:**
- Create: `src/lib/auth-middleware.ts`
- Modify: `src/lib/supabase.ts`

- [ ] **Step 1: Update supabase.ts to read service_role key from env**

In `src/lib/supabase.ts`, the service_role key is already read from `process.env.SUPABASE_SERVICE_ROLE_KEY`. Verify it works by checking the existing code. No changes needed if the env var is set.

- [ ] **Step 2: Create auth-middleware.ts**

```typescript
// src/lib/auth-middleware.ts
import { supabase } from './supabase'
import type { ParsedRequest, ApiResponse } from '../api/router'

export interface AuthContext {
  userId: string
  email: string
  providerId: string
}

// Cache provider lookups for 5 minutes (avoids DB hit on every request)
const providerCache = new Map<string, { providerId: string; expiresAt: number }>()
const CACHE_TTL = 5 * 60 * 1000

export async function authenticateRequest(req: ParsedRequest): Promise<AuthContext> {
  const token = req.raw.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    throw new AuthError(401, 'Nicht authentifiziert')
  }

  // Validate JWT with Supabase
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user || !user.email) {
    throw new AuthError(401, 'Token ungültig oder abgelaufen')
  }

  // Look up provider by login_email (with cache)
  const cached = providerCache.get(user.email)
  if (cached && cached.expiresAt > Date.now()) {
    return { userId: user.id, email: user.email, providerId: cached.providerId }
  }

  const { data: provider, error: provErr } = await supabase
    .from('providers')
    .select('id')
    .eq('login_email', user.email)
    .single()

  if (provErr || !provider) {
    throw new AuthError(403, 'Kein Anbieter-Konto für diese E-Mail')
  }

  providerCache.set(user.email, {
    providerId: provider.id,
    expiresAt: Date.now() + CACHE_TTL,
  })

  return { userId: user.id, email: user.email, providerId: provider.id }
}

export class AuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

// Middleware wrapper for routes
export async function requireAuth(req: ParsedRequest, res: ApiResponse): Promise<AuthContext | null> {
  try {
    const auth = await authenticateRequest(req)
    return auth
  } catch (err) {
    if (err instanceof AuthError) {
      res.error(err.statusCode, err.message)
    } else {
      res.error(500, 'Auth-Fehler')
    }
    return null
  }
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth-middleware.ts
git commit -m "feat: add JWT auth middleware with Supabase validation"
```

---

### Task 3: Create Missing Database Tables

Create the tables that exist in the in-memory store but not yet in Supabase.

**Files:**
- Create: `src/db/migrations/001-missing-tables.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- src/db/migrations/001-missing-tables.sql
-- Missing tables: course_blocks system, marketing system

-- ============================================================
-- Course Block System
-- ============================================================

CREATE TABLE IF NOT EXISTS course_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  season_label text NOT NULL,
  total_sessions int NOT NULL DEFAULT 8,
  start_date date NOT NULL,
  end_date date NOT NULL,
  extended_end_date date,
  recurring_day text NOT NULL,
  recurring_time time NOT NULL,
  duration_minutes int NOT NULL DEFAULT 60,
  price_per_block numeric NOT NULL DEFAULT 140.00,
  currency text NOT NULL DEFAULT 'EUR',
  capacity int NOT NULL,
  makeup_capacity int NOT NULL DEFAULT 2,
  max_credits_per_enrollment int NOT NULL DEFAULT 2,
  cancellation_deadline_minutes int NOT NULL DEFAULT 1440,
  status text NOT NULL DEFAULT 'upcoming',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS block_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES course_blocks(id) ON DELETE CASCADE,
  session_number int NOT NULL,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  cancellation_reason text,
  compensation_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS block_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES course_blocks(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  child_id text NOT NULL,
  child_name text NOT NULL,
  child_age int NOT NULL,
  booking_id uuid,
  status text NOT NULL DEFAULT 'active',
  price_paid numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  credits_earned int NOT NULL DEFAULT 0,
  credits_used int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session_attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES block_sessions(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES course_blocks(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES block_enrollments(id) ON DELETE CASCADE,
  child_id text NOT NULL,
  status text NOT NULL DEFAULT 'expected',
  cancelled_at timestamptz,
  cancelled_minutes_before int,
  credit_issued boolean NOT NULL DEFAULT false,
  is_makeup boolean NOT NULL DEFAULT false,
  makeup_credit_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES block_enrollments(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES course_blocks(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  child_id text NOT NULL,
  activity_type text NOT NULL,
  reason text NOT NULL,
  is_provider_cancellation boolean NOT NULL DEFAULT false,
  original_session_id uuid NOT NULL REFERENCES block_sessions(id),
  original_session_date date NOT NULL,
  status text NOT NULL DEFAULT 'available',
  valid_until date NOT NULL,
  used_in_session_id uuid REFERENCES block_sessions(id),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS makeup_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid NOT NULL REFERENCES session_credits(id),
  target_block_id uuid NOT NULL REFERENCES course_blocks(id),
  target_session_id uuid NOT NULL REFERENCES block_sessions(id),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  child_id text NOT NULL,
  child_name text NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  booked_by text NOT NULL DEFAULT 'provider',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Marketing System
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  delay_minutes int NOT NULL DEFAULT 0,
  template_id uuid,
  status text NOT NULL DEFAULT 'draft',
  conditions jsonb,
  stats_sent int NOT NULL DEFAULT 0,
  stats_opened int NOT NULL DEFAULT 0,
  stats_clicked int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  subject text,
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  template_id uuid REFERENCES message_templates(id),
  target_segment text NOT NULL DEFAULT 'all',
  target_activity_ids jsonb,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  stats_recipients int NOT NULL DEFAULT 0,
  stats_sent int NOT NULL DEFAULT 0,
  stats_opened int NOT NULL DEFAULT 0,
  stats_clicked int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add FK from automation_flows to message_templates after both exist
ALTER TABLE automation_flows 
  ADD CONSTRAINT automation_flows_template_id_fkey 
  FOREIGN KEY (template_id) REFERENCES message_templates(id);
```

- [ ] **Step 2: Run the migration against Supabase**

Use the Supabase MCP tool `apply_migration` or `execute_sql` to run this SQL.

- [ ] **Step 3: Commit**

```bash
git add src/db/migrations/001-missing-tables.sql
git commit -m "feat: add missing Supabase tables (course blocks, marketing)"
```

---

### Task 4: Add RLS Policies for New Tables

**Files:**
- Create: `src/db/migrations/002-rls-policies.sql`

- [ ] **Step 1: Write RLS policies**

```sql
-- src/db/migrations/002-rls-policies.sql
-- RLS for new tables - same pattern as existing tables

-- Course Blocks
ALTER TABLE course_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers_own_blocks" ON course_blocks FOR ALL
  USING (provider_id IN (
    SELECT id FROM providers WHERE login_email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
  ));

ALTER TABLE block_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers_own_block_sessions" ON block_sessions FOR ALL
  USING (block_id IN (
    SELECT id FROM course_blocks WHERE provider_id IN (
      SELECT id FROM providers WHERE login_email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
    )
  ));

ALTER TABLE block_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers_own_enrollments" ON block_enrollments FOR ALL
  USING (provider_id IN (
    SELECT id FROM providers WHERE login_email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
  ));

ALTER TABLE session_attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers_own_attendance" ON session_attendance_records FOR ALL
  USING (block_id IN (
    SELECT id FROM course_blocks WHERE provider_id IN (
      SELECT id FROM providers WHERE login_email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
    )
  ));

ALTER TABLE session_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers_own_credits" ON session_credits FOR ALL
  USING (provider_id IN (
    SELECT id FROM providers WHERE login_email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
  ));

ALTER TABLE makeup_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers_own_makeup" ON makeup_bookings FOR ALL
  USING (provider_id IN (
    SELECT id FROM providers WHERE login_email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
  ));

-- Marketing
ALTER TABLE automation_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers_own_flows" ON automation_flows FOR ALL
  USING (provider_id IN (
    SELECT id FROM providers WHERE login_email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
  ));

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers_own_templates" ON message_templates FOR ALL
  USING (provider_id IN (
    SELECT id FROM providers WHERE login_email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
  ));

ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers_own_campaigns" ON marketing_campaigns FOR ALL
  USING (provider_id IN (
    SELECT id FROM providers WHERE login_email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
  ));
```

- [ ] **Step 2: Run migration**

- [ ] **Step 3: Commit**

```bash
git add src/db/migrations/002-rls-policies.sql
git commit -m "feat: add RLS policies for new tables"
```

---

### Task 5: Add Performance Indexes

**Files:**
- Create: `src/db/migrations/003-indexes.sql`

- [ ] **Step 1: Write index migration**

```sql
-- src/db/migrations/003-indexes.sql

CREATE INDEX IF NOT EXISTS idx_activities_provider ON activities(provider_id);
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
CREATE INDEX IF NOT EXISTS idx_provider_bookings_provider ON provider_bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_bookings_activity ON provider_bookings(activity_id);
CREATE INDEX IF NOT EXISTS idx_provider_bookings_parent ON provider_bookings(parent_id);
CREATE INDEX IF NOT EXISTS idx_provider_bookings_status ON provider_bookings(status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_provider_date ON calendar_events(provider_id, date);
CREATE INDEX IF NOT EXISTS idx_invoices_provider ON invoices(provider_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_course_blocks_provider ON course_blocks(provider_id);
CREATE INDEX IF NOT EXISTS idx_block_enrollments_block ON block_enrollments(block_id);
CREATE INDEX IF NOT EXISTS idx_block_enrollments_parent ON block_enrollments(parent_id);
CREATE INDEX IF NOT EXISTS idx_session_credits_enrollment ON session_credits(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_session_credits_status ON session_credits(status);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_coupons_provider ON coupons(provider_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_parents_email ON parents(email);
CREATE INDEX IF NOT EXISTS idx_providers_login_email ON providers(login_email);
CREATE INDEX IF NOT EXISTS idx_providers_slug ON providers(slug);
```

- [ ] **Step 2: Run migration**

- [ ] **Step 3: Commit**

```bash
git add src/db/migrations/003-indexes.sql
git commit -m "feat: add performance indexes"
```

---

## Phase 2: Shared Mappers + Service Barrel

### Task 6: Create Shared DB↔App Mappers

These mappers convert between snake_case DB rows and camelCase TypeScript objects. Every Supabase service will use them.

**Files:**
- Create: `src/services/supabase/mappers.ts`

- [ ] **Step 1: Write the mappers**

```typescript
// src/services/supabase/mappers.ts
// DB row ↔ App object converters
// DB uses: snake_case, uuid, timestamptz, flat columns
// App uses: camelCase, string IDs, Date objects, nested objects

import type {
  Provider, Activity, Booking, Parent, Invoice, CalendarEvent,
  WidgetConfig, Coupon, PaymentRecord, SepaMandate, Location,
  CourseBlock, BlockSession, BlockEnrollment, SessionCredit,
  MakeupBooking, Address, ContactInfo, PricingOption, Schedule,
  PlatformListing, ChildInfo, InvoiceLineItem,
} from '../../types'

// ============================================================
// Provider
// ============================================================

export function providerFromDb(row: any): Provider {
  return {
    id: row.id,
    name: row.company_name,
    slug: row.slug,
    description: row.description || '',
    logo: row.logo_url || undefined,
    address: {
      street: row.address_street,
      city: row.address_city,
      zip: row.address_zip,
      country: 'DE',
      lat: row.latitude ? Number(row.latitude) : undefined,
      lng: row.longitude ? Number(row.longitude) : undefined,
    },
    contact: {
      email: row.email,
      phone: row.phone || undefined,
      website: row.website_url || undefined,
    },
    categories: row.categories || [],
    status: row.status,
    subscription: row.subscription,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function providerToDb(input: Partial<Provider> & { name?: string; address?: Address; contact?: ContactInfo }): Record<string, any> {
  const row: Record<string, any> = {}
  if (input.name !== undefined) row.company_name = input.name
  if (input.slug !== undefined) row.slug = input.slug
  if (input.description !== undefined) row.description = input.description
  if (input.logo !== undefined) row.logo_url = input.logo
  if (input.categories !== undefined) row.categories = input.categories
  if (input.status !== undefined) row.status = input.status
  if (input.subscription !== undefined) row.subscription = input.subscription
  if (input.address) {
    row.address_street = input.address.street
    row.address_city = input.address.city
    row.address_zip = input.address.zip
    if (input.address.lat !== undefined) row.latitude = input.address.lat
    if (input.address.lng !== undefined) row.longitude = input.address.lng
  }
  if (input.contact) {
    row.email = input.contact.email
    if (input.contact.phone !== undefined) row.phone = input.contact.phone
    if (input.contact.website !== undefined) row.website_url = input.contact.website
  }
  return row
}

// ============================================================
// Activity
// ============================================================

export function activityFromDb(row: any): Activity {
  return {
    id: row.id,
    providerId: row.provider_id,
    locationId: row.location_id || undefined,
    instructorId: row.instructor_id || undefined,
    title: row.title,
    description: row.description || '',
    category: row.category,
    ageRange: { min: row.age_group_min, max: row.age_group_max },
    schedule: row.schedule || { type: 'recurring', slots: [], startDate: '' },
    capacity: row.capacity,
    waitlistEnabled: row.waitlist_enabled,
    trialEnabled: row.trial_enabled,
    pricing: row.pricing || [],
    platformListing: row.platform_listing || undefined,
    color: row.color || undefined,
    images: row.images || [],
    tags: row.tags || [],
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function activityToDb(input: any): Record<string, any> {
  const row: Record<string, any> = {}
  if (input.title !== undefined) row.title = input.title
  if (input.description !== undefined) row.description = input.description
  if (input.category !== undefined) row.category = input.category
  if (input.ageRange) {
    row.age_group_min = input.ageRange.min
    row.age_group_max = input.ageRange.max
  }
  if (input.schedule !== undefined) row.schedule = input.schedule
  if (input.capacity !== undefined) row.capacity = input.capacity
  if (input.waitlistEnabled !== undefined) row.waitlist_enabled = input.waitlistEnabled
  if (input.trialEnabled !== undefined) row.trial_enabled = input.trialEnabled
  if (input.pricing !== undefined) row.pricing = input.pricing
  if (input.platformListing !== undefined) row.platform_listing = input.platformListing
  if (input.color !== undefined) row.color = input.color
  if (input.images !== undefined) row.images = input.images
  if (input.tags !== undefined) row.tags = input.tags
  if (input.status !== undefined) row.status = input.status
  if (input.providerId !== undefined) row.provider_id = input.providerId
  if (input.locationId !== undefined) row.location_id = input.locationId
  if (input.instructorId !== undefined) row.instructor_id = input.instructorId
  if (input.slug !== undefined) row.slug = input.slug
  return row
}

// ============================================================
// Booking (uses provider_bookings table)
// ============================================================

export function bookingFromDb(row: any): Booking {
  const childInfo = row.child_info || {}
  return {
    id: row.id,
    activityId: row.activity_id,
    providerId: row.provider_id,
    parentId: row.parent_id,
    child: {
      name: childInfo.name || '',
      age: childInfo.age || 0,
      emergencyContact: childInfo.emergencyContact || '',
      emergencyPhone: childInfo.emergencyPhone || '',
      medicalNotes: childInfo.medicalNotes,
      allergies: childInfo.allergies || [],
    },
    pricingOptionId: row.pricing_option_id,
    status: row.status,
    paymentStatus: row.payment_status,
    amountPaid: Number(row.amount_paid),
    currency: row.currency,
    source: row.source,
    notes: row.notes || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function bookingToDb(input: any): Record<string, any> {
  const row: Record<string, any> = {}
  if (input.activityId !== undefined) row.activity_id = input.activityId
  if (input.providerId !== undefined) row.provider_id = input.providerId
  if (input.parentId !== undefined) row.parent_id = input.parentId
  if (input.child !== undefined) row.child_info = input.child
  if (input.pricingOptionId !== undefined) row.pricing_option_id = input.pricingOptionId
  if (input.status !== undefined) row.status = input.status
  if (input.paymentStatus !== undefined) row.payment_status = input.paymentStatus
  if (input.amountPaid !== undefined) row.amount_paid = input.amountPaid
  if (input.currency !== undefined) row.currency = input.currency
  if (input.source !== undefined) row.source = input.source
  if (input.notes !== undefined) row.notes = input.notes
  return row
}

// ============================================================
// Parent
// ============================================================

export function parentFromDb(row: any): Parent {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || undefined,
    children: row.children || [],
    createdAt: new Date(row.created_at),
  }
}

export function parentToDb(input: any): Record<string, any> {
  const row: Record<string, any> = {}
  if (input.name !== undefined) row.name = input.name
  if (input.email !== undefined) row.email = input.email
  if (input.phone !== undefined) row.phone = input.phone
  if (input.children !== undefined) row.children = input.children
  return row
}

// ============================================================
// Invoice
// ============================================================

export function invoiceFromDb(row: any): Invoice {
  return {
    id: row.id,
    providerId: row.provider_id,
    parentId: row.parent_id,
    bookingIds: row.booking_ids || [],
    number: row.number,
    lineItems: row.line_items || [],
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    total: Number(row.total),
    currency: row.currency,
    status: row.status,
    issuedAt: new Date(row.issued_at),
    dueDate: new Date(row.due_date),
    paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
  }
}

export function invoiceToDb(input: any): Record<string, any> {
  const row: Record<string, any> = {}
  if (input.providerId !== undefined) row.provider_id = input.providerId
  if (input.parentId !== undefined) row.parent_id = input.parentId
  if (input.bookingIds !== undefined) row.booking_ids = input.bookingIds
  if (input.number !== undefined) row.number = input.number
  if (input.lineItems !== undefined) row.line_items = input.lineItems
  if (input.subtotal !== undefined) row.subtotal = input.subtotal
  if (input.tax !== undefined) row.tax = input.tax
  if (input.total !== undefined) row.total = input.total
  if (input.currency !== undefined) row.currency = input.currency
  if (input.status !== undefined) row.status = input.status
  if (input.issuedAt !== undefined) row.issued_at = input.issuedAt
  if (input.dueDate !== undefined) row.due_date = input.dueDate
  if (input.paidAt !== undefined) row.paid_at = input.paidAt
  return row
}

// ============================================================
// Calendar Event
// ============================================================

export function calendarEventFromDb(row: any): CalendarEvent {
  return {
    id: row.id,
    providerId: row.provider_id,
    activityId: row.activity_id || undefined,
    locationId: row.location_id || undefined,
    instructorId: row.instructor_id || undefined,
    title: row.title,
    description: row.description || undefined,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    recurring: row.recurring,
    recurrenceRule: row.recurrence_rule || undefined,
    color: row.color || undefined,
    type: row.type,
  }
}

// ============================================================
// Location
// ============================================================

export function locationFromDb(row: any): Location {
  return {
    id: row.id,
    providerId: row.provider_id,
    name: row.name,
    address: {
      street: row.street,
      city: row.city,
      zip: row.zip,
      country: row.country,
      lat: row.lat ? Number(row.lat) : undefined,
      lng: row.lng ? Number(row.lng) : undefined,
    },
    rooms: row.rooms || [],
    capacity: row.capacity,
  }
}

// ============================================================
// Course Block
// ============================================================

export function courseBlockFromDb(row: any): CourseBlock {
  return {
    id: row.id,
    providerId: row.provider_id,
    activityId: row.activity_id,
    activityType: row.activity_type,
    seasonLabel: row.season_label,
    totalSessions: row.total_sessions,
    startDate: row.start_date,
    endDate: row.end_date,
    extendedEndDate: row.extended_end_date || undefined,
    recurringDay: row.recurring_day,
    recurringTime: row.recurring_time,
    durationMinutes: row.duration_minutes,
    pricePerBlock: Number(row.price_per_block),
    currency: row.currency,
    capacity: row.capacity,
    makeupCapacity: row.makeup_capacity,
    maxCreditsPerEnrollment: row.max_credits_per_enrollment,
    cancellationDeadlineMinutes: row.cancellation_deadline_minutes,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

// ============================================================
// Widget Config
// ============================================================

export function widgetConfigFromDb(row: any): WidgetConfig {
  return {
    id: row.id,
    providerId: row.provider_id,
    type: row.type,
    theme: row.theme,
    primaryColor: row.primary_color || undefined,
    activityIds: row.activity_ids || [],
    showPrices: row.show_prices,
    showAvailability: row.show_availability,
    showReviews: row.show_reviews,
    embedCode: row.embed_code || undefined,
    createdAt: new Date(row.created_at),
  }
}

// ============================================================
// Coupon
// ============================================================

export function couponFromDb(row: any): Coupon {
  return {
    id: row.id,
    providerId: row.provider_id,
    code: row.code,
    type: row.type,
    value: Number(row.value),
    currency: row.currency,
    activityIds: row.activity_ids || [],
    maxUses: row.max_uses,
    usedCount: row.used_count,
    minBookingAmount: row.min_booking_amount ? Number(row.min_booking_amount) : undefined,
    validFrom: new Date(row.valid_from),
    validUntil: new Date(row.valid_until),
    active: row.active,
    createdAt: new Date(row.created_at),
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/supabase/mappers.ts
git commit -m "feat: add DB-to-app object mappers for all entities"
```

---

### Task 7: Create Supabase Service Barrel + Switching Logic

**Files:**
- Create: `src/services/supabase/index.ts`
- Modify: `src/services/index.ts`

- [ ] **Step 1: Create the Supabase barrel export**

```typescript
// src/services/supabase/index.ts
// Barrel export for all Supabase-backed services
// Each service is created in subsequent tasks

export { ProviderService } from './provider.service'
export { ActivityService } from './activity.service'
export { BookingService } from './booking.service'
export { ParentService } from './parent.service'
export { LocationService } from './location.service'
export { InvoiceService } from './invoice.service'
export { PaymentService, SepaMandateService } from './payment.service'
export { CalendarService } from './calendar.service'
export { CouponService } from './coupon.service'
export { WidgetService } from './widget.service'
export { CourseBlockService } from './course-block.service'
export { SessionCreditService } from './session-credit.service'
export { MakeupBookingService } from './makeup-booking.service'
export { ReportingService } from './reporting.service'
export { MarketingService } from './marketing.service'
export { SeasonService, HolidayService } from './season.service'
export { AuditService } from './audit.service'
export { WaitlistService } from './waitlist.service'
export { ExportService } from './export.service'
export { CrmService } from './crm.service'
export { NotificationService } from './notification.service'
```

- [ ] **Step 2: Update the main barrel to switch based on USE_SUPABASE**

Replace `src/services/index.ts` with:

```typescript
// src/services/index.ts
// Barrel Export – switches between in-memory and Supabase implementations

const USE_SUPABASE = process.env.USE_SUPABASE === 'true'

if (USE_SUPABASE) {
  console.log('[Services] Supabase-Modus aktiviert')
} else {
  console.log('[Services] In-Memory-Modus aktiviert')
}

// Conditional re-exports based on data source
// When USE_SUPABASE is true, import from ./supabase/
// When false, import from existing in-memory services

export const { ProviderService } = USE_SUPABASE
  ? require('./supabase/provider.service')
  : require('./provider.service')

export const { ActivityService } = USE_SUPABASE
  ? require('./supabase/activity.service')
  : require('./activity.service')

export const { BookingService } = USE_SUPABASE
  ? require('./supabase/booking.service')
  : require('./booking.service')

export const { ParentService } = USE_SUPABASE
  ? require('./supabase/parent.service')
  : require('./parent.service')

export const { LocationService } = USE_SUPABASE
  ? require('./supabase/location.service')
  : require('./location.service')

export const { InvoiceService } = USE_SUPABASE
  ? require('./supabase/invoice.service')
  : require('./invoice.service')

export const { PaymentService, SepaMandateService } = USE_SUPABASE
  ? require('./supabase/payment.service')
  : require('./payment.service')

export const { CalendarService } = USE_SUPABASE
  ? require('./supabase/calendar.service')
  : require('./calendar.service')

export const { CouponService } = USE_SUPABASE
  ? require('./supabase/coupon.service')
  : require('./coupon.service')

export const { WidgetService } = USE_SUPABASE
  ? require('./supabase/widget.service')
  : require('./widget.service')

export const { CourseBlockService } = USE_SUPABASE
  ? require('./supabase/course-block.service')
  : require('./course-block.service')

export const { SessionCreditService } = USE_SUPABASE
  ? require('./supabase/session-credit.service')
  : require('./session-credit.service')

export const { MakeupBookingService } = USE_SUPABASE
  ? require('./supabase/makeup-booking.service')
  : require('./makeup-booking.service')

export const { ReportingService } = USE_SUPABASE
  ? require('./supabase/reporting.service')
  : require('./reporting.service')

export const { SeasonService, HolidayService } = USE_SUPABASE
  ? require('./supabase/season.service')
  : require('./season.service')

export const { AuditService } = USE_SUPABASE
  ? require('./supabase/audit.service')
  : require('./audit.service')

export const { WaitlistService } = USE_SUPABASE
  ? require('./supabase/waitlist.service')
  : require('./waitlist.service')

export const { ExportService } = USE_SUPABASE
  ? require('./supabase/export.service')
  : require('./export.service')

export const { CrmService } = USE_SUPABASE
  ? require('./supabase/crm.service')
  : require('./crm.service')

export const { NotificationService } = USE_SUPABASE
  ? require('./supabase/notification.service')
  : require('./notification.service')

// These don't have Supabase versions (deferred)
export { AttendanceService } from './attendance.service'
export { TeamService } from './team.service'
export { ReviewService } from './review.service'
export { MessageService } from './message.service'
export { TrialService } from './trial.service'
export { DocumentService, ConsentService } from './document.service'
export { EInvoiceService } from './einvoice.service'
export { BuTVoucherService } from './but-voucher.service'
export { ContractService } from './contract.service'

// Marketing re-export (in-memory version uses different name)
export const MarketingService = USE_SUPABASE
  ? require('./supabase/marketing.service').MarketingService
  : require('./marketing.service').MarketingService

// Shared Helpers & Validierung (unchanged)
export { createNotification, createAuditEntry, calcDocumentStatus, getEntitiesFromIndex } from './helpers'
export { Validators, WAITLIST_SIGNAL } from './validators'
export { TrialConversionWorkflow, WaitlistConversionWorkflow, BackgroundJobs, CascadeDelete } from './workflows'
```

Note: This uses `require()` for conditional imports. In a future refactor this could use dynamic `import()` but `require()` works with tsx and is synchronous.

- [ ] **Step 3: Verify typecheck passes (it won't yet — Supabase service files don't exist)**

This is expected to fail until Phase 3 creates the service files. Just commit the infrastructure.

- [ ] **Step 4: Commit**

```bash
git add src/services/supabase/index.ts src/services/index.ts
git commit -m "feat: add USE_SUPABASE service switching infrastructure"
```

---

## Phase 3: Core Supabase Services

Each service follows the same pattern: export an object with the same method signatures as the in-memory version, using Supabase queries + mappers.

### Task 8: Provider Service (Supabase)

**Files:**
- Create: `src/services/supabase/provider.service.ts`

- [ ] **Step 1: Implement the service**

```typescript
// src/services/supabase/provider.service.ts
import { getServiceClient } from '../../lib/supabase'
import { providerFromDb, providerToDb } from './mappers'
import type { Provider, ProviderStatus, SubscriptionPlan } from '../../types'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' } as any)[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const db = () => getServiceClient()

export const ProviderService = {
  async list(filters?: { status?: ProviderStatus; category?: string }) {
    let query = db().from('providers').select('*')
    if (filters?.status) query = query.eq('status', filters.status)
    if (filters?.category) query = query.contains('categories', [filters.category])
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map(providerFromDb)
  },

  async getById(id: string): Promise<Provider | undefined> {
    const { data, error } = await db().from('providers').select('*').eq('id', id).single()
    if (error || !data) return undefined
    return providerFromDb(data)
  },

  async getBySlug(slug: string): Promise<Provider | undefined> {
    const { data, error } = await db().from('providers').select('*').eq('slug', slug).single()
    if (error || !data) return undefined
    return providerFromDb(data)
  },

  async create(input: { name: string; description: string; address: any; contact: any; categories: string[]; logo?: string; subscription?: SubscriptionPlan }): Promise<Provider> {
    let slug = slugify(input.name)
    // Check slug collision
    const { data: existing } = await db().from('providers').select('slug').eq('slug', slug).single()
    if (existing) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`
    }

    const row = {
      ...providerToDb(input),
      slug,
      status: 'onboarding',
      subscription: input.subscription || 'free',
    }

    const { data, error } = await db().from('providers').insert(row).select().single()
    if (error) throw error
    return providerFromDb(data)
  },

  async update(id: string, input: any): Promise<Provider | undefined> {
    const updateData = { ...providerToDb(input), updated_at: new Date().toISOString() }
    const { data, error } = await db().from('providers').update(updateData).eq('id', id).select().single()
    if (error || !data) return undefined
    return providerFromDb(data)
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await db().from('providers').delete().eq('id', id)
    return !error
  },

  async activate(id: string): Promise<Provider | undefined> {
    return this.update(id, { status: 'active' })
  },

  async changePlan(id: string, plan: SubscriptionPlan): Promise<Provider | undefined> {
    return this.update(id, { subscription: plan })
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/supabase/provider.service.ts
git commit -m "feat: add Supabase provider service"
```

---

### Task 9: Activity Service (Supabase)

**Files:**
- Create: `src/services/supabase/activity.service.ts`

- [ ] **Step 1: Implement**

Follows same pattern as provider. Key methods: `list(providerId, filters?)`, `getById(id)`, `create(input)`, `update(id, input)`, `delete(id)`, `publish(id)`, `archive(id)`, `duplicate(id)`. Uses `activities` table. Maps `ageRange` to `age_group_min`/`age_group_max`, stores `schedule`/`pricing`/`platformListing` as jsonb.

- [ ] **Step 2: Commit**

```bash
git add src/services/supabase/activity.service.ts
git commit -m "feat: add Supabase activity service"
```

---

### Task 10: Booking Service (Supabase)

**Files:**
- Create: `src/services/supabase/booking.service.ts`

- [ ] **Step 1: Implement**

Uses `provider_bookings` table (not `bookings`). Key methods: `list(providerId, filters?)`, `getById(id)`, `create(input)`, `markPaid(id)`, `cancel(id)`. Stores `child` as `child_info` jsonb. Includes validation (capacity check via count query, duplicate booking check).

- [ ] **Step 2: Commit**

```bash
git add src/services/supabase/booking.service.ts
git commit -m "feat: add Supabase booking service"
```

---

### Task 11: Parent Service (Supabase)

**Files:**
- Create: `src/services/supabase/parent.service.ts`

- [ ] **Step 1: Implement**

Uses `parents` table. Methods: `list(providerId)`, `getById(id)`, `create(input)`, `update(id, input)`, `delete(id)`. Note: parents table has no `provider_id` — the relationship is through bookings. For the provider dashboard, list parents who have bookings with this provider: `select distinct parent_id from provider_bookings where provider_id = ?`.

- [ ] **Step 2: Commit**

```bash
git add src/services/supabase/parent.service.ts
git commit -m "feat: add Supabase parent service"
```

---

### Task 12: Location Service (Supabase)

**Files:**
- Create: `src/services/supabase/location.service.ts`

- [ ] **Step 1: Implement**

Uses `locations` table. Simple CRUD scoped by `provider_id`. Maps flat address columns to nested `address` object.

- [ ] **Step 2: Commit**

```bash
git add src/services/supabase/location.service.ts
git commit -m "feat: add Supabase location service"
```

---

### Task 13: Invoice + Payment Services (Supabase)

**Files:**
- Create: `src/services/supabase/invoice.service.ts`
- Create: `src/services/supabase/payment.service.ts`

- [ ] **Step 1: Implement invoice service**

Uses `invoices` table. Methods: `list(providerId)`, `getById(id)`, `createFromBooking(bookingId)`, `send(id)`, `markPaid(id)`, `cancel(id)`. Line items stored as jsonb. Invoice number generation: query max existing number for provider, increment.

- [ ] **Step 2: Implement payment + SEPA service**

Uses `payments` and `sepa_mandates` tables. Standard CRUD scoped by `provider_id`.

- [ ] **Step 3: Commit**

```bash
git add src/services/supabase/invoice.service.ts src/services/supabase/payment.service.ts
git commit -m "feat: add Supabase invoice and payment services"
```

---

### Task 14: Calendar + Coupon + Widget Services (Supabase)

**Files:**
- Create: `src/services/supabase/calendar.service.ts`
- Create: `src/services/supabase/coupon.service.ts`
- Create: `src/services/supabase/widget.service.ts`

- [ ] **Step 1: Calendar service**

Uses `calendar_events` table. Methods: `list(providerId, dateRange?)`, `create(input)`, `update(id, input)`, `delete(id)`. Also generates events from activities' schedules.

- [ ] **Step 2: Coupon service**

Uses `coupons` and `coupon_redemptions` tables. Methods: `list(providerId)`, `create(input)`, `validate(code, activityId)`, `redeem(couponId, bookingId, parentId)`.

- [ ] **Step 3: Widget service**

Uses `widget_configs` table. Methods: `list(providerId)`, `getById(id)`, `create(input)`, `update(id, input)`, `delete(id)`, `generateEmbedCode(id)`.

- [ ] **Step 4: Commit**

```bash
git add src/services/supabase/calendar.service.ts src/services/supabase/coupon.service.ts src/services/supabase/widget.service.ts
git commit -m "feat: add Supabase calendar, coupon, and widget services"
```

---

### Task 15: Course Block System Services (Supabase)

**Files:**
- Create: `src/services/supabase/course-block.service.ts`
- Create: `src/services/supabase/session-credit.service.ts`
- Create: `src/services/supabase/makeup-booking.service.ts`

- [ ] **Step 1: Course block service**

Uses `course_blocks`, `block_sessions`, `block_enrollments` tables. Key methods: `create(input)` (also generates block_sessions), `list(providerId)`, `getById(id)`, `enroll(blockId, parentId, childInfo)`, `markSessionCompleted(sessionId)`, `cancelSession(sessionId, reason)`.

- [ ] **Step 2: Session credit service**

Uses `session_credits` table. Methods: `issue(enrollmentId, sessionId, reason)`, `list(parentId, activityType?)`, `markUsed(creditId, sessionId)`, `expireOverdue()`.

- [ ] **Step 3: Makeup booking service**

Uses `makeup_bookings` table. Methods: `create(creditId, targetSessionId)`, `list(providerId)`, `markAttended(id)`, `cancel(id)`.

- [ ] **Step 4: Commit**

```bash
git add src/services/supabase/course-block.service.ts src/services/supabase/session-credit.service.ts src/services/supabase/makeup-booking.service.ts
git commit -m "feat: add Supabase course block system services"
```

---

### Task 16: Reporting Service (Supabase)

**Files:**
- Create: `src/services/supabase/reporting.service.ts`

- [ ] **Step 1: Implement**

Uses aggregation queries across multiple tables. Methods: `getOverview(providerId)`, `getCourseStats(providerId)`, `getParticipantStats(providerId)`, `getRevenueStats(providerId, dateRange)`, `getTrialStats(providerId)`, `getTeamStats(providerId)`.

Key queries use `count`, `sum`, and group-by:

```typescript
// Example: revenue overview
const { data } = await db()
  .from('provider_bookings')
  .select('amount_paid, created_at')
  .eq('provider_id', providerId)
  .eq('payment_status', 'paid')
  .gte('created_at', startDate)
  .lte('created_at', endDate)
```

- [ ] **Step 2: Commit**

```bash
git add src/services/supabase/reporting.service.ts
git commit -m "feat: add Supabase reporting service"
```

---

### Task 17: Remaining Services (Marketing, Season, Audit, Waitlist, Export, CRM, Notification)

**Files:**
- Create: `src/services/supabase/marketing.service.ts`
- Create: `src/services/supabase/season.service.ts`
- Create: `src/services/supabase/audit.service.ts`
- Create: `src/services/supabase/waitlist.service.ts`
- Create: `src/services/supabase/export.service.ts`
- Create: `src/services/supabase/crm.service.ts`
- Create: `src/services/supabase/notification.service.ts`

- [ ] **Step 1: Marketing service** — Uses `automation_flows`, `message_templates`, `marketing_campaigns` tables. CRUD for each, scoped by provider_id.

- [ ] **Step 2: Season + Holiday service** — Uses `seasons` and `holidays` tables. Simple CRUD by provider_id.

- [ ] **Step 3: Audit service** — Uses `audit_log` table. Write-only: `log(providerId, action, entityType, entityId, changes)`. Read: `list(providerId, filters)`.

- [ ] **Step 4: Waitlist service** — Uses `waitlist_entries` table. Methods: `add(activityId, parentId, childInfo)`, `list(activityId)`, `offer(id)`, `accept(id)`, `decline(id)`.

- [ ] **Step 5: Export service** — Uses `export_requests` table. Methods: `create(providerId, type, format, filters)`, `getById(id)`, `list(providerId)`.

- [ ] **Step 6: CRM service** — Uses `contact_notes` table + `parents` table (tags field). Methods: `addNote(parentId, content)`, `getNotes(parentId)`, `setTags(parentId, tags)`.

- [ ] **Step 7: Notification service** — Uses `notifications` table. Methods: `create(recipientId, type, channel, title, body)`, `list(recipientId)`, `markRead(id)`.

- [ ] **Step 8: Commit**

```bash
git add src/services/supabase/marketing.service.ts src/services/supabase/season.service.ts src/services/supabase/audit.service.ts src/services/supabase/waitlist.service.ts src/services/supabase/export.service.ts src/services/supabase/crm.service.ts src/services/supabase/notification.service.ts
git commit -m "feat: add remaining Supabase services (marketing, season, audit, etc.)"
```

---

## Phase 4: Wire Auth into Routes + Server

### Task 18: Update Routes with Auth Middleware

**Files:**
- Modify: `src/api/routes.ts`

- [ ] **Step 1: Replace requireAuth placeholder**

At the top of `routes.ts`, replace the dummy `requireAuth` function:

```typescript
// Remove the old requireAuth function entirely
// Replace with import:
import { requireAuth, type AuthContext } from '../lib/auth-middleware'
```

- [ ] **Step 2: Update route handlers to use async auth**

Every route handler that needs auth changes from:

```typescript
router.get('/api/providers', (req, res) => {
  if (!requireAuth(req, res)) return
  const providers = ProviderService.list(...)
  res.json({ data: providers })
})
```

To:

```typescript
router.get('/api/providers', async (req, res) => {
  const auth = await requireAuth(req, res)
  if (!auth) return
  const providers = await ProviderService.list({ ...filters })
  res.json({ data: providers })
})
```

Key changes for each route:
1. Add `async` to handler
2. Replace `if (!requireAuth(req, res)) return` with `const auth = await requireAuth(req, res); if (!auth) return`
3. Add `await` before every service call (they're now async)
4. Use `auth.providerId` to scope queries instead of reading from request params

- [ ] **Step 3: Add public health endpoint (no auth)**

```typescript
router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: process.env.USE_SUPABASE === 'true' ? 'supabase' : 'memory' })
})
```

- [ ] **Step 4: Commit**

```bash
git add src/api/routes.ts
git commit -m "feat: wire JWT auth into all routes, async handlers"
```

---

### Task 19: Update Server Startup

**Files:**
- Modify: `src/api/server.ts`

- [ ] **Step 1: Skip persistence when using Supabase**

In `server.ts`, wrap the persistence loading/auto-save in a condition:

```typescript
const USE_SUPABASE = process.env.USE_SUPABASE === 'true'

if (!USE_SUPABASE) {
  // Existing persistence logic
  const loadResult = loadFromDisk()
  if (loadResult.entries === 0) {
    seedDemoData()
  }
  startAutoSave()
} else {
  console.log('[Server] Supabase-Modus – Persistence deaktiviert')
}
```

- [ ] **Step 2: Update startup banner**

```typescript
console.log(`│  Mode: ${USE_SUPABASE ? 'Supabase Cloud DB' : 'In-Memory + JSON'}  │`)
```

- [ ] **Step 3: Commit**

```bash
git add src/api/server.ts
git commit -m "feat: skip persistence in Supabase mode, update startup banner"
```

---

## Phase 5: Frontend Login + Auth

### Task 20: Add Login Screen to Dashboard

**Files:**
- Modify: `src/frontend/dashboard.html`

- [ ] **Step 1: Add Supabase JS client (CDN)**

In the `<head>` section of dashboard.html, add:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
```

- [ ] **Step 2: Add login screen HTML**

Before the main dashboard content, add a login screen div:

```html
<div id="login-screen" class="fixed inset-0 bg-[#1a0a00] flex items-center justify-center z-[9999]" style="display:none">
  <div class="bg-[#2d1810] rounded-2xl p-8 w-full max-w-md shadow-2xl border border-[#5a3828]">
    <div class="text-center mb-8">
      <div class="w-16 h-16 bg-gradient-to-br from-[#d4956a] to-[#b87a50] rounded-xl mx-auto mb-4 flex items-center justify-center text-white text-2xl font-bold">U</div>
      <h1 class="text-2xl font-bold text-[#f5e6d3]">Urban Kids Club</h1>
      <p class="text-[#c4a882] mt-1">Provider Dashboard</p>
    </div>
    <form id="login-form" class="space-y-4">
      <div>
        <label class="block text-sm text-[#c4a882] mb-1">E-Mail</label>
        <input id="login-email" type="email" required class="w-full px-4 py-3 bg-[#1a0a00] border border-[#5a3828] rounded-lg text-[#f5e6d3] placeholder-[#8a6a50] focus:border-[#d4956a] focus:outline-none" placeholder="name@anbieter.de">
      </div>
      <div>
        <label class="block text-sm text-[#c4a882] mb-1">Passwort</label>
        <input id="login-password" type="password" class="w-full px-4 py-3 bg-[#1a0a00] border border-[#5a3828] rounded-lg text-[#f5e6d3] placeholder-[#8a6a50] focus:border-[#d4956a] focus:outline-none" placeholder="Passwort eingeben">
      </div>
      <div id="login-error" class="text-red-400 text-sm hidden"></div>
      <button type="submit" class="w-full py-3 bg-gradient-to-r from-[#d4956a] to-[#b87a50] text-white rounded-lg font-semibold hover:opacity-90 transition">Anmelden</button>
      <button type="button" id="magic-link-btn" class="w-full py-3 border border-[#5a3828] text-[#c4a882] rounded-lg hover:bg-[#3d2820] transition">Magic Link per E-Mail senden</button>
    </form>
    <div id="magic-link-sent" class="hidden text-center mt-4">
      <p class="text-green-400">Magic Link gesendet! Bitte E-Mail prüfen.</p>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add auth JavaScript**

In the `<script>` section of dashboard.html, add the auth logic:

```javascript
// Supabase Auth
const SUPABASE_URL = 'https://yuilhiqnrjuuqoqggihm.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1aWxoaXFucmp1dXFvcWdnaWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNzUxMDAsImV4cCI6MjA5MDc1MTEwMH0.8dnGBOapmuTwEUy0VG-VnSgIAgRf10F4L1wi9gcE0iw'
const sbAuth = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let currentSession = null

async function checkAuth() {
  const { data: { session } } = await sbAuth.auth.getSession()
  if (session) {
    currentSession = session
    document.getElementById('login-screen').style.display = 'none'
    initDashboard()
  } else {
    document.getElementById('login-screen').style.display = 'flex'
  }
}

// Login form
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const email = document.getElementById('login-email').value
  const password = document.getElementById('login-password').value
  const errorEl = document.getElementById('login-error')
  errorEl.classList.add('hidden')

  const { data, error } = await sbAuth.auth.signInWithPassword({ email, password })
  if (error) {
    errorEl.textContent = error.message === 'Invalid login credentials'
      ? 'Ungültige E-Mail oder Passwort'
      : error.message
    errorEl.classList.remove('hidden')
    return
  }
  currentSession = data.session
  document.getElementById('login-screen').style.display = 'none'
  initDashboard()
})

// Magic Link
document.getElementById('magic-link-btn').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value
  if (!email) {
    document.getElementById('login-error').textContent = 'Bitte E-Mail eingeben'
    document.getElementById('login-error').classList.remove('hidden')
    return
  }
  const { error } = await sbAuth.auth.signInWithOtp({ email })
  if (error) {
    document.getElementById('login-error').textContent = error.message
    document.getElementById('login-error').classList.remove('hidden')
    return
  }
  document.getElementById('magic-link-sent').classList.remove('hidden')
})

// Logout
function logout() {
  sbAuth.auth.signOut()
  currentSession = null
  document.getElementById('login-screen').style.display = 'flex'
}

// Token refresh listener
sbAuth.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    currentSession = null
    document.getElementById('login-screen').style.display = 'flex'
  } else if (session) {
    currentSession = session
  }
})
```

- [ ] **Step 4: Update the api() function to include JWT**

Replace the existing `api()` helper:

```javascript
async function api(path, method = 'GET', body = undefined) {
  const opts = { method, headers: {} }
  
  // Add JWT if available
  if (currentSession?.access_token) {
    opts.headers['Authorization'] = 'Bearer ' + currentSession.access_token
  }
  
  if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  
  const res = await fetch(API + path, opts)
  
  // Handle 401 — token expired, show login
  if (res.status === 401) {
    logout()
    return { error: 'Sitzung abgelaufen, bitte erneut anmelden' }
  }
  
  return res.json()
}
```

- [ ] **Step 5: Remove provider dropdown from sidebar**

The provider selection dropdown is no longer needed — the provider is determined by auth. Find the dropdown element and hide it when `currentSession` is set, or remove it entirely. The provider data is loaded from `/api/providers` which now returns only the authenticated provider's data.

- [ ] **Step 6: Add logout button**

Add a logout button to the sidebar, below the navigation:

```html
<button onclick="logout()" class="w-full mt-4 px-4 py-2 text-sm text-[#c4a882] hover:text-[#f5e6d3] hover:bg-[#3d2820] rounded-lg transition flex items-center gap-2">
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
  Abmelden
</button>
```

- [ ] **Step 7: Update page load to check auth first**

Replace the existing init flow at the bottom of the script:

```javascript
// Old: loadProviders() called directly
// New: check auth first
checkAuth()

function initDashboard() {
  loadProviders()
  // ... rest of init
}
```

- [ ] **Step 8: Commit**

```bash
git add src/frontend/dashboard.html
git commit -m "feat: add login screen, JWT auth, logout to dashboard"
```

---

## Phase 6: Seed Data + Deploy

### Task 21: Create Supabase Seed Script

**Files:**
- Create: `src/db/seed-supabase.ts`

- [ ] **Step 1: Write seed script**

A script that creates demo providers with Supabase Auth accounts, activities, bookings, and parents. Run once to populate the database for demos.

```typescript
// src/db/seed-supabase.ts
// Run: SUPABASE_SERVICE_ROLE_KEY=... npx tsx src/db/seed-supabase.ts

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yuilhiqnrjuuqoqggihm.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function seed() {
  console.log('Seeding Supabase...')

  // 1. Create auth users for demo providers
  const demoProviders = [
    { email: 'demo@rhythmuskinder.de', password: 'Demo2026!', name: 'Tanzstudio Rhythmuskinder' },
    { email: 'demo@tonleiter.de', password: 'Demo2026!', name: 'Musikschule Tonleiter' },
  ]

  for (const provider of demoProviders) {
    // Create auth user
    const { data: authUser, error: authErr } = await db.auth.admin.createUser({
      email: provider.email,
      password: provider.password,
      email_confirm: true,
    })
    if (authErr) {
      console.log(`Auth user ${provider.email} already exists or error:`, authErr.message)
      continue
    }

    // Link to provider record
    const { error: updateErr } = await db
      .from('providers')
      .update({ login_email: provider.email })
      .eq('company_name', provider.name)

    if (updateErr) {
      console.log(`Failed to link ${provider.email}:`, updateErr.message)
    } else {
      console.log(`Created & linked: ${provider.email} -> ${provider.name}`)
    }
  }

  // 2. Insert demo activities, bookings, parents if tables are empty
  // (Only needed if the existing seed data in Supabase is insufficient)

  console.log('Seed complete!')
}

seed().catch(console.error)
```

- [ ] **Step 2: Commit**

```bash
git add src/db/seed-supabase.ts
git commit -m "feat: add Supabase seed script for demo accounts"
```

---

### Task 22: Deploy to Server

**Files:**
- Modify: `/etc/systemd/system/dashboard.service` (on server)
- Modify: `packages/provider-dashboard/setup-server.sh`

- [ ] **Step 1: Update setup-server.sh to include Supabase env vars**

Add these environment variables to the systemd service section in `setup-server.sh`:

```bash
Environment=USE_SUPABASE=true
Environment=SUPABASE_URL=https://yuilhiqnrjuuqoqggihm.supabase.co
Environment=SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Environment=SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

- [ ] **Step 2: Deploy via SCP + SSH**

Since the repo is private, copy files directly:

```bash
scp -r packages/provider-dashboard/src root@46.224.112.178:/opt/urban-kids-club/packages/provider-dashboard/src
ssh root@46.224.112.178 "cd /opt/urban-kids-club/packages/provider-dashboard && npm install && systemctl restart dashboard.service"
```

- [ ] **Step 3: Run seed script on server**

```bash
ssh root@46.224.112.178 "cd /opt/urban-kids-club/packages/provider-dashboard && SUPABASE_SERVICE_ROLE_KEY=... npx tsx src/db/seed-supabase.ts"
```

- [ ] **Step 4: Run migrations against Supabase**

Use Supabase MCP tools or SQL editor to run:
- `src/db/migrations/001-missing-tables.sql`
- `src/db/migrations/002-rls-policies.sql`
- `src/db/migrations/003-indexes.sql`

- [ ] **Step 5: Verify**

Open `https://app.socialy.club` in browser:
1. Login screen should appear
2. Login with `demo@rhythmuskinder.de` / `Demo2026!`
3. Dashboard should load with data from Supabase
4. Navigate through all pages, verify data loads
5. Create a test activity, verify it persists after page reload

- [ ] **Step 6: Commit setup changes**

```bash
git add packages/provider-dashboard/setup-server.sh
git commit -m "feat: add Supabase env vars to server setup"
```

---

## Verification Checklist

After all tasks complete, verify each success criterion from the spec:

- [ ] Provider login with email+password works at `app.socialy.club`
- [ ] Magic link login works
- [ ] Dashboard shows real KPIs from Supabase
- [ ] Kurse: Create, edit, delete persists
- [ ] Buchungen: Create, pay, cancel persists
- [ ] Kursblöcke: Full block/session/enrollment/credit flow
- [ ] Kunden: List, view details
- [ ] Rechnungen: Generate, send, mark paid
- [ ] Berichte: All 6 tabs show aggregated data
- [ ] Einbettung: Widget configs save
- [ ] Marketing: Flow toggles and templates save
- [ ] Einstellungen: Provider settings persist
- [ ] Multi-tenancy: No cross-provider data leakage
- [ ] `USE_SUPABASE=false` reverts to in-memory mode
