# Provider Dashboard: In-Memory to Supabase Migration

## Goal

Transform the Urban Kids Club Provider Dashboard from a demo with in-memory data to a production-ready MVP backed by Supabase PostgreSQL. Providers get persistent, cloud-stored data accessible from anywhere. Auth via email+password and magic link. Multi-tenancy via RLS.

## Context

- **Current state:** 36 services, 100+ endpoints, 13-page frontend, all running on in-memory Maps with JSON file persistence
- **Target state:** Same feature set, backed by Supabase (PostgreSQL + Auth + RLS)
- **Existing Supabase project:** `yuilhiqnrjuuqoqggihm` with 40+ tables already created, RLS policies in place
- **Server:** Hetzner ARM64 at 46.224.112.178, accessible via SSH, running behind Caddy reverse proxy

## Scope

### Must Have (DB-backed, fully functional)

| Page | Services involved |
|------|-------------------|
| Dashboard (KPIs, Calendar) | provider, activity, booking, calendar |
| Kurse | activity, location |
| Buchungen | booking, coupon, waitlist |
| Kursblöcke | courseBlock, blockSession, blockEnrollment, sessionCredit, makeupBooking |
| Kunden (ohne Loyalty) | parent, crm (basic) |
| Rechnungen | invoice, eInvoice, payment |
| Berichte | reporting (aggregation queries) |
| Einbettung | widget |
| Marketing | automation flows, templates, campaigns (config storage, no execution) |
| Einstellungen | provider settings, seasons, holidays |

### Deferred (stay in-memory/static for now)

| Page | Reason |
|------|--------|
| Probestunden | Nice-to-have, not critical for MVP demo |
| Team | Can be added post-MVP |
| Dokumente | File upload needs Supabase Storage integration |

### Login

- Email + Password login via Supabase Auth
- Magic Link login via Supabase Auth
- No self-service signup (accounts created by admin/script)
- Provider-Dropdown in sidebar replaced by auth-based provider resolution

## Architecture

### Overview

```
Browser (dashboard.html)
    |
    | fetch('/api/...')
    | Authorization: Bearer <supabase-jwt>
    |
Node.js Server (server.ts + routes.ts)
    |
    | Supabase JS client (service_role for writes, anon+jwt for RLS reads)
    |
Supabase PostgreSQL (RLS enforces provider isolation)
```

### Key Architectural Decisions

1. **Backend stays as API proxy.** The frontend does NOT talk to Supabase directly. All requests go through the Node.js API which validates auth and calls Supabase. This keeps business logic server-side and avoids exposing Supabase credentials in the browser.

2. **Service-by-service migration.** Each service gets a `*.supabase.ts` companion file that implements the same interface but uses Supabase queries. A feature flag (`USE_SUPABASE=true`) switches all services at once. During migration, individual services can be toggled.

3. **Supabase service_role client for backend.** The server uses the service_role key (bypasses RLS) for complex operations and admin tasks. For simple reads, the anon client with the user's JWT is used (RLS enforced).

4. **Frontend auth flow.** The dashboard.html gets a login screen. After login, the Supabase JWT is stored in localStorage and sent with every API call. The server validates the JWT and extracts the provider_id.

## Auth Design

### Login Flow

1. User opens `app.socialy.club`
2. If no valid JWT in localStorage -> show login screen
3. User enters email + password (or clicks "Magic Link senden")
4. Frontend calls Supabase Auth directly (`supabase.auth.signInWithPassword` or `signInWithOtp`)
5. On success, JWT stored in localStorage
6. Frontend includes `Authorization: Bearer <jwt>` on all API calls
7. Server middleware validates JWT, extracts `user.email`, looks up `providers.login_email` to get `provider_id`
8. All subsequent queries scoped to that `provider_id`

### Account Creation (Admin)

```sql
-- 1. Create Supabase Auth user
SELECT supabase.auth.admin_create_user(email, password);

-- 2. Link to provider
UPDATE providers SET login_email = 'provider@example.com' WHERE id = '<provider-uuid>';
```

Or via a small admin script that does both steps.

### JWT Validation (Server Middleware)

```typescript
// Existing auth.ts middleware - activate it
async function authenticate(req): Promise<{providerId: string, email: string}> {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) throw new AuthError('No token')
  
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new AuthError('Invalid token')
  
  // Look up provider by login_email
  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('login_email', user.email)
    .single()
  
  if (!provider) throw new AuthError('No provider for this user')
  
  return { providerId: provider.id, email: user.email }
}
```

## Database Schema

### Existing Tables (40 tables already in Supabase)

The Supabase project already has all core tables. Key observations:

