# Access Genie AI — Enterprise Asset Intelligence Platform

A polished, frontend-only investor demo of an **Enterprise Asset Intelligence Platform** — not just asset
tracking. It fuses EAM (work orders, lifecycle, financials), RTLS/IoT tracking, a live Digital Twin, native
**explainable AI**, and embedded BI on top of one asset graph, multi-tenant to the core.

> Positioning: *ServiceNow's workflow engine + IBM Maximo's asset depth + Zebra MotionWorks' RTLS +
> Samsara's IoT/telematics + a native AI/Digital-Twin core* — built as **one object graph**, where the
> tracking dot, the work order, and the depreciation line are the same asset.

## Tech stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript**
- **Tailwind CSS v4** (CSS-based `@theme` tokens) · professional light theme, **indigo** accent
- Hand-rolled SVG charts & facility maps (no chart/map libraries)
- In-session mock data (`src/lib/mock-data.ts`) behind typed accessors — swap-ready for a real API

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Sign in at `/login` with any email + a 4+ character password → MFA → workspace. Use the **top-right avatar**
to switch persona (Super Admin → Technician…) and watch the sidebar adapt by role. Press **⌘K / Ctrl-K**
anywhere for the AI Copilot command palette.

```bash
npm run build    # production build (Turbopack)
```

## What's inside

A believable, clickable slice of the full platform across **12 modules / ~90 pages**:

- **Workspace & Dashboards** — role-personalized home + 8 role dashboards + full-page Copilot
- **Assets** — registry, 360° profile (14 tabs), taxonomy, groups/kits, lifecycle board, bulk import, labels
- **Tracking & IoT** — live SVG facility map, 2D digital twin, geofences, movement/heatmaps, sensors, gateways, telemetry
- **AI Intelligence** — explainable insights, health/risk, predictive, utilization, anomaly/theft, forecasting, model registry, explainability, feedback
- **Maintenance** — work-order board + detail, PM schedules, predictive, scheduling, inspections
- **Inventory** — stock, reorder, procurement/POs, warehouses, suppliers, consumption
- **Operations · Analytics · Alerts · Compliance · Administration · Settings**

## Product blueprint

The full product requirements (vision, personas, IA, dashboards, 300+ feature matrix, page catalog, AI modules,
tracking tech, architecture, database, APIs, mobile, design system, security, reporting, roadmap, user flows,
and the phased implementation plan) live in [`docs/`](./docs/README.md) — **21 documents**, starting with
[`docs/00-master-blueprint.md`](./docs/00-master-blueprint.md).

## Project structure

```
src/
  app/(auth)/     # shell-less auth screens (login, mfa, forgot-password)
  app/(app)/      # authenticated app (shell-wrapped) — all modules
  components/     # layout shell, providers (session/scope/theme/command/toast), ui primitives, charts
  lib/            # mock-data, rbac, nav-config, utils
  types/          # domain + platform types
docs/             # the product blueprint / PRD (21 docs)
```

> This is a design/demo build: authentication is simulated and all data is in-session mock data.
