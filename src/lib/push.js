// Page-side helpers for daily reminders: feature detection, the Web Push
// subscription and the small Node reminder server in server/.
import { ApiError } from '../services/http.js'

// VITE_PUSH_SERVER_URL: a full URL for a separate server, "/" (or unset in a
// production build) for the API served from this same origin — the Vercel
// deployment ships it under /api — or "off" to disable server push.
const RAW_SERVER = (import.meta.env.VITE_PUSH_SERVER_URL ?? '').trim()
const SERVER =
  RAW_SERVER === 'off' ? null : RAW_SERVER ? RAW_SERVER.replace(/\/+$/, '') : import.meta.env.PROD ? '' : null
export const pushServerConfigured = SERVER !== null

export function getNotificationSupport() {
  if (typeof window === 'undefined') return { supported: false }
  const notifications = 'Notification' in window
  const serviceWorker = 'serviceWorker' in navigator
  const push = serviceWorker && 'PushManager' in window
  const periodicSync =
    serviceWorker && typeof ServiceWorkerRegistration !== 'undefined' && 'periodicSync' in ServiceWorkerRegistration.prototype
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
  return {
    supported: notifications && serviceWorker,
    notifications,
    serviceWorker,
    push,
    periodicSync,
    isIOS,
    standalone,
    /** How reminders will be delivered on this device. */
    mode: push && pushServerConfigured ? 'push' : 'local',
  }
}

/** navigator.serviceWorker.ready never rejects — give up after a while instead of hanging the UI. */
export async function getRegistration(timeout = 8000) {
  if (!('serviceWorker' in navigator)) throw new ApiError('unsupported', 'No service worker support')
  let timer
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new ApiError('sw-not-ready', 'Service worker not active')), timeout)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000) // free hosts can take a while to wake up
  let response
  try {
    response = await fetch(`${SERVER}${path}`, {
      method,
      signal: controller.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    if (navigator.onLine === false) throw new ApiError('offline', 'Offline', { service: 'Reminder server' })
    if (controller.signal.aborted) throw new ApiError('timeout', 'Reminder server timed out', { service: 'Reminder server' })
    throw new ApiError('network', 'Could not reach the reminder server', { service: 'Reminder server' })
  } finally {
    clearTimeout(timer)
  }
  let data = null
  try {
    data = await response.json()
  } catch {
    /* empty or non-JSON body */
  }
  if (!response.ok) {
    const kind = response.status === 400 ? 'invalid' : response.status >= 500 ? 'server' : 'bad-response'
    throw new ApiError(kind, data?.error || `Reminder server responded with ${response.status}`, {
      status: response.status,
      service: 'Reminder server',
    })
  }
  return data
}

function base64UrlToBytes(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function sameKey(subscription, keyBytes) {
  const current = subscription.options?.applicationServerKey
  if (!current) return false
  const a = new Uint8Array(current)
  return a.length === keyBytes.length && a.every((byte, i) => byte === keyBytes[i])
}

const publicCity = (c) => ({ name: c.name, region: c.region || '', country: c.country || '', lat: c.lat, lon: c.lon })

/** Creates (or reuses) the push subscription and stores the schedule on the server. */
export async function subscribeToPush(registration, { time, city }) {
  const { publicKey } = await api('/api/push/public-key')
  const key = base64UrlToBytes(publicKey)

  let subscription = await registration.pushManager.getSubscription()
  if (subscription && !sameKey(subscription, key)) {
    // Server keys changed (e.g. redeploy with new VAPID keys): start over.
    await subscription.unsubscribe().catch(() => {})
    subscription = null
  }
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    } catch {
      throw new ApiError('push-subscribe', 'The browser refused to create a push subscription')
    }
  }

  await api('/api/push/subscriptions', {
    method: 'PUT',
    body: {
      subscription: subscription.toJSON(),
      time,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      city: publicCity(city),
    },
  })
  return subscription
}

export async function unsubscribeFromPush(registration) {
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  // Remove it from the server first; if that fails the server prunes it on the next send (410 Gone).
  await api('/api/push/subscriptions', { method: 'DELETE', body: { endpoint: subscription.endpoint } }).catch(() => {})
  await subscription.unsubscribe().catch(() => {})
}

export async function sendTestPush(registration) {
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) throw new ApiError('not-subscribed', 'No push subscription on this device')
  await api('/api/push/test', { method: 'POST', body: { endpoint: subscription.endpoint } })
}

export function describeReminderError(err) {
  switch (err?.kind) {
    case 'offline':
      return "You're offline, so we couldn't save your reminder with the reminder server. Reconnect and try again."
    case 'timeout':
    case 'network':
      return "We couldn't reach the reminder server. If it was asleep it may be starting up — wait 30 seconds and try again."
    case 'server':
      return 'The reminder server had a problem saving your reminder. Try again in a minute.'
    case 'invalid':
      return `The reminder server rejected these settings: ${err.message}`
    case 'push-subscribe':
      return "Your browser wouldn't create a push subscription. Private windows and some privacy settings block push — try a normal window."
    case 'not-subscribed':
      return 'This device has no active reminder subscription. Turn the reminder off and on again.'
    case 'sw-not-ready':
      return "WeatherBoard's background worker isn't running yet. Reload the page and try again."
    case 'unsupported':
      return "This browser can't run background tasks, so reminders aren't available here."
    default:
      return "We couldn't update your reminder. Reload the page and try again."
  }
}
