import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  Audit,
  AuditEvidence,
  AuditFinding,
  AuditFindingStatus,
  AuditRecord,
  AuditStatus,
  AuditType,
  ComplianceCategory,
  ComplianceRecord,
  ComplianceSeverity,
  ComplianceStatus,
} from '@access-genie/shared';
import { apiGet, apiList, apiPatch, apiPost } from '@/api/client';

/**
 * Compliance Monitoring, Audit Center and the Immutable Audit Log.
 *
 * All three are server-side paginated queries — filters and sort are sent as a
 * query string and the server does the work, the same shape as work orders.
 * Nothing here reads `lib/dataset`: a compliance register that lagged behind
 * the database it described would be exactly the failure this module exists
 * to prevent.
 */

// ── Compliance records ──────────────────────────────────────────────────────

export const COMPLIANCE_KEY = ['compliance-records'] as const;

export interface ComplianceFilters {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  status?: ComplianceStatus[];
  severity?: ComplianceSeverity[];
  category?: ComplianceCategory[];
  assetId?: string;
}

export const EMPTY_COMPLIANCE_FILTERS: ComplianceFilters = {};

export function activeComplianceFilterCount(filters: ComplianceFilters): number {
  return (
    (filters.q ? 1 : 0) +
    (filters.status?.length ? 1 : 0) +
    (filters.severity?.length ? 1 : 0) +
    (filters.category?.length ? 1 : 0) +
    (filters.assetId ? 1 : 0)
  );
}

function toComplianceQuery(filters: ComplianceFilters): URLSearchParams {
  const query = new URLSearchParams();
  const csv = (key: string, values?: string[]) => {
    if (values && values.length > 0) query.set(key, values.join(','));
  };
  csv('status', filters.status);
  csv('severity', filters.severity);
  csv('category', filters.category);
  if (filters.q?.trim()) query.set('q', filters.q.trim());
  if (filters.assetId) query.set('assetId', filters.assetId);
  if (filters.sort) query.set('sort', filters.sort);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));
  return query;
}

export interface CreateComplianceRecordBody {
  assetId?: string;
  scopeId?: string;
  title: string;
  description: string;
  category: ComplianceCategory;
  severity: ComplianceSeverity;
  dueDate?: string;
}

export const complianceApi = {
  list: (filters: ComplianceFilters = {}) => apiList<ComplianceRecord>(`/compliance-records?${toComplianceQuery(filters)}`),
  get: (id: string) => apiGet<ComplianceRecord>(`/compliance-records/${id}`),
  create: (body: CreateComplianceRecordBody) => apiPost<ComplianceRecord>('/compliance-records', body),
  update: (id: string, body: Partial<CreateComplianceRecordBody>) =>
    apiPatch<ComplianceRecord>(`/compliance-records/${id}`, body),
  resolve: (id: string, body: { status: 'Resolved' | 'Waived'; resolutionNote?: string }) =>
    apiPost<ComplianceRecord>(`/compliance-records/${id}/resolve`, body),
};

export function useComplianceRecordList(filters: ComplianceFilters, enabled = true) {
  const query = toComplianceQuery(filters).toString();
  return useQuery({
    queryKey: [...COMPLIANCE_KEY, 'list', query],
    queryFn: () => complianceApi.list(filters),
    enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

/** One count per status/severity cut, read from `meta.total` rather than fetched rows. */
export function useComplianceRecordCount(filters: ComplianceFilters, enabled = true): UseQueryResult<number> {
  const query = toComplianceQuery({ ...filters, limit: 1 }).toString();
  return useQuery({
    queryKey: [...COMPLIANCE_KEY, 'count', query],
    queryFn: async () => (await complianceApi.list({ ...filters, limit: 1 })).meta.total,
    enabled,
    staleTime: 30_000,
  });
}

export function useComplianceRecord(id: string | undefined) {
  return useQuery({
    queryKey: [...COMPLIANCE_KEY, 'one', id],
    queryFn: () => complianceApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useRefreshCompliance() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: COMPLIANCE_KEY });
}

// ── Audit Center ─────────────────────────────────────────────────────────────

export const AUDIT_CENTER_KEY = ['audit-center'] as const;

export interface AuditFilters {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  status?: AuditStatus[];
  type?: AuditType[];
  scopeId?: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {};

export function activeAuditFilterCount(filters: AuditFilters): number {
  return (filters.q ? 1 : 0) + (filters.status?.length ? 1 : 0) + (filters.type?.length ? 1 : 0) + (filters.scopeId ? 1 : 0);
}

function toAuditQuery(filters: AuditFilters): URLSearchParams {
  const query = new URLSearchParams();
  const csv = (key: string, values?: string[]) => {
    if (values && values.length > 0) query.set(key, values.join(','));
  };
  csv('status', filters.status);
  csv('type', filters.type);
  if (filters.q?.trim()) query.set('q', filters.q.trim());
  if (filters.scopeId) query.set('scopeId', filters.scopeId);
  if (filters.sort) query.set('sort', filters.sort);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));
  return query;
}

export interface CreateAuditBody {
  name: string;
  type: AuditType;
  scopeId: string;
  leadAuditor: string;
  startDate: string;
  dueDate: string;
  summary?: string;
}

export interface FindingFilters {
  page?: number;
  limit?: number;
  sort?: string;
  status?: AuditFindingStatus[];
  severity?: ComplianceSeverity[];
}

function toFindingQuery(filters: FindingFilters): URLSearchParams {
  const query = new URLSearchParams();
  const csv = (key: string, values?: string[]) => {
    if (values && values.length > 0) query.set(key, values.join(','));
  };
  csv('status', filters.status);
  csv('severity', filters.severity);
  if (filters.sort) query.set('sort', filters.sort);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));
  return query;
}

