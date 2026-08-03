# Access Genie AI — Enterprise Asset Intelligence Platform

An **Enterprise Asset Intelligence Platform** — not just asset tracking. It fuses EAM (work orders,
lifecycle, financials), RTLS/IoT tracking, a live Digital Twin, native **explainable AI**, and embedded
BI on top of one asset graph, multi-tenant to the core.

> Positioning: *ServiceNow's workflow engine + IBM Maximo's asset depth + Zebra MotionWorks' RTLS +
> Samsara's IoT/telematics + a native AI/Digital-Twin core* — built as **one object graph**, where the
> tracking dot, the work order, and the depreciation line are the same asset.

---

## Layout

Three packages, wired as npm workspaces. A single `npm install` at the root installs all three.

```
access-genie/
├── shared/            @access-genie/shared — the contract both sides compile against
│   └── src/           platform · domain · registry · onboarding · tracking-workspace · label · api
│
├── backend/           @access-genie/backend — Express 5 + Mongoose REST API
│   ├── .env           (git-ignored)  ·  .env.example — every knob, documented
│   └── src/
│       ├── config/        env validation, database, logger
│       ├── models/        Mongoose schemas + atomic ID sequences
│       ├── services/      business rules — the layer that owns behaviour
│       ├── controllers/   request → service → response, nothing else
│       ├── routes/        the /api/v1 surface, module-gated
│       ├── middleware/    auth, RBAC, validation, errors, rate limits
│       ├── validators/    Zod schemas per resource
│       ├── utils/         ApiError, response envelope, pagination
│       └── seed/          the demo dataset, as JSON fixtures
│
└── frontend/          @access-genie/frontend — React 19 + Vite SPA
    ├── .env           (git-ignored)  ·  .env.example
    └── src/
        ├── api/           one module per resource: typed calls + React Query hooks
        ├── app/           router, data gates, query client, route guards
        ├── components/    layout chrome, providers, UI primitives, charts
        ├── lib/           the hydrated data modules, formatters, nav config
        ├── pages/         every screen, one folder per route
        └── styles/        design tokens (Tailwind v4)
```

`shared/` is consumed by both sides as a workspace dependency, so a change to the API contract is a
**compile error in the frontend**, not a runtime surprise.

## Running it

Node 20.19+, and a MongoDB connection string. There is no local database.

```bash
npm install                              # installs all three packages

cp backend/.env.example  backend/.env    # MONGODB_URI + the two JWT secrets
cp frontend/.env.example frontend/.env

npm run seed                             # creates the administrator account
npm run dev                              # API on :4000 + web client on :5173
```

`npm run dev` builds the shared contract, then runs both servers together. To run them apart, use
`npm run dev:api` and `npm run dev:web`.

### Where the data lives

One place: the MongoDB cluster in `MONGODB_URI`. Users, sessions, assets, work orders, alerts, the
audit trail and each person's saved views and theme are all documents there. Nothing application-level
is kept on the instance or in the browser — no local database, no `localStorage`, no in-memory
counters — so any instance of the API can serve any request and a browser that clears its storage
loses nothing.

Atlas rejects the TLS handshake unless the connecting machine's public IP is on the cluster's access
list. Add your workstation's IP for development, and the platform's egress range (or `0.0.0.0/0`) for
the deployed API.

### Signing in

`npm run seed` creates one account and nothing else — no demo assets, no fixture people. The estate
starts empty, and everything on every screen from then on is something you put there.

| Email | Password | Role |
|---|---|---|
| `ADMIN_EMAIL` (`raj@bcss.in`) | `ADMIN_PASSWORD` (`raj@bcss`) | Super Admin — every module |

Both are variables in `backend/.env`, so a deployment owns its own credentials rather than inheriting
the ones checked in here. Change them before deploying anywhere that matters.

Press **⌘K / Ctrl-K** anywhere for the command palette.

