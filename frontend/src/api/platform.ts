import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import type { ApiKey, EscalationPolicy, Report, RetentionPolicy, SupportTicket, Team, Webhook } from '@access-genie/shared';

/**
 * The platform-administration collections.
 *
 * Every call here replaces a screen that used to change React state and raise a
 * toast: a revoked API key came back on reload, a support ticket was never
 * raised, a report the builder said it had saved did not exist. The endpoints
 * behind these are the same resource factory the reads go through — see
 * backend/src/controllers/resource.controller.ts.
 */

/** The one response that carries the secret. It is not stored and never returned again. */
export interface IssuedApiKey extends ApiKey {
  secret: string;
}

export const apiKeysApi = {
  list: () => apiGet<ApiKey[]>('/api-keys'),
  create: (body: { name: string; scope: 'organization' | 'personal'; scopes: string[] }) =>
    apiPost<IssuedApiKey>('/api-keys', body),
  update: (id: string, body: { name?: string; scopes?: string[] }) => apiPatch<ApiKey>(`/api-keys/${id}`, body),
  /** Revokes rather than deletes — the audit log still has to resolve the key. */
  revoke: (id: string) => apiDelete<ApiKey>(`/api-keys/${id}`),
};

export const supportApi = {
  list: () => apiGet<SupportTicket[]>('/support-tickets'),
  create: (body: { subject: string; category: string; priority?: string; body?: string }) =>
    apiPost<SupportTicket>('/support-tickets', body),
  update: (id: string, body: Record<string, unknown>) => apiPatch<SupportTicket>(`/support-tickets/${id}`, body),
};

export const exportsApi = {
  create: (body: { report: string; format: string; requestedBy: string }) =>
    apiPost<{ id: string }>('/exports', body),
};

export const reportsApi = {
  list: () => apiGet<Report[]>('/reports'),
  create: (body: {
    name: string;
    category: string;
    persona: string;
    format: string;
    description?: string;
    metrics?: string[];
    scheduled?: boolean;
  }) => apiPost<Report>('/reports', body),
  update: (id: string, body: Record<string, unknown>) => apiPatch<Report>(`/reports/${id}`, body),
  remove: (id: string) => apiDelete(`/reports/${id}`),
};

export const teamsApi = {
  create: (body: { name: string; department: string; emoji?: string; description?: string; memberIds?: string[] }) =>
    apiPost<Team>('/teams', body),
  update: (id: string, body: Record<string, unknown>) => apiPatch<Team>(`/teams/${id}`, body),
  remove: (id: string) => apiDelete(`/teams/${id}`),
};

export const webhooksApi = {
  create: (body: { url: string; events: string[]; enabled?: boolean }) => apiPost<Webhook>('/webhooks', body),
  update: (id: string, body: { url?: string; events?: string[]; enabled?: boolean }) =>
    apiPatch<Webhook>(`/webhooks/${id}`, body),
  remove: (id: string) => apiDelete(`/webhooks/${id}`),
};

export const governanceApi = {
  createEscalationPolicy: (body: Record<string, unknown>) => apiPost<EscalationPolicy>('/escalation-policies', body),
  updateEscalationPolicy: (id: string, body: Record<string, unknown>) =>
    apiPatch<EscalationPolicy>(`/escalation-policies/${id}`, body),
  updateRetentionPolicy: (id: string, body: { retention?: string; disposal?: string; legalHold?: boolean }) =>
    apiPatch<RetentionPolicy>(`/retention-policies/${id}`, body),
};
