// ============================================================
// PayPal REST API Client — Order creation & capture
// ============================================================

import { getServiceClient } from './supabase'

const PAYPAL_API_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com'

/**
 * Get PayPal credentials for a specific provider (decrypted from DB).
 * Falls back to platform-level env vars if provider has none.
 */
async function getProviderPayPalCredentials(providerId: string): Promise<{ clientId: string; secret: string } | null> {
  const db = getServiceClient()
  const { data } = await db.from('providers')
    .select('paypal_client_id, paypal_secret, paypal_connected')
    .eq('id', providerId).single()

  if (!data?.paypal_connected || !data.paypal_client_id || !data.paypal_secret) {
    // Fallback to platform env
    const envClientId = process.env.PAYPAL_CLIENT_ID
    const envSecret = process.env.PAYPAL_SECRET
    if (envClientId && envSecret) return { clientId: envClientId, secret: envSecret }
    return null
  }

  // Decrypt provider secret
  let secret = data.paypal_secret
  if (secret.startsWith('enc:')) {
    try {
      const { createDecipheriv, scryptSync } = await import('node:crypto')
      const encKey = process.env.ENCRYPTION_KEY
      if (!encKey) throw new Error('ENCRYPTION_KEY env var is required for PayPal')
      const keyBuf = scryptSync(encKey, 'ukc-paypal-salt', 32)
      const parts = secret.split(':')
      const iv = Buffer.from(parts[1], 'hex')
      const encrypted = parts[2]
      const decipher = createDecipheriv('aes-256-cbc', keyBuf, iv)
      secret = decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8')
    } catch (err) {
      console.error('[PayPal] Failed to decrypt provider secret:', err)
      return null
    }
  }

  return { clientId: data.paypal_client_id, secret }
}

/** Get OAuth2 access token from PayPal */
async function getAccessToken(clientId: string, secret: string): Promise<string> {
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64')
  const resp = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`PayPal auth failed: ${resp.status} ${body}`)
  }
  const data = await resp.json() as { access_token: string }
  return data.access_token
}

/** Create a PayPal order for checkout */
export async function createPayPalOrder(params: {
  providerId: string
  amount: number // in cents
  currency: string
  courseName: string
  returnUrl: string
  cancelUrl: string
  metadata: Record<string, string>
}): Promise<{ orderId: string; approvalUrl: string }> {
  const creds = await getProviderPayPalCredentials(params.providerId)
  if (!creds) throw new Error('PayPal ist nicht konfiguriert')

  const token = await getAccessToken(creds.clientId, creds.secret)
  const amountStr = (params.amount / 100).toFixed(2)

  // PayPal custom_id has a 127-char limit. If metadata is too long,
  // store only an orderId reference and keep metadata server-side.
  let customId = JSON.stringify(params.metadata)
  if (customId.length > 127) {
    // Fallback: only store minimal reference that fits
    const minimalMeta: Record<string, string> = {}
    if (params.metadata.bookingId) minimalMeta.bookingId = params.metadata.bookingId
    if (params.metadata.providerId) minimalMeta.providerId = params.metadata.providerId
    customId = JSON.stringify(minimalMeta)
    if (customId.length > 127) {
      customId = customId.substring(0, 127)
    }
    console.warn('[PayPal] Metadata truncated for custom_id — original exceeded 127 chars')
  }

  const orderPayload = {
    intent: 'CAPTURE',
    purchase_units: [{
      description: params.courseName.substring(0, 127),
      amount: {
        currency_code: params.currency.toUpperCase(),
        value: amountStr,
      },
      custom_id: customId,
    }],
    application_context: {
      brand_name: 'Urban Kids Club',
      landing_page: 'NO_PREFERENCE',
      user_action: 'PAY_NOW',
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
    },
  }

  const resp = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderPayload),
  })

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`PayPal order creation failed: ${resp.status} ${body}`)
  }

  const order = await resp.json() as { id: string; links: Array<{ rel: string; href: string }> }
  const approvalLink = order.links.find((l: any) => l.rel === 'approve')
  if (!approvalLink) throw new Error('PayPal approval URL not found')

  return { orderId: order.id, approvalUrl: approvalLink.href }
}

/** Capture an approved PayPal order */
export async function capturePayPalOrder(providerId: string, orderId: string): Promise<{
  status: string
  metadata: Record<string, string>
  amount: number
  currency: string
}> {
  const creds = await getProviderPayPalCredentials(providerId)
  if (!creds) throw new Error('PayPal ist nicht konfiguriert')

  const token = await getAccessToken(creds.clientId, creds.secret)

  const resp = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`PayPal capture failed: ${resp.status} ${body}`)
  }

  const data = await resp.json() as any
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0]
  let metadata: Record<string, string> = {}
  const rawCustomId = data.purchase_units?.[0]?.custom_id || '{}'
  try {
    metadata = JSON.parse(rawCustomId)
  } catch (parseErr) {
    console.error('[PayPal] Failed to parse custom_id metadata:', rawCustomId, parseErr)
    // Return empty metadata rather than crashing — caller must handle missing fields
  }

  return {
    status: data.status,
    metadata,
    amount: Math.round(parseFloat(capture?.amount?.value || '0') * 100),
    currency: capture?.amount?.currency_code || 'EUR',
  }
}