**Locked out?** Change `ADMIN_PASSWORD` in `backend/.env` and run `npm run seed` again — the account is
reset to it on each run.

**Want the prototype's demo estate** (fabricated assets, work orders and personas, for design review)?
`npm run seed:demo` loads it on top; those personas share `SEED_PASSWORD`. Never run it against an
environment anyone treats as real.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | shared contract + both servers |
| `npm run dev:api` / `dev:web` | one side only |
| `npm run build` | compile all three packages |
| `npm run typecheck` | `tsc --noEmit` across the workspace |
| `npm run lint` | ESLint across the workspace |
| `npm run seed` | create (or reset) the administrator — nothing else |
| `npm run seed:fresh` | wipe every seeded collection first, then the administrator |
| `npm run seed:demo` | *opt-in*: load the prototype's demo estate on top |
| `npm run seed:demo:fresh` | drop the seeded collections, then load the demo estate |
| `npm run db:indexes` | build the indexes every model declares |
| `npm start` | run the compiled API |

## Deploying

```bash
npm run build        # shared → backend → frontend
npm run db:indexes   # production connects with autoIndex off; this is the step that builds them
npm start            # serves the compiled API
```

`db:indexes` matters because the API sets `autoIndex: false` in production — building indexes on boot
would stall startup on a large collection and would do it once per instance. Run it as a deploy step,
before the new API takes traffic. It also drops indexes the schemas no longer declare, so a cluster
that has been through several revisions keeps matching the code.

Set `NODE_ENV=production` and the server refuses to start on placeholder JWT secrets, on an insecure
session cookie, or with `CORS_ORIGIN=*` — see `backend/src/config/env.ts` for the full list.

## Configuration

Nothing is hard-coded. Both packages validate their environment at boot and fail with a readable message
rather than surfacing a confusing error three layers deep.

**`backend/.env`** — `PORT` · `HOST` · `API_PREFIX` · `CORS_ORIGIN` · `MONGODB_URI` · `MONGODB_DB_NAME` ·
pool size and timeout · `JWT_*` secrets and TTLs · `BCRYPT_ROUNDS` · the refresh cookie's name, domain,
`secure` and `sameSite` · both rate-limit windows and ceilings · `LOG_LEVEL` · `SEED_PASSWORD`.

`MONGODB_DB_NAME` is its own variable on purpose: an Atlas connection string is usually pasted without a
path, and Mongoose would then quietly connect to a database called `test`.

**`frontend/.env`** — `VITE_PORT` · `VITE_PREVIEW_PORT` · `VITE_API_URL` · `VITE_API_PROXY` ·
`VITE_API_TIMEOUT`. Only `VITE_`-prefixed variables reach the browser, and they are inlined at build
time, so nothing secret belongs there.

In development the Vite server proxies `/api` to the API, so the browser sees one origin: the refresh
cookie is first-party, there is no CORS preflight on every call, and development exercises the same
arrangement a reverse proxy gives you in production. Point `VITE_API_URL` at an absolute URL only if the
two are genuinely on different sites — and then `CORS_ORIGIN` must name the web origin, with
`COOKIE_SAME_SITE=none` and `COOKIE_SECURE=true`.

## API

Base URL `/api/v1` (configurable). Every response is one of two envelopes:

```jsonc
{ "success": true,  "data": { … }, "meta": { …pagination } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "…" }, "requestId": "…" }
```

**Auth** — access tokens are short-lived JWTs held in client memory; refresh tokens are opaque, rotated on
every use, stored only as a SHA-256, and delivered as an httpOnly cookie scoped to the auth path.
`POST /auth/login` · `/auth/refresh` · `/auth/logout` · `/auth/logout-all` · `GET /auth/me` ·
`/auth/personas` · `POST /auth/change-password`.

