// Every 30 seconds: find subscribers whose local time has reached their
// reminder time today and who haven't had today's reminder yet.
import * as webpush from 'web-push'

/** If the host was asleep, still send a reminder up to this many minutes late. */
const CATCH_UP_MINUTES = 60
const TICK_MS = 30_000

/** { date: 'YYYY-MM-DD', minutes: minutes since local midnight } in a time zone. */
export function localParts(timeZone, at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

export const toMinutes = (time) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** A reminder set for a time that has already passed today starts tomorrow. */
export function initialLastSent(record, now = new Date()) {
  const local = localParts(record.timezone, now)
  return local.minutes >= toMinutes(record.time) ? local.date : null
}

export async function sendReminder(store, record, { test = false } = {}) {
  const payload = JSON.stringify({ type: 'daily-reminder', test, city: record.city })
  try {
    await webpush.sendNotification(record.subscription, payload, {
      TTL: test ? 300 : 60 * 60, // a "morning" reminder delivered hours late is noise
      urgency: 'normal',
      topic: test ? 'wb-test' : 'wb-daily',
    })
    return { ok: true }
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      // The browser unsubscribed or the subscription expired.
      await store.remove(record.id)
      return { ok: false, gone: true }
    }
    console.error(`[push] ${record.id.slice(0, 8)}… failed: ${err.statusCode ?? ''} ${err.body || err.message}`)
    return { ok: false, error: err }
  }
}

export async function runDueReminders(store, now = new Date()) {
  let sent = 0
  for (const record of store.all()) {
    let local
    try {
      local = localParts(record.timezone, now)
    } catch {
      continue
    }
    const late = local.minutes - toMinutes(record.time)
    if (record.lastSentDate === local.date || late < 0 || late > CATCH_UP_MINUTES) continue
    // Mark first so an overlapping tick can't send twice.
    await store.patch(record.id, { lastSentDate: local.date })
    const result = await sendReminder(store, record)
    if (result.ok) sent++
  }
  if (sent) console.log(`[push] sent ${sent} reminder(s)`)
  return sent
}

export function startScheduler(store) {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await runDueReminders(store)
    } catch (err) {
      console.error('[scheduler] tick failed:', err)
    } finally {
      running = false
    }
  }
  tick()
  return setInterval(tick, TICK_MS)
}
