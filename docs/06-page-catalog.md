# 6. Complete Page Catalog

**Document type:** Product Requirements Document (PRD) — page-level specification
**Version:** 2.0 · **Status:** Planning (pre-rebuild) · **Owner:** Product Architecture + UX Architecture
**Audience:** Product, Design, Frontend Engineering, QA
**Upstream contracts:** page *list* & routes → [00-master-blueprint.md](./00-master-blueprint.md) §0.6; global anatomy & states → §0.7; navigation → [03-information-architecture.md](./03-information-architecture.md); roles/permissions → [02-personas.md](./02-personas.md); dashboards → [04-dashboards.md](./04-dashboards.md); features → [05-feature-matrix.md](./05-feature-matrix.md).

> This is the **largest document in the blueprint** and the definitive per-page spec. It catalogs **every route**
> in the master inventory — from `/login` to `/maintenance-mode` — across the same **14 areas (A–N)**. It defines,
> once, a **Page Anatomy Template** and a **Standard State Set** that every page inherits, then specs each page's
> route, purpose, components, actions, tables/columns, filters, forms, charts/maps, required permissions, and the
> states that deviate from the default. Core pages (login, MFA, onboarding, workspace, registry, 360°, tracking,
> maintenance board + WO detail, AI insights, admin users/roles, alert center, report builder) are specced in full;
> the long tail is compact but complete. Nothing in §0.6 is omitted — see the coverage checklist in §6.16.

---

## 6.0 How to read this catalog

- **Route** uses Next.js dynamic-segment syntax (`[id]`, `[class]`). Gates from §0.6: `P` public · `A` authenticated · `PL` platform-tier only.
- **Permissions** are written `resource:action` per the RBAC model in [02-personas.md](./02-personas.md) §2.3 (Permission = Resource × Action, bound to a **scope**). A page may require *any-of* (`|`) or *all-of* (`+`). Row/field-level security still filters results *within* a granted page.
- **States**: each page lists only the states that carry **page-specific** copy or behavior. Every unlisted state falls back to the **Standard State Set** (§6.2) — assume all six exist on every content page (§0.7 rule: "no page is done with only the happy path").
- **Body pattern** names the skeleton from §6.1: `List` · `Board` · `Detail` · `Map/Twin` · `Builder` · `Wizard` · `Analytics` · `Feed` · `Form` · `Split` (list+inspector).
- **Shell**: every `A`/`PL` page renders inside the app shell (§6.1). Pre-shell `P` pages (auth) render on the **minimal auth chrome** instead.

---

## 6.1 Reusable Page Anatomy Template (defined once)

Every authenticated content page is assembled from **one skeleton** so the product reads as a single system (visual spec → [15-design-system.md](./15-design-system.md)). Per-page entries below reference these regions by name instead of re-describing them.

### 6.1.1 The app shell (persistent chrome)

| Region | Contents | Notes |
|--------|----------|-------|
| **Left Sidebar** | Role-adaptive module nav (12 groups, §3.2), collapsible, scope-filtered | Modules the role lacks are **hidden, not greyed**. Pinned/favorites at top. |
| **Top bar — left** | Logo · **Scope switcher** (Org ▸ Region ▸ Facility ▸ Building ▸ Floor ▸ Zone) · breadcrumb | Scope selection persists across modules & deep links (§3.5). |
| **Top bar — center** | Global search + **AI Copilot ⌘K** (navigate/filter/create/explain/act) | Every list & detail is reachable by NL command. |
| **Top bar — right** | Quick-create (＋) · **Scan** (QR/RFID/NFC) · Alerts bell (live count) · Help · Theme toggle · User menu | Scan opens camera/reader sheet → scan-to-open asset. |
| **Content region** | Page header + body (one pattern below) | Scrolls independently; shell is fixed. |

### 6.1.2 The page header (every content page)

`Title` · `subtitle/count` · `breadcrumb` · `scope chips` (active scope + quick-clear) · `primary action` (1) · `secondary actions` (overflow ⋯) · optional `tabs` · optional `view switcher` (list/board/calendar/map) · `freshness indicator` (live ● / "updated 2m ago").

### 6.1.3 Body patterns (pick one)

| Pattern | Anatomy | Used by |
|---------|---------|---------|
| **List** | Toolbar (search, filters, saved views, column config, density, bulk-action bar) → data table → pagination/infinite scroll | Registries, WO list, inventory, users |
| **Board** | Kanban columns (status/stage) with drag-drop cards, WIP counts, swimlanes | Maintenance, lifecycle, requests |
| **Detail** | Sticky object header (identity, status, key facts, actions) → **tab bar** → tab body → right rail (activity/comments/watch) | Asset 360°, WO detail, user detail |
| **Map/Twin** | Full-bleed canvas (map/floorplan) → layer toggles → left filter rail → right **inspector** on select → timeline scrubber | Live tracking, twin, movement, heatmaps |
| **Builder** | Left palette → center drag-drop canvas → right property/config inspector → live preview + save/publish | Dashboard builder, report builder, workflow builder |
| **Wizard** | Stepper (progress) → one step per screen → validation gate → review → finish; save-draft/resume | Onboarding, import, asset-new, provision-tenant |
| **Analytics** | KPI card row → chart grid → data tables → AI insight panel → filter bar (cross-filtering) | Dashboards, financials, BI, report view |
| **Feed** | Ranked/chronological cards with inline actions + right filter/facet rail | AI insights, alerts, notifications, activity |
| **Form** | Sectioned fields (fieldsets) → inline validation → sticky save/cancel footer + dirty-guard | Settings, alert-rule, edit pages |
| **Split** | Master list (left) + live detail/inspector (right); selection-driven | Alert center, telemetry, help |

### 6.1.4 Cross-cutting affordances (on every entity page)

Audit trail · comments/@mentions · watch/subscribe · favorite/pin · **share (scoped, expiring link)** · export (CSV/PDF/PNG) · **"Explain this" (AI)** · full keyboard nav · deep-linkable filter state (URL query) · optimistic UI + undo · print-friendly view. (Cross-cutting features 241–270 in [05-feature-matrix.md](./05-feature-matrix.md).)

---

## 6.2 Standard State Set (defined once)

Per §0.7, **every** content page implements all six states. Below is the canonical spec; per-page entries note only **deviations** (special copy, gated CTA, partial-degrade behavior).

| State | Trigger | Layout | Primary CTA | Secondary | Telemetry |
|-------|---------|--------|-------------|-----------|-----------|
| **Loading** | Data in flight | **Skeletons** matching final layout (rows/cards/chart frames), shimmer; header renders immediately with disabled actions | — | Cancel long queries | TTFB / query latency logged |
| **Empty** (no data yet) | Zero records in scope, first-run | Centered illustration + one-line explainer + **primary CTA to create/import** + "Learn more" link | e.g. *Register asset* / *Import* / *Create rule* | Sample-data / template link | `empty_state_view` |
| **No-results** (filtered) | Filters/search exclude all | Compact panel: "No matches for these filters" + **Clear filters** + adjust-query hint | **Clear all filters** | Save this (empty) search, broaden scope | `zero_results` + active facets |
| **Error** | Query/mutation failed | Inline error card (non-destructive keeps last data) + **Retry** + **trace id** (copyable) + support link | **Retry** | Report issue → prefilled `/support` | trace id, error code, endpoint |
| **Permission-denied (403)** | Lacks `resource:action` for page/record/field | Explanation of *what* is missing + **Request access** (routes to approver) + who to contact | **Request access** | Switch scope, back to Home | `access_denied` + missing perm |
| **Offline** | Network lost / edge mode | Sticky **cached banner** ("Showing data from HH:MM"); reads served from cache; writes **queued** with badge; disabled actions labeled | Retry connection | View queued changes | offline duration, queue depth |

**Field-level variants:** masked fields (e.g. cost hidden from Technician) render a lock glyph + "Hidden by policy," not an error. **Partial degrade:** if one widget/tab fails, it shows a local error card while the rest of the page stays live. **Optimistic writes:** mutations apply instantly with an **Undo** toast; on failure they roll back with an error toast + trace id.

---

## 6.3 Permission vocabulary (resource:action reference)

Resources used throughout this catalog (bound to scope at assignment; see [16-security-compliance.md](./16-security-compliance.md)). Common actions: `read · create · update · delete · export · approve · assign · transition · run · manage`.

| Resource | Example actions | Resource | Example actions |
|----------|-----------------|----------|-----------------|
| `asset` | read, create, update, delete, transition, export, merge | `report` | read, create, run, schedule, export |
| `taxonomy` | read, manage | `bi` | read, query, export |
| `workorder` (`wo`) | read, create, assign, update, close, approve | `finance` | read, approve, export |
| `pm` | read, create, update | `depreciation` | read, manage |
| `inspection` | read, run, submit | `alert` | read, ack, escalate, resolve |
| `part` | read, issue, return | `alertrule` | read, create, update |
| `inventory` | read, adjust, count, receive | `audit` | read, run, export |
| `procurement` (`po`) | read, create, approve, receive | `custody` | read, transfer, reconcile |
| `transfer` | read, create, approve | `cert` | read, manage |
| `reservation` | read, create, cancel | `retention` | read, manage, hold |
| `custody` / `checkinout` | read, checkout, checkin | `org` | read, manage |
| `sensor` | read, configure, calibrate | `facility` | read, manage |
| `gateway` | read, configure | `user` | read, invite, update, deactivate |
| `geofence` | read, create, update | `role` | read, create, assign |
| `telemetry` | read, export | `team` | read, manage |
| `twin` | read, edit | `workflow` | read, create, publish |
| `ai` | read, act, feedback | `integration` | read, manage |
| `model` | read, deploy, retrain | `apikey` / `webhook` | read, create, revoke |
| `copilot` | use | `data` | import, export, backup |
| `dashboard` | read, create, publish | `branding`/`localization` | manage |
| `notification` | read, manage | `billing` | read, manage |
| `system`/`tenant`/`flag` | read, manage, provision, impersonate | `help`/`support` | read, create |

> **Baseline:** any signed-in user gets `home:read`, `copilot:use`, `notification:read`, `settings:self`, `help:read`. Everything else is grant-gated + scope-filtered.

---

# Area A — Authentication & Onboarding (pre-shell)

Pre-shell pages render on **minimal auth chrome** (centered card, product logo, tenant branding if resolvable from subdomain, theme toggle, locale switcher, legal footer) — **no sidebar, no scope switcher**. Security spec → [16-security-compliance.md](./16-security-compliance.md); end-to-end auth flow → [19-user-flows.md](./19-user-flows.md).

## A1 · `/login` — Sign in *(CORE — full detail)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/login` · `P` · Form (centered card) |
| **Purpose** | Primary entry: authenticate by email/username + password, or route to SSO/passkey. Tenant-aware (subdomain or email-domain → org branding + enforced auth method). |
| **Key components** | Product logo + tenant brand slot · email/username field · password field (show/hide) · "Remember this device" · **Sign in** button · **SSO buttons** (Google/Microsoft/Okta/SAML — rendered per tenant policy) · "Sign in with passkey" · links: *Forgot password*, *Accept invite*, *Contact sales* · locale + theme toggles · trust/security badges (SOC2/ISO) |
| **Primary actions** | `Sign in` (email/password) → `/mfa` or `/` · `Continue with {SSO}` → `/login/sso/[provider]` · `Use passkey` (WebAuthn) |
| **Forms & key fields** | `identifier` (email/username, required, format-validated) · `password` (required, masked) · `remember_device` (bool) · hidden `tenant_hint`, `return_to` |
| **Filters / Tables / Charts** | None |
| **Permissions** | Public. On success issues session per RBAC/scope. |
| **Notable states** | **Error (invalid creds):** generic "Email or password is incorrect" (no user-enumeration) + attempt counter; after N fails → offer reset. **Locked:** redirect `/locked`. **SSO-enforced:** password field hidden, only SSO button shown ("Your organization requires SSO"). **Rate-limited:** soft CAPTCHA / cooldown. **Offline:** "Can't reach sign-in — retry." **Loading:** button spinner, inputs disabled. |
| **Notes / decisions** | No user enumeration on any error; passkey-first is offered when the device has a registered credential. SSO discovery by email domain mirrors Okta/Azure patterns but is tenant-configurable. |

## A2 · `/login/sso/[provider]` · `/auth/callback` — SSO redirect & callback *(CORE)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/login/sso/[provider]` (outbound) · `/auth/callback` (inbound) · `P` · Interstitial |
| **Purpose** | Hand off to the IdP (OIDC/SAML) and process the returned assertion; provision/link the user (JIT + SCIM), then continue to MFA or app. |
| **Key components** | Branded "Redirecting to {IdP}…" spinner · on callback: "Signing you in…" progress · fallback "Continue manually" link |
| **Primary actions** | Auto-redirect to IdP · on return: exchange code/assertion → establish session |
| **Forms & key fields** | None user-facing; carries `state`, `nonce`, `code`, `provider`, `return_to` |
| **Permissions** | Public; provider must be enabled for the tenant. |
| **Notable states** | **Error:** assertion invalid / expired `state` / user not provisioned & JIT disabled → "Couldn't complete sign-in with {IdP}" + trace id + *Try another method*. **Denied:** IdP returned access_denied → back to `/login`. **Loading (default):** the whole page is a progress interstitial. |
| **Notes** | Vendor-neutral: providers configured in `/admin/integrations`. Never expose raw IdP errors to end users. |

