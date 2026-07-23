# 0. Master Blueprint — Access Genie AI Asset Intelligence Platform

**Document type:** Product Requirements Document (PRD) — master index, coverage plan & build sequencing
**Version:** 2.0 · **Status:** Planning (pre-rebuild) · **Owner:** Product Architecture
**Audience:** Executives, PM, Architecture, Engineering, Design, Sales

> This is the **control document** for the entire blueprint. It defines *what sections exist*, *what each
> section must contain*, *proof that every requested deliverable is covered*, *the complete page inventory
> from the login screen to every deep page*, and *the order in which we build*. Read this first; every other
> `docs/NN-*.md` is a projection of the plan defined here.

---

## 0.1 What we are building (one paragraph)

**Access Genie AI** is an **Enterprise Asset Intelligence Platform** — not an asset-tracking app. It fuses EAM
(work orders, lifecycle, financials), RTLS/IoT tracking (RFID/BLE/UWB/GPS/LoRaWAN), a live **Digital Twin**,
**native explainable AI** (health, prediction, risk, optimization), and embedded **BI** on top of a single
**event-sourced asset graph**, multi-tenant to the core, designed for **10M+ assets/tenant** across many
industries. Positioning shorthand: *ServiceNow's workflow engine + IBM Maximo's asset depth + Zebra
MotionWorks' RTLS + Samsara's IoT/telematics + a native AI/Digital-Twin core* — but built as **one object
graph**, where the tracking dot, the work order, and the depreciation line are **the same asset**.

Full vision → [01-product-vision.md](./01-product-vision.md).

---

## 0.2 The blueprint document set (sections that will exist)

Each row is one document. "New" docs are produced in this rebuild; "Exists" are already written and will be
reconciled to this master. Together they form the production-ready blueprint.

| # | Document | What it defines | Covers deliverable(s) | Status |
|---|----------|-----------------|-----------------------|--------|
| 00 | **[Master Blueprint](./00-master-blueprint.md)** (this) | Section map, coverage matrix, page inventory, build order | Meta / all | New |
| 01 | [Product Vision](./01-product-vision.md) | Vision, mission, goals, customers, industries, USPs, roadmap | 1 | Exists |
| 02 | [Personas & RBAC](./02-personas.md) | Every role: responsibilities, permissions, dashboard, workflow, KPIs | 2 | Exists |
| 03 | [Information Architecture](./03-information-architecture.md) | Navigation, module→page map, IA principles | 3 | Exists |
| 04 | [Dashboards](./04-dashboards.md) | 8 role dashboards: widgets, charts, tables, maps, KPIs, actions | 4 | Exists |
| 05 | [Feature Matrix](./05-feature-matrix.md) | 300+ features by module, phased & prioritized | 5 | Exists |
| 06 | **[Page Catalog](./06-page-catalog.md)** | Every page: purpose, components, actions, forms, permissions, states | 6 | New |
| 07 | **[Asset Lifecycle](./07-asset-lifecycle.md)** | Cradle-to-grave state machine, per-stage roles/data/events | 7 | New |
| 08 | **[AI & Intelligence](./08-ai-intelligence.md)** | Every AI module: inputs, method, outputs, explainability, governance | 8 | New |
| 09 | **[Tracking Technologies](./09-tracking-technologies.md)** | RFID/BLE/UWB/GPS/LoRaWAN/QR/NFC/WiFi/vision — where & why each | 9 | New |
| 10 | **[Asset 360° Profile](./10-asset-360-profile.md)** | The 14-tab asset object page, field-by-field | 10 | New |
| 11 | **[Technical Architecture](./11-technical-architecture.md)** | FE/BE, microservices, event bus, IoT gateway, AI svc, HA/DR | 11 | New |
| 12 | **[Database Design](./12-database-design.md)** | ERD, entities, keys, indexes, event/telemetry/audit/history tables | 12 | New |
| 13 | **[API Design](./13-api-design.md)** | REST + GraphQL + streaming, resources, auth, webhooks, versioning | 13 | New |
| 14 | **[Mobile & Edge Apps](./14-mobile-apps.md)** | Technician/Manager/Security/Executive apps, offline, scanning | 14 | New |
| 15 | **[Design System](./15-design-system.md)** | Tokens, components, patterns, dark mode, a11y, responsive | 15 | New |
| 16 | **[Security & Compliance](./16-security-compliance.md)** | RBAC/ABAC, SSO/OAuth/JWT/MFA, encryption, GDPR/SOC2/ISO27001 | 16 | New |
| 17 | **[Reporting & BI](./17-reporting-bi.md)** | Report types, builder, BI explorer, scheduling, exports | 17 | New |
| 18 | **[Roadmap & Innovation](./18-roadmap.md)** | Digital twin, drones, robots, AR, edge AI, marketplace | 18 | New |
| 19 | **[User Flows](./19-user-flows.md)** | End-to-end flows: login/onboarding → WO → incident → audit → disposal | 2,6,7 (cross) | New |
| 20 | **[Implementation Plan](./20-implementation-plan.md)** | Build order login→every page, phasing, demo rebuild, DoD | Build (meta) | New |

