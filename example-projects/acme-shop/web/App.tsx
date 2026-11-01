import { useState } from 'react'
import { Cart } from './Cart'

export function App() {
  const [token, setToken] = useState<string | null>(null)
  if (!token) return <LoginForm onLogin={setToken} />
  return <Cart token={token} />
}

function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  async function submit() {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
    const body = await r.json()
    if (body.token) onLogin(body.token)
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
      <button>Sign in</button>
    </form>
  )
}
