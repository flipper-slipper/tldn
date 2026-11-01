import { db } from './db'
import { PaymentClient } from './payments'

export interface CartItem { productId: string; quantity: number; price: number }

const payments = new PaymentClient()

export class OrderService {
  async createOrder(cart: CartItem[], userId: string) {
    if (cart.length === 0) return { error: 'cart is empty' }
    const total = calcTotal(cart)
    const charge = await payments.charge(total)
    const r = await db.query('insert into orders (user_id, total, charge_id) values ($1, $2, $3) returning id', [userId, total, charge.id])
    return { id: r.rows[0].id, total }
  }

  async cancelOrder(id: string) {
    const r = await db.query('update orders set status = $1 where id = $2 returning charge_id', ['cancelled', id])
    await payments.refund(r.rows[0].charge_id)
    return { ok: true }
  }
}

function calcTotal(cart: CartItem[]) {
  return cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
}
