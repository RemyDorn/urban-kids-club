# Checkout & Buchungsflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable parents to book and pay for courses directly through the embed calendar widget, with Stripe and PayPal as payment providers.

**Architecture:** Stripe Connect (Standard accounts) for provider payments, PayPal REST API as alternative. Multi-step checkout in embed iframe, Stripe/PayPal hosted checkout pages for payment, webhooks for confirmation. Bookings created after successful payment or immediately for "vor Ort" payments.

**Tech Stack:** stripe npm package, PayPal REST API (no SDK — direct fetch), Supabase for data, existing Node.js/TypeScript backend.

---

## File Structure

### New Files
- `src/services/supabase/checkout.service.ts` — Stripe/PayPal session creation, booking creation after payment
- `src/lib/stripe.ts` — Stripe client initialization, Connect helpers

### Modified Files
- `src/api/routes.ts` — New checkout, webhook, payment-config endpoints
- `src/api/server.ts` — Embed checkout page, success page
- `src/frontend/dashboard.html` — Settings UI (Stripe/PayPal connect), course editor (payment mode), bookings display
- `src/services/supabase/mappers.ts` — Extended mappers for new fields
- `package.json` — Add stripe dependency

---

## Task 1: Install Stripe + DB Migrations

**Files:**
- Modify: `packages/provider-dashboard/package.json`
- DB: Supabase migrations

- [ ] **Step 1: Install stripe package**

```bash
cd packages/provider-dashboard && npm install stripe
```

- [ ] **Step 2: Add payment columns to providers table**

SQL migration:
```sql
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS paypal_client_id TEXT,
  ADD COLUMN IF NOT EXISTS paypal_secret TEXT,
  ADD COLUMN IF NOT EXISTS paypal_connected BOOLEAN DEFAULT false;
```

- [ ] **Step 3: Add payment mode columns to activities table**

```sql
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS payment_online BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_onsite BOOLEAN DEFAULT true;
```

- [ ] **Step 4: Add payment tracking columns to bookings table**

```sql
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'onsite',
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
  ADD COLUMN IF NOT EXISTS paypal_order_id TEXT;
```

- [ ] **Step 5: Create cancellation_policies table**

```sql
CREATE TABLE IF NOT EXISTS cancellation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES providers(id) UNIQUE,
  fee_type TEXT DEFAULT 'fixed',
  fee_value NUMERIC DEFAULT 0,
  deadline_hours INTEGER DEFAULT 48,
  custom_text TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add stripe dependency + DB migrations for checkout"
```

---

## Task 2: Stripe Connect OAuth + Lib

**Files:**
- Create: `src/lib/stripe.ts`
- Modify: `src/api/routes.ts`

- [ ] **Step 1: Create Stripe lib**

Create `src/lib/stripe.ts`:
```typescript
import Stripe from 'stripe'

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const STRIPE_CONNECT_CLIENT_ID = process.env.STRIPE_CONNECT_CLIENT_ID || ''

export const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2025-03-31.basil' })

export function getConnectAuthUrl(providerId: string, returnUrl: string): string {
  const state = Buffer.from(JSON.stringify({ providerId })).toString('base64')
  return `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${STRIPE_CONNECT_CLIENT_ID}&scope=read_write&state=${state}&redirect_uri=${encodeURIComponent(returnUrl)}`
}

export async function completeConnect(code: string): Promise<string> {
  const response = await stripe.oauth.token({ grant_type: 'authorization_code', code })
  return response.stripe_user_id!
}

export async function createCheckoutSession(params: {
  stripeAccountId: string
  amount: number
  currency: string
  courseName: string
  successUrl: string
  cancelUrl: string
  metadata: Record<string, string>
}): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: params.currency.toLowerCase(),
        product_data: { name: params.courseName },
        unit_amount: params.amount,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
  }, { stripeAccount: params.stripeAccountId })
  return session.url!
}
```

- [ ] **Step 2: Add Stripe Connect endpoints to routes.ts**

