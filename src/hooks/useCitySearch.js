// Debounced city autocomplete. Cached prefixes are shown instantly while the
// real request is in flight, stale requests are aborted, and every outcome
// (results / no results / error) is a distinct state the UI can render.
import { useCallback, useEffect, useState } from 'react'
import { CITY_PATTERN, normaliseQuery, peekCities, searchCities } from '../services/geo.js'

// The brief: results within 300 ms of the person pausing. Geocoding answers in
// ~150 ms (connection pre-warmed in index.html), so the debounce must stay short.
export const SEARCH_DEBOUNCE_MS = 120
const IDLE = { status: 'idle', results: [], source: null, error: null, query: '' }

export function useCitySearch(text, enabled) {
  const [state, setState] = useState(IDLE)
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    const trimmed = text.trim()
    const query = normaliseQuery(text)
    if (!enabled || query.length < 2 || !CITY_PATTERN.test(trimmed)) {
      setState(IDLE)
      return
    }

    const peek = peekCities(text)
    setState((s) => ({ ...s, status: 'loading', results: peek ?? (s.query === query ? s.results : []), error: null, query }))

    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchCities(text, { signal: controller.signal })
        .then(({ results, source }) => {
          if (controller.signal.aborted) return
          setState({ status: results.length ? 'success' : 'empty', results, source, error: null, query })
        })
        .catch((error) => {
          if (error.kind === 'aborted' || controller.signal.aborted) return
          setState({ status: 'error', results: [], source: null, error, query })
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text, enabled, retryToken])

  const retry = useCallback(() => setRetryToken((t) => t + 1), [])
  return { ...state, retry }
}
