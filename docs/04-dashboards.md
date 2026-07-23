# 4. Dashboard Planning

Dashboards are **role-default + fully customizable** (drag-drop widget grid, saved layouts, shareable). Each widget
declares its data source, refresh cadence, drill-down target, and required permission. Below: the 8 canonical dashboards.
Every dashboard has: **KPI row → visual analytics → work/alert lists → AI insight panel → quick actions → filters**.

Legend: 🔢 KPI card · 📊 chart · 🗺️ map · 📋 table/list · ✨ AI · ⚡ quick action

## 4.1 Executive Dashboard (Executive / C-Suite)
- 🔢 KPIs: Total Assets, Portfolio Value (TCO), Utilization %, Risk Index, AI-Realized Savings, Critical Alerts.
- 📊 Charts: Asset value trend (line), Value by category (donut), Utilization vs downtime (dual-axis), Risk distribution (stacked bar), Savings waterfall.
- 🗺️ Map: Global footprint — assets/value by region (choropleth + clustered pins).
- ✨ AI panel: Board-level narrative summary ("3 things needing attention"), predicted capex, top risks.
- 📋 Tables: Top 10 highest-risk assets; facilities by performance.
- ⚡ Actions: Generate board report, Scenario/what-if, Drill to facility.
- Filters: Region, Facility, Category, Time range, Org unit.

## 4.2 Operations Dashboard (Operations / Facility Manager)
- 🔢 KPIs: Assets Active/Idle/Down, Availability %, Open WOs, Missing Assets, Throughput.
- 🗺️ Map: Live facility map with real-time asset states + geofence status.
- 📊 Charts: Utilization heatmap by zone, Idle-time by category, Movement volume, WO backlog burn.
- ✨ AI: Rebalancing suggestions (under/over-utilized), bottleneck detection.
- 📋 Tables: Alerts to triage, WO backlog, assets not scanned recently.
- ⚡ Actions: Assign WO, Initiate transfer, Locate asset, Acknowledge alert.
- Filters: Facility, Zone, Status, Category, Shift.

## 4.3 Maintenance Dashboard (Maintenance Manager)
- 🔢 KPIs: PM Compliance %, MTTR, MTBF, Open/Overdue WOs, Predictive Alerts, Wrench-time.
- 📊 Charts: WO pipeline (funnel: new→assigned→in-progress→done), MTTR trend, Failure Pareto, PM vs corrective ratio, Backlog age.
- ✨ AI: Predicted failures (next 30d) with confidence + recommended action → one-click WO.
- 📋 Tables: Overdue WOs, upcoming PMs, technician load, parts shortages blocking WOs.
- ⚡ Actions: Create WO, Dispatch technician, Schedule PM, Order parts.
- Filters: Facility, Asset class, Technician, Priority, Date.

## 4.4 Asset Dashboard (Asset Manager)
- 🔢 KPIs: Total/By-status, Data-Quality Score, Utilization, Upcoming EOL, In-audit, Unassigned.
- 📊 Charts: Lifecycle funnel (procurement→disposal), Age distribution, Category mix, Data completeness gauge.
- 📋 Tables: Assets missing data, EOL within 90d, recently registered, audit exceptions.
- ✨ AI: Replacement recommendations, duplicate/ghost asset detection.
- ⚡ Actions: Register asset, Start audit, Bulk edit, Plan replacement.
- Filters: Category, Facility, Lifecycle stage, Custodian, Value band.

## 4.5 AI Intelligence Dashboard (all — AI command center)
- 🔢 KPIs: Assets at Risk, Predicted Failures (30d), Idle Assets, Anomalies (24h), Model Health, Savings Identified.
- 📊 Charts: Risk score distribution, Prediction confidence bands, Anomaly timeline, Utilization opportunity map.
- ✨ AI feed: Ranked, explainable insights (each with drivers, confidence, $ impact, recommended action, dismiss/act).
- 📋 Tables: Top failure predictions, top optimization opportunities, models needing retraining (drift).
- ⚡ Actions: Act on insight (→WO/transfer), Ask Copilot, View explanation, Provide feedback (thumbs up/down → learning loop).
- Filters: Model, Confidence threshold, Impact band, Category, Facility.

## 4.6 Security Dashboard (Security Officer)
- 🔢 KPIs: Active Alerts, Geofence Breaches (24h), Tamper Events, After-hours Movement, Missing/Recovered, Response Time.
- 🗺️ Map: Live security map — restricted zones, breach pins, patrol coverage, asset-out-of-bounds trails.
- 📊 Charts: Alerts by type/time, Response-time trend, False-positive rate, Custody-gap count.
- 📋 Tables: Open incidents, custody exceptions, high-value assets off-site.
- ⚡ Actions: Acknowledge, Escalate, Quarantine/lock asset, File incident, Dispatch officer.
- Filters: Facility, Zone, Alert type, Severity, Time.

## 4.7 Inventory Dashboard (Inventory Manager)
- 🔢 KPIs: SKUs, Stock Value, Stockouts, Below-Reorder, Fill Rate, Carrying Cost.
- 📊 Charts: ABC analysis, Consumption trend, Stock vs reorder, Aging stock, Turnover.
- 📋 Tables: Reorder alerts, pending POs, receiving queue, slow-moving parts.
- ✨ AI: Demand forecast, optimal reorder point, parts-for-predicted-failures pre-staging.
- ⚡ Actions: Create PO, Receive stock, Adjust count, Issue parts.
- Filters: Warehouse, Category, Supplier, Stock status.

## 4.8 Executive Analytics / Financial Dashboard (Finance / Controller)
- 🔢 KPIs: Book Value, Accumulated Depreciation, TCO, Capex Forecast, Write-offs YTD, ROA.
- 📊 Charts: Depreciation schedule projection, Book vs. market value, Capex vs. opex, TCO by category, Cost-per-operating-hour.
- 📋 Tables: Assets nearing full depreciation, high-TCO assets, pending disposals/write-offs, warranty-expiry cost exposure.
- ✨ AI: Capex deferral opportunities (lifecycle extension), cost-optimization ranking.
- ⚡ Actions: Approve write-off, Adjust depreciation, Export to GL/ERP, Run TCO report.
- Filters: Cost center, Category, Facility, Fiscal period, Depreciation method.

## 4.9 Dashboard Platform Capabilities

- **Widget library** (40+ widget types) with per-widget config, thresholds, and drill-through.
- **Custom dashboard builder** — drag-drop grid, resize, save, clone, set as role default, share/publish.
- **Real-time vs. cached** — widgets declare cadence (live stream, 1-min, 15-min, daily); UI shows freshness.
- **Cross-filtering** — clicking a chart segment filters the whole dashboard.
- **Threshold theming** — KPI cards colorize by health/target (good/warning/critical tokens).
- **Export & subscribe** — any dashboard → PDF/PNG/scheduled email; embed via signed URL.
- **Mobile-responsive** — dashboards reflow to single-column; key KPIs pinned.
- **AI narration** — every dashboard has a "Explain this" button → generative summary of what changed and why.
