// Input validation for the reminder API. Every error message says what is
// wrong and what a valid value looks like.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// Only deliver to real browser push services, so the server can't be used to
// send requests to arbitrary URLs (SSRF). Set PUSH_HOST_ALLOWLIST=off to disable.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge (Chromium), Samsung Internet, Opera
  /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox
  /\.notify\.windows\.com$/, // Edge on Windows (WNS)
  /(^|\.)push\.apple\.com$/, // Safari
]

export function isAllowedPushEndpoint(endpoint, env = process.env) {
  let url
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (env.PUSH_HOST_ALLOWLIST === 'off') return true
  return PUSH_HOSTS.some((re) => re.test(url.hostname))
}

export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max

export function validateSchedule(body) {
  const errors = []
  const sub = body?.subscription

  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 2048) {
    errors.push('subscription.endpoint is required')
  } else if (!isAllowedPushEndpoint(sub.endpoint)) {
    errors.push('subscription.endpoint must be an https URL from a browser push service')
  }
  if (!str(sub?.keys?.p256dh, 200) || !str(sub?.keys?.auth, 100)) {
    errors.push('subscription.keys.p256dh and subscription.keys.auth are required')
  }
  if (typeof body?.time !== 'string' || !TIME.test(body.time)) {
    errors.push('time must be 24-hour HH:MM, for example 07:30')
  }
  if (!isValidTimeZone(body?.timezone)) {
    errors.push('timezone must be an IANA time zone, for example Asia/Karachi')
  }
  const city = body?.city
  const lat = Number(city?.lat)
  const lon = Number(city?.lon)
  if (!str(city?.name, 100)) errors.push('city.name is required (max 100 characters)')
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push('city.lat must be a number between -90 and 90')
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) errors.push('city.lon must be a number between -180 and 180')

  if (errors.length) return { errors }
  return {
    errors,
    value: {
      subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
      time: body.time,
      timezone: body.timezone,
      city: {
        name: city.name.trim(),
        region: typeof city.region === 'string' ? city.region.slice(0, 100) : '',
        country: typeof city.country === 'string' ? city.country.slice(0, 100) : '',
        lat,
        lon,
      },
    },
  }
}
