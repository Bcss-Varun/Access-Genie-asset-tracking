import { NavGroup, Session } from '@/types/platform';
import { mockAlerts } from '@/lib/mock-data';

/** Alerts still demanding attention — badged on the Alert Center nav item. */
const openAlertCount = mockAlerts.filter((a) => a.status === 'Open' || a.status === 'Escalated').length;

// ─────────────────────────────────────────────────────────────────────────────
// Navigation. The six flagship capability pillars lead the sidebar, directly
// under Workspace; supporting groups (analytics, inventory, admin) follow.
// Groups are gated by module; items marked `comingSoon` render a stub state.
// ─────────────────────────────────────────────────────────────────────────────
export const navConfig: NavGroup[] = [
  {
    id: 'workspace', label: 'Workspace', module: 'workspace',
    items: [
      { label: 'My Workspace', href: '/', icon: '🏠' },
      { label: 'Dashboards', href: '/dashboards', icon: '📊' },
      { label: 'AI Copilot', href: '/copilot', icon: '🤖' },
      { label: 'Notifications', href: '/notifications', icon: '📬' },
    ],
  },

  // ── Pillar 1 ───────────────────────────────────────────────────────────────
  {
    id: 'tracking', label: 'Real-Time Asset Tracking', module: 'tracking',
    items: [
      { label: 'Live Asset Map', href: '/tracking', icon: '🗺️' },
      { label: 'Geofencing Zones', href: '/geofences', icon: '📍' },
      { label: 'Movement History', href: '/movement', icon: '🧭' },
      { label: 'Tag & Device Registry', href: '/sensors', icon: '🏷️' },
      { label: 'Gateways & Readers', href: '/gateways', icon: '📡' },
      { label: 'Zone Heatmaps', href: '/heatmaps', icon: '🔥' },
      { label: 'Digital Twin', href: '/twin', icon: '🏢' },
      { label: 'Telemetry Explorer', href: '/telemetry', icon: '📈' },
      { label: 'Label & Tag Printing', href: '/assets/labels', icon: '🖨️' },
    ],
  },

  // ── Pillar 2 ───────────────────────────────────────────────────────────────
  {
    id: 'ai', label: 'AI Intelligence & Utilization', module: 'ai',
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
    id: 'assets', label: 'Digital Passport & Lifecycle', module: 'assets',
    items: [
      { label: 'IT Asset Registry', href: '/assets', icon: '💻' },
      { label: 'Register Asset', href: '/assets/new', icon: '➕' },
      { label: 'Digital Asset Passports', href: '/taxonomy', icon: '🪪' },
      { label: 'Lifecycle Management', href: '/lifecycle', icon: '♻️' },
      { label: 'Groups & Fleets', href: '/groups', icon: '🧩' },
      { label: 'Kits & Bundles', href: '/kits', icon: '🎒' },
      { label: 'Asset Financials', href: '/financials', icon: '💰' },
      { label: 'Depreciation Schedules', href: '/depreciation', icon: '🧾' },
      { label: 'Bulk Import', href: '/assets/import', icon: '📥' },
    ],
  },

  // ── Pillar 4 ───────────────────────────────────────────────────────────────
  {
    id: 'maintenance', label: 'Predictive Maintenance & Work Orders', module: 'maintenance',
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
    id: 'compliance', label: 'Security, Geo-fencing & Compliance', module: 'compliance',
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
    id: 'operations', label: 'Mobile Workforce Enablement', module: 'operations',
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

  // ── Supporting groups ──────────────────────────────────────────────────────
  {
    id: 'analytics', label: 'Analytics & Reporting', module: 'analytics',
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
    items: [
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

/** Groups visible to the current session (role-adaptive: hidden, not greyed). */
export function navForSession(session: Session): NavGroup[] {
  return navConfig.filter((g) => session.modules.includes(g.module));
}

/** Flat list of all nav items (for the ⌘K command palette). */
export const allNavItems = navConfig.flatMap((g) =>
  g.items.map((i) => ({ ...i, group: g.label })),
);
