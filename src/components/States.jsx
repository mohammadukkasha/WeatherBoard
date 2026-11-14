// Loading, error and empty states for the main weather area.
import { CircleExclamationPoint, CloudOff, RefreshCw, WifiOff } from 'lucide-react'
import WeatherIcon from './WeatherIcon.jsx'
import { describeWeatherError } from '../lib/errors.js'

export function WeatherSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading weather" className="space-y-5">
      <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="skeleton h-7 w-40 rounded-lg" />
        <div className="skeleton mt-2 h-4 w-56 rounded" />
        <div className="mt-7 flex items-center gap-5">
          <div className="skeleton size-20 rounded-full sm:size-24" />
          <div className="space-y-2.5">
            <div className="skeleton h-14 w-32 rounded-lg" />
            <div className="skeleton h-4 w-40 rounded" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-[74px] rounded-xl" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="skeleton h-4 w-28 rounded" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton mt-4 h-6 rounded" />
        ))}
      </div>
      <span className="sr-only" role="status">
        Loading weather…
      </span>
    </div>
  )
}

export function WeatherError({ error, cityName, onRetry, online, fallbackCity, onOpenFallback }) {
  const { title, detail } = describeWeatherError(error, cityName)
  const Icon = error?.kind === 'offline' ? WifiOff : error?.kind === 'network' ? CloudOff : CircleExclamationPoint
  return (
    <section role="alert" className="rise-in rounded-2xl border border-line bg-surface px-5 py-10 text-center sm:px-10">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-danger-soft text-danger-text">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-2">{detail}</p>
      <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          disabled={!online}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          {online ? 'Retry' : 'Retry when online'}
        </button>
        {fallbackCity && (
          <button
            type="button"
            onClick={onOpenFallback}
            className="min-h-11 rounded-xl border border-line-strong px-5 text-sm font-medium text-ink hover:bg-surface-2"
          >
            Show saved weather for {fallbackCity.name}
          </button>
        )}
      </div>
    </section>
  )
}

const SUGGESTIONS = [
  { id: 'q:london', name: 'London', region: 'England', country: 'United Kingdom', countryCode: 'GB', lat: 51.5085, lon: -0.1257 },
  { id: 'q:karachi', name: 'Karachi', region: 'Sindh', country: 'Pakistan', countryCode: 'PK', lat: 24.8608, lon: 67.0104 },
  { id: 'q:tokyo', name: 'Tokyo', region: 'Tokyo', country: 'Japan', countryCode: 'JP', lat: 35.6895, lon: 139.6917 },
  { id: 'q:newyork', name: 'New York', region: 'New York', country: 'United States', countryCode: 'US', lat: 40.7143, lon: -74.006 },
  { id: 'q:dubai', name: 'Dubai', region: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', lat: 25.0772, lon: 55.3093 },
]

export function EmptyState({ onPick, online }) {
  return (
    <section className="rise-in rounded-2xl border border-line bg-surface px-5 py-12 text-center sm:px-10 sm:py-16">
      <div className="mx-auto flex w-fit items-end gap-1">
        <WeatherIcon condition="partly-cloudy" isDay size={72} animated label="" />
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">Check the weather anywhere</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-2">
        Search for a city above to see current conditions, the next 24 hours and a 5-day forecast.
      </p>
      <div className="mt-7">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-3">Or start with</p>
        <ul className="mt-3 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((city) => (
            <li key={city.id}>
              <button
                type="button"
                disabled={!online}
                onClick={() => onPick(city)}
                className="min-h-11 rounded-full border border-line px-4 text-sm text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
              >
                {city.name}
              </button>
            </li>
          ))}
        </ul>
        {!online && <p className="mt-3 text-xs text-ink-3">You’re offline — these will work again when you reconnect.</p>}
      </div>
    </section>
  )
}
