import { useId, useState } from 'react'
import { BellOff, BellRing, Check, CircleExclamationPoint, Info, LoaderCircle, Smartphone } from 'lucide-react'
import { useReminder } from '../hooks/useReminder.js'
import { describeReminderError } from '../lib/push.js'
import { localDateKey, dueToday } from '../lib/reminder.js'
import { cityKey } from '../lib/format.js'

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function validateTime(value) {
  if (!value) return 'Choose a time for your reminder, for example 07:30.'
  if (!TIME_PATTERN.test(value)) return 'Enter the time as hours and minutes, for example 07:30.'
  return null
}

function formatTime(time) {
  const [h, m] = time.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function nextLabel({ time, lastSentDate }) {
  const sentToday = lastSentDate === localDateKey()
  const today = !sentToday && new Date() < dueToday(time)
  return `${today ? 'today' : 'tomorrow'} at ${formatTime(time)}`
}

function Card({ children, title = 'Morning reminder', badge }) {
  return (
    <section aria-labelledby="reminder-title" className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="reminder-title" className="text-sm font-semibold text-ink">
          {title}
        </h2>
        {badge}
      </div>
      {children}
    </section>
  )
}

function Callout({ tone = 'info', icon: Icon = Info, children }) {
  const tones = {
    info: 'border-line bg-surface-2 text-ink-2',
    warn: 'border-warn-line bg-warn-soft text-warn-ink',
    danger: 'border-danger/30 bg-danger-soft text-danger-text',
    ok: 'border-ok/30 bg-ok-soft text-ok',
  }
  return (
    <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${tones[tone]}`}>
      <Icon className="mt-px size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function ReminderForm({ cities, initial, submitLabel, busyLabel, busy, onSubmit, footer }) {
  const [time, setTime] = useState(initial.time)
  const [cityId, setCityId] = useState(initial.city ? cityKey(initial.city) : cities[0] ? cityKey(cities[0]) : '')
  const [errors, setErrors] = useState({})
  const ids = { time: useId(), city: useId(), timeErr: useId(), cityErr: useId() }

  const cityError = (id) => (cities.some((c) => cityKey(c) === id) ? null : 'Pick the city the reminder should report on.')

  function submit(e) {
    e.preventDefault()
    const next = { time: validateTime(time), city: cityError(cityId) }
    setErrors(next)
    if (next.time || next.city) return
    onSubmit({ time, city: cities.find((c) => cityKey(c) === cityId) })
  }

  if (!cities.length) {
    return (
      <Callout>
        Search for a city first — the reminder needs a city to report on. Your current city and favourites will appear
        here.
      </Callout>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-3">
      <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-2.5">
        <div>
          <label htmlFor={ids.time} className="text-xs font-medium text-ink-2">
            Time
          </label>
          <input
            id={ids.time}
            type="time"
            step={60}
            value={time}
            required
            onChange={(e) => {
              setTime(e.target.value)
              if (errors.time) setErrors((er) => ({ ...er, time: validateTime(e.target.value) }))
            }}
            onBlur={() => setErrors((er) => ({ ...er, time: validateTime(time) }))}
            aria-invalid={Boolean(errors.time)}
            aria-describedby={errors.time ? ids.timeErr : undefined}
            className={`mt-1 h-11 w-full rounded-xl border bg-surface px-3 text-sm tabular-nums text-ink ${
              errors.time ? 'border-danger' : 'border-line-strong'
            }`}
          />
        </div>
        <div>
          <label htmlFor={ids.city} className="text-xs font-medium text-ink-2">
            City
          </label>
          <select
            id={ids.city}
            value={cityId}
            onChange={(e) => {
              setCityId(e.target.value)
              setErrors((er) => ({ ...er, city: cityError(e.target.value) }))
            }}
            onBlur={() => setErrors((er) => ({ ...er, city: cityError(cityId) }))}
            aria-invalid={Boolean(errors.city)}
            aria-describedby={errors.city ? ids.cityErr : undefined}
            className={`mt-1 h-11 w-full truncate rounded-xl border bg-surface px-3 text-sm text-ink ${
              errors.city ? 'border-danger' : 'border-line-strong'
            }`}
          >
            {!cities.some((c) => cityKey(c) === cityId) && <option value="">Choose a city</option>}
            {cities.map((c) => (
              <option key={cityKey(c)} value={cityKey(c)}>
                {c.name}
                {c.country ? `, ${c.country}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      {(errors.time || errors.city) && (
        <div className="space-y-1 text-sm text-danger-text">
          {errors.time && (
            <p id={ids.timeErr} className="flex items-start gap-1.5">
              <CircleExclamationPoint className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errors.time}
            </p>
          )}
          {errors.city && (
            <p id={ids.cityErr} className="flex items-start gap-1.5">
              <CircleExclamationPoint className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errors.city}
            </p>
          )}
        </div>
      )}
      {footer}
      <button
        type="submit"
        disabled={Boolean(busy)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-70"
      >
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
        {busy ? busyLabel : submitLabel}
      </button>
    </form>
  )
}

