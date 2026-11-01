import { db } from './db'

export interface User { id: string; email: string; password_hash: string }

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const r = await db.query('select * from users where email = $1', [email])
    return r.rows[0] ?? null
  }

  async save(user: User) {
    await db.query('insert into users (id, email, password_hash) values ($1, $2, $3)', [user.id, user.email, user.password_hash])
  }
}
