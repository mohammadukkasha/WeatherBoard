import { Droplet } from 'lucide-react'
import WeatherIcon from './WeatherIcon.jsx'
import { dateKeyAt, dayLabel, formatTemp, longDate } from '../lib/format.js'

// Temperature → colour, so a warm week looks warm at a glance.
const STOPS = [
  [-10, [129, 140, 248]],
  [0, [96, 165, 250]],
  [10, [45, 212, 191]],
  [20, [250, 204, 21]],
  [30, [251, 146, 60]],
  [40, [239, 68, 68]],
]
function tempColor(c) {
  if (c <= STOPS[0][0]) return `rgb(${STOPS[0][1]})`
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i]
    const [t0, c0] = STOPS[i - 1]
    if (c <= t1) {
      const k = (c - t0) / (t1 - t0)
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(',')})`
    }
  }
  return `rgb(${STOPS.at(-1)[1]})`
}

export default function DailyForecast({ daily, current, timezoneOffset, units }) {
  if (!daily?.length) return null
  const todayKey = dateKeyAt(Date.now(), timezoneOffset)
  const lo = Math.min(...daily.map((d) => d.min))
  const hi = Math.max(...daily.map((d) => d.max))
  const span = Math.max(hi - lo, 1)
  const pct = (t) => ((t - lo) / span) * 100

  return (
    <section aria-labelledby="daily-title" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="daily-title" className="text-sm font-semibold text-ink">
        5-day forecast
      </h2>
      <ul className="mt-2 divide-y divide-line">
        {daily.map((d) => {
          const isToday = d.date === todayKey
          return (
            <li
              key={d.date}
              className="grid grid-cols-[3.25rem_2.25rem_2.75rem_2.5rem_minmax(0,1fr)_2.5rem] items-center gap-x-2 py-3 sm:grid-cols-[6.5rem_2.5rem_3.5rem_3rem_minmax(0,1fr)_3rem] sm:gap-x-3"
            >
              <span className="text-sm font-medium text-ink">
                <span aria-hidden="true">{dayLabel(d.date, todayKey)}</span>
                <span className="sr-only">{isToday ? 'Today' : longDate(d.date)}</span>
              </span>
              <WeatherIcon condition={d.condition} isDay size={30} label={d.description} />
              <span className="flex items-center gap-0.5 text-xs font-medium tabular-nums text-accent-text">
                {d.pop >= 10 && (
                  <>
                    <Droplet className="size-3" aria-hidden="true" />
                    {d.pop}%<span className="sr-only"> chance of rain</span>
                  </>
                )}
              </span>
              <span className="text-right text-sm tabular-nums text-ink-3">
                <span className="sr-only">Low </span>
                {formatTemp(d.min, units)}
              </span>
              <span className="relative h-1.5 rounded-full bg-surface-2" aria-hidden="true">
                <span
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    left: `${pct(d.min)}%`,
                    width: `${Math.max(pct(d.max) - pct(d.min), 4)}%`,
                    background: `linear-gradient(90deg, ${tempColor(d.min)}, ${tempColor(d.max)})`,
                  }}
                />
                {isToday && current && (
                  <span
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink"
                    style={{ left: `${Math.min(Math.max(pct(current.temp), 0), 100)}%` }}
                    title="Now"
                  />
                )}
              </span>
              <span className="text-sm font-semibold tabular-nums text-ink">
                <span className="sr-only">High </span>
                {formatTemp(d.max, units)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