## A3 · `/mfa` — MFA / passkey challenge *(CORE — full detail)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/mfa` · `P` (post-primary-auth, pre-session) · Form |
| **Purpose** | Second factor: TOTP, push, SMS/email OTP, or passkey/WebAuthn, per tenant policy and user enrollment. |
| **Key components** | Method selector (TOTP · Passkey · Push · SMS · Email · Backup code) · **OTP input** (6-digit, auto-advance, paste-aware) · "Trust this device for 30 days" · Resend (with cooldown timer) · "Use another method" · "Lost your device?" → recovery |
| **Primary actions** | `Verify` → `/` (or `/select-org` if multi-tenant) · `Send push` / `Resend code` · `Use passkey` |
| **Forms & key fields** | `otp` (numeric, length-validated) · `method` · `trust_device` (bool) · `remember_days` |
| **Permissions** | Public within a valid pending-auth session. |
| **Notable states** | **Error (bad code):** "That code didn't match" + remaining attempts; lockout after threshold → `/locked`. **Expired code:** prompt resend. **No factor enrolled + policy requires:** route to enrollment sub-flow. **Push timeout:** "Didn't get it? Resend or choose another method." **Loading:** verify spinner. |
| **Notes** | Passkey/WebAuthn preferred over SMS (SMS retained for coverage). Backup codes are single-use, shown once at enrollment. |

## A4 · `/forgot-password` · `/reset-password` — Recovery *(compact)*

| Route / Gate | Purpose | Key components / Forms | Actions | Permission | Notable states |
|--------------|---------|------------------------|---------|-----------|----------------|
| `/forgot-password` · `P` · Form | Request a reset link | `email` field · submit · back-to-login | `Send reset link` | Public | **Success (always, anti-enumeration):** "If that email exists, we've sent a link" regardless. **Rate-limited:** cooldown. |
| `/reset-password` · `P` · Form | Set a new password from a tokened link | `new_password` + `confirm` · live **strength meter** + policy checklist · token (hidden) | `Reset password` → `/login` | Public + valid token | **Error (expired/invalid token):** "This link expired" + *Request a new one*. **Policy fail:** inline rules. |

## A5 · `/accept-invite` · `/set-password` — Onboard invited user *(compact)*

| Route / Gate | Purpose | Key components / Forms | Actions | Permission | Notable states |
|--------------|---------|------------------------|---------|-----------|----------------|
| `/accept-invite` · `P` · Form | Accept an org invite; confirm identity + role preview | Org/brand header · inviter + **role/scope preview** · name fields · accept ToS | `Accept & continue` → `/set-password` | Valid invite token | **Expired invite:** "Ask your admin to resend." **Already accepted:** → `/login`. |
| `/set-password` · `P` · Form | Set initial password (+ optional MFA enrollment kickoff) | `password` + confirm · strength meter · optional "Set up MFA now" | `Set password` → `/mfa` setup or `/` | Valid token | **Policy fail:** inline. **Token reuse:** blocked. |

## A6 · `/verify-email` — Email verification landing *(compact)*

| Route / Gate | Purpose | Key components | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|-----------|----------------|
| `/verify-email` · `P` · Interstitial | Confirm email via tokened link; enable notifications/login | Status card (verifying → verified/failed) · resend | `Continue` → `/login` or `/` · `Resend email` | Public + token | **Verified:** success + auto-continue. **Expired:** *Resend verification*. **Already verified:** friendly note. |

## A7 · `/select-org` — Org / tenant switcher *(compact)*

| Route / Gate | Purpose | Key components / Tables | Actions | Permission | Notable states |
|--------------|---------|-------------------------|---------|-----------|----------------|
| `/select-org` · `A` · List | For users belonging to multiple tenants: choose the active org (sets default scope) | Search + **org list** (logo, name, role badge, last-active, MFA status) · recent orgs pinned | `Enter {Org}` → `/` · set default | Authenticated (membership) | **Single org:** auto-skip. **Empty:** "You don't belong to any active org — contact an admin." **Pending/suspended org:** disabled row + reason. |

