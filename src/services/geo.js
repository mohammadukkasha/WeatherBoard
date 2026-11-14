// City autocomplete. GeoDB Cities (RapidAPI) is the primary source; its free
// tier allows ~1 request/second, so a fast typist can easily trigger a 429.
// Rather than surfacing that, we fall back to Open-Meteo's free geocoder for
// that keystroke and cool GeoDB down briefly.
import { fetchJSON } from './http.js'

const GEODB_KEY = (import.meta.env.VITE_GEODB_API_KEY || '').trim()
const GEODB_HOST = 'wft-geo-db.p.rapidapi.com'
const LIMIT = 6

let geodbPausedUntil = 0
const cache = new Map() // normalised query -> { results, source }

export const CITY_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.,-]*$/u

/** Text before a comma is the city ("Paris, France" → "paris"). */
export function normaliseQuery(text) {
  return text.split(',')[0].trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Instant results from what we already fetched: if "lah" is cached and the user
 * types "laho", filter the cached list while the real request is in flight.
 */
export function peekCities(text) {
  const q = normaliseQuery(text)
  if (q.length < 2) return null
  if (cache.has(q)) return cache.get(q).results
  for (let len = q.length - 1; len >= 2; len--) {
    const hit = cache.get(q.slice(0, len))
    if (hit) return hit.results.filter((c) => c.name.toLowerCase().startsWith(q))
  }
  return null
}

export async function searchCities(text, { signal } = {}) {
  const q = normaliseQuery(text)
  if (cache.has(q)) return cache.get(q)

  let result = null
  if (GEODB_KEY && Date.now() > geodbPausedUntil) {
    try {
      result = { results: await searchGeoDB(q, signal), source: 'geodb' }
    } catch (err) {
      if (err.kind === 'aborted' || err.kind === 'offline') throw err
      if (err.kind === 'rate-limit') geodbPausedUntil = Date.now() + 1200
      if (err.kind === 'auth') geodbPausedUntil = Infinity
      // otherwise fall through to Open-Meteo for this query
    }
  }
  if (!result) result = { results: await searchOpenMeteo(q, signal), source: 'open-meteo' }

  if (cache.size > 100) cache.delete(cache.keys().next().value)
  cache.set(q, result)
  return result
}

async function searchGeoDB(q, signal) {
  const url =
    `https://${GEODB_HOST}/v1/geo/cities?namePrefix=${encodeURIComponent(q)}` +
    `&limit=${LIMIT}&sort=-population&types=CITY&languageCode=en`
  const data = await fetchJSON(url, {
    signal,
    timeout: 5000,
    service: 'GeoDB Cities',
    headers: { 'X-RapidAPI-Key': GEODB_KEY, 'X-RapidAPI-Host': GEODB_HOST },
  })
  return dedupe(
    (data?.data ?? []).map((c) => ({
      id: `geodb:${c.id}`,
      name: c.name,
      region: c.region,
      country: c.country,
      countryCode: c.countryCode,
      lat: c.latitude,
      lon: c.longitude,
      population: c.population,
    })),
  )
}

async function searchOpenMeteo(q, signal) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${LIMIT}&language=en&format=json`
  const data = await fetchJSON(url, { signal, timeout: 5000, service: 'Open-Meteo Geocoding' })
  return dedupe(
    (data?.results ?? []).map((r) => ({
      id: `om:${r.id}`,
      name: r.name,
      region: r.admin1,
      country: r.country,
      countryCode: r.country_code,
      lat: r.latitude,
      lon: r.longitude,
      population: r.population,
    })),
  )
}

function dedupe(list) {
  const seen = new Set()
  return list.filter((c) => {
    const key = `${c.name}|${c.region}|${c.country}`.toLowerCase()
    if (seen.has(key) || c.lat == null || c.lon == null) return false
    seen.add(key)
    return true
  })
}
