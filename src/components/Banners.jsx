import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Wifi, WifiOff, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** "Offline mode" banner, plus a short "back online" confirmation. */
export function ConnectionBanner({ online, cityName, savedAt }) {
  const [showBack, setShowBack] = useState(false)
  const wasOffline = useRef(!online)

  useEffect(() => {
    if (!online) {
      wasOffline.current = true
      setShowBack(false)
      return
    }
    if (wasOffline.current) {
      wasOffline.current = false
      setShowBack(true)
      const id = setTimeout(() => setShowBack(false), 4000)
      return () => clearTimeout(id)
    }
  }, [online])

  if (!online) {
    const when = savedAt
      ? new Date(savedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : null
    return (
      <div role="status" className="border-b border-warn-line bg-warn-soft text-warn-ink">
        <div className="mx-auto flex max-w-6xl items-start gap-2.5 px-4 py-2.5 text-sm sm:items-center sm:px-6">
          <WifiOff className="mt-0.5 size-4 shrink-0 sm:mt-0" aria-hidden="true" />
          <p>
            <span className="font-semibold">Offline mode.</span>{' '}
            {cityName && when
              ? `Showing ${cityName} as of ${when}. Search and refresh will work again when you reconnect.`
              : 'Search and live weather will work again when you reconnect.'}
          </p>
        </div>
      </div>
    )
  }

  if (showBack) {
    return (
      <div role="status" className="border-b border-ok/25 bg-ok-soft text-ok">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-2.5 text-sm font-medium sm:px-6">
          <Wifi className="size-4 shrink-0" aria-hidden="true" />
          Back online — refreshing the weather.
        </div>
      </div>
    )
  }
  return null
}

/** Registers the service worker and offers a reload when a new version is ready. */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version every hour for long-lived tabs.
      if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000)
    },
  })

  useEffect(() => {
    if (!offlineReady) return
    const id = setTimeout(() => setOfflineReady(false), 5000)
    return () => clearTimeout(id)
  }, [offlineReady, setOfflineReady])

  if (!needRefresh && !offlineReady) return null
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm sm:inset-x-auto sm:right-6 sm:bottom-6">
      <div role="status" className="rise-in flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 pl-4 shadow-xl shadow-black/10">
        <p className="min-w-0 flex-1 text-sm text-ink">
          {needRefresh ? 'A new version of WeatherBoard is ready.' : 'WeatherBoard is ready to work offline.'}
        </p>
        {needRefresh && (
          <button
            type="button"
            onClick={() => updateServiceWorker(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Reload
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setNeedRefresh(false)
            setOfflineReady(false)
          }}
          aria-label="Dismiss"
          className="grid size-11 shrink-0 place-items-center rounded-xl text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