- **providers** (36 cols): Has `login_email`, `login_password_hash`, `slug`, `status`, `subscription`, tax/bank fields, images
- **activities** (25 cols): Has `schedule` (jsonb), `pricing` (jsonb), `platform_listing` (jsonb), `color`, `tags`
- **provider_bookings** (14 cols): Provider-side bookings with `parent_id`, `child_info` (jsonb), `payment_status`, `source`
- **bookings** (11 cols): User-facing bookings with `user_id`, `activity_slot_id` (different schema)
- **invoices** (14 cols): Has `line_items` (jsonb), `subtotal`, `tax`, `total`, `status`
- **parents** (7 cols): Basic `name`, `email`, `phone`, `children` (jsonb)
- **calendar_events** (14 cols): Full schema with `recurring`, `recurrence_rule`, `color`, `type`
- **widget_configs** (11 cols): All config fields present
- **coupons** (14 cols): Full coupon support
- **locations** (12 cols): Including `rooms` (jsonb), `lat`, `lng`

### RLS Policies Already In Place

Provider isolation pattern used consistently:
```sql
-- Most tables use this pattern:
provider_id IN (
  SELECT providers.id FROM providers 
  WHERE providers.login_email = (current_setting('request.jwt.claims')::jsonb ->> 'email')
)
```

### Missing Tables (need creation)

These tables exist in the in-memory store but NOT in Supabase:

| Table | Purpose |
|-------|---------|
| `course_blocks` | Multi-session course packages |
| `block_sessions` | Individual sessions within a block |
| `block_enrollments` | Child enrollment in a block |
| `session_attendance_records` | Per-session attendance tracking |
| `session_credits` | Credits earned from cancellations |
| `makeup_bookings` | Makeup session bookings using credits |
| `automation_flows` | Marketing automation configs |
| `message_templates` | Email/SMS templates |
| `marketing_campaigns` | Campaign tracking |
| `notification_preferences` | Per-user notification settings |

### Schema Mapping: In-Memory Types to Supabase

The in-memory store uses string IDs (`prov_abc123`), nested objects, and Date instances. Supabase uses UUIDs, flat columns with jsonb for complex fields, and timestamptz.

**Key transformations per service:**

| In-Memory Pattern | Supabase Pattern |
|---|---|
| `store.state.providers.get(id)` | `supabase.from('providers').select().eq('id', id).single()` |
| `store.state.activitiesByProvider.get(providerId)` | `supabase.from('activities').select().eq('provider_id', providerId)` |
| `new Date()` | `now()` (database default) |
| `ID` (custom string) | `uuid` (database generated) |
| Nested `address: {street, city, zip}` | Flat columns `address_street`, `address_city`, `address_zip` |
| Nested `contact: {email, phone}` | Flat columns `email`, `phone` |
| `pricing: PricingOption[]` | `pricing: jsonb` (array stored as-is) |
| `schedule: Schedule` | `schedule: jsonb` (union type with discriminator) |
| `children: ChildInfo[]` | `children: jsonb` or `child_info: jsonb` |

### Provider Table: In-Memory vs Supabase

| In-Memory Field | Supabase Column | Notes |
|---|---|---|
| `id` (string) | `id` (uuid) | ID format changes |
| `name` | `company_name` | Column renamed |
| `slug` | `slug` | Same |
| `description` | `description` | Same |
| `logo` | `logo_url` | Column renamed |
| `address.street` | `address_street` | Flattened |
| `address.city` | `address_city` | Flattened |
| `address.zip` | `address_zip` | Flattened |
| `address.country` | (missing, default DE) | Need to add or use default |
| `address.lat` | `latitude` | Column renamed |
| `address.lng` | `longitude` | Column renamed |
| `contact.email` | `email` | Flattened |
| `contact.phone` | `phone` | Flattened |
| `contact.website` | `website_url` | Column renamed |
| `categories` | `categories` (jsonb) | Same, stored as JSON array |
| `status` | `status` | Same values |
| `subscription` | `subscription` | Same values |
| `createdAt` | `created_at` | camelCase to snake_case |
| `updatedAt` | `updated_at` | camelCase to snake_case |
| (n/a) | `login_email` | New: links to Supabase Auth |
| (n/a) | `tax_id`, `vat_id` | New: tax info for invoicing |
| (n/a) | `bank_iban`, `bank_bic`, `bank_holder` | New: bank info for SEPA |

### Bookings: Two Tables

Supabase has TWO booking tables:
- `bookings` (11 cols) — user-facing, references `user_id` and `activity_slot_id`
- `provider_bookings` (14 cols) — provider-facing, references `parent_id` and `activity_id`

**Decision:** Use `provider_bookings` for the provider dashboard. It maps directly to the in-memory `Booking` type with `parentId`, `childInfo`, `paymentStatus`, `source`. The `bookings` table is for the future parent-facing app.

## Service Migration Strategy

### Pattern: Companion File

Each service gets a Supabase companion:

```
src/services/
  provider.service.ts          # existing (in-memory)
  provider.service.supabase.ts # new (Supabase queries)
  activity.service.ts          
  activity.service.supabase.ts 
  ...
```

The companion exports the same interface. A barrel file (`services/index.ts`) exports the active implementation based on `USE_SUPABASE` env var.

### Migration Order (by dependency)

