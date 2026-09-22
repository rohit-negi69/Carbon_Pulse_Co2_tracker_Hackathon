# 🌱 CarbonPulse — Real-Time Carbon Footprint Tracker

**Track:** Climate Tech
**Hackathon ID:** AZIS-74KWR4

Turn daily choices — car trips, flights, meals, electricity — into a visible carbon footprint, in real time, with an AI copilot that tells you what actually moves the number.

> **No authentication.** Graders can reach every feature at the deployed URL without creating an account (the UI shows a "Zero Auth Mode" badge).

---

## ✨ Features

### The five required features
1. **Log an activity** — choose a category (car / bus / flight / electricity / veg meal / non-veg meal), enter quantity, date, and an optional note. The projected CO₂ updates as you type.
2. **CO₂ calculation** — fixed factors applied server-side: **car 0.20 kg/km · bus 0.08 kg/km · flight 0.25 kg/km · electricity 0.80 kg/kWh · veg meal 0.5 kg · non-veg meal 2.0 kg**.
3. **Dashboard** — all-time total, per-category bar chart **and** table, weekly progress bar, daily mean, and the top contributor.
4. **Weekly target** — set any weekly kg CO₂ budget; see a progress ring, pace verdict (ahead / on track / behind), days remaining, and a clear flag when exceeded.
5. **History & filter** — the full ledger with **type** pills, **date** presets (today / this week / last 7 days / month to date / all), free-text search, impact-intensity bands, sorting, CSV export, and delete.

### Beyond the brief
6. **Charts & Insights** — 14-day trend area chart, category donut, weekday profile, GHG-protocol **scope split** (1/2/3), week-over-week delta, persisted **weekly rollups**, and a **reduction modeler** that quantifies a swap before you commit to it.
7. **Alerts & Nudges centre** — server-evaluated nudge feed (budget warnings, pace coaching, over-budget guidance) with an unread badge in the header. Deduplicated per week so it informs without nagging.
8. **Fully real-time (bidirectional WebSocket)** — `ws://…/api/ws` is the primary channel: the server pushes every new entry, deletion, target change and nudge, **and the same socket carries commands back** (`activity.log`, `activity.delete`, `target.set`, `chat.ask`, `simulate`, `insights.get`, `presence.typing`, …), each answering with an ack. Frames are sequence-numbered and buffered, so a dropped connection replays exactly what it missed. An always-on ticker pushes telemetry (events/min, sessions, transport mix) and live **grid carbon intensity**. Degrades WebSocket → SSE → polling automatically, and queues commands issued mid-reconnect. See the **Live Ops** tab.
9. **Audit trail** — every create, delete and target change is appended to `activity_history`, and the ledger exports as CSV/JSON from the server (`/api/export`).
10. **AI Eco-Audit Copilot** — a hybrid AI layer:
   - **Chat that reads your live ledger:** *"what's my footprint?"*, *"which category is worst?"*, *"how is my weekly progress?"*
   - **Logs activities from natural language:** *"I drove 15 km"* → entry created, dashboard and audit refreshed instantly.
   - **Diagnostic audit:** hotspot attribution, week-end projection at current pace, dietary/transit swap suggestions, and a prioritised "next best action".
   - **Hybrid by design:** the rule-based engine always works with **zero API keys**; setting `OPENAI_API_KEY` upgrades the same endpoints to LLM-written replies.

## 🎨 Interface

The UI is built to be demo-grade on a projector and readable on a phone:

- **One token set, two themes.** Every colour is a CSS variable, so toggling `class="dark"` on `<html>` re-themes the entire app — charts included — with no component branching. The app opens in its signature light theme; the header has a one-tap switch that persists.
- **Motion without a runtime.** ~12 Tailwind keyframes plus a `requestAnimationFrame` counter drive staggered entrances, self-drawing sparklines, pulsing live indicators, drifting ambient orbs and the gradient hero headline. **No animation dependency**, and `prefers-reduced-motion` collapses all of it.
- **Command palette** — `⌘K` / `Ctrl+K` opens grouped, subsequence-matched navigation, actions and copilot prompts with full keyboard control.
- **Award-oriented detail** — radial target gauge with a dashed overflow ring when the budget is crossed, gradient-bordered buttons with glow, shimmer skeletons, animated counters, illustrated empty states, and a fixed mobile dock for thumb navigation.
- **A landing page, not a splash screen.** `/` opens on a hero that streams the live grid intensity and event feed into an illustrated product mock, then walks through a ticker marquee, a bento of the six capabilities with real photography, a how-it-works ladder, the live band, the emission-factor grid and a closing CTA — plus a sticky "enter the dashboard" bar on phones.
- **Photos that fail safe.** `Photo` reserves the space with an aspect ratio, paints a token-driven gradient and pixel grid behind the frame, fades the file in on load and swallows the error event — so a blocked CDN, an offline grader or the preview file still sees a designed panel instead of a broken image.