---

## 0.3 Coverage matrix — proving nothing is missed

Every deliverable you listed maps to at least one document **and** is validated below. The rightmost column is
the explicit *coverage check* you asked for.

| Your deliverable | Primary doc(s) | Coverage assertion |
|------------------|----------------|--------------------|
| 1. Product Vision | 01 | Vision, mission, goals, customers, 12 industries, USPs, roadmap — all present. |
| 2. User Personas (16+) | 02, 19 | 16 roles × {responsibilities, permissions, dashboard, workflow, KPIs} + login/onboarding flow. |
| 3. Information Architecture | 03, 00§0.5 | 20 modules, role-adaptive nav, module→page map, scope tree. |
| 4. Dashboard Planning (8) | 04 | 8 dashboards × {widgets, cards, charts, tables, maps, KPIs, quick actions, filters, AI}. |
| 5. Complete Feature List (300+) | 05 | 304 features across 20 modules + cross-cutting + AI-native. |
| 6. Complete Page List | 06, 00§0.6 | Full page inventory (login→every page) here; per-page spec (states/permissions) in 06. |
| 7. Asset Lifecycle | 07 | Procurement→registration→assignment→tracking→maintenance→transfer→repair→audit→replace→dispose. |
| 8. AI Features | 08 | 20+ AI modules, each with method + explainability + governance + copilot + NL search + gen reports. |
| 9. Tracking Technologies | 09 | 14 technologies, decision matrix of where each is used + sensor fusion + gateway abstraction. |
| 10. Asset Detail Page | 10 | 14-tab 360° profile: overview→timeline→tracking→health→maint→warranty→ownership→docs→sensors→AI→history→audit→risk→finance. |
| 11. Enterprise Architecture | 11 | FE/BE, microservices, gateway, auth, DB, cache, event bus, MQ, IoT gateway, AI, storage, analytics, monitoring, security, scale, deploy, DR, HA. |
| 12. Database Design | 12 | ERD, entities, PK/FK, indexes, normalization, audit/history/event/telemetry tables + partitioning. |
| 13. APIs | 13 | Auth, Assets, Tracking, Maintenance, Users, Notifications, Reports, AI + webhooks/streaming/GraphQL. |
| 14. Mobile Application | 14 | Technician/Manager/Security/Executive + offline, push, QR/RFID/NFC, GPS, camera, voice. |
| 15. UI/UX Planning | 15 | Sidebar, topnav, tables, cards, charts, forms, dialogs, notifications, timeline, maps, dark mode, a11y, responsive. |
| 16. Security | 16 | RBAC, SSO, OAuth, JWT, MFA, encryption, audit logs, GDPR, SOC2, ISO27001 + ABAC/SoD/break-glass. |
| 17. Reporting | 17 | Executive/financial/maintenance/utilization/audit/compliance/AI/custom reports + builder + BI. |
| 18. Future Enhancements | 18 | Digital twin, drone, robot, AR, voice, gen-AI, LLM copilot, predictive ops, IoT marketplace, edge AI, autonomous inventory. |
| **Extra: plan from login → every page** | 00§0.6, 20 | Auth/onboarding pages enumerated + all module pages + system/error/settings pages. |
| **Extra: coverage self-check** | 00§0.9 | Every module has features (05) + pages (06) + a dashboard (04) + AI hooks (08) — verified. |
| **Extra: "plan next, then build, then beautify"** | 20, 15 | Build order and phasing (20) precede UI system (15) precede visual polish. |

