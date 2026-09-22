# CarbonPulse — System Architecture

Track. Understand. Reduce. A cleaner tomorrow.

```
┌──────────────────────┐      HTTPS       ┌────────────────────────────────────────────────┐
│  User (Web / Mobile) │ ───────────────▶ │  Frontend — React + Vite + Tailwind            │
│  Responsive browser  │ ◀─────────────── │  Dashboard · Log Activity · Charts & Insights  │
│  (no login required) │  JSON + WS       │  Set Targets · History & Filters · Alerts      │
└──────────────────────┘                  └───────────────────┬────────────────────────────┘
                                                              │ REST (JSON) + WebSocket (events + commands)
                                                              ▼
                    ┌───────────────────────────────────────────────────────────────────────┐
                    │  Backend API layer — Node.js + Express  (modular monolith)            │
                    │  modules/activities      activity management + audit trail            │
                    │  modules/calculation     CO₂ calculation engine (factor lookup)       │
                    │  modules/analytics       analytics & aggregation (dashboard, trends)  │
                    │  modules/targets         weekly target                                 │
                    │  modules/nudges          weekly target nudges + alerts                │
                    │  modules/copilot         chatbot + AI audit                           │
                    │  modules/realtime        ws · hub · commands · ticks (live in + out)   │
                    │  modules/health          health, docs, service discovery              │
                    └───────────┬───────────────────────────────────────┬───────────────────┘
                                │                                       │
                                ▼                                       ▼
        ┌───────────────────────────────────────────┐   ┌──────────────────────────────────────┐
        │  Database — MongoDB (Mongoose)            │   │  External services (all optional)    │
        │  collections:                             │   │  integrations/email.js      Resend   │
        │   activities          activity_history    │   │  integrations/carbonData.js grid mix │
        │   emission_factors    notifications       │   │  integrations/geo.js        distance │
        │   weekly_targets      analytics_summary   │   │  copilot/llm.js             OpenAI   │
        │  + in-memory fallback store               │   │  (self-reporting via /api/services)  │
        └───────────────────────────────────────────┘   └──────────────────────────────────────┘
```

## High-level flow

1. User logs an activity (e.g. car travel, 10 km) from the UI.
2. Frontend sends it to `POST /api/activities`.
3. The backend fetches the emission factor, computes `CO₂ = quantity × factor`, and applies the sanity check.
4. The activity is stored in MongoDB and appended to the `activity_history` audit trail.
5. The backend publishes the change on the real-time bus; every open session — dashboard, charts, history, copilot — updates live over WebSocket (SSE/polling fallback), no refetching.
6. The same socket accepts *commands* back (`activity.log`, `target.set`, `chat.ask`, `simulate`, …), so a client can drive the whole app over one connection.

## CO₂ calculation flow

```
Activity input (type, quantity)
      │
      ▼
Fetch emission factor  ──▶  emission_factors collection (seeded from domain/factors.js)
      │                      car 0.20 kg/km · bus 0.08 · flight 0.25
      │                      electricity 0.80 kg/kWh · veg 0.5 · non-veg 2.0 kg/meal
      ▼
Calculate CO₂ = quantity × factor
      │
      ▼
Sanity check (DP2) ──▶ above per-category threshold? → 422 + confirmation request (never clamped)
      │
      ▼
Store activity in MongoDB  ──▶  append activity_history entry
      │
      ▼
Evaluate weekly target nudges (DP1)  ──▶  notifications collection
      │
      ▼
Publish on the bus  ──▶  dashboard, charts, target progress, copilot refresh live
                          (sequenced frame → replay buffer → every open transport)
```

## Real-time protocol

```
                        ┌───────────────────────── modules/realtime ─────────────────────────┐
   browser tab          │  ws.js        RFC 6455 server: handshake, framing, heartbeat,      │
   ┌───────────┐        │               replay on resume, per-socket command rate limit     │
   │ liveSocket│ ◀────▶ │  commands.js  cmd → service layer (activities/targets/copilot/…)  │
   │  WS → SSE │        │  hub.js       client registry + publish + replay buffer + metrics  │
   │  → polling│        │  ticks.js     always-on ticker: telemetry + grid intensity         │
   └───────────┘        │  snapshot.js  pre-aggregated state pushed on connect / change      │
                        └──────────────────────────────────────────────────────────────────┘
  inbound (server → client): hello · snapshot · activity · deleted · target · nudge ·
                             presence · typing · telemetry* · grid*        (* ephemeral: not replayed)
  outbound (client → server): { id, cmd, payload }  →  { kind: 'ack' | 'stream' | 'error' }
```

- **One bus, three transports.** WebSocket, SSE and polling share the same hub, so a browser on a fallback sees identical frames.
- **No gaps.** Every frame carries a sequence id; reconnecting with `lastEventId` replays only what was missed, and ephemeral ticks are excluded so a resume is never flooded.
- **Bidirectional.** Commands run through the same services as the REST routes (one implementation, two surfaces) and answer with an ack; `chat.ask` emits `stream` frames before its ack.
- **Self-observing.** The `Live Ops` tab renders transport, latency, event rate, presence, sequence position, command counters and a raw command console from pushed data only.

## Backend module map