Add after the admin endpoints section in routes.ts (~line 1598):
```typescript
// --- Stripe Connect ---

router.post('/api/providers/:id/stripe-connect', async (req, res) => {
  const auth = await requireAuth(req, res)
  if (!auth) return
  if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
  const { getConnectAuthUrl } = await import('../lib/stripe')
  const returnUrl = `${req.raw.headers.origin || 'https://app.urbankids.club'}/api/stripe/callback`
  const url = getConnectAuthUrl(req.params.id, returnUrl)
  res.json({ url })
})

router.get('/api/stripe/callback', async (req, res) => {
  const code = req.query.code as string
  const state = req.query.state as string
  if (!code || !state) { res.error(400, 'Missing code or state'); return }
  try {
    const { providerId } = JSON.parse(Buffer.from(state, 'base64').toString())
    const { completeConnect } = await import('../lib/stripe')
    const accountId = await completeConnect(code)
    const db = getServiceClient()
    await db.from('providers').update({
      stripe_account_id: accountId,
      stripe_connected: true,
      updated_at: new Date().toISOString()
    }).eq('id', providerId)
    // Redirect back to dashboard settings
    res.raw.writeHead(302, { Location: '/?page=settings&tab=finance&stripe=connected' })
    res.raw.end()
  } catch (err: any) {
    res.error(500, 'Stripe-Verbindung fehlgeschlagen: ' + err.message)
  }
})

// --- PayPal Connect (manual credentials) ---

router.put('/api/providers/:id/paypal-config', async (req, res) => {
  const auth = await requireAuth(req, res)
  if (!auth) return
  if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
  const { clientId, secret } = req.body as any
  if (!clientId || !secret) return res.error(400, 'Client ID und Secret erforderlich')
  const db = getServiceClient()
  await db.from('providers').update({
    paypal_client_id: clientId,
    paypal_secret: secret,
    paypal_connected: true,
    updated_at: new Date().toISOString()
  }).eq('id', auth.providerId)
  res.json({ success: true })
})

// --- Payment Config ---

router.get('/api/providers/:id/payment-config', async (req, res) => {
  const auth = await requireAuth(req, res)
  if (!auth) return
  if (auth.providerId !== req.params.id) return res.error(403, 'Zugriff verweigert')
  const db = getServiceClient()
  const { data } = await db.from('providers').select('stripe_account_id, stripe_connected, paypal_client_id, paypal_connected').eq('id', auth.providerId).single()
  res.json({ data: { ...data, paypal_client_id: data?.paypal_client_id ? '***' + data.paypal_client_id.slice(-4) : null } })
})

// --- Cancellation Policy ---

router.get('/api/providers/:id/cancellation-policy', async (req, res) => {
  const auth = await requireAuth(req, res)
  if (!auth) return
  const db = getServiceClient()
  const { data } = await db.from('cancellation_policies').select('*').eq('provider_id', auth.providerId).single()
  res.json({ data: data || { fee_type: 'fixed', fee_value: 0, deadline_hours: 48, custom_text: '' } })
})

router.put('/api/providers/:id/cancellation-policy', async (req, res) => {
  const auth = await requireAuth(req, res)
  if (!auth) return
  const { feeType, feeValue, deadlineHours, customText } = req.body as any
  const db = getServiceClient()
  await db.from('cancellation_policies').upsert({
    provider_id: auth.providerId,
    fee_type: feeType || 'fixed',
    fee_value: parseFloat(feeValue) || 0,
    deadline_hours: parseInt(deadlineHours) || 48,
    custom_text: customText || '',
    updated_at: new Date().toISOString()
  }, { onConflict: 'provider_id' })
  res.json({ success: true })
})
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/stripe.ts src/api/routes.ts
git commit -m "feat: Stripe Connect OAuth + PayPal config + cancellation policy endpoints"
```

---

## Task 3: Provider Settings UI — Payment Providers + Cancellation

**Files:**
- Modify: `src/frontend/dashboard.html` (Einstellungen > Steuern & Finanzen tab, ~line 4370)

- [ ] **Step 1: Add payment provider section to finance settings tab**

Find the finance tab rendering in `renderFinanceTab` (around line 4370). After the existing bank account / SEPA section, add:

```html
<!-- Zahlungsanbieter -->
<div class="bg-white rounded-xl border border-brand-200 p-6 mt-6">
  <h3 class="text-lg font-bold mb-4">Zahlungsanbieter</h3>
  
  <!-- Stripe -->
  <div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg mb-3">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-lg">💳</div>
      <div>
        <div class="font-semibold">Stripe</div>
        <div class="text-xs text-gray-500">Kreditkarte, Apple Pay, Google Pay, SEPA</div>
      </div>
    </div>
    <div id="stripeStatus">
      <!-- filled by JS -->
    </div>
  </div>
  
  <!-- PayPal -->
  <div class="p-4 border border-gray-200 rounded-lg">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-lg">🅿️</div>
        <div>
          <div class="font-semibold">PayPal</div>
          <div class="text-xs text-gray-500">PayPal Checkout</div>
        </div>
      </div>
      <div id="paypalStatus"></div>
    </div>
    <div id="paypalForm" class="hidden mt-3 space-y-2">
      <input id="ppClientId" type="text" placeholder="PayPal Client ID" class="w-full border rounded-lg px-3 py-2 text-sm">
      <input id="ppSecret" type="password" placeholder="PayPal Secret" class="w-full border rounded-lg px-3 py-2 text-sm">
      <button onclick="savePayPalConfig()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">PayPal verbinden</button>
    </div>
  </div>
</div>

<!-- Stornierungsbedingungen -->
<div class="bg-white rounded-xl border border-brand-200 p-6 mt-6">
  <h3 class="text-lg font-bold mb-4">Stornierungsbedingungen</h3>
  <div class="grid grid-cols-2 gap-4">
    <div>
      <label class="block text-sm font-medium mb-1">Gebuehrentyp</label>
      <select id="cancelFeeType" class="w-full border rounded-lg px-3 py-2 text-sm">
        <option value="fixed">Fester Betrag</option>
        <option value="percentage">Prozentual</option>
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Wert</label>
      <div class="flex items-center gap-2">
        <input id="cancelFeeValue" type="number" step="0.01" class="w-full border rounded-lg px-3 py-2 text-sm">
        <span id="cancelFeeUnit" class="text-sm text-gray-500">EUR</span>
      </div>
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Stornierungsfrist</label>
      <div class="flex items-center gap-2">
        <input id="cancelDeadline" type="number" class="w-full border rounded-lg px-3 py-2 text-sm" value="48">
        <span class="text-sm text-gray-500 whitespace-nowrap">Stunden vorher</span>
      </div>
    </div>
  </div>
  <div class="mt-4">
    <label class="block text-sm font-medium mb-1">Stornierungstext (wird im Checkout angezeigt)</label>
    <textarea id="cancelText" rows="2" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="z.B. Bei Nichterscheinen ohne Stornierung wird eine Gebuehr von 30 EUR erhoben."></textarea>
  </div>
  <button onclick="saveCancellationPolicy()" class="mt-4 bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-semibold">Speichern</button>
</div>
```

- [ ] **Step 2: Add JS functions for payment config**

