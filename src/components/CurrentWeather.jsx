import { useState } from 'react'
import { Droplets, Navigation2, RefreshCw, Star, Sunrise, Sunset, Wind } from 'lucide-react'
import WeatherIcon from './WeatherIcon.jsx'
import { SOURCES } from '../services/weather.js'
import { citySubtitle, compass, dateKeyAt, formatClock, formatTemp, formatWind, timeAgo } from '../lib/format.js'

import { useNow } from '../hooks/useNow.js'

// A soft glow tinted by the conditions — the only colour on the card.
const GLOW = {
  clear: ['rgba(251,191,36,.38)', 'rgba(129,140,248,.30)'],
  'partly-cloudy': ['rgba(251,191,36,.26)', 'rgba(129,140,248,.24)'],
  cloudy: ['rgba(148,163,184,.32)', 'rgba(100,116,139,.30)'],
  fog: ['rgba(148,163,184,.30)', 'rgba(100,116,139,.28)'],
  drizzle: ['rgba(96,165,250,.30)', 'rgba(96,165,250,.24)'],
  rain: ['rgba(59,130,246,.32)', 'rgba(59,130,246,.26)'],
  snow: ['rgba(125,211,252,.38)', 'rgba(125,211,252,.26)'],
  thunder: ['rgba(139,92,246,.34)', 'rgba(139,92,246,.30)'],
}

const FALLBACK_REASON = {
  'rate-limit': 'rate-limited',
  auth: 'rejected the API key',
  server: 'is having an outage',
  timeout: 'was too slow',
  network: 'could not be reached',
}

function Stat({ icon: Icon, label, children, sub }) {
  return (
    <div className="rounded-xl border border-line bg-surface/70 px-3.5 py-3 backdrop-blur-sm">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-[17px] font-semibold tabular-nums tracking-tight text-ink">{children}</dd>
      {sub && <dd className="mt-0.5 truncate text-xs text-ink-3">{sub}</dd>}
    </div>
  )
}

export default function CurrentWeather({
  city,
  weather,
  units,
  refreshing,
  online,
  onRefresh,
  isFavourite,
  favouritesFull,
  onAddFavourite,
  onRemoveFavourite,
}) {
  const now = useNow()
  const [notice, setNotice] = useState(null)
  const { current, daily, timezoneOffset } = weather
  const today = daily.find((d) => d.date === dateKeyAt(now, timezoneOffset))
  const glow = (GLOW[current.condition] ?? GLOW.cloudy)[current.isDay ? 0 : 1]
  const source = SOURCES[weather.source]

  function toggleFavourite() {
    if (isFavourite) return onRemoveFavourite(city)
    if (favouritesFull) {
      setNotice(`You already have 5 favourites. Remove one to save ${city.name}.`)
      return
    }
    onAddFavourite(city)
    setNotice(null)
  }

  return (
    <section
      aria-labelledby="current-city"
      className="rise-in relative overflow-hidden rounded-2xl border border-line bg-surface p-5 sm:p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-28 -top-32 size-80 rounded-full blur-3xl transition-colors duration-700 dark:opacity-55"
        style={{ background: glow }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 id="current-city" className="truncate text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
            {city.name}
          </h1>
          <p className="mt-0.5 truncate text-sm text-ink-3">
            {citySubtitle(city)}
            {citySubtitle(city) && ' · '}
            Local time {formatClock(now, timezoneOffset)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing || !online}
            title={online ? 'Refresh' : 'Refresh needs a connection'}
            aria-label={refreshing ? 'Refreshing weather' : 'Refresh weather'}
            className="grid size-11 place-items-center rounded-xl text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`size-[18px] ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={toggleFavourite}
            aria-pressed={isFavourite}
            aria-label={isFavourite ? `Remove ${city.name} from favourites` : `Save ${city.name} to favourites`}
            title={isFavourite ? 'Remove from favourites' : 'Save to favourites'}
            className={`grid size-11 place-items-center rounded-xl transition-colors hover:bg-surface-2 ${
              isFavourite ? 'text-amber-500' : 'text-ink-2 hover:text-ink'
            }`}
          >
            <Star className="size-5" fill={isFavourite ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        </div>
      </div>

      {notice && (
        <p role="status" className="relative mt-3 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-ink">
          {notice}
        </p>
      )}

      <div className="relative mt-6 flex items-center gap-4 sm:gap-6">
        <WeatherIcon condition={current.condition} isDay={current.isDay} size={96} animated className="max-sm:size-20" />
        <div className="min-w-0">
          <p className="text-6xl font-semibold leading-none tracking-tighter tabular-nums text-ink sm:text-7xl">
            {formatTemp(current.temp, units)}
          </p>
          <p className="mt-2 text-[15px] font-medium text-ink-2">{current.description}</p>
          <p className="mt-0.5 text-sm text-ink-3 tabular-nums">
            Feels like {formatTemp(current.feelsLike, units)}
            {today && (
              <>
                {' '}
                · H {formatTemp(today.max, units)} · L {formatTemp(today.min, units)}
              </>
            )}
          </p>
        </div>
      </div>

      <dl className="relative mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat icon={Droplets} label="Humidity" sub={current.humidity >= 70 ? 'Humid' : current.humidity <= 30 ? 'Dry' : 'Comfortable'}>
          {current.humidity != null ? `${Math.round(current.humidity)}%` : '—'}
        </Stat>
        <Stat
          icon={Wind}
          label="Wind"
          sub={
            current.windDeg != null && (
              <span className="inline-flex items-center gap-1">
                <Navigation2
                  className="size-3"
                  style={{ transform: `rotate(${(current.windDeg + 180) % 360}deg)` }}
                  aria-hidden="true"
                />
                From the {compass(current.windDeg)}
              </span>
            )
          }
        >
          {formatWind(current.windSpeed, units)}
        </Stat>
        <Stat icon={Sunrise} label="Sunrise">
          {formatClock(current.sunrise, timezoneOffset)}
        </Stat>
        <Stat icon={Sunset} label="Sunset">
          {formatClock(current.sunset, timezoneOffset)}
        </Stat>
      </dl>

      <div className="relative mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`size-1.5 rounded-full ${weather.fromCache ? 'bg-amber-500' : 'bg-emerald-500'}`}
            aria-hidden="true"
          />
          {weather.fromCache ? 'Saved data from ' : 'Updated '}
          {weather.fromCache
            ? new Date(weather.fetchedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
            : timeAgo(weather.fetchedAt, now)}
        </span>
        <span>
          via{' '}
          <a href={source.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
            {source.name}
          </a>
        </span>
        {weather.fallback && (
          <span className="text-ink-3">
            · OpenWeatherMap {FALLBACK_REASON[weather.fallback.reason] ?? 'failed'}, so we switched sources
          </span>
        )}
      </div>
    </section>
  )
}
