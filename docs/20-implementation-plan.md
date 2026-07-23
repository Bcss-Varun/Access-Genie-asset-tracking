# 20. Implementation Plan (Plan → Build → Beautify)

**Document type:** Delivery plan — build order, sequenced backlog, Definition of Done, production phasing
**Version:** 1.0 · **Status:** Planning (freezes the rebuild order) · **Owner:** Principal Eng Lead + Delivery Architect
**Audience:** Engineering, Design, PM, Delivery
**Reads from:** [00 §0.6 page inventory](./00-master-blueprint.md) · [00 §0.7 page anatomy/states](./00-master-blueprint.md) · [00 §0.8 sequencing](./00-master-blueprint.md) · [03 Information Architecture](./03-information-architecture.md) · [02 Personas/RBAC](./02-personas.md) · [04 Dashboards](./04-dashboards.md) · 15 Design System (to author/apply in the beautify pass)

> This document turns the blueprint into an **ordered build**. It runs two tracks in parallel: **Track 1 —
> the investor DEMO rebuild** (frontend-only Next.js 16, in-session mock data, professional light theme) and
> **Track 2 — the production platform** (real backend, mapped to roadmap phases). Track 1 is sequenced
> **login → app shell → every module → beautify**. The rule from 00 §0.8 holds: *no page is "done" on the happy
> path alone — every page ships all standard states (20.5) or it does not ship.*

---

## 20.1 Two tracks at a glance

| | Track 1 — Investor Demo | Track 2 — Production Platform |
|---|---|---|
| **Goal** | A believable, clickable slice of the full IA that sells the vision | The real event-sourced, multi-tenant, AI-native system |
| **Stack** | Next.js 16 App Router (Turbopack), React 19, Tailwind v4, in-session mock data | + event store, asset graph, IoT gateway, AI services, RBAC/ABAC at the data layer |
| **Data** | `src/lib/mock-data.ts` (deterministic, no `Date.now()` at module load) | Postgres + event log + time-series + object store (→ 11, 12) |
| **Auth** | Simulated (route group + fake session, no real IdP) | SSO/OIDC/JWT/MFA, scope-secure to the row/field (→ 16) |
| **Definition of shipped** | All standard states + responsive + a11y + deep-linkable (20.4) | + SLOs, DR/HA, audit, load tested at 10M assets/tenant |
| **Sequencing** | 20.3 (this doc) | 20.10 (this doc) → roadmap 01/18 |
| **Timebox intent** | 6 build phases + 1 beautify pass | 5 platform phases (Foundation → Sense → Predict → Twin/BI → Platform) |

The demo is **not throwaway**: its component library, tokens, IA, mock contracts, and page states become the
front-end contract the production API is later wired behind. Build the demo as if a real API will replace
`mock-data.ts` behind the same typed accessors (`getAssetById`, `getWorkOrdersForAsset`, …).

---

## 20.2 Current demo state — audit (what exists → what must change)

The demo today renders 6 routes inside a shell that hardcodes 5 nav links and wraps **everything** (which is
wrong for auth). This is the concrete starting point every Phase-0 task refactors.

| File | Today | Gap vs blueprint | Action |
|---|---|---|---|
| `src/app/layout.tsx` | Root layout wraps **all** children in `<AppShell>` | Auth/error pages must render **without** the shell | Move `<AppShell>` out of root; apply it only in an authenticated route group `app/(app)/layout.tsx` |
| `src/components/layout/AppShell.tsx` | `Sidebar + TopNav + <main>` | No global state providers (scope, session, command palette, toasts) | Wrap children in providers; add skip-link, `<main id>` landmark |
| `src/components/layout/Sidebar.tsx` | **5 hardcoded links** (`/`, `/assets`, `/tracking`, `/maintenance`, `/ai-insights`) | IA (03) has **12 groups / ~60 items**, role-adaptive, collapsible | Replace with data-driven `navConfig` filtered by role/permission; grouped, collapsible, active-state deep-match |
| `src/components/layout/TopNav.tsx` | Search input + 2 dead icon buttons | No scope switcher, no working ⌘K Copilot, no quick-create/scan/alerts/help/theme/user menu | Rebuild top bar per 03 §3.3 (left: logo+scope+breadcrumb / center: Copilot ⌘K / right: +create, scan, bell, help, theme, user) |
| `src/app/page.tsx` | Executive dashboard at `/` | 00 §0.6 wants `/` = role-personalized workspace + `/dashboards/*` gallery of 8 | Keep as `/dashboards/executive`; make `/` a role-adaptive workspace that composes widgets |
| `src/app/assets/page.tsx` `assets/[id]` | Registry + 360° profile (partial) | Registry lacks saved views/bulk/column-config; 360° lacks the full 14 tabs (10) | Extend, don't rewrite; add `/assets/new`, `/import`, `/labels`, `/edit` |
| `src/app/tracking` `maintenance` `ai-insights` | Single pages each | Each is a module with many sub-pages (00 §0.6 D/E/F) | Keep as the module landing; add sub-routes around them |
| `src/lib/mock-data.ts` | 14 assets, 12 WOs, 6 insights, zones, activity, 2 series | No users/roles, sensors/gateways, geofences, inventory, reports, alerts, audit, notifications | Extend with new typed collections (20.7) behind lookup helpers |
| `src/types/asset.ts` | Asset/WO/Insight/Zone/Activity/series | Missing User, Role, Sensor, Gateway, Geofence, Part, PO, Report, Alert, AuditEvent, Notification | Add types alongside (all fields optional-safe, as the file already does) |
| `src/app/globals.css` | Tokens: primary ramp, health colors, surface, `glass-panel`, `font-heading` | Missing spacing/radius/z/elevation scale, motion tokens, focus-ring token, status/severity token set | Formalize the full token set in the beautify pass (→ 15) |
| `src/components/charts/DashboardCharts.tsx` | 2 charts (util/downtime, donut) | Needs a reusable chart kit (line/bar/area/gauge/heatmap/sparkline) | Grow into `components/charts/*` primitives (apply the **dataviz** system in beautify) |
| Missing dirs | — | No `app/(auth)`, `app/(app)`, `/admin`, `/reports`, `/inventory`, `/alerts`, `/audit`, `/settings`, `/onboarding`, error pages | Created across Phases 0–6 |

