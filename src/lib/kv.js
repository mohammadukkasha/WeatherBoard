// IndexedDB key/value store shared by the page and the service worker
// (the service worker has no access to localStorage).
import { get, set } from 'idb-keyval'

export const KV = {
  reminder: 'reminder',
  prefs: 'prefs',
  snapshot: 'snapshot',
}

export async function kvGet(key) {
  try {
    return await get(key)
  } catch {
    return undefined
  }
}

export async function kvSet(key, value) {
  try {
    await set(key, value)
    return true
  } catch {
    return false
  }
}
