// Current temperature for every favourite in a single Open-Meteo request.
// Purely supplementary: on failure the favourites list simply shows no temps.
import { useEffect, useState } from 'react'
import { getQuickTemps } from '../services/weather.js'
import { cityKey } from '../lib/format.js'

const REFRESH_MS = 15 * 60 * 1000

export function useQuickTemps(cities, online) {
  const [temps, setTemps] = useState({})
  const key = cities.map(cityKey).join('|')

  useEffect(() => {
    if (!cities.length || !online) return
    const controller = new AbortController()
    const load = () =>
      getQuickTemps(cities, { signal: controller.signal })
        .then((t) => {
          if (!controller.signal.aborted) setTemps(t)
        })
        .catch(() => {})
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      controller.abort()
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, online])

  return temps
}