See **[docs/ui-system.md](docs/ui-system.md)** for the token table, keyframe inventory, component API and the light/dark/mobile audit.

### Offline preview file

The whole UI — landing page, dashboard, every feature — also ships as **one self-contained HTML file**: no backend, no network. `frontend/build-preview.mjs` inlines the production JS, CSS and photos (as base64 data URIs) beside a mocked REST API and a mocked WebSocket, so it opens straight off the filesystem:

```bash
cd frontend
npm run build && node build-preview.mjs     # → frontend/preview.html (single file, zero requests)
```

## 🧱 Architecture

Layered: browser → React frontend → Express API layer (calculation engine, analytics, targets & nudges, AI, real-time hub) → MongoDB + optional external services.

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the full diagram, the calculation flow, the module map, and why this build uses MongoDB + SSE.

```
backend/src/                       frontend/src/
├── config/                       ├── app/App.jsx
├── domain/    factors · week     ├── features/
├── db/        connection         │   ├── dashboard/    dashboard
│   └── repositories/             │   ├── activities/   log activity
├── models/    six collections    │   ├── insights/     charts & insights
├── modules/                      │   ├── targets/      set targets
│   ├── activities/               │   ├── history/      history & filters
│   ├── calculation/  CO₂ engine  │   ├── nudges/       alerts & nudges
│   ├── analytics/                │   └── copilot/      AI copilot
│   ├── targets/                  ├── components/  layout · ui
│   ├── nudges/                   └── lib/         api · useLive
│   ├── copilot/   rules + LLM
│   ├── realtime/  ws · hub · commands · ticks
│   └── health/
├── integrations/  email · carbon · geo
├── middleware/    validate · rate limit · errors
└── test/api.test.js
```

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite, Tailwind CSS (CSS-variable token system with full dark mode), Recharts, hand-rolled SVG charts |
| Backend | Node.js + Express |
| Database | MongoDB via Mongoose, with an automatic in-memory fallback so the app never hard-fails |
| Real-time | Native WebSocket (`/api/ws`, hand-rolled RFC 6455 — no extra dependency) with SSE + polling fallbacks, a sequenced replay buffer and a telemetry ticker |
| AI | Rule-based intent engine + deterministic audit, optional OpenAI upgrade |

## 🚀 Run locally

Prerequisites: Node 18+.

```bash
# 0) Tests (optional but recommended)
cd backend && npm install && npm test    # 65 tests (API, SSE replay, WebSocket commands, GPS trip tracking, ML), node:test — no extra deps

# 1) Backend  (terminal 1)
cd backend
npm install
npm run dev            # http://localhost:3001   (optionally: MONGODB_URI="mongodb+srv://..." npm run dev)
#                      # API docs: http://localhost:3001/api/docs

# 2) Frontend (terminal 2)
cd frontend
npm install
npm run dev            # http://localhost:5173  (proxies /api → :3001)
```

Open **http://localhost:5173**. No environment variables are required to use every feature.

To enable the optional LLM upgrade, add a `backend/.env`:

```
MONGODB_URI=mongodb+srv://user:pass@cluster/carbonpulse
OPENAI_API_KEY=sk-...            # optional — chat + audit get LLM-written replies
OPENAI_MODEL=gpt-4o-mini         # optional
CLIENT_ORIGIN=http://localhost:5173
```

## 🔑 Test credentials

**None required — there is no authentication by design.** Open the URL and every feature is available. If `MONGODB_URI` is unset the server uses its in-memory store (data resets on restart); set the URI for durable data.

## ☁️ Deploy to Vercel (2 projects)

### 1. Backend — root directory `backend/`
1. Push this repo to GitHub, then in Vercel: **Add New → Project → import the repo**.
2. Set **Root Directory** to `backend`.
3. Environment variables:
   - `MONGODB_URI` — MongoDB Atlas connection string
   - `CLIENT_ORIGIN` — the frontend URL (for CORS)
   - `OPENAI_API_KEY` — *optional*
4. Deploy and note the URL, e.g. `https://carbonpulse-api.vercel.app`.

### 2. Frontend — root directory `frontend/`
1. **Add New → Project → import the same repo**, set **Root Directory** to `frontend`.
2. Add `VITE_API_URL` = `https://carbonpulse-api.vercel.app/api`.
3. Deploy — share **this** URL as the submission link.

> SSE works on Vercel Node functions; if a proxy buffers the stream the client automatically falls back to polling, so the UI stays live either way.

### MongoDB Atlas (free tier)
1. Create a free cluster at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Database Access → add a user; Network Access → allow `0.0.0.0/0` (Vercel uses dynamic IPs).
3. Copy the connection string into `MONGODB_URI`.