**Route-group refactor (do first, Phase 0):**

```
src/app/
  layout.tsx                 # root: fonts + providers ONLY (no shell)
  (auth)/                    # public, shell-less
    layout.tsx               # centered card layout, product mark
    login/ mfa/ forgot-password/ reset-password/ accept-invite/ verify-email/
  (app)/                     # authenticated, shell-wrapped
    layout.tsx               # <AppShell> lives here
    page.tsx                 # "/" workspace
    dashboards/… assets/… tracking/… maintenance/… inventory/…
    ai/… ai-insights/… reports/… bi/… alerts/… audit/… admin/… settings/…
  onboarding/                # authed but shell-less (full-screen wizard)
  403/ 404/ 500/ offline/    # error routes (not-found.tsx, error.tsx, global-error.tsx)
```

---

## 20.3 Demo rebuild — sequenced page backlog (login → every page)

**Legend — States required** (from 00 §0.7 / detailed in 20.5):
`L`=loading skeleton · `E`=empty (illustration+CTA) · `Er`=error (retry+trace id) · `403`=permission-denied ·
`NR`=no-results (clear filters) · `O`=offline banner. **Every** authenticated page also carries the DoD in 20.4.

Phases are strictly ordered; within a phase, `depends-on` gives the local order. "New components" lists the
**net-new** shared pieces the page introduces (later pages reuse them). "DoD" is the page-specific done bar on
top of the standard checklist (20.4).

### Phase 0 — Foundation: auth, shell, design tokens, global states

*Nothing else renders well until the shell, session, scope, and the standard-state primitives exist.*

| # | Route / Page | Module | Depends-on | New components | Mock-data needed | States | Definition of Done (page-specific) |
|---|---|---|---|---|---|---|---|
| 0.1 | **design tokens + primitives** | Design system | — | `Button`, `Input`, `Select`, `Checkbox`, `Badge`, `Tag`, `Avatar`, `Card`, `Tabs`, `Table`, `Drawer`, `Dialog`, `Tooltip`, `Menu`, `Toast`, `Skeleton`, `EmptyState`, `ErrorState`, `Pagination`, `Breadcrumb`, `KpiCard`, `StatusPill` | token map (color/space/radius/z/motion/focus) | — | Tokens formalized in `globals.css`; each primitive has all interactive + focus states; Storybook-style demo page `/system/kitchen-sink` (dev only) |
| 0.2 | route-group refactor | Foundation | 0.1 | `(auth)/layout`, `(app)/layout`, providers (`SessionProvider`, `ScopeProvider`, `CommandProvider`, `ToastProvider`) | fake `session` (user, role, permissions), scope tree | — | Auth pages render shell-less; app pages shell-wrapped; unauth deep-link → redirect to `/login?next=` |
| 0.3 | `/login` | Onboarding/Security | 0.2 | `AuthCard`, `SsoButtonRow`, `PasswordField` | 2 demo credentials + SSO providers list | L, Er | Email/password + SSO buttons; validation; "wrong password" error; `next` param respected; links to forgot/invite |
| 0.4 | `/mfa` | Security | 0.3 | `OtpInput`, `PasskeyPrompt` | mfa challenge stub | L, Er | 6-digit OTP + passkey option; resend timer; failure state; success → `/select-org` or `/` |
| 0.5 | `/forgot-password` · `/reset-password` | Security | 0.3 | `AuthMessage` | — | L, Er | Request form → confirmation; reset form with strength meter; expired-token error |
| 0.6 | `/accept-invite` · `/verify-email` | Onboarding | 0.3 | reuse `AuthCard` | invite token stub | L, Er | Invite shows org + role; set-password; verify-email landing (valid/expired) |
| 0.7 | `/select-org` | Onboarding | 0.4 | `OrgSwitcherList` | 2–3 tenant orgs | L, E, Er | Multi-tenant chooser; single-org users auto-skip; sets active tenant in `ScopeProvider` |
| 0.8 | **App shell — Sidebar** | IA | 0.2 | `Sidebar` (data-driven), `NavGroup`, `NavItem`, `navConfig` | role→permissions map | — | 12 groups from 03 §3.2; role-adaptive (hidden not greyed); collapsible + persisted; active deep-match; keyboard nav |
| 0.9 | **App shell — Top bar** | IA/Search | 0.8 | `TopBar`, `ScopeSwitcher`, `GlobalSearch`, `QuickCreateMenu`, `ScanButton`, `AlertsBell`, `HelpMenu`, `ThemeToggle`, `UserMenu` | scope tree, notification count, quick-create targets | L | Left scope+breadcrumb / center Copilot / right cluster (03 §3.3); scope change refilters mock queries |
| 0.10 | **Copilot ⌘K** | Search/AI | 0.9 | `CommandPalette`, `CommandProvider`, `useCommand()` | commands: navigate, search assets, "explain", canned NL answers | L, E, NR | ⌘K/Ctrl-K opens anywhere; fuzzy nav + asset search + 3 scripted NL demos; ESC/scrim close; a11y combobox roles |
| 0.11 | `/onboarding` | Onboarding | 0.7 | `Wizard`, `Stepper`, `ImportDropzone` (stub) | wizard defaults | L, E, Er | 4-step first-run (org → facilities → import → invite); progress persists; skip/finish → `/` |
| 0.12 | **global states + error routes** | Foundation | 0.1 | `not-found.tsx`, `error.tsx`, `global-error.tsx`, `Forbidden` (403), `OfflineBanner`, `LoadingBar` | trace-id stub | L, E, Er, 403, O | `/404 /403 /500 /offline`; router-level loading; toast on action; offline banner toggle (demo control) |
| 0.13 | `/` **My Workspace** | Workspace/Dashboards | 0.8–0.12 | `WidgetGrid`, `WorkspaceWidget` | per-role widget set (my WOs, alerts, favorites, recent) | L, E, Er | Role-personalized landing composed of widgets; empty state for new user; deep-links into modules |

