// Weather data: OpenWeatherMap first (when a key is configured), Open-Meteo as
// the fallback for rate limits, bad keys, outages or a missing key. Both are
// normalised into the same shape so the UI never knows which one answered.
import { fetchJSON, ApiError } from './http.js'
import { fromOwmId, fromWmo, wmoDescription } from './conditions.js'
import { dateKeyAt, cityKey } from '../lib/format.js'

const OWM_KEY = (import.meta.env.VITE_OWM_API_KEY || '').trim()
let owmPausedUntil = 0

export const SOURCES = {
  openweathermap: { name: 'OpenWeatherMap', url: 'https://openweathermap.org' },
  'open-meteo': { name: 'Open-Meteo', url: 'https://open-meteo.com' },
}

// Fixed precision keeps request URLs identical between visits, which is what
// the service worker uses as its cache key for offline mode.
const coord = (n) => Number(n).toFixed(4)
const capitalise = (s = '') => s.charAt(0).toUpperCase() + s.slice(1)

const oldest = (...times) => {
  const known = times.filter((t) => t != null)
  return known.length ? Math.min(...known) : null
}

const ERROR_PRIORITY = ['offline', 'timeout', 'network', 'rate-limit', 'server', 'auth', 'not-found', 'bad-response']
function mostRelevant(errors) {
  return [...errors].sort((a, b) => ERROR_PRIORITY.indexOf(a.kind) - ERROR_PRIORITY.indexOf(b.kind))[0]
}

/**
 * @returns {Promise<{source, fetchedAt, timezoneOffset, current, hourly, daily}>}
 */
export async function getWeather(city, { signal } = {}) {
  const errors = []

  if (OWM_KEY && Date.now() > owmPausedUntil) {
    try {
      return await fetchOpenWeatherMap(city, signal)
    } catch (err) {
      if (err.kind === 'aborted') throw err
      if (err.kind === 'rate-limit') owmPausedUntil = Date.now() + 60_000
      if (err.kind === 'auth') owmPausedUntil = Infinity // invalid/inactive key: stop trying this session
      errors.push(err)
    }
  }

  try {
    const weather = await fetchOpenMeteo(city, signal)
    // Tell the UI (and the person) when the primary source failed and why.
    if (errors.length) weather.fallback = { from: 'openweathermap', reason: errors[0].kind }
    return weather
  } catch (err) {
    if (err.kind === 'aborted') throw err
    errors.push(err)
  }

  throw mostRelevant(errors)
}

async function fetchOpenWeatherMap(city, signal) {
  const service = 'OpenWeatherMap'
  const qs = `lat=${coord(city.lat)}&lon=${coord(city.lon)}&units=metric&appid=${OWM_KEY}`
  const metaCur = {}
  const metaFc = {}
  const [cur, fc] = await Promise.all([
    fetchJSON(`https://api.openweathermap.org/data/2.5/weather?${qs}`, { signal, service, meta: metaCur }),
    fetchJSON(`https://api.openweathermap.org/data/2.5/forecast?${qs}`, { signal, service, meta: metaFc }),
  ])
  const cachedAt = oldest(metaCur.cachedAt, metaFc.cachedAt)
  if (!cur?.main || !Array.isArray(fc?.list) || fc.list.length === 0) {
    throw new ApiError('bad-response', 'Unexpected OpenWeatherMap payload', { service })
  }

  const offset = cur.timezone ?? fc.city?.timezone ?? 0
  const w = cur.weather?.[0] ?? {}
  const current = {
    temp: cur.main.temp,
    feelsLike: cur.main.feels_like,
    humidity: cur.main.humidity,
    windSpeed: cur.wind?.speed ?? null,
    windDeg: cur.wind?.deg ?? null,
    condition: fromOwmId(w.id),
    description: capitalise(w.description),
    isDay: (w.icon ?? 'd').endsWith('d'),
    observedAt: cur.dt * 1000,
    sunrise: cur.sys?.sunrise ? cur.sys.sunrise * 1000 : null,
    sunset: cur.sys?.sunset ? cur.sys.sunset * 1000 : null,
  }

  const hourly = fc.list.slice(0, 8).map((e) => ({
    time: e.dt * 1000,
    temp: e.main.temp,
    condition: fromOwmId(e.weather?.[0]?.id),
    isDay: e.sys?.pod !== 'n',
    pop: Math.round((e.pop ?? 0) * 100),
  }))

  // The free forecast is in 3-hour steps; roll it up into days in the city's own time zone.
  const todayKey = dateKeyAt(Date.now(), offset)
  const groups = new Map()
  for (const e of fc.list) {
    const key = dateKeyAt(e.dt * 1000, offset)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(e)
  }
  const daily = [...groups.entries()].slice(0, 5).map(([date, entries]) => {
    let min = Math.min(...entries.map((e) => e.main.temp_min))
    let max = Math.max(...entries.map((e) => e.main.temp_max))
    if (date === todayKey) {
      // Later in the day only a few slots remain; include the current reading.
      min = Math.min(min, current.temp)
      max = Math.max(max, current.temp)
    }
    // Use the slot closest to early afternoon as the day's representative condition.
    const rep = entries.reduce(
      (best, e) => {
        const hour = new Date((e.dt + offset) * 1000).getUTCHours()
        const distance = Math.abs(hour - 13)
        return distance < best.distance ? { e, distance } : best
      },
      { e: entries[0], distance: Infinity },
    ).e
    return {
      date,
      min,
      max,
      condition: fromOwmId(rep.weather?.[0]?.id),
      description: capitalise(rep.weather?.[0]?.description),
      pop: Math.round(Math.max(...entries.map((e) => e.pop ?? 0)) * 100),
    }
  })

  return {
    source: 'openweathermap',
    fetchedAt: cachedAt ?? Date.now(),
    fromCache: cachedAt != null,
    timezoneOffset: offset,
    current,
    hourly,
    daily,
  }
}