export interface CreateFindingBody {
  assetId?: string;
  title: string;
  description: string;
  severity: ComplianceSeverity;
  correctiveAction?: string;
  assignedTo?: string;
  dueDate?: string;
}

export const auditCenterApi = {
  list: (filters: AuditFilters = {}) => apiList<Audit>(`/audits?${toAuditQuery(filters)}`),
  get: (id: string) => apiGet<Audit>(`/audits/${id}`),
  create: (body: CreateAuditBody) => apiPost<Audit>('/audits', body),
  update: (id: string, body: Partial<CreateAuditBody>) => apiPatch<Audit>(`/audits/${id}`, body),
  transition: (id: string, status: AuditStatus) => apiPost<Audit>(`/audits/${id}/transition`, { status }),

  listFindings: (auditId: string, filters: FindingFilters = {}) =>
    apiList<AuditFinding>(`/audits/${auditId}/findings?${toFindingQuery(filters)}`),
  createFinding: (auditId: string, body: CreateFindingBody) => apiPost<AuditFinding>(`/audits/${auditId}/findings`, body),
  updateFinding: (auditId: string, findingId: string, body: Partial<CreateFindingBody> & { status?: AuditFindingStatus }) =>
    apiPatch<AuditFinding>(`/audits/${auditId}/findings/${findingId}`, body),
  addEvidence: (auditId: string, findingId: string, body: { label: string; note?: string; url?: string }) =>
    apiPost<AuditFinding>(`/audits/${auditId}/findings/${findingId}/evidence`, body),
};

export function useAuditList(filters: AuditFilters, enabled = true) {
  const query = toAuditQuery(filters).toString();
  return useQuery({
    queryKey: [...AUDIT_CENTER_KEY, 'list', query],
    queryFn: () => auditCenterApi.list(filters),
    enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useAuditCount(filters: AuditFilters, enabled = true): UseQueryResult<number> {
  return useQuery({
    queryKey: [...AUDIT_CENTER_KEY, 'count', toAuditQuery({ ...filters, limit: 1 }).toString()],
    queryFn: async () => (await auditCenterApi.list({ ...filters, limit: 1 })).meta.total,
    enabled,
    staleTime: 30_000,
  });
}

export function useAudit(id: string | undefined) {
  return useQuery({
    queryKey: [...AUDIT_CENTER_KEY, 'one', id],
    queryFn: () => auditCenterApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useAuditFindings(auditId: string | undefined, filters: FindingFilters = {}) {
  const query = toFindingQuery(filters).toString();
  return useQuery({
    queryKey: [...AUDIT_CENTER_KEY, 'findings', auditId, query],
    queryFn: () => auditCenterApi.listFindings(auditId as string, filters),
    enabled: Boolean(auditId),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
}

export function useRefreshAuditCenter() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: AUDIT_CENTER_KEY });
}

export type { AuditEvidence };

// ── Immutable Audit Log ──────────────────────────────────────────────────────
// Read-only by construction: this file exports no create/update/delete for it,
// and the backend route only ever mounts a GET (see backend/src/routes/index.ts).

export const AUDIT_LOG_KEY = ['audit-log'] as const;

export interface AuditLogFilters {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  category?: string;
  actor?: string;
}

export const EMPTY_AUDIT_LOG_FILTERS: AuditLogFilters = {};

function toAuditLogQuery(filters: AuditLogFilters): URLSearchParams {
  const query = new URLSearchParams();
  if (filters.q?.trim()) query.set('q', filters.q.trim());
  if (filters.category) query.set('category', filters.category);
  if (filters.actor) query.set('actor', filters.actor);
  if (filters.sort) query.set('sort', filters.sort);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));
  return query;
}

export const auditLogApi = {
  list: (filters: AuditLogFilters = {}) => apiList<AuditRecord>(`/audit?${toAuditLogQuery(filters)}`),
};

export function useAuditLogList(filters: AuditLogFilters, enabled = true) {
  const query = toAuditLogQuery(filters).toString();
  return useQuery({
    queryKey: [...AUDIT_LOG_KEY, 'list', query],
    queryFn: () => auditLogApi.list(filters),
    enabled,
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
}
