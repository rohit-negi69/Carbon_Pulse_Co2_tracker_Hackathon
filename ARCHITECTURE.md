# CarbonPulse — System Architecture

Track. Understand. Reduce. A cleaner tomorrow.

```
┌──────────────────────┐      HTTPS       ┌────────────────────────────────────────────────┐
│  User (Web / Mobile) │ ───────────────▶ │  Frontend — React + Vite + Tailwind            │
│  Responsive browser  │ ◀─────────────── │  Dashboard · Log Activity · Charts & Insights  │
│  (no login required) │  JSON + SSE      │  Set Targets · History & Filters · Alerts      │
└──────────────────────┘                  └───────────────────┬────────────────────────────┘
                                                              │ REST (JSON) + Server-Sent Events
                                                              ▼
                    ┌───────────────────────────────────────────────────────────────────────┐
                    │  Backend API layer — Node.js + Express  (modular monolith)            │
                    │  modules/activities      activity management + audit trail            │
                    │  modules/calculation     CO₂ calculation engine (factor lookup)       │
                    │  modules/analytics       analytics & aggregation (dashboard, trends)  │
                    │  modules/targets         weekly target                                 │
                    │  modules/nudges          weekly target nudges + alerts                │
                    │  modules/copilot         chatbot + AI audit                           │
                    │  modules/realtime        SSE hub (live fan-out)                       │
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
5. The backend broadcasts the change over SSE; every open session — dashboard, charts, history, copilot — updates live.

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
Broadcast over SSE  ──▶  dashboard, charts, target progress, copilot refresh live
```

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
│   │   ├── realtime/                routes.js · hub.js       (SSE)
│   │   └── health/                  routes.js                (health, docs, services)
│   ├── integrations/                email · carbonData · geo  (optional providers)
│   ├── middleware/                  errorHandler · validate · rateLimit · requestLog
│   ├── routes/index.js              mounts every module under /api
│   ├── app.js                       app assembly (exported for tests)
│   └── server.js                    bootstrap + listener
└── test/api.test.js                 15 end-to-end API tests (node:test)
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
│   └── copilot/                     CopilotPanel       → hybrid chat + diagnostic report
├── components/
│   ├── layout/Layout.jsx            header, nav, live badge, DP1 banner, footer
│   └── ui/index.jsx                 design system primitives + icon set
└── lib/
    ├── api.js                       typed-ish API client for every module
    └── useLive.js                   SSE subscription with polling fallback
```

## Layered responsibilities

| Layer | Responsibility | Implementation |
|---|---|---|
| **Client** | Rendering, interaction, live subscription | React 18, Vite, Tailwind (CarbonPulse tokens), Recharts, `EventSource` |
| **API** | Validation, orchestration, HTTP surface | Express routers per module, middleware for validation/rate-limiting/errors |
| **Domain** | Factors, thresholds, week boundaries, tiers | `domain/factors.js`, `domain/week.js` |
| **Engine** | Footprint computation, tiers, what-if modelling | `modules/calculation` |
| **Analytics** | Aggregation, trends, scope split, rollups, export | `modules/analytics` |
| **Nudges** | Target evaluation and alerting (DP1) | `modules/nudges` + `notifications` collection |
| **AI** | NL logging, Q&A, audit insights, projections | `modules/copilot` (rules always; LLM optional) |
| **Real-time** | Fan-out of mutations to all sessions | `modules/realtime` + `GET /api/stream` |
| **Persistence** | Durable storage with graceful degradation | `db/` + `models/` (Mongo → memory fallback) |
| **Integrations** | Optional external providers, self-reporting | `integrations/` (email, carbon data, geo) |

## Deliberate deviations from the reference diagram

- **MongoDB instead of PostgreSQL/Supabase.** The ledger is a single flexible document type (varying units, notes, tiers, scopes); document storage fits it and deploys free in minutes. All access goes through `db/repositories/*`, so swapping drivers is contained.
- **No authentication.** The hackathon brief forbids login/signup so graders reach every feature directly; the API is keyless by design and the UI carries a "Zero Auth Mode" badge.
- **SSE rather than WebSockets.** Traffic is one-way (server → browser), SSE reconnects natively, needs no extra dependency, and degrades to polling.
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
