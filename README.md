# 🌱 CarbonPulse — Real-Time Carbon Footprint Tracker

**Track:** Climate Tech
**Hackathon ID:** `PASTE_YOUR_HACKATHON_ID_HERE` ⚠️ *replace this with your real ID before submitting — a missing or mismatched ID disqualifies the entry.*

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
6. **Real-time sync (SSE)** — `GET /api/stream` pushes every new entry, deletion, and target change to all open sessions. The header shows a live session count and the dashboard flashes an update banner. Falls back to polling automatically.
7. **AI Eco-Audit Copilot** — a hybrid AI layer:
   - **Chat that reads your live ledger:** *"what's my footprint?"*, *"which category is worst?"*, *"how is my weekly progress?"*
   - **Logs activities from natural language:** *"I drove 15 km"* → entry created, dashboard and audit refreshed instantly.
   - **Diagnostic audit:** hotspot attribution, week-end projection at current pace, dietary/transit swap suggestions, and a prioritised "next best action".
   - **Hybrid by design:** the rule-based engine always works with **zero API keys**; setting `OPENAI_API_KEY` upgrades the same endpoints to LLM-written replies.

## 🧱 Architecture

Layered: browser → React frontend → Express API layer (calculation engine, analytics, targets & nudges, AI, real-time hub) → MongoDB + optional external services.

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the full diagram, the calculation flow, and why this build uses MongoDB + SSE.

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite, Tailwind CSS (CarbonPulse design system), Recharts |
| Backend | Node.js + Express |
| Database | MongoDB via Mongoose, with an automatic in-memory fallback so the app never hard-fails |
| Real-time | Server-Sent Events (`/api/stream`) |
| AI | Rule-based intent engine + deterministic audit, optional OpenAI upgrade |

## 🚀 Run locally

Prerequisites: Node 18+.

```bash
# 1) Backend  (terminal 1)
cd server
npm install
npm run dev            # http://localhost:3001   (optionally: MONGODB_URI="mongodb+srv://..." npm run dev)

# 2) Frontend (terminal 2)
cd client
npm install
npm run dev            # http://localhost:5173  (proxies /api → :3001)
```

Open **http://localhost:5173**. No environment variables are required to use every feature.

To enable the optional LLM upgrade, add a `server/.env`:

```
MONGODB_URI=mongodb+srv://user:pass@cluster/carbonpulse
OPENAI_API_KEY=sk-...            # optional — chat + audit get LLM-written replies
OPENAI_MODEL=gpt-4o-mini         # optional
CLIENT_ORIGIN=http://localhost:5173
```

## 🔑 Test credentials

**None required — there is no authentication by design.** Open the URL and every feature is available. If `MONGODB_URI` is unset the server uses its in-memory store (data resets on restart); set the URI for durable data.

## ☁️ Deploy to Vercel (2 projects)

### 1. Backend — root directory `server/`
1. Push this repo to GitHub, then in Vercel: **Add New → Project → import the repo**.
2. Set **Root Directory** to `server`.
3. Environment variables:
   - `MONGODB_URI` — MongoDB Atlas connection string
   - `CLIENT_ORIGIN` — the frontend URL (for CORS)
   - `OPENAI_API_KEY` — *optional*
4. Deploy and note the URL, e.g. `https://carbonpulse-api.vercel.app`.

### 2. Frontend — root directory `client/`
1. **Add New → Project → import the same repo**, set **Root Directory** to `client`.
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
| GET | `/api/factors` | Fixed emission factors + absurd-input thresholds |
| POST | `/api/activities` | Log activity (`type`, `quantity`, `date?`, `notes?`, `confirmed?`) — `422` asks for confirmation on absurd input |
| GET | `/api/activities` | List with filters `type`, `from`, `to` (YYYY-MM-DD), `q`, `tier` |
| DELETE | `/api/activities/:id` | Delete an entry |
| GET | `/api/dashboard` | Total, per-category breakdown, daily mean, top contributor, week snapshot |
| GET | `/api/week` | Week window, usage, %, pace, exceeded flag |
| GET / PUT | `/api/target` | Read / set the weekly target |
| GET | `/api/ai/audit` | AI audit insights + projection (`?llm=1` to request LLM polish) |
| POST | `/api/chat` | Hybrid copilot (`message`, `history?`) — can log activities |
| GET | `/api/stream` | **Real-time SSE** stream of `activity`, `deleted`, `target` events |
| GET | `/api/health` | `{ ok, db, llm, realtime, clients }` |

**Standard API for track:** ❌ Not implemented — CarbonPulse exposes its own documented REST API plus an SSE stream, and is designed to be graded by a browser agent driving the UI.

## 🎥 Demo

`demo.mp4` (3–4 min) walks through, in order: logging activities → CO₂ calculation → dashboard → weekly target and exceed behaviour → history filters → the AI copilot, plus each Decision Point behaviour from [DECISIONS.md](DECISIONS.md).

## 📁 Project structure

```
client/                React app (CarbonPulse design system)
  src/components/      Layout, Dashboard, LogActivity, WeeklyTarget, History, Copilot, ui
  src/hooks/useLive.js SSE subscription with polling fallback
server/                Express API
  index.js             routes, SSE stream, real-time broadcasts
  factors.js           fixed emission factors (single source of truth)
  week.js              Monday-start week + pace helpers
  db.js                MongoDB with in-memory fallback
  events.js            SSE client hub
  chat/                engine.js (rules) · llm.js (optional OpenAI) · ai.js (audit)
ARCHITECTURE.md        layered architecture + calculation flow
DECISIONS.md           DP1 · nudge, DP2 · absurd input, DP3 · the week
```
