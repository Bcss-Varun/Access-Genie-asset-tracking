import type {
  AuditSession,
  FirmwareCampaign,
  Incident,
  MovementTxn,
  TrackingAlert,
  TrackingDevice,
} from '@access-genie/shared';
import { apiPatch, apiPost } from '@/api/client';

/**
 * The tracking workspace's write side.
 *
 * These six screens held the largest block of browser-only state in the
 * product: an acknowledged alert, an opened incident, a provisioned device, an
 * asset booked out of a room and a running audit all lived in React and were
 * gone on reload — and were never visible to the colleague watching the same
 * queue, which is the failure that actually matters here.
 */

/** The states the alert queue's buttons can move an alert into. */
export type AlertTransition = 'Acknowledged' | 'Assigned' | 'In Progress' | 'Escalated' | 'Resolved' | 'Closed';

export const trackingAlertsApi = {
  transition: (id: string, to: AlertTransition, note?: string) =>
    apiPost<TrackingAlert>(`/tracking/alerts/${id}/transition`, { to, note }),
  /** One call for a selection — an operator clearing a night's backlog. */
  transitionMany: (ids: string[], to: AlertTransition, note?: string) =>
    apiPost<{ updated: number }>('/tracking/alerts/bulk/transition', { ids, to, note }),
};

export const incidentsApi = {
  open: (body: {
    title: string;
    severity: 'Sev1' | 'Sev2' | 'Sev3';
    facility: string;
    alertIds: string[];
    commander?: string;
    summary?: string;
    nextAction?: string;
  }) => apiPost<Incident>('/tracking/incidents', body),

  setState: (id: string, state: Incident['state']) =>
    apiPost<Incident>(`/tracking/incidents/${id}/state`, { state }),
};

export const automationApi = {
  toggle: (id: string, enabled: boolean) =>
    apiPost<{ id: string; enabled: boolean }>(`/tracking/automation-rules/${id}/toggle`, { enabled }),
};

export const devicesApi = {
  provision: (body: {
    name: string;
    role: TrackingDevice['role'];
    technology: TrackingDevice['technology'];
    facility: string;
    zone?: string;
    firmware?: string;
  }) => apiPost<TrackingDevice>('/tracking/devices', body),

  /** Reboot, mark for maintenance, or queue replacement across a selection. */
  bulkUpdate: (ids: string[], patch: { state?: TrackingDevice['state']; replaceBy?: string }) =>
    apiPost<{ updated: number }>('/tracking/devices/bulk', { ids, ...patch }),

  setCampaignState: (id: string, state: FirmwareCampaign['state']) =>
    apiPost<FirmwareCampaign>(`/tracking/firmware-campaigns/${id}/state`, { state }),
};

export const movementsApi = {
  create: (body: {
    assetId: string;
    assetName: string;
    direction: 'Out' | 'In';
    person: string;
    department?: string;
    purpose?: string;
    location?: string;
    dueBack?: string;
  }) => apiPost<MovementTxn>('/tracking/movements', body),

  update: (id: string, patch: Record<string, unknown>) => apiPatch<MovementTxn>(`/tracking/movements/${id}`, patch),
};

export const auditsApi = {
  start: (body: {
    name: string;
    scope: string;
    facility: string;
    method?: AuditSession['method'];
    expected?: number;
    dueInDays?: number;
  }) => apiPost<AuditSession>('/tracking/audits', body),

  update: (id: string, patch: Record<string, unknown>) => apiPatch<AuditSession>(`/tracking/audits/${id}`, patch),
};
