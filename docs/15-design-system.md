# 15. UI/UX & Design System

**Document type:** Design-system specification — foundations, tokens, component library, patterns
**Version:** 1.0 · **Status:** Planning (pre-beautify) · **Owner:** Design Systems / Frontend Architecture
**Audience:** Design, Frontend Engineering, QA, PM
**Consumes:** [00 §0.7 page anatomy/states](./00-master-blueprint.md) · [03 Information Architecture](./03-information-architecture.md) · [04 Dashboards](./04-dashboards.md)
**Ground truth:** `src/app/globals.css` (Tailwind v4 `@theme`) · `src/components/layout/{Sidebar,TopNav,AppShell}.tsx` · `src/components/charts/DashboardCharts.tsx`

> This is the visual and interaction contract for the whole platform. Every page from §0.6 is assembled
> from the tokens and components below so the product reads as **one system** — the tracking dot, the work
> order, and the depreciation line share one button, one table, one badge. Tokens here are transcribed
> **verbatim** from the shipped `globals.css`; where the doc proposes tokens not yet in CSS they are marked
> *(proposed)* so implementation and spec never silently diverge.

---

## 15.1 Design principles

The five non-negotiables that resolve every design trade-off. When two options conflict, the higher principle wins.

| # | Principle | What it means in practice | Anti-pattern it forbids |
|---|-----------|---------------------------|-------------------------|
| 1 | **Enterprise density** | Operators triage hundreds of rows per shift. Default to compact tables, 12–13px table text, tight vertical rhythm, tabular numerals, information-per-pixel over whitespace-for-its-own-sake. Comfortable mode is opt-in, not default. | Consumer-app airiness; one KPI per screen; hero images. |
| 2 | **Clarity over decoration** | A number, its unit, its trend, and its threshold color are always visible together. No glass/blur on the light canvas (reads cheap — see `globals.css` note). Structure through hairline borders + soft shadows, not gradients. | Ornamental gradients, drop-shadows as identity, mystery-meat icons. |
| 3 | **Explainable-AI surfacing** | Every AI-derived value (health, risk, prediction, anomaly) ships with **driver + confidence + recommended action** inline or one hover away. AI content is visually distinct (✨ marker, primary-tinted surface) and always dismissible/actionable/feedback-able. | Black-box scores; an AI number with no "why"; AI styled identically to entered data. |
| 4 | **Consistency** | One button, one input, one table, one badge — reused everywhere. Every entity page uses the same tabbed object pattern (§0.7). Every page ships all standard states (§15.14). Component variants are enumerated, not improvised. | Bespoke one-off widgets; a "special" table on one screen. |
| 5 | **Scope & permission honesty** | The UI reflects data-layer truth: role-adaptive nav *hides* (not greys) inaccessible modules; scope chips are always visible; 403 explains and offers request-access. Never fake data the user can't see. | Greyed menus that leak IA; optimistic UI that hides permission errors. |

**Supporting principles:** deep-linkable state (filters live in the URL, §03.5) · command-first (⌘K can navigate/filter/create/explain/act) · accessible by construction (WCAG 2.1 AA is a gate, not a pass, §15.19) · offline-honest (cached banners, never silent staleness).

---

## 15.2 Theming strategy

The app was **converted from a dark-first prototype to a professional light theme**, which is now the **shipped default**. This has concrete, load-bearing consequences captured directly in `globals.css`:

- **Light is default, permanently applied.** `:root` sets `--background: #f6f8fb` (soft light-gray canvas) and `--foreground: #0f172a` (slate-900). White cards read with depth against the gray canvas.
- **`dark:` is a class-based opt-in variant**, not the OS media query. `globals.css` declares:
  `@custom-variant dark (&:where(.dark, .dark *));` — so `dark:` utilities stay **dormant** until a `.dark` class is present on an ancestor. No `.dark` class is applied today, so the app is uniformly light.
- **Consequence for authors:** existing components (e.g. `TopNav`, `page.tsx`) already carry `dark:` utilities. These are **latent, correct-when-enabled** styles — keep authoring them in pairs so re-enabling dark mode is a single root-class toggle, never a re-theme. Do **not** remove `dark:` utilities; do **not** rely on them rendering today.
- **No glass/blur on light.** The `glass-panel` utility is intentionally a **clean white card** (`--color-surface` + hairline `--color-surface-border` + soft shadow), despite its legacy name. Do not add `backdrop-blur` to content cards on the light canvas.

