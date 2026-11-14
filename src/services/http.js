// fetch() wrapper that turns every failure into a typed ApiError, so the UI can
// tell the user *what* failed instead of "Something went wrong".

export class ApiError extends Error {
  /**
   * @param {'offline'|'network'|'timeout'|'rate-limit'|'auth'|'not-found'|'server'|'bad-response'|'aborted'} kind
   */
  constructor(kind, message, { status, service } = {}) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.service = service
  }
}

function kindForStatus(status) {
  if (status === 429) return 'rate-limit'
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'not-found'
  if (status >= 500) return 'server'
  return 'bad-response'
}

/** Header the service worker adds to weather responses it serves from its cache. */
export const CACHED_AT_HEADER = 'x-wb-cached-at'

/**
 * @param {object} [options]
 * @param {object} [options.meta] Filled with `{ cachedAt }` when the service worker
 *   answered from its offline cache, so the UI never presents old data as fresh.
 */
export async function fetchJSON(url, { signal, timeout = 8000, headers, service = 'API', meta } = {}) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort, { once: true })

  try {
    let response
    try {
      response = await fetch(url, { signal: controller.signal, headers })
    } catch {
      if (signal?.aborted) throw new ApiError('aborted', 'Request cancelled', { service })
      if (timedOut) throw new ApiError('timeout', `${service} did not respond in time`, { service })
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new ApiError('offline', 'Device is offline', { service })
      }
      throw new ApiError('network', `Could not reach ${service}`, { service })
    }

    if (!response.ok) {
      throw new ApiError(kindForStatus(response.status), `${service} responded with ${response.status}`, {
        status: response.status,
        service,
      })
    }

    if (meta) {
      const cachedAt = Number(response.headers.get(CACHED_AT_HEADER))
      meta.cachedAt = Number.isFinite(cachedAt) && cachedAt > 0 ? cachedAt : null
    }

    try {
      return await response.json()
    } catch {
      throw new ApiError('bad-response', `${service} returned data we could not read`, { service })
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}
