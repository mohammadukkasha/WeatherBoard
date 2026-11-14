// Loads weather for the selected city. Successful (live) results are saved as
// the offline snapshot; if a later load fails because the connection is gone,
// the snapshot for that same city is shown and clearly marked as saved data.
import { useCallback, useEffect, useState } from 'react'
import { getWeather } from '../services/weather.js'
import { kvGet, kvSet, KV } from '../lib/kv.js'
import { cityKey } from '../lib/format.js'

const CONNECTION_ERRORS = ['offline', 'network', 'timeout']
const IDLE = { status: 'idle', data: null, error: null, key: '' }

export function useWeather(city) {
  const [state, setState] = useState(IDLE)
  const [reloadToken, setReloadToken] = useState(0)
  const key = cityKey(city)

  useEffect(() => {
    if (!city) {
      setState(IDLE)
      return
    }
    const controller = new AbortController()
    // Keep showing the current data while refreshing the same city.
    setState((s) => ({ status: 'loading', data: s.key === key ? s.data : null, error: null, key }))

    getWeather(city, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        setState({ status: 'success', data, error: null, key })
        if (!data.fromCache) kvSet(KV.snapshot, { city, weather: data })
      })
      .catch(async (error) => {
        if (error.kind === 'aborted' || controller.signal.aborted) return
        const snapshot = CONNECTION_ERRORS.includes(error.kind) ? await kvGet(KV.snapshot) : null
        if (controller.signal.aborted) return
        if (snapshot && cityKey(snapshot.city) === key) {
          setState({ status: 'success', data: { ...snapshot.weather, fromCache: true }, error, key })
        } else {
          setState({ status: 'error', data: null, error, key })
        }
      })

    return () => controller.abort()
    // `city` is identified by its key; a new object for the same place must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadToken])

  const refresh = useCallback(() => setReloadToken((t) => t + 1), [])
  // Right after switching cities (before the effect runs) the state still
  // belongs to the previous city — never pair its numbers with the new name.
  const current = state.key === key ? state : { ...IDLE, status: city ? 'loading' : 'idle', key }
  return { ...current, refresh }
}
