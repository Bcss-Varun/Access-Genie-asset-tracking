import type { ModuleKey } from '@access-genie/shared';

/**
 * A live count rendered as a red pill on a nav row.
 *
 * The nav declares *which* count a row wants, never the number itself — the
 * numbers come from the API and change while the app is open. Keeping the
 * config declarative is what lets this module stay a plain data file with no
 * dependency on the data layer.
 */
export type BadgeKey = 'openAlerts' | 'openTrackingAlerts';

/** The live values behind every `BadgeKey`, resolved once by the chrome. */
export type BadgeCounts = Partial<Record<BadgeKey, number>>;

export interface NavItem {
  label: string;
  to: string;
  icon: string;
  badgeKey?: BadgeKey;
  /** Specced in the blueprint, not built yet — the row renders a "soon" chip. */
  comingSoon?: boolean;
}

export interface NavSection {
  id: string;
  /** Short label for the 256px rail. */
  label: string;
  /** Full capability name — row tooltip and command-palette grouping. */
  fullLabel?: string;
  /** Hub route the section row navigates to. */
  to: string;
  icon: string;
  module: ModuleKey;
  badgeKey?: BadgeKey;
  items: NavItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation. The sidebar shows MAIN SECTIONS ONLY — one row each — with the six
// flagship capability pillars leading, right under Workspace. Each section's
// sub-pages live in `items`: they unfold in the sidebar only while that section
// is active, and are always reachable from the ⌘K palette.
//
// `module` gates the section against the session's grants — the same matrix the
// API enforces with `requireModule`, so a hidden section is also a refused
// request rather than merely an absent menu item.
// ─────────────────────────────────────────────────────────────────────────────
export const navSections: NavSection[] = [
  {
    id: 'workspace',
    label: 'My Workspace',
    module: 'workspace',
    to: '/',
    icon: '🏠',
    items: [
      { label: 'Dashboards', to: '/dashboards', icon: '📊' },
      { label: 'AI Copilot', to: '/copilot', icon: '🤖' },
      { label: 'Notifications', to: '/notifications', icon: '📬' },
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
    id: 'tracking',
    label: 'Asset Tracking',
    fullLabel: 'Asset Tracking & Monitoring',
    module: 'tracking',
    to: '/tracking',
    icon: '🗺️',
    badgeKey: 'openTrackingAlerts',
    items: [
      { label: 'Live Tracking', to: '/tracking', icon: '🛰️' },
      { label: 'Inventory Tracking', to: '/tracking/inventory', icon: '📦' },
      { label: 'Asset Journey', to: '/tracking/journey', icon: '🧭' },
      { label: 'Geofence Monitoring', to: '/tracking/geofences', icon: '🚧' },
      { label: 'Alerts & Incidents', to: '/tracking/alerts', icon: '🚨', badgeKey: 'openTrackingAlerts' },
      { label: 'Tracking Infrastructure', to: '/tracking/infrastructure', icon: '📡' },
    ],
  },

  // ── Pillar 2 ───────────────────────────────────────────────────────────────
  {
    id: 'ai',
    label: 'AI Asset Intelligence',
    fullLabel: 'AI-Powered Asset Intelligence and Utilization Analytics',
    module: 'ai',
    to: '/ai-insights',
    icon: '✨',
    items: [
      { label: 'AI Insights Feed', to: '/ai-insights', icon: '✨' },
      { label: 'Utilization Analytics', to: '/ai/utilization', icon: '⚖️' },
      { label: 'Predictive Failure', to: '/ai/predictive', icon: '🔮' },
      { label: 'Theft & Custody Anomaly', to: '/ai/theft', icon: '🚨' },
      { label: 'Anomaly Detection', to: '/ai/anomaly', icon: '〽️' },
      { label: 'CapEx Forecasting', to: '/ai/forecasting', icon: '📉' },
      { label: 'Fleet Health Scoring', to: '/ai/health', icon: '💚' },
      { label: 'Model Registry', to: '/ai/models', icon: '🧠' },
      { label: 'Explainability', to: '/ai/explainability', icon: '🔍' },
      { label: 'Model Feedback', to: '/ai/feedback', icon: '👍' },
    ],
  },

  // ── Pillar 3 ───────────────────────────────────────────────────────────────
  {
    id: 'assets',
    label: 'Asset Management',
    fullLabel: 'Asset registry, lifecycle, collections and financials',
    module: 'assets',
    to: '/assets',
    icon: '🪪',
    items: [
      { label: 'IT Asset Registry', to: '/assets', icon: '💻' },
      { label: 'Add Asset', to: '/assets/new', icon: '➕' },
      // Labelling belongs to the registry, not to Tracking (where it used to
      // sit): the job is "make this asset scannable", and printing the label is
      // the same event as binding the tag it carries.
      { label: 'Label & Tag Printing', to: '/assets/labels', icon: '🏷️' },
      { label: 'Lifecycle Management', to: '/lifecycle', icon: '♻️' },
      // Groups & Fleets and Kits & Bundles removed (docs/22 §22.4): they were one
      // array behind two rows, and for IT the job is done better by saved views
      // on the Registry (rule-based, shareable) and by parent/child components
      // on Asset 360.
      { label: 'Asset Financials', to: '/financials', icon: '💰' },
      // Depreciation Schedules removed (docs/22 §22.2 item 9): it duplicated
      // Financials — same source data, same book-value KPI, same per-asset
      // table. The per-asset schedule lives on Asset 360 ▸ Commercial.
      { label: 'Bulk Import', to: '/assets/import', icon: '📥' },
    ],
  },

  // ── Pillar 4 ───────────────────────────────────────────────────────────────
  {
    id: 'maintenance',
    label: 'Predictive Maintenance',
    fullLabel: 'Predictive Maintenance and Automated Work Orders',
    module: 'maintenance',
    to: '/maintenance',
    icon: '🔧',
    items: [
      { label: 'Automated Work Orders', to: '/maintenance', icon: '🔧' },
      { label: 'Maintenance Calendar', to: '/maintenance/calendar', icon: '🗓️' },
      { label: 'Predictive Alerts', to: '/predictive', icon: '⚡' },
      { label: 'Preventive (PM)', to: '/pm', icon: '🔁' },
      { label: 'Inspections', to: '/inspections', icon: '🔎' },
      { label: 'Checklists', to: '/checklists', icon: '✅' },
      { label: 'Spares Consumption', to: '/consumption', icon: '🧯' },
    ],
  },

  // ── Pillar 5 ───────────────────────────────────────────────────────────────
  {
    id: 'compliance',
    label: 'Security & Compliance',
    fullLabel: 'Asset Security, Geo-fencing and Compliance Monitoring',
    module: 'compliance',
    to: '/compliance-reports',
    icon: '🛡️',
    badgeKey: 'openAlerts',
    items: [
      { label: 'Compliance Monitoring', to: '/compliance-reports', icon: '🛡️' },
      { label: 'Regulatory Frameworks', to: '/regulatory', icon: '📜' },
      { label: 'Alert Center', to: '/alerts', icon: '🔔', badgeKey: 'openAlerts' },
      { label: 'Alert Rules', to: '/alert-rules', icon: '⚙️' },
      { label: 'Escalation Policies', to: '/escalations', icon: '📣' },
      { label: 'Chain of Custody', to: '/custody', icon: '🔗' },
      { label: 'Certifications', to: '/certifications', icon: '🎖️' },
      { label: 'Audit Center', to: '/audit', icon: '🕵️' },
      { label: 'Immutable Audit Log', to: '/audit-log', icon: '📒' },
      { label: 'Data Retention', to: '/retention', icon: '🗄️' },
    ],
  },

  // ── Pillar 6 ───────────────────────────────────────────────────────────────
  {
    id: 'operations',
    label: 'Mobile Workforce',
    fullLabel: 'Mobile Workforce Enablement',
    module: 'operations',
    to: '/field-ops',
    icon: '📱',
    items: [
      { label: 'Field Operations', to: '/field-ops', icon: '📱' },
      { label: 'My Work Queue', to: '/my-work', icon: '🧰' },
      { label: 'Check-in / Check-out', to: '/checkinout', icon: '🎫' },
      { label: 'Technician Scheduling', to: '/scheduling', icon: '👷' },
      { label: 'Asset Transfers', to: '/operations/transfers', icon: '🚚' },
      { label: 'Cycle Counts', to: '/cycle-counts', icon: '🔢' },
      { label: 'Reservations', to: '/reservations', icon: '📆' },
    ],
  },

  // ── Supporting sections ────────────────────────────────────────────────────
  {
    id: 'analytics',
    label: 'Analytics & Reporting',
    module: 'analytics',
    to: '/reports',
    icon: '📄',
    items: [
      { label: 'Report Library', to: '/reports', icon: '📄' },
      { label: 'Report Builder', to: '/reports/builder', icon: '🛠️' },
      { label: 'BI & Warehouse Sync', to: '/bi', icon: '🧮' },
      { label: 'Scheduled Subscriptions', to: '/subscriptions', icon: '📮' },
      { label: 'Export Center', to: '/exports', icon: '📤' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory & Parts',
    module: 'inventory',
    to: '/inventory',
    icon: '📦',
    items: [
      { label: 'IT Spares Overview', to: '/inventory', icon: '📦' },
      { label: 'Warehouses & Bins', to: '/warehouses', icon: '🏬' },
      { label: 'Reorder Planning', to: '/reorder', icon: '🛒' },
      { label: 'Purchase Orders', to: '/procurement', icon: '🧾' },
      { label: 'Suppliers', to: '/suppliers', icon: '🤝' },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    module: 'admin',
    to: '/admin/users',
    icon: '⚙️',
    items: [
      // Configuration, not operations: a class decides how thousands of assets
      // behave, so it is edited deliberately from Administration (docs/22 §22.2).
      { label: 'Asset Classes & Templates', to: '/admin/classes', icon: '🧬' },
      { label: 'Users & Roles', to: '/admin/users', icon: '👥' },
      { label: 'Roles & Permissions', to: '/admin/roles', icon: '🔐' },
      { label: 'Teams', to: '/admin/teams', icon: '🧑‍🤝‍🧑' },
      { label: 'Org & Facilities', to: '/admin/org', icon: '🏛️' },
      { label: 'Approval Workflows', to: '/admin/workflows', icon: '🔀' },
      { label: 'Integrations & API', to: '/admin/integrations', icon: '🔌' },
      { label: 'Webhooks', to: '/admin/webhooks', icon: '🪝' },
      { label: 'API Keys', to: '/admin/api-keys', icon: '🗝️' },
      { label: 'Branding & White-Label', to: '/admin/branding', icon: '🎨' },
      { label: 'Data Management', to: '/admin/data', icon: '🗃️' },
      { label: 'Billing & Subscription', to: '/admin/billing', icon: '💳' },
    ],
  },
];

/** Sections the session may enter — role-adaptive: hidden, not greyed out. */
export function navForModules(modules: ModuleKey[]): NavSection[] {
  return navSections.filter((section) => modules.includes(section.module));
}

/** Every destination, flattened — the ⌘K palette's index. */
export const allNavItems = navSections.flatMap((section) => {
  const group = section.fullLabel ?? section.label;
  const hub = { label: section.label, to: section.to, icon: section.icon, badgeKey: section.badgeKey, group };
  const children = section.items
    .filter((item) => item.to !== section.to) // the hub is already listed above
    .map((item) => ({ ...item, group }));

  return [hub, ...children];
});