---

## 0.4 Guiding principles (the non-negotiables)

1. **One asset graph, one event stream.** Every module (BI, twin, audit, AI) is a *projection* over one
   event-sourced core. Incumbents bolt acquired products together; we don't. → 11, 12.
2. **AI is native, not a plugin.** Health/risk/prediction are first-class columns with **explainability**
   (drivers + confidence), defensible to a CFO or an auditor. → 08.
3. **Multi-tenant + scope-secure to the data layer.** Org▸Region▸Facility▸Building▸Floor▸Zone isolation is
   enforced with row/field-level security, not menu-hiding. → 16.
4. **Vendor-neutral sensing.** An IoT gateway/adapter abstraction so we never couple to Zebra/Impinj/Samsara
   SKUs — the abstraction is the product. → 09, 11.
5. **Offline-first at the edge.** Scanners, gateways and mobile keep working when the network doesn't. → 14.
6. **Open & programmable.** Everything in the UI is an API + webhook + event; marketplace-ready. → 13.
7. **Consistent object pages & states.** Every entity page (asset, WO, sensor, user) follows one tabbed
   pattern with defined empty/loading/error/permission states. → 06, 10, 15.

---

## 0.5 System model (tenancy, modules) — summary

**Scope tree (enforced everywhere):** `Platform → Organization(Tenant) → Region/Division → Facility/Site →
Building → Floor → Zone/Room → Asset → Components`. A global scope-switcher filters all data. → 03.

**The 20 functional modules:** (1) Asset Registry & Master Data · (2) Tracking/RTLS/IoT · (3) AI & Intelligence
· (4) Maintenance (EAM) · (5) Inventory & Parts · (6) Operations & Custody · (7) Lifecycle & Disposal ·
(8) Financials · (9) Alerts & Notifications · (10) Analytics/Reporting/BI · (11) Compliance & Audit ·
(12) Administration · (13) Integrations & Platform · (14) Mobile & Field · (15) Digital Twin & Visualization ·
(16) Security & Identity · (17) Notifications & Collaboration · (18) Search & Command · (19) System/Monitoring ·
(20) Onboarding/Help/Growth. Full feature list → 05; navigation → 03.

---

## 0.6 Complete page inventory (login → every page)

The authoritative *list* of pages, grouped by area, with route, primary roles, and auth gate. Per-page detail
(components, forms, buttons, tables, filters, empty/loading/error states, permissions) lives in
[06-page-catalog.md](./06-page-catalog.md). `A`=authenticated, `P`=public, `PL`=platform-tier only.

### A. Authentication & Onboarding (pre-shell)
| Route | Page | Gate |
|-------|------|------|
| `/login` | Email/username sign-in + SSO buttons | P |
| `/login/sso/[provider]` · `/auth/callback` | SSO/OIDC redirect + callback | P |
| `/mfa` | MFA / passkey challenge | P |
| `/forgot-password` · `/reset-password` | Password recovery request + reset | P |
| `/accept-invite` · `/set-password` | Accept invite, set initial password | P |
| `/verify-email` | Email verification landing | P |
| `/select-org` | Org / tenant switcher (multi-tenant users) | A |
| `/onboarding` | First-run setup wizard (org, facilities, import, invite) | A |
| `/locked` · `/session-expired` | Account locked / re-auth prompts | P |
| `/provision-tenant` | New-tenant provisioning (platform) | PL |