**Dark-mode roadmap (when re-enabled):** toggle in top bar → sets `.dark` on `<html>` → surface flips to slate-900/950, borders to slate-800, canvas to slate-950, text to slate-50. Semantic health tokens and the primary ramp are tuned to hold AA contrast on both canvases (validated per §15.19). Theme choice persists per-user (`/settings/appearance`) and respects `prefers-reduced-motion` independently.

---

## 15.3 Color tokens

### 15.3.1 Primary — sky ramp (verbatim from `@theme`)

The brand/interaction color. `primary-500/600` are the workhorses (buttons, links, active nav, focus rings, chart line).

| Token (Tailwind) | Hex | Primary use |
|------------------|-----|-------------|
| `primary-50` | `#e0f2fe` | Active-nav background, primary-tint fills, AI-surface wash |
| `primary-100` | `#bae6fd` | Active-nav icon chip, hover tint, selected-row wash |
| `primary-200` | `#7dd3fc` | Borders on tinted surfaces, subtle dividers |
| `primary-300` | `#38bdf8` | Disabled-primary, secondary accents |
| `primary-400` | `#22b0f2` | Hover on light accents, chart secondary |
| `primary-500` | `#0ea5e9` | **Default brand** — links, chart util line, focus ring, KPI accent |
| `primary-600` | `#0284c7` | **Primary button fill**, active link, logo accent |
| `primary-700` | `#0369a1` | Button hover/pressed, active-nav text |
| `primary-800` | `#075985` | High-emphasis text on tint, pressed states |
| `primary-900` | `#0c4a6e` | Deepest accent, headings on tint (rare) |

### 15.3.2 Semantic — health / risk (verbatim from `@theme`)

Three-stop system driving status pills, KPI threshold theming, risk meters, and chart marks. **Never** use raw red/amber/green Tailwind for status — use these tokens so re-theming is centralized.

| Token | Hex | Meaning | Typical thresholds (risk score 0–100) |
|-------|-----|---------|----------------------------------------|
| `health-good` | `#10b981` (emerald) | Healthy / on-target / active / in-tolerance | `score ≤ 40` |
| `health-warning` | `#f59e0b` (amber) | Attention / degrading / due-soon / idle | `40 < score ≤ 70` |
| `health-critical` | `#ef4444` (red) | Critical / failing / breached / missing | `score > 70` |

> Threshold bands above are the shipped convention (see `page.tsx` risk meter: `>70` critical, `>40` warning, else good). Reuse these exact cut-points everywhere for consistency.

### 15.3.3 Neutrals — slate (Tailwind default ramp, used pervasively)

Slate is the UI's structural gray. Not in `@theme` (Tailwind ships it); listed here as the sanctioned neutral scale.

| Token | Hex | Role |
|-------|-----|------|
| `slate-50` | `#f8fafc` | Zebra rows, hover-row, tinted inner surfaces, avatars bg |
| `slate-100` | `#f1f5f9` | Search-input fill, icon chips, hover on nav |
| `slate-200` | `#e2e8f0` | **Hairline borders** (== `surface-border`), dividers, meter track |
| `slate-300` | `#cbd5e1` | Scrollbar thumb, disabled borders |
| `slate-400` | `#94a3b8` | Muted/placeholder text, axis labels, tertiary icons |
| `slate-500` | `#64748b` | Secondary text, labels, captions |
| `slate-600` | `#475569` | Body-secondary, sidebar default text |
| `slate-700` | `#334155` | Emphasized secondary, table headers |
| `slate-900` | `#0f172a` | **Primary text** (== `--foreground`), headings |

### 15.3.4 Surface & canvas tokens (verbatim)

| Token | Hex | Role |
|-------|-----|------|
| `--color-surface` | `#ffffff` | Card / panel / dialog / input background |
| `--color-surface-border` | `#e2e8f0` | Hairline border on all surfaces |
| `--background` | `#f6f8fb` | App canvas behind cards (soft gray for depth) |
| `--foreground` | `#0f172a` | Default text on canvas/surface |

### 15.3.5 Categorical (dataviz) palette

For charts with categorical series (donut categories, stacked bars). CVD-safe, validated by the `dataviz` skill (see `DashboardCharts.tsx`). Ring/series order == category order to preserve adjacency safety.

| Slot | Hex | | Slot | Hex |
|------|-----|-|------|-----|
| 1 | `#3987e5` (blue) | | 4 | `#c98500` (gold) |
| 2 | `#d95926` (orange) | | 5 | `#d55181` (pink) |
| 3 | `#199e70` (green) | | 6 | `#008300` (deep green) |

> **Do not** reuse the categorical palette for status, and do not reuse health tokens for categories. Status = semantic 3-stop; series = categorical 6-slot. On the light canvas the yellow/gold slot triggers a contrast WARN → always pair series with direct legend labels, never color-only.

