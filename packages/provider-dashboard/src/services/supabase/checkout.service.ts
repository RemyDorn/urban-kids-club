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
      status: 'confirmed',
      payment_status: params.paymentMethod === 'onsite' ? 'unpaid' : 'paid',
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
