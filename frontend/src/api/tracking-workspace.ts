import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { apiGet } from '@/api/client';
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

export async function fetchTrackingWorkspace(): Promise<TrackingWorkspace> {
  const data = await apiGet<TrackingWorkspace>('/tracking/workspace');
  hydrateTracking(data);
  return data;
}

export function useTrackingWorkspace(): UseQueryResult<TrackingWorkspace> {
  return useQuery({
    queryKey: TRACKING_KEY,
    queryFn: fetchTrackingWorkspace,
    // Tracking is the one genuinely live surface in the product: positions,
    // alert states and device health all move while you are looking at them.
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useRefreshTracking(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: TRACKING_KEY });
}
