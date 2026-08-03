import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { apiGet } from '@/api/client';
import { hydrate, type Dataset } from '@/lib/dataset';

/**
 * The reference dataset every screen reads.
 *
 * Hydration happens inside the query function rather than in a component: it is
 * a side effect on module state, and doing it during render would make the
 * render impure and its ordering dependent on React's scheduling. Doing it here
 * means that by the time any component sees `data`, `@/lib/dataset` is already
 * consistent with it.
 */
export const DATASET_KEY = ['dataset'] as const;

export async function fetchDataset(): Promise<Dataset> {
  const data = await apiGet<Dataset>('/dataset');
  hydrate(data);
  return data;
}

export function useDataset(): UseQueryResult<Dataset> {
  return useQuery({
    queryKey: DATASET_KEY,
    queryFn: fetchDataset,
    // The dataset backs whole screens, so refetching it is disruptive; it is
    // invalidated explicitly after a write instead (see `useRefreshDataset`).
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

/**
 * Re-read the dataset after a write.
 *
 * Every mutation in the app ends with this. It is deliberately coarse — one key
 * for the whole reference set — because the screens are cross-cutting: creating
 * an asset changes the registry, the dashboards, the class counts and the
 * activity feed, and enumerating that list at each call site is how those lists
 * fall out of date.
 */
export function useRefreshDataset(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: DATASET_KEY });
}
