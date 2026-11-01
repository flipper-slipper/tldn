import { UserRepository } from './users'
import { sendEmail } from './lib/mail'

const users = new UserRepository()
const sessions = new Map<string, string>()

export class AuthController {
  async login(email: string, password: string) {
    const user = await users.findByEmail(email)
    if (!user || user.password_hash !== hash(password)) return { error: 'invalid credentials' }
    const token = crypto.randomUUID()
    sessions.set(token, user.id)
    return { token }
  }

  async logout(token: string) {
    sessions.delete(token)
    return { ok: true }
  }

  async resetPassword(email: string) {
    const user = await users.findByEmail(email)
    if (!user) return { ok: true } // never reveal whether an account exists
    const token = createResetToken(user.id)
    await sendEmail(user.email, 'Reset your password', `https://acme.shop/reset/${token}`)
    return { ok: true }
  }
}

function hash(s: string) {
  return Buffer.from(s).toString('base64')
}

function createResetToken(userId: string) {
  return `${userId}.${Date.now()}`
}
