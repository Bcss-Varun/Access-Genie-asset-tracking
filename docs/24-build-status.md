# Access Genie AI — Build Status

**Updated 2026-08-03** · Companion to [20-implementation-plan.md](./20-implementation-plan.md)

What exists today, what is verified working, and what is left — split into **code gaps** (things
half-wired that should be finished) and **feature gaps** (things not built at all).

---

## 1. Status at a glance

| | |
|---|---|
| **Architecture** | ✅ Complete — `shared/` + `backend/` + `frontend/` as npm workspaces |
| **Database** | ✅ 53 collections modelled and seeded — local MongoDB, `access_genie` |
| **API** | 🟡 105 routes live — the core write paths are wired, the long tail is not |
| **Screens** | 🟡 119 screens reading live data; the main workflows now persist |
| **Auth & RBAC** | ✅ Complete and enforced server-side |
| **Config** | ✅ Fully env-driven, validated at boot on both sides |
| **Tests** | ❌ None |
| **CI** | ❌ None |

**What changed on 2026-08-03**

- **Registering an asset now propagates everywhere.** It was reaching 7 of 10 destinations; a new
  `assetGraph.service.ts` projects it into the remaining three — the live tracking map, the device
  estate, and the chain of custody. Verified 10/10.
- **A bug that broke the entire tracking module was fixed.** Presence, facilities, journeys and
  coverage cells are keyed by a business identifier exposed through a Mongoose *virtual* — and every
  read uses `.lean()`, which does not run virtuals. `facilityBySlug()` resolved 0 of 3 facilities and
  `presenceById()` 0 of 110, so every tracking screen was silently empty. Fixed with an explicit
  `aliasId()` at the point of read.
- **The core writes persist.** Alerts, alert rules, work orders, notifications, AI insights, asset
  classes and assets all survive a refresh (verified 6/6, plus the two providers).
- **Transfers and reservations are real collections**, replacing fabricated rows on those two screens,
  with segregation of duties and double-booking refused server-side.