export default function ReminderCard({ cities }) {
  const { support, permission, settings, busy, backgroundSync, enable, update, disable, sendTest } = useReminder()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState(null) // { tone, text }

  // Make sure the reminder's own city is always selectable.
  const options = settings?.city && !cities.some((c) => cityKey(c) === cityKey(settings.city)) ? [settings.city, ...cities] : cities

  if (!settings) {
    return (
      <Card>
        <div className="skeleton mt-4 h-16 rounded-xl" />
      </Card>
    )
  }

  if (!support.supported) {
    return (
      <Card badge={<span className="text-xs text-ink-3">Not available</span>}>
        {support.isIOS && !support.standalone ? (
          <Callout icon={Smartphone}>
            On iPhone and iPad, notifications only work for apps on the Home Screen. Tap{' '}
            <span className="font-medium">Share → Add to Home Screen</span>, open WeatherBoard from there, and set up
            your reminder.
          </Callout>
        ) : (
          <Callout icon={BellOff}>
            This browser doesn’t support web notifications, so daily reminders aren’t available here. Everything else
            works as normal — or open WeatherBoard in a recent Chrome, Edge, Firefox or Safari.
          </Callout>
        )}
      </Card>
    )
  }

  if (permission === 'denied') {
    return (
      <Card badge={<span className="text-xs text-ink-3">Blocked</span>}>
        <Callout tone="warn" icon={BellOff}>
          <p>
            Notifications are blocked for WeatherBoard, so we can’t send your morning reminder. Everything else keeps
            working.
          </p>
          <p className="mt-1.5">
            To turn them on: click the <span className="font-medium">lock/settings icon</span> next to the address,
            open <span className="font-medium">Notifications</span>, choose <span className="font-medium">Allow</span>,
            then come back to this tab.
          </p>
        </Callout>
      </Card>
    )
  }

  const delivery =
    support.mode === 'push'
      ? 'Sent by WeatherBoard’s push server — it arrives even when this tab and the app are closed.'
      : backgroundSync
        ? 'Your browser delivers it in the background while the app is installed. The browser picks the exact moment, so it can arrive a little after your chosen time.'
        : support.periodicSync && !support.standalone
          ? 'No push server is configured for this deployment. Install WeatherBoard (Chrome/Edge) so your browser can deliver reminders in the background; until then they arrive while the app is open.'
          : 'No push server is configured for this deployment, so reminders arrive only while WeatherBoard is open.'

  async function run(action, args, success) {
    setMessage(null)
    const result = await action(args)
    if (result.ok) {
      setMessage(success ? { tone: 'ok', text: success } : null)
      setEditing(false)
      setExpanded(false)
    } else if (result.reason === 'default') {
      setMessage({ tone: 'warn', text: 'You closed the permission prompt without choosing. Tap the button again whenever you’re ready.' })
    } else if (result.error) {
      setMessage({ tone: 'danger', text: describeReminderError(result.error) })
    }
  }

  const feedback = message && (
    <Callout tone={message.tone} icon={message.tone === 'ok' ? Check : message.tone === 'danger' ? CircleExclamationPoint : Info}>
      <span role={message.tone === 'danger' ? 'alert' : 'status'}>{message.text}</span>
    </Callout>
  )

  if (settings.enabled && permission === 'granted') {
    return (
      <Card
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            On
          </span>
        }
      >
        {editing ? (
          <ReminderForm
            cities={options}
            initial={settings}
            submitLabel="Save changes"
            busyLabel="Saving…"
            busy={busy === 'save'}
            onSubmit={(values) => run(update, values, `Saved. Next reminder ${nextLabel({ time: values.time, lastSentDate: null })}.`)}
            footer={
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="min-h-11 w-full rounded-xl border border-line-strong text-sm font-medium text-ink hover:bg-surface-2"
              >
                Cancel
              </button>
            }
          />
        ) : (
          <>
            <p className="mt-3 flex items-start gap-2.5 text-sm text-ink">
              <BellRing className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
              <span>
                Every day at <span className="font-semibold tabular-nums">{formatTime(settings.time)}</span> for{' '}
                <span className="font-semibold">{settings.city?.name}</span>.
                <span className="block text-xs text-ink-3">Next one {nextLabel(settings)}.</span>
              </span>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-3">{delivery}</p>
            {feedback}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMessage(null)
                  setEditing(true)
                }}
                className="min-h-11 rounded-xl border border-line-strong text-sm font-medium text-ink hover:bg-surface-2"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => run(sendTest, undefined, 'Test notification sent — check your notifications.')}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line-strong text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-60"
              >
                {busy === 'test' && <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />}
                Test
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => run(disable, undefined, 'Reminder turned off.')}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line-strong text-sm font-medium text-danger-text hover:bg-danger-soft disabled:opacity-60"
              >
                {busy === 'disable' && <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />}
                Turn off
              </button>
            </div>
          </>
        )}
      </Card>
    )
  }

  // Not set up yet: explain what we'll do *before* the browser asks for permission.
  return (
    <Card>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        One short notification each morning with the temperature, today’s high and low, and whether to take an umbrella.
      </p>
      {feedback}
      {!expanded ? (
        <button
          type="button"
          onClick={() => {
            setMessage(null)
            setExpanded(true)
          }}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong text-sm font-medium text-ink hover:bg-surface-2"
        >
          <BellRing className="size-4" aria-hidden="true" />
          Set up morning reminder
        </button>
      ) : (
        <ReminderForm
          cities={options}
          initial={settings}
          submitLabel={permission === 'granted' ? 'Turn on reminder' : 'Continue — allow notifications'}
          busyLabel={permission === 'granted' ? 'Turning on…' : 'Waiting for your browser…'}
          busy={busy === 'enable'}
          onSubmit={(values) => run(enable, values, `Reminder on. Next one ${nextLabel({ ...settings, ...values, lastSentDate: null })}.`)}
          footer={
            permission !== 'granted' && (
              <Callout>
                <span className="font-medium text-ink">Why we ask:</span> to show the reminder when WeatherBoard isn’t
                open, your browser needs your permission. It will ask next — we only ever send this one daily
                notification, and you can turn it off here at any time.
              </Callout>
            )
          }
        />
      )}
    </Card>
  )
}
