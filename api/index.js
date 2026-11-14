// Vercel serverless entry: every /api/* request is rewritten here (vercel.json)
// and handled by the same Express app the local server uses. State lives in
// Upstash Redis; reminders are sent when a scheduler calls /api/cron/tick.
import { createApp } from '../server/app.js'
import { createStoreFromEnv, loadVapidKeys } from '../server/store.js'
import { configureVapid } from '../server/scheduler.js'

let appPromise

function getApp() {
  appPromise ??= (async () => {
    const store = await createStoreFromEnv(process.env)
    const vapid = await loadVapidKeys(store, process.env)
    configureVapid(vapid, process.env.VAPID_SUBJECT || undefined)
    return createApp({ store, vapid })
  })().catch((err) => {
    appPromise = undefined // retry on the next request (e.g. after Redis is connected)
    throw err
  })
  return appPromise
}

export default async function handler(req, res) {
  let app
  try {
    app = await getApp()
  } catch (err) {
    console.error('[api] startup failed:', err.message)
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify({ error: 'The reminder service is not set up yet. Please try again later.', detail: err.message }))
    return
  }
  return app(req, res)
}