---

## 15.4 Typography

Two families, loaded via `next/font` (`layout.tsx`): **Inter** (body/UI, `--font-inter` → `font-sans`) and **Outfit** (headings, `--font-outfit` → `font-heading`). Headings auto-use Outfit via the `h1–h6` rule in `globals.css`; use `font-heading` on non-heading elements that should read as display (KPI values, card titles).

| Role | Family | Size / line | Tailwind | Weight | Notes |
|------|--------|-------------|----------|--------|-------|
| Display / page H1 | Outfit | 30px / 36 | `text-3xl` | 700 `font-bold` | `tracking-tight`; page headers (`page.tsx`) |
| H2 / section | Outfit | 24px / 32 | `text-2xl` | 700 | Logo, major sections |
| H3 / card title | Outfit | 18px / 28 | `text-lg` | 700 `font-bold` | Panel headers |
| KPI value | Outfit | 30px / 36 | `text-3xl` | 700 | `font-heading`, `tabular-nums` |
| Body / default | Inter | 14px / 20 | `text-sm` | 400–500 | Default UI text |
| Body-emphasis | Inter | 14px / 20 | `text-sm` | 600 `font-semibold` | Row primary, labels |
| Table cell (dense) | Inter | 12–13px / 18 | `text-xs`/`text-[13px]` | 400–500 | `tabular-nums` for numerics |
| Caption / meta | Inter | 12px / 16 | `text-xs` | 400–500 | `text-slate-500` |
| Micro / eyebrow | Inter | 10–11px / 14 | `text-[11px]` | 600 | `uppercase tracking-wider` (sidebar eyebrow) |
| `kbd` | Inter | 10px | `text-[10px]` | 600 | ⌘K hints, bordered chip |

**Type rules:** headings always Outfit; numerics always `tabular-nums`; never go below 11px for interactive text (12px min for body); `tracking-tight` on large display, `tracking-wider` + uppercase only on micro eyebrows.

---

## 15.5 Spacing, radius, elevation, z-index

### 15.5.1 Spacing scale (Tailwind 4px base)

| Step | px | Common use |
|------|----|-----------|
| `1` | 4 | Icon-text micro gaps, pill padding-y |
| `2` | 8 | Tight gaps, dense cell padding |
| `2.5`/`3` | 10/12 | Input padding-y, nav item padding, dense row padding |
| `4` | 16 | Card inner padding (compact), grid gaps (mobile) |
| `5`/`6` | 20/24 | **Card padding** (`p-6` standard), section gaps, grid `gap-6` |
| `8` | 32 | Page region separation |

**Rhythm:** page content stacks at `space-y-6`; KPI/analytics grids at `gap-6`; dense list rows at `space-y-1`–`space-y-2`.

### 15.5.2 Radius

| Token | px | Use |
|-------|----|----|
| `rounded` / `rounded-md` | 4 / 6 | Chips, small icon tiles, meter fills |
| `rounded-lg` | 8 | **Buttons, inputs, nav items, list rows, small cards** |
| `rounded-xl` | 12 | **Panels / cards** (`glass-panel` == `0.75rem`), dialogs |
| `rounded-2xl` | 16 | Large feature cards, modals *(proposed sparingly)* |
| `rounded-full` | ∞ | Avatars, status dots, pills, meter tracks, scrollbar thumb |

### 15.5.3 Elevation / shadow

| Level | Definition | Use |
|-------|-----------|-----|
| `e0` flat | none, `border` only | Table containers, inline groups |
| `e1` card | `glass-panel` shadow: `0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06)` | **All content cards/panels** |
| `e2` raised | `shadow-md` | Dropdowns, popovers, hover-lift |
| `e3` overlay | `shadow-lg` | Tooltips, command palette, toasts |
| `e4` modal | `shadow-xl`/`2xl` *(proposed)* | Dialogs, drawers |

> Elevation on light = **soft, low-opacity slate shadows**, never dark/heavy. Borders do the structural work; shadow only lifts interactive/overlay layers.

### 15.5.4 Z-index scale

| z | Layer |
|---|-------|
| `0`/`auto` | In-flow content |
| `10` | Sticky top bar (`TopNav`), sticky table headers, hover-tooltip-in-svg |
| `20` | Dropdowns, popovers, select menus |
| `30` | Drawers / side sheets |
| `40` | Modal dialogs + scrim |
| `50` | Command palette (⌘K), toasts, global loading bar |

*(z-scale is proposed/normative; current code uses `z-10` for sticky TopNav — extend upward per this table.)*

---

## 15.6 Breakpoints & responsive reflow