## 📡 API summary

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` · `/api/docs` · `/api/services` | Status, route table, external-provider status |
| GET | `/api/factors` | Fixed emission factors + absurd-input thresholds |
| POST | `/api/calculate` | Stateless CO₂ calculation (no write) |
| POST | `/api/simulate` | What-if swap simulator (`fromType`, `toType`, `quantity`) |
| GET | `/api/insights` | Trend, weekday profile, category mix, scope split, rollups |
| GET | `/api/export` | CSV/JSON ledger export (`?format=csv\|json`) |
| GET | `/api/history` | Audit trail of every ledger mutation |
| GET / POST | `/api/nudges` · `/api/nudges/read` | Alerts & nudges feed |
| POST | `/api/activities` | Log activity (`type`, `quantity`, `date?`, `notes?`, `confirmed?`) — `422` asks for confirmation on absurd input |
| GET | `/api/activities` | List with filters `type`, `from`, `to` (YYYY-MM-DD), `q`, `tier` |
| DELETE | `/api/activities/:id` | Delete an entry |
| GET | `/api/dashboard` | Total, per-category breakdown, daily mean, top contributor, week snapshot |
| GET | `/api/week` | Week window, usage, %, pace, exceeded flag |
| GET / PUT | `/api/target` | Read / set the weekly target |
| GET | `/api/ai/audit` | AI audit insights + projection (`?llm=1` to request LLM polish) |
| POST | `/api/chat` | Hybrid copilot (`message`, `history?`) — can log activities |
| WS | `/api/ws` | **Primary real-time channel.** Server pushes `hello`, `snapshot`, `activity`, `deleted`, `target`, `nudge`, `presence`, `typing`, `telemetry`, `grid`; client sends `{ id, cmd, payload }` and receives `{ kind: 'ack' }` / `{ kind: 'stream' }` |
| GET | `/api/realtime` | Transport descriptor: socket commands, events, replay/heartbeat lifecycle |
| GET | `/api/stream` | Server-Sent Events fallback (same frames, same sequence ids) |
| GET | `/api/stream/state` | Metrics + presence + snapshot in one request (polling fallback) |
| GET | `/api/telemetry` | Connection, event-rate and ticker metrics |
| GET | `/api/health` | `{ ok, db, llm, realtime, clients }` |

### Socket commands (`/api/ws`)

```jsonc
// client → server
{ "id": "c1", "cmd": "activity.log", "payload": { "type": "car", "quantity": 12 } }
// server → client  (streaming replies emit { kind: "stream" } frames first)
{ "kind": "ack", "id": "c1", "ok": true, "data": { "activity": {…}, "co2": 2.4 } }
```

`ping` · `stats.get` · `activity.log` · `activity.delete` · `activity.list` · `target.set` · `chat.ask` · `insights.get` · `simulate` · `audit.get` · `nudges.get` · `presence.typing` · `session.describe`

**Standard API for track:** ❌ Not implemented for the Climate Tech track — CarbonPulse exposes its own documented REST API **plus a documented bidirectional WebSocket API**, and is designed to be graded by either a browser agent driving the UI or a script driving the socket/REST endpoints directly.

## 🎥 Demo

`demo.mp4` (3–4 min) walks through, in order: logging activities → CO₂ calculation → dashboard → weekly target and exceed behaviour → history filters → the AI copilot, plus each Decision Point behaviour from [DECISIONS.md](DECISIONS.md).

## 📁 Project structure

See [ARCHITECTURE.md](ARCHITECTURE.md) for the annotated tree. In short: the backend is a modular monolith (`backend/src/modules/*` — one folder per capability in the architecture diagram) over a repository-based data layer, and the frontend is feature-sliced (`frontend/src/features/*`) with one folder per diagram tile.

```
backend/src/modules/   activities · calculation · analytics · targets · nudges · copilot · realtime · health
frontend/src/features/  dashboard · activities · insights · targets · history · nudges · copilot · realtime

Real-time runbook: open the app in two tabs and watch the `Live Ops` tab — sessions, latency, sequence ids and the
command console are all live. `curl -N http://localhost:3001/api/stream` prints the same frames as raw SSE, and
`curl http://localhost:3001/api/realtime` lists the socket protocol.
```

| Root file | Purpose |
|---|---|
| `ARCHITECTURE.md` | Layered architecture, calculation flow, module map |
| `DECISIONS.md` | DP1 · nudge, DP2 · absurd input, DP3 · the week |
| `docs/ui-system.md` | Implemented UI system — tokens, dark mode, motion, primitives |
| `docs/design-system.md` | Original CarbonPulse brand sheet (tokens and component rules) |