```
backend/
├── src/
│   ├── config/index.js              env + product constants (single source for process.env)
│   ├── domain/
│   │   ├── factors.js               fixed emission factors (seed) + sanity thresholds + tiers
│   │   └── week.js                  Monday-start weeks, pace maths
│   ├── db/
│   │   ├── index.js                 connection manager (Mongo → in-memory fallback)
│   │   └── repositories/            activity · target · factor · notification · history · summary
│   ├── models/index.js              Mongoose schemas for all six collections
│   ├── modules/
│   │   ├── activities/              routes.js · service.js   (management + audit trail)
│   │   ├── calculation/             routes.js · service.js   (CO₂ engine, /calculate, /simulate)
│   │   ├── analytics/               routes.js · service.js   (dashboard, week, insights, export)
│   │   ├── targets/                 routes.js                (weekly target)
│   │   ├── nudges/                  routes.js · service.js   (alerts & nudges)
│   │   ├── copilot/                 routes.js · service.js · engine.js · llm.js · audit.js
│   │   ├── realtime/                routes.js · hub.js · ws.js · commands.js · ticks.js
│   │   └── health/                  routes.js                (health, docs, services)
│   ├── integrations/                email · carbonData · geo  (optional providers)
│   ├── middleware/                  errorHandler · validate · rateLimit · requestLog
│   ├── routes/index.js              mounts every module under /api
│   ├── app.js                       app assembly (exported for tests)
│   └── server.js                    bootstrap + listener
└── test/                            api · realtime · websocket · tracking · ml  (65 tests, node:test)
```

## Frontend map

```
frontend/src/
├── app/App.jsx                      shell: tabs, live subscription, toasts, overlays
├── features/
│   ├── dashboard/                   DashboardPage      → totals, breakdown, weekly progress
│   ├── activities/                  LogActivityPage    → capture + live CO₂ preview (DP2)
│   ├── insights/                    InsightsPage       → trends, mix, scopes, modeler
│   ├── targets/                     TargetsPage        → weekly budget, pace, DP1/DP3 notes
│   ├── history/                     HistoryPage        → ledger, filters, search, export
│   ├── nudges/                      NudgeCenter        → alerts & nudges feed
│   ├── copilot/                     CopilotPanel       → hybrid chat + diagnostic report
│   └── realtime/                    LiveConsole · LiveTicker · GridPulse · PresencePill
├── components/
│   ├── layout/Layout.jsx            header, nav, live badge, DP1 banner, footer
│   └── ui/index.jsx                 design system primitives + icon set
└── lib/
    ├── api.js                       typed-ish API client for every module
    ├── liveSocket.js                transport ladder (WS → SSE → polling), ack correlation, offline queue
    └── useLive.js                   React binding: pushed state + send/chat/notifyTyping actions
```

## Layered responsibilities

| Layer | Responsibility | Implementation |
|---|---|---|
| **Client** | Rendering, interaction, live subscription | React 18, Vite, Tailwind (CarbonPulse tokens), Recharts, native `WebSocket` |
| **API** | Validation, orchestration, HTTP surface | Express routers per module, middleware for validation/rate-limiting/errors |
| **Domain** | Factors, thresholds, week boundaries, tiers | `domain/factors.js`, `domain/week.js` |
| **Engine** | Footprint computation, tiers, what-if modelling | `modules/calculation` |
| **Analytics** | Aggregation, trends, scope split, rollups, export | `modules/analytics` |
| **Nudges** | Target evaluation and alerting (DP1) | `modules/nudges` + `notifications` collection |
| **AI** | NL logging, Q&A, audit insights, projections | `modules/copilot` (rules always; LLM optional) |
| **Real-time** | Fan-out of mutations to all sessions **and** command intake | `modules/realtime` (`/api/ws` primary, `/api/stream` fallback) |
| **Persistence** | Durable storage with graceful degradation | `db/` + `models/` (Mongo → memory fallback) |
| **Integrations** | Optional external providers, self-reporting | `integrations/` (email, carbon data, geo) |

## Deliberate deviations from the reference diagram

- **MongoDB instead of PostgreSQL/Supabase.** The ledger is a single flexible document type (varying units, notes, tiers, scopes); document storage fits it and deploys free in minutes. All access goes through `db/repositories/*`, so swapping drivers is contained.
- **No authentication.** The hackathon brief forbids login/signup so graders reach every feature directly; the API is keyless by design and the UI carries a "Zero Auth Mode" badge.
- **WebSocket hand-rolled on Node's `http` upgrade (no `ws` dependency).** The socket is bidirectional — the UI logs, retargets, simulates and chats over one connection with ack correlation — while SSE and polling remain as fallbacks for proxies that strip upgrades. Keeping the codec in-repo means the transport is testable with Node's built-in client (`backend/test/websocket.test.js`) and adds no supply-chain surface.
- **Nudges instead of notifications/email.** Brevo/Resend-style email is wired in `integrations/email.js` but disabled without a key; the in-app nudge feed is the primary DP1 surface because it is immediate and always available to graders.

## Deployment (example)

```
Frontend  → Vercel   (frontend/, static build)
Backend   → Vercel   (backend/, Node runtime)
Database  → MongoDB Atlas (MONGODB_URI)
Versioning→ GitHub
Secrets   → Environment variables (MONGODB_URI, optional OPENAI_API_KEY, CLIENT_ORIGIN)
Transport → HTTPS (automatic on Vercel)
```