async function fetchOpenMeteo(city, signal) {
  const service = 'Open-Meteo'
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${coord(city.lat)}&longitude=${coord(city.lon)}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m' +
    '&hourly=temperature_2m,weather_code,is_day,precipitation_probability' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
    '&timezone=auto&forecast_days=6&wind_speed_unit=ms&timeformat=unixtime'
  const meta = {}
  const d = await fetchJSON(url, { signal, service, meta })
  if (!d?.current || !d?.daily?.time || !d?.hourly?.time) {
    throw new ApiError('bad-response', 'Unexpected Open-Meteo payload', { service })
  }

  const offset = d.utc_offset_seconds ?? 0
  const c = d.current
  const current = {
    temp: c.temperature_2m,
    feelsLike: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    windSpeed: c.wind_speed_10m,
    windDeg: c.wind_direction_10m,
    condition: fromWmo(c.weather_code),
    description: wmoDescription(c.weather_code),
    isDay: c.is_day === 1,
    observedAt: c.time * 1000,
    sunrise: d.daily.sunrise?.[0] ? d.daily.sunrise[0] * 1000 : null,
    sunset: d.daily.sunset?.[0] ? d.daily.sunset[0] * 1000 : null,
  }

  // Match OpenWeatherMap's 3-hour cadence so the hourly strip looks the same for both sources.
  const h = d.hourly
  const nowSec = Date.now() / 1000
  // Start at the hour we're currently in, so the first slot really is "now".
  let start = h.time.findLastIndex((t) => t <= nowSec)
  if (start < 0) start = 0
  const hourly = []
  for (let i = start; i < h.time.length && hourly.length < 8; i += 3) {
    hourly.push({
      time: h.time[i] * 1000,
      temp: h.temperature_2m[i],
      condition: fromWmo(h.weather_code[i]),
      isDay: h.is_day[i] === 1,
      pop: h.precipitation_probability?.[i] ?? 0,
    })
  }

  const todayKey = dateKeyAt(Date.now(), offset)
  const daily = d.daily.time
    .map((t, i) => ({
      date: dateKeyAt(t * 1000, offset),
      min: d.daily.temperature_2m_min[i],
      max: d.daily.temperature_2m_max[i],
      condition: fromWmo(d.daily.weather_code[i]),
      description: wmoDescription(d.daily.weather_code[i]),
      pop: d.daily.precipitation_probability_max?.[i] ?? 0,
    }))
    .filter((day) => day.date >= todayKey)
    .slice(0, 5)

  return {
    source: 'open-meteo',
    fetchedAt: meta.cachedAt ?? Date.now(),
    fromCache: meta.cachedAt != null,
    timezoneOffset: offset,
    current,
    hourly,
    daily,
  }
}

/**
 * Current temperature for several cities in ONE request (Open-Meteo accepts
 * comma-separated coordinates) — used for the favourites panel.
 */
export async function getQuickTemps(cities, { signal } = {}) {
  if (!cities.length) return {}
  const lat = cities.map((c) => coord(c.lat)).join(',')
  const lon = cities.map((c) => coord(c.lon)).join(',')
  const d = await fetchJSON(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day`,
    { signal, service: 'Open-Meteo' },
  )
  const list = Array.isArray(d) ? d : [d]
  return Object.fromEntries(
    list.map((entry, i) => [
      cityKey(cities[i]),
      {
        temp: entry?.current?.temperature_2m,
        condition: fromWmo(entry?.current?.weather_code),
        isDay: entry?.current?.is_day === 1,
      },
    ]),
  )
}