### B. Workspace & Dashboards
| Route | Page | Primary roles |
|-------|------|---------------|
| `/` | Home / My Workspace (role-personalized landing) | All |
| `/dashboards` | Dashboard switcher + gallery | All |
| `/dashboards/executive` `/operations` `/maintenance` `/asset` `/ai` `/security` `/inventory` `/financial` | The 8 role dashboards | Per role |
| `/dashboards/builder` | Custom dashboard builder (drag-drop grid) | Managers+ |
| `/copilot` | Full-page AI Copilot (⌘K everywhere) | All |
| `/my-work` | Assigned WOs/tasks/approvals | Field/Managers |
| `/notifications` | Notification inbox | All |
| `/favorites` · `/recent` | Pinned & recent items | All |

### C. Assets
`/assets` (registry) · `/assets/new` · `/assets/import` (bulk CSV/API) · `/assets/[id]` (360° profile, 14 tabs)
· `/assets/[id]/edit` · `/assets/labels` (QR/RFID label printing) · `/taxonomy` · `/taxonomy/[class]`
· `/groups` · `/groups/[id]` · `/kits` · `/lifecycle` (stage board) · `/disposal` · `/saved-views`.

### D. Tracking & IoT
`/tracking` (live map) · `/twin` · `/twin/[facility]` (digital twin) · `/geofences` · `/geofences/new`
· `/movement` (history/trails) · `/movement/[assetId]` · `/heatmaps` · `/sensors` · `/sensors/[id]`
· `/gateways` · `/gateways/[id]` · `/telemetry` (time-series explorer).

### E. AI Intelligence
`/ai-insights` (feed) · `/ai/health` · `/ai/predictive` · `/ai/utilization` · `/ai/anomaly` · `/ai/theft`
· `/ai/forecasting` · `/ai/models` (registry) · `/ai/models/[id]` · `/ai/explainability` · `/ai/feedback`.

### F. Maintenance
`/maintenance` (board) · `/maintenance/[id]` (WO detail) · `/maintenance/new` · `/maintenance/calendar`
· `/pm` (PM schedules) · `/pm/[id]` · `/predictive` (AI-sourced WOs) · `/scheduling` (dispatch/load-balance)
· `/inspections` · `/inspections/[id]` · `/checklists` · `/parts` (failure codes/BOM).

### G. Inventory & Parts
`/inventory` (stock) · `/inventory/[sku]` · `/reorder` · `/procurement` (POs) · `/procurement/[id]`
· `/consumption` · `/warehouses` · `/warehouses/[id]` · `/bins` · `/suppliers`.

### H. Operations & Custody
`/operations/transfers` · `/transfers/[id]` · `/transfers/new` · `/checkinout` · `/reservations`
· `/reservations/calendar` · `/field-ops` · `/requests` · `/kiosk` (self-service station).

### I. Analytics & Reports
`/reports` (library) · `/reports/[id]` · `/reports/builder` · `/bi` (ad-hoc explorer) · `/financials`
· `/depreciation` · `/compliance-reports` · `/subscriptions` · `/exports`.

### J. Alerts & Notifications
`/alerts` (center) · `/alerts/[id]` · `/alert-rules` · `/alert-rules/new` · `/escalations`
· `/notifications/preferences`.

### K. Compliance & Audit
`/audit` (center) · `/audit/[id]` · `/cycle-counts` · `/custody` · `/custody/[assetId]` · `/certifications`
· `/regulatory` · `/retention` · `/audit-log` (immutable system log).

### L. Administration
`/admin/org` · `/admin/facilities` · `/admin/facilities/[id]` · `/admin/users` · `/admin/users/[id]`
· `/admin/roles` · `/admin/teams` · `/admin/workflows` · `/admin/workflows/[id]` · `/admin/integrations`
· `/admin/integrations/[id]` · `/admin/api-keys` · `/admin/webhooks` · `/admin/data` (import/export/backup)
· `/admin/branding` · `/admin/localization` · `/admin/billing`.