1. **providers** — no dependencies, foundation for everything
2. **locations** — depends on providers
3. **activities** — depends on providers, locations
4. **parents** — depends on providers
5. **provider_bookings** — depends on activities, parents
6. **calendar_events** — depends on providers, activities
7. **invoices + payments** — depends on providers, parents, bookings
8. **coupons** — depends on providers
9. **widget_configs** — depends on providers
10. **course_blocks + sessions + enrollments + credits + makeup** — depends on activities, parents
11. **reporting** — read-only aggregation across all tables
12. **marketing** (automation_flows, templates, campaigns) — depends on providers
13. **settings** (seasons, holidays) — depends on providers
14. **audit_log** — depends on providers

### Service Implementation Pattern

```typescript
// provider.service.supabase.ts
import { getServiceClient } from '../lib/supabase'

const db = getServiceClient()

export const ProviderService = {
  async list(filters?: { status?: string }) {
    let query = db.from('providers').select('*')
    if (filters?.status) query = query.eq('status', filters.status)
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    return data.map(mapProviderFromDb)
  },

  async getById(id: string) {
    const { data, error } = await db
      .from('providers')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return undefined
    return mapProviderFromDb(data)
  },

  async create(input: CreateProviderInput) {
    const { data, error } = await db
      .from('providers')
      .insert(mapProviderToDb(input))
      .select()
      .single()
    if (error) throw error
    return mapProviderFromDb(data)
  },

  async update(id: string, input: UpdateProviderInput) {
    const { data, error } = await db
      .from('providers')
      .update({ ...mapProviderToDb(input), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return undefined
    return mapProviderFromDb(data)
  },

  async delete(id: string) {
    const { error } = await db.from('providers').delete().eq('id', id)
    return !error
  }
}

// Mapper: DB row (snake_case, flat) -> App object (camelCase, nested)
function mapProviderFromDb(row: any): Provider {
  return {
    id: row.id,
    name: row.company_name,
    slug: row.slug,
    description: row.description,
    logo: row.logo_url,
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
      phone: row.phone,
      website: row.website_url,
    },
    categories: row.categories || [],
    status: row.status,
    subscription: row.subscription,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}
```

## Frontend Changes

### Login Screen

New HTML section prepended to dashboard.html:

```html
<div id="login-screen" style="display:none">
  <h1>Urban Kids Club</h1>
  <h2>Provider Dashboard</h2>
  <form id="login-form">
    <input type="email" placeholder="Email" required>
    <input type="password" placeholder="Passwort">
    <button type="submit">Anmelden</button>
    <button type="button" id="magic-link-btn">Magic Link senden</button>
  </form>
</div>
```

### Auth Integration

```javascript
// At page load:
const token = localStorage.getItem('sb-access-token')
if (!token || isTokenExpired(token)) {
  showLoginScreen()
} else {
  loadDashboard()
}

// API calls include token:
async function api(path, method = 'GET', body) {
  const token = localStorage.getItem('sb-access-token')
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(API + path, opts)
  if (res.status === 401) { showLoginScreen(); return }
  return res.json()
}
```

### Provider Selection Removed

- The provider dropdown in the sidebar is removed
- Provider is determined by the authenticated user's `login_email`
- Dashboard header shows the logged-in provider's name

## Deployment

### Environment Variables (Server)

```bash
# Add to dashboard.service or .env
SUPABASE_URL=https://yuilhiqnrjuuqoqggihm.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
USE_SUPABASE=true
```

### Migration Script

A one-time script to:
1. Create missing tables (course_blocks, etc.)
2. Seed initial demo data into Supabase
3. Create test provider accounts in Supabase Auth

### Rollback

If Supabase migration causes issues:
- Set `USE_SUPABASE=false` to revert to in-memory mode
- JSON persistence continues to work as fallback
- No data loss — Supabase data stays, in-memory data stays

## Testing Strategy

1. **Per-service tests:** Each `.supabase.ts` service gets basic CRUD tests against a Supabase test project
2. **API integration tests:** Hit the server endpoints with a test JWT, verify responses match in-memory behavior
3. **Manual QA:** Open `app.socialy.club`, login, verify each of the 10 pages loads and CRUD works
4. **Regression:** Ensure `USE_SUPABASE=false` still works (in-memory mode preserved)

## Success Criteria

- [ ] Provider can login with email+password at `app.socialy.club`
- [ ] Provider can login with magic link
- [ ] Dashboard shows real KPIs from Supabase data
- [ ] Kurse: CRUD works, data persists across server restarts
- [ ] Buchungen: Create, pay, cancel — all persisted
- [ ] Kursblöcke: Full block/session/enrollment/credit flow works
- [ ] Kunden: List, view details, add notes
- [ ] Rechnungen: Generate from booking, send, mark paid
- [ ] Berichte: All 6 tabs show correct aggregated data
- [ ] Einbettung: Widget configs saved and embed codes generated
- [ ] Marketing: Automation flow toggles saved, templates editable
- [ ] Einstellungen: Company info, tax settings, seasons/holidays saved
- [ ] No provider can see another provider's data
- [ ] Server restart does not lose any data
- [ ] `USE_SUPABASE=false` reverts cleanly to in-memory mode
