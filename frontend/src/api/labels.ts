import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { LabelTemplate, PrintDevice, PrintJob } from '@access-genie/shared';
import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '@/api/client';
import { hydrateLabels, type LabelWorkspace } from '@/lib/label-data';

/** Endpoints behind Label & Tag Printing. */
export const labelsApi = {
  templates: () => apiGet<LabelTemplate[]>('/labels/templates'),
  createTemplate: (input: Record<string, unknown>) => apiPost<LabelTemplate>('/labels/templates', input),
  updateTemplate: (id: string, input: Record<string, unknown>) =>
    apiPatch<LabelTemplate>(`/labels/templates/${id}`, input),
  removeTemplate: (id: string) => apiDelete(`/labels/templates/${id}`),

  devices: () => apiGet<PrintDevice[]>('/labels/devices'),

  jobs: (params: { open?: string; deviceId?: string; limit?: number } = {}) =>
    apiList<PrintJob>('/labels/jobs', params as Record<string, unknown>),

  /**
   * Queue a print run. The server refuses a template the chosen device cannot
   * physically produce, so the caller does not have to pre-check the pairing.
   */
  createJob: (input: { templateId: string; deviceId: string; assetIds: string[]; copies?: number }) =>
    apiPost<PrintJob>('/labels/jobs', input),
  cancelJob: (id: string) => apiPost<PrintJob>(`/labels/jobs/${id}/cancel`),
  retryJob: (id: string) => apiPost<PrintJob>(`/labels/jobs/${id}/retry`),
};

export const LABELS_KEY = ['labels', 'workspace'] as const;

async function fetchLabelWorkspace(): Promise<LabelWorkspace> {
  const [templates, devices, jobs] = await Promise.all([
    labelsApi.templates(),
    labelsApi.devices(),
    labelsApi.jobs({ limit: 100 }),
  ]);

  const workspace: LabelWorkspace = { templates, devices, jobs: jobs.items };
  hydrateLabels(workspace);
  return workspace;
}

/**
 * The labelling workspace. Three small collections that are always read
 * together — a template is chosen, a device is chosen, and the job joins them —
 * so they are fetched as one unit and hydrated into lib/label-data.ts.
 */
export function useLabelWorkspace(): UseQueryResult<LabelWorkspace> {
  return useQuery({
    queryKey: LABELS_KEY,
    queryFn: fetchLabelWorkspace,
    // Device state and queue depth move while a run is in progress.
    staleTime: 15_000,
  });
}

export function useRefreshLabels(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: LABELS_KEY });
}