### Phase 1 — Asset core

| # | Route / Page | Module | Depends-on | New components | Mock-data needed | States | Definition of Done (page-specific) |
|---|---|---|---|---|---|---|---|
| 1.1 | `/assets` **Registry** | Assets | 0.* | `DataTable` (sort/filter/column-config/density), `FilterBar`, `SavedViews`, `BulkActionBar`, `Paginator` | reuse `mockAssets` (+ grow to ~40) | L, E, Er, NR, 403 | Server-shape filtering, saved views in URL, bulk select→actions, column config, row deep-link; density toggle |
| 1.2 | `/assets/[id]` **360° Profile** | Assets | 1.1 | `ObjectHeader`, `TabbedProfile`, `Timeline`, `HealthGauge`, `SparklineChart`, `KeyValueGrid`, `DocList` | extend per-asset: sensors, docs, finance, warranty, custody | L, E, Er, 403 | All **14 tabs** (overview→timeline→tracking→health→maint→warranty→ownership→docs→sensors→AI→history→audit→risk→finance) per doc 10; deep-link to a tab; each tab has its own empty state |
| 1.3 | `/assets/new` · `/assets/[id]/edit` | Assets | 1.2 | `AssetForm`, `FormSection`, `FieldGroup`, `TaxonomyPicker` | taxonomy tree | L, E, Er, 403 | Create/edit with validation, unsaved-changes guard, taxonomy-driven attributes; optimistic add to session store |
| 1.4 | `/assets/import` | Assets | 1.1 | `ImportWizard`, `ColumnMapper`, `ImportPreviewTable` | sample CSV + mapping | L, E, Er | Upload→map→validate→preview→commit (to session); row-level error report |
| 1.5 | `/taxonomy` · `/taxonomy/[class]` | Assets | 1.1 | `TreeNav`, `AttributeSchemaTable` | asset classes + attribute schemas | L, E, Er, 403 | Class tree + attribute editor view; per-class asset count; deep-link a class |
| 1.6 | `/groups` · `/groups/[id]` · `/kits` | Assets | 1.1 | `GroupCardGrid`, `MembershipTable` | groups, kits, membership | L, E, Er | Parent/child + fleet grouping; kit BOM view; membership add/remove (session) |
| 1.7 | `/lifecycle` | Lifecycle | 1.1 | `KanbanBoard`, `BoardColumn`, `BoardCard` | reuse `lifecycleStage` | L, E, Er, 403 | Stage board (Commissioning→In Service→…→EOL→Disposed); drag card (session); WIP counts |
| 1.8 | `/assets/labels` | Assets | 1.1 | `LabelSheet`, `QrPreview` (SVG) | label template | L, E | Select assets → QR/RFID label sheet; print-friendly layout |
| 1.9 | `/saved-views` · `/disposal` | Assets/Lifecycle | 1.1, 1.7 | reuse table/board | saved views, disposal queue | L, E, Er | Saved-view manager; disposal approval queue with reason codes |

### Phase 2 — Tracking, IoT & Digital Twin

