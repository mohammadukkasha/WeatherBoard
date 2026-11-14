// Units and theme. Persisted in localStorage (read by index.html before first
// paint to avoid a theme flash) and mirrored to IndexedDB so the service
// worker formats notifications in the same units.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { readJSON, writeJSON } from '../lib/storage.js'
import { kvSet, KV } from '../lib/kv.js'

const KEY = 'wb:prefs'
const THEMES = ['system', 'light', 'dark']
const CANVAS = { light: '#f5f6f8', dark: '#0a0c10' }

// Fahrenheit only for US time zones. The browser language is a poor signal:
// "en-US" is the default install language far outside the US.
const US_ZONES = /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Sitka|Nome|Adak|Metlakatla|Yakutat|Menominee|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/Honolulu)$/

function defaultUnits() {
  try {
    return US_ZONES.test(Intl.DateTimeFormat().resolvedOptions().timeZone) ? 'imperial' : 'metric'
  } catch {
    return 'metric'
  }
}

function loadPrefs() {
  const saved = readJSON(KEY, {}) || {}
  return {
    units: saved.units === 'imperial' || saved.units === 'metric' ? saved.units : defaultUnits(),
    theme: THEMES.includes(saved.theme) ? saved.theme : 'system',
  }
}

const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)')

const PrefsContext = createContext(null)

export function PrefsProvider({ children }) {
  const [prefs, setPrefs] = useState(loadPrefs)
  const [systemDark, setSystemDark] = useState(() => Boolean(darkQuery()?.matches))

  useEffect(() => {
    const mq = darkQuery()
    if (!mq) return
    const onChange = (e) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme = prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', CANVAS[resolvedTheme]))
  }, [resolvedTheme])

  useEffect(() => {
    writeJSON(KEY, prefs)
    kvSet(KV.prefs, { units: prefs.units })
  }, [prefs])

  // Keep several open tabs in sync.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY) setPrefs(loadPrefs())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setUnits = useCallback((units) => setPrefs((p) => ({ ...p, units })), [])
  const cycleTheme = useCallback(
    () => setPrefs((p) => ({ ...p, theme: THEMES[(THEMES.indexOf(p.theme) + 1) % THEMES.length] })),
    [],
  )

  const value = useMemo(
    () => ({ ...prefs, resolvedTheme, setUnits, cycleTheme }),
    [prefs, resolvedTheme, setUnits, cycleTheme],
  )
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePrefs() {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs must be used inside <PrefsProvider>')
  return ctx
}
