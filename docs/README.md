# Access Genie AI — Enterprise Asset Intelligence Platform

**Product Blueprint & Product Requirements Document (PRD)**
Version 2.0 · Owner: Product Architecture · Status: Planning (blueprint complete — 24 documents)

> **Start here:** [00-master-blueprint.md](./00-master-blueprint.md) is the control document — it defines every
> section, the coverage matrix (all 18 deliverables proven covered), the full page inventory (login → every
> page), the coverage self-check, and the plan→build→beautify sequencing.

---

## What this is

Access Genie AI is an **Enterprise Asset Intelligence Platform** — not an asset tracking app. It fuses
EAM (Enterprise Asset Management), RTLS/IoT tracking, a live Digital Twin, predictive AI, and embedded BI
into one system designed to manage **millions of assets across many organizations, facilities, and industries**.

Positioning shorthand:

> **ServiceNow's workflow engine + IBM Maximo's asset depth + Zebra MotionWorks' RTLS + Samsara's IoT/telematics + a native AI/Digital-Twin core.**

The differentiator is not "we also do X." It is that tracking telemetry, maintenance workflow, financials, and
AI prediction share **one asset graph and one event stream**, so every module reasons over the same live truth.
Incumbents bolt these together across acquired products; Access Genie is built on a unified event-sourced core.

## How to read this blueprint

| # | Section | File |
|---|---------|------|
| 0 | **Master Blueprint** — section map, coverage matrix, page inventory, build order | [00-master-blueprint.md](./00-master-blueprint.md) |
| 1 | Product Vision, Strategy & Roadmap | [01-product-vision.md](./01-product-vision.md) |
| 2 | User Personas, Roles & RBAC | [02-personas.md](./02-personas.md) |
| 3 | Information Architecture & Navigation | [03-information-architecture.md](./03-information-architecture.md) |
| 4 | Dashboard Planning (8 role dashboards) | [04-dashboards.md](./04-dashboards.md) |
| 5 | Complete Feature Matrix (300+) | [05-feature-matrix.md](./05-feature-matrix.md) |
| 6 | Page Catalog (purpose, states, permissions) | [06-page-catalog.md](./06-page-catalog.md) |
| 7 | Asset Lifecycle (cradle-to-grave) | [07-asset-lifecycle.md](./07-asset-lifecycle.md) |
| 8 | AI & Intelligence Modules | [08-ai-intelligence.md](./08-ai-intelligence.md) |
| 9 | Tracking Technologies (RFID/BLE/UWB/GPS…) | [09-tracking-technologies.md](./09-tracking-technologies.md) |
| 10 | Asset 360° Profile | [10-asset-360-profile.md](./10-asset-360-profile.md) |
| 11 | Enterprise Technical Architecture | [11-technical-architecture.md](./11-technical-architecture.md) |
| 12 | Database & Data Model Design | [12-database-design.md](./12-database-design.md) |
| 13 | API Design (REST/GraphQL/streaming) | [13-api-design.md](./13-api-design.md) |
| 14 | Mobile & Edge Applications | [14-mobile-apps.md](./14-mobile-apps.md) |
| 15 | UI/UX & Design System | [15-design-system.md](./15-design-system.md) |
| 16 | Security, Identity & Compliance | [16-security-compliance.md](./16-security-compliance.md) |
| 17 | Reporting & Business Intelligence | [17-reporting-bi.md](./17-reporting-bi.md) |
| 18 | Future Enhancements & Innovation | [18-roadmap.md](./18-roadmap.md) |
| 19 | Key User Flows (login → disposal, 10 flows) | [19-user-flows.md](./19-user-flows.md) |
| 20 | Implementation Plan (plan → build → beautify) | [20-implementation-plan.md](./20-implementation-plan.md) |
| 21 | Asset Onboarding — UX architecture & flow redesign | [21-asset-onboarding-ux.md](./21-asset-onboarding-ux.md) |
| 22 | Navigation & Information Architecture — the Assets pillar | [22-navigation-ia.md](./22-navigation-ia.md) |
| 23 | Real-Time Tracking — product architecture & functional spec | [23-realtime-tracking-architecture.md](./23-realtime-tracking-architecture.md) |

## The demo build (parallel track)

This blueprint is the **north-star product**. The near-term deliverable is a **polished, frontend-only investor
demo** (Next.js 16, custom SVG charts/maps, in-session mock CRUD) that renders a believable *slice* of this vision:
Executive Dashboard, Asset Registry + 360° detail, Live Tracking map, Maintenance, and AI Insights.
The demo is scoped so every pixel maps back to a real section here — investors see the vision, engineers see the plan.

## Guiding principles

1. **One asset graph, one event stream.** Every module is a projection over the same event-sourced core.
2. **AI is native, not a plugin.** Health, risk, and prediction scores are first-class columns, not an add-on tab.
3. **Multi-tenant to the bone.** Org → Facility → Building → Zone isolation is enforced at the data layer, not the UI.
4. **Offline-first at the edge.** Scanners, gateways, and mobile keep working when the network doesn't.
5. **Open by default.** Every capability in the UI is available via API and webhook — the platform is programmable.
6. **Explainable AI.** Every score shows its drivers; no black-box numbers in front of an auditor or a CFO.
