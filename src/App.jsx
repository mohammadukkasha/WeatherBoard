import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header.jsx'
import CitySearch from './components/CitySearch.jsx'
import CurrentWeather from './components/CurrentWeather.jsx'
import HourlyForecast from './components/HourlyForecast.jsx'
import DailyForecast from './components/DailyForecast.jsx'
import { FavouriteChips, FavouritesPanel } from './components/Favourites.jsx'
import ReminderCard from './components/ReminderCard.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import { ConnectionBanner, UpdateToast } from './components/Banners.jsx'
import { EmptyState, WeatherError, WeatherSkeleton } from './components/States.jsx'
import { usePrefs } from './context/prefs.jsx'
import { useOnlineStatus } from './hooks/useOnlineStatus.js'
import { useWeather } from './hooks/useWeather.js'
import { useFavourites } from './hooks/useFavourites.js'
import { useQuickTemps } from './hooks/useQuickTemps.js'
import { readJSON, writeJSON } from './lib/storage.js'
import { kvGet, KV } from './lib/kv.js'
import { cityKey, formatTemp } from './lib/format.js'

const LAST_CITY_KEY = 'wb:last-city'
const STALE_AFTER_MS = 10 * 60 * 1000

function validCity(c) {
  return c && typeof c.name === 'string' && Number.isFinite(c.lat) && Number.isFinite(c.lon) ? c : null
}

/** Notification clicks open the app with the city in the URL. */
function cityFromUrl() {
  const p = new URLSearchParams(window.location.search)
  const lat = Number(p.get('lat'))
  const lon = Number(p.get('lon'))
  const name = p.get('name')
  if (!name || !p.has('lat') || !p.has('lon') || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return validCity({ id: `url:${lat},${lon}`, name: name.slice(0, 100), region: p.get('region') || '', country: p.get('country') || '', lat, lon })
}

export default function App() {
  const { units } = usePrefs()
  const online = useOnlineStatus()
  const [city, setCity] = useState(() => cityFromUrl() ?? validCity(readJSON(LAST_CITY_KEY, null)))
  const weather = useWeather(city)
  const favourites = useFavourites()
  const temps = useQuickTemps(favourites.favourites, online)
  const [toRemove, setToRemove] = useState(null)
  const [savedElsewhere, setSavedElsewhere] = useState(null)
  const activeKey = cityKey(city)

  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  useEffect(() => {
    if (city) writeJSON(LAST_CITY_KEY, city)
  }, [city])

  // A notification was clicked while the app was already open.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e) => {
      if (e.data?.type === 'OPEN_CITY' && validCity(e.data.city)) setCity(e.data.city)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  // Refresh automatically when the connection comes back…
  const { refresh } = weather
  const wasOnline = useRef(online)
  useEffect(() => {
    if (online && !wasOnline.current && city) refresh()
    wasOnline.current = online
  }, [online, city, refresh])

  // …and when returning to a tab whose data is more than 10 minutes old.
  const fetchedAt = weather.data?.fetchedAt
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && fetchedAt && Date.now() - fetchedAt > STALE_AFTER_MS) {
        refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchedAt, refresh])

  // If this city failed, offer the city we do have saved data for.
  useEffect(() => {
    if (weather.status !== 'error') return
    kvGet(KV.snapshot).then((s) => setSavedElsewhere(s?.city && cityKey(s.city) !== activeKey ? s.city : null))
  }, [weather.status, activeKey])

  useEffect(() => {
    document.title =
      city && weather.data ? `${formatTemp(weather.data.current.temp, units)} ${city.name} · WeatherBoard` : 'WeatherBoard'
  }, [city, weather.data, units])

  const selectCity = useCallback((next) => {
    setCity(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const reminderCities = useMemo(() => {
    const seen = new Set()
    return [city, ...favourites.favourites].filter((c) => {
      if (!c || seen.has(cityKey(c))) return false
      seen.add(cityKey(c))
      return true
    })
  }, [city, favourites.favourites])

  let content
  if (!city) {
    content = <EmptyState onPick={selectCity} online={online} />
  } else if (weather.status === 'error') {
    content = (
      <WeatherError
        error={weather.error}
        cityName={city.name}
        online={online}
        onRetry={refresh}
        fallbackCity={savedElsewhere}
        onOpenFallback={() => selectCity(savedElsewhere)}
      />
    )
  } else if (!weather.data) {
    content = <WeatherSkeleton />
  } else {
    content = (
      <>
        <CurrentWeather
          key={activeKey}
          city={city}
          weather={weather.data}
          units={units}
          online={online}
          refreshing={weather.status === 'loading'}
          onRefresh={refresh}
          isFavourite={favourites.has(city)}
          favouritesFull={favourites.isFull}
          onAddFavourite={favourites.add}
          onRemoveFavourite={setToRemove}
        />
        <HourlyForecast hourly={weather.data.hourly} timezoneOffset={weather.data.timezoneOffset} units={units} />
        <DailyForecast
          daily={weather.data.daily}
          current={weather.data.current}
          timezoneOffset={weather.data.timezoneOffset}
          units={units}
        />
      </>
    )
  }

  return (
    <div className="min-h-dvh">
      <ConnectionBanner
        online={online}
        cityName={weather.data ? city?.name : null}
        savedAt={weather.data?.fetchedAt}
      />

      <div className="mx-auto max-w-6xl px-4 pt-4 pb-12 sm:px-6 sm:pt-6">
        <Header search={<CitySearch onSelect={selectCity} online={online} />} />

        <main className="mt-5 grid gap-5 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
          <div className="min-w-0 space-y-5">
            <FavouriteChips
              favourites={favourites.favourites}
              activeKey={activeKey}
              temps={temps}
              units={units}
              onOpen={selectCity}
            />
            {content}
          </div>

          <aside className="grid min-w-0 gap-5 md:grid-cols-2 md:items-start lg:sticky lg:top-6 lg:grid-cols-1">
            <FavouritesPanel
              favourites={favourites.favourites}
              activeKey={activeKey}
              temps={temps}
              units={units}
              persistent={favourites.persistent}
              onOpen={selectCity}
              onRequestRemove={setToRemove}
            />
            <ReminderCard cities={reminderCities} />
          </aside>
        </main>

        <footer className="mt-12 flex flex-col gap-1.5 border-t border-line pt-6 text-xs text-ink-3 sm:flex-row sm:justify-between">
          <p>
            Weather by{' '}
            <a className="underline underline-offset-2 hover:text-ink" href="https://openweathermap.org" target="_blank" rel="noreferrer">
              OpenWeatherMap
            </a>{' '}
            &amp;{' '}
            <a className="underline underline-offset-2 hover:text-ink" href="https://open-meteo.com" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>
            . City search by GeoDB Cities &amp; Open-Meteo.
          </p>
          <p>WeatherBoard · works offline · installable</p>
        </footer>
      </div>

      <ConfirmDialog
        open={Boolean(toRemove)}
        title={`Remove ${toRemove?.name ?? 'city'} from favourites?`}
        description="It will disappear from your quick-access list. You can save it again at any time from its weather card."
        confirmLabel="Remove"
        onCancel={() => setToRemove(null)}
        onConfirm={() => {
          favourites.remove(toRemove)
          setToRemove(null)
        }}
      />
      <UpdateToast />
    </div>
  )
}
