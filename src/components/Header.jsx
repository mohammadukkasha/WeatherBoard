import { useEffect, useState } from 'react'
import { Download, Monitor, Moon, Sun } from 'lucide-react'
import { usePrefs } from '../context/prefs.jsx'

const THEME_META = {
  system: { icon: Monitor, label: 'System theme' },
  light: { icon: Sun, label: 'Light theme' },
  dark: { icon: Moon, label: 'Dark theme' },
}
const NEXT_THEME = { system: 'light', light: 'dark', dark: 'system' }

function Logo() {
  return (
    <a href="/" className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg" aria-label="WeatherBoard home">
      <img src="/logo.svg" alt="" width="30" height="30" className="size-[30px]" />
      <span className="text-[15px] font-semibold tracking-tight text-ink max-[359px]:sr-only">WeatherBoard</span>
    </a>
  )
}

function UnitToggle() {
  const { units, setUnits } = usePrefs()
  return (
    <div role="radiogroup" aria-label="Temperature unit" className="flex gap-0.5 rounded-xl border border-line bg-surface">
      {[
        ['metric', '°C'],
        ['imperial', '°F'],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={units === value}
          onClick={() => setUnits(value)}
          className={`grid size-11 place-items-center rounded-[11px] text-sm font-medium transition-colors ${
            units === value ? 'bg-surface-2 text-ink shadow-sm ring-1 ring-line' : 'text-ink-3 hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function ThemeToggle() {
  const { theme, cycleTheme } = usePrefs()
  const { icon: Icon, label } = THEME_META[theme]
  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={`${label}. Switch to ${THEME_META[NEXT_THEME[theme]].label.toLowerCase()}`}
      title={label}
      className="grid size-[46px] place-items-center rounded-xl border border-line bg-surface text-ink-2 transition-colors hover:text-ink"
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  )
}

/** Shows an Install button when the browser offers one (Chromium's beforeinstallprompt). */
function InstallButton() {
  const [promptEvent, setPromptEvent] = useState(null)
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault()
      setPromptEvent(e)
    }
    const onInstalled = () => setPromptEvent(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])
  if (!promptEvent) return null
  return (
    <button
      type="button"
      onClick={async () => {
        promptEvent.prompt()
        await promptEvent.userChoice.catch(() => null)
        setPromptEvent(null)
      }}
      className="flex h-[46px] items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink-2 transition-colors hover:text-ink max-sm:w-[46px] max-sm:justify-center max-sm:px-0"
      aria-label="Install WeatherBoard as an app"
    >
      <Download className="size-[18px]" aria-hidden="true" />
      <span className="max-sm:hidden">Install</span>
    </button>
  )
}

export default function Header({ search }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3 md:flex-nowrap">
      <Logo />
      <div className="order-last w-full md:order-none md:max-w-xl md:flex-1">{search}</div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <InstallButton />
        <UnitToggle />
        <ThemeToggle />
      </div>
    </header>
  )
}