Add these functions to the `<script>` section:
```javascript
async function loadPaymentConfig() {
  const cfg = await api(`/providers/${currentProvider.id}/payment-config`)
  const d = cfg.data || {}
  // Stripe status
  document.getElementById('stripeStatus').innerHTML = d.stripe_connected
    ? '<span class="text-green-600 text-sm font-semibold">Verbunden</span>'
    : '<button onclick="connectStripe()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Verbinden</button>'
  // PayPal status
  document.getElementById('paypalStatus').innerHTML = d.paypal_connected
    ? '<span class="text-green-600 text-sm font-semibold">Verbunden</span>'
    : '<button onclick="document.getElementById(\'paypalForm\').classList.toggle(\'hidden\')" class="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg text-sm font-semibold">Einrichten</button>'
  // Load cancellation policy
  const pol = await api(`/providers/${currentProvider.id}/cancellation-policy`)
  const p = pol.data || {}
  document.getElementById('cancelFeeType').value = p.fee_type || 'fixed'
  document.getElementById('cancelFeeValue').value = p.fee_value || ''
  document.getElementById('cancelDeadline').value = p.deadline_hours || 48
  document.getElementById('cancelText').value = p.custom_text || ''
  updateFeeUnit()
}

async function connectStripe() {
  const r = await api(`/providers/${currentProvider.id}/stripe-connect`, 'POST')
  if (r.url) window.location.href = r.url
}

async function savePayPalConfig() {
  const clientId = document.getElementById('ppClientId').value.trim()
  const secret = document.getElementById('ppSecret').value.trim()
  if (!clientId || !secret) { alert('Bitte Client ID und Secret eingeben.'); return }
  await api(`/providers/${currentProvider.id}/paypal-config`, 'PUT', { clientId, secret })
  alert('PayPal verbunden!')
  loadPaymentConfig()
}

function updateFeeUnit() {
  const type = document.getElementById('cancelFeeType').value
  document.getElementById('cancelFeeUnit').textContent = type === 'fixed' ? 'EUR' : '%'
}

async function saveCancellationPolicy() {
  await api(`/providers/${currentProvider.id}/cancellation-policy`, 'PUT', {
    feeType: document.getElementById('cancelFeeType').value,
    feeValue: document.getElementById('cancelFeeValue').value,
    deadlineHours: document.getElementById('cancelDeadline').value,
    customText: document.getElementById('cancelText').value,
  })
  alert('Stornierungsbedingungen gespeichert!')
}
```

Call `loadPaymentConfig()` when the finance tab is shown.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/dashboard.html
git commit -m "feat: payment provider settings UI (Stripe Connect + PayPal + cancellation policy)"
```

---

## Task 4: Course Editor — Payment Mode Checkboxes

**Files:**
- Modify: `src/frontend/dashboard.html` (~line 1229, activity form)
- Modify: `src/frontend/dashboard.html` (~line 1584, saveActivity function)
- Modify: `src/services/supabase/mappers.ts` (~line 95, activity mapper)

- [ ] **Step 1: Add payment checkboxes to course editor**

In the activity form (after pricing section, before platform listing section), add:
```html
<div class="border-t pt-4 mt-4">
  <label class="block text-sm font-medium text-gray-900 mb-3">Zahlungsoptionen</label>
  <div class="space-y-2">
    <label class="flex items-center gap-2">
      <input type="checkbox" name="paymentOnline" ${a.paymentOnline ? 'checked' : ''} class="rounded border-gray-300">
      <span class="text-sm">Online bezahlen (Stripe/PayPal)</span>
    </label>
    <label class="flex items-center gap-2">
      <input type="checkbox" name="paymentOnsite" ${a.paymentOnsite !== false ? 'checked' : ''} class="rounded border-gray-300">
      <span class="text-sm">Vor Ort bezahlen</span>
    </label>
  </div>
  <p id="paymentWarning" class="text-xs text-red-500 mt-1 hidden">Mindestens eine Zahlungsoption muss aktiv sein.</p>
</div>
```

- [ ] **Step 2: Update saveActivity to include payment fields**

In the `saveActivity` function body object (~line 1584), add:
```javascript
paymentOnline: !!f.get('paymentOnline'),
paymentOnsite: !!f.get('paymentOnsite'),
```

Add validation before the API call:
```javascript
if (!body.paymentOnline && !body.paymentOnsite) {
  document.getElementById('paymentWarning').classList.remove('hidden')
  return
}
```

If paymentOnline is checked, verify that Stripe or PayPal is connected:
```javascript
if (body.paymentOnline) {
  const cfg = await api(`/providers/${currentProvider.id}/payment-config`)
  if (!cfg.data?.stripe_connected && !cfg.data?.paypal_connected) {
    alert('Bitte erst Stripe oder PayPal in den Einstellungen verbinden, um Online-Zahlung zu aktivieren.')
    return
  }
}
```

- [ ] **Step 3: Update activity mapper**

In `src/services/supabase/mappers.ts`, extend `activityFromDb` and `activityToDb`:
```typescript
// In activityFromDb, add to the return object:
paymentOnline: row.payment_online ?? false,
paymentOnsite: row.payment_onsite ?? true,