Tailwind default breakpoints; the shell is desktop-primary (dense operator tool) but reflows cleanly.

| BP | min-width | Shell behavior |
|----|-----------|----------------|
| base | 0 | Sidebar off-canvas (hamburger); 1-col KPI/grid; tables → stacked cards or horizontal scroll; top-bar search collapses to icon |
| `sm` | 640px | 2-col KPI; legend beside donut; pinned KPIs |
| `md` | 768px | 2-col grids (`md:grid-cols-2`); tables show core columns |
| `lg` | 1024px | **Sidebar docked (w-64)**; 3–4 col KPI (`lg:grid-cols-4`); analytics 2/3 + 1/3 split (`lg:col-span-2`) |
| `xl` | 1280px | Full column sets, comfortable gutters |
| `2xl` | 1536px | Max content width capped; extra columns/detail rail |

**Reflow rules (per §04.9 + §0.7):** dashboards → single column with key KPIs pinned first; wide tables → horizontal scroll inside their own container (never break page layout) with a frozen first column + sticky header; detail-page tab bar → scrollable/overflow-menu on narrow; map/twin inspector → bottom sheet on mobile; two-pane (list+detail) → list-only with push-to-detail navigation.

---

## 15.7 Motion & easing

Motion is functional (state feedback, spatial continuity), never decorative-looping — except deliberate "live" affordances (pulsing alert dot).

| Token | Duration | Easing | Use |
|-------|----------|--------|-----|
| `motion-instant` | 100ms | `ease-out` | Hover tint, focus ring, small color change |
| `motion-fast` | 150ms | `ease-out` | Buttons, nav, chart fill-opacity (`duration-150` in charts), row hover |
| `motion-base` | 200ms | `ease-in-out` | Dropdown/popover open, tab switch, toast in |
| `motion-slow` | 300ms | `ease-in-out` | Drawer/sheet slide, dialog scale-in, page-region transitions |
| `motion-live` | 1–2s loop | `ease-in-out` | Alert pulse/ping (`animate-ping`, `animate-pulse` — see `page.tsx` critical dot, `TopNav` bell) |

**Standard easings:** enter `cubic-bezier(0, 0, 0.2, 1)` (decelerate) · exit `cubic-bezier(0.4, 0, 1, 1)` (accelerate) · move `cubic-bezier(0.4, 0, 0.2, 1)`. **Reduced motion:** `prefers-reduced-motion: reduce` disables all non-essential transitions, ping/pulse, chart draw-in, and auto-carousels — state still changes, just without tweening (§15.19).

---

## 15.8 Component library — conventions

Each component below is specified as **Anatomy · Variants · States · Usage**. States that apply to every interactive component (and are therefore not repeated): `default · hover · focus-visible · active/pressed · disabled · loading · error`. Focus-visible is **always** a `ring-2 ring-primary-500` (2px offset on solid surfaces). Every interactive element has an accessible name and a ≥24px hit target (≥44px on touch).

---

## 15.9 Buttons

**Anatomy:** `[optional leading icon] · label · [optional trailing icon/kbd/count]`, `rounded-lg`, `font-medium`, `text-sm`, height 36px (`py-2 px-4`) default.

| Variant | Fill / border | Text | Use |
|---------|---------------|------|-----|
| **Primary** | `bg-primary-600` → hover `bg-primary-700` | white | The one main action per header/dialog |
| **Secondary** | `bg-white border border-slate-200` → hover `bg-slate-50` | `slate-700` | Alt actions, cancel-adjacent |
| **Tertiary / ghost** | transparent → hover `bg-slate-100` | `slate-600` | Toolbar, low-emphasis |
| **Link** | none | `primary-600` hover `underline` | Inline "View all →" (`page.tsx`) |
| **Destructive** | `bg-health-critical` → hover darker | white | Delete, dispose, write-off (confirm-gated) |
| **AI / accent** | `bg-primary-500/10 text-primary-500` pill → hover `/20` | primary | "Ask Copilot", "Explain this", insight actions (`page.tsx`) |

**Sizes:** `sm` (28px, `text-xs`, dense toolbars) · `md` (36px, default) · `lg` (44px, primary CTAs/mobile). **Icon-only:** square, `aria-label` required, tooltip on hover. **Loading:** spinner replaces leading icon, label stays, button disabled + `aria-busy`. **Groups:** primary is rightmost in dialogs; segmented button groups share a hairline divider.

---

## 15.10 Inputs, selects, search

**Anatomy:** `label` (`text-sm font-medium slate-700`) · control · optional leading/trailing icon · `helper/error` text · optional char/validation counter.

