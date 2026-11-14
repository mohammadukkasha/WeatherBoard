# WeatherBoard

An installable weather dashboard: search any city, see current conditions, the next 24 hours and a 5-day forecast, keep up to five favourite cities, and get a daily morning reminder that arrives even when the app is closed. Works offline for the last city you viewed.

**Live app:** _add your Vercel URL here_

Built with **React 19, Tailwind CSS 4 and Vite 8** (front end) and a small **Node.js + Express** service for Web Push (back end). Both deploy as **one Vercel project**: the app at `/`, the push API as a serverless function at `/api`.

---

## Features

| # | Requirement | How it's done |
|---|---|---|
| 01 | City search with autocomplete | ARIA combobox (arrow keys, Enter, Escape). 120 ms debounce + pre-warmed connections keep suggestions under the 300 ms budget (geocoding answers in ~150 ms); cached prefixes ("lah" → "laho") show instantly. GeoDB Cities is the primary source; on a 429/401/outage, that keystroke falls back to Open-Meteo Geocoding. Distinct loading, no-results and error (with **Try again**) states. |
| 02 | Weather data | Current temperature, feels-like, humidity, wind (speed + direction), sunrise/sunset, condition icon; next 24 h in 3-hour steps; 5-day forecast. OpenWeatherMap first, **Open-Meteo fallback** on rate limit, bad key, outage or missing key — the card says which source answered and why it switched. Skeleton while loading; specific error + Retry if it fails. |
| 03 | Form validation | Search validates on blur (empty, < 2 letters, digits/symbols, too long) and shows invalid characters immediately; after the first error it re-validates as you type. Submitting with no match says *"No cities match 'X'. Check the spelling, or try a larger city nearby."* Network/timeout/rate-limit errors each have their own message and next step. The reminder form validates time and city on blur and submit. |
| 04 | Favourite cities | Up to 5, in `localStorage`, synced across tabs, with live temperatures (one batched Open-Meteo request). Removal goes through an accessible confirmation dialog (native `<dialog>`, Cancel focused by default). A 6th city shows an inline explanation. If storage is blocked (private mode, full quota) favourites still work for the tab and the panel explains they won't persist. |
| 05 | PWA | Manifest (name, 192/512 + maskable icons, `theme_color`, `display: standalone`), custom Workbox service worker precaching the app shell. Weather responses use **network-first** caching; cached copies are stamped with their fetch time so offline data is labelled *"Saved data from Sat 7:34 AM"*, never shown as live. Last forecast also kept in IndexedDB as a second fallback. An **Offline mode** banner appears when the connection drops, and the weather refreshes automatically when it returns. Install button (where the browser offers one) and an update prompt for new versions. |
| 06 | Push notifications | Daily reminder at a time and city you choose. The card **explains what you'll get before the browser's permission prompt**. With the push server configured, a real **Web Push** (VAPID) is sent at your local time — it arrives with the tab and app closed. The notification includes live weather ("18° and clear sky right now. High 27°, low 17°.") and opens the app on that city. **Test** button. Clear fallbacks for unsupported browsers (with iOS "Add to Home Screen" guidance) and blocked permission (how to re-enable); nothing else is affected. |
| 07 | Responsive | Checked at 375, 768 and 1280 px with no horizontal scroll. Interactive targets are ≥ 44×44 px. Phones/tablets get a quick-access favourites row above the weather; desktop has a sticky sidebar. |
| Bonus | Dark/light mode | System / Light / Dark, follows OS changes live, applied before first paint (no flash). |
| Bonus | °C / °F | Persisted, instant (data is stored metric and converted at render). Wind switches km/h ↔ mph. Defaults to °F only in US time zones. |
| Bonus | Animated icons | Hand-drawn SVG icons with CSS animation (spinning sun rays, drifting clouds, falling rain/snow, lightning). Respects `prefers-reduced-motion`. Bundled, so they work offline. |

## Getting started

Requires Node.js 20.12+.

```bash
npm install
npm run dev            # http://localhost:5173
```

The app works with **no API keys** (Open-Meteo needs none). To use the primary providers, copy `.env.example` to `.env.local` and fill in:

| Variable | Where to get it |
|---|---|
| `VITE_OWM_API_KEY` | [openweathermap.org](https://home.openweathermap.org/api_keys) (free; new keys take up to ~2 h to activate) |
| `VITE_GEODB_API_KEY` | [GeoDB Cities on RapidAPI](https://rapidapi.com/wirefreethought/api/geodb-cities) (subscribe to the free BASIC plan) |
| `VITE_PUSH_SERVER_URL` | Local dev: `http://localhost:8787`. Production builds default to the same origin (`/api`), so leave it unset on Vercel; `off` disables server push. |

Production build / PWA check: `npm run build && npm run preview` (http://localhost:4173). The service worker is enabled in dev too, but test offline behaviour on the preview build.

### Push server (Node.js)

```bash
cd server
npm install
cp .env.example .env    # optional locally: VAPID keys are generated on first run
npm start               # http://localhost:8787
```

Then set `VITE_PUSH_SERVER_URL=http://localhost:8787` in the front end's `.env.local` and restart Vite.

| Endpoint | Purpose |
|---|---|
| `GET /api/push/public-key` | VAPID public key for `pushManager.subscribe` |
| `PUT /api/push/subscriptions` | Create/update this device's reminder: `{ subscription, time: "07:30", timezone: "Asia/Karachi", city }` |
| `DELETE /api/push/subscriptions` | Remove it: `{ endpoint }` |
| `POST /api/push/test` | Send a test notification now: `{ endpoint }` |
| `GET` or `POST /api/cron/tick` | Sends due reminders; called every minute on serverless hosts (needs `Authorization: Bearer $CRON_SECRET`) |
| `GET /api/health` | Health check |

## Architecture

```
src/
  services/      http.js (typed ApiError, timeouts, cache-hit metadata)
                 weather.js (OpenWeatherMap → Open-Meteo, normalised model)
                 geo.js (GeoDB → Open-Meteo geocoding, prefix cache)
                 conditions.js (both providers → one set of 8 conditions)
  hooks/         useWeather, useCitySearch, useFavourites, useReminder, useQuickTemps, …
  lib/           storage.js (safe localStorage), kv.js (IndexedDB), reminder.js
                 (shared by page + service worker), push.js, errors.js, format.js
  components/    CitySearch, CurrentWeather, HourlyForecast, DailyForecast,
                 Favourites, ReminderCard, ConfirmDialog, Banners, States, …
  sw.js          Workbox precache, weather caching, push / periodicsync / notificationclick
server/          app.js (Express routes), store.js (Upstash Redis or JSON file),
                 scheduler.js (timezone-aware sending), index.js (local always-on server)
api/index.js     Vercel serverless entry: the same Express app, Redis-backed
```

**Key decisions**

- **One normalised weather model.** Both providers map to the same shape (metric units, unix ms times, one condition vocabulary), so the UI never branches on the source and switching providers is invisible except for the "via" label.
- **Fallback that explains itself.** A 429 from OpenWeatherMap pauses it for 60 s; a 401 (invalid/inactive key) pauses it for the session, so we don't hammer a failing API. The UI states *"OpenWeatherMap rate-limited, so we switched sources."* When both fail, the most useful error wins (offline > timeout > network > rate-limit …).
- **Errors are typed, not strings.** `fetchJSON` turns every failure into an `ApiError` with a `kind` (offline, timeout, network, rate-limit, auth, not-found, server, bad-response). Each kind maps to a message saying what failed and what to do; nothing says "Something went wrong".
- **Honest offline data.** The service worker re-stamps each cached weather response with `x-wb-cached-at` (and the CORS headers needed to read it). The page reads that header, so data served from cache always shows its real age.
- **IndexedDB for anything the service worker needs** (reminder settings, unit preference, last snapshot); it can't read `localStorage`. UI-only state (favourites, theme, last city) stays in `localStorage` behind a wrapper that degrades to memory.
- **Reminders need a server to be reliable.** Browsers can't schedule a notification for a future time with the tab closed — the old Notification Triggers API was abandoned. So the server is the clock: it stores each subscription with an IANA time zone, ticks every 30 s, and sends a push at the person's local time (catching up to 60 min late if the host slept). The push only says *"daily reminder for city X"*; the service worker fetches live weather itself, in the user's units, falling back to the last snapshot. Without a server, the app falls back to **Periodic Background Sync** (installed Chromium apps) plus an in-app check, and says that timing is best-effort.
- **Server hardening.** Strict input validation with descriptive 400s, push endpoints restricted to real push services (FCM, Mozilla, WNS, Apple) to prevent SSRF, 16 KB body limit, CORS allow-list, expired subscriptions (404/410) pruned automatically, atomic JSON writes.
- **Design.** Calm neutral palette with one blue accent and condition-tinted glow on the hero; Inter with tabular numbers; data hierarchy: temperature → condition → details. Temperature range bars colour-coded on an absolute scale so a warm week looks warm. Empty, loading and error states are first-class (skeletons, not spinners).

## APIs used

- [OpenWeatherMap](https://openweathermap.org/api) — Current Weather + 5 day / 3 hour Forecast (primary, key required)
- [Open-Meteo Forecast](https://open-meteo.com/en/docs) — fallback weather, favourites' live temperatures (no key)
- [GeoDB Cities](https://rapidapi.com/wirefreethought/api/geodb-cities) via RapidAPI — city autocomplete (primary, key required)
- [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) — autocomplete fallback (no key)
- Web Push (VAPID) + Notifications API, Periodic Background Sync, Service Worker / Cache Storage, IndexedDB

## Deployment

Front end and push API deploy together to **Vercel** (`vercel.json` sets the Vite build and rewrites `/api/*` to `api/index.js`):

1. **Import** the GitHub repo at [vercel.com/new](https://vercel.com/new) and deploy (defaults are fine).
2. **Storage:** project → *Storage* → *Upstash for Redis* (free) → connect it to the project. This adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`; serverless functions have no persistent disk, so subscriptions live in Redis.
3. **Environment variables:** `CRON_SECRET` (any long random string), optionally `VITE_OWM_API_KEY` and `VITE_GEODB_API_KEY`. VAPID keys are generated on first use and kept in Redis; set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (from `npm --prefix server run vapid`) if you prefer to manage them. Redeploy.
4. **Scheduler:** Vercel's Hobby plan only runs cron jobs once a day, so have [cron-job.org](https://cron-job.org) (free) call `https://<your-app>/api/cron/tick` **every minute** with header `Authorization: Bearer <CRON_SECRET>`. On Vercel Pro you can use a `* * * * *` Vercel Cron instead (it sends the same header).

The long-running server in `server/` (`npm start`) still works on any always-on Node host and needs no cron: it has its own 30-second timer and uses a JSON file unless Redis variables are set.

## Known limitations

- **API keys are visible in the client bundle.** The brief asks for a client-only app; keys are free-tier and restricted by quota. A production version would proxy them through the server.
- **GeoDB's free tier allows ~1 request/second**, so fast typing often falls back to Open-Meteo Geocoding (the dropdown says which source answered).
- **OpenWeatherMap's free forecast is 3-hourly**, so its daily highs/lows are computed from 3-hour samples and can differ by a degree from Open-Meteo's true daily extremes.
- **Reminder timing depends on the external cron.** On Vercel Hobby, reminders go out when cron-job.org calls `/api/cron/tick` (every minute). If it misses calls, a reminder is still sent up to 60 minutes late, then skipped for that day; each reminder is claimed in Redis first, so overlapping calls never send it twice.
- **Without the push server**, reminders depend on Periodic Background Sync (Chrome/Edge, installed app, browser-controlled timing) or on the app being open. Firefox and Safari don't support Periodic Background Sync.
- **iOS** only allows web notifications for apps added to the Home Screen (iOS 16.4+); the reminder card explains this.
- Times in the forecast are shown in the **city's** local time; reminder times use the **device's** time zone.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (service worker enabled) |
| `npm run build` | Production build + service worker |
| `npm run preview` | Serve the production build |
| `npm run icons` | Regenerate PWA icons from `public/logo.svg` |
| `npm run server` | Start the push server |