// In activityToDb, add to the return object:
payment_online: a.paymentOnline ?? false,
payment_onsite: a.paymentOnsite ?? true,
```

- [ ] **Step 4: Commit**

```bash
git add src/frontend/dashboard.html src/services/supabase/mappers.ts
git commit -m "feat: payment mode checkboxes in course editor (online/onsite)"
```

---

## Task 5: Public Checkout API Endpoints

**Files:**
- Create: `src/services/supabase/checkout.service.ts`
- Modify: `src/api/routes.ts`

- [ ] **Step 1: Create checkout service**

Create `src/services/supabase/checkout.service.ts`:
```typescript
import { getServiceClient } from '../../lib/supabase'

export class CheckoutService {
  static async createBooking(params: {
    providerId: string
    activityId: string
    blockId?: string
    childFirstName: string
    childLastName: string
    childBirthYear: number
    parentFirstName: string
    parentLastName: string
    parentEmail: string
    parentPhone: string
    paymentMethod: 'stripe' | 'paypal' | 'onsite'
    amount: number
    currency: string
    stripeSessionId?: string
    paypalOrderId?: string
  }) {
    const db = getServiceClient()

    // 1. Find or create parent
    let { data: parent } = await db.from('parents')
      .select('id').eq('email', params.parentEmail).eq('provider_id', params.providerId).single()

    if (!parent) {
      const { data: newParent } = await db.from('parents').insert({
        provider_id: params.providerId,
        first_name: params.parentFirstName,
        last_name: params.parentLastName,
        email: params.parentEmail,
        phone: params.parentPhone,
      }).select('id').single()
      parent = newParent
    }

    if (!parent) throw new Error('Parent konnte nicht erstellt werden')

    // 2. Create booking
    const { data: booking, error } = await db.from('bookings').insert({
      provider_id: params.providerId,
      activity_id: params.activityId,
      parent_id: parent.id,
      child_info: {
        firstName: params.childFirstName,
        lastName: params.childLastName,
        birthYear: params.childBirthYear,
      },
      status: params.paymentMethod === 'onsite' ? 'confirmed' : 'pending',
      payment_status: params.paymentMethod === 'onsite' ? 'unpaid' : 'pending',
      payment_method: params.paymentMethod,
      amount_paid: params.paymentMethod !== 'onsite' ? params.amount : 0,
      currency: params.currency,
      source: 'platform',
      stripe_session_id: params.stripeSessionId || null,
      paypal_order_id: params.paypalOrderId || null,
    }).select().single()

    if (error) throw new Error(error.message)
    return booking
  }

  static async confirmPayment(sessionId: string, method: 'stripe' | 'paypal') {
    const db = getServiceClient()
    const col = method === 'stripe' ? 'stripe_session_id' : 'paypal_order_id'
    const { data, error } = await db.from('bookings')
      .update({ status: 'confirmed', payment_status: 'paid', updated_at: new Date().toISOString() })
      .eq(col, sessionId)
      .select().single()
    if (error) throw new Error(error.message)
    return data
  }
}
```

- [ ] **Step 2: Add checkout endpoints to routes.ts**

Add public checkout endpoints (no auth — called from embed widget):
```typescript
import { CheckoutService } from '../services/supabase/checkout.service'

// --- Public Checkout (no auth — called from embed) ---

