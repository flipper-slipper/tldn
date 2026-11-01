import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_KEY ?? '')

export class PaymentClient {
  async charge(amount: number) {
    return stripe.paymentIntents.create({ amount: Math.round(amount * 100), currency: 'usd', confirm: true })
  }

  async refund(chargeId: string) {
    return stripe.refunds.create({ payment_intent: chargeId })
  }
}
