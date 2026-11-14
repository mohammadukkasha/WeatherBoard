import { HardDrive, Star, X } from 'lucide-react'
import WeatherIcon from './WeatherIcon.jsx'
import { MAX_FAVOURITES } from '../hooks/useFavourites.js'
import { cityKey, formatTemp } from '../lib/format.js'

function StorageNotice() {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn-ink">
      <HardDrive className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        Your browser is blocking storage (private window or strict privacy settings), so favourites will only last
        until you close this tab.
      </span>
    </p>
  )
}

/** Full panel: sidebar on desktop, a card below the forecast on smaller screens. */
export function FavouritesPanel({ favourites, activeKey, temps, units, persistent, onOpen, onRequestRemove }) {
  return (
    <section aria-labelledby="favourites-title" className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 id="favourites-title" className="text-sm font-semibold text-ink">
          Favourites
        </h2>
        <span className="text-xs tabular-nums text-ink-3" aria-label={`${favourites.length} of ${MAX_FAVOURITES} saved`}>
          {favourites.length}/{MAX_FAVOURITES}
        </span>
      </div>

      {favourites.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-surface-2 text-ink-3">
            <Star className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-medium text-ink">No favourites yet</p>
          <p className="mx-auto mt-1 max-w-[16rem] text-xs leading-relaxed text-ink-3">
            Tap the star on a city’s weather card to keep up to {MAX_FAVOURITES} cities one tap away.
          </p>
        </div>
      ) : (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 md:grid-cols-1">
          {favourites.map((city) => {
            const key = cityKey(city)
            const t = temps[key]
            const active = key === activeKey
            return (
              <li
                key={key}
                className={`group flex items-center rounded-xl border transition-colors ${
                  active ? 'border-accent/40 bg-accent-soft' : 'border-transparent hover:bg-surface-2'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onOpen(city)}
                  aria-current={active ? 'true' : undefined}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pl-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{city.name}</span>
                    <span className="block truncate text-xs text-ink-3">{city.country || city.region}</span>
                  </span>
                  {t?.temp != null && (
                    <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tabular-nums text-ink">
                      <WeatherIcon condition={t.condition} isDay={t.isDay} size={22} />
                      {formatTemp(t.temp, units)}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onRequestRemove(city)}
                  aria-label={`Remove ${city.name} from favourites`}
                  title="Remove"
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-ink-3 hover:bg-danger-soft hover:text-danger-text"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {!persistent && <StorageNotice />}
    </section>
  )
}

/** Quick-access row above the weather on phones and tablets (the full panel is further down). */
export function FavouriteChips({ favourites, activeKey, temps, units, onOpen }) {
  if (!favourites.length) return null
  return (
    <nav aria-label="Favourite cities" className="lg:hidden">
      <ul className="flex flex-wrap gap-2">
        {favourites.map((city) => {
          const key = cityKey(city)
          const t = temps[key]
          const active = key === activeKey
          return (
            <li key={key} className="min-w-0">
              <button
                type="button"
                onClick={() => onOpen(city)}
                aria-current={active ? 'true' : undefined}
                className={`flex min-h-11 max-w-[11rem] items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${
                  active
                    ? 'border-accent/50 bg-accent-soft font-medium text-accent-text'
                    : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'
                }`}
              >
                <Star className="size-3.5 shrink-0 text-amber-500" fill="currentColor" aria-hidden="true" />
                <span className="truncate">{city.name}</span>
                {t?.temp != null && <span className="tabular-nums text-ink-3">{formatTemp(t.temp, units)}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