| # | Route / Page | Module | Depends-on | New components | Mock-data needed | States | Definition of Done (page-specific) |
|---|---|---|---|---|---|---|---|
| 2.1 | `/tracking` **Live Map** | Tracking | 0.*, 1.2 | `FacilityMap` (SVG canvas), `AssetDot`, `ZonePolygon`, `MapInspector`, `MapLegend`, `MapFilterBar` | reuse `mockZones`, `mapPosition`; add stale/last-ping | L, E, Er, 403, O | Zones + live dots colored by health; click dot→inspector→deep-link to 360°; filter by category/status; "stale ping" styling; offline banner |
| 2.2 | `/twin` · `/twin/[facility]` | Digital Twin | 2.1 | `TwinCanvas` (2D floors), `LayerToggle`, `TwinInspector` | facility→building→floor→zone tree | L, E, Er, 403 | 2D twin with floor/layer toggles + inspector; select facility; overlay sensors/heat |
| 2.3 | `/geofences` · `/geofences/new` | Tracking | 2.1 | `GeofenceEditor`, `RuleForm` | geofences + breach rules | L, E, Er, 403 | Draw/edit geofence on map; entry/exit/dwell rules; breach preview |
| 2.4 | `/movement` · `/movement/[assetId]` · `/heatmaps` | Tracking | 2.1 | `TrailOverlay`, `DwellTable`, `Heatmap` (dataviz) | movement trails, dwell times | L, E, Er, NR | Per-asset trail + dwell; facility heatmap; time-range scrubber; empty when no history |
| 2.5 | `/sensors` · `/sensors/[id]` | Tracking/IoT | 1.2 | `DeviceTable`, `DeviceHealthCard`, `SensorForm` | sensors fleet (from telemetry-bearing assets) | L, E, Er, 403 | Device fleet list + health; per-sensor config + last readings; low-battery/offline flags |
| 2.6 | `/gateways` · `/gateways/[id]` | Tracking/IoT | 2.5 | `GatewayCard`, `ConnectivityBadge` | gateways + connected-device counts | L, E, Er | Gateway fleet, connectivity, firmware; child-device drill |
| 2.7 | `/telemetry` | Tracking/IoT | 2.5 | `TimeSeriesExplorer`, `SeriesPicker`, `RangeSelector` | multi-series time-series | L, E, Er, NR | Pick asset+metric→line chart; range + compare; export CSV (session) |

### Phase 3 — Maintenance & Inventory

| # | Route / Page | Module | Depends-on | New components | Mock-data needed | States | Definition of Done (page-specific) |
|---|---|---|---|---|---|---|---|
| 3.1 | `/maintenance` **WO Board** | Maintenance | 0.*, 1.2 | reuse `KanbanBoard`; `WoCard`, `WoFilterBar`, list/calendar toggle | reuse `mockWorkOrders` (grow to ~30) | L, E, Er, NR, 403 | Board + list + calendar views; drag status (session); AI-generated badge; filter by priority/type/assignee |
| 3.2 | `/maintenance/[id]` **WO Detail** | Maintenance | 3.1 | `WoHeader`, `ChecklistPanel`, `PartsPanel`, `LaborLog`, `CommentThread` | WO tasks, parts used, labor, comments | L, E, Er, 403 | Full WO object page; status transitions; link to asset 360°; comments/@mention; audit trail |
| 3.3 | `/maintenance/new` · `/maintenance/calendar` | Maintenance | 3.1 | `WoForm`, `CalendarGrid` | — | L, E, Er | Create WO (asset picker, priority, assignee); month/week calendar with WO chips |
| 3.4 | `/pm` · `/pm/[id]` | Maintenance | 3.1 | `PmScheduleTable`, `RecurrenceEditor` | PM schedules + recurrence | L, E, Er, 403 | Recurring PM plans; next-due; generate-WO action; per-plan history |
| 3.5 | `/predictive` · `/scheduling` | Maintenance/AI | 3.1 | `PredictiveWoList`, `DispatchBoard`, `TechLoadBar` | AI-sourced WOs (from insights), technician roster + load | L, E, Er, NR | Predictive WOs sourced from AI insights; dispatch/load-balance board; per-tech capacity |
| 3.6 | `/inspections` · `/inspections/[id]` · `/checklists` | Maintenance | 3.2 | `InspectionForm`, `ChecklistBuilder` | inspection templates + results | L, E, Er, 403 | Inspection list + fill form; checklist templates; pass/fail with photos (stub) |
| 3.7 | `/inventory` · `/inventory/[sku]` | Inventory | 0.* | `StockTable`, `AbcBadge`, `StockLevelBar`, `SkuHeader` | parts/SKUs, stock levels, ABC class | L, E, Er, NR, 403 | Stock list (levels/valuation/ABC); per-SKU detail + movement; low-stock flag |
| 3.8 | `/reorder` · `/procurement` · `/procurement/[id]` | Inventory | 3.7 | `ReorderTable`, `PoTable`, `PoDetail` | reorder rules, POs, suppliers | L, E, Er, 403 | Reorder suggestions; PO list + detail + receiving; supplier link |
| 3.9 | `/consumption` · `/warehouses` · `/warehouses/[id]` · `/bins` · `/suppliers` | Inventory | 3.7 | `WarehouseMap`, `BinGrid`, `SupplierTable` | warehouses, bins, suppliers, consumption | L, E, Er, NR | Consumption to WOs; warehouse/bin structure; supplier directory |

### Phase 4 — AI command center

