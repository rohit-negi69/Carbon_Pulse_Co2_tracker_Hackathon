# CarbonPulse — System Architecture

Track. Understand. Reduce. A cleaner tomorrow.

```
┌──────────────────────┐        HTTPS         ┌───────────────────────────────────────────┐
│  User (Web / Mobile) │ ───────────────────▶ │  Frontend — React + Vite + Tailwind       │
│  Responsive browser  │ ◀─────────────────── │  Dashboard · Log Activity · Charts &      │
│  (no login required) │   JSON + SSE stream  │  Insights · Set Targets · History & Alerts │
└──────────────────────┘                      └───────────────────┬───────────────────────┘
                                                                  │ REST (JSON) + Server-Sent Events
                                                                  ▼
                              ┌───────────────────────────────────────────────────────────┐
                              │  Backend API layer — Node.js + Express                     │
                              │  · Activity management        (POST/GET/DELETE)            │
                              │  · CO₂ calculation engine     (quantity × fixed factor)    │
                              │  · Analytics & aggregation    (/dashboard, /week)          │
                              │  · Weekly target & nudges     (/target, pace, projections) │
                              │  · AI layer                   (chat + audit insights)      │
                              │  · Real-time hub              (SSE broadcast on mutation)  │
                              │  · REST endpoints             (/api/*)                     │
                              └──────────────┬───────────────────────────┬─────────────────┘
                                             │                           │
                                             ▼                           ▼
                    ┌───────────────────────────────┐    ┌──────────────────────────────────┐
                    │  Database — MongoDB (Mongoose)│    │  External services (optional)    │
                    │  collections:                 │    │  · OpenAI — LLM chat + audit     │
                    │   activities                  │    │    polish (enabled by env key)   │
                    │   targets                     │    │  · (email / push wired in model, │
                    │  + in-memory fallback store   │    │    disabled in this build)       │
                    └───────────────────────────────┘    └──────────────────────────────────┘
```

## High-level flow

1. User logs an activity (e.g. car travel, 10 km) from the UI.
2. Frontend sends it to the backend via `POST /api/activities`.
3. Backend fetches the fixed emission factor and computes `CO₂ = quantity × factor`.
4. The activity is stored in MongoDB.
5. The backend broadcasts the new entry over SSE and the dashboard, charts, weekly progress, and AI audit refresh live in every open session.

## CO₂ calculation flow

```
Activity input (type, quantity)
        │
        ▼
Fetch emission factor  ──▶  Emission factor registry (server/factors.js)
        │                    car 0.20 kg/km · bus 0.08 · flight 0.25
        │                    electricity 0.80 kg/kWh · veg 0.5 · non-veg 2.0 kg/meal
        ▼
Calculate CO₂ (quantity × factor)
        │
        ▼
Sanity check (DP2) ──▶ over threshold? return 422 + confirmation request (never clamp silently)
        │
        ▼
Store activity in MongoDB
        │
        ▼
Broadcast over SSE ──▶ Dashboard + weekly progress + AI audit update live
```

## Layered breakdown

| Layer | Responsibility | Implementation |
|---|---|---|
| **Client** | Rendering, interaction, live subscription | React 18, Vite, Tailwind (CarbonPulse design system), Recharts, native `EventSource` |
| **API** | Validation, calculation, aggregation, nudges, real-time fan-out | Express: `activities`, `dashboard`, `week`, `target`, `chat`, `ai/audit`, `stream`, `health` |
| **Domain** | Fixed emission factors, absurd-input thresholds, week boundaries | `server/factors.js`, `server/week.js` |
| **AI** | Natural-language logging, Q&A, reduction insights, projections | `server/chat/engine.js` (rules, always on) + `server/chat/llm.js` (optional OpenAI) + `server/chat/ai.js` (audit) |
| **Real-time** | Push mutations to every open session | `server/events.js` + `GET /api/stream` (SSE, 20s keep-alive) |
| **Persistence** | Durable storage with graceful degradation | `server/db.js` — Mongoose when `MONGODB_URI` is set, in-memory fallback otherwise |
| **Insights** | Category breakdown, daily mean, pace, top contributor, projection | `dashboard`, `week`, `ai/audit` |

## Deliberate deviations from the reference diagram

- **MongoDB instead of PostgreSQL/Supabase.** Document-oriented storage fits the single flexible `activities` ledger (varying types, units, and notes) and deploys free in a minute. The data-access layer is isolated in `server/db.js`, so swapping drivers is a one-file change.
- **No authentication.** The hackathon brief forbids login/signup so graders can reach every feature directly; the API layer is keyless by design and the UI shows a "Zero Auth Mode" badge.
- **Real-time via SSE rather than WebSockets.** Traffic is one-directional (server → browser), SSE reconnects automatically, needs no extra dependency, and degrades to polling if the stream is unavailable.

## Deployment (example)

```
Frontend  → Vercel   (client/, static build)
Backend   → Vercel   (server/, Node runtime)
Database  → MongoDB Atlas (MONGODB_URI)
Versioning→ GitHub
Secrets   → Environment variables (MONGODB_URI, OPENAI_API_KEY optional, CLIENT_ORIGIN)
Transport → HTTPS (automatic on Vercel)
```