### M. System (Platform tier)
`/system/monitoring` · `/system/tenants` · `/system/flags` (feature flags) · `/system/developer` (API docs/portal)
· `/system/status` · `/system/logs`.

### N. Settings (personal), Help & Errors
`/settings/profile` · `/settings/security` · `/settings/notifications` · `/settings/appearance`
· `/settings/api-tokens` · `/help` · `/help/[article]` · `/support` · `/support/[ticket]` · `/whats-new`
· error pages `/403` `/404` `/500` `/offline` `/maintenance-mode`.

**Inventory total: ~150 distinct pages / routes** across 14 areas — every one specced in 06.

---

## 0.7 Global page anatomy & standard states

Every content page is composed from one skeleton so the product feels like one system (detail → 15):

- **Shell:** left Sidebar (role-adaptive) + Top bar (scope switcher, global search/Copilot ⌘K, quick-create,
  scan, alerts bell, help, theme, user menu) + scrollable content region.
- **Page header:** title + subtitle + breadcrumb + primary/secondary actions + scope chips.
- **Body pattern (one of):** *List/Table* (filters, saved views, bulk actions, column config, pagination),
  *Board* (kanban columns), *Detail* (tabbed object page), *Map/Twin* (canvas + inspector), *Builder*
  (drag-drop), *Wizard* (stepper), *Analytics* (KPI row + charts + tables).
- **Mandatory states on every page:** **Loading** (skeletons), **Empty** (illustration + primary CTA + help),
  **Error** (retry + support link + trace id), **Permission-denied** (403 explanation + request-access),
  **Offline** (cached banner), **No-results** (clear filters). → codified in 06 & 15.
- **Cross-cutting on every entity:** audit trail, comments/@mentions, watch/subscribe, favorite, share
  (scoped link), export, "Explain this" (AI), keyboard nav, deep-linkable filter state.

---

## 0.8 Build & implementation sequencing (plan → build → beautify)

You asked to **plan the build first, then build, then beautify.** The ordered plan (full detail in
[20-implementation-plan.md](./20-implementation-plan.md)):

**Track 1 — Investor demo (frontend-only, Next.js 16, in-session mock data).** Current state: Dashboard,
Registry, 360°, Tracking, Maintenance, AI Insights already built. Rebuild expands to a believable slice of the
full IA:

1. **Foundation & shell (build first):** auth screens (`/login`, `/mfa`, SSO, `/onboarding`), the app shell
   (role-adaptive sidebar, top bar with scope switcher + Copilot ⌘K), global states, and the design-system
   tokens/components from 15. *Nothing else renders well until the shell + auth exist.*
2. **Asset core:** Registry (filters/saved views/bulk), 360° profile (all 14 tabs), taxonomy, groups/kits,
   lifecycle board, bulk import, label printing.
3. **Tracking & Twin:** live map, geofences, movement history/heatmaps, sensors/gateways, telemetry explorer,
   2D digital twin.
4. **Maintenance & Inventory:** WO board + detail, PM/predictive, scheduling, inspections; stock, reorder,
   procurement, warehouses.
5. **AI command center:** insights feed, health/risk, predictive, utilization, anomaly/theft, model registry,
   explainability, Copilot.
6. **Analytics, Compliance, Admin, Settings:** report library/builder/BI, financials, audit/custody, org/users/
   roles/workflows/integrations, personal settings, help.
7. **Beautify pass:** apply the design system end-to-end, motion, empty/loading/error polish, responsive, dark
   mode, accessibility (WCAG 2.1 AA).

**Track 2 — Production platform (real backend).** Foundation (event store + graph + RBAC/multi-tenant) →
Sense (IoT ingestion + live map) → Predict (AI core) → Twin + BI → Platform/marketplace. Maps to roadmap → 01,
18.

**Rule:** every page ships with all standard states (0.7) before it's "done" — no page is complete with only
the happy path.

---

## 0.9 Coverage self-check (are we covering everything?)

