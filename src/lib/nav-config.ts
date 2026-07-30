import { NavGroup, Session } from '@/types/platform';
import { mockAlerts } from '@/lib/mock-data';
import { openTrackingAlertCount } from '@/lib/tracking-data';

/** Alerts still demanding attention — badged on the Security & Compliance section. */
const openAlertCount = mockAlerts.filter((a) => a.status === 'Open' || a.status === 'Escalated').length;

// ─────────────────────────────────────────────────────────────────────────────
// Navigation. The sidebar shows MAIN SECTIONS ONLY — one row each — with the six
// flagship capability pillars leading, right under Workspace. Each section's
// sub-pages live in `items`: they unfold in the sidebar only while that section
// is active, and are always reachable from the ⌘K palette.
// Sections are gated by module; items marked `comingSoon` render a stub state.
// ─────────────────────────────────────────────────────────────────────────────
export const navConfig: NavGroup[] = [
  {
    id: 'workspace', label: 'My Workspace', module: 'workspace',
    href: '/', icon: '🏠',
    items: [
      { label: 'Dashboards', href: '/dashboards', icon: '📊' },
      { label: 'AI Copilot', href: '/copilot', icon: '🤖' },
      { label: 'Notifications', href: '/notifications', icon: '📬' },
    ],
  },

  // ── Pillar 1 ───────────────────────────────────────────────────────────────
  // Five operational rows, then one for the hardware. Each row is a question an
  // operator actually asks, and each asks exactly one:
  //
  //   Where is it now?          → Live Tracking
  //   Is everything accounted   → Inventory Tracking
  //   for where it should be?
  //   Where has it been?        → Asset Journey
  //   Did it break a rule?      → Geofence Monitoring
  //   What needs me right now?  → Alerts & Incidents
  //   Can we still hear?        → Tracking Infrastructure
  //
  // Nothing is named after a technology or a screen. The Digital Twin is a
  // visualisation launched from Live Tracking, not a destination of its own.
  {
    id: 'tracking', label: 'Asset Tracking', module: 'tracking',
    fullLabel: 'Asset Tracking & Monitoring',
    href: '/tracking', icon: '🗺️', badge: openTrackingAlertCount,
    items: [
      { label: 'Live Tracking', href: '/tracking', icon: '🛰️' },
      { label: 'Inventory Tracking', href: '/tracking/inventory', icon: '📦' },
      { label: 'Asset Journey', href: '/tracking/journey', icon: '🧭' },
      { label: 'Geofence Monitoring', href: '/tracking/geofences', icon: '🚧' },
      { label: 'Alerts & Incidents', href: '/tracking/alerts', icon: '🚨', badge: openTrackingAlertCount },
      { label: 'Tracking Infrastructure', href: '/tracking/infrastructure', icon: '📡' },
    ],
  },

  // ── Pillar 2 ───────────────────────────────────────────────────────────────
  {
    id: 'ai', label: 'AI Asset Intelligence', module: 'ai',
    fullLabel: 'AI-Powered Asset Intelligence and Utilization Analytics',
    href: '/ai-insights', icon: '✨',
    items: [
      { label: 'AI Insights Feed', href: '/ai-insights', icon: '✨' },
      { label: 'Utilization Analytics', href: '/ai/utilization', icon: '⚖️' },
      { label: 'Predictive Failure', href: '/ai/predictive', icon: '🔮' },
      { label: 'Theft & Custody Anomaly', href: '/ai/theft', icon: '🚨' },
      { label: 'Anomaly Detection', href: '/ai/anomaly', icon: '〽️' },
      { label: 'CapEx Forecasting', href: '/ai/forecasting', icon: '📉' },
      { label: 'Fleet Health Scoring', href: '/ai/health', icon: '💚' },
      { label: 'Model Registry', href: '/ai/models', icon: '🧠' },
      { label: 'Explainability', href: '/ai/explainability', icon: '🔍' },
      { label: 'Model Feedback', href: '/ai/feedback', icon: '👍' },
    ],
  },

  // ── Pillar 3 ───────────────────────────────────────────────────────────────
  {
    id: 'assets', label: 'Asset Management', module: 'assets',
    fullLabel: 'Asset registry, lifecycle, collections and financials',
    href: '/assets', icon: '🪪',
    items: [
      { label: 'IT Asset Registry', href: '/assets', icon: '💻' },
      { label: 'Add Asset', href: '/assets/new', icon: '➕' },
      // Labelling belongs to the registry, not to Tracking (where it used to
      // sit): the job is "make this asset scannable", and printing the label is
      // the same event as binding the tag it carries.
      { label: 'Label & Tag Printing', href: '/assets/labels', icon: '🏷️' },
      { label: 'Lifecycle Management', href: '/lifecycle', icon: '♻️' },
      // Groups & Fleets and Kits & Bundles removed (docs/22 §22.4): they were one
      // array behind two rows, and for IT the job is done better by saved views
      // on the Registry (rule-based, shareable) and by parent/child components
      // on Asset 360.
      { label: 'Asset Financials', href: '/financials', icon: '💰' },
      // Depreciation Schedules removed (docs/22 §22.2 item 9): it duplicated
      // Financials — same source data, same book-value KPI, same per-asset
      // table. The per-asset schedule lives on Asset 360 ▸ Commercial.
      { label: 'Bulk Import', href: '/assets/import', icon: '📥' },
    ],
  },

  // ── Pillar 4 ───────────────────────────────────────────────────────────────
  {
    id: 'maintenance', label: 'Predictive Maintenance', module: 'maintenance',
    fullLabel: 'Predictive Maintenance and Automated Work Orders',
    href: '/maintenance', icon: '🔧',
    items: [
      { label: 'Automated Work Orders', href: '/maintenance', icon: '🔧' },
      { label: 'Maintenance Calendar', href: '/maintenance/calendar', icon: '🗓️' },
      { label: 'Predictive Alerts', href: '/predictive', icon: '⚡' },
      { label: 'Preventive (PM)', href: '/pm', icon: '🔁' },
      { label: 'Inspections', href: '/inspections', icon: '🔎' },
      { label: 'Checklists', href: '/checklists', icon: '✅' },
      { label: 'Spares Consumption', href: '/consumption', icon: '🧯' },
    ],
  },

  // ── Pillar 5 ───────────────────────────────────────────────────────────────
  {
    id: 'compliance', label: 'Security & Compliance', module: 'compliance',
    fullLabel: 'Asset Security, Geo-fencing and Compliance Monitoring',
    href: '/compliance-reports', icon: '🛡️', badge: openAlertCount,
    items: [
      { label: 'Compliance Monitoring', href: '/compliance-reports', icon: '🛡️' },
      { label: 'Regulatory Frameworks', href: '/regulatory', icon: '📜' },
      { label: 'Alert Center', href: '/alerts', icon: '🔔', badge: openAlertCount },
      { label: 'Alert Rules', href: '/alert-rules', icon: '⚙️' },
      { label: 'Escalation Policies', href: '/escalations', icon: '📣' },
      { label: 'Chain of Custody', href: '/custody', icon: '🔗' },
      { label: 'Certifications', href: '/certifications', icon: '🎖️' },
      { label: 'Audit Center', href: '/audit', icon: '🕵️' },
      { label: 'Immutable Audit Log', href: '/audit-log', icon: '📒' },
      { label: 'Data Retention', href: '/retention', icon: '🗄️' },
    ],
  },

  // ── Pillar 6 ───────────────────────────────────────────────────────────────
  {
    id: 'operations', label: 'Mobile Workforce', module: 'operations',
    fullLabel: 'Mobile Workforce Enablement',
    href: '/field-ops', icon: '📱',
    items: [
      { label: 'Field Operations', href: '/field-ops', icon: '📱' },
      { label: 'My Work Queue', href: '/my-work', icon: '🧰' },
      { label: 'Check-in / Check-out', href: '/checkinout', icon: '🎫' },
      { label: 'Technician Scheduling', href: '/scheduling', icon: '👷' },
      { label: 'Asset Transfers', href: '/operations/transfers', icon: '🚚' },
      { label: 'Cycle Counts', href: '/cycle-counts', icon: '🔢' },
      { label: 'Reservations', href: '/reservations', icon: '📆' },
    ],
  },

  // ── Supporting sections ────────────────────────────────────────────────────
  {
    id: 'analytics', label: 'Analytics & Reporting', module: 'analytics',
    href: '/reports', icon: '📄',
    items: [
      { label: 'Report Library', href: '/reports', icon: '📄' },
      { label: 'Report Builder', href: '/reports/builder', icon: '🛠️' },
      { label: 'BI & Warehouse Sync', href: '/bi', icon: '🧮' },
      { label: 'Scheduled Subscriptions', href: '/subscriptions', icon: '📮' },
      { label: 'Export Center', href: '/exports', icon: '📤' },
    ],
  },
  {
    id: 'inventory', label: 'Inventory & Parts', module: 'inventory',
    href: '/inventory', icon: '📦',
    items: [
      { label: 'IT Spares Overview', href: '/inventory', icon: '📦' },
      { label: 'Warehouses & Bins', href: '/warehouses', icon: '🏬' },
      { label: 'Reorder Planning', href: '/reorder', icon: '🛒' },
      { label: 'Purchase Orders', href: '/procurement', icon: '🧾' },
      { label: 'Suppliers', href: '/suppliers', icon: '🤝' },
    ],
  },
  {
    id: 'admin', label: 'Administration', module: 'admin',
    href: '/admin/users', icon: '⚙️',
    items: [
      // Configuration, not operations: a class decides how thousands of assets
      // behave, so it is edited deliberately from Administration (docs/22 §22.2).
      { label: 'Asset Classes & Templates', href: '/admin/classes', icon: '🧬' },
      { label: 'Users & Roles', href: '/admin/users', icon: '👥' },
      { label: 'Roles & Permissions', href: '/admin/roles', icon: '🔐' },
      { label: 'Teams', href: '/admin/teams', icon: '🧑‍🤝‍🧑' },
      { label: 'Org & Facilities', href: '/admin/org', icon: '🏛️' },
      { label: 'Approval Workflows', href: '/admin/workflows', icon: '🔀' },
      { label: 'Integrations & API', href: '/admin/integrations', icon: '🔌' },
      { label: 'Webhooks', href: '/admin/webhooks', icon: '🪝' },
      { label: 'API Keys', href: '/admin/api-keys', icon: '🗝️' },
      { label: 'Branding & White-Label', href: '/admin/branding', icon: '🎨' },
      { label: 'Data Management', href: '/admin/data', icon: '🗃️' },
      { label: 'Billing & Subscription', href: '/admin/billing', icon: '💳' },
    ],
  },
];

/** Sections visible to the current session (role-adaptive: hidden, not greyed). */
export function navForSession(session: Session): NavGroup[] {
  return navConfig.filter((g) => session.modules.includes(g.module));
}

/** Flat list of every nav destination — section hubs + sub-pages (for ⌘K). */
export const allNavItems = navConfig.flatMap((g) => {
  const group = g.fullLabel ?? g.label;
  const section = { label: g.label, href: g.href, icon: g.icon, badge: g.badge, group };
  const children = g.items
    .filter((i) => i.href !== g.href) // hub already listed above
    .map((i) => ({ ...i, group }));
  return [section, ...children];
});