| # | Route / Page | Module | Depends-on | New components | Mock-data needed | States | Definition of Done (page-specific) |
|---|---|---|---|---|---|---|---|
| 4.1 | `/ai-insights` **Feed** | AI | 0.*, 1.2 | `InsightCard`, `DriverList`, `ConfidenceMeter`, `InsightFilterBar` | reuse `mockInsights` (grow to ~20) | L, E, Er, NR, 403 | Ranked, explainable feed; drivers + confidence + $ impact; per-insight action → deep-link (create WO / transfer); filter by type/severity |
| 4.2 | `/ai/health` · `/ai/predictive` | AI | 4.1, 1.2 | `HealthMatrix`, `RulTimeline`, `ScoreDistribution` (dataviz) | health/risk scores, RUL estimates | L, E, Er, 403 | Portfolio + per-asset health/risk; predictive failure timeline; drill to asset |
| 4.3 | `/ai/utilization` · `/ai/anomaly` · `/ai/theft` | AI | 4.1 | `UtilHeatmap`, `AnomalyList`, `TheftAlertCard` | util by asset/zone, anomalies, theft events | L, E, Er, NR | Idle/over-use rebalancing suggestions; anomaly & theft feeds; each with explainable drivers |
| 4.4 | `/ai/forecasting` | AI | 4.1 | `ForecastChart`, `ScenarioToggle` | demand/lifecycle/capex forecast series | L, E, Er | Forecast with confidence band; scenario toggles |
| 4.5 | `/ai/models` · `/ai/models/[id]` · `/ai/explainability` · `/ai/feedback` | AI | 4.1 | `ModelRegistryTable`, `ModelCard`, `DriftChart`, `ExplainPanel`, `FeedbackForm` | model registry, versions, drift, feature importances | L, E, Er, 403 | Model registry + per-model card (version, drift, owner); global explainability view; feedback loop capture |

### Phase 5 — Analytics, Compliance, Admin, Settings

| # | Route / Page | Module | Depends-on | New components | Mock-data needed | States | Definition of Done (page-specific) |
|---|---|---|---|---|---|---|---|
| 5.1 | `/reports` · `/reports/[id]` | Analytics | 0.* | `ReportLibrary`, `ReportViewer`, `ReportCard` | report catalog + sample outputs | L, E, Er, 403 | Prebuilt report library; run/view a report; export/subscribe stub |
| 5.2 | `/reports/builder` · `/bi` | Analytics | 5.1 | `ReportBuilder`, `FieldShelf`, `PivotTable`, `ChartPicker` | dimensions/measures catalog | L, E, Er, NR | Drag-drop builder → preview; ad-hoc BI pivot + chart; save (session) |
| 5.3 | `/financials` · `/depreciation` | Financials | 0.*, 1.2 | `TcoTable`, `DepreciationChart`, `BookValueTrend` | depreciation schedules (from asset book values) | L, E, Er, 403 | Portfolio TCO/book value; depreciation curves; per-asset drill |
| 5.4 | `/compliance-reports` · `/exports` · `/subscriptions` | Analytics/Compliance | 5.1 | `ScheduleTable`, `ExportHistory` | scheduled deliveries, export history | L, E, Er | Compliance report set; scheduled exports/subscriptions manager |
| 5.5 | `/alerts` · `/alerts/[id]` · `/alert-rules` · `/alert-rules/new` · `/escalations` | Alerts | 0.* | `AlertCenter`, `AlertRow`, `RuleBuilder`, `EscalationEditor` | alerts, rules, escalation policies | L, E, Er, NR, 403 | Alert center (ack/escalate/assign); rule builder; escalation/on-call policy editor |
| 5.6 | `/notifications` · `/notifications/preferences` | Notifications | 0.* | `NotificationInbox`, `ChannelPrefs` | notifications, channel prefs | L, E, Er | Inbox (read/unread, filters); per-channel + digest preferences |
| 5.7 | `/audit` · `/audit/[id]` · `/cycle-counts` · `/audit-log` | Compliance | 0.*, 1.2 | `AuditTable`, `CycleCountBoard`, `ImmutableLogTable` | audit events, cycle counts, immutable log | L, E, Er, NR, 403 | Physical audits + cycle counts; per-asset chain-of-custody; immutable system log (read-only) |
| 5.8 | `/custody` · `/custody/[assetId]` · `/certifications` · `/regulatory` · `/retention` | Compliance | 5.7 | `CustodyTimeline`, `ExpiryTable` | custody log, certs, warranties, retention | L, E, Er | Custody chain; cert/warranty expiry tracking; regulatory + retention views |
| 5.9 | `/admin/org` · `/admin/facilities` · `/admin/facilities/[id]` | Admin | 0.* | `OrgTreeEditor`, `FacilityForm` | org/region/facility/building tree | L, E, Er, 403 | Structure editor mirroring the scope tree; facility CRUD (session) |
| 5.10 | `/admin/users` · `/admin/users/[id]` · `/admin/roles` · `/admin/teams` | Admin/Security | 5.9 | `UserTable`, `UserProfile`, `RoleMatrix`, `PermissionGrid` | users, roles, permission matrix (drives role-adaptive nav) | L, E, Er, 403 | User CRUD + invite; role→permission matrix that **actually filters the sidebar** in demo; team management |
| 5.11 | `/admin/workflows` · `/admin/workflows/[id]` · `/admin/integrations` · `/admin/integrations/[id]` | Admin/Platform | 5.9 | `WorkflowBuilder`, `IntegrationCard`, `ConnectorForm` | approval workflows, integrations catalog | L, E, Er, 403 | Approval-chain + SoD editor; integrations catalog + per-connector config |
| 5.12 | `/admin/api-keys` · `/admin/webhooks` · `/admin/data` · `/admin/branding` · `/admin/localization` · `/admin/billing` | Admin/Platform | 5.9 | `KeyTable`, `WebhookTable`, `BrandingForm`, `BillingPanel` | api keys, webhooks, branding, plan/usage | L, E, Er, 403 | Key/webhook management; branding + localization; billing/usage overview |
| 5.13 | `/settings/profile` · `/security` · `/notifications` · `/appearance` · `/api-tokens` | Settings | 0.* | `SettingsNav`, `ProfileForm`, `SecurityPanel`, `AppearancePanel` | current-user settings | L, E, Er | Personal settings hub; appearance (incl. theme toggle wiring); security (sessions, MFA, passkeys) |
| 5.14 | `/help` · `/help/[article]` · `/support` · `/whats-new` | Onboarding/Help | 0.* | `HelpCenter`, `ArticleView`, `SupportForm` | help articles, tickets, changelog | L, E, Er, NR | Help center + article; support ticket form; changelog/what's-new |
| 5.15 | `/dashboards` + the 8 role dashboards | Dashboards | 0.13 | `DashboardGallery`, `DashboardShell`, reuse chart kit | reuse series + per-role widget sets (→ 04) | L, E, Er, 403 | Gallery switcher + the 8 dashboards (executive/operations/maintenance/asset/ai/security/inventory/financial) per doc 04; each role-gated |
| 5.16 | `/copilot` · `/my-work` · `/favorites` · `/recent` · `/kiosk` | Workspace/Ops | 0.10 | `CopilotFullPage`, `MyWorkList`, `KioskMode` | assigned work, favorites, recents | L, E, Er, NR | Full-page Copilot; my-work queue; pinned/recent; kiosk self-service station |

