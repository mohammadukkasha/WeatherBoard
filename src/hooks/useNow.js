import { useEffect, useState } from 'react'

/** Re-renders every `interval` ms so relative times ("3 minutes ago") stay current. */
export function useNow(interval = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }, [interval])
  return now
}
