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
    id: 'tracking', label: 'Real-Time Tracking', module: 'tracking',
    items: [
      { label: 'Live IT Asset Map', href: '/tracking', icon: '🗺️' },
      { label: 'Geofencing Zones', href: '/geofences', icon: '📍' },
      { label: 'Movement History', href: '/movement', icon: '🧭' },
      { label: 'Gateways (RFID/BLE/UWB)', href: '/sensors', icon: '📡' },
    ],
  },
  {
    id: 'ai', label: 'AI Asset Intelligence', module: 'ai',
    items: [
      { label: 'Utilization Analytics', href: '/ai/utilization', icon: '⚖️' },
      { label: 'AI Insights Feed', href: '/ai-insights', icon: '✨' },
      { label: 'Forecasting', href: '/ai/forecasting', icon: '📉' },
    ],
  },
  {
    id: 'assets', label: 'Digital Passports & Lifecycle', module: 'assets',
    items: [
      { label: 'IT Asset Registry', href: '/assets', icon: '💻' },
      { label: 'Digital Asset Passports', href: '/taxonomy', icon: '🪪' },
      { label: 'Lifecycle Management', href: '/lifecycle', icon: '♻️' },
      { label: 'Groups & Kits', href: '/groups', icon: '🧩' },
    ],
  },
  {
    id: 'maintenance', label: 'Predictive Maintenance', module: 'maintenance',
    items: [
      { label: 'Automated Work Orders', href: '/maintenance', icon: '🔧' },
      { label: 'Predictive Alerts', href: '/predictive', icon: '⚡' },
      { label: 'Preventive (PM)', href: '/pm', icon: '🗓️' },
    ],
  },
  {
    id: 'compliance', label: 'Security & Compliance', module: 'compliance',
    items: [
      { label: 'Compliance Monitoring', href: '/compliance-reports', icon: '🛡️' },
      { label: 'Alerts & Policies', href: '/alerts', icon: '🔔' },
      { label: 'Chain of Custody', href: '/custody', icon: '🔗' },
      { label: 'Audit Center', href: '/audit', icon: '🕵️' },
    ],
  },
  {
    id: 'operations', label: 'Mobile Workforce', module: 'operations',
    items: [
      { label: 'Field Operations', href: '/field-ops', icon: '📱' },
      { label: 'Check-in / Check-out', href: '/checkinout', icon: '🎫' },
      { label: 'Technician Scheduling', href: '/scheduling', icon: '👷' },
    ],
  },
  {
    id: 'inventory', label: 'Inventory & Parts', module: 'inventory',
    items: [
      { label: 'IT Spares Overview', href: '/inventory', icon: '📦' },
      { label: 'Reorder & Procurement', href: '/reorder', icon: '🛒' },
    ],
  },
  {
    id: 'admin', label: 'Administration', module: 'admin',
    items: [
      { label: 'Users & Roles', href: '/admin/users', icon: '👥' },
      { label: 'Approval Workflows', href: '/admin/workflows', icon: '🔀' },
      { label: 'Integrations & API', href: '/admin/integrations', icon: '🔌' },
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