> **Demo scope discipline:** the backlog above covers a **believable slice** — every module/area has at least
> its landing + one deep object page + one create/edit or board — not all ~150 routes in 00 §0.6. Routes not
> in this backlog (e.g. `/reservations/calendar`, `/system/*`, `/provision-tenant`) are **stubbed as
> "coming soon" states** so nav never dead-ends. Full per-page spec lives in 06.

### Phase 6 — Beautify pass (apply doc 15 end-to-end)

Runs **after** all pages exist with real states — polish is applied once, system-wide, not per page as we go.

| # | Workstream | Scope | Definition of Done |
|---|---|---|---|
| 6.1 | Tokens & theming | Finalize the full token set (color/space/radius/elevation/z/motion/focus) in `globals.css`; wire the dormant `dark:` variant to a real theme toggle | Light is default & pixel-consistent; dark mode complete; tokens are the single source (no ad-hoc hex in components) |
| 6.2 | Component polish | Reconcile every primitive/page to 15 (spacing rhythm, density, `glass-panel` usage, table zebra/hover, badges/pills) | Visual audit passes; one house style across all pages; no orphan one-off styles |
| 6.3 | Motion | Enter/exit, hover, skeleton shimmer, page transitions, drawer/dialog, toast; respects `prefers-reduced-motion` | Motion tokens applied consistently; reduced-motion honored; nothing janky at 60fps |
| 6.4 | Data-viz system | Apply the **dataviz** skill: unified categorical/sequential palettes, axes, legends, tooltips, empty/loading chart states, light+dark | All charts read as one system; accessible color; every chart has L/E/NR states |
| 6.5 | Responsive | Breakpoints for sidebar (collapse→drawer), tables (→ card list), boards, map, top bar (scope/search collapse) | Usable 360px→wide; no horizontal body scroll; touch targets ≥44px |
| 6.6 | Accessibility (WCAG 2.1 AA) | Landmarks, focus order, focus-visible rings, ARIA on table/tabs/combobox/dialog/menu, contrast, keyboard for ⌘K/board drag/menus | axe clean; full keyboard traversal; SR-tested nav + Copilot + a table + a form |
| 6.7 | Empty/loading/error illustration polish | Replace placeholder states with designed empty/error illustrations + helpful copy + CTAs | Every state from 20.5 is on-brand and helpful, not a bare string |
| 6.8 | Copy & microcontent | Consistent labels, tooltips, error/trace messaging, number/date/currency formatting | Terminology matches 03/10; formatting consistent; no lorem |

---

## 20.4 Definition of Done — standard per-page checklist

A page (or object page) is **not done** until every box is checked. This is on top of the page-specific DoD in
the backlog rows.

- [ ] **All standard states present** — loading `L`, empty `E`, error `Er`, permission-denied `403`, and where
      applicable no-results `NR` and offline `O` (20.5). Happy path alone is a fail.
- [ ] **Page anatomy** — shell + page header (title, subtitle, breadcrumb, primary/secondary actions, scope
      chips) per 00 §0.7.
- [ ] **Deep-linkable & shareable** — filter/tab/sort/pagination state lives in the URL (query/segment), not
      just component state; a shared link reproduces the exact view.
- [ ] **Permissions-aware** — hidden-not-greyed nav; page renders `403` for unauthorized roles; actions gated by
      permission; scope switcher refilters the data.
- [ ] **Scope-persistent** — respects the active Org▸Facility▸Building▸Zone scope; scope change updates data.
- [ ] **Responsive** — works 360px → wide; no horizontal body scroll; wide content scrolls in its own container.
- [ ] **Accessible (WCAG 2.1 AA)** — semantic landmarks, logical focus order, visible focus ring, ARIA for
      interactive widgets, ≥4.5:1 text contrast, full keyboard operability.
- [ ] **Cross-cutting entity affordances** (object pages) — audit trail, comments/@mentions, watch/subscribe,
      favorite, scoped share, export, "Explain this" (AI), keyboard nav.
- [ ] **Loading is skeletons, not spinners**; **empty has a primary CTA**; **error has retry + trace id +
      support link**.
- [ ] **Mock contract is typed** — reads through a typed accessor in `mock-data.ts` (swap-ready for a real API).
- [ ] **No dead ends** — every link/action goes somewhere real or to an honest "coming soon" state.

