# 18. Future Enhancements & Innovation

**Document type:** Innovation backlog & long-range roadmap
**Reconciles with:** [01-product-vision.md](./01-product-vision.md) §1.10 (P0–P5) · **Extends to:** P6+ (36mo+)
**Depends on:** [08-ai-intelligence.md](./08-ai-intelligence.md) · [11-technical-architecture.md](./11-technical-architecture.md)

> This is the **innovation backlog** — the ideas beyond the committed feature matrix ([05](./05-feature-matrix.md)).
> It reconciles to the phased roadmap in [01 §1.10](./01-product-vision.md), then extends it with a **P6+** horizon.
> House rule for this doc: **every idea earns its place or gets challenged.** Where an innovation is hype
> (blockchain, we're looking at you), we say so and route the *real* requirement to the boring solution that works.
> Nothing here is a home-screen feature until it has a home in the coverage matrix ([00 §0.9](./00-master-blueprint.md)).

---

## 18.1 How this reconciles with the P0–P5 roadmap

Doc 01 §1.10 commits the platform through **P5 – Platform (24–36mo)**. That roadmap already *seeds* several
innovations here (Digital Twin at P4; AR/drone/robot/edge at P5). This document does three things:

1. **Deepens** each seeded item into a real spec (the twin is not one feature — it's a 4-step ladder).
2. **Adds** items the base roadmap under-scopes (Sustainability/ESG, Edge AI as a tier, developer ecosystem).
3. **Extends** the horizon with **P6+ (36mo+)** — the autonomous/agentic frontier — and honestly sorts
   **near-term bets** from **moonshots**.

| Base roadmap phase (from 01 §1.10) | What it already promises | This doc's extension |
|-----------------------------------|--------------------------|----------------------|
| **P4 – Twin (18–24mo)** | Facility twin, simulation, AI Copilot GA, gen-reports | 3D twin, real-time state sync, what-if engine, LLM Copilot **agentic** GA |
| **P5 – Platform (24–36mo)** | Marketplace, industry packs, partner APIs, AR nav, drone/robot, edge AI | Full IoT Marketplace + app store, drone cycle-counts, AMR fleet integration, Edge AI tier |
| **P6+ – Autonomous (36mo+)** *(NEW)* | — | BIM/CAD twin, autonomous inventory, predictive operations (self-scheduling), ESG optimization, agentic ops |

---

## 18.2 Innovation catalog

Each innovation follows one spec block: **Description · Why it matters (business value) · Dependencies ·
Target phase · Differentiation vs incumbents · Risks.** Priority uses the doc-05 scale (●●● must / ●● should
/ ● could / ○ bet). Confidence is our internal read, not marketing.

---

### 18.2.1 Digital Twin — the 2D→3D→BIM/CAD ladder

The twin is Access Genie's **home screen thesis** ([01 §1.8 USP #3](./01-product-vision.md)): the live
operational model *is* the UI, not a separate CAD tool. It matures in four rungs, not one leap.

| Rung | Capability | Phase | Priority |
|------|-----------|-------|----------|
| 1 | **2D floor-plan overlay** — assets as live dots on an SVG/raster plan, zone-aware | P3→P4 | ●●● |
| 2 | **3D facility/building twin** — extruded floors, WebGL, walk-through, occupancy heat | P4 | ●● |
| 3 | **Real-time state sync** — twin reflects event stream <2s: location, health color, WO status | P4 | ●● |
| 4 | **BIM/CAD import + simulation/what-if** — IFC/Revit/DWG ingest, scenario modeling | P5→P6+ | ● |

| Field | Detail |
|-------|--------|
| **Description** | A geospatially/architecturally accurate, live-synced model of each facility where every asset is a clickable object carrying its full 360° graph. Rung 4 imports **BIM (IFC/Revit)** and **CAD (DWG/DXF)** so the twin aligns to real building geometry, and runs **what-if simulations** (relocate a fleet, close a zone, fail a chiller — see the utilization/energy/SLA impact before acting). |
| **Why it matters** | Turns asset data from a table into a *spatial decision surface*. Operators find assets by looking; planners test moves before spending capex; the twin becomes the artifact executives demo. Directly serves +25% utilization and 15% capex-deferral goals ([01 §1.3](./01-product-vision.md)). |
| **Dependencies** | Event-sourced graph + streaming projection ([11](./11-technical-architecture.md)); RTLS location fusion ([09](./09-tracking-technologies.md)); WebGL render pipeline; IFC/DWG parser (rung 4); simulation engine (shares infra with AI forecasting, [08](./08-ai-intelligence.md) feat. 51–52). |
| **Target phase** | Rung 1–3: **P4**. Rung 4 (BIM/CAD + what-if): **P5→P6+**. |
| **Differentiation** | Maximo/SAP have no live twin; Zebra/Samsara show dots on a flat map, not a synced architectural model with the work-order and depreciation attached. **We're the only one where the twin object *is* the asset graph**, not a visualization bolted onto a separate system. |
| **Risks** | BIM import is a swamp — IFC quality varies wildly; customers rarely have clean models. Mitigate: 2D-first, treat 3D/BIM as *progressive enhancement*, never a gate. WebGL perf at 10M assets needs LOD/culling. Simulation credibility depends on model fidelity — over-promising "digital twin" invites disappointment. |

---

### 18.2.2 Drone tracking & drone-based cycle counts

| Field | Detail |
|-------|--------|
| **Description** | Two things: (a) **tracking drones as assets** (fleet, battery, flight-hours, maintenance — they're high-value mobile assets); (b) **drones as sensors** — autonomous indoor/yard flights that scan RFID/barcode/visual tags to perform **cycle counts** and locate assets in large warehouses, yards, and lay-down areas. |
| **Why it matters** | Physical inventory audits are the single most labor-intensive, error-prone chore in asset ops. A drone counting a 200k-SKU warehouse overnight collapses a multi-day manual count into hours and feeds the immutable audit log ([11 Compliance](./00-master-blueprint.md)). High-ROI in warehouses, airports (airside GSE), and utilities yards. |
| **Dependencies** | IoT gateway ingestion of drone-borne readers ([09](./09-tracking-technologies.md)); cycle-count workflow (05 feat. 86, 147–148); computer-vision tag/asset detection (05 feat. 37, 61); geofenced flight zones; edge inference for on-drone reads (see 18.2.9). |
| **Target phase** | Drone-as-asset tracking: **P5**. Drone cycle-counts (pilot): **P5→P6+**. |
| **Differentiation** | Incumbents treat drones as a partner integration at best. We ingest drone reads through the **same vendor-neutral gateway** as any sensor, so a drone count and a handheld count reconcile against one graph. No EAM vendor does autonomous count natively. |
| **Risks** | Regulatory (indoor/outdoor flight rules, BVLOS), safety, and hardware immaturity make this **capex-heavy and vertical-specific**. Read-accuracy of airborne RFID is unproven at scale. Positioned as a **partner-hardware play** (we're the software brain), not an Access Genie drone SKU. Moonshot economics until drone autonomy commoditizes. |

---

### 18.2.3 Robot / AMR integration

| Field | Detail |
|-------|--------|
| **Description** | Integrate **Autonomous Mobile Robots** (and AGVs) as both tracked assets and mobile data-collection/actuation nodes: robots that scan shelves, move assets between zones, execute inspection routes, and stream telemetry back to the graph. Bi-directional — Access Genie can *task* an AMR fleet (via MQTT/VDA5050) and consume its sensor payload. |
| **Why it matters** | Extends "self-optimizing assets" ([01 §1.1](./01-product-vision.md)) into physical action. In manufacturing/warehousing, closing the loop from *AI detects idle/misplaced asset* → *dispatch AMR to relocate* is the autonomous-operations endgame. Utilization rebalancing (05 feat. 48) becomes executable, not just advisory. |
| **Dependencies** | Predictive Operations engine (18.2.7); AMR standards adapters (**VDA5050**, MQTT); IoT gateway; Copilot agentic actions (18.2.6) to authorize/dispatch; scope-secure task authorization ([16](./00-master-blueprint.md)). |
| **Target phase** | Telemetry ingestion + robot-as-asset: **P5**. Task/dispatch loop: **P6+**. |
| **Differentiation** | We're a **fleet-agnostic orchestration layer** across mixed-vendor AMRs, not locked to one robot OEM's WMS. The asset graph is the shared world-model robots and humans both act on. Maximo/ServiceNow have no native robotics loop. |
| **Risks** | Deep integration complexity, safety-criticality, and OEM lock-in resistance. Standards (VDA5050) are young. Real value only in a handful of heavily-automated sites — **near-term bet for logistics/manufacturing, not general availability.** |

---

### 18.2.4 AR asset navigation & find-my-asset

| Field | Detail |
|-------|--------|
| **Description** | Phone/tablet (and later headset) **augmented-reality wayfinding**: point the camera, get an on-screen arrow/path to the asset; overlay live health, WO status, and manuals on the physical asset in view. "Find my asset" for the warehouse floor. |
| **Why it matters** | Kills the #1 field-tech time-sink: *walking around looking for the thing*. Overlaying the 360° profile in-situ (05 feat. 200) turns every tech into an expert. High delight, strong demo, real minutes-per-task savings across healthcare (find the infusion pump) and airports (find the GSE). |
| **Dependencies** | RTLS location accuracy (UWB/BLE fusion, [09](./09-tracking-technologies.md)); indoor wayfinding graph (05 feat. 28); mobile AR frameworks (ARKit/ARCore) or WebXR; twin geometry (18.2.1) for path-finding; asset 360° API ([10](./00-master-blueprint.md)). |
| **Target phase** | **P5**. Headset/spatial-computing variant: **P6+**. |
| **Differentiation** | Zebra has rudimentary directional finding tied to their tags; nobody overlays the *full asset graph + work order + AI health* in AR. Vendor-neutral RTLS means AR works regardless of tag vendor. |
| **Risks** | AR accuracy is only as good as RTLS accuracy — sub-meter needs UWB, which not every site deploys. Headset ergonomics/adoption still weak. Ship **phone-AR first**; treat headsets as optional. Novelty risk: must save real time, not just look cool. |

---

### 18.2.5 Voice assistant / voice-to-work-order

| Field | Detail |
|-------|--------|
| **Description** | Hands-free field interaction: **voice-to-WO** ("create a work order on pump 12, bearing noise, high priority"), voice queries ("what's the health of chiller 3?"), and voice-driven checklist completion. Speech → intent → structured action against the graph, with confirmation. |
| **Why it matters** | Field techs wear gloves, climb ladders, work in dirty/loud environments — typing is the enemy. Voice capture at the point of observation improves data completeness and speed (05 feat. 192, 301). Accessibility win too. |
| **Dependencies** | LLM Copilot intent layer (18.2.6); mobile mic/ASR (on-device where possible for noise/latency); domain grammar over taxonomy ([07](./00-master-blueprint.md)); Edge AI (18.2.9) for offline/noisy sites. Uses Anthropic Claude for intent + slot-filling per [08](./08-ai-intelligence.md). |
| **Target phase** | **P4** (rides the Copilot GA wave). |
| **Differentiation** | It's the **same agentic Copilot brain** as the ⌘K command bar, just voice-fronted — not a bolted-on Alexa skill. Legacy EAM has nothing comparable; Samsara's voice is telematics-only. |
| **Risks** | ASR accuracy in industrial noise is the make-or-break; mis-transcribed WOs erode trust fast. Mitigate with confirm-before-commit, constrained grammars, and on-device ASR. Multilingual field workforces add cost. **Near-term bet, but scoped narrowly (WO + query) before open-ended voice.** |

---

### 18.2.6 Generative AI & LLM Copilot GA (agentic)

| Field | Detail |
|-------|--------|
| **Description** | Graduate the Copilot from **assist** (answer, summarize, draft) to **agentic** (navigate, filter, create, and *act* across modules, with approvals): "Reschedule all PMs on Line 4 around next week's shutdown and notify the techs" → the Copilot plans, previews, and — on confirm — executes multi-step actions. Includes generative reports/narratives (05 feat. 55, 140, 287, 300) and per-asset chat. |
| **Why it matters** | This is the **time-to-value differentiator** ([00 §0.10 #5](./00-master-blueprint.md)) — beating legacy UIs by letting anyone command the system in natural language. Compresses training, unlocks the long tail of features nobody clicks to, and makes the platform feel alive. |
| **Dependencies** | Model registry + explainability service ([08](./08-ai-intelligence.md)); tool/function-calling over the public API ([13](./00-master-blueprint.md)); scope-secure action authorization + audit ([16](./00-master-blueprint.md)); Claude (Anthropic) as the reasoning model per [08](./08-ai-intelligence.md). **Agentic actions MUST route through the same RBAC/ABAC and audit log as human actions — no shadow path.** |
| **Target phase** | Assist GA: **P4**. Agentic (act-with-approval) GA: **P4→P5**. Multi-step autonomous (18.2.7): **P6+**. |
| **Differentiation** | ServiceNow has an assistant; nobody has an agent that operates over a **unified event-sourced asset graph** with explainability on every action. Our answers cite drivers + confidence — defensible to auditors, which black-box copilots can't offer. |
| **Risks** | Agentic actions that mutate data are **high-blast-radius**: hallucinated or over-broad actions must be impossible to commit without preview + scoped authorization. Cost/latency of large contexts; prompt-injection from ingested docs. Governance (who approved what the agent did) is a first-class requirement, not an afterthought. |

---

### 18.2.7 Predictive Operations — autonomous scheduling & rebalancing

| Field | Detail |
|-------|--------|
| **Description** | The step beyond *predict*: the system doesn't just forecast failure and flag idle assets — it **autonomously proposes and (with policy) enacts** the response. Self-scheduling maintenance around production windows, auto-rebalancing under/over-utilized assets across facilities, predictive staffing/parts pre-staging (05 feat. 293, 302). Closed-loop optimization. |
| **Why it matters** | Converts AI insight into AI *operation*. This is where "self-optimizing" ([01 §1.1](./01-product-vision.md)) becomes literal and where the ROI compounds — fewer dispatchers, less downtime, optimal capital use with no human in the scheduling loop for routine cases. |
| **Dependencies** | Mature AI core (health, RUL, utilization, forecasting — all P3, [08](./08-ai-intelligence.md)); constraint/optimization solver; agentic Copilot action layer (18.2.6); policy engine (what can auto-enact vs. needs approval); AMR loop (18.2.3) for physical rebalancing. |
| **Target phase** | Recommend-only: **P4**. Approve-to-enact: **P5**. Autonomous (policy-bounded): **P6+**. |
| **Differentiation** | Incumbents stop at "here's a predicted failure." We close the loop to "it's scheduled, parts staged, tech assigned, twin updated." Only possible because record + location + condition + prediction + action are **one object** ([01 §1.7](./01-product-vision.md)). |
| **Risks** | Autonomy without trust fails — customers won't cede scheduling until the predictions have earned credibility (needs P3 track record first). Optimization can produce locally-correct, globally-dumb moves; needs guardrails + explainability. Change-management/union/labor sensitivity around "the AI scheduled me." **Deliberately gated behind proven prediction accuracy.** |

---

### 18.2.8 IoT Marketplace & industry packs

| Field | Detail |
|-------|--------|
| **Description** | A **marketplace** of certified sensor/gateway adapters, ERP/ITSM connectors, and **industry packs** (pre-built personas, taxonomies, compliance templates, dashboards per vertical — healthcare, airports, gov, police, etc., per [01 §1.6](./01-product-vision.md)). One-click install; partner-published; revenue-shared. |
| **Why it matters** | The **flywheel** ([01 §1.4](./01-product-vision.md)): more adapters/packs → faster deployments (weeks not years, USP #6) → more customers → more partners. Industry packs are the moat against "generic EAM." Marketplace turns integration cost into partner-funded surface area. |
| **Dependencies** | IoT gateway/adapter SDK ([09](./09-tracking-technologies.md), [11](./00-master-blueprint.md)); public API + webhooks ([13](./00-master-blueprint.md)); developer portal (18.2.13); template/config export (05 feat. 235, 167); certification/security review pipeline. |
| **Target phase** | Industry packs (first-party): **P4**. Marketplace (partner-published): **P5**. |
| **Differentiation** | Because the gateway is **vendor-neutral** ([00 §0.10 #2](./00-master-blueprint.md)), our marketplace can list *any* sensor vendor — Zebra can't (locked tags), Samsara can't (locked hardware). Maximo's ecosystem is heavyweight SI work; ours is install-and-go packs. |
| **Risks** | Chicken-and-egg (no partners without customers, vice versa) — seed with strong first-party packs. Marketplace quality/security governance is real ongoing cost. Revenue-share economics unproven at our stage. **Near-term for first-party packs; marketplace is a P5 bet.** |

---

### 18.2.9 Edge AI — local inference & alerting

| Field | Detail |
|-------|--------|
| **Description** | Push inference to the **edge** — gateways, on-prem appliances, and mobile — so anomaly/geofence/tamper detection and voice/vision run **locally**, with low latency and offline resilience (05 feat. 36). Cloud trains and orchestrates; edge scores and alerts in real time. |
| **Why it matters** | Serves the offline-first non-negotiable ([00 §0.4 #5](./00-master-blueprint.md)): sites with poor connectivity (utilities field, airside, remote yards) still get real-time safety/security alerts. Cuts bandwidth/cloud cost at 100k events/sec scale ([01 §1.3](./01-product-vision.md)) and shrinks alert latency to sub-second. |
| **Dependencies** | Model registry with edge-deployable artifacts (quantized/distilled models, [08](./08-ai-intelligence.md)); edge runtime on gateway hardware; OTA model/firmware updates (05 feat. 34); sync/reconcile with cloud graph ([14](./00-master-blueprint.md)). |
| **Target phase** | Edge rules engine (simple thresholds local): **P5**. Edge ML inference tier: **P5→P6+**. |
| **Differentiation** | Samsara does edge on *their* hardware only. Our edge tier is **hardware-neutral** — the same model registry deploys to any certified gateway. No EAM vendor does edge ML at all. |
| **Risks** | Edge fleet management (versioning, drift, security patching across thousands of devices) is genuinely hard. Model performance degrades on constrained hardware; need distillation discipline. Security surface expands (each edge node is an attack point). **Start with deterministic edge rules; earn ML edge.** |

---

### 18.2.10 Autonomous Inventory (robots + drones)

| Field | Detail |
|-------|--------|
| **Description** | The convergence play: **robots + drones + edge vision** performing continuous, unattended **inventory and cycle-counting** — the warehouse counts itself, the yard audits itself, discrepancies auto-open reconciliation tasks and feed the immutable audit log. |
| **Why it matters** | Eliminates the largest recurring manual-labor line in asset ops and drives the -90% shrinkage and 100% chain-of-custody goals ([01 §1.3](./01-product-vision.md)) with near-zero human effort. The definition of "self-reporting assets." |
| **Dependencies** | Drone cycle-counts (18.2.2) + AMR integration (18.2.3) + Edge AI vision (18.2.9) + cycle-count/audit workflows (05 feat. 86, 147–150) + Predictive Ops for auto-reconciliation (18.2.7). This is a **composite** of several P5 capabilities. |
| **Target phase** | **P6+** (depends on its prerequisites maturing). |
| **Differentiation** | No incumbent offers autonomous physical inventory as a native platform capability — it's the ultimate expression of "the tracking dot and the audit record are the same object." |
| **Risks** | Highest hardware/capex dependency of anything here; only justifiable at very large single-site scale. Stacks the risks of drones + robots + edge vision — **classic moonshot.** Gate hard on ROI; never lead a deal with it. |

---

### 18.2.11 Sustainability / ESG & energy optimization

| Field | Detail |
|-------|--------|
| **Description** | Treat **energy, carbon, and lifecycle-extension** as first-class asset metrics: per-asset energy/emissions tracking, **energy-optimization insights** (05 feat. 303), Scope-1/2 (and asset-attributable Scope-3) reporting, and lifecycle-extension recommendations reframed as **carbon-avoidance** (refurbish/redeploy vs. buy-new). ESG audit packs alongside compliance packs. |
| **Why it matters** | ESG reporting is becoming **regulatory-mandatory** (CSRD/SEC climate rules) — a buying trigger, not a nice-to-have. We already compute utilization, EOL, and lease-vs-buy; extending those to carbon is low marginal cost, high board-level value. Ties directly to the CFO capex-deferral message ([01 §1.5](./01-product-vision.md)) — extending an asset's life *is* an ESG win. |
| **Dependencies** | Telemetry (energy sub-metering) via IoT gateway ([09](./09-tracking-technologies.md)); financial/lifecycle engines ([05 M7–M8](./05-feature-matrix.md)); AI optimization ([08](./08-ai-intelligence.md)); compliance/reporting rails ([17](./00-master-blueprint.md)) — mostly **reuse, not new infra.** |
| **Target phase** | Energy tracking + ESG reports: **P4→P5**. Active energy optimization: **P5→P6+**. |
| **Differentiation** | EAM vendors bolt on ESG as a separate module; we derive it from the **same asset graph** that already knows utilization, condition, and lifecycle — carbon is just another projection. Genuinely defensible, genuinely near-term. |
| **Risks** | Emissions-factor data quality and methodology credibility (greenwashing exposure if numbers are soft). Regulatory frameworks still shifting. Manageable — this is one of the **lowest-risk, highest-strategic-fit** items here. |

---

### 18.2.12 Blockchain / immutable chain-of-custody — *challenged*

> **Honest evaluation: mostly hype for this use case. We are skeptical by default.**

| Field | Detail |
|-------|--------|
| **Description** | The pitch: put chain-of-custody / audit trail on a distributed ledger for "tamper-proof, trustless" asset provenance. |
| **Why it *might* matter** | Two narrow cases have real merit: (1) **cross-organizational** custody where no party trusts a central operator (multi-agency evidence, defense supply chain, regulated pharma cold-chain across companies); (2) customers who contractually demand cryptographic, third-party-verifiable immutability. |
| **The honest challenge** | For the **99% single-tenant case, blockchain solves a problem we don't have.** Our requirement is *immutability + verifiable audit*, and that's already met by an **append-only, cryptographically-hashed, WORM-stored audit log** ([05 feat. 150](./05-feature-matrix.md), [16](./00-master-blueprint.md)) — Merkle-chained hashes, notarized to a trusted timestamp authority, at a fraction of the cost/complexity, with no consensus latency, no key-management nightmare, and no "who runs the nodes" question. Blockchain adds throughput limits, cost, and operational complexity to buy a trust property (trustlessness) that a **single-tenant SaaS with one operator does not need.** |
| **Dependencies (if pursued)** | Existing immutable audit log (do this regardless); optional anchoring of periodic Merkle roots to a public chain for *external verifiability without running a chain ourselves*. |
| **Target phase** | Merkle-hashed audit log: **P1 (already committed).** Optional public-root anchoring: **P5, opt-in.** Full on-chain custody: **not planned** unless a specific cross-org, multi-party, regulator-driven deal requires it. |
| **Differentiation** | Ironically, *not* chasing blockchain is a differentiator — we deliver the immutability outcome buyers actually want without the buzzword tax. If a deal genuinely needs cross-org trustlessness, we can anchor roots on-chain **without** rearchitecting onto a ledger. |
| **Risks** | The real risk is **building it for hype and inheriting its costs.** Reputational risk cuts both ways — some buyers ask for "blockchain" by name; we lead with the outcome (cryptographic immutability) and offer anchoring as the compromise. **Verdict: near-term = boring hashed audit log; blockchain proper = only on a named, justified requirement.** |

---

### 18.2.13 Partner / developer ecosystem & app store

| Field | Detail |
|-------|--------|
| **Description** | The **programmable-platform** promise ([01 §1.8 USP #7](./01-product-vision.md)) made real: a developer portal, SDKs, sandbox tenants, an **app store** where partners publish embedded apps/widgets/workflows/AI models that run inside Access Genie, plus revenue sharing. The marketplace (18.2.8) sells connectors/packs; the app store sells *behavior*. |
| **Why it matters** | Ecosystems are how platforms out-compound point products. Third-party apps cover the long-tail verticals/workflows we'll never build first-party, and partner-built AI models (05 feat. 179, [01 §1.4](./01-product-vision.md)) extend the intelligence layer. This is the difference between a product and a platform. |
| **Dependencies** | Public REST/GraphQL + streaming API + webhooks ([13](./00-master-blueprint.md)); developer portal + API keys/rate limits (05 feat. 180); sandbox/demo tenants (05 feat. 238); extension/embedding runtime with scoped permissions ([16](./00-master-blueprint.md)); app certification + security-review pipeline. |
| **Target phase** | Developer portal + public API: **P1–P2 (foundational).** App store (embedded apps): **P5→P6+.** |
| **Differentiation** | ServiceNow's app ecosystem is the incumbent model we emulate — but on a **modern, event-sourced, AI-native core** with far lower time-to-value. Maximo/SAP ecosystems are SI-heavy; ours is self-serve developer-first. |
| **Risks** | Ecosystem programs are a **long, expensive investment** with delayed payoff and real governance/security burden (third-party code in a multi-tenant platform). Sequencing matters — nail the first-party product and API before courting developers, or the store is empty. |

---

## 18.3 Phased timeline (P4 / P5 / P6+)

Reconciles to [01 §1.10](./01-product-vision.md); everything below extends its P4/P5 and adds **P6+**.
Priority: ●●● must · ●● should · ● could · ○ moonshot bet. Confidence: our delivery/ROI conviction.

| Innovation | P4 (18–24mo) | P5 (24–36mo) | P6+ (36mo+) | Priority | Confidence |
|-----------|:---:|:---:|:---:|:---:|:---:|
| Digital Twin 2D→3D + real-time sync | ● Build | ▸ Refine | — | ●● | High |
| Digital Twin BIM/CAD import + what-if | — | ● Pilot | ▸ GA | ● | Medium |
| LLM Copilot GA — assist | ● GA | — | — | ●●● | High |
| LLM Copilot — agentic (act w/ approval) | ● Beta | ▸ GA | — | ●●● | Med-High |
| Voice assistant / voice-to-WO | ● Build | ▸ GA | — | ●● | Medium |
| Generative reports & narratives | ● GA | — | — | ●● | High |
| Sustainability / ESG reporting | ● Build | ▸ GA | — | ●● | High |
| Energy optimization (active) | — | ● Build | ▸ GA | ● | Medium |
| Predictive Ops — recommend | ● GA | — | — | ●● | High |
| Predictive Ops — approve-to-enact | — | ● Build | — | ●● | Medium |
| Predictive Ops — autonomous | — | — | ○ Pilot | ● | Low |
| IoT Marketplace — first-party packs | ● Build | ▸ GA | — | ●● | High |
| IoT Marketplace — partner-published | — | ● Launch | ▸ Grow | ● | Medium |
| AR asset navigation (phone) | — | ● Build | ▸ Refine | ● | Medium |
| AR (headset / spatial) | — | — | ○ Pilot | ○ | Low |
| Edge AI — rules engine | — | ● Build | — | ●● | Med-High |
| Edge AI — ML inference tier | — | ● Pilot | ▸ GA | ● | Medium |
| Drone-as-asset tracking | — | ● Build | — | ● | Medium |
| Drone-based cycle counts | — | ● Pilot | ▸ Scale | ● | Low-Med |
| Robot / AMR — telemetry ingest | — | ● Build | — | ● | Medium |
| Robot / AMR — task/dispatch loop | — | — | ○ Pilot | ● | Low |
| Autonomous Inventory (robots+drones) | — | — | ○ Pilot | ○ | Low |
| Developer portal + public API | ▸ (P1–P2 base) | ▸ Harden | — | ●●● | High |
| App store (embedded apps) | — | ● Build | ▸ Launch | ● | Medium |
| Blockchain custody | — | ○ Anchor-only (opt-in) | ✗ Not planned | ○ | Low (by choice) |

Legend: ● primary phase · ▸ continues/matures · ○ speculative bet · ✗ deliberately deprioritized · — not in phase.

---

## 18.4 Moonshots vs. near-term bets

The portfolio splits into three tiers. Fund the near-term; time-box the mid-term; keep moonshots as
**lighthouse demos and R&D**, never as deal-gating commitments.

| Tier | Definition | Items |
|------|-----------|-------|
| **Near-term bets (P4–P5, high confidence)** | Extend existing infra, clear ROI, defensible today. **Fund now.** | Digital Twin 2D/3D + sync · Copilot GA (assist→agentic) · Voice-to-WO · Generative reports · **Sustainability/ESG** · Predictive Ops (recommend→approve) · First-party industry packs · Edge rules engine · Developer portal/API |
| **Mid-term bets (P5–P6+, medium confidence)** | Real value, real dependencies/immaturity. **Time-box, pilot, prove ROI before scaling.** | BIM/CAD twin + what-if · Partner marketplace · App store · Phone-AR navigation · Edge ML inference · Drone-as-asset · AMR telemetry · Energy optimization · Predictive Ops (approve-to-enact) |
| **Moonshots (P6+, low confidence / hardware-bound)** | Frontier; hardware/regulatory/capital-heavy or trust-gated. **R&D + lighthouse only.** | Autonomous Inventory · Drone cycle-counts at scale · AMR task/dispatch loop · Autonomous Predictive Ops · AR headsets/spatial computing |
| **Challenged / deprioritized** | Hype exceeds value for our use case. **Solve the real need the boring way.** | Blockchain custody → *use Merkle-hashed WORM audit log; anchor roots on-chain only if a cross-org deal demands it* |

**Guiding heuristics for adding anything to this list:**

1. **Does it project from the asset graph?** If value derives from record+location+condition+prediction being
   *one object* ([01 §1.7](./01-product-vision.md)), it's on-thesis (ESG, twin, predictive ops). If it needs a
   parallel system, be suspicious.
2. **Software-heavy beats hardware-heavy.** We're the brain; partners bring drones/robots. Never ship an
   Access Genie SKU of someone else's commodity hardware.
3. **Explainable & governed, or it doesn't ship.** Every agentic/autonomous capability routes through the same
   RBAC/audit/explainability as a human ([00 §0.10 #3](./00-master-blueprint.md)) — no shadow paths.
4. **Earn autonomy with accuracy.** Autonomous action (18.2.7, 18.2.10) is gated behind a proven P3 prediction
   track record. Trust is the prerequisite, not the launch feature.
5. **Name the hype.** If an idea's appeal is a buzzword (blockchain), state the real requirement and route it to
   the solution that actually works.

---

## 18.5 Coverage & cross-links

Every innovation here has a home in the module/feature matrix — no orphan features ([00 §0.9](./00-master-blueprint.md)):

| Innovation | Module (00 §0.5) | Feature refs (05) | Deep spec |
|-----------|------------------|-------------------|-----------|
| Digital Twin ladder | M15 | 23, 194–201 | [08](./08-ai-intelligence.md) sim · [11](./11-technical-architecture.md) render |
| Drone tracking / cycle-counts | M2, M11 | 37, 86, 147–148 | [09](./09-tracking-technologies.md) |
| Robot / AMR | M2, M13 | 174 | [11](./11-technical-architecture.md) |
| AR navigation | M2, M15 | 28, 200 | [09](./09-tracking-technologies.md), [14](./00-master-blueprint.md) |
| Voice / voice-to-WO | M14, M18 | 192, 301 | [08](./08-ai-intelligence.md) |
| Gen-AI / Copilot agentic | M3, M18 | 53, 55, 285–287, 300 | [08](./08-ai-intelligence.md), [13](./00-master-blueprint.md) |
| Predictive Operations | M3, M6 | 48, 293, 302 | [08](./08-ai-intelligence.md) |
| IoT Marketplace & packs | M13, M20 | 179, 235 | [13](./00-master-blueprint.md) |
| Edge AI | M2, M3 | 34, 36 | [11](./11-technical-architecture.md), [14](./00-master-blueprint.md) |
| Autonomous Inventory | M5, M11 | 86, 147–150 | composite |
| Sustainability / ESG | M8, M10 | 303 | [08](./08-ai-intelligence.md), [17](./00-master-blueprint.md) |
| Blockchain (challenged) | M11, M16 | 149–150 | [16](./00-master-blueprint.md) |
| Developer ecosystem / app store | M13 | 171–172, 179–180 | [13](./00-master-blueprint.md) |

---

## 18.6 Summary

Access Genie's innovation roadmap extends the committed P0–P5 plan into a **P6+ autonomous horizon**, deepening
seeded items (the Digital Twin's 2D→3D→BIM/CAD ladder, the Copilot's assist→agentic→autonomous arc) and adding
strategically-underserved bets — chiefly **Sustainability/ESG and energy optimization**, which are low-cost,
high-fit projections of the same asset graph and increasingly regulator-mandated. We sort the portfolio into
**near-term bets** worth funding now (twin, agentic Copilot, voice-to-WO, ESG, predictive-ops recommendations,
industry packs, edge rules, developer API), **mid-term pilots** to time-box (partner marketplace, phone-AR,
edge ML, drone/AMR ingestion), and **hardware-bound moonshots** to keep as R&D lighthouses (autonomous
inventory, AMR dispatch, AR headsets) — while explicitly **challenging blockchain**, whose real requirement
(cryptographic immutability) is better met by a Merkle-hashed WORM audit log than by inheriting a distributed
ledger's cost and complexity. The through-line: fund what projects from the unified asset graph, keep every
agentic capability explainable and governed, earn autonomy with proven accuracy, and never ship someone else's
commodity hardware as an Access Genie SKU.
