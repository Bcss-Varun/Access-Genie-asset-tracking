import type { AuditFindingStatus, AuditStatus, ComplianceSeverity, ComplianceStatus } from '@access-genie/shared';
import type { Tone } from '@/lib/tone';

/** Shared severity/status → badge-tone mapping across Compliance Monitoring and Audit Center. */
export const SEVERITY_TONE: Record<ComplianceSeverity, Tone> = {
  Low: 'slate',
  Medium: 'amber',
  High: 'amber',
  Critical: 'red',
};

export const COMPLIANCE_STATUS_TONE: Record<ComplianceStatus, Tone> = {
  Open: 'red',
  'In Progress': 'amber',
  Resolved: 'emerald',
  Waived: 'slate',
};

export const FINDING_STATUS_TONE: Record<AuditFindingStatus, Tone> = {
  Open: 'red',
  'In Progress': 'amber',
  Resolved: 'emerald',
  Waived: 'slate',
};

export const AUDIT_STATUS_TONE: Record<AuditStatus, Tone> = {
  Planned: 'slate',
  'In Progress': 'primary',
  Completed: 'emerald',
  Closed: 'slate',
};

export function formatDateShort(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
