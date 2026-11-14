/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { clientsClaim } from 'workbox-core'
import { maybeSendReminder, handlePushReminder, SYNC_TAG } from './lib/reminder.js'

// 1. App shell: every built asset is precached, and navigations fall back to
//    index.html so the app opens with no connection.
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }))

// 2. Weather data: network first, cache as fallback, so the last-viewed city
//    works offline. Cached copies are stamped with the time they were fetched;
//    the page reads that header and labels the data "as of …" instead of
//    presenting it as live.
const CACHED_AT_HEADER = 'x-wb-cached-at'
const stampCachedCopy = {
  cacheWillUpdate: async ({ response }) => {
    if (!response || response.status !== 200) return null
    const headers = new Headers({
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
      [CACHED_AT_HEADER]: String(Date.now()),
      // The rebuilt response must still pass the page's CORS check, and the
      // page needs permission to read our custom header.
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': CACHED_AT_HEADER,
    })
    return new Response(await response.blob(), { status: 200, statusText: 'OK', headers })
  },
}

registerRoute(
  ({ url }) => url.hostname === 'api.openweathermap.org' || url.hostname === 'api.open-meteo.com',
  new NetworkFirst({
    cacheName: 'weather-api',
    networkTimeoutSeconds: 6,
    plugins: [stampCachedCopy, new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 7 * 24 * 60 * 60 })],
  }),
)

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

clientsClaim()

// 3a. Daily reminder from the push server (server/): fires with the tab and the
//     app closed. Browsers require every push to show a notification.
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }
  event.waitUntil(handlePushReminder(self.registration, payload))
})

// 3b. No push server: Periodic Background Sync wakes the worker (Chromium,
//     installed app) and we send the notification if it is due.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(maybeSendReminder(self.registration))
})

// Any other wake-up is also a chance to catch up on a missed reminder.
self.addEventListener('activate', (event) => {
  event.waitUntil(maybeSendReminder(self.registration).catch(() => {}))
})

// 4. Tapping the notification opens (or focuses) the app on that city.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const city = event.notification.data?.city
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((w) => 'focus' in w)
      if (existing) {
        if (city) existing.postMessage({ type: 'OPEN_CITY', city })
        return existing.focus()
      }
      const params = city
        ? '?' +
          new URLSearchParams({
            name: city.name,
            lat: String(city.lat),
            lon: String(city.lon),
            region: city.region || '',
            country: city.country || '',
          })
        : ''
      return self.clients.openWindow(`/${params}`)
    })(),
  )
})
