// Subscription storage with two interchangeable backends (all methods async):
//  - Redis via Upstash's REST API: used on Vercel, where the filesystem is
//    read-only and every request may hit a different function instance.
//  - A JSON file: zero-setup local development on one long-running process.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import * as webpush from 'web-push'

export const idFor = (endpoint) => createHash('sha256').update(endpoint).digest('hex').slice(0, 32)

/** Redis when Upstash credentials are present (Vercel Marketplace names or Upstash's own), else a JSON file. */
export function createStoreFromEnv(env) {
  // Vercel's Upstash integration names them KV_REST_API_URL/TOKEN, optionally
  // with a custom prefix (e.g. MYDB_KV_REST_API_URL); Upstash's own docs use
  // UPSTASH_REDIS_REST_URL/TOKEN.
  const urlKey =
    ['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL'].find((k) => env[k]) ||
    Object.keys(env).find((k) => /(KV_REST_API|REDIS_REST)_URL$/.test(k) && env[k])
  const url = urlKey && env[urlKey]
  const token = urlKey && env[urlKey.replace(/URL$/, 'TOKEN')]
  if (url && token) return createRedisStore({ url, token })
  if (env.VERCEL) {
    throw new Error(
      'No Redis store configured. In Vercel, open Storage → Upstash for Redis, connect it to this project and redeploy ' +
        '(it sets KV_REST_API_URL and KV_REST_API_TOKEN).',
    )
  }
  return createFileStore(env.DATA_DIR || './data')
}

// ---------------------------------------------------------------- Redis ----

const SUBS = 'wb:subs' // hash: id -> JSON record
const VAPID = 'wb:vapid'

export function createRedisStore({ url, token }) {
  const base = url.replace(/\/+$/, '')
  async function redis(...command) {
    const res = await fetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) throw new Error(`Redis ${command[0]} failed: ${data.error || res.status}`)
    return data.result
  }
  const parse = (raw) => (raw ? JSON.parse(raw) : undefined)

  return {
    kind: 'redis',
    idFor,
    async all() {
      const flat = (await redis('HGETALL', SUBS)) || []
      const out = []
      for (let i = 1; i < flat.length; i += 2) out.push(JSON.parse(flat[i]))
      return out
    },
    get: async (id) => parse(await redis('HGET', SUBS, id)),
    count: async () => Number(await redis('HLEN', SUBS)) || 0,
    upsert: (record) => redis('HSET', SUBS, record.id, JSON.stringify(record)),
    async patch(id, changes) {
      const current = parse(await redis('HGET', SUBS, id))
      if (current) await redis('HSET', SUBS, id, JSON.stringify({ ...current, ...changes }))
    },
    remove: (id) => redis('HDEL', SUBS, id),
    /** true for exactly one caller per key until it expires: dedupes sends across instances, rate-limits tests. */
    claim: async (key, ttlSeconds) => (await redis('SET', `wb:claim:${key}`, '1', 'NX', 'EX', String(ttlSeconds))) === 'OK',
    getVapid: async () => parse(await redis('GET', VAPID)),
    async saveVapid(keys) {
      // NX: if two cold starts race, both end up with whichever keys were saved first.
      await redis('SET', VAPID, JSON.stringify(keys), 'NX')
      return parse(await redis('GET', VAPID))
    },
  }
}

// ----------------------------------------------------------------- File ----

export async function createFileStore(dir) {
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, 'subscriptions.json')
  const vapidFile = path.join(dir, 'vapid.json')
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
  const claims = new Map()

  return {
    kind: `file (${dir})`,
    idFor,
    all: async () => Object.values(records),
    get: async (id) => records[id],
    count: async () => Object.keys(records).length,
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
    async claim(key, ttlSeconds) {
      const now = Date.now()
      if ((claims.get(key) || 0) > now) return false
      claims.set(key, now + ttlSeconds * 1000)
      return true
    },
    async getVapid() {
      try {
        return JSON.parse(await readFile(vapidFile, 'utf8'))
      } catch {
        return undefined
      }
    },
    async saveVapid(keys) {
      await writeFile(vapidFile, JSON.stringify(keys, null, 2))
      return keys
    },
  }
}

// ---------------------------------------------------------------- VAPID ----

/** VAPID keys from the environment, else generated once and kept in the store. */
export async function loadVapidKeys(store, env) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, source: 'environment' }
  }
  const saved = await store.getVapid()
  if (saved?.publicKey && saved?.privateKey) return { ...saved, source: `${store.kind} store` }
  const keys = await store.saveVapid(webpush.generateVAPIDKeys())
  return { ...keys, source: `${store.kind} store (generated)` }
}