| Control | Spec | Notes |
|---------|------|-------|
| **Text/number input** | `bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm`, focus `ring-2 ring-primary-500` | numeric → `tabular-nums`, right-align in tables |
| **Select** | `bg-white border border-slate-200 rounded-lg px-4 py-2 font-medium` (matches `page.tsx` filters) | native for short lists; custom listbox (z-20) for search/multi |
| **Search** | `bg-slate-100 border-none rounded-lg pl-10 pr-4 py-2` with 🔍 leading (matches `TopNav`) | ⌘K opens Copilot; `/` focuses inline search |
| **Textarea** | as input, `min-h` 3 rows, resize-y | comments, notes |
| **Checkbox / radio** | 16px, `rounded`(cb)/`rounded-full`(radio), checked `bg-primary-600` | bulk-select header = tristate |
| **Toggle** | pill track, `health-good` on / `slate-300` off | boolean settings |
| **Date / range** | input + popover calendar (z-20) | dashboards, report scheduling |
| **Combobox / tag** | typeahead chips, `Backspace` removes | scope, taxonomy, custodian |

**States:** default → hover (`border-slate-300`) → focus (`ring-2 ring-primary-500`) → filled → **error** (`border-health-critical`, message below, `aria-invalid`, `aria-describedby`) → disabled (`bg-slate-50 text-slate-400`) → readonly (no border, plain text). Placeholder is `slate-400`, never the only label (a11y). Validation timing → §15.17.

---

## 15.11 Tables (dense / comfortable)

The workhorse of an operator platform. One table component, configured.

**Anatomy:** toolbar (search · filters · saved-view chip · column-config ⚙ · density toggle · export · bulk-action bar when rows selected) → **sticky header** (`z-10`, `bg-white border-b border-slate-200`, sortable `slate-700` labels) → body rows → footer (pagination · row count · rows-per-page).

| Aspect | Dense (default) | Comfortable |
|--------|-----------------|-------------|
| Row height | 36–40px | 52–56px |
| Cell padding | `px-3 py-2` | `px-4 py-3` |
| Text | `text-xs`/`text-[13px]` | `text-sm` |
| Use | registry, telemetry, audit log, alerts | detail sub-tables, financial summaries |

**Features:** sticky header + optional frozen first/last column · sortable columns (arrow indicator, multi-sort via shift) · column config (show/hide/reorder/pin, persisted per saved-view) · row selection (checkbox col, shift-range, select-all-matching) · **bulk-action bar** (replaces toolbar when ≥1 selected: count + contextual actions + clear) · inline row actions (⋯ menu, `z-20`) · expandable rows · zebra (`even:bg-slate-50`) + hover (`hover:bg-slate-50`) · cell types: text, numeric (`tabular-nums` right-aligned), status pill, health meter, avatar, relative-time, currency. **States:** loading (skeleton rows), empty (§15.14), no-results (clear-filters CTA), error (retry banner in body), partial (streaming rows w/ shimmer tail). Column values carrying AI meaning (risk, health) render as meters/pills with hover-explain (§15.13).

---

## 15.12 Cards & KPI tiles

**Card (`glass-panel` + `p-6 rounded-xl`):** white surface, hairline border, `e1` shadow. Anatomy: header (`h3 font-heading font-bold text-lg` + optional action/meta right) → body → optional footer. Variants: plain · with-accent-top-border (`border-t-4 border-t-primary-500`, `page.tsx`) · interactive (hover border-primary tint, whole-card link) · AI-card (✨ header, primary-tinted inner items).

**KPI tile** (the dashboard atom, §04): 
**Anatomy** → `label` (`text-sm font-medium slate-500`) → **value** (`text-3xl font-bold font-heading tabular-nums`) → delta/context (`text-xs`, colored by direction: `emerald-500` up-good / `red-500` down-bad) → optional live indicator (ping dot, top-right) → optional threshold accent.

| Variant | Signal |
|---------|--------|
| Neutral | plain value + context (Total Value) |
| Trend | ↑/↓ % vs period, semantic color |
| Threshold-themed | value/accent colorized good/warning/critical vs target (§04.9) |
| Live / alert | pulsing dot + critical framing (Critical Alerts card) |
| Accent | `border-t-4 border-t-primary-500` for the hero KPI |

**Usage:** KPI row is always the first band of a dashboard (`grid gap-6`, `md:grid-cols-2 lg:grid-cols-4`). Every tile declares data source, refresh cadence + freshness stamp, and drill-through target (§04.9). Whole tile is the drill link.

---

## 15.13 Badges, status pills & health/risk meters

**Badge / status pill:** `inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium`, tinted semantic bg + text (`bg-{health}/10 text-{health}`) with a leading status dot. 

