# 1. Product Vision, Strategy & Roadmap

## 1.1 Vision Statement

> **To make every physical asset on Earth self-aware, self-reporting, and self-optimizing — giving enterprises a single, intelligent source of truth for what they own, where it is, how it's performing, and what to do next.**

Where incumbents digitized the *record* of an asset (Maximo, SAP EAM) or the *location* of an asset (Zebra, Samsara),
Access Genie unifies **record + location + condition + prediction + action** into a living Digital Twin of the enterprise's physical world.

## 1.2 Mission

Give operators, executives, and finance a real-time, AI-driven command center that eliminates asset loss,
prevents failure before it happens, maximizes utilization, and turns asset data into board-level financial decisions —
across millions of assets, thousands of facilities, and any industry.

## 1.3 Product Goals

| Horizon | Goal | Measurable Target |
|--------|------|-------------------|
| Operational | Eliminate "lost asset" write-offs | -90% shrinkage within 12 months of deployment |
| Reliability | Shift maintenance reactive → predictive | 70%+ of work orders AI-generated pre-failure |
| Financial | Optimize capital & utilization | +25% asset utilization; defer 15% of capex via lifecycle extension |
| Compliance | Audit-ready always | 100% chain-of-custody, one-click audit packs |
| Scale | Enterprise-grade | 10M+ assets/tenant, 100k events/sec ingest, <200ms P95 reads |
| Intelligence | Explainable prediction | Every AI score ships with drivers + confidence |

## 1.4 Business Objectives

- Land in **regulated, asset-heavy verticals first** (Healthcare, Airports, Government/Public Safety) where compliance + loss cost is highest and switching from spreadsheets/Maximo is easiest to justify on ROI.
- Sell **outcomes, not modules**: "reduce shrinkage," "cut downtime," "pass audits," priced on assets-under-management + AI tier.
- Build a **platform + marketplace** flywheel: sensors, integrations, industry templates, and AI models from partners.
- Reach **net revenue retention >120%** via land-and-expand (start one facility, grow to enterprise-wide).

## 1.5 Target Customers & Buyers

| Buyer | Cares About | Winning Message |
|-------|-------------|-----------------|
| **CFO / VP Finance** | Capex, depreciation, shrinkage, TCO | "See the real financial state of every asset; defer capex with AI lifecycle extension." |
| **COO / VP Operations** | Uptime, utilization, throughput | "Predict failure, rebalance under/over-used assets, keep operations moving." |
| **CIO / CISO** | Security, integration, compliance | "Multi-tenant, SOC2/ISO27001, SSO/RBAC, open APIs, no data silos." |
| **Facility / Maintenance Director** | Work orders, technicians, parts | "One system for tracking + maintenance + inventory, mobile-first for the field." |
| **Compliance / Risk Officer** | Audit trail, chain of custody, GDPR | "Immutable history, one-click audit packs, evidence for every asset." |

## 1.6 Target Industries (with the hook for each)

| Industry | Primary Pain | Access Genie Hook |
|----------|--------------|-------------------|
| **Healthcare** | Lost/mis-located medical equipment, recalls, biomed compliance | RTLS + Joint Commission-ready audit + recall workflows |
| **Airports** | Ground support equipment (GSE), tools on airside, FOD | UWB/GPS tracking, tool-control, geofenced airside zones |
| **Government / Smart Cities** | Public asset accountability, budgets | Chain-of-custody, transparency reporting, GIS asset maps |
| **Police & Public Safety** | Weapons, evidence, body cams, fleet | Custody logs, tamper alerts, evidence integrity |
| **Manufacturing** | Downtime, tooling, OEE | Predictive maintenance, Digital Twin, OEE analytics |
| **Utilities / Energy** | Distributed field assets, safety | GPS/LoRaWAN field tracking, inspection & compliance |
| **Warehouses / Logistics** | Forklifts, pallets, cold chain | Indoor RTLS, condition monitoring, geofence dwell |
| **Retail** | Shrinkage, in-store equipment | RFID inventory, loss detection |
| **Education** | AV/IT loss across campuses | Check-in/out, campus zones, self-service kiosks |

## 1.7 Key Differentiators vs. Incumbents

