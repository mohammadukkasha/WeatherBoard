// Daily reminder state: permission, settings (IndexedDB) and delivery.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_REMINDER,
  SYNC_TAG,
  dueToday,
  loadReminder,
  localDateKey,
  maybeSendReminder,
  saveReminder,
  showWeatherNotification,
} from '../lib/reminder.js'
import {
  getNotificationSupport,
  getRegistration,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
} from '../lib/push.js'

const CHECK_EVERY_MS = 60_000

/** If today's time has already passed, the first reminder should be tomorrow's — not right now. */
function initialLastSent(time, previous) {
  return new Date() >= dueToday(time) ? localDateKey() : previous === localDateKey() ? null : previous
}

async function registerPeriodicSync(registration) {
  if (!registration.periodicSync) return false
  try {
    const status = await navigator.permissions?.query({ name: 'periodic-background-sync' })
    if (status && status.state !== 'granted') return false // only granted to installed apps
    await registration.periodicSync.register(SYNC_TAG, { minInterval: 60 * 60 * 1000 })
    return true
  } catch {
    return false
  }
}

async function unregisterPeriodicSync(registration) {
  try {
    await registration.periodicSync?.unregister(SYNC_TAG)
  } catch {
    /* not registered */
  }
}

export function useReminder() {
  const support = useMemo(getNotificationSupport, [])
  const [permission, setPermission] = useState(() => (support.notifications ? Notification.permission : 'unsupported'))
  const [settings, setSettings] = useState(null) // null while loading from IndexedDB
  const [busy, setBusy] = useState(null) // 'enable' | 'save' | 'disable' | 'test'
  const [backgroundSync, setBackgroundSync] = useState(false)

  useEffect(() => {
    loadReminder().then(setSettings).catch(() => setSettings(DEFAULT_REMINDER))
  }, [])

  // Notice when the person changes the permission in site settings.
  useEffect(() => {
    if (!support.notifications || !navigator.permissions?.query) return
    let status
    const onChange = () => setPermission(Notification.permission)
    navigator.permissions
      .query({ name: 'notifications' })
      .then((s) => {
        status = s
        s.addEventListener('change', onChange)
      })
      .catch(() => {})
    window.addEventListener('focus', onChange)
    return () => {
      status?.removeEventListener('change', onChange)
      window.removeEventListener('focus', onChange)
    }
  }, [support.notifications])

  // Local mode: check once a minute while the app is open (and on launch).
  useEffect(() => {
    if (!settings?.enabled || settings.mode === 'push' || permission !== 'granted') return
    let cancelled = false
    const check = async () => {
      try {
        const registration = await getRegistration()
        if (!cancelled) await maybeSendReminder(registration)
      } catch {
        /* worker not ready yet — next tick */
      }
    }
    check()
    const id = setInterval(check, CHECK_EVERY_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [settings?.enabled, settings?.mode, permission])

  // Push mode: re-send the schedule on launch so a server that lost its data
  // (free hosts wipe disks on redeploy) recovers without the person noticing.
  useEffect(() => {
    if (!settings?.enabled || settings.mode !== 'push' || permission !== 'granted' || !settings.city) return
    getRegistration()
      .then((registration) => subscribeToPush(registration, settings))
      .catch(() => {})
    // Only on launch / when the schedule itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.enabled, settings?.mode, settings?.time, settings?.city?.lat, settings?.city?.lon, permission])

  useEffect(() => {
    if (!settings?.enabled || settings.mode !== 'local') return
    getRegistration()
      .then(registerPeriodicSync)
      .then(setBackgroundSync)
      .catch(() => setBackgroundSync(false))
  }, [settings?.enabled, settings?.mode])

  const persist = useCallback(async (next) => {
    await saveReminder(next)
    setSettings(next)
  }, [])

  /** Must be called from a click: asks for permission (after our explanation), then schedules. */
  const enable = useCallback(
    async ({ time, city }) => {
      setBusy('enable')
      try {
        let result = Notification.permission
        if (result === 'default') result = await Notification.requestPermission()
        setPermission(result)
        if (result !== 'granted') return { ok: false, reason: result }

        const registration = await getRegistration()
        if (support.mode === 'push') await subscribeToPush(registration, { time, city })
        await persist({
          ...settings,
          enabled: true,
          time,
          city,
          mode: support.mode,
          lastSentDate: initialLastSent(time, settings?.lastSentDate),
        })
        return { ok: true }
      } catch (error) {
        return { ok: false, error }
      } finally {
        setBusy(null)
      }
    },
    [persist, settings, support.mode],
  )

  const update = useCallback(
    async ({ time, city }) => {
      setBusy('save')
      try {
        if (settings.mode === 'push') await subscribeToPush(await getRegistration(), { time, city })
        await persist({ ...settings, time, city, lastSentDate: initialLastSent(time, settings.lastSentDate) })
        return { ok: true }
      } catch (error) {
        return { ok: false, error }
      } finally {
        setBusy(null)
      }
    },
    [persist, settings],
  )

  const disable = useCallback(async () => {
    setBusy('disable')
    try {
      const registration = await getRegistration().catch(() => null)
      if (registration) {
        if (settings.mode === 'push') await unsubscribeFromPush(registration)
        await unregisterPeriodicSync(registration)
      }
      await persist({ ...settings, enabled: false })
      return { ok: true }
    } catch (error) {
      return { ok: false, error }
    } finally {
      setBusy(null)
    }
  }, [persist, settings])

  const sendTest = useCallback(async () => {
    setBusy('test')
    try {
      const registration = await getRegistration()
      if (settings.mode === 'push') await sendTestPush(registration)
      else await showWeatherNotification(registration, settings.city, { test: true })
      return { ok: true }
    } catch (error) {
      return { ok: false, error }
    } finally {
      setBusy(null)
    }
  }, [settings])

  return { support, permission, settings, busy, backgroundSync, enable, update, disable, sendTest }
}