| State family | Token | Examples |
|--------------|-------|----------|
| Good | `health-good` | Active, Healthy, In-tolerance, Resolved, Compliant |
| Warning | `health-warning` | Idle, Due-soon, Degrading, Pending, Low-stock |
| Critical | `health-critical` | Missing, Failing, Breached, Overdue, Tamper |
| Neutral | `slate` | Draft, Archived, Unknown, N/A |
| Info / AI | `primary` | Predicted, AI-suggested, New |

Count badges (nav/bell): `rounded-full bg-health-critical` micro-pill or dot (`TopNav` bell). **Never color-only** — pill always pairs color with text/icon (§15.19).

**Health / risk meter** (the AI-native affordance): horizontal track `h-2 rounded-full bg-slate-200` with fill colored by threshold and width = score (verbatim pattern from `page.tsx`): `>70` → `health-critical`, `>40` → `health-warning`, else `health-good`, plus the numeric score `tabular-nums` in matching text color. Variants: linear meter (tables/rows) · radial gauge (asset 360° hero, data-completeness) · segmented band (distribution). **Every meter hover/focus reveals the AI explanation:** top drivers, confidence %, and recommended action — satisfying Principle 3.

---

## 15.14 Empty · loading · error · permission · offline states

Mandatory on **every** page and data region (§0.7). No screen is "done" with only the happy path (§0.8 rule).

| State | Anatomy | Content rule |
|-------|---------|--------------|
| **Loading** | Skeleton mirroring final layout (KPI blocks, table rows, chart box) w/ shimmer; top progress bar (z-50) for route change | Match final shape; never a bare centered spinner on a full page |
| **Empty (no data yet)** | Illustration/emoji glyph + one-line what + subtext why + **primary CTA** + help link | Actionable: "No assets yet → Register asset / Import CSV" |
| **No-results (filtered)** | Muted glyph + "No matches" + **Clear filters** + show active filter chips | Distinct from empty; preserve the query |
| **Error** | ⚠ + plain message + **Retry** + support link + **trace id** (copyable) | Never expose stack; always a next step + id |
| **Permission-denied (403)** | Lock glyph + "You don't have access to X" + scope/role explanation + **Request access** | Explain, don't just block (Principle 5) |
| **Offline** | Sticky banner "Showing cached data · last synced Xm ago" + retry | Honest staleness; content stays usable read-only |
| **Partial / degraded** | Inline notice on the failed region only | Fail the widget, not the page |

Loading skeleton uses `bg-slate-100` blocks; text placeholders `bg-slate-200 rounded`. Respect reduced-motion (static skeleton, no shimmer).

---

## 15.15 Tabs, dialogs, drawers, toasts, timeline, command palette

### 15.15.1 Tabs
Underline tab bar (`border-b border-slate-200`; active = `text-primary-700` + `border-b-2 border-primary-600`; inactive `text-slate-500 hover:text-slate-900`). The **object-page pattern** (asset 360° = 14 tabs, §10): tab bar sticky under page header; deep-linkable (`?tab=`); overflow → scroll + "More" menu on narrow. Pill/segmented tabs used for in-card view switches (list/board/calendar).

### 15.15.2 Dialogs (modal)
Centered `rounded-xl` white surface, `max-w-lg` default, scrim `bg-slate-900/40`, z-40. Anatomy: title + close · body · footer (secondary left / primary right). Focus-trapped, `Esc` closes, focus returns to trigger, `role="dialog" aria-modal`. Sizes sm/md/lg/xl; confirm-dialog for destructive (names the target, destructive button).

### 15.15.3 Drawers / side sheets
Right (detail/inspector) or left (nav on mobile). `w-[380–480px]`, slides `motion-slow`, scrim optional (non-modal inspector = no scrim), z-30. Use: map/twin inspector, quick-view without leaving list, create/edit forms that keep context.

### 15.15.4 Toasts / notifications
Bottom-right stack, `rounded-lg` white + `e3` shadow + left accent bar (semantic), z-50. Variants: success/info/warning/error; auto-dismiss 4–6s (errors persist until dismissed); optional action ("Undo", "View"). `role="status"` (polite) / `role="alert"` (assertive for errors). Distinct from the **bell inbox** (`/notifications`, persistent) — toasts are ephemeral.

### 15.15.5 Timeline
Vertical rail with node dots (semantic-colored by event type) + time + actor + description; used on asset history, audit trail, WO activity, chain-of-custody. Dense variant (compact rows) + grouped-by-day headers. Node icons map to event class; expandable nodes for payload/diff.