| Capability | IBM Maximo | ServiceNow | Zebra MotionWorks | Samsara | SAP/Oracle EAM | **Access Genie** |
|-----------|:---------:|:---------:|:-----------------:|:-------:|:--------------:|:----------------:|
| Deep EAM / work orders | ★★★ | ★★ | ✗ | ★ | ★★★ | ★★★ |
| Native RTLS / indoor tracking | ✗ | ✗ | ★★★ | ★ | ✗ | ★★★ |
| Outdoor GPS / telematics | ✗ | ✗ | ★ | ★★★ | ✗ | ★★★ |
| Native AI/ML (not bolt-on) | ★ | ★★ | ★ | ★★ | ★ | ★★★ |
| Live Digital Twin | ✗ | ★ | ★ | ✗ | ★ | ★★★ |
| Unified event-sourced core | ✗ | ★ | ✗ | ✗ | ✗ | ★★★ |
| AI Copilot / NL search | ✗ | ★★ | ✗ | ★ | ✗ | ★★★ |
| Modern UX / time-to-value | ★ | ★★ | ★ | ★★★ | ★ | ★★★ |
| Multi-industry templates | ★ | ★★ | ★ | ★★ | ★ | ★★★ |

**The wedge:** incumbents force customers to buy Maximo *and* Zebra *and* a BI tool *and* stitch them together.
Access Genie is the **first system where the tracking dot and the maintenance work order and the depreciation line are the same object.**

## 1.8 Unique Selling Points (USPs)

1. **Unified Asset Graph** — record, location, condition, cost, and prediction on one object.
2. **Explainable AI everywhere** — every score exposes drivers + confidence; defensible to auditors and CFOs.
3. **Digital Twin as the home screen** — not a separate CAD tool; the live operational model *is* the UI.
4. **Any-sensor ingestion** — RFID/BLE/UWB/GPS/LoRaWAN/QR/NFC/camera-vision through one IoT gateway abstraction.
5. **Offline-first field ops** — mobile + edge keep working; sync/reconcile automatically.
6. **Industry packs** — pre-built personas, taxonomies, compliance templates per vertical (weeks, not years to deploy).
7. **Programmable platform** — everything in the UI is an API + webhook + event; marketplace-ready.

## 1.9 Challenging the Brief (architect's recommendations)

The brief asks for "asset tracking." Three assumptions worth upgrading:

1. **Don't build another CRUD registry.** The moat is the **event-sourced asset graph + AI**. Recommend investing early in the event store and streaming layer, even before deep UI, because every module (BI, twin, audit, AI) is a projection of it. Retrofitting event sourcing later is a rewrite.
2. **Tracking hardware is a commodity; the abstraction is the product.** Recommend a **vendor-neutral IoT gateway/adapter layer** so we never couple to Zebra/Impinj/Samsara SKUs. This is how we out-flank Zebra (locked to their tags) and Samsara (locked to their hardware).
3. **AI must be explainable and governed from day one.** Regulated buyers (health, gov, police) will reject black-box scores. Recommend a **Model Registry + feature store + explainability service** as core infra, not a future item. This is a differentiator, not overhead.

## 1.10 Roadmap (phased)

| Phase | Theme | Scope |
|-------|-------|-------|
| **P0 – Demo (now)** | Believable vision slice | Frontend-only Next.js demo: Exec dashboard, Registry+360, Live map, Maintenance, AI Insights |
| **P1 – Foundation (0–6mo)** | Core graph + EAM | Asset graph, event store, RBAC/multi-tenant, registry, work orders, QR/barcode, basic dashboards |
| **P2 – Sense (6–12mo)** | Real-time tracking | IoT gateway, RFID/BLE/GPS ingestion, live map, geofencing, alerts, mobile technician app |
| **P3 – Predict (12–18mo)** | AI core | Health score, predictive maintenance, idle/utilization, anomaly/theft detection, model registry |
| **P4 – Twin (18–24mo)** | Digital Twin + BI | Facility twin, simulation, self-serve BI, generative reports, AI Copilot GA |
| **P5 – Platform (24–36mo)** | Ecosystem | Marketplace, industry packs, partner APIs, AR navigation, drone/robot integration, edge AI |

See [18-roadmap.md](./18-roadmap.md) for the full innovation backlog.
