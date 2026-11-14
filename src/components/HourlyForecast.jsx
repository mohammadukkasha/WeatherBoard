import WeatherIcon from './WeatherIcon.jsx'
import { formatHour, formatTemp } from '../lib/format.js'

export default function HourlyForecast({ hourly, timezoneOffset, units }) {
  if (!hourly?.length) return null
  return (
    <section aria-labelledby="hourly-title" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="hourly-title" className="text-sm font-semibold text-ink">
        Next 24 hours
      </h2>
      <ol className="mt-4 grid grid-cols-4 gap-y-5 sm:grid-cols-8">
        {hourly.map((h, i) => (
          <li key={h.time} className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-xs font-medium text-ink-3">
              {i === 0 && h.time <= Date.now() + 30 * 60 * 1000 ? 'Now' : formatHour(h.time, timezoneOffset)}
            </span>
            <WeatherIcon condition={h.condition} isDay={h.isDay} size={30} />
            <span className="text-[15px] font-semibold tabular-nums text-ink">{formatTemp(h.temp, units)}</span>
            <span className={`text-[11px] font-medium tabular-nums ${h.pop >= 20 ? 'text-accent-text' : 'text-transparent'}`}>
              {h.pop >= 20 ? `${h.pop}%` : '0%'}
              {h.pop >= 20 && <span className="sr-only"> chance of rain</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
