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
  if (url && token) return createRedisStore(upstashRest(url, token))
  // Any Redis over TCP: Vercel's "Redis" (Redis Cloud) store sets REDIS_URL;
  // Upstash also sets KV_URL / REDIS_URL.
  const tcpKey =
    ['REDIS_URL', 'KV_URL'].find((k) => env[k]) ||
    Object.keys(env).find((k) => /(REDIS|KV)_URL$/.test(k) && /^rediss?:\/\//.test(env[k] || ''))
  if (tcpKey) return createRedisStore(redisTcp(env[tcpKey]))
  if (env.VERCEL) {
    const seen = Object.keys(env).filter((k) => /REDIS|KV_|UPSTASH/.test(k))
    throw new Error(
      'No Redis store configured. In Vercel, open Storage, create a Redis database (Upstash or Redis), connect it to ' +
        `this project and redeploy. Redis-related variables found: ${seen.length ? seen.join(', ') : 'none'}.`,
    )
  }
  return createFileStore(env.DATA_DIR || './data')
}

// ---------------------------------------------------------------- Redis ----

const SUBS = 'wb:subs' // hash: id -> JSON record
const VAPID = 'wb:vapid'

/** Upstash's REST API: one HTTPS request per command, ideal for serverless. */
function upstashRest(url, token) {
  const base = url.replace(/\/+$/, '')
  return async (...command) => {
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
}

/** Plain Redis over TCP/TLS, one connection reused per function instance. */
function redisTcp(url) {
  let client
  return async (...command) => {
    if (!client) {
      const { createClient } = await import('redis')
      const c = createClient({ url, socket: { connectTimeout: 5000, reconnectStrategy: (n) => (n > 2 ? false : 200) } })
      c.on('error', (err) => console.error('[redis]', err.message))
      client = c.connect().then(() => c)
      client.catch(() => (client = undefined))
    }
    return (await client).sendCommand(command.map(String))
  }
}

export function createRedisStore(redis) {
  const parse = (raw) => (raw ? JSON.parse(raw) : undefined)

  return {
    kind: 'redis',
    idFor,
    async all() {
      const flat = (await redis('HGETALL', SUBS)) || []
      if (!Array.isArray(flat)) return Object.values(flat).map((v) => JSON.parse(v)) // RESP3-style map
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
