# 27. Access Genie — Platform Reference

**Document type:** As-built reference — every section, screen, role and rule
**Status:** Compiled from the working tree · **Audience:** Engineering, Product, Solution Consulting, new joiners

> Companion to, and deliberately distinct from, [00-master-blueprint.md](./00-master-blueprint.md).
> The blueprint (`docs/00–26`) describes the **target**. This document describes **what exists** — read from
> the shared contract, the route table, the Mongoose models and the navigation configuration.
> Counts are as measured, not as specified.

---

## At a glance

| | |
|---|---|
| **Screens** | 103 (`frontend/src/pages/**/page.tsx`) |
| **Collections** | 86 Mongoose models |
| **Endpoints** | ~230 under `/api/v1` |
| **Modules** | 11 permission keys |
| **Roles** | 7 across 5 tiers |
| **Lifecycle stages** | 10, governed |
| **Components** | 117 |
| **API client modules** | 35 |

---

## Contents

| § | Section |
|---|---------|
| 1 | [What the platform is](#1-what-the-platform-is) |
| 2 | [Architecture & stack](#2-architecture--stack) |
| 3 | [Roles & permissions](#3-roles--permissions) |
| 4 | [Site map](#4-site-map) |
| 5 | [Asset tracking & monitoring](#5-asset-tracking--monitoring) |
| 6 | [AI asset intelligence](#6-ai-asset-intelligence) |
| 7 | [Asset management](#7-asset-management) |
| 8 | [Lifecycle workflow](#8-lifecycle-workflow) |
| 9 | [Predictive maintenance](#9-predictive-maintenance) |
| 10 | [Security & compliance](#10-security--compliance) |
| 11 | [Mobile workforce & field operations](#11-mobile-workforce--field-operations) |
| 12 | [Analytics & reporting](#12-analytics--reporting) |
| 13 | [Administration](#13-administration) |
| 14 | [Data model](#14-data-model) |
| 15 | [API surface](#15-api-surface) |
| 16 | [Security posture](#16-security-posture) |
| 17 | [Vocabulary](#17-vocabulary) |
| 18 | [Running it](#18-running-it) |

---

## 1. What the platform is

Access Genie tracks physical and IT assets across a hierarchy of sites, and layers maintenance, compliance,
field work and machine-learned prediction on top of that one registry.

The organising principle is **one asset graph, many projections**. There is no separate "tracking database"
or "analytics warehouse" whose numbers can drift from the registry. An asset's location, its custody chain,
its work orders, its depreciation and its health score are all facets of — or references to — the same
document. When a report says an estate holds 4,200 assets, it counted the same rows the registry lists.

That principle has a visible consequence throughout: **nothing invents a number to fill a gap**. Where the
schema cannot answer what a screen asks, the API returns the shortfall in a `dataGaps` field and the figure
counts only what exists.

### 1.1 The six pillars

Every operational capability belongs to exactly one pillar, and each pillar answers a distinct question an
operator actually asks.

| # | Pillar | Answers | Core screens |
|---|--------|---------|--------------|
| 1 | **Asset Tracking & Monitoring** | Where things are now, where they've been, and whether they broke a rule | Live map & digital twin · Inventory reconciliation · Journeys, geofences, incidents |
| 2 | **AI Asset Intelligence** | Utilization, failure prediction, theft anomaly, CapEx forecasting — computed, not entered | Insight feed with actions · Model registry & explainability · Feedback loop |
| 3 | **Asset Management** | The registry itself — registration, templates, labelling, lifecycle, financials | Asset 360 · Templates, cloning, bulk import · Depreciation & book value |
| 4 | **Predictive Maintenance** | Work raised by prediction and schedule, not just by someone noticing | Automated work orders · PM schedules & predictive alerts · Inspections |
| 5 | **Security & Compliance** | Standing posture, formal audit campaigns, and an append-only record of who did what | Compliance monitoring · Audit Center & findings · Immutable audit log |
| 6 | **Mobile Workforce** | The field side — a technician's queue, dispatch, movement, and the approvals it triggers | My Work & scan-to-act · Scheduling & dispatch · Transfers, custody, approvals |

Three supporting sections sit alongside the pillars: **Workspace** (the dashboard, copilot and inbox),
**Analytics & Reporting**, and **Administration**.

> **The tracking technology is never a workflow.**
> RFID, BLE, GPS, QR, UWB and LoRaWAN are recorded against the device estate, but no operational screen asks
> a user to pick a radio. Operators reason about *location precision* — Precise, Room, Site, Last scan —
> because that is the fact that changes what they do next.

---

## 2. Architecture & stack

One repository, three npm workspaces, one `npm install`. A change to the API contract is a **compile error
in the client**, not a runtime surprise.

```
access-genie/
├── package.json          workspace root — dev / build / seed / lint scripts
├── eslint.config.mjs     one flat config for all three packages
├── shared/               the contract both sides compile against
├── backend/              Express 5 + Mongoose 8 REST API
├── frontend/             React 19 + Vite 6 SPA
└── docs/                 the blueprint (00–26) and this reference
```

### 2.1 The tiers

| Tier | Stack | Holds |
|------|-------|-------|
| **frontend** | React 19 · Vite 6 · Tailwind v4 · React Router 7 · TanStack Query 5 · axios | 103 screens, 117 components, 35 API modules |
| **shared** | TypeScript only | `platform` · `domain` · `registry` · `lifecycle` · `onboarding` · `tracking-workspace` · `analytics` · `governance` · `compliance` · `label` · `api` |
| **backend** | Express 5 · Mongoose 8 · Zod 4 · helmet · express-rate-limit · jsonwebtoken · bcryptjs | Routers → controllers → ~55 services → models |
| **database** | MongoDB | 86 collections |

Every string union in `shared/` is an `as const` array, so the same vocabulary drives the TypeScript type,
the Mongoose `enum` and the Zod validator. A typo in a state name fails the build in three places at once.

Business identifiers are the primary key — an asset is `AST-1042`, a lifecycle transition `LTX-…` — minted
from an atomic counter collection, so an id is legible in a URL, a log line and on a printed label.

### 2.2 Decisions worth knowing

- **Protection is positional, not per-route.** `/auth` mounts first and stays public; everything after
  `router.use(requireAuth)` and `router.use(attachScope)` is authenticated and scoped by construction.
  A new route cannot ship unprotected by forgetting a decorator.
- **One serialization choke point.** The `_id` → `id` rename happens inside `sendData`/`sendList`, so no
  endpoint can leak a raw Mongo shape.
- **One factory for reference reads.** ~30 read-mostly collections share `createResource`, so pagination and
  the sort allow-list are written once, not thirty times. A collection graduates out of it the moment it
  grows real rules.
- **Two aggregate reads hydrate the client.** `GET /dataset` and `GET /tracking/workspace` are fetched once
  and hydrated into module bindings; a data gate holds the first render until the payload lands. Each slice
  of `/dataset` is gated on the caller's grants, so a Security Officer's payload genuinely contains no
  financial data.
- **Append-only history.** Activity and audit have no update or delete path anywhere in the codebase.
- **Seeded timestamps shift to seed time**, so "raised 3h ago" stays true in a demo instead of ageing with
  the fixture file.

> ⚠️ **Docs vs. build.** `docs/11-technical-architecture.md` describes a target architecture — event-sourced
> core, Next.js App Router, polyglot persistence, 100k events/sec. What is built is the pragmatic realisation
> of that contract: a React SPA against an Express + MongoDB API. Read the blueprint for intent; read this
> document for what exists.

---

## 3. Roles & permissions

Eleven module keys gate everything. The same matrix draws the sidebar and guards the endpoint, so a hidden
section is **also a refused request** — never merely an absent menu item.

### 3.1 The eleven modules

| Key | Label | Covers |
|-----|-------|--------|
| `workspace` | Workspace | Dashboard, notifications, AI copilot, the home screen |
| `assets` | Assets | The registry, registration, templates, labelling, custody |
| `tracking` | Tracking | Live map, journeys, geofences, inventory, device estate |
| `ai` | AI | Insights, forecasting, anomaly detection, model registry |
| `maintenance` | Maintenance | Work orders, PM schedules, predictive alerts, inspections |
| `operations` | Operations | Transfers, reservations, cycle counts, dispatch, approvals |
| `analytics` | Analytics | Dashboard, saved reports, builder, scheduled deliveries, exports |
| `alerts` | Alerts | Alert queue, alert rules, escalation |
| `compliance` | Compliance | Compliance monitoring, audit campaigns, the audit log |
| `admin` | Admin | Users, roles, org structure, workflows, numbering, notification rules |
| `system` | System | API keys, integrations, backups, platform internals |

### 3.2 The role matrix

Seven roles across five tiers. Super Admin holds every module and its grant is **not narrowable**; the other
six are editable defaults a deployment overrides.

| Role | Tier | Wksp | Assets | Track | AI | Maint | Ops | Anlyt | Alerts | Compl | Admin | Sys |
|------|------|:----:|:------:|:-----:|:--:|:-----:|:---:|:-----:|:------:|:-----:|:-----:|:---:|
| Super Admin | Platform | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Organization Admin | Tenant Admin | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | − |
| Facility Manager | Management | ● | ● | ● | ● | ● | ● | ● | ● | ● | − | − |
| Maintenance Manager | Management | ● | ● | − | ● | ● | − | ● | ● | − | − | − |
| Technician | Field | ● | ● | ● | − | ● | − | − | − | − | − | − |
| Executive | Business | ● | − | − | ● | − | − | ● | − | ● | − | − |
| Security Officer | Field | ● | − | ● | − | − | − | − | ● | ● | − | − |

● granted · − no access.

"No access" and "reachable but no actions permitted" are **different states**: an empty action list is
representable, because an administrator can legitimately create one.

### 3.3 Actions within a module

Beyond the module gate, six actions are enforced per role per module:

`view` · `create` · `edit` · `delete` · `approve` · `manage`

The default set is derived from the role's **tier** rather than enumerated across a 7 × 11 grid, because such
a table is one nobody keeps correct.

### 3.4 Per-user grants

An administrator can grant an individual user modules on top of their role, resolved as a plain set union at
request time. The grant is **additive only** — there is no per-user revocation of something the role already
gives, because that would make "what can this person reach" two places to check whenever the answer is "less
than the role".

### 3.5 Scope: the location hierarchy

Orthogonal to roles. Every session resolves to a home scope node and everything beneath it. A `?scope=`
parameter naming anything outside that subtree is refused at the middleware, so every downstream route has a
validated scope by construction.

```
group ▸ org ▸ region ▸ facility ▸ building ▸ floor ▸ zone
```

A site that closes is **deactivated, not deleted** — the node keeps its id and every asset and user still
referencing it keeps that reference. Deleting would orphan them.

> ⚠️ **Scoping is a filter, not a tenancy boundary.** It restricts what a session sees across shared
> collections; anyone holding the grant can select any organisation in the tree. True isolation — a tenant key
> on every row, enforced below the query layer — is separate, larger work that has not landed.

---

## 4. Site map

Nine navigation sections, one row each in the sidebar. A section's children unfold only while it is active,
and every destination is reachable from the ⌘K command palette. Sections a role cannot enter are **hidden
outright** — role-adaptive, not greyed out — and the matching API routes return 403.

| Section | Module | Hub | Destinations |
|---------|--------|-----|--------------|
| **Dashboard** | `workspace` | `/` | `/` (the whole estate) · `/copilot` · `/notifications` |
| **Asset Tracking** | `tracking` | `/tracking` | `/tracking` · `/tracking/inventory` · `/tracking/journey` · `/tracking/geofences` · `/tracking/alerts` · `/tracking/infrastructure` |
| **AI Asset Intelligence** | `ai` | `/ai-insights` | `/ai-insights` · `/ai/utilization` · `/ai/predictive` · `/ai/theft` · `/ai/anomaly` · `/ai/forecasting` · `/ai/health` · `/ai/models` · `/ai/explainability` · `/ai/feedback` |
| **Asset Management** | `assets` | `/assets` | `/assets` · `/assets/new` · `/assets/templates` · `/assets/labels` · `/lifecycle` · `/financials` · `/assets/import` |
| **Predictive Maintenance** | `maintenance` | `/maintenance` | `/maintenance/dashboard` · `/maintenance` · `/predictive` · `/pm` · `/inspections` |
| **Security & Compliance** | `compliance` | `/compliance-reports` | `/compliance-reports` · `/audit` · `/audit-log` |
| **Mobile Workforce** | `operations` | `/workforce` | `/workforce` · `/my-work` · `/approvals` · `/work-orders` · `/scheduling` · `/asset-movement` · `/workforce-reports` |
| **Analytics & Reporting** | `analytics` | `/analytics` | `/analytics` · `/reports` · `/reports/builder` · `/reports/schedules` |
| **Administration** | `admin` | `/admin/users` | `/admin/users` · `/admin/org` · `/admin/workflows` · `/admin/numbering` · `/admin/notification-rules` |

### 4.1 What each role reaches

| Role | Modules | Sections | Destinations |
|------|:-------:|:--------:|:------------:|
| Super Admin | 11 / 11 | 9 / 9 | 54 |
| Organization Admin | 10 / 11 | 9 / 9 | 54 |
| Facility Manager | 9 / 11 | 8 / 9 | 49 |
| Maintenance Manager | 6 / 11 | 6 / 9 | 36 |
| Technician | 4 / 11 | 4 / 9 | 21 |
| Executive | 4 / 11 | 4 / 9 | 20 |
| Security Officer | 4 / 11 | 4 / 9 | 16 |

### 4.2 Routes outside the sidebar

Some destinations are reached by link, scan or redirect rather than navigation.

| Route | What it is |
|-------|-----------|
| `/a/:code` | Public scan target — a QR or NFC tag resolves here and redirects into the asset profile |
| `/assets/:id` | Asset 360 — the full profile, opened from anywhere an asset is named |
| `/assets/:id/edit` | Edit form for a registered asset |
| `/auth/login` · `/auth/mfa` · `/auth/forgot-password` | The unauthenticated shell |
| `/settings/profile` · `/security` · `/notifications` · `/appearance` · `/api-tokens` | Every session has these |
| `/help` · `/help/:article` · `/support` | Help centre and ticketing |
| `/whats-new` | Release notes |
| `/removed` · `/coming-soon` | Tombstones for retired routes and specced-but-unbuilt screens |
| `/certifications` · `/cycle-counts` · `/custody` · `/groups` · `/kits` · `/taxonomy` · `/alert-rules` | Reachable, off the primary nav |

---

## 5. Asset tracking & monitoring

Six screens, each answering exactly one question. Nothing here is named after a technology or a screen —
every row is a question an operator asks.

| Screen | Route | The question it answers |
|--------|-------|------------------------|
| Live Tracking | `/tracking` | Where is it now? |
| Inventory Tracking | `/tracking/inventory` | Is everything accounted for where it should be? |
| Asset Journey | `/tracking/journey` | Where has it been? |
| Geofence Monitoring | `/tracking/geofences` | Did it break a rule? |
| Alerts & Incidents | `/tracking/alerts` | What needs me right now? |
| Tracking Infrastructure | `/tracking/infrastructure` | Can we still hear? |
| Digital Twin | `/tracking/twin/:facility` | A visualisation launched from Live Tracking, not a destination of its own |

### 5.1 How location is expressed

The underlying radio is translated into a precision an operator can act on, then combined with a presence
state and a custody state. Together these three answer *"can I go get it right now?"*.

| Concept | Values |
|---------|--------|
| **Precision** | Precise (UWB) · Room (BLE, RFID) · Site (GPS) · Last scan (QR, handheld) |
| **Presence** | Online · Stale · Offline · In Transit · Missing |
| **Custody** | In Place · Checked Out · In Transit · Unaccounted |
| **Home zone** | Where the asset is *supposed* to be — the difference against its resolved zone raises the "misplaced" exception |

### 5.2 Inventory reconciliation

Rooms, racks and slots are modelled so a physical sweep can be compared against the record.

- **Slot states:** Present · Missing · Unexpected · Empty
- **Audit methods:** Automatic · Assisted · Manual
- **Room kinds:** Storeroom · Data Hall · Secure Cage · Staging · Dock
- **Audit sessions:** Scheduled → In Progress → Review → Approved → Closed

Detections that match no known asset land in an **unknown detection** queue with its own workflow — New,
Investigating, Matched, Registered, Ignored — which is how an untagged asset gets adopted into the registry.

### 5.3 Geofences and incidents

A geofence carries one of four rules — **Entry, Exit, Dwell, Restricted** — against a zone typed as
warehouse, dock, office, restricted, lab or yard. Breaches raise tracking alerts prioritised **P1–P4**, which
can be escalated into a formal incident that moves Open → Investigating → Contained → Resolved → Closed.

### 5.4 The device estate

Tracking Infrastructure is the hardware view: what is deployed, whether it is healthy, and where coverage has
holes.

| Concept | Values |
|---------|--------|
| Device roles | Tag · Reader · Gateway · Anchor · Scan Station · Sensor |
| Device states | Healthy · Degraded · Offline · Maintenance · Unprovisioned |
| Gateway states | Online · Degraded · Offline |
| Sensor states | Online · Offline · Low Battery |
| Event kinds | Movement · Custody · Detection · Alert · Audit · Device |
| Also modelled | Coverage cells · firmware campaigns · movement trails · pending scans |

Observations arrive singly or batched — `POST /tracking/observations` and `/observations/batch` — and are the
input from which presence, journeys and coverage are derived.

---

## 6. AI asset intelligence

Health, utilization and risk are **computed from observations, work orders and schedules** — never typed in.
A recompute endpoint regenerates the estate's scores and the findings drawn from them.

| Screen | Route | What it does |
|--------|-------|--------------|
| AI Insights Feed | `/ai-insights` | The generated findings, each actionable or dismissible |
| Utilization Analytics | `/ai/utilization` | Where capacity is idle and where it is strained |
| Predictive Failure | `/ai/predictive` | What is going to break, and roughly when |
| Theft & Custody Anomaly | `/ai/theft` | Custody patterns that do not look like normal use |
| Anomaly Detection | `/ai/anomaly` | Telemetry outliers, scored Critical / Warning / Info |
| CapEx Forecasting | `/ai/forecasting` | Replacement spend projected from age, condition and disposal history |
| Fleet Health Scoring | `/ai/health` | Health 0–100 rolled up across the estate |
| Model Registry | `/ai/models` · `/ai/models/:id` | Every model, versioned, with its serving status |
| Explainability | `/ai/explainability` | Why a given prediction was made |
| Model Feedback | `/ai/feedback` | Was this right? — the loop back into training |
| AI Copilot | `/copilot` | Conversational entry to the same intelligence |

### 6.1 The insight object

An insight is severity-graded — **Critical · Warning · Info · Opportunity** — and carries a *recommended
action* rather than only a statement. Acting on one and dismissing one are separate endpoints, so "we saw this
and chose not to act" is a recorded outcome rather than silence.

### 6.2 Model governance

Models are registered with a serving status of **Production, Staging, Shadow or Retired**. Shadow is the
important one: a model can run against live traffic and be measured without its output reaching a user.

- `GET /intelligence/explain/:id` — why this prediction
- `POST /intelligence/recompute` — re-derive the estate on demand

---

## 7. Asset management

The registry is the root of the graph: the record, where it is, what condition it is in, and what the models
predict about it, all on one object.

### 7.1 What an asset holds

| Group | Fields |
|-------|--------|
| **Identity** | Business id (`AST-1042`), name, category, serial number, manufacturer, model, tags |
| **State** | Status, health score 0–100, health status, criticality, risk score, utilization |
| **Place** | Scope node id and name, building, floor, zone, coordinates, map position |
| **People** | Custodian, plus the full custody record collection |
| **Money** | Purchase date, purchase price, book value, depreciation method, warranty expiry |
| **Sensing** | Tracking technology, tracking id, telemetry (temperature, humidity, vibration, battery, last ping) |
| **Governance** | Lifecycle stage — written only by the lifecycle workflow, never directly |
| **Registration** | Embedded onboarding record: readiness gates, tag bindings, commercial terms |

A **weighted text index** across name, serial, tracking id, manufacturer and model powers free-text search —
a name match scores 10, a manufacturer match 2. Serial numbers are unique *among assets that have one*,
enforced by a **partial index**, so any number of assets can have no serial while two still cannot share one.

### 7.2 Twelve categories

`Compute` · `Storage` · `Network` · `Endpoints` · `Mobile` · `Peripherals` · `Accessories` ·
`Audio Visual` · `Security` · `Software` · `Infrastructure` · `Sensors`

**Append-only** — this is a database enum, so removing or renaming a value orphans every document holding it.

### 7.3 Getting an asset in

Eight sources are recognised, and registration is a state machine rather than a form submit.

| Path | Route | Notes |
|------|-------|-------|
| Add Asset | `/assets/new` | Blank, from template, cloned from an existing asset, or from a scan |
| Asset Templates | `/assets/templates` | Sits next to Add Asset because that is where its value is felt: a template exists to make the form shorter |
| Bulk Import | `/assets/import` | Spreadsheet ingest with validation before commit |
| Purchase order | — | Received PO lines become draft assets |
| Adoption | — | An unknown detection promoted into a real record |
| ERP | — | Integration-sourced |

Registration moves **Draft → Pending Approval → Active**. Activation is gated by *readiness gates* the asset's
class demands — a gate is satisfied either by data being present **or** by an explicit recorded decision to
waive it, which is what stops the gate becoming a field nobody fills.

- **Tag bindings** carry a role (identity, location, telemetry) and a state (Bound, then Verified)
- **Tracking intent** is explicit: undecided · pending · not-tracked · bound
- **Ownership:** Owned · Leased · Third-party

### 7.4 Labelling

Label & Tag Printing lives with the registry rather than with tracking, because the job is "make this asset
scannable" and printing the label is the same event as binding the tag it carries.

- **Mediums:** QR · DataMatrix · Barcode · RFID · NFC
- **Sizes:** xs · sm · md · lg · xl
- **Print devices:** Online · Busy · Low media · Offline · Error
- **Print jobs:** Queued · Printing · Completed · Failed · Held · Cancelled — with retry and cancel as
  first-class actions

### 7.5 Financials

`/financials` holds acquisition value, book value and depreciation across the estate. The per-asset schedule
lives on the Asset 360 profile's Commercial tab rather than as a separate screen — a dedicated Depreciation
page was removed because it read the same source data and rendered the same KPI.

### 7.6 Asset 360

The profile at `/assets/:id` is the convergence point: identity and specification, live location and
precision, custody chain, work order history, inspection results, lifecycle timeline, documents, commercial
terms, component parent/child relationships, and the AI findings that reference it.

Documents attached to an asset are typed: Manual · Warranty · Certificate · Invoice · Image · CAD · Report.

---

## 8. Lifecycle workflow

Cradle-to-grave stage is a **governed state machine, not a status dropdown**. Every asset holds exactly one
stage, and every change between them is a transition record — there is no other write path.

### 8.1 The stages

| # | Stage | Legal next stages |
|---|-------|-------------------|
| 1 | Planning | Procurement |
| 2 | Procurement | Received |
| 3 | Received | Commissioning |
| 4 | Commissioning | Available |
| 5 | Available | Assigned / In Service · Retired |
| 6 | Assigned / In Service | Maintenance · Returned · Retired |
| 7 | Maintenance | Assigned / In Service · Retired |
| 8 | Returned | Assigned / In Service · Available · Retired |
| 9 | Retired | Disposed |
| 10 | Disposed | *terminal* |

Stages 1–4 are a linear spine. Stages 5–8 carry **re-entrant edges** — real fleets loop, and maintenance and
returns must not dead-end:

- `Maintenance → Assigned / In Service` — maintenance returns an asset to service
- `Returned → Assigned / In Service` or `→ Available` — back into service, or back to the pool
- `Available / In Service / Maintenance / Returned → Retired` — retirement is reachable from any in-life stage

### 8.2 How a transition works

- A transition is **Applied** immediately, or held **Pending** an approval when policy demands one.
- Rows are **never updated once Applied or Rejected**. A Pending row is the only mutable state — it becomes
  Approved-and-applied, or Rejected. That immutability is what makes the collection an **audit trail** rather
  than another activity feed.
- Each transition carries a reason, optional comments, the requester, attached document ids, and per-role
  approval sub-records with actor and timestamp.
- An `automated` flag separates system-raised transitions — a work order opening or closing, custody being
  assigned, a registration completing — from a person choosing "Change Stage".
- Bulk stage changes return three lists: `updated`, `pendingApproval`, and `failed` with a per-asset reason.
  A partial success is reported as one, not silently swallowed.

The screen at `/lifecycle` presents this as a board with KPIs — assets per stage, and how many are waiting on
an approval.

> **A documented role mapping.** The specification names six operational roles — IT Administrator, Asset
> Manager, Maintenance Engineer, Department Manager, Finance, Auditor — that do not exist as distinct platform
> roles. Rather than introduce them and touch auth, seeding and user admin app-wide for one module's workflow,
> the lifecycle matrix maps them onto the existing seven (IT Administrator → Organization Admin / Super Admin,
> and so on). The mapping is written down in the contract, not left implicit.

---

## 9. Predictive maintenance

Five screens covering the whole arc: what is coming, what is scheduled, what is open, and what was inspected.

| Screen | Route | Purpose |
|--------|-------|---------|
| Maintenance Dashboard | `/maintenance/dashboard` | The read-only overview — where you look before deciding which screen to open |
| Automated Work Orders | `/maintenance` | Where the work actually happens; the section lands here |
| Predictive Alerts | `/predictive` | Something is *going to* fail — distinct from the operational alert centre |
| Preventive (PM) | `/pm` · `/pm/:id` | Recurring schedules that raise work automatically |
| Inspections & Checklists | `/inspections` · `/inspections/:id` | One row, because it is one workflow: a checklist is the template an inspection executes from |

### 9.1 Work orders

| | |
|---|---|
| **Types** | Preventive · Corrective · Predictive · Inspection |
| **Priorities** | Low · Medium · High · Critical |
| **Statuses** | New · Assigned · In Progress · On Hold · Completed · Cancelled |
| **Actions** | Assign · change status · log labour · comment · reopen — each its own endpoint, so each is separately auditable and separately permissioned |

### 9.2 PM schedules

Frequencies are Monthly, Quarterly, Semi-Annual, Annual or Usage-based.
`POST /pm-schedules/run-automation` sweeps due schedules and raises the resulting work orders.

> ⚠️ **A trap worth naming.** A schedule's `lastDone` is stamped at creation and **never advanced** by the
> automation. To count preventive completions, count the work orders the schedule raised — do not read that
> field.

### 9.3 Inspections

A template defines typed questions — **Pass/Fail · Yes/No · Number · Text · Note** — under one of five
inspection types: Safety, Compliance, Condition, Operational, Preventive. An execution moves
Scheduled → In Progress → Passed **or** Failed, with each response resolving to Pass, Fail, N/A or Pending.

The important edge: a failed question can raise a **corrective action** directly from the inspection —
`POST /inspections/:id/corrective`, per-question via `/corrective/:key` — which is how an inspection failure
becomes scheduled work instead of a note nobody reads. Inspections can be raised in bulk against every asset a
template targets.

### 9.4 The unified maintenance read

`GET /maintenance-dashboard` aggregates across work orders, PM schedules and inspections over a chosen period
(`7d` · `30d` · `3m` · `6m` · `1y` · `custom`), classified by kind (Corrective, Preventive, Predictive,
Inspection) and source. It is gated on the **same grant as the modules it aggregates**, so no role can see
figures it would be refused the underlying records for.

---

## 10. Security & compliance

Three screens, three genuinely different things: the standing posture, the formal campaign, and the immutable
record.

| Screen | Route | What it holds |
|--------|-------|---------------|
| Compliance Monitoring | `/compliance-reports` | Standing compliance records, continuously swept |
| Audit Center | `/audit` · `/audit/:id` | Formal audit campaigns with findings and evidence |
| Immutable Audit Log | `/audit-log` | Append-only record of who did what, filterable by category and actor |
| Certifications | `/certifications` | Certificates tracked Valid / Expiring / Expired |

### 10.1 Compliance records

Each record carries a severity (Low, Medium, High, Critical), a status (Open, In Progress, Resolved, Waived)
and a source — Manual, Audit or Automated. **Waived is deliberately a status, not a deletion**: an accepted
risk stays visible with its acceptance recorded.

### 10.2 Audit campaigns

An audit is typed Internal, External, Regulatory, Safety, Financial or Physical, and moves
Planned → In Progress → Completed → Closed. Findings raised inside it have their own lifecycle — Open,
In Progress, Resolved, Waived — with evidence attached, which is what lets a closed audit still be defended
months later.

### 10.3 Custody chain

Every handover is a record: **Assigned · Checked Out · Checked In · Transferred**. A custody move is treated
as a *domain action* rather than an insert — it also reassigns the asset and writes its timeline entry, in one
operation, so the two can never disagree.

### 10.4 Alert rules

Rules at `/alert-rules` are readable and writable by both the `alerts` and `compliance` grants, since the same
rule engine serves an operational alert and a compliance breach. Alerts move
Open → Acknowledged → Escalated → Resolved at severities Critical, Warning or Info, with **bulk transition**
supported for triaging a flood.

---

## 11. Mobile workforce & field operations

The field side of the platform — designed for a phone in a warehouse, and for the approvals that field work
triggers.

| Screen | Route | Purpose |
|--------|-------|---------|
| Workforce Dashboard | `/workforce` | Team-level view of load and completion |
| My Work | `/my-work` | One technician's queue — the screen a field user lives in |
| Approvals | `/approvals` | The queue approval workflows route to |
| Work Orders | `/work-orders` | The operational board across the whole team |
| Scheduling & Dispatch | `/scheduling` | Assigning work to technicians and shifts |
| Asset Movement & Custody | `/asset-movement` | Transfers, check-out and check-in |
| Workforce Reports | `/workforce-reports` | Labour, throughput and completion analysis |
| Cycle Counts | `/cycle-counts` | Scheduled → In Progress → Reconciled, or Variance |

### 11.1 Field endpoints

The mobile surface is deliberately narrow:

- `GET /field/queue` — the signed-in technician's work
- `GET /field/queue/all` — the dispatcher's view
- `POST /field/scan/:id` — scan-to-act; resolves the asset and offers the actions valid for it right now

### 11.2 Movements and transfers

A movement has a direction (**Out** or **In**) and a state — Open, Returned, Overdue, Pending Approval,
Rejected — so an overdue check-out is a first-class state rather than a date comparison somebody has to
remember to make.

Transfers and reservations are real collections with **segregation of duties and double-booking refused
server-side**: the person who requests a transfer cannot be the person who approves it, and two reservations
cannot claim the same asset for the same window.

### 11.3 Approvals

Workflows trigger on `asset_transfer`, `asset_disposal` or `purchase_request`; a workflow is Active, Inactive
or Draft, and a request resolves Pending → Approved / Rejected / Cancelled.

Approvals sit with operational work rather than under Administration, because approving a transfer is a job a
facility manager does, not a configuration change.

### 11.4 Technician roster

Technicians are a real model scoped like an asset's location — not a client-side list. On-call shifts and
escalation policies are modelled alongside, so "who gets this at 2am" has an answer in the data.

---

## 12. Analytics & reporting

Four destinations, gated as **one module**: a role that cannot open the dashboard must not be able to reach
the same figures through a report or an export.

| Screen | Route | Purpose |
|--------|-------|---------|
| Analytics Dashboard | `/analytics` | The organisation-wide read, aggregated live |
| Reports | `/reports` · `/reports/:id` | The saved report library |
| Report Builder | `/reports/builder` | Compose a question against the shared field catalogue |
| Scheduled Reports | `/reports/schedules` | Recurring deliveries — Daily, Weekly, Monthly or Quarterly |

### 12.1 No analytics collection — by design

Every figure is aggregated live from the collections the other modules already write. There is **no stored
copy** of "how many assets are there", because a stored copy is a number that can disagree with the registry —
and the entire point of the module is that it cannot.

### 12.2 The report engine

The builder renders **the same field catalogue the server executes**. A field the interface offers but the
server cannot group by is a class of bug removed by construction rather than caught in testing.

| | |
|---|---|
| **Periods** | 30d · 90d · 6m · 12m · ytd · all · custom |
| **Operators** | eq · ne · in · gt · gte · lt · lte · between · contains |
| **Visualizations** | table · bar · line · pie · donut |
| **Exports** | csv · xlsx · pdf · json |
| **KPIs** | Total assets · Total value · Assigned · Under maintenance · Due maintenance · Overdue maintenance · End of life · Recently added · Transfers |

Export is an **action wherever a report is shown**, not a separate destination — a file you request in one
place and collect in another is two screens for one job.

---

## 13. Administration

Five screens that govern how the platform behaves: who may act, where they act, what needs sign-off, how
records are numbered, and when people are told.

| Screen | Route | What it governs |
|--------|-------|-----------------|
| Users & Roles | `/admin/users` · `/admin/users/:id` | Accounts, invitations, suspension, password reset, per-user extra module grants — with Roles & Permissions as a **tab**, not a separate screen |
| Org & Structure | `/admin/org` | The scope hierarchy every access grant is measured against |
| Approval Workflows | `/admin/workflows` | What requires sign-off, and from whom |
| Numbering & ID Rules | `/admin/numbering` | How assets, work orders, transfers and inspections are numbered |
| Notification Rules | `/admin/notification-rules` | Which events reach which people, on which channel |

### 13.1 Why roles moved into Users

A role is only ever reasoned about in terms of the people holding it. Splitting the two meant crossing the
navigation to answer "what can this person actually do". **Teams** went with it — it was a grouping nothing
enforced — and **Facilities** went because it was a second view of the same hierarchy Org & Structure owns,
and two screens editing one tree is how the two drift.

### 13.2 Numbering rules

Four entity types can be numbered — `asset`, `workOrder`, `transfer`, `inspection` — with the sequence scoped
`global`, per `facility` or per `category`. Patterns compose from tokens:

`{PREFIX}` · `{CATEGORY}` · `{FACILITY}` · `{YYYY}` · `{YY}` · `{MM}` · `{SEQ}`

### 13.3 Notification rules

A rule matches on conditions using `eq`, `neq`, `in`, `gt` or `lt`, and delivers to recipients resolved as a
**role**, a named **user**, or **"the requester"**. Channels are `in_app`, `email` and `webhook`.

Rules can be **previewed and test-fired before saving**, and every delivery is logged — so "why did I get
this" and "why didn't I" both have answers.

### 13.4 Built but off the sidebar

Screens exist for branding, billing, integrations, webhooks, API keys, data and backups, teams and facilities.
They were deliberately removed from navigation as either platform plumbing that belongs in a deployment's own
tooling, or presentation and commercial settings that are not administration of the asset estate. The routes
still resolve.

---

## 14. Data model

86 collections. Business identifiers are the primary key throughout, minted from an atomic counter so an id is
meaningful in a URL, a log line and on a printed label.

| Domain | Collections |
|--------|-------------|
| **Registry** | Asset · AssetTemplate · AssetGroup · AssetDocument · Counter · Activity |
| **Lifecycle** | LifecycleTransition · Transfer · Reservation · MovementTxn · MovementTrail |
| **Tracking** | AssetPresence · AssetJourney · TrackingDevice · TrackingEvent · TrackingAlert · TrackedFacility · TrackedZone · CoverageCell · Gateway · Sensor · Zone · Geofence · UnknownDetection · PendingScan · FirmwareCampaign · Incident |
| **Inventory** | InventoryRoom · InventoryException · Rack · CycleCount · AuditSession |
| **Maintenance** | WorkOrder · PmSchedule · Inspection · InspectionTemplate · PredictiveAlert · Technician · OnCallShift · EscalationPolicy |
| **Intelligence** | Insight · AiModel · AnomalyEvent · ForecastSeries · MetricSnapshot |
| **Compliance** | ComplianceRecord · Audit · AuditFinding · AuditLog · Certification · CustodyRecord |
| **Governance** | ApprovalWorkflow · ApprovalRequest · AutomationRule · NumberingRule · NotificationRule · NotificationRuleLog · RoleGrant |
| **Platform** | User · UserPreference · RefreshToken · Passkey · Team · ScopeNode · OrgSettings · ApiKey · Integration · Webhook · Backup · RateLimitHit |
| **Reporting** | Report · ReportPack · ReportSubscription · ExportJob · ExportArtifact · Invoice |
| **Labelling** | LabelTemplate · PrintDevice · PrintJob |
| **Support** | Notification · HelpArticle · HelpCategory · SupportTicket · ReceivedPoLine |

### 14.1 Indexing notes

- **Weighted text search** on assets across name, serial, tracking id, manufacturer and model — a name match
  scores 10, a manufacturer match 2.
- **Partial unique index** on serial number covering only non-empty values, so serial-less assets do not
  collide.
- **Timeline compounds** — `{ assetId: 1, requestedAt: -1 }` and the equivalent on activity — because "newest
  first for this asset" is the dominant read.
- Index changes require an explicit sync run; `syncIndexes()` drops the superseded index and builds its
  replacement. See `npm run db:indexes`.

> ⚠️ **Connection pool size is 1 in this deployment.** Every query serialises. Minimise round trips per request
> and expect cold page loads in the ~20s range — this is the single largest performance characteristic to
> design around.

---

## 15. API surface

Everything under `/api/v1`. Auth mounts first and stays public; every route after the guard is authenticated
and scoped **by position in the router**, not by remembering a decorator.

### 15.1 Authentication

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/auth/login` | Exchange credentials for a token pair |
| `POST` | `/auth/refresh` | Rotate the refresh token |
| `POST` | `/auth/logout` · `/auth/logout-all` | End this session, or every session |
| `GET` | `/auth/me` | The current session payload |
| `PATCH` | `/auth/me` | Self-service profile update |
| `POST` | `/auth/change-password` | Rotate own password |
| `POST` | `/auth/mfa/setup` · `/verify` · `/enable` · `/disable` | TOTP enrolment; the secret never leaves the server |
| `POST` | `/auth/mfa/recovery-codes` | Regenerate recovery codes |
| `GET` | `/auth/sessions` | Active sessions, individually revocable |
| `POST` | `/auth/passkeys` | Register a passkey |

### 15.2 Core resources

| Mount | Gate | Notable operations |
|-------|------|--------------------|
| `/assets` | `assets` | List with facets, detail, profile, lifecycle, clone source, bulk create, registration form and catalog, validate |
| `/work-orders` | `maintenance` | Board, assign, status, labour, comments, reopen |
| `/inspections` · `/inspection-templates` | `maintenance` | Start, respond, complete, assign, bulk raise, corrective actions, failures, facets, stats |
| `/pm-schedules` | `maintenance` | CRUD plus `run-automation` |
| `/alerts` | `alerts` | Acknowledge, escalate, resolve, dismiss, assign, bulk transition, count |
| `/predictive-alerts` | `maintenance` | The "going to fail" board — distinct from `/alerts` |
| `/tracking` | `tracking` | Workspace, live, devices, gateways, sensors, geofences, journeys, observations, movements, incidents, jobs |
| `/compliance-records` · `/audits` | `compliance` | Records, campaigns, findings, evidence |
| `/operations` | `operations` | Transfers, reservations, cycle counts, field queue, scan |
| `/users` | `admin` | Accounts, roles, personas, grants |
| `/labels` | `assets` | Templates, print devices, print jobs, retry, cancel |
| `/analytics` | `analytics` | Catalogue, preview, saved reports, schedules |
| `/insights` | `ai` | Feed, stats, act, dismiss |
| `/scope` | read open, write `admin` | The hierarchy tree — reads are ungated because every screen showing a location needs it |
| `/me/preferences` · `/me/views` | none | Theme and saved views — always the session's own; there is no route that reads someone else's |
| `/notifications` | none | Every session has an inbox |

### 15.3 Response envelope

Every response is wrapped. Successes carry `success: true` and a `data` payload — lists add pagination meta —
and failures carry `success: false` with a stable machine-readable `error.code` and a human message. The
envelope is applied in **one place**, which is also where `_id` becomes `id`.

---

## 16. Security posture

Authorization is server-side and re-resolved per request. The client hides navigation as a courtesy; the
endpoint is what actually refuses.

| Control | How it works |
|---------|--------------|
| **Session** | Short-lived JWT access token plus a rotating refresh token. The user record is **re-read on every request** rather than trusted from token claims — one indexed lookup, in exchange for a suspension or role change taking effect immediately instead of at token expiry. |
| **Passwords** | bcrypt. A wrong email and a wrong password produce the **identical error**, and the comparison runs even when no user matched, so response timing does not distinguish the two. |
| **MFA** | TOTP with recovery codes. The secret never leaves the server; enrolment is verified before it is enabled. Passkeys are modelled alongside. |
| **Rate limiting** | Counted **in MongoDB, not process memory** — an in-memory budget is per-instance and per-restart, so a two-instance deploy silently doubles the ceiling and every deploy resets it. Login and refresh get a much tighter IP-keyed budget, and only *failed* attempts count toward it. |
| **Authorization** | Module gate on the route, plus six per-module actions. Same matrix as the sidebar, so a hidden section is a refused request. |
| **Scope** | Resolved once in middleware; a scope parameter outside the session's subtree is refused before any handler runs. |
| **Payload gating** | Each slice of the aggregate dataset read is gated independently, so a Security Officer's payload contains no financial or maintenance data — not hidden client-side, **absent from the wire**. |
| **Validation** | Zod on params, query and body for every write. Partial updates use an explicit partial helper — a naive `.partial()` retains schema defaults and silently overwrites fields the caller never sent. |
| **Audit** | Append-only. No update or delete path exists in the codebase for activity or audit records. |
| **Transport** | Helmet headers, CORS allow-list, compression, request ids on every log line. |

---

## 17. Vocabulary

Every controlled value in the product, in one place. Each is a single `as const` array driving the TypeScript
type, the database enum and the validator at once.

| Set | Values |
|-----|--------|
| Asset status | Active · Maintenance · Missing · End_Of_Life · Staging |
| Asset health | Good · Warning · Critical |
| Criticality | Low · Medium · High · Critical |
| Lifecycle stage | Planning · Procurement · Received · Commissioning · Available · Assigned / In Service · Maintenance · Returned · Retired · Disposed |
| Transition status | Applied · Pending · Approved · Rejected |
| Tracking tech | RFID · BLE · GPS · QR · UWB · LoRaWAN |
| Location precision | Precise · Room · Site · Last scan |
| Presence | Online · Stale · Offline · In Transit · Missing |
| Custody state | In Place · Checked Out · In Transit · Unaccounted |
| Custody action | Assigned · Checked Out · Checked In · Transferred |
| Work order status | New · Assigned · In Progress · On Hold · Completed · Cancelled |
| Work order type | Preventive · Corrective · Predictive · Inspection |
| Maintenance status | Open · In Progress · On Hold · Completed · Failed · Cancelled |
| PM frequency | Monthly · Quarterly · Semi-Annual · Annual · Usage-based |
| Inspection status | Scheduled · In Progress · Passed · Failed |
| Inspection question | Pass/Fail · Yes/No · Number · Text · Note |
| Alert status | Open · Acknowledged · Escalated · Resolved |
| Alert severity | Critical · Warning · Info |
| Alert priority | P1 · P2 · P3 · P4 |
| Incident state | Open · Investigating · Contained · Resolved · Closed |
| Geofence rule | Entry · Exit · Dwell · Restricted |
| Zone type | warehouse · dock · office · restricted · lab · yard |
| Device role | Tag · Reader · Gateway · Anchor · Scan Station · Sensor |
| Device state | Healthy · Degraded · Offline · Maintenance · Unprovisioned |
| Rack slot | Present · Missing · Unexpected · Empty |
| Audit state | Scheduled · In Progress · Review · Approved · Closed |
| Audit type | Internal · External · Regulatory · Safety · Financial · Physical |
| Compliance status | Open · In Progress · Resolved · Waived |
| Cycle count | Scheduled · In Progress · Reconciled · Variance |
| Movement direction | Out · In |
| Movement state | Open · Returned · Overdue · Pending Approval · Rejected |
| Unknown detection | New · Investigating · Matched · Registered · Ignored |
| Registration | Draft · Pending Approval · Active |
| Ownership | Owned · Leased · Third-party |
| Model status | Production · Staging · Shadow · Retired |
| Insight severity | Critical · Warning · Info · Opportunity |
| Certification | Valid · Expiring · Expired |
| Print job | Queued · Printing · Completed · Failed · Held · Cancelled |
| Document type | Manual · Warranty · Certificate · Invoice · Image · CAD · Report |
| Notification channel | in_app · email · webhook |
| Recipient kind | role · user · requester |
| Permission action | view · create · edit · delete · approve · manage |
| Approval trigger | asset_transfer · asset_disposal · purchase_request |
| Scope level | group · org · region · facility · building · floor · zone |

---

## 18. Running it

Node 20.19 or newer, one install at the workspace root, one command to bring up both sides.

| Command | What it does |
|---------|--------------|
| `npm run dev` | Builds the shared contract, then runs the API and the client concurrently |
| `npm run build` | Shared, then backend, then frontend |
| `npm run typecheck` | Type-checks all three workspaces |
| `npm run lint` | One flat ESLint config across every package |
| `npm run seed` · `seed:fresh` | Baseline fixtures; `:fresh` drops first |
| `npm run seed:demo` · `seed:demo:fresh` | The full demo estate |
| `npm run db:indexes` | Sync indexes — **required** after any index definition change |
| `npm run migrate:lifecycle` | Backfill lifecycle stage on existing assets |
| `npm test` | Isolation, analytics and admin harnesses in sequence |

> ⚠️ **Never build or type-check while the test harnesses run.** A rebuild restarts the API mid-suite, which
> kills the run and leaves fixtures behind in the live database.

### 18.1 Configuration

Both sides are fully environment-driven and **validated at boot**, so a missing or malformed variable fails
immediately with a named cause rather than surfacing as a confusing runtime error later. Rate-limit windows
and ceilings, token lifetimes, database URI and CORS origins are all configured this way.

---

*Compiled from the working tree: the shared contract, the route table, the Mongoose models and the navigation
configuration. Where the `docs/00–26` blueprint describes a target the build has not reached, this document
describes the build.*
