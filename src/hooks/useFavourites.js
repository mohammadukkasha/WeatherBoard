// Up to five favourite cities, persisted in localStorage. When storage is
// blocked (private mode, disabled cookies, full quota) the list still works for
// this tab and `persistent` tells the UI to explain that it won't be kept.
import { useCallback, useEffect, useState } from 'react'
import { isStorageAvailable, readJSON, writeJSON } from '../lib/storage.js'
import { cityKey } from '../lib/format.js'

const KEY = 'wb:favourites'
export const MAX_FAVOURITES = 5

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)

function sanitize(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value
    .filter((c) => c && typeof c.name === 'string' && isNum(c.lat) && isNum(c.lon))
    .filter((c) => {
      const key = cityKey(c)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_FAVOURITES)
    .map(({ id, name, region, country, countryCode, lat, lon }) => ({ id, name, region, country, countryCode, lat, lon }))
}

export function useFavourites() {
  const [favourites, setFavourites] = useState(() => sanitize(readJSON(KEY, [])))
  const [persistent, setPersistent] = useState(() => isStorageAvailable())

  useEffect(() => {
    setPersistent(writeJSON(KEY, favourites))
  }, [favourites])

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY) setFavourites(sanitize(readJSON(KEY, [])))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const has = useCallback((city) => favourites.some((c) => cityKey(c) === cityKey(city)), [favourites])

  /** @returns {'added'|'exists'|'full'} */
  const add = useCallback(
    (city) => {
      if (has(city)) return 'exists'
      if (favourites.length >= MAX_FAVOURITES) return 'full'
      setFavourites((list) => sanitize([...list, city]))
      return 'added'
    },
    [favourites, has],
  )

  const remove = useCallback((city) => {
    setFavourites((list) => list.filter((c) => cityKey(c) !== cityKey(city)))
  }, [])

  return { favourites, add, remove, has, persistent, isFull: favourites.length >= MAX_FAVOURITES }
}
