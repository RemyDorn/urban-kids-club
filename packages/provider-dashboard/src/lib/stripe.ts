import Stripe from 'stripe'

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const STRIPE_CONNECT_CLIENT_ID = process.env.STRIPE_CONNECT_CLIENT_ID || ''

export const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null

export function getConnectAuthUrl(providerId: string, returnUrl: string): string {
  const state = Buffer.from(JSON.stringify({ providerId })).toString('base64')
  return `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${STRIPE_CONNECT_CLIENT_ID}&scope=read_write&state=${state}&redirect_uri=${encodeURIComponent(returnUrl)}`
}

export async function completeConnect(code: string): Promise<string> {
  if (!stripe) throw new Error('Stripe not configured')
  const response = await stripe.oauth.token({ grant_type: 'authorization_code', code })
  return response.stripe_user_id!
}

export async function createCheckoutSession(params: {
  stripeAccountId?: string
  amount: number
  currency: string
  courseName: string
  successUrl: string
  cancelUrl: string
  metadata: Record<string, string>
}): Promise<string> {
  if (!stripe) throw new Error('Stripe not configured')
  const sessionParams: any = {
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
  }
  // If provider has a connected account, use it; otherwise direct charge to platform
  const session = params.stripeAccountId
    ? await stripe.checkout.sessions.create(sessionParams, { stripeAccount: params.stripeAccountId })
    : await stripe.checkout.sessions.create(sessionParams)
  return session.url!
}