For **each of the 20 modules** we assert four artifacts exist; this table is the audit you asked for.

| Module | Features (05) | Pages (06/00.6) | Dashboard (04) | AI hooks (08) |
|--------|:-:|:-:|:-:|:-:|
| Asset Registry & Master Data | ✓ M1 | ✓ Assets | ✓ Asset | ✓ dup/ghost, data-quality |
| Tracking/RTLS/IoT | ✓ M2 | ✓ Tracking | ✓ Ops/Security | ✓ anomaly, signal-loss |
| AI & Intelligence | ✓ M3 | ✓ AI | ✓ AI | ✓ (is the module) |
| Maintenance (EAM) | ✓ M4 | ✓ Maintenance | ✓ Maintenance | ✓ predictive WOs |
| Inventory & Parts | ✓ M5 | ✓ Inventory | ✓ Inventory | ✓ demand forecast |
| Operations & Custody | ✓ M6 | ✓ Operations | ✓ Ops | ✓ rebalancing |
| Lifecycle & Disposal | ✓ M7 | ✓ Lifecycle | ✓ Asset | ✓ EOL prediction |
| Financials | ✓ M8 | ✓ Financials | ✓ Financial | ✓ capex-deferral |
| Alerts & Notifications | ✓ M9 | ✓ Alerts | ✓ (all) | ✓ correlation |
| Analytics/Reporting/BI | ✓ M10 | ✓ Reports | ✓ Exec Analytics | ✓ gen reports |
| Compliance & Audit | ✓ M11 | ✓ Compliance | ✓ (compliance) | ✓ audit-anomaly |
| Administration | ✓ M12 | ✓ Admin | — (config) | — |
| Integrations & Platform | ✓ M13 | ✓ Admin/System | — | — |
| Mobile & Field | ✓ M14 | ✓ (14) | ✓ mobile | ✓ voice-to-WO |
| Digital Twin & Visualization | ✓ M15 | ✓ Twin | ✓ Ops | ✓ simulation |
| Security & Identity | ✓ M16 | ✓ Admin/Settings | ✓ Security | ✓ theft |
| Notifications & Collaboration | ✓ M17 | ✓ Workspace | — | ✓ digests |
| Search & Command | ✓ M18 | ✓ Copilot/topbar | — | ✓ NL search |
| System & Monitoring | ✓ M19 | ✓ System | ✓ platform | — |
| Onboarding/Help/Growth | ✓ M20 | ✓ Onboarding/Help | — | ✓ narration |

> If any future feature has no home in a module/page/dashboard, it is a gap — file it against this table.

---

## 0.10 Challenged assumptions & architect recommendations

1. **Don't build another CRUD registry.** The moat is the **event-sourced graph + explainable AI**. Invest in
   the event store/stream *before* deep UI; retrofitting event sourcing later is a rewrite.
2. **Tracking hardware is a commodity — the abstraction is the product.** A vendor-neutral IoT adapter layer
   out-flanks Zebra (locked tags) and Samsara (locked hardware).
3. **AI must be explainable & governed from day one.** Regulated buyers (health, gov, police) reject black-box
   scores. Model registry + feature store + explainability service are *core infra*, not future items.
4. **Scope security belongs in the data layer.** Enforce row/field-level tenancy in queries, not the UI —
   stricter than Maximo sites, closer to ServiceNow domain separation.
5. **Copilot is the differentiator UX.** ⌘K natural-language command bar that can *navigate, filter, create,
   explain, and act* is how we beat legacy UIs on time-to-value.

---

## 0.11 How the rebuild proceeds from here

1. This master plan (00) is approved/adjusted. → *checkpoint with stakeholder.*
2. Detailed section docs **06–20** are authored against this plan (in progress).
3. `20-implementation-plan.md` freezes the page-build order; the demo is **rebuilt** shell-first, then module by
   module, then a **beautify** pass against `15-design-system.md`.
4. Coverage is re-audited against §0.9 before each phase is called done.
