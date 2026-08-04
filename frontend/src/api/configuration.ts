import type {
  AiModel,
  ApprovalWorkflow,
  Backup,
  ChecklistTemplate,
  Integration,
  OrgSettings,
  Passkey,
  ReportSubscription,
  RetentionPolicy,
  Session,
  SubscriptionCadence,
  WorkflowStep,
} from '@access-genie/shared';
import { apiDelete, apiGet, apiPatch, apiPost, http } from '@/api/client';

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

export const workflowsApi = {
  create: (body: { name: string; trigger: string; steps: WorkflowStep[]; status?: 'Active' | 'Draft' }) =>
    apiPost<ApprovalWorkflow>('/approval-workflows', body),
  update: (id: string, body: Partial<{ name: string; trigger: string; steps: WorkflowStep[]; status: 'Active' | 'Draft' }>) =>
    apiPatch<ApprovalWorkflow>(`/approval-workflows/${id}`, body),
  remove: (id: string) => apiDelete(`/approval-workflows/${id}`),
};

export const checklistTemplatesApi = {
  list: () => apiGet<ChecklistTemplate[]>('/checklist-templates'),
  create: (body: { name: string; category?: string; icon?: string; description?: string; items: string[] }) =>
    apiPost<ChecklistTemplate>('/checklist-templates', body),
  update: (id: string, body: Partial<{ name: string; category: string; icon: string; description: string; items: string[] }>) =>
    apiPatch<ChecklistTemplate>(`/checklist-templates/${id}`, body),
  remove: (id: string) => apiDelete(`/checklist-templates/${id}`),
};

export const subscriptionsApi = {
  create: (body: { reportId: string; cadence: SubscriptionCadence; format?: string; recipients: string[] }) =>
    apiPost<ReportSubscription>('/report-subscriptions', body),
  update: (
    id: string,
    body: Partial<{ cadence: SubscriptionCadence; format: string; recipients: string[]; enabled: boolean }>,
  ) => apiPatch<ReportSubscription>(`/report-subscriptions/${id}`, body),
  remove: (id: string) => apiDelete(`/report-subscriptions/${id}`),
};

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

// ── Reports: running and downloading ─────────────────────────────────────────
export interface RunResult {
  job: { id: string; report: string; format: string; status: string; sizeKb: number };
  rowCount: number;
}

export const reportRunApi = {
  run: (id: string, format?: string) => apiPost<RunResult>(`/reports/${id}/run`, format ? { format } : {}),

  /**
   * Fetch a produced file and hand it to the browser.
   *
   * Done with a blob rather than by pointing the browser at the URL, because
   * the download endpoint needs the bearer token that only the axios client
   * carries — a plain `<a href>` would arrive unauthenticated.
   */
  download: async (exportId: string): Promise<void> => {
    const res = await http.get(`/exports/${exportId}/download`, { responseType: 'blob' });

    const disposition = String(res.headers['content-disposition'] ?? '');
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `${exportId}.csv`;

    const url = URL.createObjectURL(res.data as Blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Released on the next tick — revoking synchronously can cancel the
    // download in Safari before it has started reading.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  },
};

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
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);

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
