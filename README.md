# Access Genie AI — Enterprise Asset Intelligence Platform

An **Enterprise Asset Intelligence Platform** — not just asset tracking. It fuses EAM (work orders,
lifecycle, financials), RTLS/IoT tracking, a live Digital Twin, native **explainable AI**, and embedded
BI on top of one asset graph, multi-tenant to the core.

> Positioning: *ServiceNow's workflow engine + IBM Maximo's asset depth + Zebra MotionWorks' RTLS +
> Samsara's IoT/telematics + a native AI/Digital-Twin core* — built as **one object graph**, where the
> tracking dot, the work order, and the depreciation line are the same asset.

The repository holds two builds:

| | What it is | Stack |
|---|---|---|
| **`/` (root)** | The interactive prototype — ~120 screens, in-session mock data | Next.js 16 App Router |
| **`server/` + `client/`** | The real application — persistent database, REST API, authenticated SPA | **MERN**: MongoDB · Express · React · Node |

The prototype still runs and still deploys; the MERN app is the build that carries the product forward.

---

# The MERN application

## Layout

```
access-genie/
├── shared/          @access-genie/shared — domain types, role matrix, API contracts
│   └── src/         platform.ts · domain.ts · api.ts
│
├── server/          @access-genie/server — Express + Mongoose REST API
│   └── src/
│       ├── config/       env validation, database, logger
│       ├── models/       20 Mongoose schemas + atomic ID sequences
│       ├── services/     business rules (the layer that owns behaviour)
│       ├── controllers/  request → service → response, nothing else
│       ├── routes/       the /api/v1 surface, module-gated
│       ├── middleware/   auth, RBAC, validation, errors, rate limits
│       ├── validators/   Zod schemas per resource
│       ├── utils/        ApiError, response envelope, pagination
│       └── seed/         fixtures extracted from the prototype
│
└── client/          @access-genie/client — React 19 + Vite SPA
    └── src/
        ├── app/          router, providers, query client, route guards
        ├── components/   layout chrome (sidebar, top bar, ⌘K) + UI primitives
        ├── features/     one folder per domain: api module + screens
        ├── lib/          API client, formatters, nav config, status tones
        └── styles/       design tokens (Tailwind v4)
```

`shared/` is consumed by both sides as a `file:` dependency, so a change to the API contract is a
**compile error in the client**, not a runtime surprise.

## Running it

Node 20+ and a MongoDB instance. Three terminals:

```bash
# 1 — build the shared contract (once, and after any change to shared/src)
cd shared && npm install && npm run build

# 2 — API
cd server && npm install
cp .env.example .env          # set MONGODB_URI and the JWT secrets
npm run seed                  # load the demo dataset
npm run dev                   # → http://localhost:4000

# 3 — web client
cd client && npm install
cp .env.example .env
npm run dev                   # → http://localhost:5173
```

**No MongoDB installed?** Leave `MONGODB_URI` empty in development and the server boots an in-memory
MongoDB automatically. It is ephemeral — the data disappears with the process — so seed and run in the
same session, or point at a real database.

Sign in with any seeded account and the password `Genie@2026`:

| Email | Role | Sees |
|---|---|---|
| `raj@bcss.in` | Super Admin | everything |
| `sneha.iyer@accessgenie.in` | Facility Manager | all but administration |
| `manoj.reddy@accessgenie.in` | Maintenance Manager | maintenance, inventory, AI |
| `deepak.nair@accessgenie.in` | Technician | workspace, assets, maintenance, tracking |
| `ananya.sharma@accessgenie.in` | Executive | AI, analytics, compliance |
| `tarun.fernandes@accessgenie.in` | Security Officer | tracking, alerts, compliance |

The login screen lists them as one-click personas. Press **⌘K / Ctrl-K** anywhere for the command palette.

## Scripts

| Command | Where | Does |
|---|---|---|
| `npm run dev` | server / client | dev server with reload |
| `npm run build` | shared / server / client | compile / bundle |
| `npm run typecheck` | any package | `tsc --noEmit` |
| `npm run seed` | server | upsert fixtures, keeping anything you added |
| `npm run seed:fresh` | server | drop the seeded collections first |

## API

Base URL `/api/v1`. Every response is one of two envelopes:

```jsonc
{ "success": true,  "data": { … }, "meta": { …pagination } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "…" }, "requestId": "…" }
```

**Auth** — access tokens are short-lived JWTs held in client memory; refresh tokens are opaque, rotated on
every use, stored only as a SHA-256, and delivered as an httpOnly cookie.
`POST /auth/login` · `/auth/refresh` · `/auth/logout` · `/auth/logout-all` · `GET /auth/me` ·
`POST /auth/change-password`.

