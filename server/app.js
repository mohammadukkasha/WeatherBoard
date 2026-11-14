// WeatherBoard reminder API: stores push subscriptions with each person's
// reminder time and time zone, and sends a Web Push when it's due — which is
// what lets the reminder arrive with the tab and the app closed.
// Shared by the long-running local server (server/index.js) and the Vercel
// function (api/index.js).
import express from 'express'
import cors from 'cors'
import { validateSchedule } from './validate.js'
import { initialLastSent, runDueReminders, sendReminder } from './scheduler.js'

export function createApp({ store, vapid, env = process.env }) {
  const MAX_SUBSCRIPTIONS = Number(env.MAX_SUBSCRIPTIONS) || 10_000
  const allowedOrigins = (env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  // Same-origin calls (the Vercel deployment) need no CORS; this only matters
  // when the front end and the API live on different hosts.
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)),
      methods: ['GET', 'PUT', 'POST', 'DELETE'],
    }),
  )
  app.use(express.json({ limit: '16kb' }))
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  app.get('/', (_req, res) => res.json({ service: 'weatherboard-push-server', ok: true }))
  app.get('/api/health', async (_req, res) =>
    res.json({ ok: true, store: store.kind.split(' ')[0], subscriptions: await store.count(), time: new Date().toISOString() }),
  )
  app.get('/api/push/public-key', (_req, res) => res.json({ publicKey: vapid.publicKey }))

  // Create or update this device's reminder (idempotent: keyed by the push endpoint).
  app.put('/api/push/subscriptions', async (req, res) => {
    const { errors, value } = validateSchedule(req.body)
    if (errors.length) return res.status(400).json({ error: errors.join('; ') })

    const id = store.idFor(value.subscription.endpoint)
    const existing = await store.get(id)
    if (!existing && (await store.count()) >= MAX_SUBSCRIPTIONS) {
      return res.status(503).json({ error: 'The reminder server is full right now. Please try again later.' })
    }
    const scheduleChanged = !existing || existing.time !== value.time || existing.timezone !== value.timezone
    const record = {
      ...existing,
      ...value,
      id,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    record.lastSentDate = scheduleChanged ? initialLastSent(record) : existing.lastSentDate
    await store.upsert(record)
    res.status(existing ? 200 : 201).json({ ok: true, id })
  })

  app.delete('/api/push/subscriptions', async (req, res) => {
    const endpoint = req.body?.endpoint
    if (typeof endpoint !== 'string') return res.status(400).json({ error: 'endpoint is required' })
    await store.remove(store.idFor(endpoint))
    res.status(204).end()
  })

  // "Send a test" button. Lightly rate-limited per device.
  app.post('/api/push/test', async (req, res) => {
    const endpoint = req.body?.endpoint
    if (typeof endpoint !== 'string') return res.status(400).json({ error: 'endpoint is required' })
    const id = store.idFor(endpoint)
    const record = await store.get(id)
    if (!record) return res.status(404).json({ error: 'No reminder is registered for this device. Turn it off and on again.' })
    if (!(await store.claim(`test:${id}`, 10))) {
      return res.status(429).json({ error: 'Please wait a few seconds before sending another test.' })
    }
    const result = await sendReminder(store, record, { test: true })
    if (result.ok) return res.status(202).json({ ok: true })
    if (result.gone) return res.status(410).json({ error: 'This device’s push subscription has expired. Turn the reminder off and on again.' })
    res.status(502).json({ error: 'The browser’s push service rejected the message. Try again in a minute.' })
  })

  // Sends any reminders that are due. Serverless hosts have no background
  // timer, so a scheduler calls this every minute: Vercel Cron (GET) or an
  // external service such as cron-job.org (GET or POST). Needs CRON_SECRET.
  const tick = async (req, res) => {
    const secret = env.CRON_SECRET
    if (!secret) return res.status(404).json({ error: 'Not enabled: set CRON_SECRET on the server' })
    if (req.get('authorization') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' })
    res.json({ ok: true, sent: await runDueReminders(store) })
  }
  app.get('/api/cron/tick', tick)
  app.post('/api/cron/tick', tick)

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON' })
    console.error('[server]', err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
