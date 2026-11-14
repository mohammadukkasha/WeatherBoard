// City search: an ARIA combobox with live suggestions, keyboard navigation
// and Stripe-style inline validation (on blur, then live once shown).
import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, CircleExclamationPoint, LoaderCircle, MapPin, Search, SearchX, WifiOff, X } from 'lucide-react'
import { useCitySearch } from '../hooks/useCitySearch.js'
import { CITY_PATTERN, normaliseQuery } from '../services/geo.js'
import { describeSearchError, validateCityQuery } from '../lib/errors.js'

function Highlight({ name, query }) {
  if (query && name.toLowerCase().startsWith(query)) {
    return (
      <>
        <span className="font-semibold text-ink">{name.slice(0, query.length)}</span>
        {name.slice(query.length)}
      </>
    )
  }
  return name
}

export default function CitySearch({ onSelect, online }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [dirty, setDirty] = useState(false) // the person has typed something
  const [touched, setTouched] = useState(false) // blurred after typing, or submitted
  const [submitError, setSubmitError] = useState(null)
  const [submitPending, setSubmitPending] = useState(false)
  const inputRef = useRef(null)
  const ids = { list: useId(), error: useId(), hint: useId(), status: useId() }

  const trimmed = text.trim()
  const validationError = validateCityQuery(text, CITY_PATTERN)
  // Wrong characters or absurd length are obvious mistakes: say so immediately.
  const liveError = trimmed && (!CITY_PATTERN.test(trimmed) || trimmed.length > 80) ? validationError : null
  const search = useCitySearch(text, online && !liveError)
  const query = normaliseQuery(text)
  const results = search.results
  const shownError = submitError || (touched ? validationError : liveError)

  useEffect(() => setActive(-1), [search.query])

  function choose(city) {
    // Blur first: its handler marks the field as touched, which the resets below undo.
    inputRef.current?.blur()
    setText('')
    setOpen(false)
    setDirty(false)
    setTouched(false)
    setSubmitError(null)
    setSubmitPending(false)
    onSelect(city)
  }

  function resolveSubmit() {
    if (search.status === 'success' && results.length) return choose(results[0])
    if (search.status === 'empty') {
      setSubmitError(`No cities match “${trimmed}”. Check the spelling, or try a larger city nearby.`)
    } else if (search.status === 'error') {
      setSubmitError(describeSearchError(search.error))
    }
    setSubmitPending(false)
  }

  // Enter pressed while suggestions were still loading: finish once they arrive.
  useEffect(() => {
    if (submitPending && search.status !== 'loading' && search.status !== 'idle') resolveSubmit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitPending, search.status])

  function handleSubmit(e) {
    e.preventDefault()
    setTouched(true)
    if (validationError) {
      inputRef.current?.focus()
      return
    }
    if (!online) {
      setSubmitError(describeSearchError({ kind: 'offline' }))
      return
    }
    if (open && active >= 0 && results[active]) return choose(results[active])
    setOpen(true)
    if (search.status === 'loading') setSubmitPending(true)
    else if (search.status === 'idle') setSubmitError('Type at least 2 letters of the city name (before any comma).')
    else resolveSubmit()
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (results.length ? (i + 1) % results.length : -1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (results.length ? (i <= 0 ? results.length - 1 : i - 1) : -1))
    } else if (e.key === 'Escape') {
      if (open) setOpen(false)
      else if (text) {
        setText('')
        setSubmitError(null)
        setTouched(false)
      }
    }
  }

  const showPanel = open && trimmed.length > 0 && !liveError && !submitError && online
  const statusMessage =
    search.status === 'success'
      ? `${results.length} ${results.length === 1 ? 'city' : 'cities'} found. Use up and down arrows to choose.`
      : search.status === 'empty'
        ? `No cities match ${trimmed}.`
        : ''

  return (
    <form role="search" onSubmit={handleSubmit} noValidate className="relative w-full">
      <label htmlFor="city-search" className="sr-only">
        Search for a city
      </label>
      <div
        className={`flex h-12 items-center rounded-xl border bg-surface transition-colors focus-within:ring-4 ${
          shownError
            ? 'border-danger focus-within:ring-danger/15'
            : 'border-line-strong focus-within:border-accent focus-within:ring-accent/15'
        }`}
      >
        <span className="pointer-events-none grid size-11 shrink-0 place-items-center text-ink-3" aria-hidden="true">
          {search.status === 'loading' ? <LoaderCircle className="size-[18px] animate-spin" /> : <Search className="size-[18px]" />}
        </span>
        <input
          ref={inputRef}
          id="city-search"
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={ids.list}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && active >= 0 ? `${ids.list}-${active}` : undefined}
          aria-invalid={Boolean(shownError)}
          aria-describedby={shownError ? ids.error : ids.hint}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={100}
          placeholder="Search a city, e.g. Lahore"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setDirty(true)
            setOpen(true)
            setSubmitError(null)
            setSubmitPending(false)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false)
            if (dirty) setTouched(true)
          }}
          onKeyDown={handleKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
        />
        {text && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setText('')
              setSubmitError(null)
              setTouched(false)
              setDirty(false)
              inputRef.current?.focus()
            }}
            className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-3 hover:text-ink"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
        <button
          type="submit"
          className="mr-1 grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-white transition-colors hover:bg-accent-hover max-sm:size-11"
          aria-label="Search"
        >
          <ArrowRight className="size-[18px]" />
        </button>
      </div>

      {shownError ? (
        <p id={ids.error} role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-danger-text">
          <CircleExclamationPoint className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{shownError}</span>
        </p>
      ) : !online ? (
        <p id={ids.hint} className="mt-2 flex items-center gap-1.5 text-sm text-ink-3">
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          Search needs a connection — it will work again when you reconnect.
        </p>
      ) : (
        <p id={ids.hint} className="sr-only">
          Type at least 2 letters to see matching cities.
        </p>
      )}

      <div id={ids.status} role="status" aria-live="polite" className="sr-only">
        {showPanel ? statusMessage : ''}
      </div>

      {showPanel && (
        <div
          className="rise-in absolute inset-x-0 top-[3.25rem] z-40 overflow-hidden rounded-xl border border-line bg-surface shadow-xl shadow-black/5 dark:shadow-black/40"
          onMouseDown={(e) => e.preventDefault()} // keep focus in the input while clicking
        >
          {query.length < 2 ? (
            <p className="px-4 py-3 text-sm text-ink-3">Keep typing — at least 2 letters.</p>
          ) : search.status === 'error' ? (
            <div className="flex items-start gap-3 px-4 py-3 text-sm">
              <CircleExclamationPoint className="mt-0.5 size-4 shrink-0 text-danger-text" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-ink-2">{describeSearchError(search.error)}</p>
                <button
                  type="button"
                  onClick={search.retry}
                  className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 font-medium text-ink hover:bg-surface-2"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : search.status === 'empty' ? (
            <div className="flex items-start gap-3 px-4 py-3 text-sm">
              <SearchX className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
              <div>
                <p className="font-medium text-ink">No cities match “{trimmed}”</p>
                <p className="mt-0.5 text-ink-3">Check the spelling, or try a larger city nearby.</p>
              </div>
            </div>
          ) : results.length === 0 ? (
            <ul aria-hidden="true" className="py-1">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="skeleton size-4 rounded" />
                  <span className="skeleton h-3.5 rounded" style={{ width: `${45 - i * 8}%` }} />
                </li>
              ))}
            </ul>
          ) : (
            <ul id={ids.list} role="listbox" aria-label="Matching cities" className="max-h-80 overflow-y-auto py-1">
              {results.map((city, i) => (
                <li
                  key={city.id}
                  id={`${ids.list}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onClick={() => choose(city)}
                  onMouseMove={() => active !== i && setActive(i)}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 ${i === active ? 'bg-surface-2' : ''}`}
                >
                  <MapPin className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink-2">
                      <Highlight name={city.name} query={query} />
                    </span>
                    <span className="block truncate text-xs text-ink-3">
                      {[city.region, city.country].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  {city.countryCode && (
                    <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-ink-3">
                      {city.countryCode}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {search.source && search.status !== 'error' && query.length >= 2 && (
            <p className="border-t border-line px-4 py-2 text-[11px] text-ink-3">
              Suggestions from {search.source === 'geodb' ? 'GeoDB Cities' : 'Open-Meteo Geocoding'}
            </p>
          )}
        </div>
      )}
    </form>
  )
}
