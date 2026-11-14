// Safe localStorage wrapper. Private-mode Safari, blocked cookies or a full
// quota all make localStorage throw — in that case we keep data in memory for
// the lifetime of the tab and tell the UI so it can explain what's happening.

const memory = new Map()
let available = null

export function isStorageAvailable() {
  if (available !== null) return available
  try {
    const probe = '__wb_probe__'
    window.localStorage.setItem(probe, probe)
    window.localStorage.removeItem(probe)
    available = true
  } catch {
    available = false
  }
  return available
}

export function readJSON(key, fallback) {
  try {
    const raw = isStorageAvailable() ? window.localStorage.getItem(key) : memory.get(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** Returns true when the value was persisted, false when it only lives in memory. */
export function writeJSON(key, value) {
  const raw = JSON.stringify(value)
  memory.set(key, raw)
  if (!isStorageAvailable()) return false
  try {
    window.localStorage.setItem(key, raw)
    return true
  } catch {
    return false
  }
}
