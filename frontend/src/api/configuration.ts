import type {
  AiModel,
  ApprovalTrigger,
  ApprovalWorkflow,
  Backup,
  Integration,
  OrgSettings,
  Passkey,
  RetentionPolicy,
  Session,
  WorkflowStatus,
  WorkflowStep,
} from '@access-genie/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import { saveBlob } from '@/api/download';

/**
 * The configuration write side.
 *
 * Everything here backs a control that used to open a toast and change nothing:
 * connecting a system, drafting an approval chain, writing a checklist,
 * subscribing to a report, rebranding the tenant, enrolling a passkey.
 */

export const integrationsApi = {
  create: (body: { name: string; category: string; description?: string; status?: Integration['status'] }) =>
    apiPost<Integration>('/integrations', body),
  update: (id: string, body: Partial<{ name: string; category: string; description: string; status: Integration['status'] }>) =>
    apiPatch<Integration>(`/integrations/${id}`, body),
  remove: (id: string) => apiDelete(`/integrations/${id}`),
  /**
   * Connecting and disconnecting are the same write with a different value, but
   * they are named separately because the screens read as verbs, and `lastSync`
   * is stamped by the server on either.
   */
  setStatus: (id: string, status: Integration['status']) => apiPatch<Integration>(`/integrations/${id}`, { status }),
};

/**
 * A workflow as the builder submits it.
 *
 * `trigger` is the enum the server acts on, not free text, and a step carries
 * the approver the engine resolves against — see `governance.ts`. The previous
 * shape allowed any string for both, which typechecked and then matched nothing.
 */
export interface WorkflowPayload {
  name: string;
  description: string;
  trigger: ApprovalTrigger;
  scopeId?: string;
  steps: WorkflowStep[];
  status: WorkflowStatus;
}

export const workflowsApi = {
  create: (body: WorkflowPayload) => apiPost<ApprovalWorkflow>('/approval-workflows', body),
  update: (id: string, body: Partial<WorkflowPayload>) =>
    apiPatch<ApprovalWorkflow>(`/approval-workflows/${id}`, body),
  remove: (id: string) => apiDelete(`/approval-workflows/${id}`),
};

// Checklist templates are inspection templates now — see api/inspections.ts.

// Report subscriptions moved to `api/analytics.ts` as schedules, which carry a
// start date, an end date and a real "never run yet" state.

export const orgSettingsApi = {
  get: () => apiGet<OrgSettings>('/org-settings'),
  update: (body: Partial<Omit<OrgSettings, 'id' | 'updatedAt'>>) => apiPatch<OrgSettings>('/org-settings', body),
};

export const passkeysApi = {
  create: (body: { name: string; kind?: string }) => apiPost<Passkey>('/passkeys', body),
  remove: (id: string) => apiDelete(`/passkeys/${id}`),
};

export const backupsApi = {
  create: () => apiPost<Backup>('/backups'),
  /**
   * Always fails, on purpose. The server refuses to overwrite live data from a
   * web request and returns the command to run instead — so the error message
   * is the feature, and the screen shows it rather than swallowing it.
   */
  restore: (id: string) => apiPost<never>(`/backups/${id}/restore`),
};

export const retentionApi = {
  create: (body: { dataClass: string; retention: string; disposal: string; legalHold?: boolean }) =>
    apiPost<RetentionPolicy>('/retention-policies', body),
  remove: (id: string) => apiDelete(`/retention-policies/${id}`),
};

export const profileApi = {
  update: (body: Partial<{ name: string; title: string; phone: string; timezone: string }>) =>
    apiPatch<Session>('/auth/me', body),
};

// ── Reports: running and downloading ────────────────────────────────────────
// Removed. Running and exporting a report now live in `api/analytics.ts`, where
// one request produces the numbers *and* the file. The version here queued a
// job and fetched the artifact separately, which is what let an export appear
// in a list with nothing behind it.

// ── Client-side CSV ──────────────────────────────────────────────────────────
/**
 * Download what is on screen.
 *
 * Distinct from a report run on purpose: "export this table" means the rows the
 * user has filtered to, which only the browser knows. Asking the server would
 * mean re-sending the filter state and getting a different answer if anything
 * changed in between.
 */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]): number {
  if (rows.length === 0) return 0;

  const headers = Object.keys(rows[0] as Record<string, unknown>);
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = [headers.map(cell).join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\r\n');

  // A BOM, so Excel opens UTF-8 without mangling names and currency symbols.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  saveBlob(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);

  return rows.length;
}

export interface WebhookTestResult {
  ok: boolean;
  status: number;
  detail: string;
  ms: number;
}

export const webhookTestApi = {
  /** Sends a real ping. A failed delivery resolves — it is a result, not an error. */
  test: (id: string) => apiPost<WebhookTestResult>(`/webhooks/${id}/test`),
};

export const aiModelsApi = {
  /** Records a model that exists elsewhere. Nothing here trains anything. */
  create: (body: {
    name: string;
    task: string;
    status?: string;
    version?: string;
    accuracy?: number;
    driftPct?: number;
    lastTrained: string;
    owner: string;
    framework?: string;
    predictionsPerDay?: number;
  }) => apiPost<AiModel>('/ai/models', body),

  update: (id: string, body: Record<string, unknown>) => apiPatch<AiModel>(`/ai/models/${id}`, body),
  remove: (id: string) => apiDelete(`/ai/models/${id}`),
};
