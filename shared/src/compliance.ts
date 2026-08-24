// Compliance Monitoring & Audit Center.
//
// Two collections that used to be nowhere: compliance had a read-only
// framework list and a read-only retention list, neither of which recorded an
// actual finding, and "Start Audit" opened a physical inventory count (a
// `CycleCount`), not an audit engagement with findings and evidence. This file
// is the real shape of both — a finding raised against the estate, and an
// audit that raises findings of its own.

// ── Compliance records / findings ───────────────────────────────────────────

export const COMPLIANCE_CATEGORIES = [
  'Safety',
  'Data Protection',
  'Environmental',
  'Financial',
  'Operational',
  'Regulatory',
  'Other',
] as const;
export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];

export const COMPLIANCE_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type ComplianceSeverity = (typeof COMPLIANCE_SEVERITIES)[number];

export const COMPLIANCE_STATUSES = ['Open', 'In Progress', 'Resolved', 'Waived'] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const COMPLIANCE_SOURCES = ['Manual', 'Audit', 'Automated'] as const;
export type ComplianceSource = (typeof COMPLIANCE_SOURCES)[number];

export interface ComplianceRecord {
  id: string;
  assetId?: string;
  assetName?: string;
  scopeId?: string;
  title: string;
  description: string;
  category: ComplianceCategory;
  severity: ComplianceSeverity;
  status: ComplianceStatus;
  source: ComplianceSource;
  relatedAuditId?: string;
  relatedFindingId?: string;
  dueDate?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Audit Center: audits, findings, evidence ────────────────────────────────

export const AUDIT_TYPES = ['Internal', 'External', 'Regulatory', 'Safety', 'Financial', 'Physical'] as const;
export type AuditType = (typeof AUDIT_TYPES)[number];

export const AUDIT_STATUSES = ['Planned', 'In Progress', 'Completed', 'Closed'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

/** An audit's status only ever moves forward along this line. */
export const AUDIT_TRANSITIONS: Record<AuditStatus, AuditStatus[]> = {
  Planned: ['In Progress', 'Closed'],
  'In Progress': ['Completed', 'Closed'],
  Completed: ['Closed'],
  Closed: [],
};

export const AUDIT_FINDING_STATUSES = ['Open', 'In Progress', 'Resolved', 'Waived'] as const;
export type AuditFindingStatus = (typeof AUDIT_FINDING_STATUSES)[number];

export interface AuditEvidence {
  id: string;
  label: string;
  note?: string;
  url?: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface AuditFinding {
  id: string;
  auditId: string;
  assetId?: string;
  assetName?: string;
  title: string;
  description: string;
  severity: ComplianceSeverity;
  status: AuditFindingStatus;
  correctiveAction?: string;
  assignedTo?: string;
  dueDate?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  evidence: AuditEvidence[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Audit {
  id: string;
  name: string;
  type: AuditType;
  scopeId: string;
  status: AuditStatus;
  leadAuditor: string;
  startDate: string;
  dueDate: string;
  completedAt?: string;
  summary?: string;
  findingsCount: number;
  openFindingsCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
