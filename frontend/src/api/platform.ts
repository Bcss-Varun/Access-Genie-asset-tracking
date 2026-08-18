import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import type { ApiKey, EscalationPolicy, RetentionPolicy, SupportTicket, Team, Webhook } from '@access-genie/shared';

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

// `exportsApi` and `reportsApi` moved to `api/analytics.ts`. The versions here
// wrote a report as a name, a category and a free-text list of metric strings
// nobody validated; a report is a definition now, and the client that saves one
// is the one that can also run it.

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
  removeEscalationPolicy: (id: string) => apiDelete(`/escalation-policies/${id}`),
  updateRetentionPolicy: (id: string, body: { retention?: string; disposal?: string; legalHold?: boolean }) =>
    apiPatch<RetentionPolicy>(`/retention-policies/${id}`, body),
};