**Resources** — `/assets` (+ `/:id/profile`, `/stats`) · `/asset-classes` · `/asset-groups` ·
`/asset-documents` · `/movement-trails` · `/work-orders` (+ status, comments, labor, checklist) ·
`/pm-schedules` · `/inspections` · `/alerts` (+ acknowledge / escalate / resolve, bulk) · `/alert-rules` ·
`/tracking/live` · `/tracking/workspace` · `/tracking/sensors` · `/tracking/geofences` ·
`/tracking/gateways` · `/labels/{templates,devices,jobs}` · `/insights` ·
`/ai/{models,forecasts,anomalies}` · `/reports` · `/certifications` · `/cycle-counts` · `/integrations` ·
`/approval-workflows` · `/users` · `/dashboard/summary` · `/dataset` · `/scope/tree` · `/audit` ·
`/custody` · `/notifications` · `/inventory/*`.

Lists accept `?page= &limit= &sort= &q=` plus per-resource filters; `sort` is checked against an
allow-list and `limit` is capped.

**Authorization** is enforced at the API, never by hiding a menu item. Each route is gated with
`requireModule(...)` against the same role matrix in `shared/src/platform.ts` that drives the sidebar — so
a hidden section is also a refused request. Role changes and suspensions take effect on the next request,
because the user is re-read rather than trusted from the token claims.

## How the screens get their data

Two aggregate endpoints back nearly everything: `GET /dataset` (the reference collections, each slice
gated on the caller's module grants) and `GET /tracking/workspace` (the tracking estate). Each is
fetched once, hydrated into a module under `frontend/src/lib/`, and read from there by the screens.

That is a deliberate trade. The screens are cross-cutting — one dashboard reads assets, work orders,
alerts and insights together; the asset profile reads six collections at once — so per-collection
requests would give every screen its own waterfall of loading states for data that totals a few thousand
small documents. One request, one loading state, one error state, in `app/DataGate.tsx`.

The rule that follows: **never derive from those modules at module scope in a screen.** A value computed
at import time is computed once and never refreshed. Derive inside the component, where it re-runs.

Writes go through `frontend/src/api/<resource>.ts` and end by invalidating the dataset query, so a change
made on one screen is visible on all of them. The registry and class-library providers write
optimistically and roll back on failure — a registration flow is a sequence of small edits, and a round
trip between each one would make it feel like filing a form.

When the estate outgrows a single payload, these become paginated per-resource reads; those endpoints
already exist, and the screens already filter by facility.

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
- **One factory for reference reads.** Thirty read-mostly collections share `createResource`, so
  pagination and the sort allow-list are written once. A collection graduates out of it the moment it
  grows behaviour of its own.
- **The registration record lives on the asset.** Readiness gates, tag bindings and commercial terms are
  facets of the asset, not separate entities — which also makes activation a single atomic write.
- **Seeded timestamps are shifted to seed time.** The fixtures are positioned relative to each other
  ("raised 3h ago", "due tomorrow"); the seeder shifts the whole set together so that stays true against
  a real clock, instead of drifting into the past as the fixture file ages.
- **Charts are small multiples, never dual-axis.** Utilization (%) and downtime (hours) share an x-axis in
  stacked panels; two y-scales would invent crossings that mean nothing.

## Screens

All 119 screens are present, across every section — workspace, tracking, AI, lifecycle, maintenance,
compliance, mobile workforce, analytics, inventory, administration and settings. Every one of them reads
from MongoDB; there is no fixture module left in the frontend.

Each screen is code-split by route, so opening the app loads the shell and one page rather than all 119.

Three screens still carry local sample content for sections that have no backing collection yet —
`settings/security` (active sessions), `settings/api-tokens`, and `support` (ticket list). They are
marked as such in the source.

---

**Where the build actually stands** — what is wired, what is not, and what is left to do:
[docs/24-build-status.md](./docs/24-build-status.md).

Product blueprint and PRD: [`docs/`](./docs) — start at
[docs/00-master-blueprint.md](./docs/00-master-blueprint.md).