### 15.15.6 Command palette (⌘K Copilot)
The signature UX (§0.10.5). Centered overlay (z-50, `e3`), search input + grouped results (Navigate · Filter · Create · Assets · Actions · Ask AI). Anatomy: input → result groups (icon + title + context + ⌥shortcut) → footer hints (`↑↓ navigate · ↵ select · esc close`). Natural-language row ("Ask AI: '…'") always present → routes to Copilot. Fully keyboard-driven; the `kbd ⌘K` hint lives in the sidebar (`Sidebar.tsx`) and top-bar search placeholder (`TopNav`). Recent + suggested when empty.

---

## 15.16 Charts, maps/twin, forms, stepper

### 15.16.1 Charts — hand-rolled SVG conventions
No chart library (see `DashboardCharts.tsx`). House conventions, normative:

- **`viewBox` + `preserveAspectRatio`**, `className="w-full h-auto"` → fully responsive; geometry in viewBox units with an explicit margin object `{top,right,bottom,left}`.
- **Colors from tokens:** utilization line = `primary-500` `#0ea5e9`; downtime = amber `#f59e0b`; categorical from the §15.3.5 palette. Area fills via `linearGradient` (token color, `0.28→0` opacity).
- **Line smoothing:** Catmull-Rom → cubic-bézier (`smoothLine`); strokes `2.5px`, round caps/joins; dots `r=4` (6 on hover) white-stroked.
- **Axes/grid:** `stroke-slate-200`, labels `fill-slate-400 fontSize 11`; dual-axis supported (left util %, right hrs). Gridlines at `0.55` opacity.
- **Interaction:** invisible full-height hit-columns capture hover; guide line dashed `3 3`; **HTML tooltip overlay** positioned as `%` of the SVG box (`e3`, `border-slate-200 bg-white/95`), not an SVG element.
- **A11y:** every chart `role="img"` + descriptive `aria-label`; legend always present; never color-only (direct labels for the WARN-contrast slot).
- Chart types in scope (per §04): line/area, dual-axis, donut, stacked/grouped bar, funnel, Pareto, waterfall, choropleth, heatmap, sparkline (KPI inline), confidence-band. **Follow the `dataviz` skill before authoring any new chart.**

### 15.16.2 Maps / digital-twin canvas
Live map (RTLS/GPS) + 2D/3D twin (§03 Tracking, §0.6.D). Anatomy: canvas + floating controls (zoom, layer toggles, legend, scope) + right **inspector drawer** (§15.15.3) on selection. Asset markers = semantic status dots/pins with clustering at zoom-out; geofences = tinted polygons (semantic border); trails = fading polylines; heatmap overlay for dwell/utilization. Inspector shows the asset mini-360 (status, health meter, last-seen, quick actions). Mobile → inspector becomes bottom sheet. Freshness stamp always shown (live vs cached).

### 15.16.3 Forms & validation
Layout: single-column (mobile/dialogs) or 2-col label-beside on `lg`; grouped in `glass-panel` sections with section headers; sticky action footer (Cancel · Save) on long forms. Field spec → §15.10. **Validation:** inline, on-blur for format + on-submit for completeness; error text below field (`text-xs text-health-critical`) + `aria-invalid` + `aria-describedby`; summary banner at top listing errors (anchor-linked) on submit failure; success → toast + optimistic update with rollback-on-error. Required marked with `*` + `aria-required` (never color-only). Autosave drafts on long/creation forms (status chip: "Saved · Xs ago").

### 15.16.4 Stepper / wizard
Multi-step flows (onboarding §0.6.A, bulk import, report builder). Horizontal stepper (numbered nodes: done ✓ `health-good` · current `primary-600` ring · upcoming `slate-300`) on desktop; compact "Step n of m" + progress bar on mobile. Anatomy: stepper header → step body → footer (Back · Next/Finish, primary right). Rules: validate-per-step before advance; allow back without data loss; jump only to visited steps; persist progress; summary/review step before commit.

---

## 15.17 Iconography

- **Emoji as functional glyphs** in the current build (nav items, insight types, category avatars — `Sidebar.tsx`, `page.tsx`). Consistent per concept (📦 assets, 🗺️ tracking, 🔧 maintenance, ✨ AI, 🔔 alerts). Acceptable for the demo; **decorative** emoji get `aria-hidden`, meaningful ones get an accessible label.
- **Production direction *(proposed)*:** migrate to a single line-icon set (e.g. Lucide-style, 1.5–2px stroke, 20/24px) for pixel consistency, theming, and a11y — keep the emoji→icon mapping stable so meaning doesn't shift. One icon per concept, platform-wide.
- **Sizing:** 16px inline/dense, 20px default, 24px nav/toolbar. Icon chips (`h-6 w-6 rounded-md bg-slate-100`, active `bg-primary-100`) per sidebar pattern. Icon color follows text color; status icons follow semantic tokens.
- **Never** icon-only for a meaningful action without `aria-label` + tooltip.