Still true: the *long tail* of writes is not wired — see [§4.1](#41-p0--writes-that-do-not-persist).

---

## 2. What has been built

### 2.1 Repository structure

The Next.js prototype that used to sit at the repo root is gone. Its screens were ported into the Vite
client, which is now the only UI. Three packages, one `npm install`:

```
access-genie/
├── package.json          workspace root — dev / build / seed / lint scripts
├── eslint.config.mjs     one flat config for all three packages
├── shared/               the contract both sides compile against
├── backend/              Express 5 + Mongoose REST API
└── frontend/             React 19 + Vite SPA
```

A change to the API contract in `shared/` is a **compile error in the frontend**, not a runtime
surprise.

### 2.2 Shared contract — `shared/src/`

| Module | Holds |
|---|---|
| `platform.ts` | Identity, the role matrix, the scope tree |
| `domain.ts` | The asset graph — assets, work orders, alerts, tracking devices |
| `registry.ts` | Asset classes, collections, PM, inspections, MLOps, reporting, admin |
| `onboarding.ts` | The registration state machine and readiness gates |
| `tracking-workspace.ts` | The live tracking estate |
| `label.ts` | Labelling and tag printing |
| `api.ts` | Envelopes, query contracts, auth payloads |

Every string union is an `as const` array, so the same vocabulary drives the TypeScript type, the
Mongoose `enum`, and the Zod validator. A typo in a state name is a build failure in three places.

### 2.3 Backend — `backend/src/`

| Layer | Count | Notes |
|---|---|---|
| Models | 31 files / 53 collections | Business IDs (`AST-1042`) as `_id`, minted from an atomic counter |
| Services | 14 | Where behaviour lives |
| Controllers | 12 | request → service → response, nothing else |
| Routers | 9 | Module-gated, mounted under `/api/v1` |
| Validators | 9 | Zod, per resource |
| Seed fixtures | 53 JSON files | Extracted from the prototype's data modules |

**Design decisions worth knowing**

- **One factory for reference reads.** ~30 read-mostly collections share `createResource`, so
  pagination and the sort allow-list are written once, not thirty times. A collection graduates out of
  it the moment it grows real rules.
- **One serialization choke point.** `_id` → `id` happens in `sendData`/`sendList`, so no endpoint can
  leak a raw Mongo shape.
- **The registration record lives on the asset.** Gates, tag bindings and commercial terms are facets
  of the asset, which also makes activation a single atomic write.
- **Append-only history.** Activity and audit have no update or delete path anywhere.
- **Seeded timestamps shift to seed time**, so "raised 3h ago" stays true instead of ageing with the
  fixture file.
- **Authorization is server-side.** `requireModule(...)` gates every route against the same matrix
  that draws the sidebar — a hidden section is also a refused request. The user is re-read per
  request, so a role change or suspension takes effect immediately.

### 2.4 Frontend — `frontend/src/`

| Area | Count |
|---|---|
| Screens (`pages/**/page.tsx`) | 119 |
| API modules (`api/`) | 16 |
| Components | 37 |
| Lib modules | 15 |

**How data reaches a screen.** Two aggregate endpoints — `GET /dataset` and
`GET /tracking/workspace` — are fetched once, hydrated into module bindings in `lib/dataset.ts` and
`lib/tracking-data.ts`, and read from there. `app/DataGate.tsx` holds the first render until the
payload lands, so a hundred ported screens keep their exact markup while becoming dynamic.

Each slice of `/dataset` is gated on the caller's module grants, so a Security Officer's payload
genuinely contains no financial or maintenance data.

> **The rule this creates:** never derive from those bindings at *module* scope in a screen. A value
> computed at import time is computed once and never refreshed. Derive inside the component.

Every screen is code-split by route.

### 2.5 Verified working end-to-end

Run against the local database on 2026-08-03, through the Vite proxy on `:5173` — the real browser path:

```
POST /auth/login (raj@bcss.in / admin123) → 200
  role      Super Admin (12 modules)
  refresh   cookie set (ag_refresh, httpOnly, SameSite=Lax, Path=/api/v1/auth)
GET  /auth/me            → 200
GET  /dataset            → 200   34 slices populated
GET  /tracking/workspace → 200   110 presence · 76 devices
GET  /assets/stats       → 200   14 assets, avg health 75
POST /auth/login (wrong password) → 401 UNAUTHORIZED
```

Build health: **typecheck 0 errors** across all three packages · **lint 0 errors** (36 warnings) ·
all three packages build.

---

## 3. Environment — resolved 2026-08-03

MongoDB Atlas was rejecting the TLS handshake (`alert 80`) whenever the machine's public IP was not on
the cluster's access list. On a dynamic IP that rotated three times in four days
(`49.43.229.98` → `49.43.230.193` → `124.123.14.2`), each rotation stopping development until the
allowlist was updated by hand.

**Now:** development runs against a project-local MongoDB under `.localdb/` (git-ignored, no sudo,
loopback-only), started by `npm run db:start` and brought up automatically by `dev` and `seed`. No IP
allow-list, no network round trip, and the seed runs in about a second instead of several minutes.

The Atlas URI is kept commented in `backend/.env` for when shared data is wanted; the allow-list
caveat applies again whenever it is swapped back in.

---

## 4. Code gaps — things half-wired

### 4.1 P1 — Writes that still do not persist

Screens write through `api/mutate.ts` (`useMutate`), which sends the change, re-reads the dataset so
every other screen agrees, and rolls back with a toast on failure. Seven screens are on it; the rest
still mutate local state only.

**Wired and verified:** alerts (acknowledge / escalate / resolve / bulk) · alert rules · work orders
(status, create) · notifications · AI insights · transfers · reservations · assets · asset classes.

**Still local-only** — the endpoints exist, the screens do not call them yet:

| Screen | Action | Endpoint | State |
|---|---|---|---|
| `maintenance/[id]` | Comment · log labour · tick checklist | `POST /work-orders/:id/{comments,labor}` | ✅ exists, ❌ not called |
| `tracking/geofences` | Create · edit · delete | `POST/PATCH/DELETE /tracking/geofences` | ✅ exists, ❌ not called |
| `tracking/infrastructure` | Register / remove a device | `POST/DELETE /tracking/sensors` | ✅ exists, ❌ not called |
| `assets/labels` | Save template · queue print job | `POST /labels/templates`, `/labels/jobs` | ✅ exists, ❌ not called |
| `admin/users` | Create · delete a user | `POST /users`, `DELETE /users/:id` | ✅ exists, ❌ not called |
| `settings/security` | Change password | `POST /auth/change-password` | ✅ exists, ❌ not called |

**Work:** for each, replace the `setState` handler with a React Query mutation from
`frontend/src/api/<resource>.ts` and call `useRefreshDataset()` on success. `RegistryProvider` is the
reference implementation — it writes optimistically and rolls back with a toast on failure.
**Effort: M** (roughly a day, mechanical and repetitive).

### 4.2 P0 — Missing endpoints behind the tracking workspace

The six tracking screens are fully interactive but have **no write endpoints at all** — the workspace
is read-only on the server. Acknowledging a tracking alert, closing an exception, approving an audit,
or checking an asset in and out are all in-session.

Needs new services + routes for: `TrackingAlert` (ack/assign/escalate/resolve, timeline append),
`Incident` (open/update/close), `InventoryException` (assign/resolve), `AuditSession` (start/count/
approve/close), `MovementTxn` (check-out/check-in), `UnknownDetection` (match/register/ignore),
`AutomationRule` (toggle/edit). **Effort: L.**

### 4.3 P1 — Update endpoints missing on reference collections

`createResource` only generates `list` and `getOne`. Every collection built on it is read-only:
PM schedules, inspections, reports, certifications, cycle counts, integrations, approval workflows,
asset groups, asset documents, AI models. Administration screens can display them but not edit them.

**Work:** extend the factory with optional `create`/`update`/`remove` handlers driven by a per-resource
Zod schema, then opt each collection in. **Effort: M.**

### 4.4 P1 — Three screens still on local sample content

`settings/security` (active sessions), `settings/api-tokens`, and `support` (tickets) have no backing
collection. They are marked with a `NOTE: sample content` comment in the source. Each needs a model,
routes and wiring. **Effort: M.**

### 4.5 P2 — Test suite

There are **no tests anywhere**. For a codebase this size that is the largest quality risk.

Minimum worth having:
- **Backend integration tests** (Vitest + `mongodb-memory-server`) over auth, RBAC gating, the
  work-order and alert state machines, and the `/dataset` module-gating. These encode the rules that
  are easy to break silently.
- **Frontend component tests** for `DataGate`, `RegistryProvider` (including the optimistic rollback),
  and the login flow.
- **A smoke test** that boots the app and hits every route for a 200/401.

**Effort: L.** Highest long-term value of anything on this list.

### 4.6 P2 — CI

No `.github/workflows`. Should run `npm run typecheck`, `npm run lint`, `npm run build` and the tests
on every push, so `main` cannot go red unnoticed. **Effort: S.**

### 4.7 P3 — Smaller cleanups

- **36 lint warnings** — 35 are `react-refresh/only-export-components` (files exporting both a
  component and helpers) and 1 `react-hooks/exhaustive-deps`. Harmless but noisy; splitting the helper
  exports into sibling modules clears them. **Effort: S.**
- **`/dataset` will not scale.** It is one payload for the whole reference set. Fine at ~1,500
  documents, wrong at 100,000. The per-resource paginated endpoints already exist; the migration is to
  move each screen onto them. Revisit when a single facility stops fitting comfortably in a response.
  **Effort: L, not yet needed.**
- **No API documentation.** No OpenAPI/Swagger spec; the route surface is only discoverable by reading
  `routes/`. **Effort: M.**
- **Frontend has no error boundary per route** beyond `RouteError`; a render crash in one screen takes
  the shell with it. **Effort: S.**

---

## 5. Feature gaps — things not built at all

These are capabilities the PRD claims that have **no implementation**, verified by search.

### 5.1 P0 — Multi-tenancy

`docs/11-technical-architecture.md` and `docs/16-security-compliance.md` describe a multi-tenant
platform. There is **no `tenantId` / `organizationId` anywhere in the codebase** — every query is
global, and any user can read every record their role permits regardless of organisation.

This is the most structural gap: retrofitting tenancy touches every model, every query, the auth
token, and the seed. Doing it later is dramatically more expensive than doing it next.

**Work:** add `tenantId` to every model and to the JWT claims; add a Mongoose plugin or query helper
that scopes every read and write; make `requireAuth` attach the tenant; partition the seed.
**Effort: L.**

### 5.2 P1 — Real-time updates

`docs/23-realtime-tracking-architecture.md` specifies live tracking. There is **no WebSocket, SSE or
socket.io** in the codebase. The tracking workspace polls every 60 seconds via React Query; positions,
alert states and device health do not stream.

**Work:** a WebSocket channel per facility, pushing presence and alert deltas; the client already
hydrates a module store, so it can apply patches to it directly. **Effort: L.**

### 5.3 P1 — File upload

Asset documents (`AssetDocument`) are modelled and seeded, but there is **no upload path** — no
`multer`, no object storage, no presigned URLs. The Asset 360 documents tab lists documents that
cannot actually be added or downloaded. **Effort: M.**

### 5.4 P1 — Notification delivery

`Notification` records exist and render in the in-app inbox, but nothing **sends** anything — no
email, SMS or push (no `nodemailer`/SendGrid/Twilio). Escalation policies and alert routing are
therefore display-only. **Effort: M.**

### 5.5 P1 — Background jobs

No scheduler (`node-cron`/BullMQ/Agenda). Several modelled behaviours need one:

- PM schedules never actually raise work orders when `nextDue` passes.
- Certifications never transition `Valid → Expiring → Expired`.
- Print jobs are queued but never progress — nothing moves `Queued → Printing → Completed`.
- Alert SLA breaches are a stored flag, not something a timer sets.
- Firmware campaigns never advance.

**Effort: M**, and it makes several existing screens honest rather than decorative.

### 5.6 P2 — Reporting & BI engine

`docs/17-reporting-bi.md` specifies a report builder, scheduled subscriptions and warehouse sync. The
`Report` collection stores report *definitions*; nothing executes them, renders a PDF/Excel, or
delivers them on a schedule. The Report Builder screen is a mock-up. **Effort: L.**

### 5.7 P2 — AI/ML pipeline

The MLOps collections (`AiModel`, `ForecastSeries`, `AnomalyEvent`, `Insight`) are modelled, seeded
and displayed with full explainability UI — but no model runs. Insights are fixtures, not predictions;
nothing scores an asset or detects an anomaly. **Effort: L** (or an integration, not a build).

### 5.8 P2 — Digital Twin

`tracking/twin/[facility]` renders a floor plan from stored zone rectangles. There is no CAD/BIM
import, no 3D, and no live sensor overlay beyond the presence dots. **Effort: L.**

### 5.9 P3 — Mobile apps

`docs/14-mobile-apps.md` specifies native apps for field technicians (scan-to-open, offline check-in/
out). Nothing exists; the responsive web app is the only client. **Effort: XL.**

### 5.10 P3 — Compliance operations

Data-retention policies, export/erasure requests (DPDP/GDPR) and immutable audit export are screens
without machinery behind them. The audit log is genuinely append-only, which is the important half.
**Effort: M.**

---

## 6. Suggested order

| # | Work | Why first |
|---|---|---|
| 1 | **§4.1** Wire the existing write endpoints | Largest visible gain for least work — the app stops forgetting what you did |
| 2 | **§5.1** Multi-tenancy | Structural; every day it waits makes it more expensive |
| 3 | **§4.2** Tracking workspace writes | The flagship pillar is currently read-only |
| 4 | **§4.5 / §4.6** Tests + CI | Lock in everything above before the surface grows |
| 5 | **§5.5** Background jobs | Makes PM, certifications and print queues real |
| 6 | **§4.3 / §4.4** Remaining CRUD + the three sample screens | Removes the last non-live data |
| 7 | **§5.2 / §5.3 / §5.4** Real-time, uploads, delivery | Feature depth once the foundation is solid |

Items 1–4 take the build from "a convincing demo that reads live data" to "an application you can
trust with real data".
