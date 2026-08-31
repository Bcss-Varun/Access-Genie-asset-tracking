import type { ModuleKey } from '@access-genie/shared';

/**
 * The module catalogue — one definition, shared by the Roles & Permissions
 * matrix and the per-user "extra permissions" pickers. Both are answering the
 * same underlying question (which of these eleven modules can this session
 * reach), so a module added here shows up in both without being typed twice.
 */
export const MODULE_CATALOG: { key: ModuleKey; label: string; blurb: string }[] = [
  { key: 'workspace', label: 'Workspace', blurb: 'Dashboards, notifications, the home screen' },
  { key: 'assets', label: 'Assets', blurb: 'The registry, registration, custody' },
  { key: 'tracking', label: 'Tracking', blurb: 'Live map, journeys, geofences, devices' },
  { key: 'ai', label: 'AI', blurb: 'Insights, forecasting, anomaly detection' },
  { key: 'maintenance', label: 'Maint.', blurb: 'Work orders, PM schedules, inspections' },
  { key: 'operations', label: 'Ops', blurb: 'Transfers, reservations, cycle counts' },
  { key: 'analytics', label: 'Analytics', blurb: 'Reports, exports, BI' },
  { key: 'alerts', label: 'Alerts', blurb: 'Alert queue, rules, escalation' },
  { key: 'compliance', label: 'Compliance', blurb: 'Compliance monitoring, audits, the audit log' },
  { key: 'admin', label: 'Admin', blurb: 'Users, roles, org configuration' },
  { key: 'system', label: 'System', blurb: 'API keys, integrations, platform internals' },
];

export const MODULE_LABEL: Record<ModuleKey, string> = Object.fromEntries(
  MODULE_CATALOG.map((m) => [m.key, m.label]),
) as Record<ModuleKey, string>;
