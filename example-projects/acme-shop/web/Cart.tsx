import { useState } from 'react'

interface Item { productId: string; name: string; price: number; quantity: number }

export function Cart({ token }: { token: string }) {
  const [items, setItems] = useState<Item[]>([])
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0)

  async function checkout() {
    const r = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: token },
      body: JSON.stringify({ cart: items }),
    })
    if (r.ok) setItems([])
  }

  return (
    <div>
      {items.map((i) => <div key={i.productId}>{i.name} × {i.quantity}</div>)}
      <div>Total: ${total.toFixed(2)}</div>
      <button disabled={items.length === 0} onClick={checkout}>Check out</button>
    </div>
  )
}
