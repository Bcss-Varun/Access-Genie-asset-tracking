import type { ModuleKey } from '@access-genie/shared';

export interface NavItem {
  label: string;
  to: string;
  /** Marks routes specced in the blueprint but not yet built. */
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
      { label: 'Dashboards', to: '/dashboards', comingSoon: true },
      { label: 'AI Copilot', to: '/copilot', comingSoon: true },
      { label: 'Notifications', to: '/notifications' },
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
      { label: 'Tag & Device Registry', to: '/tracking/devices' },
      { label: 'Geofencing Zones', to: '/tracking/geofences' },
      { label: 'Gateways & Readers', to: '/tracking/gateways' },
      { label: 'Movement History', to: '/tracking/movement', comingSoon: true },
      { label: 'Zone Heatmaps', to: '/tracking/heatmaps', comingSoon: true },
      { label: 'Digital Twin', to: '/tracking/twin', comingSoon: true },
    ],
  },

  // ── Pillar 2 ───────────────────────────────────────────────────────────────
  {
    id: 'ai',
    label: 'AI Asset Intelligence',
    fullLabel: 'AI-Powered Asset Intelligence and Utilization Analytics',
    to: '/insights',
    icon: '✨',
    module: 'ai',
    items: [
      { label: 'AI Insights Feed', to: '/insights' },
      { label: 'Utilization Analytics', to: '/insights/utilization', comingSoon: true },
      { label: 'Predictive Failure', to: '/insights/predictive', comingSoon: true },
      { label: 'Anomaly Detection', to: '/insights/anomaly', comingSoon: true },
      { label: 'Model Registry', to: '/insights/models', comingSoon: true },
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
      { label: 'Chain of Custody', to: '/custody' },
      { label: 'Lifecycle Management', to: '/assets/lifecycle', comingSoon: true },
      { label: 'Asset Financials', to: '/assets/financials', comingSoon: true },
      { label: 'Bulk Import', to: '/assets/import', comingSoon: true },
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
      { label: 'Maintenance Calendar', to: '/maintenance/calendar', comingSoon: true },
      { label: 'Preventive (PM)', to: '/maintenance/pm', comingSoon: true },
      { label: 'Inspections', to: '/maintenance/inspections', comingSoon: true },
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
      { label: 'Alert Rules', to: '/alerts/rules' },
      { label: 'Immutable Audit Log', to: '/audit' },
      { label: 'Chain of Custody', to: '/custody' },
      { label: 'Compliance Monitoring', to: '/compliance/reports', comingSoon: true },
      { label: 'Certifications', to: '/compliance/certifications', comingSoon: true },
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
      { label: 'Field Operations', to: '/field-ops', comingSoon: true },
      { label: 'My Work Queue', to: '/field-ops/my-work', comingSoon: true },
      { label: 'Check-in / Check-out', to: '/field-ops/checkinout', comingSoon: true },
      { label: 'Cycle Counts', to: '/field-ops/cycle-counts', comingSoon: true },
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
      { label: 'Report Library', to: '/reports', comingSoon: true },
      { label: 'Report Builder', to: '/reports/builder', comingSoon: true },
      { label: 'Export Center', to: '/reports/exports', comingSoon: true },
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
      { label: 'Warehouses & Bins', to: '/inventory/warehouses', comingSoon: true },
      { label: 'Purchase Orders', to: '/inventory/purchase-orders', comingSoon: true },
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
      { label: 'Integrations & API', to: '/admin/integrations', comingSoon: true },
      { label: 'Branding & White-Label', to: '/admin/branding', comingSoon: true },
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
  const hub = { label: section.label, to: section.to, icon: section.icon, group, comingSoon: false };
  const children = section.items
    .filter((item) => item.to !== section.to)
    .map((item) => ({ ...item, icon: section.icon, group }));

  return [hub, ...children];
});
