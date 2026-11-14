// Long-running server for local development or any always-on Node host.
// It has its own 30-second timer, so no external cron is needed here.
import { createApp } from './app.js'
import { createStoreFromEnv, loadVapidKeys } from './store.js'
import { configureVapid, startScheduler } from './scheduler.js'

const PORT = Number(process.env.PORT) || 8787

const store = await createStoreFromEnv(process.env)
const vapid = await loadVapidKeys(store, process.env)
configureVapid(vapid, process.env.VAPID_SUBJECT || undefined)

const app = createApp({ store, vapid })
startScheduler(store)
app.listen(PORT, () => {
  console.log(`WeatherBoard push server on http://localhost:${PORT}`)
  console.log(`  store: ${store.kind}`)
  console.log(`  allowed origins: ${process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173'}`)
  console.log(`  VAPID keys from: ${vapid.source}`)
})
