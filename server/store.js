// Tiny JSON-file store. Plenty for a reminder service of this size; swap for
// Redis/Postgres if it ever needs more than one instance.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import * as webpush from 'web-push'

export async function createStore(dir) {
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, 'subscriptions.json')
  let records = {}
  try {
    records = JSON.parse(await readFile(file, 'utf8')) || {}
  } catch {
    records = {}
  }

  // Serialise writes and write atomically (temp file + rename) so a crash
  // mid-write never leaves a half-written JSON file behind.
  let queue = Promise.resolve()
  const persist = () => {
    queue = queue
      .then(async () => {
        const tmp = `${file}.tmp`
        await writeFile(tmp, JSON.stringify(records, null, 2))
        await rename(tmp, file)
      })
      .catch((err) => console.error('[store] could not save subscriptions:', err.message))
    return queue
  }

  return {
    idFor: (endpoint) => createHash('sha256').update(endpoint).digest('hex').slice(0, 32),
    all: () => Object.values(records),
    get: (id) => records[id],
    count: () => Object.keys(records).length,
    upsert(record) {
      records[record.id] = record
      return persist()
    },
    patch(id, changes) {
      if (!records[id]) return Promise.resolve()
      records[id] = { ...records[id], ...changes }
      return persist()
    },
    remove(id) {
      if (!records[id]) return Promise.resolve()
      delete records[id]
      return persist()
    },
  }
}

/** VAPID keys from the environment, or generated once and kept in the data folder. */
export async function loadVapidKeys(dir, env) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, source: 'environment' }
  }
  const file = path.join(dir, 'vapid.json')
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'))
    if (saved.publicKey && saved.privateKey) return { ...saved, source: file }
  } catch {
    /* first run */
  }
  const keys = webpush.generateVAPIDKeys()
  await writeFile(file, JSON.stringify(keys, null, 2))
  return { ...keys, source: `${file} (generated)` }
}
