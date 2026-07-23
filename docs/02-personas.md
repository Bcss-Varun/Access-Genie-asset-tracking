# 2. User Personas, Roles & RBAC

Roles are grouped into **tiers**. RBAC is **role + scope**: a role grants *permissions*, a scope binds them to an
Org / Facility / Building / Zone / Asset-class. This is stricter than Maximo's site-based security and closer to
ServiceNow's domain separation, but enforced at the **data (row-level) layer**, not just menu visibility.

## 2.1 Role Tiers

| Tier | Roles | Scope |
|------|-------|-------|
| **Platform** | Super Admin, Platform Ops/SRE, Support Engineer | Cross-tenant (Access Genie staff) |
| **Tenant Admin** | Organization Admin, Security Admin, Integration Admin | Whole org |
| **Management** | Facility Manager, Asset Manager, Maintenance Manager, Operations Manager, Inventory Manager, Department Head | Facility/dept scope |
| **Field/Operational** | Technician, Operator, Security Officer, Receiving Clerk, Auditor | Task/zone scope |
| **Business** | Finance/Controller, Executive/C-Suite, Compliance Officer | Read + approvals |
| **External** | Vendor/Contractor, Guest/Viewer, Kiosk/Service Account | Constrained, time-boxed |

## 2.2 Persona Deep-Dives

For each: **Responsibilities · Permissions · Home Dashboard · Daily Workflow · KPIs**.

### Super Admin (Platform)
- **Responsibilities:** Tenant provisioning, global config, feature flags, platform health, billing plans.
- **Permissions:** Everything, cross-tenant (with break-glass audit); can impersonate with consent + logging.
- **Dashboard:** System Monitoring (tenant health, ingest rates, error budgets, SLA).
- **Daily workflow:** Review platform SLOs → approve tenant changes → manage feature rollout → incident response.
- **KPIs:** Uptime %, ingest lag, tenant churn signals, error budget burn.

### Organization Admin (Tenant Admin)
- **Responsibilities:** Org structure (facilities/buildings/zones), users & roles, policies, integrations, branding.
- **Permissions:** Full within tenant; manage RBAC, SSO, data retention, approval chains.
- **Dashboard:** Org Overview (assets by facility, user activity, compliance posture, license usage).
- **Daily workflow:** Onboard users → adjust roles → review audit exceptions → manage integrations.
- **KPIs:** License utilization, onboarding time, policy compliance %, open access requests.

### Facility Manager (Management)
- **Responsibilities:** All assets/operations within a facility; space, zones, safety, local budgets.
- **Permissions:** CRUD assets/work orders/inventory within facility scope; approve transfers in-facility.
- **Dashboard:** Operations Dashboard (facility map, live asset states, alerts, WO backlog, staffing).
- **Daily workflow:** Morning alert triage → assign WOs → review critical/missing assets → approve movements.
- **KPIs:** Uptime, on-time WO %, asset availability, shrinkage, safety incidents.

### Asset Manager (Management)
- **Responsibilities:** Asset master data quality, lifecycle stage, assignments, audits, disposals.
- **Permissions:** Full asset CRUD + lifecycle transitions + audit initiation within scope.
- **Dashboard:** Asset Dashboard (lifecycle funnel, data-quality score, utilization, upcoming EOL).
- **Daily workflow:** Approve registrations → resolve data-quality flags → run/close audits → plan replacements.
- **KPIs:** Data completeness %, audit accuracy, utilization, EOL forecast accuracy.

### Maintenance Manager (Management)
- **Responsibilities:** Preventive/predictive/corrective maintenance program, technicians, SLAs, parts.
- **Permissions:** Manage WOs, PM schedules, technician assignment, approve parts issue, close WOs.
- **Dashboard:** Maintenance Dashboard (WO pipeline, PM compliance, MTBF/MTTR, predictive alerts, backlog).
- **Daily workflow:** Review predictive alerts → convert to WOs → dispatch/balance technician load → SLA watch.
- **KPIs:** PM compliance %, MTTR, MTBF, schedule attainment, wrench-time, backlog age.

### Operations Manager (Management)
- **Responsibilities:** Throughput, utilization balancing, cross-facility asset allocation.
- **Permissions:** Read all ops data; initiate transfers/reallocations; approve within scope.
- **Dashboard:** Operations + Utilization analytics.
- **Daily workflow:** Rebalance under/over-utilized assets → resolve bottlenecks → approve transfers.
- **KPIs:** Utilization %, idle asset count, throughput, transfer cycle time.