---

## 15.18 Content & tone guidelines

Voice: **precise, calm, operator-respecting** — this is a system of record people make consequential decisions in.

| Do | Don't |
|----|-------|
| Plain, specific labels ("Overdue work orders", "Missing 8, Failure risk 4") | Vague ("Stuff needs attention"), jargon-for-jargon's-sake |
| Sentence case for UI text; Title Case only for proper nouns/page titles | ALL CAPS except micro-eyebrows |
| Numbers with units + context ("$245.2M · Depreciated $42.1M") | Bare numbers, ambiguous units |
| Actionable empty/error states with a next step + trace id | Dead-ends, blame ("You did X wrong") |
| AI stated with confidence + driver ("Likely bearing failure · 87% · vibration ↑") | Overclaiming certainty; hiding the "why" |
| Verbs on buttons ("Create work order", "Approve write-off") | Ambiguous ("OK", "Submit" where a real verb fits) |

Time = relative + absolute-on-hover ("3m ago" / tooltip full timestamp). Destructive actions name the target and require confirm. Consistent domain vocabulary (asset, work order, custodian, scope) matching §03. Localizable strings (no concatenation), unit-aware (metric/imperial, currency) per `/admin/localization`.

---

## 15.19 Accessibility (WCAG 2.1 AA)

A **gate**, not a nice-to-have (§0.8 beautify includes a11y sign-off).

| Area | Requirement |
|------|-------------|
| **Contrast** | Text ≥ 4.5:1 (≥3:1 large ≥18.66px/bold ≥24px); UI/graphic boundaries ≥3:1. `slate-900` on `#f6f8fb`/white passes strongly. Verify `primary-600` white-text buttons, and health tokens as text (small `health-warning` amber text on white is borderline → use darker amber or larger/bold). Chart categorical WARN slot → direct labels. |
| **Color independence** | Never color-only: status pills carry dot+text; meters carry number; deltas carry ↑/↓; required carries `*`+attr; validation carries icon+text. |
| **Keyboard** | Everything operable keyboard-only; logical tab order; visible **focus-visible** `ring-2 ring-primary-500`; no traps (except intended modal trap w/ `Esc`); ⌘K + documented shortcuts; skip-to-content link; roving tabindex in menus/tabs/tables. |
| **ARIA / semantics** | Native elements first; `role`/`aria-*` only to fill gaps: dialogs `aria-modal`, tabs `role=tablist/tab/tabpanel`, menus `role=menu`, live regions for toasts/async (`aria-live` polite/assertive, `aria-busy` on loading), charts `role=img`+`aria-label`, sortable headers `aria-sort`, tables with `<caption>`/`scope`. |
| **Forms** | Programmatic `<label>`; errors via `aria-invalid`+`aria-describedby`; group with `fieldset/legend`; instructions before inputs. |
| **Reduced motion** | `prefers-reduced-motion: reduce` → disable transitions, ping/pulse, chart draw-in, autoplay; state change stays instant. |
| **Targets / zoom** | ≥24px targets (≥44px touch); reflow usable at 320px & 400% zoom w/o horizontal scroll (wide tables scroll within their own container only); respect user font scaling. |
| **Media** | Alt text on meaningful images; icon-buttons labeled; decorative emoji `aria-hidden`. |

---

## 15.20 Summary

This document defines Access Genie AI's UI/UX contract: five design principles (enterprise density, clarity, explainable-AI surfacing, consistency, and scope/permission honesty) and a complete foundation layer — color (the sky primary ramp, three-stop health semantics, slate neutrals, and surface tokens transcribed verbatim from the shipped `globals.css`), Inter/Outfit typography, and spacing/radius/elevation/z-index/breakpoint/motion scales — all aligned to the professional **light theme** that replaced the dark-first prototype, with `dark:` retained as a dormant class-based opt-in. It then specs the full component library (buttons, inputs, dense/comfortable tables with sticky headers and bulk actions, KPI tiles, status pills, health meters, tabs, dialogs/drawers, toasts, timelines, the ⌘K command palette, hand-rolled SVG charts, map/twin canvas, forms, and steppers) with anatomy/variants/states, plus the mandatory empty/loading/error/permission/offline states every page must ship. Accessibility (WCAG 2.1 AA), responsive reflow, iconography, and content tone are treated as build gates, so the beautify pass (§0.8) applies one coherent, auditable system end-to-end.