router.post('/api/checkout/create-session', async (req, res) => {
  const { slug, activityId, blockId, child, parent, paymentMethod } = req.body as any
  if (!slug || !activityId || !child?.firstName || !parent?.email || !paymentMethod) {
    return res.error(400, 'Pflichtfelder fehlen')
  }

  const db = getServiceClient()
  const provider = await ProviderService.getBySlug(slug)
  if (!provider) return res.error(404, 'Provider nicht gefunden')

  // Get activity for price + payment mode validation
  const { data: activity } = await db.from('activities').select('*').eq('id', activityId).single()
  if (!activity) return res.error(404, 'Kurs nicht gefunden')

  const price = activity.pricing?.[0]?.amount || 0

  if (paymentMethod === 'onsite') {
    // Direct booking, no payment
    const booking = await CheckoutService.createBooking({
      providerId: provider.id,
      activityId,
      blockId,
      childFirstName: child.firstName,
      childLastName: child.lastName,
      childBirthYear: child.birthYear,
      parentFirstName: parent.firstName,
      parentLastName: parent.lastName,
      parentEmail: parent.email,
      parentPhone: parent.phone,
      paymentMethod: 'onsite',
      amount: price,
      currency: 'EUR',
    })
    return res.json({ success: true, bookingId: booking.id, redirect: null })
  }

  if (paymentMethod === 'stripe') {
    if (!provider.stripe_connected || !provider.stripe_account_id) {
      return res.error(400, 'Stripe nicht verbunden')
    }
    const { createCheckoutSession } = await import('../lib/stripe')
    const origin = req.raw.headers.origin || 'https://app.urbankids.club'
    const url = await createCheckoutSession({
      stripeAccountId: provider.stripe_account_id,
      amount: price,
      currency: 'EUR',
      courseName: activity.title,
      successUrl: `${origin}/embed/${slug}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/embed/${slug}/calendar`,
      metadata: {
        provider_id: provider.id,
        activity_id: activityId,
        block_id: blockId || '',
        child_first: child.firstName,
        child_last: child.lastName,
        child_year: String(child.birthYear),
        parent_first: parent.firstName,
        parent_last: parent.lastName,
        parent_email: parent.email,
        parent_phone: parent.phone || '',
      },
    })
    return res.json({ success: true, redirect: url })
  }

  if (paymentMethod === 'paypal') {
    // PayPal: create order via REST API
    const { data: provData } = await db.from('providers')
      .select('paypal_client_id, paypal_secret').eq('id', provider.id).single()
    if (!provData?.paypal_client_id) return res.error(400, 'PayPal nicht verbunden')

    const origin = req.raw.headers.origin || 'https://app.urbankids.club'
    const auth = Buffer.from(`${provData.paypal_client_id}:${provData.paypal_secret}`).toString('base64')
    const ppRes = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'EUR', value: (price / 100).toFixed(2) } }],
        application_context: {
          return_url: `${origin}/embed/${slug}/booking-success?paypal_order_id={orderID}`,
          cancel_url: `${origin}/embed/${slug}/calendar`,
          brand_name: provider.company_name,
        },
      }),
    })
    const ppData = await ppRes.json()
    const approveUrl = ppData.links?.find((l: any) => l.rel === 'approve')?.href
    if (!approveUrl) return res.error(500, 'PayPal Order konnte nicht erstellt werden')
    return res.json({ success: true, redirect: approveUrl })
  }

  res.error(400, 'Ungueltige Zahlungsart')
})

// --- Stripe Webhook ---