---

## 20.5 Standard states — the six every page implements

| State | Trigger | Pattern | Component |
|---|---|---|---|
| **Loading** `L` | Data resolving | Skeleton mirroring final layout (rows/cards/chart), top loading bar | `Skeleton`, `LoadingBar` |
| **Empty** `E` | No data yet (new tenant/asset) | Illustration + one-line explanation + **primary CTA** + help link | `EmptyState` |
| **Error** `Er` | Fetch/action failed | Message + **Retry** + support link + **trace id** | `ErrorState`, `error.tsx` |
| **Permission-denied** `403` | Role lacks access | Explanation + "request access" + who to contact | `Forbidden` |
| **No-results** `NR` | Filters exclude everything | "No matches" + **Clear filters** + adjust hint | `EmptyState variant=no-results` |
| **Offline** `O` | Connectivity lost (demo toggle) | Sticky banner "showing cached data" + reconnect | `OfflineBanner` |

---

## 20.6 Shared component library (build order = Phase 0 first)

Building these once in Phase 0 is what keeps 100+ pages consistent and fast to assemble. Grouped by tier:

| Tier | Components |
|---|---|
| **Primitives** | Button, Input, Select, Checkbox/Radio/Switch, Textarea, Badge, Tag, Avatar, Tooltip, Menu, Dialog, Drawer, Toast, Skeleton, Spinner, Pagination, Breadcrumb, Tabs, Accordion |
| **Data display** | DataTable (sort/filter/column-config/density/bulk), KpiCard, StatusPill, HealthGauge, KeyValueGrid, Timeline, CommentThread, DriverList, ConfidenceMeter |
| **Charts (dataviz)** | LineChart, AreaChart, BarChart, Donut, Gauge, Sparkline, Heatmap, ScoreDistribution, ForecastChart (+ shared axes/legend/tooltip/empty) |
| **Layout/nav** | AppShell, Sidebar (+NavGroup/NavItem), TopBar, ScopeSwitcher, GlobalSearch, CommandPalette, QuickCreateMenu, AlertsBell, UserMenu, PageHeader, WidgetGrid |
| **Forms/flows** | FormSection/FieldGroup, Wizard/Stepper, FilterBar, SavedViews, BulkActionBar, ImportWizard, RuleBuilder |
| **Canvas** | FacilityMap, AssetDot, ZonePolygon, TwinCanvas, KanbanBoard/BoardColumn/BoardCard, CalendarGrid |
| **States** | EmptyState, ErrorState, Forbidden, OfflineBanner, LoadingBar |

---

## 20.7 Mock-data expansion plan

Extend `src/lib/mock-data.ts` + `src/types/asset.ts` phase-by-phase, keeping the existing discipline
(anchored `NOW`, no `Date.now()` at load, optional-safe fields, typed lookup helpers). New collections:

| Phase | New types | New collections / helpers |
|---|---|---|
| 0 | `User`, `Role`, `Permission`, `Org`, `ScopeNode`, `Session`, `NavItem` | `mockUsers`, `mockRoles`, `rolePermissions`, `scopeTree`, `currentSession`, `navConfig`, `getNavForRole()` |
| 1 | `TaxonomyClass`, `AttributeSchema`, `AssetGroup`, `Kit`, `AssetDoc` | grow `mockAssets` → ~40; `mockTaxonomy`, `mockGroups`, `mockKits`, `getDocsForAsset()` |
| 2 | `Sensor`, `Gateway`, `Geofence`, `MovementTrail`, `TimeSeries` | `mockSensors`, `mockGateways`, `mockGeofences`, `mockTrails`, `getTelemetrySeries()` |
| 3 | `Part`/`Sku`, `Warehouse`, `Bin`, `Supplier`, `PurchaseOrder`, `PmSchedule`, `Inspection` | grow `mockWorkOrders` → ~30; `mockInventory`, `mockWarehouses`, `mockPurchaseOrders`, `mockPmSchedules` |
| 4 | `HealthScore`, `Model`, `ModelVersion`, `FeatureImportance`, `ForecastSeries` | grow `mockInsights` → ~20; `mockModels`, `getHealthMatrix()`, `mockForecasts` |
| 5 | `Report`, `Alert`, `AlertRule`, `Notification`, `AuditEvent`, `CustodyRecord`, `Certification`, `Workflow`, `Integration` | `mockReports`, `mockAlerts`, `mockNotifications`, `mockAuditLog`, `mockWorkflows`, `mockIntegrations` |

---

## 20.8 Production track — phasing (real backend, maps to roadmap)

Track 2 mirrors the guiding principles (00 §0.4/§0.10): **build the event-sourced graph before deep UI.**
Each phase is a shippable platform increment mapped to the vision roadmap (→ 01, 18).