### Inventory Manager (Management)
- **Responsibilities:** Consumables, spare parts, stock levels, reorder, receiving.
- **Permissions:** CRUD inventory, POs (parts), reorder rules, stock adjustments.
- **Dashboard:** Inventory Dashboard (stockouts, reorder alerts, ABC analysis, parts consumption).
- **Daily workflow:** Review reorder alerts → receive stock → reconcile counts → issue parts to WOs.
- **KPIs:** Stockout rate, carrying cost, inventory accuracy, fill rate.

### Technician (Field)
- **Responsibilities:** Execute WOs, inspections, scans, condition reports — mobile, often offline.
- **Permissions:** View assigned WOs/assets; update WO status; scan; log parts/time; capture photos.
- **Dashboard:** Mobile "My Work" (today's WOs, map route, scan, checklist).
- **Daily workflow:** Accept WO → navigate → scan asset → run checklist → log parts/time → close/escalate.
- **KPIs:** WOs completed, first-time-fix rate, mean time on task, checklist compliance.

### Operator (Field)
- **Responsibilities:** Uses assets (forklift, machine, vehicle); pre-use checks; reports issues.
- **Permissions:** Check-out/in, run inspection checklist, raise issue/defect.
- **Dashboard:** Mobile simple: assigned asset, checklist, report issue.
- **KPIs:** Checklist completion, defects reported, safe-use compliance.

### Security Officer (Field)
- **Responsibilities:** Loss prevention, tamper/geofence response, custody enforcement, patrols.
- **Permissions:** View live tracking + alerts; acknowledge/escalate; lock/quarantine asset; custody logs.
- **Dashboard:** Security Dashboard (geofence breaches, tamper alerts, after-hours movement, custody chain).
- **Daily workflow:** Monitor live map → respond to breach/tamper → verify custody → file incident.
- **KPIs:** Alert response time, recovered assets, false-positive rate, incidents.

### Department Head (Management/Business)
- **Responsibilities:** Owns assets assigned to a department; budget & accountability.
- **Permissions:** Read dept assets; approve dept transfers/requests; request procurement.
- **Dashboard:** Department Overview (owned assets, cost, utilization, open requests).
- **KPIs:** Dept asset cost, utilization, accountability %, request cycle time.

### Finance / Controller (Business)
- **Responsibilities:** Capitalization, depreciation, TCO, capex/opex, write-offs, GL sync.
- **Permissions:** Read financial data across scope; manage depreciation schedules; approve write-offs/disposals.
- **Dashboard:** Executive Analytics — Financial (book value, depreciation, TCO, capex forecast).
- **KPIs:** Book vs. market value, depreciation accuracy, TCO/asset, write-off value.

### Executive / C-Suite (Business)
- **Responsibilities:** Strategic oversight; portfolio-level decisions.
- **Permissions:** Read-only aggregated views; scenario/what-if; no operational edits.
- **Dashboard:** Executive Dashboard (portfolio value, risk, utilization, AI-summarized insights).
- **KPIs:** Total asset value, ROA, risk index, savings realized by AI.

### Compliance / Audit Officer (Business/Field)
- **Responsibilities:** Audits, chain of custody, regulatory evidence, retention.
- **Permissions:** Read-all + immutable audit log access; run audits; export evidence packs; no data mutation.
- **Dashboard:** Compliance Dashboard (audit status, custody gaps, retention, certification expiry).
- **KPIs:** Audit pass rate, custody completeness, findings closed, evidence coverage.

### Vendor / Contractor (External)
- **Responsibilities:** Service specific assets under contract (warranty repairs, calibration).
- **Permissions:** Time-boxed, asset-scoped WO access; upload service records/certs; no browse.
- **Dashboard:** Vendor portal (assigned WOs, SLA, upload docs).
- **KPIs:** SLA adherence, service quality, doc completeness.

### Guest / Viewer & Kiosk (External)
- **Guest/Viewer:** Read-only shared dashboards/reports; watermarked; time-limited links.
- **Kiosk/Service Account:** Self-service check-in/out at a station; scoped to a location + action set.

## 2.3 RBAC Model (summary)

- **Permission = Resource × Action** (e.g., `asset:transfer`, `workorder:close`, `finance:read`).
- **Role = set of permissions**; **Assignment = Role × Scope × (optional) time-box**.
- **Row-level security** filters every query by tenant + scope; **field-level** masks (e.g., cost hidden from technicians).
- **Attribute-based overlays (ABAC)** for context rules (e.g., "after hours," "asset classified restricted").
- **Segregation of duties**: requester ≠ approver enforced on transfers, disposals, write-offs.
- **Break-glass** access is possible for Platform tier but always logged + alerts the tenant Security Admin.

Full permission matrix and enforcement layers are detailed in [16-security-compliance.md](./16-security-compliance.md).