router.post('/api/webhooks/stripe', async (req, res) => {
  // Stripe webhook handler — verify signature in production
  const event = req.body
  if (event?.type === 'checkout.session.completed') {
    const session = event.data.object
    const meta = session.metadata || {}
    try {
      await CheckoutService.createBooking({
        providerId: meta.provider_id,
        activityId: meta.activity_id,
        blockId: meta.block_id || undefined,
        childFirstName: meta.child_first,
        childLastName: meta.child_last,
        childBirthYear: parseInt(meta.child_year) || 2020,
        parentFirstName: meta.parent_first,
        parentLastName: meta.parent_last,
        parentEmail: meta.parent_email,
        parentPhone: meta.parent_phone || '',
        paymentMethod: 'stripe',
        amount: session.amount_total || 0,
        currency: session.currency || 'eur',
        stripeSessionId: session.id,
      })
    } catch (err: any) {
      console.error('Webhook booking creation failed:', err.message)
    }
  }
  res.json({ received: true })
})
```

- [ ] **Step 3: Commit**

```bash
git add src/services/supabase/checkout.service.ts src/api/routes.ts
git commit -m "feat: checkout API - create session, booking creation, Stripe webhook"
```

---

## Task 6: Embed Checkout Flow (Multi-Step Form)

**Files:**
- Modify: `src/api/server.ts` (generateEmbedHtml function)

- [ ] **Step 1: Replace booking inquiry modal with multi-step checkout**

Replace the `window._bookCourse` function in the embed calendar (server.ts) with a multi-step checkout flow:

1. Step 1: Child + Parent data form
2. Step 2: Payment method selection (if both online + onsite available)
3. Step 3: AGB + Stornierung checkboxes
4. Submit: POST to /api/checkout/create-session → redirect to Stripe/PayPal or show confirmation

The function needs to first fetch the activity details to know which payment modes are available and the cancellation policy.

This is the largest single change — the full implementation is in the `_bookCourse` function replacement that fetches activity data, shows the multi-step form, validates, and submits.

- [ ] **Step 2: Add booking-success embed page**

In `generateEmbedHtml`, add a handler for `type === 'booking-success'`:
```typescript
if (type === 'booking-success') {
  return `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff}
  .success{text-align:center;padding:40px;max-width:400px}
  .check{width:64px;height:64px;border-radius:50%;background:#059669;color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 20px}
  h2{color:#1f2937;font-size:20px;margin-bottom:8px}
  p{color:#64748b;font-size:14px;line-height:1.6}
</style>
</head><body>
<div class="success">
  <div class="check">✓</div>
  <h2>Buchung bestaetigt!</h2>
  <p>Vielen Dank fuer Ihre Buchung. Sie erhalten in Kuerze eine Bestaetigung per E-Mail.</p>
</div>
<!-- Conversion tracking pixel placeholder -->
<div id="conversion-pixels"></div>
</body></html>`
}
```

- [ ] **Step 3: Add server.ts route for booking-success**

In the embed route handler in server.ts, handle the `booking-success` type.

- [ ] **Step 4: Commit**

```bash
git add src/api/server.ts
git commit -m "feat: embed multi-step checkout form + booking success page"
```

---

## Task 7: Dashboard — Bookings Display with Payment Info

**Files:**
- Modify: `src/frontend/dashboard.html` (bookings table ~line 1630)
- Modify: `src/services/supabase/mappers.ts` (booking mapper)

- [ ] **Step 1: Update booking mapper**

In `mappers.ts`, add to `bookingFromDb`:
```typescript
paymentMethod: row.payment_method || 'onsite',
stripeSessionId: row.stripe_session_id || null,
paypalOrderId: row.paypal_order_id || null,
```

- [ ] **Step 2: Update bookings table in dashboard**

In the bookings render section (~line 1630), update the "ZAHLUNG" column to show payment method with icon:
```javascript
const methodIcons = {
  stripe: '💳 Stripe',
  paypal: '🅿️ PayPal',
  onsite: '🏠 Vor Ort',
}
// In the table row:
`<td class="px-6 py-4 text-sm">${methodIcons[b.paymentMethod] || b.paymentMethod}</td>`
```

Add filter for payment method in the bookings page header.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/dashboard.html src/services/supabase/mappers.ts
git commit -m "feat: bookings display with payment method icons and filter"
```

---

## Task 8: Deploy + Environment Variables

**Files:**
- Modify: `/etc/systemd/system/dashboard.service` on server

- [ ] **Step 1: Set Stripe environment variables on server**

```bash
ssh root@46.224.112.178 "cat >> /etc/systemd/system/dashboard.service << 'EOF'
Environment=STRIPE_SECRET_KEY=sk_live_...
Environment=STRIPE_CONNECT_CLIENT_ID=ca_...
Environment=STRIPE_WEBHOOK_SECRET=whsec_...
EOF
systemctl daemon-reload"
```

Note: Actual Stripe keys need to be provided by the user.

- [ ] **Step 2: Deploy all files**

```bash
# Copy all changed files to server
scp -r src/ root@46.224.112.178:/opt/urban-kids-club/packages/provider-dashboard/src/
ssh root@46.224.112.178 "cd /opt/urban-kids-club/packages/provider-dashboard && npm install && systemctl restart dashboard.service"
```

- [ ] **Step 3: Test the complete flow**

1. Go to Settings > Steuern & Finanzen, verify Stripe/PayPal section appears
2. Create a course with "Online bezahlen" checkbox
3. Open embed calendar, click a course, verify checkout form appears
4. Test "Vor Ort bezahlen" flow — should create booking immediately
5. Verify booking appears in dashboard with correct payment method

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete checkout & booking flow with Stripe/PayPal integration"
```