## A8 · `/onboarding` — First-run setup wizard *(CORE — full detail)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/onboarding` · `A` · **Wizard** (stepper, save-draft/resume) |
| **Purpose** | Stand up a new tenant to first value: org profile → org structure → asset import → team invites → integrations → done. Mirrors the "sample data generator" so a demo tenant is believable in minutes (feature 238). |
| **Steps (stepper)** | **1 Welcome/goals** (industry pack pick → seeds taxonomy + dashboards + compliance templates) · **2 Organization** (name, logo, timezone, currency, units) · **3 Structure** (add Regions/Facilities/Buildings/Floors/Zones — tree editor or CSV) · **4 Import assets** (CSV/Excel/API, field-map, **dry-run validation**, or "start with sample data") · **5 Invite team** (emails + role + scope; bulk paste) · **6 Connect** (optional: SSO/SCIM, ERP, IoT gateway, comms) · **7 Review & launch** |
| **Key components** | Stepper w/ completion %, per-step skip/save-draft, side "why this matters" helper, **live preview** of resulting org tree & seeded dashboards, progress persists server-side |
| **Primary actions** | `Continue` / `Back` · `Skip for now` · `Save & finish later` · **`Launch workspace`** → `/` |
| **Forms & key fields** | Org: `name, logo, industry, timezone, currency, unit_system, fiscal_start`. Structure: nested `facility{name, address, type}` → `building/floor/zone`. Import: `file`, `mapping[]`, `dedupe_key`, `dry_run`. Invites: `email, role, scope`. Integrations: provider + credentials (deep-linked to `/admin/integrations`). |
| **Tables/Charts** | Import **dry-run results table** (row #, status ✓/✗, error reason) + summary counts; structure tree preview. |
| **Permissions** | `org:manage` (typically Organization Admin, first user of a new tenant). |
| **Notable states** | **Empty (fresh tenant):** the wizard *is* the empty state. **Import error:** dry-run flags bad rows with downloadable error report — no partial commit until confirmed. **Resume:** re-entry restores last step. **Permission-denied:** non-admins see a read-only "Setup in progress by {admin}" screen. **Offline:** import disabled with banner. |
| **Notes** | Industry-pack seeding is the time-to-value wedge vs. Maximo's blank-slate setup. Everything created here is editable later in Area L (Admin). |

## A9 · `/locked` · `/session-expired` — Account state prompts *(compact)*

| Route / Gate | Purpose | Key components | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|-----------|----------------|
| `/locked` · `P` · Notice | Account locked (failed attempts / admin / risk) | Reason (generic) · unlock guidance · contact admin | `Request unlock` · `Back to sign-in` | Public | Static notice; no data. |
| `/session-expired` · `P` · Notice | Session/idle timeout → re-auth prompt | "Your session ended" · shows return-to target | `Sign in again` (preserves `return_to`) | Public | Preserves unsaved-draft hint where possible. |

## A10 · `/provision-tenant` — New-tenant provisioning *(compact, platform)*

| Route / Gate | Purpose | Key components / Forms | Actions | Permission | Notable states |
|--------------|---------|------------------------|---------|-----------|----------------|
| `/provision-tenant` · `PL` · Wizard | Access Genie staff spin up a new customer tenant (plan, region, admin, quotas) | Steps: org identity · region/data-residency · plan & entitlements/flags · seed admin invite · quotas/limits · review | `Provision` → tenant created + admin invited | `tenant:provision` (Super Admin) | **Error:** slug collision, region capacity → inline. **Success:** deep-link to `/system/tenants/{id}`. |

---

# Area B — Workspace & Dashboards

App-shell pages. Dashboard widget specs (KPIs, charts, tables, AI, actions, filters) are authoritative in [04-dashboards.md](./04-dashboards.md); below we spec the **page** wrapper, permissions, and states. The 8 role dashboards share one template, differing by widget set + default role.

## B1 · `/` — Home / My Workspace *(CORE — full detail)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/` · `A` · Analytics + Feed hybrid (role-personalized landing) |
| **Purpose** | The role-adaptive landing: greets the user, surfaces *their* work, alerts, KPIs, and AI insights, and routes them onward in one click. Composition = the user's default dashboard (§4) + personal work + Copilot entry. |
| **Key components** | Greeting + scope chips · **"For you" AI narrative** ("3 things needing attention") · **KPI row** (from role dashboard) · **My Work** widget (assigned WOs/tasks/approvals) · **Alerts to triage** · **Recent & Favorites** rails · **Copilot prompt** bar · quick-create tiles · "Customize" → `/dashboards/builder` |
| **Primary actions** | Act-on-insight (→ WO/transfer/etc.) · Ask Copilot · Open my work · Acknowledge alert · Quick-create (asset/WO/report) |
| **Tables** | *My open items* (Item, Type, Priority, Due, Scope) · *Alerts* (Time, Type, Asset, Severity, Action) |
| **Filters** | Scope (inherited) · time range · "assigned to me / my team" |
| **Charts/Maps** | Role KPI cards + 1–2 sparkline trends; optional mini facility map for ops/security roles |
| **Permissions** | `home:read` (baseline). Each widget self-gates (e.g. finance KPI needs `finance:read`); ungated widgets are omitted, not shown empty. |
| **Notable states** | **Empty (new user, no work):** "You're all caught up" + suggested first actions per role + tour link. **Partial:** each widget degrades independently. **Offline:** cached snapshot + banner. **Loading:** KPI/card skeletons. |
| **Notes** | This is the shell-first landing built in Phase 1 (§0.8). Widgets a role can't see never render — the page composes from permissions, matching the role-adaptive sidebar. |

## B2 · `/dashboards` — Dashboard switcher & gallery *(compact)*

| Route / Gate | Purpose | Key components | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|-----------|----------------|
| `/dashboards` · `A` · List/Gallery | Browse role, shared, and custom dashboards; set default | Cards (name, owner, role, thumbnail, last-viewed) · tabs: *Mine · Role · Shared · Templates* · search | `Open` · `Set as default` · `Clone` · `Create` → builder | `dashboard:read` | **Empty:** "No custom dashboards yet — start from a template." |

## B3 · `/dashboards/{executive|operations|maintenance|asset|ai|security|inventory|financial}` — The 8 role dashboards *(CORE template)*

| Field | Spec |
|-------|------|
| **Routes / Gate / Pattern** | `/dashboards/executive` · `/operations` · `/maintenance` · `/asset` · `/ai` · `/security` · `/inventory` · `/financial` · `A` · **Analytics** |
| **Purpose** | The eight canonical role command centers. Each = **KPI row → visual analytics → work/alert lists → AI insight panel → quick actions → filters** (per [04-dashboards.md](./04-dashboards.md) §4.1–4.8). |
| **Key components** | KPI cards (threshold-themed) · chart grid (SVG line/bar/donut/funnel/heatmap) · maps (ops/security/exec) · work & alert tables · **AI insight panel** with "Explain this" · quick-action bar · cross-filtering filter bar · freshness badge per widget |
| **Primary actions** | Per dashboard (see §4): e.g. Ops → *Assign WO / Initiate transfer / Locate / Ack*; Maint → *Create WO / Dispatch / Schedule PM / Order parts*; Financial → *Approve write-off / Export to GL*; AI → *Act on insight / Provide feedback* |
| **Tables** | Per §4 (e.g. Exec: Top-10 highest-risk assets, facilities by performance; Maint: overdue WOs, upcoming PMs, tech load) |
| **Filters** | Scope + dashboard-specific (Region/Facility/Zone/Category/Time/Shift/Technician/Cost-center — see §4) with **cross-filter on click** |
| **Charts/Maps** | Full set per §4 (choropleth footprint, live facility map, funnels, Pareto, waterfalls, heatmaps, depreciation projections) |
| **Permissions** | Base `dashboard:read` **plus** the domain read for its data: exec `finance:read+asset:read`; ops `asset:read+wo:read`; maintenance `wo:read+pm:read`; asset `asset:read`; ai `ai:read`; security `alert:read+custody:read`; inventory `inventory:read`; financial `finance:read+depreciation:read`. Users lacking a dashboard's domain don't see it in the gallery. |
| **Notable states** | **Permission-denied:** whole-dashboard 403 with request-access if the domain read is missing; single-widget 403 masks just that widget. **Empty:** per-widget empty ("No overdue WOs 🎉"). **Real-time vs cached:** each widget shows freshness; live widgets stream. **Export/subscribe:** any dashboard → PDF/PNG/scheduled (feature 145, [17-reporting-bi.md](./17-reporting-bi.md)). |
| **Notes** | One template, eight configs — consistency is the point. AI-narration "Explain this" (feature 300) on every dashboard. |

## B4 · `/dashboards/builder` — Custom dashboard builder *(compact-plus)*

| Route / Gate | Purpose | Key components | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|-----------|----------------|
| `/dashboards/builder` · `A` · **Builder** | Drag-drop grid to compose/clone dashboards from a 40+ widget library; save/share/set-default | Left **widget palette** · center resizable grid canvas · right **widget config** (data source, filter, threshold, drill-through, cadence) · preview toggle | `Add widget` · `Configure` · `Save` · `Clone` · `Set as role default` · `Share/publish` (signed URL) | `dashboard:create` (Managers+) | **Empty canvas:** "Drag a widget to begin." **Invalid config:** widget shows config-error card. **Unsaved-changes guard** on exit. |

## B5 · `/copilot` — Full-page AI Copilot *(CORE)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/copilot` · `A` · Split (conversation + context panel). Also the ⌘K overlay everywhere. |
| **Purpose** | The differentiator UX: a natural-language command bar that can **navigate, filter, create, explain, and act** across modules (features 53–56, 219–221). "Show critical assets in Building A not scanned in 7 days," "Open a WO for pump-12," "Explain this risk score." |
| **Key components** | Conversation thread (user + agent turns) · **suggested prompts** (role-aware) · **result cards** (asset/WO/report previews, tables, charts) with inline actions · **action confirmation** step for mutating commands (SoD-aware) · citations/"why" (explainability) · right rail: current scope, recent entities, history |
| **Primary actions** | Send prompt · **Confirm suggested action** (create/assign/transfer — gated by the underlying permission + SoD) · Save as saved-view/report · Thumbs up/down (feedback loop → `/ai/feedback`) |
| **Forms** | Free-text prompt; structured confirmations render mini-forms (e.g. WO create prefilled) |
| **Permissions** | `copilot:use` (baseline). **Every executed action re-checks the real permission** — Copilot never bypasses RBAC/scope/SoD; read-only users get answers, not writes. |
| **Notable states** | **Empty:** greeting + example prompts by role. **No-answer/low-confidence:** "I'm not sure — here's what I found" + links, never a fabricated action. **Permission-denied on action:** explains the missing perm + offers request-access. **Error:** model/service failure → retry + trace id. **Offline:** disabled with "Copilot needs a connection." |
| **Notes** | Agentic actions are always **confirm-before-execute** and fully audited. See [08-ai-intelligence.md](./08-ai-intelligence.md) for the copilot architecture, tool-use, and governance. |

## B6 · `/my-work` — Assigned work & approvals *(compact-plus)*

| Route / Gate | Purpose | Key components / Tables | Filters | Actions | Permission | Notable states |
|--------------|---------|------------------------|---------|---------|-----------|----------------|
| `/my-work` · `A` · List/Board | One queue for the individual: assigned WOs, tasks, inspections, and pending approvals | Tabs: *WOs · Tasks · Approvals · Inspections* · table (Item, Type, Priority, Due, Asset, Scope, Status) · list/board toggle · **route map** for field techs | Status, priority, due (today/overdue), type | `Start` · `Complete` · `Reassign` · `Approve/Reject` · `Scan to open` | `wo:read` (+ item-type reads); approvals need `*:approve` | **Empty:** "Nothing assigned — enjoy the calm." **Offline (field):** cached WOs, queued updates (mobile parity → [14-mobile-apps.md](./14-mobile-apps.md)). |

## B7 · `/notifications` — Notification inbox *(compact)*

| Route / Gate | Purpose | Key components | Filters | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|---------|-----------|----------------|
| `/notifications` · `A` · Feed | Unified in-app inbox: mentions, assignments, alert digests, system notices | Grouped feed (Today/Earlier), unread badges, type icons, deep-link to source, bulk select | Type, read/unread, source module, time | `Mark read/unread` · `Mark all read` · `Mute source` · `Open` · link → `/notifications/preferences` | `notification:read` | **Empty:** "You're all caught up." **No-results:** clear filters. |

## B8 · `/favorites` · `/recent` — Pinned & recent items *(compact)*

| Route / Gate | Purpose | Key components | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|-----------|----------------|
| `/favorites` · `A` · List | User-pinned assets/WOs/reports/views/dashboards | Grouped by entity type · search · drag-reorder | `Open` · `Unpin` · `Organize` | Baseline (self) | **Empty:** "Pin items with ★ to find them fast." |
| `/recent` · `A` · List | Recently viewed entities across modules | Chronological list, type icon, timestamp, scope | `Open` · `Pin` · `Clear history` | Baseline (self) | **Empty:** "Nothing viewed yet." |

---

# Area C — Assets

The registry + 360° profile are the product's spine. Deep detail below; the 360° page is *summarized* here and specced field-by-field in [10-asset-360-profile.md](./10-asset-360-profile.md).

## C1 · `/assets` — Asset Registry *(CORE — full detail)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/assets` · `A` · **List** (master table) |
| **Purpose** | The scope-filtered master list of every asset; the primary entry to the 360°. Built to feel instant at 10M+ assets/tenant (server-side paging, virtualized rows, saved views). |
| **Key components** | Toolbar: global-within-list search · **faceted filter bar** · **Saved Views** dropdown (mine/shared) · **column config** (add/reorder/pin/hide) · density toggle · **bulk-action bar** (appears on selection) · export · view switch (Table/Board-by-status/Map) · live-count + freshness · **scan-to-find** |
| **Primary actions** | **Register asset** (→ `/assets/new`) · **Import** (→ `/assets/import`) · **Print labels** (→ `/assets/labels`) · row: Open/Edit/Transfer/Assign/Retire · **bulk**: edit, tag, transfer, assign, start-audit, export, soft-delete (with undo) |
| **Tables & columns** | Default: **Tag/ID · Name · Class/Category · Status** (Active/Idle/In-repair/In-transit/Retired) · **Health** (0–100, AI) · **Risk** · Location (Facility▸Zone) · Custodian · Last-seen · **Utilization %** · Value/Book · Warranty · Criticality. Optional (column config): Serial, Manufacturer, Model, Purchase date, Cost center, Lifecycle stage, Tag type (RFID/BLE/GPS), Battery, Data-quality %. Row: select · ★ · health chip · overflow ⋯. |
| **Filters** | Class/Category · Status · Lifecycle stage · Facility/Building/Zone (scope) · Custodian/Department · Criticality · Health band · Risk band · Utilization band · Tag/tracking type · Warranty (expiring) · Value band · Data-quality flag · Tags/labels · "not scanned in N days" · Saved filters. All **deep-linkable** (URL query). |
| **Forms** | Inline quick-edit (status, custodian, tags) via row popover; full create/edit are separate pages. |
| **Charts/Maps** | Optional **Map view** (asset pins by last-known location) + status distribution mini-bar in header. |
| **Permissions** | `asset:read` (list, scope-filtered). Bulk actions gate per-action: `asset:update`, `asset:transition`, `transfer:create`, `audit:run`, `asset:delete`, `asset:export`. **Field-level:** cost/book columns hidden without `finance:read` (rendered locked, not errored). |
| **Notable states** | **Empty (no assets in scope):** illustration + **Register** / **Import** / "Load sample data" CTAs. **No-results (filtered):** "No assets match" + **Clear filters** + show active facets. **Loading:** table skeleton (10 shimmer rows) with header live. **Error:** inline retry + trace id, keeps prior page. **Permission-denied:** 403 with request-access. **Offline:** cached page + banner; bulk writes queued. |
| **Notes / decisions** | Health/Risk are **first-class columns**, not a hidden tab — the AI-native principle made visible (§0.4). Saved Views are shareable, scoped URLs (feature 17). Column config + saved views are per-user, publishable to team. |

## C2 · `/assets/new` — Register asset *(CORE)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/assets/new` · `A` · **Wizard/Form** (class-driven dynamic form) |
| **Purpose** | Create a single asset; the **class picked drives the attribute template** (dynamic fields), so every class captures the right data (features 3, 13). |
| **Steps/Sections** | **1 Class & identity** (class → dynamic template load; name, auto Asset ID + human tag, serial) · **2 Attributes** (per-class custom fields w/ units/pick-lists/validation) · **3 Location & custody** (facility▸zone, custodian/dept) · **4 Tracking** (tag type RFID/BLE/UWB/GPS/QR/NFC, tag ID/encode) · **5 Financial** (purchase cost, date, vendor, cost center, depreciation method — gated `finance:*`) · **6 Warranty/compliance** (warranty, certs) · **7 Attachments** (docs/photos/manuals/CAD) · **8 Review & create** |
| **Key components** | Stepper · dynamic form renderer · **duplicate/ghost warning** (AI, feature 10) as you type serial/name · "clone from template/existing" · save-draft · label-print prompt on finish |
| **Primary actions** | `Create` · `Create & add another` · `Create & print label` · `Save draft` |
| **Forms & key fields** | `class` (req) · `name` (req) · `asset_id` (auto) · `tag` · `serial` · dynamic `attributes{}` · `facility/zone` · `custodian` · `tag_type/tag_id` · `purchase_cost/date/vendor/cost_center/depreciation_method` · `warranty` · `attachments[]` |
| **Permissions** | `asset:create` (scope). Financial section requires `finance:read`+`depreciation:manage`; otherwise hidden. |
| **Notable states** | **Duplicate detected:** non-blocking warning + "View match / Continue anyway." **Validation:** inline per field. **Permission-denied:** 403. **Offline:** save-draft locally, queue create. |
| **Notes** | Class-templated dynamic forms are the anti-CRUD differentiator (§0.10) — vs. Maximo's fixed spec forms. |

## C3 · `/assets/import` — Bulk import *(CORE)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/assets/import` · `A` · **Wizard** |
| **Purpose** | Onboard many assets via CSV/Excel/API with **field-mapping, validation, and dry-run** before any commit (features 7, 168). |
| **Steps** | **1 Source** (upload CSV/Excel · paste · API/connector · pick template) · **2 Map fields** (source→asset attributes, per-class, save mapping) · **3 Options** (dedupe key, update-vs-insert, default class/scope, label-print) · **4 Dry-run validation** (row-by-row results) · **5 Commit** (progress + rollback-on-fail) · **6 Summary** |
| **Key components** | Dropzone · mapping grid (with auto-match + confidence) · **validation results table** · downloadable error report · progress bar · saved mapping presets |
| **Primary actions** | `Validate (dry-run)` · `Import` · `Download errors` · `Fix & re-upload` |
| **Tables** | Dry-run: Row# · Status(✓/⚠/✗) · Asset · Field · Error/Warning; summary counts (insert/update/skip/error) |
| **Permissions** | `data:import` + `asset:create` (scope). |
| **Notable states** | **All-invalid:** block commit, "Fix errors first." **Partial-valid:** choose "import valid only" or fix all. **Large file:** background job + notification on completion. **Offline:** disabled. |

## C4 · `/assets/[id]` — Asset 360° Profile *(CORE — summarized; full spec → doc 10)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/assets/[id]` · `A` · **Detail** (14-tab object page) |
| **Purpose** | The single, live view of one asset — record + location + condition + prediction + cost + history — the "same object" thesis of the platform (§1.7). Full field-by-field spec in [10-asset-360-profile.md](./10-asset-360-profile.md). |
| **Object header** | Photo/icon · Name + Tag/ID · **Status** · **Health** & **Risk** chips · Criticality · Location (live) · Custodian · quick facts · **actions**: Edit · Transfer · Assign · Check-out/in · Create WO · Start inspection · Locate on map · Retire/Dispose · Share · Watch · ★ · **Explain this (AI)** · Print label · overflow |
| **The 14 tabs** | **1 Overview** · **2 Timeline** (event stream) · **3 Tracking** (live + trail) · **4 Health** (AI score + drivers) · **5 Maintenance** (WO history, PM) · **6 Warranty & Certs** · **7 Ownership/Custody** · **8 Documents** · **9 Sensors/Telemetry** · **10 AI Insights** (predictions, RUL, recommendations) · **11 History** (immutable changes) · **12 Audit** · **13 Risk** · **14 Financials** (cost/TCO/depreciation — field-gated). |
| **Tables/Charts/Maps** | Per tab: mini live-map (Tracking), health trend + driver bars (Health), WO table (Maint), telemetry time-series (Sensors), depreciation curve + TCO (Financials), custody log (Ownership), audit table (Audit). |
| **Permissions** | `asset:read` for the record + scope. **Tabs self-gate:** Financials → `finance:read` (else tab hidden/locked); Audit → `audit:read`; Sensors → `telemetry:read`; edit actions → `asset:update`; transitions → `asset:transition`. Field-level masking throughout. |
| **Notable states** | **Not found / out of scope:** 404 vs 403 disambiguated. **Per-tab loading/empty:** each tab lazy-loads with its own skeleton/empty (e.g. "No sensors bound to this asset"). **Partial:** one failed tab doesn't break the page. **Offline:** cached snapshot; write actions queued. |
| **Notes** | Every entity page in the product follows this exact Detail pattern (§0.4 principle 7) — consistency across asset/WO/sensor/user. |

## C5 · `/assets/[id]/edit` — Edit asset *(compact)*

| Route / Gate | Purpose | Key components / Forms | Actions | Permission | Notable states |
|--------------|---------|------------------------|---------|-----------|----------------|
| `/assets/[id]/edit` · `A` · Form | Edit master data (same class-driven dynamic form as create, prefilled) | Sectioned form · **field-level change diff** · dirty-guard · reason-for-change (audited) | `Save` · `Save & view` · `Cancel` | `asset:update` (scope); financial fields need `finance:*` | **Field-locked:** masked fields read-only. **Conflict:** optimistic-lock warning if changed elsewhere. **Offline:** queue edit. |

## C6 · `/assets/labels` — Label & tag printing *(compact)*

| Route / Gate | Purpose | Key components | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|-----------|----------------|
| `/assets/labels` · `A` · Builder/List | Generate & print QR/barcode labels and **encode RFID/NFC** for selected assets (feature 9) | Asset selector (from registry/selection) · **template picker** (size, fields, logo) · live preview · printer/encoder target · batch queue | `Print` · `Encode RFID/NFC` · `Save template` · `Export PDF` | `asset:read` + `asset:update` (to bind tag IDs) | **Empty:** "Select assets to label." **Printer/reader offline:** queue + retry banner. |

## C7 · `/taxonomy` · `/taxonomy/[class]` — Categories & taxonomy *(compact-plus)*

| Route / Gate | Purpose | Key components / Forms | Actions | Permission | Notable states |
|--------------|---------|------------------------|---------|-----------|----------------|
| `/taxonomy` · `A` · Split (tree+detail) | Manage the asset class hierarchy & attribute templates (features 2, 3, 164) | Left **class tree** (drag to reparent) · right: class detail, attribute template, counts | `New class` · `Add attribute` · `Reorder` · `Publish` | `taxonomy:read` (view) / `taxonomy:manage` (edit) | **Empty:** seeded by industry pack; else "Create your first class." |
| `/taxonomy/[class]` · `A` · Detail | One class: attributes (name, type, units, pick-list, validation, required), inheritance, asset count | Attribute editor grid · inheritance preview · usage stats | `Add/Edit attribute` · `Set required` · `Deprecate` | `taxonomy:manage` | **In-use warning:** editing/removing attributes with data prompts impact review. |

## C8 · `/groups` · `/groups/[id]` · `/kits` — Groups, fleets & kits *(compact)*

| Route / Gate | Purpose | Key components / Tables | Actions | Permission | Notable states |
|--------------|---------|-------------------------|---------|-----------|----------------|
| `/groups` · `A` · List | Asset groups/fleets for bulk ops & reporting (feature 6) | Groups table (Name, Type, #Assets, Owner, Scope) · search | `New group` · `Open` · `Bulk-op group` | `asset:read` | **Empty:** "Group assets to operate on them together." |
| `/groups/[id]` · `A` · Detail | One group: members, shared attributes, group-level actions | Member table + add/remove · group KPIs · bulk actions | `Add/Remove` · `Bulk edit` · `Group WO` | `asset:read` (+`asset:update` for ops) | **No members:** add-members empty. |
| `/kits` · `A` · List/Detail | Kits/bundles & parent-child assemblies (BOM-like) | Kit list · kit detail (components, parent/child tree) | `New kit` · `Add component` · `Check-out kit` | `asset:read`/`asset:update` | **Empty:** "Bundle components into kits." |

## C9 · `/lifecycle` · `/disposal` — Lifecycle & disposal *(compact-plus)*

| Route / Gate | Purpose | Key components | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|-----------|----------------|
| `/lifecycle` · `A` · **Board** | Kanban of assets by lifecycle stage: Procurement → Staging → In-service → Maintenance → Transfer → EOL → Retired → Disposed (feature 106; full model → [07-asset-lifecycle.md](./07-asset-lifecycle.md)) | Stage columns w/ counts + value · drag to transition (SoD-gated) · **AI EOL flags** · filters (class/facility/age/value) | `Move stage` · `Plan replacement` · `Bulk retire` | `asset:read` (view) / `asset:transition` (move) | **Empty:** per-column empties. **Blocked transition:** SoD/approval gate explains why. |
| `/disposal` · `A` · List/Wizard | Retire/decommission & dispose (sell/scrap/donate/recycle) with **certificates** & write-off tie-in (features 109, 110) | Disposal queue table · disposal wizard (method, buyer/recycler, value recovered, certificate upload, GL/write-off) | `Start disposal` · `Approve` · `Generate certificate` · `Export` | `asset:transition` + `finance:approve` (write-off) — **SoD: requester ≠ approver** | **Pending approval:** shows approver + status. |

## C10 · `/saved-views` — Saved views manager *(compact)*

| Route / Gate | Purpose | Key components | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|-----------|----------------|
| `/saved-views` · `A` · List | Manage all saved list views/filters across modules (feature 17, 222) | Table (Name, Module, Scope, Shared?, Owner, Last-used) · search | `Open` · `Rename` · `Share/Unshare` · `Set default` · `Delete` | Baseline (self) / `dashboard:publish` to share team-wide | **Empty:** "Save a filtered list to reuse it." |

---

# Area D — Tracking & IoT

Map/Twin-pattern pages. Tracking technology decisions (RFID/BLE/UWB/GPS/LoRaWAN/QR/NFC/vision) → [09-tracking-technologies.md](./09-tracking-technologies.md); twin depth → doc 15/18.

## D1 · `/tracking` — Live Map *(CORE — full detail)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/tracking` · `A` · **Map/Twin** (real-time canvas) |
| **Purpose** | The real-time RTLS/GPS operational picture: where every tracked asset is right now, across indoor floorplans and outdoor maps, with geofence status and live movement. |
| **Key components** | Full-bleed **map/floorplan canvas** (indoor floorplan ↔ outdoor GIS) · **layer toggles** (assets, geofences, heatmap, zones, gateways, people-optional) · **clustering** at zoom-out · left **filter rail** · right **inspector** (on asset select: identity, live position, last-seen, health, custody, trail, quick actions) · **timeline scrubber** (live ↔ replay last N hrs) · scope-linked facility/floor switcher · legend (status colors, confidence) · live connection indicator |
| **Primary actions** | Locate asset (search→fly-to) · **Follow** · Play/scrub movement · Create geofence (→ draw) · **Acknowledge alert** · Create WO / Transfer / Quarantine from inspector · Export snapshot |
| **Tables** | Collapsible side list of assets-in-view (Tag, Name, Zone, Status, Last-seen, Battery) synced to map selection |
| **Filters** | Facility/Building/Floor/Zone · asset class · status · tracking tech (RFID/BLE/UWB/GPS/LoRa) · **last-seen age** ("stale >N min") · geofence · battery-low · **signal-lost** · high-value/critical only |
| **Charts/Maps** | The map is primary; overlays: heatmap layer, geofence polygons, dwell shading, gateway coverage |
| **Permissions** | `asset:read` + **`telemetry:read`** (positions), scope-filtered to the map's facility. Quarantine/lock action → `custody:transfer`/security perm; create-WO → `wo:create`. |
| **Notable states** | **Empty (no tracked assets):** "No tracked assets in this scope — assign tags to see them live" + link to labels/sensors. **No floorplan:** prompt to upload a floorplan or use list/outdoor view. **Signal-loss/stale:** stale assets render greyed with "last seen" halo, not hidden. **Offline / stream-down:** banner "Live feed lost — showing last positions at HH:MM," reads from cache, no fake live dot. **Loading:** map frame + skeleton pins. **Partial:** if geofence layer fails, assets still render. |
| **Notes** | Vendor-neutral: positions arrive via the IoT gateway abstraction (§0.4 principle 4), so the same map renders Zebra UWB, BLE, and GPS identically. This is the "Digital Twin as home screen" precursor (§1.8). |

## D2 · `/twin` · `/twin/[facility]` — Digital Twin *(compact-plus)*

| Route / Gate | Purpose | Key components | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|-----------|----------------|
| `/twin` · `A` · Map/Twin | Twin gallery / facility picker for 2D/3D digital twins (features 23, 194–198) | Facility cards w/ live occupancy + status rollups | `Open twin` | `twin:read` | **Empty:** "No twins yet — import a floorplan/BIM." |
| `/twin/[facility]` · `A` · Map/Twin | Live 2D/3D facility model: real-time asset state sync, space/occupancy overlays, **simulation/what-if** | 2D/3D canvas · layer & floor selector · state sync from event stream · **scenario/simulation panel** · inspector | `Follow` · `Run simulation` · `Overlay utilization` · `Edit twin` | `twin:read` (view) / `twin:edit` (model) / `ai:read` (sim) | **No live data:** static model + "not receiving telemetry." **Sim running:** progress + compare-to-baseline. |

## D3 · `/geofences` · `/geofences/new` — Geofences & zones *(compact)*

| Route / Gate | Purpose | Key components / Forms | Actions | Permission | Notable states |
|--------------|---------|------------------------|---------|-----------|----------------|
| `/geofences` · `A` · Split (map+list) | Manage geofences/zones & their breach rules (features 24, 131) | Geofence list (Name, Type, Facility, Rule, Breaches 24h, Status) · map preview · toggle active | `New` · `Edit` · `Disable` · `View breaches` | `geofence:read`/`geofence:update` | **Empty:** "Draw a boundary to monitor." |
| `/geofences/new` · `A` · Map/Form | Draw/import a geofence + configure breach/dwell rules & alert routing | Map draw tools (polygon/circle/import) · rule form (enter/exit/dwell, asset scope, severity, notify) | `Save` · `Test rule` | `geofence:create` | **Draw-required:** save disabled until boundary drawn. |

## D4 · `/movement` · `/movement/[assetId]` · `/heatmaps` — Movement & heatmaps *(compact)*

| Route / Gate | Purpose | Key components | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|-----------|----------------|
| `/movement` · `A` · Map/List | Movement history, trails & dwell across the scope (features 25, 26) | Map trails · time-range picker · asset/zone filters · movement-events table | `Replay` · `Export trail` · `Open asset` | `telemetry:read` | **No-results:** "No movement in this range." |
| `/movement/[assetId]` · `A` · Map/Detail | One asset's trail replay, dwell-by-zone, stops | Trail map + scrubber · dwell chart · stop list | `Play/scrub` · `Export` | `telemetry:read`+`asset:read` | **No history:** "No tracked movement yet." |
| `/heatmaps` · `A` · Map | Density/flow heatmaps & occupancy analysis (feature 27) | Heatmap canvas · metric selector (dwell/traffic/occupancy) · time window · zone filter | `Change metric` · `Export image` | `telemetry:read` | **Sparse data:** low-confidence notice. |

## D5 · `/sensors` · `/sensors/[id]` · `/gateways` · `/gateways/[id]` — Device fleet *(compact-plus)*

| Route / Gate | Purpose | Key components / Tables | Actions | Permission | Notable states |
|--------------|---------|-------------------------|---------|-----------|----------------|
| `/sensors` · `A` · List | Sensor/tag fleet health & config (features 32, 34) | Table: Sensor ID · Type (RFID/BLE/UWB/GPS/env) · Bound asset · **Battery** · Signal · Firmware · Last-report · Status · bulk config | `Add` · `Bind to asset` · `Configure` · `OTA update` · `Calibrate` | `sensor:read`/`sensor:configure` | **Empty:** "Register sensors/tags." **Low-battery/offline rows** flagged. |
| `/sensors/[id]` · `A` · Detail | One sensor: telemetry, health, config, calibration, firmware history, bound asset | Live readings · battery/signal trend · config form · calibration log · firmware panel | `Configure` · `Calibrate` · `OTA` · `Unbind` | `sensor:configure` | **Offline device:** last-report + "device unreachable." |
| `/gateways` · `A` · List | Gateway/reader fleet management & coverage (feature 33) | Table: Gateway · Location · Coverage · Connected sensors · Uptime · Firmware · Status · map of coverage | `Add` · `Configure` · `Restart` · `View coverage` | `gateway:read`/`gateway:configure` | **Empty:** "Add a gateway to ingest telemetry." |
| `/gateways/[id]` · `A` · Detail | One gateway: throughput, connected devices, config, logs, coverage map | Throughput/lag charts · device list · config · logs · coverage overlay | `Configure` · `Restart` · `Update firmware` | `gateway:configure` | **Down:** incident banner + last-seen. |

## D6 · `/telemetry` — Telemetry explorer *(compact-plus)*

| Route / Gate | Purpose | Key components | Filters | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|---------|-----------|----------------|
| `/telemetry` · `A` · Split (query+chart) | Ad-hoc time-series query & visualization over sensor/telemetry data (feature 35) | **Query builder** (asset/sensor/metric/agg/window) · multi-series time-series chart · data grid · saved queries | Metric, asset/sensor, time range, aggregation, resolution | `Run` · `Add series` · `Save query` · `Export CSV` · `Create alert rule from series` | `telemetry:read` (+`telemetry:export`) | **Empty:** "Pick a metric to chart." **No-results:** "No data in range." **Large range:** downsample notice. |

---

# Area E — AI Intelligence

Feed/Analytics pages; every module here is native (§0.4 principle 2) and **explainable**. Method, inputs, outputs, governance → [08-ai-intelligence.md](./08-ai-intelligence.md). AI command-center dashboard → [04-dashboards.md](./04-dashboards.md) §4.5.

## E1 · `/ai-insights` — AI Insights Feed *(CORE — full detail)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/ai-insights` · `A` · **Feed** (ranked, explainable) |
| **Purpose** | The single ranked stream of actionable, explainable AI recommendations across all models — failure predictions, idle/rebalance, theft/anomaly, EOL/replacement, cost-optimization — each with drivers, confidence, $-impact, and a **one-click action** (features 57–58, 289). |
| **Key components** | Ranked **insight cards** (title, model badge, **confidence**, **$-impact**, severity, affected asset(s), **drivers/why**, recommended action) · right **facet rail** (model, confidence threshold, impact band, category, facility, status) · bulk triage · **"Explain this"** expander (drivers + counterfactual) · feedback thumbs (→ `/ai/feedback`) · saved-filter chips |
| **Primary actions** | **Act** (context action: → create WO / initiate transfer / quarantine / plan replacement / order parts — all RBAC+SoD gated) · **Dismiss** (with reason) · **Snooze** · **Explain** · **Feedback 👍/👎** · Assign to person/team |
| **Tables** | Optional table view: Insight · Type · Asset · Confidence · Impact($) · Recommended action · Status · Created |
| **Filters** | Model/type · confidence ≥ threshold · impact band · category · facility/scope · severity · status (new/acted/dismissed/snoozed) |
| **Charts** | Header strip: insights by type (bar), acted-vs-dismissed rate, cumulative $-impact realized |
| **Permissions** | `ai:read` (view). **Acting** re-checks the target permission (`wo:create`, `transfer:create`, etc.) + SoD; feedback → `ai:feedback`. Field-gated $-impact hidden without `finance:read`. |
| **Notable states** | **Empty:** "No open insights — models are watching." (not a failure). **No-results (filtered):** clear facets. **Low-confidence hidden by default** with a "show low-confidence" toggle. **Model-down:** per-model banner "predictions paused (retraining/drift)" links to `/ai/models`. **Permission-denied on act:** explains missing perm. **Loading:** card skeletons. |
| **Notes** | Explainability is mandatory on every card — no black-box scores in front of an auditor/CFO (§0.10). The feedback loop is human-in-the-loop learning (feature 60), closing to the model registry. |

## E2 · AI analysis pages — `/ai/health` · `/ai/predictive` · `/ai/utilization` · `/ai/anomaly` · `/ai/theft` · `/ai/forecasting` *(shared template)*

| Field | Spec |
|-------|------|
| **Routes / Gate / Pattern** | `/ai/health` · `/ai/predictive` · `/ai/utilization` · `/ai/anomaly` · `/ai/theft` · `/ai/forecasting` · `A` · **Analytics + List** |
| **Purpose** | Deep, per-domain AI views: Health & Risk scores (39, 46), Predictive maintenance/failure & RUL (40, 41), Utilization/idle/overuse & rebalancing (43–44, 48), Anomaly detection (42), Theft/loss/tamper (45), Forecasting & capacity/EOL (49, 51, 108). |
| **Key components (per page)** | KPI row (domain metrics) · distribution/trend charts · **ranked entity table** (assets/predictions) with score + drivers + confidence + recommended action · detail drawer with **explainability** (driver bars, counterfactual, history) · filter bar |
| **Domain specifics** | **health:** score distribution, driver breakdown, decliners table, portfolio heat. **predictive:** predicted failures (next 30/60/90d) w/ confidence → **one-click WO**; RUL curves. **utilization:** idle/over-used tables, rebalancing suggestions (transfer). **anomaly:** anomaly timeline, telemetry deviation, per-asset drill. **theft:** risk-of-loss ranking, after-hours/geofence signals, quarantine action. **forecasting:** demand/capacity/EOL projections, capex forecast (finance-gated). |
| **Primary actions** | Act (→ WO / transfer / quarantine / plan replacement / pre-stage parts) · Explain · Feedback · Export · Adjust threshold · Save view |
| **Tables** | Ranked entity list: Asset · Score/Prediction · **Confidence** · **Drivers** · Recommended action · $-impact · Status |
| **Filters** | Confidence threshold · category · facility/scope · score/impact band · time horizon · model version |
| **Charts/Maps** | Distribution (histogram), trend (line), confidence bands, anomaly timeline, utilization opportunity map |
| **Permissions** | `ai:read`; act re-checks target perm; theft/quarantine → security/`custody:transfer`; forecasting $ → `finance:read`. |
| **Notable states** | **Empty:** "Not enough signal yet — needs more telemetry/history." **Model-down/drift:** paused banner → `/ai/models`. **Low-confidence** toggle. **Explainability always present**; if drivers unavailable, say so (never fabricate). |
| **Notes** | One consistent explainable template across six domains keeps the AI defensible and learnable; each links its insights back into `/ai-insights` and the relevant module (WO, transfer, disposal). |

## E3 · `/ai/models` · `/ai/models/[id]` — Model registry *(compact-plus)*

| Route / Gate | Purpose | Key components / Tables | Actions | Permission | Notable states |
|--------------|---------|-------------------------|---------|-----------|----------------|
| `/ai/models` · `A` · List | Governance registry of every model: version, status, **drift**, performance, owner (feature 59) | Table: Model · Type · Version · Status (prod/shadow/retired) · **Drift** · Accuracy/metrics · Last-trained · Owner | `View` · `Promote/Deploy` · `Retrain` · `Rollback` · `Shadow` | `model:read` (view) / `model:deploy`/`model:retrain` (govern) | **Empty:** platform-seeded; else "No models registered." **Drift alert** rows flagged. |
| `/ai/models/[id]` · `A` · Detail | One model: versions, training data lineage, **feature importance**, drift & performance over time, governance log, deployment | Version history · metrics charts · drift timeline · feature-importance chart · datasheet/model card · promote/rollback controls | `Deploy` · `Retrain` · `Rollback` · `View lineage` · `Export model card` | `model:deploy` | **Drift breach:** recommend retrain. **Training:** progress + shadow compare. |

## E4 · `/ai/explainability` · `/ai/feedback` — Explainability & feedback *(compact)*

| Route / Gate | Purpose | Key components | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|-----------|----------------|
| `/ai/explainability` · `A` · Analytics | Cross-model explainability workbench: pick any score → drivers, **counterfactuals**, confidence, global feature importance (feature 58) | Entity/score picker · driver waterfall · counterfactual ("what would change this") · global importance · export explanation | `Explain` · `Export explanation pack` (audit-ready) | `ai:read` | **No explanation available:** honest "insufficient data," never fabricated. |
| `/ai/feedback` · `A` · List/Feed | Human-in-the-loop review queue: confirm/correct predictions to train models (feature 60, 291) | Feedback queue (prediction, outcome, user verdict) · accuracy trend · reviewer leaderboard | `Confirm` · `Correct` · `Flag` · `Submit batch` | `ai:feedback` | **Empty:** "No items awaiting review." |

---

# Area F — Maintenance (EAM)

Board + Detail pattern. Deep on the WO board and WO detail; long tail compact. EAM features → [05-feature-matrix.md](./05-feature-matrix.md) M4.

## F1 · `/maintenance` — Work Order Board *(CORE — full detail)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/maintenance` · `A` · **Board** (Kanban) + List + Calendar view-switch |
| **Purpose** | The maintenance command surface: all work orders (preventive, predictive, corrective) across status, with dispatch, SLA watch, and drag-to-progress. |
| **Key components** | **Kanban columns**: New → Assigned → In-progress → On-hold(parts/approval) → Review → Done/Closed · drag-drop cards (WO#, asset, priority, SLA countdown, assignee avatar, type badge PM/Predictive/Corrective) · **WIP counts** + column value · **swimlanes** (by technician/facility/priority) · view switch (Board/List/Calendar) · filter bar · **bulk assign** · SLA/overdue highlighting · saved views |
| **Primary actions** | **Create WO** (→ `/maintenance/new`) · **Dispatch/assign** · drag to change status · **Close** · Escalate · Order parts · Convert predictive-alert → WO · bulk assign/reschedule |
| **Tables (list view)** | WO# · Title · Asset · Type · **Priority** · Status · Assignee · **SLA/Due** · Facility/Zone · Created · Age · Parts-status · Cost |
| **Filters** | Facility/zone (scope) · asset class · **technician** · type (PM/predictive/corrective) · priority · status · SLA (overdue/at-risk) · date range · source (AI/manual) |
| **Charts/Calendar** | Calendar view (scheduled PM + WOs by day/tech) · header mini WO-pipeline funnel + backlog-age |
| **Permissions** | `wo:read` (scope). Create → `wo:create`; assign → `wo:assign`; close → `wo:close`; approve/escalate → `wo:approve`. Field-gated cost columns → `finance:read`. |
| **Notable states** | **Empty:** "No work orders — create one or wait for AI predictions." **No-results:** clear filters. **Overdue emphasis:** at-risk/overdue cards colorized (threshold tokens). **Offline (field):** cached board, status changes queued (mobile parity). **Loading:** column skeletons. **Permission-denied:** 403 with request-access. |
| **Notes** | Predictive WOs flow in from `/ai/predictive` as first-class cards (feature 64) — the AI-native loop. Board/list/calendar are one dataset, three lenses. |

## F2 · `/maintenance/[id]` — Work Order Detail *(CORE — full detail)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/maintenance/[id]` · `A` · **Detail** (object page, tabbed) |
| **Purpose** | Everything to execute and close one work order: scope, asset, checklist, parts, labor, costs, SLA, history — the field + office shared view. |
| **Object header** | WO# · Title · **Status** · **Priority** · Type badge · Asset (link to 360°) · Assignee · **SLA countdown** · Facility/Zone · actions: Assign · Start · **Complete/Close** · On-hold · Escalate · Add parts · Log time · Print · Watch · Share |
| **Tabs** | **1 Details** (description, asset, requester, dates, SLA, failure code, cause/remedy) · **2 Tasks/Checklist** (digital inspection steps, pass/fail, photos, required-signature) · **3 Parts** (BOM, issue/return, availability) · **4 Labor/Time** (time entries per tech, wrench-time) · **5 Costs** (parts+labor+external, budget — finance-gated) · **6 Attachments** (photos, docs, before/after) · **7 History/Audit** (immutable event log) · **8 Comments** (@mentions) |
| **Primary actions** | Assign/reassign · Start → In-progress · Complete checklist · Issue/return parts · Log time · **Close** (validates required steps) · Escalate (SLA) · Reopen · Convert to follow-up WO |
| **Forms & key fields** | `assignee` · `scheduled_start/end` · `priority` · `failure_code`/`problem/cause/remedy` · checklist `steps[]{result, note, photo}` · `parts[]{sku, qty}` · `time[]{tech, hours}` · `resolution` · `signature` |
| **Tables** | Parts (SKU, name, qty, availability, cost) · Time (tech, start/stop, hours) · Checklist steps · History |
| **Charts** | Cost breakdown mini-bar; SLA timeline |
| **Permissions** | `wo:read`. Update/close → `wo:update`/`wo:close`; assign → `wo:assign`; parts issue → `part:issue`; approve → `wo:approve`; costs tab → `finance:read`. Vendors get **time-boxed, asset-scoped** access (upload service records only). |
| **Notable states** | **Blocked (parts/approval):** on-hold banner with reason + resolve link. **Close blocked:** "Complete required checklist steps first." **Offline:** full offline execution (checklist, photos, time) → queued sync w/ conflict resolution (→ [14-mobile-apps.md](./14-mobile-apps.md)). **Permission-denied per-tab:** costs tab locks without finance. |
| **Notes** | Warranty-aware: if the asset is under warranty, header nudges "claim vs. repair" (feature 74). Same Detail pattern as asset 360° — consistency by design. |

## F3 · `/maintenance/new` — Create work order *(compact)*

| Route / Gate | Purpose | Key components / Forms | Actions | Permission | Notable states |
|--------------|---------|------------------------|---------|-----------|----------------|
| `/maintenance/new` · `A` · Form | Create a corrective/planned WO (also target of "convert insight/predictive→WO") | Form: asset (scan/search), type, priority, description, failure code, assignee, schedule, parts, checklist template, attachments · **prefill from asset/insight** | `Create` · `Create & assign` · `Save draft` | `wo:create` | **Prefilled** from predictive alert/asset context. **Validation** inline. **Offline:** queue. |

## F4 · `/maintenance/calendar` · `/scheduling` — Calendar & dispatch *(compact-plus)*

| Route / Gate | Purpose | Key components | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|-----------|----------------|
| `/maintenance/calendar` · `A` · Calendar | Calendar of scheduled WOs & PMs by day/week/tech | Month/week/day grid · drag-to-reschedule · tech lanes · conflict flags | `Schedule` · `Reschedule` · `Open WO` | `wo:read`/`wo:update` | **Empty:** "Nothing scheduled." **Conflict:** overlap warning. |
| `/scheduling` · `A` · Split (board+load) | Technician dispatch & **load balancing** (feature 67) | Technician roster w/ **load bars** & skills · unassigned WO queue · drag-to-assign · **AI suggested assignment** · map route | `Assign` · `Balance load` · `Optimize routes` | `wo:assign` | **Over-allocated tech** flagged; suggestion to rebalance. |

## F5 · `/pm` · `/pm/[id]` · `/predictive` — Preventive & predictive *(compact)*

| Route / Gate | Purpose | Key components / Tables | Actions | Permission | Notable states |
|--------------|---------|-------------------------|---------|-----------|----------------|
| `/pm` · `A` · List | Preventive maintenance schedules (time/usage/meter triggers) (features 63, 75) | Table: PM · Asset/class · Trigger (time/meter) · Frequency · Next-due · **Compliance %** · Owner | `New PM` · `Edit` · `Generate WOs` · `Pause` | `pm:read`/`pm:create` | **Empty:** "Create PM plans to prevent failures." **Overdue PM** flagged. |
| `/pm/[id]` · `A` · Detail | One PM plan: trigger, tasks/checklist, generated-WO history, compliance trend | Trigger config · task template · generated WOs table · compliance chart | `Edit` · `Generate now` · `Pause/Resume` | `pm:update` | — |
| `/predictive` · `A` · List | AI-sourced predictive WOs queue (feature 64) — bridge from `/ai/predictive` | Predicted-failure table w/ confidence + recommended action → **one-click WO** | `Create WO` · `Dismiss` · `Explain` | `wo:create`+`ai:read` | **Empty:** "No predicted failures — good news." **Model-down:** paused banner. |

## F6 · `/inspections` · `/inspections/[id]` · `/checklists` · `/parts` — Inspections, checklists, failure codes *(compact)*

| Route / Gate | Purpose | Key components | Actions | Permission | Notable states |
|--------------|---------|----------------|---------|-----------|----------------|
| `/inspections` · `A` · List | Inspection runs & compliance (features 69, 148) | Table: Inspection · Asset · Template · Result · Inspector · Date · Compliance | `New inspection` · `Open` · `Export` | `inspection:read`/`inspection:run` | **Empty:** "No inspections logged." |
| `/inspections/[id]` · `A` · Detail | One inspection: steps, results, photos, signature, follow-up WO | Step results · pass/fail · photos · signature · raise-WO | `Submit` · `Raise WO` · `Export` | `inspection:submit` | **Incomplete:** submit gated on required steps. |
| `/checklists` · `A` · Builder/List | Manage inspection/checklist templates (forms designer, feature 164) | Template list · **form builder** (fields, logic, required, pass criteria) | `New` · `Edit` · `Publish` · `Clone` | `inspection:manage` | **Empty:** seed from industry pack. |
| `/parts` · `A` · List | Failure codes & problem/cause/remedy taxonomy + BOM linkage (features 70, 71) | Failure-code tree · BOM/part associations · usage stats | `Add code` · `Link parts` | `wo:read`/`taxonomy:manage` | **Empty:** seed taxonomy. |

---

# Area G — Inventory & Parts

List/Detail. Inventory dashboard → §4.7. Features → M5.

| Route / Gate / Pattern | Purpose | Key components / Tables & columns | Filters | Primary actions | Permission | Notable states |
|------------------------|---------|-----------------------------------|---------|-----------------|-----------|----------------|
| `/inventory` · `A` · List | Stock overview: levels, ABC, valuation by warehouse/bin (features 80–84) | Table: SKU · Name · Category · **On-hand** · Reserved · Available · Reorder-point · **ABC** · Warehouse/Bin · Unit-cost · **Value** · Status(OK/low/out) | Warehouse, category, supplier, stock-status, ABC class | `Adjust` · `Receive` · `Issue` · `Reorder` · `Export` | `inventory:read` (adjust/receive/count gated) | **Empty:** "Add parts to your catalog." **Stockout/low** rows flagged. **No-results:** clear filters. |
| `/inventory/[sku]` · `A` · Detail | One SKU: stock by location, movement history, consumption, suppliers, reorder rule | Stock-by-bin table · movement log · consumption trend · supplier list · reorder-rule form · serialized units | `Adjust` · `Receive` · `Issue` · `Set reorder rule` | `inventory:read`/`inventory:adjust` | **Serialized:** unit list. **Below reorder:** alert banner. |
| `/reorder` · `A` · List | Reorder alerts & auto-reorder rules (feature 82) | Below-reorder table + suggested PO qty (**AI optimal**, feature 91) · rule editor | `Create PO` · `Edit rule` · `Snooze` | `inventory:read`/`po:create` | **Empty:** "Nothing to reorder." |
| `/procurement` · `A` · List | Purchase orders & receiving (feature 83) | PO table: PO# · Supplier · Items · Total · Status · Expected · Received | Status, supplier, date, warehouse | `New PO` · `Approve` · `Receive` · `Export` | `po:read`/`po:create`/`po:approve` (**SoD**) | **Empty:** "No purchase orders." **Pending approval** flagged. |
| `/procurement/[id]` · `A` · Detail | One PO: lines, approvals, receiving, matching | Line-item table · approval trail · receiving panel · invoice match | `Approve` · `Receive` · `Close` · `Print` | `po:approve`/`po:receive` | **Partial receipt:** progress. |
| `/consumption` · `A` · List | Parts issued/returned to WOs (feature 85) | Consumption table: Part · WO · Qty · Tech · Date · Cost · trend chart | WO, part, date, tech | `Issue` · `Return` · `Export` | `part:issue`/`part:return` | **Empty:** "No parts consumed yet." |
| `/warehouses` · `A` · List | Warehouses & storage locations (feature 82) | Warehouse table: Name · Location · #Bins · Value · Utilization | — | `Add` · `Open` · `Edit` | `inventory:read`/`inventory:adjust` | **Empty:** "Add a warehouse." |
| `/warehouses/[id]` · `A` · Detail | One warehouse: bins, stock, layout, activity | Bin grid · stock table · activity log | `Add bin` · `Move stock` · `Count` | `inventory:adjust` | — |
| `/bins` · `A` · List | Bin/location management across warehouses | Bin table: Bin · Warehouse · Zone · Contents · Capacity/util | Warehouse, occupancy | `Add` · `Reassign` · `Print label` | `inventory:adjust` | **Empty:** "No bins defined." |
| `/suppliers` · `A` · List | Supplier/vendor catalog & lead times (feature 87) | Supplier table: Name · Category · Lead-time · Rating · Active POs · Contact | Category, active | `Add` · `Open` · `Deactivate` | `inventory:read` (manage gated) | **Empty:** "Add suppliers." |

---

# Area H — Operations & Custody

List/Board/Form + a kiosk mode. Features → M6.

| Route / Gate / Pattern | Purpose | Key components / Tables | Filters | Primary actions | Permission | Notable states |
|------------------------|---------|-------------------------|---------|-----------------|-----------|----------------|
| `/operations/transfers` · `A` · List/Board | Inter-facility/zone transfer requests, approvals & tracking (features 96, 97) | Table/board: Transfer# · Asset(s) · From→To · Requester · **Approver** · Status · SLA · Date | Status, facility, requester, date | `New transfer` · **`Approve/Reject`** · `Track` · `Bulk transfer` | `transfer:read`/`transfer:create`/`transfer:approve` (**SoD: requester ≠ approver**) | **Empty:** "No transfers." **Pending my approval** highlighted. |
| `/transfers/[id]` · `A` · Detail | One transfer: assets, route, approval chain, custody handoff, status | Asset list · approval trail · in-transit tracking (map) · custody signatures | `Approve` · `Reject` · `Mark received` · `Cancel` | `transfer:approve` | **In-transit:** live status. **Blocked:** SoD/approval reason. |
| `/transfers/new` · `A` · Form | Request a transfer (assets, destination, reason, schedule) | Form: assets (scan/select), destination scope, reason, date, approver-preview | `Submit` · `Save draft` | `transfer:create` | **Self-approval blocked** (SoD notice). |
| `/checkinout` · `A` · List/Form | Check-in / check-out custody (feature 94) | Active check-outs table (Asset, Holder, Since, Due, Overdue?) · quick scan-to-checkout/in | `Check-out` · `Check-in` · `Extend` · `Scan` | `checkinout:checkout`/`checkin` | **Overdue** flagged. **Empty:** "Nothing checked out." |
| `/reservations` · `A` · List | Reservations & booking of shared assets (feature 95) | Reservation table: Asset · Reserver · Start–End · Status · Conflict? | Asset, status, date | `New reservation` · `Cancel` · `Approve` | `reservation:read`/`reservation:create` | **Conflict:** double-book warning. |
| `/reservations/calendar` · `A` · Calendar | Reservation calendar & conflict handling (feature 99) | Calendar grid by asset/resource · drag-to-book · conflict shading | `Book` · `Reschedule` · `Open` | `reservation:create` | **Conflict** shaded; resolve inline. |
| `/field-ops` · `A` · Map/List | Live technician/operator field view (feature 185; mobile → doc 14) | Live map of field staff + assignments · status list · dispatch | `Dispatch` · `Message` · `Locate` | `wo:read`+`telemetry:read` | **No field staff active:** empty. **Offline:** cached. |
| `/requests` · `A` · List/Board | Asset request & fulfillment workflow (feature 101) | Request board: Request · Requester · Asset/type · Status · Approver | Status, type, requester | `New request` · `Approve` · `Fulfill` · `Reject` | `reservation:create`/`transfer:approve` | **Empty:** "No open requests." |
| `/kiosk` · `A` (kiosk/service account) · Focus mode | Self-service check-in/out station, scoped to a location + action set (feature 100) | **Fullscreen kiosk UI** (large scan target, minimal chrome) · scan badge/asset · confirm · auto-timeout/lock | `Scan` · `Check-out` · `Check-in` · `Done` | `checkinout:*` scoped to kiosk location; **no browse** | **Idle timeout:** auto-lock. **Unknown asset/badge:** friendly retry. **Offline:** queue + "sync when online." |

---

# Area I — Analytics & Reports

Analytics/Builder. Reporting spec → [17-reporting-bi.md](./17-reporting-bi.md); financial dashboard → §4.8.

## I1 · `/reports/builder` — Report Builder *(CORE — full detail)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/reports/builder` · `A` · **Builder** (drag-drop) |
| **Purpose** | Self-serve, drag-drop report authoring over the asset graph: pick a dataset, add dimensions/measures/filters, choose visualizations, schedule & share — without SQL (feature 136). |
| **Key components** | Left **field palette** (datasets → dimensions/measures, searchable) · center canvas (**pivot/table + chart blocks**) · right **config inspector** (aggregation, sort, format, thresholds, conditional formatting, drill-through) · **filter/parameter bar** · live preview · **schedule & recipients** panel · save/version/share |
| **Primary actions** | Add dataset · drag field to rows/cols/measures/filters · add chart · `Run/Preview` · `Save` · `Schedule` · `Share` (signed URL) · `Export` (PDF/Excel/CSV/PNG) · `Clone` · `Publish to library` |
| **Forms & key fields** | `dataset` · `dimensions[]` · `measures[]{agg}` · `filters[]` · `parameters[]` · `visualization{type, options}` · `schedule{cron, format, recipients, delivery}` · `access{scope, roles, signed_url}` |
| **Tables/Charts** | The output itself: pivot tables + chart library (line/bar/donut/funnel/heatmap/scatter); cross-filtering in preview |
| **Permissions** | `report:create` (Managers+). Data honors **row/field-level security** — a report can't reveal data the viewer can't see; scheduled reports run **as the owner's scope** with recipient re-check. Export → `report:export`. |
| **Notable states** | **Empty canvas:** "Drag a field to start." **No-data preview:** "No rows for current filters." **Invalid combo:** inline "measure requires an aggregation." **Permission-limited dataset:** restricted fields greyed with lock. **Save-guard** on unsaved changes. **Large query:** async run + notify. |
| **Notes** | Security-through-data-layer means builder freedom without leakage — stricter than bolt-on BI tools. Signed-URL sharing enables white-label/embedded analytics (feature 145). |

## I2 · Analytics & report pages *(compact)*

| Route / Gate / Pattern | Purpose | Key components / Tables | Filters | Primary actions | Permission | Notable states |
|------------------------|---------|-------------------------|---------|-----------------|-----------|----------------|
| `/reports` · `A` · List/Gallery | Prebuilt + custom report library by module/persona (feature 135) | Cards/table: Name · Category · Owner · Last-run · Schedule · Format · search + tabs (Prebuilt/Mine/Shared) | Category, module, owner, scheduled | `Run` · `Open` · `Schedule` · `Clone` · `New` (→builder) | `report:read` | **Empty:** "Start from a prebuilt report." |
| `/reports/[id]` · `A` · Analytics | View a rendered report: params, visuals, tables, export/subscribe | Param bar · charts + tables · export · subscribe · version history | Report parameters | `Run` · `Export` · `Subscribe` · `Edit` (→builder) | `report:read`/`report:run` | **No-data:** adjust params. **Stale:** last-run timestamp + refresh. |
| `/bi` · `A` · Builder/Explorer | Ad-hoc BI explorer: pivot, slice/dice, chart (feature 137) | Field shelf · pivot grid · chart · drill/cross-filter · save as report | Any dimension/measure | `Explore` · `Pivot` · `Save` · `Export` | `bi:read`/`bi:query` | **Empty:** "Pick a dataset." **No-results:** broaden. |
| `/financials` · `A` · Analytics | Financial analytics: book value, TCO, capex/opex (features 114–121; dashboard §4.8) | KPI row · depreciation/TCO/capex charts · high-TCO & nearing-full-depreciation tables | Cost-center, category, facility, fiscal period | `Export to GL` · `Run TCO` · `Approve write-off` · `Drill` | `finance:read` (approve/export gated) | **Permission-denied** for non-finance. |
| `/depreciation` · `A` · List/Analytics | Depreciation schedules & methods (SL/DB/units) (feature 115) | Schedule table: Asset · Method · Cost · Accum · Net-book · Next-period · projection chart | Method, category, period | `Adjust method` · `Recalculate` · `Export` | `depreciation:read`/`depreciation:manage` | **Empty:** "No depreciating assets." |
| `/compliance-reports` · `A` · List | Compliance & audit report templates + evidence packs (feature 143, 156) | Template cards (HIPAA/Joint-Commission/SOC2/custody) · one-click evidence pack | Framework, period, facility | `Generate` · `Export pack` · `Schedule` | `report:read`+`audit:read` | **Empty:** "Choose a framework." |
| `/subscriptions` · `A` · List | Scheduled report deliveries & subscriptions (feature 138) | Table: Report · Schedule · Recipients · Format · Channel · Last-sent · Status | Status, channel, owner | `New` · `Pause` · `Edit` · `Send now` | `report:schedule` | **Failed delivery** flagged + retry. |
| `/exports` · `A` · List | Export job center: on-demand & async export history/downloads (feature 139) | Jobs table: Export · Source · Format · Status · Size · Requested · Download | Status, format, module | `New export` · `Download` · `Retry` · `Cancel` | `*:export` (per source) | **Processing:** progress. **Expired link:** re-generate. |

---

# Area J — Alerts & Notifications

Feed/Split + rule builder. Features → M9. Security/ops dashboards consume these.

## J1 · `/alerts` — Alert Center *(CORE — full detail)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/alerts` · `A` · **Split** (list + detail inspector) |
| **Purpose** | The unified center for **every** event type — geofence breach, tamper, anomaly, threshold, signal-loss, SLA, low-battery — with ack/snooze/escalate/resolve and **correlation** so operators see incidents, not noise (features 125, 128, 133). |
| **Key components** | Left **alert list** (severity color, type icon, asset, scope, time, status, correlation group) · right **inspector** (details, timeline, related events, affected asset link, **recommended action**, escalation path, comments) · **bulk triage bar** · saved filters · live count + sound-optional · **correlation grouping** toggle |
| **Primary actions** | **Acknowledge** · **Snooze** · **Escalate** (→ on-call) · **Resolve** (with reason) · **Quarantine/lock asset** · **Create WO** · **File incident** · Assign · bulk ack/resolve |
| **Tables** | Alert list columns: Severity · Type · Asset/Source · Facility/Zone · Rule · Time · **Status** (new/ack/snoozed/escalated/resolved) · Assignee · Correlation |
| **Filters** | Severity · type · status · facility/zone (scope) · rule · assignee · time range · "correlated only" · false-positive |
| **Charts** | Header strip: alerts by type/time, response-time trend, false-positive rate, open-vs-resolved (per §4.6) |
| **Permissions** | `alert:read` (scope). Ack/resolve → `alert:ack`; escalate → `alert:escalate`; quarantine → `custody:transfer`/security perm; create-WO → `wo:create`; file-incident → security. |
| **Notable states** | **Empty:** "No active alerts — all clear." **No-results:** clear filters. **Storm/flood:** auto-group correlated alerts + "N similar" collapse to prevent overload. **Escalated/overdue** emphasized. **Offline:** cached alerts + banner; ack queued. **Loading:** list skeleton. |
| **Notes** | Correlation + dedup (feature 133) is the anti-noise differentiator; recommended actions come from AI correlation (feature 294). Same Split pattern as telemetry/help for consistency. |

## J2 · Alert config & prefs *(compact)*

| Route / Gate / Pattern | Purpose | Key components / Forms | Actions | Permission | Notable states |
|------------------------|---------|------------------------|---------|-----------|----------------|
| `/alerts/[id]` · `A` · Detail | One alert/incident: full timeline, related events, actions, resolution | Event timeline · related-alert cluster · affected asset · action log · resolution form | `Ack` · `Escalate` · `Resolve` · `Create WO` · `File incident` | `alert:ack`/`alert:escalate` | **Resolved:** read-only + reopen. |
| `/alert-rules` · `A` · List | Alert rules engine catalog (feature 127) | Table: Rule · Condition · Severity · Scope · Channels · Enabled · Triggers(24h) | `New` · `Edit` · `Enable/Disable` · `Test` | `alertrule:read`/`alertrule:create` | **Empty:** "Create your first rule." |
| `/alert-rules/new` · `A` · Builder/Form | **Condition builder** for new alert rule (threshold/geofence/anomaly/telemetry) + routing | Condition builder (metric/operator/value/window, geofence, telemetry) · severity · **notify channels** (in-app/email/SMS/Slack/Teams) · escalation link · dedup/correlation options · **test against history** | `Save` · `Test` · `Enable` | `alertrule:create` | **Invalid condition:** inline. **Test:** shows would-have-fired count. |
| `/escalations` · `A` · List/Form | Escalation policies & on-call routing (feature 129) | Policy table + editor: tiers, wait, on-call schedule, fallback | `New policy` · `Edit` · `Assign on-call` | `alertrule:create` | **No on-call set:** warning. |
| `/notifications/preferences` · `A` · Form | Per-user channels, digests, quiet hours (feature 130) | Channel matrix (event-type × channel) · digest cadence · quiet hours · mute rules | `Save` | Baseline (self) | Dirty-guard on exit. |

---

# Area K — Compliance & Audit

List/Detail; the immutable log is read-only. Features → M11. Compliance dashboard consumes these.

| Route / Gate / Pattern | Purpose | Key components / Tables & columns | Filters | Primary actions | Permission | Notable states |
|------------------------|---------|-----------------------------------|---------|-----------------|-----------|----------------|
| `/audit` · `A` · List/Board | Audit Center: physical audits & cycle-count campaigns (features 147, 148) | Table/board: Audit · Scope · Type · Progress · **Accuracy** · Owner · Status · Due | Facility, type, status, date | `Start audit` · `Assign` · `Reconcile` · `Export pack` | `audit:read`/`audit:run` | **Empty:** "Launch an audit campaign." **In-progress** progress bars. |
| `/audit/[id]` · `A` · Detail | One audit: scoped assets, scan-to-verify progress, exceptions, reconciliation, evidence | Asset checklist (found/missing/unexpected) · **scan progress** · exception table · reconciliation actions · evidence attachments | Status, exception type | `Scan-verify` · `Resolve exception` · `Close` · `Export evidence` | `audit:run` | **Exceptions:** highlighted; block close until resolved/acknowledged. **Offline (field):** scan offline, sync. |
| `/cycle-counts` · `A` · List | Cycle-count schedules & runs (inventory + assets) (feature 86, 147) | Count table: Count · Scope · Frequency · Last · Variance · Status | Warehouse/facility, status | `New count` · `Start` · `Reconcile` | `audit:run`/`inventory:count` | **Variance** flagged. |
| `/custody` · `A` · List | Chain-of-custody overview & gaps (feature 98, 149) | Table: Asset · Current holder · Last handoff · **Gap?** · Since | Facility, gap-only, holder | `View chain` · `Reconcile` · `Export` | `custody:read` | **Custody gaps** flagged for security/compliance. |
| `/custody/[assetId]` · `A` · Detail | Per-asset immutable custody log (handoffs, signatures) | Chronological custody timeline · signatures · location at each handoff · gap markers | Date | `Add handoff` · `Reconcile` · `Export` | `custody:read`/`custody:transfer` | **Gap:** explicit marker + investigate. |
| `/certifications` · `A` · List | Certification/calibration/warranty expiry tracking (features 74, 151) | Table: Item · Asset · Type · **Expiry** · Days-left · Status · Owner | Type, expiring-in, facility | `Add cert` · `Renew` · `Export` · `Set reminder` | `cert:read`/`cert:manage` | **Expiring/expired** flagged; empty = "No certs tracked." |
| `/regulatory` · `A` · List | Regulatory templates & evidence (HIPAA/Joint-Commission/GDPR/SOC2) (features 153, 155) | Framework cards · control mapping · evidence status · DSAR tools (GDPR/CCPA) | Framework, status | `Generate evidence` · `Run DSAR` · `Export` | `audit:read`/`retention:manage` | **Gaps** in control coverage flagged. |
| `/retention` · `A` · List/Form | Data retention policies & **legal hold** (feature 154) | Policy table (entity, retention, action) · **legal-hold** manager · purge schedule | Entity, status | `New policy` · `Place hold` · `Release` | `retention:manage` | **Active holds** locked from purge. |
| `/audit-log` · `A` · List (read-only) | **Immutable** system activity log — every action, actor, before/after (feature 150) | Virtualized log: Time · Actor · Action · Resource · Scope · IP · **Before→After** diff · trace id · **tamper-evident** hash chain | Actor, resource, action, scope, time, IP | `Search` · `Export` (no edit/delete) | `audit:read` (read-only; **no mutation for anyone**) | **Huge volume:** server-side search + streaming. **No-results:** refine query. |

---

# Area L — Administration

Config-heavy List/Detail/Form/Builder. Deep on Users & Roles (the RBAC surface); rest compact. Features → M12/M13; security → doc 16.

## L1 · `/admin/users` — Users management *(CORE — full detail)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/admin/users` · `A` · **List** |
| **Purpose** | Manage the tenant's people: invite, assign roles + scope, deactivate, reset, review access — the operational face of RBAC (features 159, 170). |
| **Key components** | User table · **invite** (single + bulk paste/CSV) · bulk role/scope assign · filters · SCIM/SSO sync status · **access review** flags (stale/over-privileged) · export |
| **Primary actions** | **Invite user(s)** · Edit roles/scope · **Deactivate/Reactivate** · Reset password/MFA · Force sign-out · Resend invite · Impersonate (platform, consent+audit) · bulk assign role/scope |
| **Tables & columns** | Name · Email · **Role(s)** · **Scope** · Team/Dept · Status (active/invited/suspended) · MFA · Last-active · **Source** (manual/SSO/SCIM) · Access-review flag |
| **Filters** | Role · scope · status · team · MFA-enabled · source · last-active · **access-review** (stale/over-privileged) |
| **Forms** | Invite: `email[]` · `role` · `scope` · `team` · optional message · time-box. Bulk-assign: `role`/`scope`. |
| **Permissions** | `user:read` (view) / `user:invite`, `user:update`, `user:deactivate` (manage). Role assignment → `role:assign`. **Impersonate → platform-tier only, consent + break-glass audit** (§2.3). |
| **Notable states** | **Empty (fresh org):** "Invite your team" CTA. **No-results:** clear filters. **SSO-managed users:** role/scope may be read-only (managed by IdP/SCIM) with a note. **Permission-denied:** 403. **Access-review due:** banner prompting recertification. |
| **Notes** | Row-level security means admins only see users within their scope. Access-review flags operationalize least-privilege; over-privilege detection is an AI hook. |

## L2 · `/admin/users/[id]` — User detail *(CORE)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/admin/users/[id]` · `A` · **Detail** (tabbed) |
| **Purpose** | One user's full profile, access, activity, and security posture. |
| **Object header** | Avatar · name · email · status · MFA · last-active · actions: Edit · Reset password/MFA · Deactivate · Force sign-out · Impersonate (platform) |
| **Tabs** | **1 Profile** (name, contact, team, dept, manager) · **2 Roles & Scope** (assigned roles, scope bindings, **effective permissions** viewer, time-boxes) · **3 Sessions & Devices** (active sessions, device trust, revoke) · **4 Activity** (recent actions from audit log) · **5 Security** (MFA methods, password age, risk flags) |
| **Primary actions** | Add/remove role · edit scope · set time-box · revoke session · reset MFA · deactivate |
| **Tables** | Role assignments · sessions · activity (from `/audit-log`) |
| **Permissions** | `user:read`; edits → `user:update`, `role:assign`. Effective-permissions viewer is read-only insight. |
| **Notable states** | **SSO-managed:** IdP-owned fields locked. **Self-edit guard:** can't remove own last admin role (lockout prevention). **Deactivated:** read-only + reactivate. |

## L3 · `/admin/roles` — Roles & permissions (RBAC) *(CORE)*

| Field | Spec |
|-------|------|
| **Route / Gate / Pattern** | `/admin/roles` · `A` · **List + Builder** |
| **Purpose** | Define custom roles and permission sets; the RBAC authoring surface (features 160, 204). Permission = resource × action (§6.3), bound to scope at assignment. |
| **Key components** | Role list (name, tier, #users, system/custom) · **permission-set builder** (resource × action matrix with grant/deny) · scope-constraint options · **ABAC condition** hooks (after-hours, classification) · clone-from-role · SoD conflict warnings |
| **Primary actions** | **New role** · Edit permissions (matrix) · Clone · Assign to users (→ users) · Delete (guarded) · **Preview effective access** |
| **Tables** | Roles (Name · Tier · Users · Type · Last-modified) · permission matrix (resource rows × action cols) |
| **Forms** | Role: `name` · `description` · `tier` · `permissions[]{resource, action, effect}` · `scope_constraint` · `abac_conditions[]` |
| **Permissions** | `role:read` (view) / `role:create` (author). System roles are read-only (clone to customize). |
| **Notable states** | **SoD conflict:** warns when a role combines requester+approver duties (e.g. `transfer:create`+`transfer:approve`). **In-use delete guard:** "N users hold this role." **Empty:** ships with tier-default roles from §2.1. |
| **Notes** | Fine-grained RBAC + ABAC overlays + row/field-level security is the enforcement stack (doc 16); this page authors the role layer only. |

## L4 · Admin structure, workflow & platform config *(compact)*

| Route / Gate / Pattern | Purpose | Key components / Forms | Actions | Permission | Notable states |
|------------------------|---------|------------------------|---------|-----------|----------------|
| `/admin/org` · `A` · Form/Detail | Organization profile & policies (feature 158) | Org identity · timezone/currency/units · data-residency · security policies (password, MFA, session) | `Save` | `org:manage` | Dirty-guard. |
| `/admin/facilities` · `A` · List/Tree | Facility/building/floor/zone structure editor (feature 158) | Structure **tree** · map · counts · bulk import | `Add` · `Edit` · `Reparent` · `Import` | `facility:manage` | **Empty:** seeded in onboarding. |
| `/admin/facilities/[id]` · `A` · Detail | One facility: buildings/floors/zones, floorplans, assets, staff | Sub-structure tree · floorplan upload · asset/staff rollups | `Add zone` · `Upload floorplan` · `Edit` | `facility:manage` | **No floorplan:** upload prompt (feeds twin/tracking). |
| `/admin/teams` · `A` · List | Teams, departments & cost centers (feature 161) | Team table (Name, Dept, Members, Cost-center, Manager) | `New` · `Edit` · `Add members` | `team:manage` | **Empty:** "Create teams." |
| `/admin/workflows` · `A` · List | Approval workflow & automation catalog (features 162, 163) | Workflow table (Name, Trigger, Type, Enabled, Runs) | `New` · `Edit` · `Enable` | `workflow:read`/`workflow:create` | **Empty:** "Build an approval chain." |
| `/admin/workflows/[id]` · `A` · **Builder** | No-code workflow/automation builder (trigger→conditions→actions, approval chains, SoD) | Flow canvas · trigger picker · condition/branch nodes · action nodes · **SoD rules** · test/simulate | `Save` · `Publish` · `Test` | `workflow:publish` | **Validation:** cyclic/invalid flow flagged. **SoD** enforced. |
| `/admin/integrations` · `A` · List | Connectors: ERP, ITSM, IdP, comms, IoT, warehouse (features 175–178) | Connector cards (status, health, last-sync) · categories · marketplace link | `Connect` · `Configure` · `Test` · `Disable` | `integration:manage` | **Auth-expired:** reconnect banner. |
| `/admin/integrations/[id]` · `A` · Detail | One integration: config, field mapping, sync logs, health | Config form · mapping · sync history · error log · test connection | `Configure` · `Sync now` · `View logs` | `integration:manage` | **Sync errors** surfaced. |
| `/admin/api-keys` · `A` · List | API keys, OAuth clients, rate limits (feature 180, 207) | Keys table (Name, Scopes, Created, Last-used, Rate-limit, Status) | `Create` · **`Revoke`** · `Rotate` | `apikey:create` | **Secret shown once** on create. |
| `/admin/webhooks` · `A` · List | Webhook subscriptions & event delivery (feature 172) | Webhook table (URL, Events, Status, Last-delivery, Failures) · delivery log | `New` · `Edit` · `Test` · `Disable` | `webhook:create` | **Delivery failures** flagged + retry. |
| `/admin/data` · `A` · List/Wizard | Tenant data import/export & backup (feature 168) | Import/export jobs · backup schedule · restore points · GDPR erasure tools | `Import` · `Export` · `Backup now` · `Restore` | `data:import`/`data:export`/`data:backup` | **Restore** confirm-gated (destructive). |
| `/admin/branding` · `A` · Form | White-label theming: logo, colors, email templates (feature 166) | Brand form + **live preview** (login, shell, emails) · theme tokens | `Save` · `Preview` · `Reset` | `branding:manage` | Live preview across surfaces. |
| `/admin/localization` · `A` · Form | Languages, units, currency, timezone defaults (feature 165) | Locale matrix · translation overrides · unit/currency/date formats | `Save` | `localization:manage` | Per-locale preview. |
| `/admin/billing` · `A` · Detail | Plan, usage, invoices, entitlements (feature 169) | Plan card · **usage meters** (assets-under-mgmt, AI tier, seats) · invoice table · payment method | `Change plan` · `Download invoice` · `Update payment` | `billing:manage` | **Over-limit:** upgrade prompt. **Past-due:** banner. |

---

# Area M — System (Platform tier)

All `PL` (Access Genie staff, cross-tenant, break-glass audited). Platform dashboard → §4 (system monitoring). Features → M19.

| Route / Gate / Pattern | Purpose | Key components / Tables & columns | Filters | Primary actions | Permission | Notable states |
|------------------------|---------|-----------------------------------|---------|-----------------|-----------|----------------|
| `/system/monitoring` · `PL` · Analytics | Cross-tenant platform health: uptime, **ingest lag**, error budgets, SLAs (features 225, 226) | KPI row (uptime, ingest rate/lag, P95, error-budget burn) · per-tenant health table · throughput/latency charts · incident feed | Tenant, region, service, time | `Drill tenant` · `Open incident` · `Ack SLO` | `system:read` (Super Admin/SRE) | **Incident:** red banner. **Degraded service** flagged. |
| `/system/tenants` · `PL` · List | Tenant directory & lifecycle (provision/suspend/config) | Table: Tenant · Plan · Region · Assets · Users · **Health** · Status · Created | Plan, region, status, health | `Provision` (→ `/provision-tenant`) · `Suspend` · `Configure` · `Impersonate` | `tenant:manage`/`tenant:provision` | **Suspended** rows flagged. **Impersonate** = consent+audit. |
| `/system/flags` · `PL` · List | Feature flags & config per tenant/global (feature 167) | Flag table (Flag, Scope, State, Rollout %, Owner) · targeting rules | `Toggle` · `Set rollout` · `Target` | `flag:manage` | **Staged rollout** progress. |
| `/system/developer` · `PL`/`A` · Docs/Portal | Developer portal: API docs, GraphQL playground, SDKs, webhooks (feature 180; API → doc 13) | API reference · **GraphQL/REST playground** · SDK downloads · webhook/event catalog · rate-limit info | Resource, version | `Try it` · `Generate key` · `View schema` | `apikey:read` (tenant devs) / `system:read` (platform) | **Auth required** for live calls. |
| `/system/status` · `PL`/`P` · Notice | Public/internal status page & maintenance windows (feature 232) | Component status grid · incident history · scheduled-maintenance banners · subscribe | `Subscribe` · `Post incident` · `Schedule maintenance` | `system:read` (post) / public (view) | **Active incident** prominent. |
| `/system/logs` · `PL` · List | Platform/system logs & error tracking (feature 228) | Virtualized log stream · error groups · trace search · filters | Service, level, tenant, trace id, time | `Search` · `Export` · `Open trace` | `system:read` | **High-volume streaming**; refine to avoid overload. |

---

# Area N — Settings (personal), Help & Errors

Compact but complete. Personal settings are self-scoped (baseline perms). Error pages are the last-resort states.

## N1 · Personal settings *(compact)*

| Route / Gate / Pattern | Purpose | Key components / Forms | Actions | Permission | Notable states |
|------------------------|---------|------------------------|---------|-----------|----------------|
| `/settings/profile` · `A` · Form | Personal profile: name, avatar, contact, language, timezone | Profile fields · avatar upload · locale/timezone · signature | `Save` | Baseline (self) | Dirty-guard. |
| `/settings/security` · `A` · Form | Password, **MFA methods**, passkeys, active sessions, device trust (features 203, 206) | Change-password · MFA enrollment (TOTP/passkey/SMS/backup) · session/device list w/ revoke · sign-out-all | `Update` · `Add MFA` · `Revoke session` | Baseline (self) | **Policy-enforced MFA:** can't disable if required. |
| `/settings/notifications` · `A` · Form | Personal notification channels, digests, quiet hours (feature 130) | Event×channel matrix · digest cadence · quiet hours (mirrors `/notifications/preferences`) | `Save` | Baseline (self) | Dirty-guard. |
| `/settings/appearance` · `A` · Form | Theme (dark/light/system), density, accessibility, default landing | Theme picker · density · reduce-motion/high-contrast · default dashboard | `Save` (applies live) | Baseline (self) | Live preview. |
| `/settings/api-tokens` · `A` · List | Personal access tokens for the user (feature 207) | Token table (Name, Scopes, Created, Last-used) · create dialog | `Create` · **`Revoke`** | Baseline (self); scoped to user's own perms | **Secret shown once.** |

## N2 · Help & support *(compact)*

| Route / Gate / Pattern | Purpose | Key components | Actions | Permission | Notable states |
|------------------------|---------|----------------|---------|-----------|----------------|
| `/help` · `A` · Split (nav+article) | Knowledge base & docs home; search, categories, in-app tours (features 234, 236) | Search · category nav · popular articles · **contextual help** (deep-links from ⌘K/"?") · tour launcher | `Search` · `Open article` · `Start tour` · `Contact support` | `help:read` | **No-results:** "No articles — contact support." |
| `/help/[article]` · `A` · Detail | One KB article: content, media, related, feedback | Article body · TOC · related links · **"Was this helpful?"** · edit-suggestion | `Helpful?` · `Share` · `Contact support` | `help:read` | **Not found:** suggest search/support. |
| `/support` · `A` · List/Form | Support ticketing & chat (feature 237) | Ticket list (mine) · **new-ticket form** (category, priority, description, attachments, related asset/WO) · live-chat launcher | `New ticket` · `Reply` · `Attach` · `Chat` | `support:read`/`support:create` | **Empty:** "No tickets — need help?" |
| `/support/[ticket]` · `A` · Detail | One ticket: thread, status, attachments, resolution | Message thread · status timeline · attachments · SLA · reopen | `Reply` · `Attach` · `Close` · `Reopen` | `support:read` | **Resolved:** reopen available. |
| `/whats-new` · `A` · Feed | Product changelog / release notes (feature 234) | Chronological release cards · tags (new/improved/fixed) · media · "try it" deep-links | `Read` · `Dismiss` · `Try feature` | Baseline | **Empty:** "You're up to date." |

## N3 · Error & system-state pages *(compact — these ARE states, rendered as routes)*

| Route / Gate / Pattern | Purpose | Key components | Actions | Permission | Notable states |
|------------------------|---------|----------------|---------|-----------|----------------|
| `/403` · `A` · Notice | **Permission-denied** page (deep-link/route without access) — canonical form of the §6.2 403 state | Explanation of missing `resource:action` · **Request access** (routes to approver) · who to contact · back-to-home | `Request access` · `Switch scope` · `Home` | Any authenticated | Renders the standard 403 state at page scope. |
| `/404` · `P`/`A` · Notice | Not-found (bad URL or out-of-scope entity, disambiguated from 403) | Friendly message · search · popular links · report-broken-link | `Search` · `Home` · `Report` | Public | Distinguishes "doesn't exist" from "no access." |
| `/500` · `P`/`A` · Notice | Server error — canonical §6.2 error state at page scope | Apology · **trace id** (copyable) · **Retry** · status-page link · support link | `Retry` · `Status page` · `Contact support` | Public | Never leaks internals; trace id only. |
| `/offline` · `A` · Notice | Offline fallback when no cached view exists (PWA) | Offline illustration · what still works (cached/queued) · retry · **queued-changes** view | `Retry` · `View queued changes` | Any | Reads from cache where possible; writes queued. |
| `/maintenance-mode` · `P` · Notice | Planned-maintenance / tenant-suspended interstitial | Maintenance message · **ETA/window** · status-page link · subscribe-for-updates | `Status page` · `Subscribe` | Public | Distinguishes planned maintenance from outage (`/500`). |

---

## 6.16 Coverage checklist — every §0.6 route is specced

Cross-check against [00-master-blueprint.md](./00-master-blueprint.md) §0.6. **A page is listed here iff it is in the master inventory.** ✓ = specced above.

| Area | Routes covered | # | ✓ |
|------|----------------|---|---|
| **A — Auth/Onboarding** | `/login`, `/login/sso/[provider]`, `/auth/callback`, `/mfa`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/set-password`, `/verify-email`, `/select-org`, `/onboarding`, `/locked`, `/session-expired`, `/provision-tenant` | 14 | ✓ |
| **B — Workspace/Dashboards** | `/`, `/dashboards`, `/dashboards/{executive,operations,maintenance,asset,ai,security,inventory,financial}`, `/dashboards/builder`, `/copilot`, `/my-work`, `/notifications`, `/favorites`, `/recent` | 16 | ✓ |
| **C — Assets** | `/assets`, `/assets/new`, `/assets/import`, `/assets/[id]`, `/assets/[id]/edit`, `/assets/labels`, `/taxonomy`, `/taxonomy/[class]`, `/groups`, `/groups/[id]`, `/kits`, `/lifecycle`, `/disposal`, `/saved-views` | 14 | ✓ |
| **D — Tracking/IoT** | `/tracking`, `/twin`, `/twin/[facility]`, `/geofences`, `/geofences/new`, `/movement`, `/movement/[assetId]`, `/heatmaps`, `/sensors`, `/sensors/[id]`, `/gateways`, `/gateways/[id]`, `/telemetry` | 13 | ✓ |
| **E — AI** | `/ai-insights`, `/ai/health`, `/ai/predictive`, `/ai/utilization`, `/ai/anomaly`, `/ai/theft`, `/ai/forecasting`, `/ai/models`, `/ai/models/[id]`, `/ai/explainability`, `/ai/feedback` | 11 | ✓ |
| **F — Maintenance** | `/maintenance`, `/maintenance/[id]`, `/maintenance/new`, `/maintenance/calendar`, `/pm`, `/pm/[id]`, `/predictive`, `/scheduling`, `/inspections`, `/inspections/[id]`, `/checklists`, `/parts` | 12 | ✓ |
| **G — Inventory** | `/inventory`, `/inventory/[sku]`, `/reorder`, `/procurement`, `/procurement/[id]`, `/consumption`, `/warehouses`, `/warehouses/[id]`, `/bins`, `/suppliers` | 10 | ✓ |
| **H — Operations/Custody** | `/operations/transfers`, `/transfers/[id]`, `/transfers/new`, `/checkinout`, `/reservations`, `/reservations/calendar`, `/field-ops`, `/requests`, `/kiosk` | 9 | ✓ |
| **I — Analytics/Reports** | `/reports`, `/reports/[id]`, `/reports/builder`, `/bi`, `/financials`, `/depreciation`, `/compliance-reports`, `/subscriptions`, `/exports` | 9 | ✓ |
| **J — Alerts** | `/alerts`, `/alerts/[id]`, `/alert-rules`, `/alert-rules/new`, `/escalations`, `/notifications/preferences` | 6 | ✓ |
| **K — Compliance/Audit** | `/audit`, `/audit/[id]`, `/cycle-counts`, `/custody`, `/custody/[assetId]`, `/certifications`, `/regulatory`, `/retention`, `/audit-log` | 9 | ✓ |
| **L — Administration** | `/admin/org`, `/admin/facilities`, `/admin/facilities/[id]`, `/admin/users`, `/admin/users/[id]`, `/admin/roles`, `/admin/teams`, `/admin/workflows`, `/admin/workflows/[id]`, `/admin/integrations`, `/admin/integrations/[id]`, `/admin/api-keys`, `/admin/webhooks`, `/admin/data`, `/admin/branding`, `/admin/localization`, `/admin/billing` | 17 | ✓ |
| **M — System (PL)** | `/system/monitoring`, `/system/tenants`, `/system/flags`, `/system/developer`, `/system/status`, `/system/logs` | 6 | ✓ |
| **N — Settings/Help/Errors** | `/settings/profile`, `/settings/security`, `/settings/notifications`, `/settings/appearance`, `/settings/api-tokens`, `/help`, `/help/[article]`, `/support`, `/support/[ticket]`, `/whats-new`, `/403`, `/404`, `/500`, `/offline`, `/maintenance-mode` | 15 | ✓ |
| **Total** | | **~151** | ✓ |

> **Consistency guarantee:** every page inherits the §6.1 anatomy and §6.2 state set; every action names a `resource:action` from §6.3; every route above appears in master §0.6. Any new page must be added to §0.6 **and** here, or it's a gap (per §0.9 audit rule).

---

## 6.17 Related documents

- Page *list* & routes → [00-master-blueprint.md](./00-master-blueprint.md) §0.6 · anatomy/states → §0.7
- Navigation & IA → [03-information-architecture.md](./03-information-architecture.md)
- Roles & permissions → [02-personas.md](./02-personas.md) · enforcement → [16-security-compliance.md](./16-security-compliance.md)
- Dashboards → [04-dashboards.md](./04-dashboards.md) · Features → [05-feature-matrix.md](./05-feature-matrix.md)
- Asset 360° field spec → [10-asset-360-profile.md](./10-asset-360-profile.md) · Lifecycle → [07-asset-lifecycle.md](./07-asset-lifecycle.md)
- AI modules → [08-ai-intelligence.md](./08-ai-intelligence.md) · Tracking tech → [09-tracking-technologies.md](./09-tracking-technologies.md)
- Reporting/BI → [17-reporting-bi.md](./17-reporting-bi.md) · Mobile/offline → [14-mobile-apps.md](./14-mobile-apps.md) · Design system/states → [15-design-system.md](./15-design-system.md)
- Build order (login → every page) → [20-implementation-plan.md](./20-implementation-plan.md)
