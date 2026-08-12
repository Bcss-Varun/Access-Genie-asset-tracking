import type { AlertSeverity, AssetHealth, AssetStatus, Criticality, WorkOrderPriority, WorkOrderStatus } from '@access-genie/shared';

/**
 * Status → colour, in one place.
 *
 * The design system gives each hue exactly one meaning (emerald = healthy,
 * amber = attention, red = critical). Centralising the mapping is what keeps
 * that promise true across twelve screens instead of drifting per-component.
 */
export type Tone = 'slate' | 'primary' | 'emerald' | 'amber' | 'red';

export const assetStatusTone: Record<AssetStatus, Tone> = {
  Active: 'emerald',
  Maintenance: 'amber',
  Missing: 'red',
  End_Of_Life: 'slate',
  Staging: 'primary',
};

export const healthTone: Record<AssetHealth, Tone> = {
  Good: 'emerald',
  Warning: 'amber',
  Critical: 'red',
};

export const criticalityTone: Record<Criticality, Tone> = {
  Low: 'slate',
  Medium: 'primary',
  High: 'amber',
  Critical: 'red',
};

export const workOrderStatusTone: Record<WorkOrderStatus, Tone> = {
  New: 'slate',
  Assigned: 'primary',
  'In Progress': 'amber',
  'On Hold': 'slate',
  Completed: 'emerald',
  Cancelled: 'slate',
};

export const priorityTone: Record<WorkOrderPriority, Tone> = {
  Low: 'slate',
  Medium: 'primary',
  High: 'amber',
  Critical: 'red',
};

export const alertSeverityTone: Record<AlertSeverity, Tone> = {
  Critical: 'red',
  Warning: 'amber',
  Info: 'primary',
};

/** Health score → the bar/dot colour used on cards and tables. */
export function healthBarColor(score: number): string {
  if (score >= 75) return 'bg-health-good';
  if (score >= 45) return 'bg-health-warning';
  return 'bg-health-critical';
}

/** Human label for a status enum that carries an underscore on the wire. */
export function statusLabel(status: AssetStatus): string {
  return status.replace(/_/g, ' ');
}
