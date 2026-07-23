import { NavGroup, Session } from '@/types/platform';

// ─────────────────────────────────────────────────────────────────────────────
// The full 12-group information architecture (docs/03-information-architecture.md).
// Groups are gated by module; items marked `comingSoon` render a stub state.
// Pages that already exist in the demo are NOT flagged comingSoon.
// ─────────────────────────────────────────────────────────────────────────────
export const navConfig: NavGroup[] = [
  {
    id: 'workspace', label: 'Workspace', module: 'workspace',
    items: [
      { label: 'My Workspace', href: '/', icon: '🏠' },
      { label: 'Dashboards', href: '/dashboards', icon: '📊' },
      { label: 'AI Copilot', href: '/copilot', icon: '🤖' },
    ],
  },
  {
    id: 'assets', label: 'Assets', module: 'assets',
    items: [
      { label: 'Asset Registry', href: '/assets', icon: '📦' },
      { label: 'Categories & Taxonomy', href: '/taxonomy', icon: '🗂️' },
      { label: 'Groups & Kits', href: '/groups', icon: '🧩' },
      { label: 'Lifecycle & Disposal', href: '/lifecycle', icon: '♻️' },
      { label: 'Bulk Import', href: '/assets/import', icon: '📥' },
    ],
  },
  {
    id: 'tracking', label: 'Tracking & IoT', module: 'tracking',
    items: [
      { label: 'Live Map', href: '/tracking', icon: '🗺️' },
      { label: 'Digital Twin', href: '/twin', icon: '🏢' },
      { label: 'Geofences', href: '/geofences', icon: '📍' },
      { label: 'Movement History', href: '/movement', icon: '🧭' },
      { label: 'Heatmaps', href: '/heatmaps', icon: '🔥' },
      { label: 'Sensors & Gateways', href: '/sensors', icon: '📡' },
      { label: 'Telemetry Explorer', href: '/telemetry', icon: '📈' },
    ],
  },
  {
    id: 'ai', label: 'AI Intelligence', module: 'ai',
    items: [
      { label: 'AI Insights Feed', href: '/ai-insights', icon: '✨' },
      { label: 'Health & Risk', href: '/ai/health', icon: '❤️‍🩹' },
      { label: 'Predictive Maintenance', href: '/ai/predictive', icon: '🔮' },
      { label: 'Utilization', href: '/ai/utilization', icon: '⚖️' },
      { label: 'Anomaly & Theft', href: '/ai/anomaly', icon: '🚨' },
      { label: 'Theft Detection', href: '/ai/theft', icon: '🛡️' },
      { label: 'Forecasting', href: '/ai/forecasting', icon: '📉' },
      { label: 'Model Registry', href: '/ai/models', icon: '🧠' },
    ],
  },
  {
    id: 'maintenance', label: 'Maintenance', module: 'maintenance',
    items: [
      { label: 'Work Orders', href: '/maintenance', icon: '🔧' },
      { label: 'Preventive (PM)', href: '/pm', icon: '🗓️' },
      { label: 'Predictive Alerts', href: '/predictive', icon: '⚡' },
      { label: 'Technician Scheduling', href: '/scheduling', icon: '👷' },
      { label: 'Inspections', href: '/inspections', icon: '📋' },
      { label: 'Checklists', href: '/checklists', icon: '✅' },
      { label: 'Parts & Failure Codes', href: '/parts', icon: '⚙️', comingSoon: true },
    ],
  },
  {
    id: 'inventory', label: 'Inventory & Parts', module: 'inventory',
    items: [
      { label: 'Stock Overview', href: '/inventory', icon: '📦' },
      { label: 'Reorder & Procurement', href: '/reorder', icon: '🛒' },
      { label: 'Consumption', href: '/consumption', icon: '📊' },
      { label: 'Warehouses', href: '/warehouses', icon: '🏬' },
    ],
  },
  {
    id: 'operations', label: 'Operations', module: 'operations',
    items: [
      { label: 'Transfers & Movements', href: '/operations/transfers', icon: '🔁' },
      { label: 'Check-in / Check-out', href: '/checkinout', icon: '🎫' },
      { label: 'Reservations', href: '/reservations', icon: '📆' },
      { label: 'Field Operations', href: '/field-ops', icon: '🚚' },
    ],
  },
  {
    id: 'analytics', label: 'Analytics & Reports', module: 'analytics',
    items: [
      { label: 'Report Library', href: '/reports', icon: '📚' },
      { label: 'Report Builder', href: '/reports/builder', icon: '🧱' },
      { label: 'BI Explorer', href: '/bi', icon: '🔎' },
      { label: 'Financials & Depreciation', href: '/financials', icon: '💰' },
      { label: 'Compliance Reports', href: '/compliance-reports', icon: '📑' },
    ],
  },
  {
    id: 'alerts', label: 'Alerts & Notifications', module: 'alerts',
    items: [
      { label: 'Alert Center', href: '/alerts', icon: '🔔' },
      { label: 'Notification Preferences', href: '/notifications/preferences', icon: '🎚️' },
      { label: 'Escalation Policies', href: '/escalations', icon: '📣' },
    ],
  },
  {
    id: 'compliance', label: 'Compliance & Audit', module: 'compliance',
    items: [
      { label: 'Audit Center', href: '/audit', icon: '🕵️' },
      { label: 'Cycle Counts', href: '/cycle-counts', icon: '🔢' },
      { label: 'Chain of Custody', href: '/custody', icon: '🔗' },
      { label: 'Certifications', href: '/certifications', icon: '📜' },
      { label: 'Immutable Log', href: '/audit-log', icon: '🧾' },
      { label: 'Regulatory', href: '/regulatory', icon: '📋' },
      { label: 'Data Retention', href: '/retention', icon: '🗄️' },
    ],
  },
  {
    id: 'admin', label: 'Administration', module: 'admin',
    items: [
      { label: 'Org & Facilities', href: '/admin/org', icon: '🏛️' },
      { label: 'Users & Roles', href: '/admin/users', icon: '👥' },
      { label: 'Teams & Departments', href: '/admin/teams', icon: '🧑‍🤝‍🧑' },
      { label: 'Approval Workflows', href: '/admin/workflows', icon: '🔀' },
      { label: 'Integrations & API', href: '/admin/integrations', icon: '🔌' },
      { label: 'Branding', href: '/admin/branding', icon: '🎨' },
      { label: 'Billing', href: '/admin/billing', icon: '🧮' },
    ],
  },
  {
    id: 'system', label: 'System', module: 'system',
    items: [
      { label: 'System Monitoring', href: '/system/monitoring', icon: '🖥️', comingSoon: true },
      { label: 'Feature Flags', href: '/system/flags', icon: '🚩', comingSoon: true },
      { label: 'Developer Portal', href: '/system/developer', icon: '👩‍💻', comingSoon: true },
      { label: 'Help & Support', href: '/help', icon: '❓' },
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
