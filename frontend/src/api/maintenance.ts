import type {
  Certification,
  CycleCount,
  Inspection,
  PmFrequency,
  PmSchedule,
  WorkOrderType,
} from '@access-genie/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';

/**
 * Maintenance and compliance writes.
 *
 * PM schedules, inspections, certifications and cycle counts were all
 * read-only: the screens could show a maintenance and compliance programme, and
 * no part of it could actually be run. Nothing could be scheduled, carried out,
 * renewed or reconciled.
 *
 * Two server rules matter to the callers here, and neither is duplicated in the
 * UI: a certificate's status is derived from its dates, and a cycle count
 * derives its own outcome from what was counted. Both come back on the
 * response.
 */

export const pmApi = {
  create: (body: {
    title: string;
    assetId: string;
    frequency: PmFrequency;
    type?: WorkOrderType;
    nextDue: string;
    estHours?: number;
    assignedTeam?: string;
  }) => apiPost<PmSchedule>('/pm-schedules', body),

  update: (
    id: string,
    body: Partial<{
      title: string;
      frequency: PmFrequency;
      type: WorkOrderType;
      nextDue: string;
      estHours: number;
      assignedTeam: string;
    }>,
  ) => apiPatch<PmSchedule>(`/pm-schedules/${id}`, body),

  remove: (id: string) => apiDelete(`/pm-schedules/${id}`),

  /**
   * Raise every schedule that has fallen due, and advance those schedules.
   *
   * Idempotent: a schedule with an order already open is advanced without
   * raising a second one, so running this twice does not double the queue.
   */
  runAutomation: () =>
    apiPost<{ pmRaised: number; conditionRaised: number; schedulesAdvanced: number }>('/pm-schedules/run-automation'),
};

export const inspectionsApi = {
  create: (body: {
    title: string;
    assetId: string;
    template: string;
    dueDate: string;
    inspector?: string;
    status?: Inspection['status'];
    items?: { label: string; result?: string; note?: string }[];
  }) => apiPost<Inspection>('/inspections', body),

  update: (id: string, body: Record<string, unknown>) => apiPatch<Inspection>(`/inspections/${id}`, body),
  remove: (id: string) => apiDelete(`/inspections/${id}`),
};

export const certificationsApi = {
  /** `status` is computed from the dates server-side, whatever is sent. */
  create: (body: { assetId: string; name: string; authority: string; issuedAt: string; expiresAt: string }) =>
    apiPost<Certification>('/certifications', body),

  update: (id: string, body: Partial<{ name: string; authority: string; issuedAt: string; expiresAt: string }>) =>
    apiPatch<Certification>(`/certifications/${id}`, body),

  remove: (id: string) => apiDelete(`/certifications/${id}`),
};

export const cycleCountsApi = {
  create: (body: { location: string; date: string; expected: number; counted?: number; countedBy?: string }) =>
    apiPost<CycleCount>('/cycle-counts', body),

  /** Sending `counted` makes the server decide Reconciled or Variance. */
  update: (id: string, body: Partial<{ counted: number; countedBy: string; status: CycleCount['status']; date: string }>) =>
    apiPatch<CycleCount>(`/cycle-counts/${id}`, body),

  remove: (id: string) => apiDelete(`/cycle-counts/${id}`),
};

// ── The field queue ──────────────────────────────────────────────────────────
export interface FieldTask {
  id: string;
  kind: 'work-order' | 'inspection';
  title: string;
  assetId: string;
  assetName: string;
  status: string;
  priority: string;
  dueDate: string;
  /** Negative when overdue — the sort key, and what the UI colours by. */
  daysUntilDue: number;
  assignedTo: string;
  lastSeenZone?: string;
  lastSeenState?: string;
}

export interface ScanResult {
  asset: {
    id: string;
    name: string;
    serialNumber: string;
    category: string;
    status: string;
    custodian: string;
    location: string;
    healthScore: number;
    riskScore: number;
  };
  presence?: { zone: string; state: string; lastSeen: string };
  openTasks: FieldTask[];
  actions: { key: string; label: string; hint: string }[];
}

export const fieldApi = {
  /** One person's queue: work orders and inspections merged, overdue first. */
  queue: (assignee?: string) => apiGet<FieldTask[]>('/field/queue', assignee ? { assignee } : undefined),
  all: () => apiGet<FieldTask[]>('/field/queue/all'),

  /**
   * Scan an asset.
   *
   * Records the sighting before returning — somebody physically holding an
   * asset is the highest-confidence observation the system will ever get.
   */
  scan: (assetId: string, zone?: string) => apiPost<ScanResult>(`/field/scan/${assetId}`, zone ? { zone } : {}),
};
