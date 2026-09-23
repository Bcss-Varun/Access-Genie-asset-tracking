import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { http, ApiRequestError } from '@/api/client';
import { getActiveScope, getDatasetGeneration, useDatasetIdentity } from '@/api/dataset';
import { hydrateTracking, type TrackingWorkspace } from '@/lib/tracking-data';

/**
 * The tracking estate, in one payload.
 *
 * Same shape as the reference dataset (see api/dataset.ts) and for the same
 * reason: the six workspace screens each read several slices at once, so one
 * request with one loading state beats seventeen with seventeen.
 *
 * It is a separate query from the dataset because it is separately scoped —
 * only the `tracking` module fetches it, and only the tracking routes wait on
 * it, so a user who never opens the workspace never pays for it.
 */
export const TRACKING_KEY = ['tracking', 'workspace'] as const;

export async function fetchTrackingWorkspace(signal?: AbortSignal, scope = getActiveScope(), generation = getDatasetGeneration()): Promise<TrackingWorkspace> {
  const { data: response } = await http.get('/tracking/workspace', { params: scope ? { scope } : undefined, signal });
  if (!response.success) throw new ApiRequestError(response.error.message, response.error.code, 200);
  const data = response.data as TrackingWorkspace;
  if (!signal?.aborted && scope === getActiveScope() && generation === getDatasetGeneration()) hydrateTracking(data);
  return data;
}

export function useTrackingWorkspace(): UseQueryResult<TrackingWorkspace> {
  const identity = useDatasetIdentity();
  const scope = getActiveScope();
  const generation = getDatasetGeneration();
  return useQuery({
    queryKey: [...TRACKING_KEY, identity],
    queryFn: ({ signal }) => fetchTrackingWorkspace(signal, scope, generation),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useRefreshTracking(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: TRACKING_KEY });
}
