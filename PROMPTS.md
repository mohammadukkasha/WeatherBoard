# Prompt history

**IDE / agent used:** Claude Code (Anthropic), desktop app — model Claude Opus 5.5.

> Note: the brief lists Cursor, Antigravity or OpenCode. This project was built with Claude Code, an agentic coding tool that works the same way (the agent reads the brief, plans, writes and runs code, and drives a browser to verify it).

Prompts are listed in order, verbatim (Roman Urdu), with an English translation and a summary of what the agent did.

---

### 1. Kick-off

> *(attached: `Edspire-Frontend-Technical-Challenge.pdf`)*
> yeh banana ha or language react.js or tailwand.css pa banana ha or agar backend ho toh woh node.js pa

*Translation:* "Build this. Use React.js and Tailwind CSS, and if there's a backend, use Node.js."

**Strategy behind the prompt:** give the agent the full brief as the source of truth and constrain only the stack. Requirements, acceptance criteria and edge cases are already in the PDF, so restating them would only add room for drift.

**What the agent did:** read the PDF, mapped every requirement (01–07 + bonus) to a plan, scaffolded Vite + React 19 + Tailwind 4 + vite-plugin-pwa (injectManifest) and generated the PWA icons.

### 2. Workspace conflict

A second agent session had been started on the same folder by mistake, and both were writing files. The agent noticed (another process was changing `package.json` during `npm install`), stopped, and asked where to build.

> D:\adil\hackaton\WeatherBoard is folder ma krna ha

*Translation:* "Do it in the D:\adil\hackaton\WeatherBoard folder."

### 3. Continue as the only session

> ab kro mena baqi sara session delete krdea hn

*Translation:* "Now do it — I've deleted all the other sessions."

**What the agent did:** reviewed the partial scaffold left in the folder (data layer, service worker, design tokens), kept what was sound, and built the rest:

- UI: search combobox, current conditions, hourly strip, 5-day forecast with range bars, favourites (panel + mobile quick chips), confirmation dialog, reminder card, offline/update banners, empty/loading/error states.
- Reminders: decided a **Node push server** was needed because browsers can't schedule a notification for later with the tab closed. Built it with Express + web-push: VAPID, IANA time zones, a 30 s scheduler with catch-up, SSRF allow-list and input validation.
- Offline: service-worker cache stamping, so offline data is labelled with its real age.

---

## Where the AI output needed fixing

These were caught by running the app in a real browser (dev + production build, Playwright for offline/push) and fixed:

| Problem found | Fix |
|---|---|
| Units defaulted to **°F** because the browser language was `en-US` — the default install language far outside the US. | Default from the **time zone** instead (°F only for US zones). |
| Debounce of 200 ms + ~150 ms geocoding latency broke the brief's **300 ms** budget. | Measured real latency, cut the debounce to 120 ms, added `preconnect` hints and an instant prefix cache. |
| Choosing a city with **Enter** showed *"Enter a city name to search."* — the blur handler ran with stale state after the field was cleared. | Blur before resetting state. |
| A stray focus ring on the search input: global CSS was **unlayered**, so it beat Tailwind utilities. | Moved base styles into `@layer base`. |
| For one render after switching city, the **old city's temperature** appeared with the new name (visible in the tab title). | `useWeather` ignores state that belongs to a different city key. |
| Network-first caching would serve **old weather as "Updated just now"** when offline. | Service worker stamps cached responses (`x-wb-cached-at` + CORS expose header); UI shows "Saved data from …". |
| "Now" in the hourly strip was sometimes the next hour's slot. | Start from the current hour; only label "Now" when it really is. |
| A missed reminder could fire hours late (e.g. a "Good morning" at night). | 3-hour lateness window (client) / 60-minute catch-up (server). |
| Turning the reminder on after today's time would fire **immediately**. | First reminder is tomorrow when today's time has passed (client and server). |
| "5 favourites max" notice followed you to the next city. | Card is keyed by city. |
| Tablet (768 px): favourites squeezed into two columns, names cut to "K…". | One column from `md` up. |
| °C/°F buttons were 40×40 px (below the 44 px minimum). | 44 px targets; header controls aligned. |
| `web-push` v4 has no default export — the server crashed on start. | Namespace import. |

## Verification performed

- Search: suggestions, keyboard selection, no-results, invalid characters (live), too-short and empty (on blur), submit with no match.
- Favourites: add 5, 6th blocked with explanation, remove → confirm dialog (Escape cancels, Remove removes), persisted in `localStorage`.
- Responsive: 375 / 768 / 1280 px, no horizontal scroll, touch targets measured.
- PWA (production build): service worker active and controlling, manifest valid, Chrome offers Install; **offline reload shows the last city with the "Offline mode" banner and "Saved data from …".**
- Push: real FCM subscription created, stored by the Node server; **Test** delivered *"Preview · Good morning — Lahore today — 18° and clear sky right now. High 27°, low 17°."*; scheduled reminder tested with no app tab open.