| Phase | Name | Delivers | Key milestones | Maps to |
|---|---|---|---|---|
| **P1** | **Foundation** | Event store + asset graph + multi-tenant RBAC/ABAC + identity | Event log + projections live; scope-secure row/field access; SSO/OIDC/JWT/MFA; core Asset/WO CRUD via API; the demo FE wired to real Assets/Auth | 11, 12, 16 · vision "core graph" |
| **P2** | **Sense** | Vendor-neutral IoT gateway/adapter + ingestion + live map | Adapter SDK (RFID/BLE/UWB/GPS/LoRaWAN); streaming ingest; time-series store; live map + geofence breach events at scale | 09, 11 · "RTLS/IoT" |
| **P3** | **Predict** | AI core: health/risk/predictive + model registry + explainability | Feature store; model registry + drift; explainable scores (drivers+confidence) as first-class columns; predictive→WO automation | 08 · "native AI" |
| **P4** | **Twin & BI** | Digital twin + embedded BI/reporting + report builder | 2D/3D twin over live graph; ad-hoc BI explorer; scheduled reports/exports; financials/depreciation engine | 15, 17, 18 · "twin + BI" |
| **P5** | **Platform** | Open API/webhooks + marketplace + mobile/edge + system tier | Public REST+GraphQL+streaming; webhook/marketplace; offline-first mobile/edge apps; feature flags, monitoring, DR/HA, SOC2/ISO evidence | 13, 14, 18 · "marketplace" |

**Cross-cutting from day one (not a phase — a spine):** multi-tenancy & scope security at the data layer,
audit/immutable log, observability/SLOs, DR/HA, and CI/CD. Retrofitting any of these is a rewrite (00 §0.10).

### Key risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Event sourcing retrofitted late | Full rewrite | Event store is **P1**, before deep UI (00 §0.10 #1) |
| Scope security in the UI, not the data | Tenant data leak | Row/field-level enforcement in every query; deny-by-default; automated tenancy tests |
| Black-box AI rejected by regulated buyers | Lost deals (health/gov/police) | Explainability + model registry + governance are **P3 core infra**, not "future" (00 §0.10 #3) |
| Coupling to a tracking-hardware vendor | Margin + lock-in | Adapter abstraction is the product; conformance test suite per protocol (00 §0.10 #2) |
| Scale (10M+ assets/tenant) surprises | Latency/cost | Partitioning + projections + read models designed in P1; load test each phase at target scale |
| Demo/prod FE divergence | Duplicated work | Demo built against typed mock accessors that the real API replaces 1:1 |
| IoT ingest spikes / offline edge | Data loss | Backpressure + edge buffering + at-least-once + idempotent projections (offline-first, 00 §0.4 #5) |

### Suggested team / workstream breakdown

| Workstream | Owns | Track 1 (demo) | Track 2 (prod) |
|---|---|---|---|
| **Platform/Core** | Event store, asset graph, tenancy, RBAC/ABAC | mock session + scope + role→perm | P1 foundation, scale, DR/HA |
| **Frontend/Design System** | Shell, component library, tokens, a11y, beautify | **owns Track 1 end-to-end** | wires FE to real APIs |
| **Tracking/IoT** | Gateway adapters, ingestion, live map, twin | mock sensors/map/twin | P2 sense |
| **AI/Data** | Health/risk/predictive, model registry, explainability, BI | mock insights/scores/models | P3 predict, P4 BI |
| **Apps/Integrations** | Mobile/edge, public API, webhooks, marketplace | mock help/settings/admin | P5 platform |
| **Security/Compliance** | SSO/MFA, audit, GDPR/SOC2/ISO, retention | mock auth/audit screens | cross-cutting spine, evidence |
| **PM + Delivery Architect** | Sequencing, DoD gate, coverage self-check (00 §0.9) | runs the phase gates | roadmap alignment |

---

## 20.9 Start here — immediate next steps (first build tasks, demo)

Do these **in order**; each unblocks the next. This is the first week of Track 1.

1. **Route-group refactor (0.2).** Split `src/app` into `(auth)` (shell-less) and `(app)` (shell-wrapped);
   move `<AppShell>` out of the root layout into `app/(app)/layout.tsx`. Add `SessionProvider` +
   `ScopeProvider` with a fake session (user, role, permissions, scope tree). *This is the single highest-value
   refactor — it unblocks auth, role-adaptive nav, and permissions.*
2. **Design tokens + core primitives (0.1).** Formalize the token set in `globals.css` (extend the existing
   primary/health/surface tokens with spacing/radius/z/motion/focus) and build `Button, Input, Select, Badge,
   Card, Table, Tabs, Dialog, Drawer, Toast, Skeleton, EmptyState, ErrorState`. Stand up a dev-only
   `/system/kitchen-sink` to review them.
3. **Data-driven Sidebar (0.8).** Replace the 5 hardcoded links in `Sidebar.tsx` with a `navConfig` of the 12
   groups from 03 §3.2, filtered by the session's permissions (hidden-not-greyed), collapsible + active
   deep-match.
4. **Top bar + Copilot ⌘K (0.9, 0.10).** Rebuild `TopNav` into the real top bar (scope switcher, global search,
   quick-create, scan, alerts bell, help, theme, user menu) and add the `CommandPalette` opened by ⌘K/Ctrl-K.
5. **`/login` + `/mfa` (0.3, 0.4).** First real pages in `(auth)` — prove the shell-less layout, the session
   handshake, and the `next=` redirect.
6. **Global states + error routes (0.12).** Add `not-found.tsx`, `error.tsx`, `Forbidden` (403), `OfflineBanner`
   and router loading. From now on, **every** new page ships its states — enforce the 20.4 DoD as a review gate.
7. **`/` My Workspace (0.13).** First authenticated content page — composes widgets, proves role-personalization
   and deep-links, and becomes the landing after login.

Then proceed module by module through Phases 1→5, and finish with the single system-wide **beautify pass**
(Phase 6) against doc 15.
