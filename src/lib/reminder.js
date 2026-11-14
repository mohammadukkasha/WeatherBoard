// Daily reminder logic shared by the page and the service worker.
// Settings live in IndexedDB because the service worker can't read localStorage.
//
// Two delivery modes:
//  - 'push'  : a small Node server (server/) sends a Web Push at the chosen
//              time. Fires with the tab and the app closed. Used whenever
//              VITE_PUSH_SERVER_URL is configured and the browser supports Push.
//  - 'local' : no server. Periodic Background Sync wakes the service worker
//              (Chromium, installed app) and a check runs while the app is
//              open. Timing is decided by the browser, so it is best-effort.
import { kvGet, kvSet, KV } from './kv.js'
import { getWeather } from '../services/weather.js'
import { cityKey, formatTemp, dateKeyAt } from './format.js'

export const SYNC_TAG = 'weatherboard-daily-reminder'
export const DEFAULT_REMINDER = { enabled: false, time: '07:30', city: null, lastSentDate: null, mode: 'local' }

/** A reminder more than this late (browser asleep, device off) is skipped for the day. */
const MAX_LATE_MS = 3 * 60 * 60 * 1000

const pad = (n) => String(n).padStart(2, '0')

export function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function dueToday(time, now = new Date()) {
  const [h, m] = time.split(':').map(Number)
  const due = new Date(now)
  due.setHours(h, m, 0, 0)
  return due
}

export function nextOccurrence(time, now = new Date()) {
  const due = dueToday(time, now)
  if (due <= now) due.setDate(due.getDate() + 1)
  return due
}

export async function loadReminder() {
  return { ...DEFAULT_REMINDER, ...((await kvGet(KV.reminder)) || {}) }
}

export function saveReminder(settings) {
  return kvSet(KV.reminder, settings)
}

function permissionGranted() {
  // Notification.permission is exposed in window and (most) worker scopes.
  return typeof Notification === 'undefined' || Notification.permission === 'granted'
}

/**
 * Local mode only: sends today's reminder if it is due and hasn't been sent yet.
 * Called from the service worker's periodicsync handler (tab closed), a
 * 1-minute check while the app is open, and a catch-up check on launch.
 */
export async function maybeSendReminder(registration, now = new Date()) {
  const r = await loadReminder()
  if (!r.enabled || !r.city || !r.time) return 'disabled'
  if (r.mode === 'push') return 'push-mode' // the server is the clock
  if (!permissionGranted()) return 'no-permission'
  const today = localDateKey(now)
  if (r.lastSentDate === today) return 'already-sent'
  const due = dueToday(r.time, now)
  if (now < due) return 'not-due'
  if (now - due > MAX_LATE_MS) return 'missed'
  // Mark first so two callers racing (tab + background sync) don't both send;
  // the shared notification tag also collapses any duplicate.
  await saveReminder({ ...r, lastSentDate: today })
  await showWeatherNotification(registration, r.city, { now })
  return 'sent'
}

/** Push mode: the server woke the service worker — always show something. */
export async function handlePushReminder(registration, payload = {}) {
  const r = await loadReminder()
  const city = payload.city || r.city
  if (!payload.test) await saveReminder({ ...r, lastSentDate: localDateKey() })
  if (!city) {
    return registration.showNotification('WeatherBoard', {
      body: 'Open WeatherBoard to see today’s forecast.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      tag: 'weatherboard-daily',
    })
  }
  return showWeatherNotification(registration, city, { test: Boolean(payload.test) })
}

export async function showWeatherNotification(registration, city, { now = new Date(), test = false } = {}) {
  const prefs = (await kvGet(KV.prefs)) || {}
  const units = prefs.units === 'imperial' ? 'imperial' : 'metric'

  let weather = null
  try {
    weather = await getWeather(city)
  } catch {
    const snap = await kvGet(KV.snapshot)
    if (snap && cityKey(snap.city) === cityKey(city)) weather = snap.weather
  }

  const morning = now.getHours() < 12
  const title = `${test ? 'Preview · ' : ''}${morning ? `Good morning — ${city.name} today` : `${city.name} today`}`
  let body = 'Open WeatherBoard to see today’s forecast.'
  if (weather?.current) {
    const today = weather.daily?.find((d) => d.date === dateKeyAt(Date.now(), weather.timezoneOffset))
    const parts = [`${formatTemp(weather.current.temp, units)} and ${weather.current.description.toLowerCase()} right now.`]
    if (today) {
      parts.push(`High ${formatTemp(today.max, units)}, low ${formatTemp(today.min, units)}.`)
      if (today.pop >= 30) parts.push(`${today.pop}% chance of rain — take an umbrella.`)
    }
    body = parts.join(' ')
  }

  await registration.showNotification(title, {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    tag: test ? 'weatherboard-test' : 'weatherboard-daily',
    renotify: true,
    data: { city },
  })
}
