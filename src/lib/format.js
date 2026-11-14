// All weather values are stored in metric (°C, m/s) and converted at render time,
// so switching units never needs a refetch.

export function toUnit(celsius, units) {
  return units === 'imperial' ? (celsius * 9) / 5 + 32 : celsius
}

export function formatTemp(celsius, units, { withUnit = false } = {}) {
  if (celsius == null || Number.isNaN(celsius)) return '—'
  const value = Math.round(toUnit(celsius, units)) || 0 // avoid "-0°"
  return `${value}°${withUnit ? (units === 'imperial' ? 'F' : 'C') : ''}`
}

export function formatWind(metresPerSecond, units) {
  if (metresPerSecond == null) return '—'
  return units === 'imperial'
    ? `${Math.round(metresPerSecond * 2.23694)} mph`
    : `${Math.round(metresPerSecond * 3.6)} km/h`
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export function compass(deg) {
  if (deg == null) return ''
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

/** YYYY-MM-DD for a UTC timestamp shifted to a location's UTC offset. */
export function dateKeyAt(ms, offsetSeconds = 0) {
  return new Date(ms + offsetSeconds * 1000).toISOString().slice(0, 10)
}

/** Clock time at the weather location (not the viewer's time zone). */
export function formatClock(ms, offsetSeconds = 0) {
  if (ms == null) return '—'
  return new Date(ms + offsetSeconds * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

export function formatHour(ms, offsetSeconds = 0) {
  return new Date(ms + offsetSeconds * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    timeZone: 'UTC',
  })
}

export function dayLabel(dateKey, todayKey) {
  if (dateKey === todayKey) return 'Today'
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    timeZone: 'UTC',
  })
}

export function longDate(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null
export function timeAgo(ms, now = Date.now()) {
  if (!ms) return ''
  const minutes = Math.round((now - ms) / 60000)
  if (minutes < 1) return 'just now'
  if (!rtf) return `${minutes} min ago`
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 48) return rtf.format(-hours, 'hour')
  return rtf.format(-Math.round(hours / 24), 'day')
}

/** Stable identity for a city regardless of which API returned it. */
export function cityKey(city) {
  if (!city) return ''
  return `${Number(city.lat).toFixed(2)},${Number(city.lon).toFixed(2)}`
}

export function citySubtitle(city) {
  if (!city) return ''
  return [city.region, city.country].filter(Boolean).join(', ')
}
