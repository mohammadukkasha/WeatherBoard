// WeatherBoard reminder server: stores push subscriptions with each person's
// reminder time and time zone, and sends a Web Push when it's due — which is
// what lets the reminder arrive with the tab and the app closed.
import express from 'express'
import cors from 'cors'
import * as webpush from 'web-push'
import { createStore, loadVapidKeys } from './store.js'
import { validateSchedule } from './validate.js'
import { initialLastSent, runDueReminders, sendReminder, startScheduler } from './scheduler.js'

const PORT = Number(process.env.PORT) || 8787
const DATA_DIR = process.env.DATA_DIR || './data'
const MAX_SUBSCRIPTIONS = Number(process.env.MAX_SUBSCRIPTIONS) || 10_000
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean)

const store = await createStore(DATA_DIR)
const vapid = await loadVapidKeys(DATA_DIR, process.env)
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:weatherboard@example.com', vapid.publicKey, vapid.privateKey)

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)),
    methods: ['GET', 'PUT', 'POST', 'DELETE'],
  }),
)
app.use(express.json({ limit: '16kb' }))

app.get('/', (_req, res) => res.json({ service: 'weatherboard-push-server', ok: true }))
app.get('/api/health', (_req, res) => res.json({ ok: true, subscriptions: store.count(), time: new Date().toISOString() }))
app.get('/api/push/public-key', (_req, res) => res.json({ publicKey: vapid.publicKey }))

// Create or update this device's reminder (idempotent: keyed by the push endpoint).
app.put('/api/push/subscriptions', async (req, res) => {
  const { errors, value } = validateSchedule(req.body)
  if (errors.length) return res.status(400).json({ error: errors.join('; ') })

  const id = store.idFor(value.subscription.endpoint)
  const existing = store.get(id)
  if (!existing && store.count() >= MAX_SUBSCRIPTIONS) {
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
const lastTest = new Map()
app.post('/api/push/test', async (req, res) => {
  const endpoint = req.body?.endpoint
  if (typeof endpoint !== 'string') return res.status(400).json({ error: 'endpoint is required' })
  const id = store.idFor(endpoint)
  const record = store.get(id)
  if (!record) return res.status(404).json({ error: 'No reminder is registered for this device. Turn it off and on again.' })
  if (Date.now() - (lastTest.get(id) || 0) < 10_000) {
    return res.status(429).json({ error: 'Please wait a few seconds before sending another test.' })
  }
  lastTest.set(id, Date.now())
  const result = await sendReminder(store, record, { test: true })
  if (result.ok) return res.status(202).json({ ok: true })
  if (result.gone) return res.status(410).json({ error: 'This device’s push subscription has expired. Turn the reminder off and on again.' })
  res.status(502).json({ error: 'The browser’s push service rejected the message. Try again in a minute.' })
})

// Optional external trigger (e.g. cron-job.org every minute) for hosts that
// sleep when idle. Protected by CRON_SECRET; disabled when it isn't set.
app.post('/api/cron/tick', async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(404).json({ error: 'Not enabled' })
  if (req.get('authorization') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' })
  res.json({ ok: true, sent: await runDueReminders(store) })
})

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON' })
  console.error('[server]', err)
  res.status(500).json({ error: 'Internal server error' })
})

startScheduler(store)
app.listen(PORT, () => {
  console.log(`WeatherBoard push server on http://localhost:${PORT}`)
  console.log(`  allowed origins: ${ALLOWED_ORIGINS.join(', ')}`)
  console.log(`  VAPID keys from: ${vapid.source}`)
})
