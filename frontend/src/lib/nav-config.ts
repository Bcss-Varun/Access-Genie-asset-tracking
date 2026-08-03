import type { ModuleKey } from '@access-genie/shared';

export interface NavItem {
  label: string;
  to: string;
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
  items: NavItem[];
}

/**
 * Navigation: main sections only.
 *
 * The sidebar shows one row per section, with the six flagship capability
 * pillars leading. A section's sub-pages unfold only while that section is
 * active, which keeps the rail at ten rows instead of seventy while leaving
 * every destination reachable (here, and from the ⌘K palette).
 *
 * `module` gates the section against the session's grants — the same matrix the
 * API enforces with `requireModule`, so a hidden section is also a refused
 * request rather than merely an absent menu item.
 */
export const navSections: NavSection[] = [
  {
    id: 'workspace',
    label: 'My Workspace',
    to: '/',
    icon: '🏠',
    module: 'workspace',
    items: [
      { label: 'Dashboards', to: '/dashboards' },
      { label: 'AI Copilot', to: '/copilot' },
      { label: 'Notifications', to: '/notifications' },
      { label: "What's New", to: '/whats-new' },
      { label: 'Help Center', to: '/help' },
    ],
  },

  // ── Pillar 1 ───────────────────────────────────────────────────────────────
  {
    id: 'tracking',
    label: 'Real-Time Tracking',
    fullLabel: 'Real-Time Asset Tracking (RFID, BLE, GPS, QR, UWB)',
    to: '/tracking',
    icon: '🗺️',
    module: 'tracking',
    items: [
      { label: 'Live Asset Map', to: '/tracking' },
      { label: 'Geofencing Zones', to: '/geofences' },
      { label: 'Movement History', to: '/movement' },
      { label: 'Tag & Device Registry', to: '/sensors' },
      { label: 'Gateways & Readers', to: '/gateways' },
      { label: 'Zone Heatmaps', to: '/heatmaps' },
      { label: 'Digital Twin', to: '/twin' },
      { label: 'Telemetry Explorer', to: '/telemetry' },
      { label: 'Label & Tag Printing', to: '/assets/labels' },
    ],
  },

  // ── Pillar 2 ───────────────────────────────────────────────────────────────
  {
    id: 'ai',
    label: 'AI Asset Intelligence',
    fullLabel: 'AI-Powered Asset Intelligence and Utilization Analytics',
    to: '/ai-insights',
    icon: '✨',
    module: 'ai',
    items: [
      { label: 'AI Insights Feed', to: '/ai-insights' },
      { label: 'Utilization Analytics', to: '/ai/utilization' },
      { label: 'Predictive Failure', to: '/ai/predictive' },
      { label: 'Theft & Custody Anomaly', to: '/ai/theft' },
      { label: 'Anomaly Detection', to: '/ai/anomaly' },
      { label: 'CapEx Forecasting', to: '/ai/forecasting' },
      { label: 'Fleet Health Scoring', to: '/ai/health' },
      { label: 'Model Registry', to: '/ai/models' },
      { label: 'Explainability', to: '/ai/explainability' },
      { label: 'Model Feedback', to: '/ai/feedback' },
    ],
  },

  // ── Pillar 3 ───────────────────────────────────────────────────────────────
  {
    id: 'assets',
    label: 'Passport & Lifecycle',
    fullLabel: 'Digital Asset Passport and Lifecycle Management',
    to: '/assets',
    icon: '🪪',
    module: 'assets',
    items: [
      { label: 'IT Asset Registry', to: '/assets' },
      { label: 'Register Asset', to: '/assets/new' },
      { label: 'Digital Asset Passports', to: '/taxonomy' },
      { label: 'Lifecycle Management', to: '/lifecycle' },
      { label: 'Groups & Fleets', to: '/groups' },
      { label: 'Kits & Bundles', to: '/kits' },
      { label: 'Asset Financials', to: '/financials' },
      { label: 'Depreciation Schedules', to: '/depreciation' },
      { label: 'Bulk Import', to: '/assets/import' },
    ],
  },

  // ── Pillar 4 ───────────────────────────────────────────────────────────────
  {
    id: 'maintenance',
    label: 'Predictive Maintenance',
    fullLabel: 'Predictive Maintenance and Automated Work Orders',
    to: '/maintenance',
    icon: '🔧',
    module: 'maintenance',
    items: [
      { label: 'Automated Work Orders', to: '/maintenance' },
      { label: 'Raise Work Order', to: '/maintenance/new' },
      { label: 'Maintenance Calendar', to: '/maintenance/calendar' },
      { label: 'Predictive Alerts', to: '/predictive' },
      { label: 'Preventive (PM)', to: '/pm' },
      { label: 'Inspections', to: '/inspections' },
      { label: 'Checklists', to: '/checklists' },
      { label: 'Spares Consumption', to: '/consumption' },
    ],
  },

  // ── Pillar 5 ───────────────────────────────────────────────────────────────
  {
    id: 'compliance',
    label: 'Security & Compliance',
    fullLabel: 'Asset Security, Geo-fencing and Compliance Monitoring',
    to: '/alerts',
    icon: '🛡️',
    module: 'compliance',
    items: [
      { label: 'Alert Center', to: '/alerts' },
      { label: 'Alert Rules', to: '/alert-rules' },
      { label: 'Escalation Policies', to: '/escalations' },
      { label: 'Compliance Monitoring', to: '/compliance-reports' },
      { label: 'Regulatory Frameworks', to: '/regulatory' },
      { label: 'Chain of Custody', to: '/custody' },
      { label: 'Certifications', to: '/certifications' },
      { label: 'Audit Center', to: '/audit' },
      { label: 'Immutable Audit Log', to: '/audit-log' },
      { label: 'Data Retention', to: '/retention' },
    ],
  },

  // ── Pillar 6 ───────────────────────────────────────────────────────────────
  {
    id: 'operations',
    label: 'Mobile Workforce',
    fullLabel: 'Mobile Workforce Enablement',
    to: '/field-ops',
    icon: '📱',
    module: 'operations',
    items: [
      { label: 'Field Operations', to: '/field-ops' },
      { label: 'My Work Queue', to: '/my-work' },
      { label: 'Check-in / Check-out', to: '/checkinout' },
      { label: 'Technician Scheduling', to: '/scheduling' },
      { label: 'Asset Transfers', to: '/operations/transfers' },
      { label: 'Cycle Counts', to: '/cycle-counts' },
      { label: 'Reservations', to: '/reservations' },
    ],
  },

  // ── Supporting sections ────────────────────────────────────────────────────
  {
    id: 'analytics',
    label: 'Analytics & Reporting',
    to: '/reports',
    icon: '📄',
    module: 'analytics',
    items: [
      { label: 'Report Library', to: '/reports' },
      { label: 'Report Builder', to: '/reports/builder' },
      { label: 'BI & Warehouse Sync', to: '/bi' },
      { label: 'Scheduled Subscriptions', to: '/subscriptions' },
      { label: 'Export Center', to: '/exports' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory & Parts',
    to: '/inventory',
    icon: '📦',
    module: 'inventory',
    items: [
      { label: 'IT Spares Overview', to: '/inventory' },
      { label: 'Warehouses & Bins', to: '/warehouses' },
      { label: 'Reorder Planning', to: '/reorder' },
      { label: 'Purchase Orders', to: '/procurement' },
      { label: 'Suppliers', to: '/suppliers' },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    to: '/admin/users',
    icon: '⚙️',
    module: 'admin',
    items: [
      { label: 'Users & Roles', to: '/admin/users' },
      { label: 'Roles & Permissions', to: '/admin/roles' },
      { label: 'Teams', to: '/admin/teams' },
      { label: 'Org & Facilities', to: '/admin/org' },
      { label: 'Approval Workflows', to: '/admin/workflows' },
      { label: 'Integrations & API', to: '/admin/integrations' },
      { label: 'Webhooks', to: '/admin/webhooks' },
      { label: 'API Keys', to: '/admin/api-keys' },
      { label: 'Branding & White-Label', to: '/admin/branding' },
      { label: 'Data Management', to: '/admin/data' },
      { label: 'Billing & Subscription', to: '/admin/billing' },
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
  const hub = { label: section.label, to: section.to, icon: section.icon, group };
  const children = section.items
    .filter((item) => item.to !== section.to)
    .map((item) => ({ ...item, icon: section.icon, group }));

  return [hub, ...children];
});
