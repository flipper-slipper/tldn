import express from 'express'
import { AuthController } from './auth'
import { OrderService } from './orders'

const app = express()
app.use(express.json())
const auth = new AuthController()
const orders = new OrderService()

app.post('/api/login', async (req, res) => res.json(await auth.login(req.body.email, req.body.password)))
app.post('/api/logout', async (req, res) => res.json(await auth.logout(req.headers.authorization ?? '')))
app.post('/api/password-reset', async (req, res) => res.json(await auth.resetPassword(req.body.email)))
app.post('/api/orders', async (req, res) => res.json(await orders.createOrder(req.body.cart, req.body.userId)))
app.delete('/api/orders/:id', async (req, res) => res.json(await orders.cancelOrder(req.params.id)))

app.listen(3000)
