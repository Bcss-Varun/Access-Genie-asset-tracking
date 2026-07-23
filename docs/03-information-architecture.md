# 3. Information Architecture & Navigation

## 3.1 Structural Hierarchy (the tenancy tree)

```
Platform
└── Organization (Tenant)
    └── Region / Division            (optional grouping)
        └── Facility / Site
            └── Building
                └── Floor
                    └── Zone / Room
                        └── Asset  ── has ──> Components / Sub-assets
```

Every screen is **scope-aware**: a global scope-switcher (Org ▸ Facility ▸ Building ▸ Zone) filters all data.
This mirrors ServiceNow domain separation + Maximo sites, but is a single continuous tree rather than two models.

## 3.2 Primary Navigation (left sidebar — grouped, collapsible)

The sidebar is **role-adaptive**: modules the role can't access are hidden, not greyed. Order reflects daily frequency.

```
■ WORKSPACE
  • Home / My Workspace            role-personalized landing
  • Dashboards                     switch between 8 role dashboards
  • AI Copilot                     natural-language command bar (also ⌘K everywhere)

■ ASSETS
  • Asset Registry                 master list, filters, bulk actions
  • Asset 360° Profile             (deep-link per asset)
  • Categories & Taxonomy          asset classes, attributes, templates
  • Asset Groups & Kits            bundles, parent/child, fleets
  • Lifecycle & Disposal           stage board, EOL, retirement
  • Bulk Import / Onboarding       CSV/API, label printing

■ TRACKING & IoT
  • Live Map                       real-time RTLS/GPS positions
  • Digital Twin                   3D/2D facility model
  • Geofences & Zones              define & monitor boundaries
  • Movement History               trails, dwell, heatmaps
  • Sensors & Gateways             device fleet, health, config
  • Telemetry Explorer             time-series sensor data

■ AI INTELLIGENCE
  • AI Insights Feed               ranked, explainable recommendations
  • Health & Risk Scores           per-asset & portfolio
  • Predictive Maintenance         failure forecasts → WOs
  • Utilization & Optimization     idle/over-use, rebalancing
  • Anomaly & Theft Detection      behavioral alerts
  • Forecasting & Capacity         demand, lifecycle, capex
  • Model Registry & Explainability governance, drift, drivers

■ MAINTENANCE
  • Work Orders                    board/list/calendar
  • Preventive (PM) Schedules      recurring plans
  • Predictive Alerts              AI-sourced WOs
  • Technician Scheduling          dispatch, load balancing
  • Inspections & Checklists       forms, compliance
  • Parts & Failure Codes          BOM, failure taxonomy

■ INVENTORY & PARTS
  • Stock Overview                 levels, ABC, valuation
  • Reorder & Procurement          rules, POs, receiving
  • Consumption & Issue            parts to WOs
  • Warehouses & Bins              storage locations

■ OPERATIONS
  • Transfers & Movements          request/approve/track
  • Check-in / Check-out           custody, reservations
  • Reservations & Booking         schedule shared assets
  • Field Operations               live technician/operator view

■ ANALYTICS & REPORTS
  • Report Library                 prebuilt + custom
  • Report Builder                 drag-drop, scheduled
  • BI Explorer                    ad-hoc pivot/charts
  • Financials & Depreciation      book value, TCO
  • Compliance Reports             audit, regulatory
  • Exports & Subscriptions        scheduled delivery

■ ALERTS & NOTIFICATIONS
  • Alert Center                   all events, ack/escalate
  • Notification Preferences       channels, digests
  • Escalation Policies            on-call, routing

■ COMPLIANCE & AUDIT
  • Audit Center                   physical audits, cycle counts
  • Chain of Custody               per-asset custody log
  • Certifications & Warranties    expiry tracking
  • Regulatory & Retention         GDPR, SOC2 evidence
  • Immutable Audit Log            system activity

■ ADMINISTRATION
  • Organization & Facilities      structure editor
  • Users & Roles (RBAC)           people, permissions
  • Teams & Departments            org units
  • Approval Workflows             chains, SoD rules
  • Integrations & API Keys        connectors, webhooks
  • Data Import/Export & Backup    tenant data ops
  • Branding & Localization        theme, languages, units
  • Billing & Subscription         plan, usage, invoices

■ SYSTEM
  • System Monitoring              (platform tier)
  • Feature Flags & Config
  • Developer Portal / API Docs
  • Help, Docs & Support
```

## 3.3 Top Navigation (global bar)

| Zone | Elements |
|------|----------|
| **Left** | Logo, Scope switcher (Org/Facility/Building/Zone), breadcrumb |
| **Center** | Global search + **AI Copilot** (⌘K) — natural language: *"show critical assets in Building A not scanned in 7 days"* |
| **Right** | Quick-create (+), Scan (QR/RFID), Alerts bell (live count), Help, Theme toggle, User menu (profile, org, sign-out) |

## 3.4 Module → Page Map (overview; full catalog in §6)

| Module | Key Pages |
|--------|-----------|
| Dashboards | 8 role dashboards + custom dashboard builder |
| Assets | Registry, 360° Profile (14 tabs), Taxonomy, Groups/Kits, Lifecycle Board, Bulk Onboarding |
| Tracking & IoT | Live Map, Digital Twin, Geofences, Movement History, Sensors/Gateways, Telemetry Explorer |
| AI Intelligence | Insights Feed, Health/Risk, Predictive Maintenance, Utilization, Anomaly/Theft, Forecasting, Model Registry |
| Maintenance | Work Orders, PM Schedules, Predictive, Scheduling, Inspections, Parts/Failure codes |
| Inventory | Stock, Reorder/Procurement, Consumption, Warehouses |
| Operations | Transfers, Check-in/out, Reservations, Field Ops |
| Analytics | Report Library, Builder, BI Explorer, Financials, Compliance, Subscriptions |
| Alerts | Alert Center, Preferences, Escalation |
| Compliance | Audit Center, Chain of Custody, Certifications, Regulatory, Immutable Log |
| Admin | Org/Facilities, Users/Roles, Teams, Workflows, Integrations, Data Ops, Branding, Billing |
| System | Monitoring, Flags, Developer Portal, Help |

## 3.5 Navigation Principles

1. **Progressive disclosure** — 12 top groups, each expandable; never more than 2 clicks to any page.
2. **Role-adaptive** — sidebar composition is computed from the user's permissions; empty modules disappear.
3. **Scope-persistent** — the scope switcher context follows the user across modules and deep links.
4. **Command-first** — ⌘K Copilot can navigate, filter, create, and answer; power users never touch the mouse.
5. **Deep-linkable & shareable** — every filtered view has a URL; state is in the query, not just memory.
6. **Consistent object pages** — every entity (asset, WO, sensor, user) follows the same tabbed profile pattern.