**Resources** — `/assets` (+ `/:id/profile` for the 360 view, `/stats`) · `/work-orders`
(+ `/:id/status`, `/comments`, `/labor`, `/checklist`) · `/alerts` (+ acknowledge / escalate / resolve,
bulk) · `/tracking/live` · `/tracking/sensors` · `/tracking/geofences` · `/tracking/gateways` ·
`/insights` · `/users` · `/dashboard/summary` · `/scope/tree` · `/audit` · `/custody` · `/notifications` ·
`/inventory/*`.

Lists accept `?page= &limit= &sort= &q=` plus per-resource filters; `sort` is checked against an
allow-list and `limit` is capped.

**Authorization** is enforced at the API, never by hiding a menu item. Each route is gated with
`requireModule(...)` against the same role matrix in `shared/src/platform.ts` that drives the sidebar — so
a hidden section is also a refused request. Role changes and suspensions revoke every live session
immediately.

## Design decisions worth knowing

- **Business IDs, not ObjectIds.** `AST-1042`, `WO-2051` get printed on labels and quoted in tickets, so
  they are minted from an atomic counter and used as `_id`.
- **Derived health.** `healthStatus` is computed from `healthScore` on save; a score and a band that
  disagree is a class of bug removed rather than handled.
- **Explicit state machines.** Work orders and alerts validate transitions against a map; "Completed →
  New" is a data-entry mistake, not a workflow.
- **Append-only history.** Activity and audit collections have no update or delete path anywhere in the
  codebase. Re-running the seeder will not duplicate them.
- **One serialization choke point.** `_id` → `id` happens in `sendData`/`sendList`, so no endpoint can
  leak a raw Mongo shape by forgetting a transform.
- **Charts are small multiples, never dual-axis.** Utilization (%) and downtime (hours) share an x-axis in
  stacked panels; two y-scales would invent crossings that mean nothing.

## Screens

**All 119 screens from the prototype are present**, across every section — workspace, tracking, AI,
lifecycle, maintenance, compliance, mobile workforce, analytics, inventory, administration and settings.

They come from two places:

| | Count | Data source |
|---|---|---|
| **API-backed** | 20 | live MongoDB through the REST API — reads *and* writes |
| **Ported from the prototype** | 99 | the fixture dataset in `client/src/lib/mock-data.ts` |

The API-backed set is: dashboard · asset registry · asset 360 · register asset · live map · device
registry · geofences · gateways · alert center · alert rules · work orders · work-order detail · raise
work order · AI insights · users · roles · audit log · chain of custody · inventory · notifications.
Everything else renders dummy data.

The two sets are disjoint by construction — `client/scripts/port-prototype.mjs` excludes every
API-backed path — because a fixture-keyed page cannot show a record created through the app, so it must
never own that route.

### Re-running the port

The prototype's screens were converted mechanically, not by hand:

```bash
node client/scripts/port-prototype.mjs   # re-ports src/app/(app)/**  →  client/src/pages/**
```

It rewrites `next/link` → react-router `Link`, `next/navigation` hooks → their router equivalents, and
async `params` → `useParams()`, then regenerates `client/src/app/prototype-routes.tsx`. Every ported
route is code-split, so 99 extra screens add nothing to the initial bundle.

Two compiler flags — `noUncheckedIndexedAccess` and `verbatimModuleSyntax` — are off in
`client/tsconfig.json` because the ported screens were authored without them. The server, which is
entirely first-party code, keeps both.

---

# The Next.js prototype (root)

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

Sign in at `/login` with any email + a 4+ character password → MFA → workspace. Use the top-right avatar to
switch persona and watch the sidebar adapt by role. Authentication is simulated and all data is in-session.

```
src/
  app/(auth)/     # shell-less auth screens (login, mfa, forgot-password)
  app/(app)/      # authenticated app (shell-wrapped) — all modules
  components/     # layout shell, providers, ui primitives, charts
  lib/            # mock-data, rbac, nav-config, utils
  types/          # domain + platform types
```

# Product blueprint

The full product requirements (vision, personas, IA, dashboards, 300+ feature matrix, page catalog, AI
modules, tracking tech, architecture, database, APIs, mobile, design system, security, reporting, roadmap,
user flows, and the phased implementation plan) live in [`docs/`](./docs/README.md) — **21 documents**,
starting with [`docs/00-master-blueprint.md`](./docs/00-master-blueprint.md).
