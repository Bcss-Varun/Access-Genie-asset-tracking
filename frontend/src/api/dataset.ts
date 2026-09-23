import { useSyncExternalStore } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { http, ApiRequestError } from '@/api/client';
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

/**
 * Which site the payload is narrowed to.
 *
 * Module-level rather than React state, for the same reason the dataset itself
 * is: query functions hydrate shared module bindings. Scope changes and
 * session changes advance a generation so obsolete responses cannot hydrate.
 *
 * `null` means the whole organisation — the server treats an absent `?scope=`
 * as "everything", so the root selection sends nothing rather than sending the
 * root's id and making the server do a filter with no effect.
 */
const SCOPE_STORAGE_KEY = 'ag.scope';
let activeScopeId: string | null = readStoredScope();
let generation = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function resetDatasetScope(): void { setActiveScope(null); }
export function useDatasetIdentity(): string { return useSyncExternalStore(subscribe, () => `${generation}:${activeScopeId ?? ''}`); }


function readStoredScope(): string | null {
  try {
    return window.localStorage.getItem(SCOPE_STORAGE_KEY);
  } catch {
    // Without local storage, the API returns the signed-in user’s allowed estate.
    return null;
  }
}

export function getDatasetGeneration(): number { return generation; }

export function getActiveScope(): string | null {
  return activeScopeId;
}

export function setActiveScope(id: string | null): void {
  activeScopeId = id;
  generation += 1;
  try {
    if (id) window.localStorage.setItem(SCOPE_STORAGE_KEY, id);
    else window.localStorage.removeItem(SCOPE_STORAGE_KEY);
  } catch {
    // Not fatal — the selection simply will not survive a reload.
  }
  listeners.forEach((listener) => listener());
}

export function datasetOptions() {
  const scope = activeScopeId;
  const version = generation;
  return {
    // A selection gets a fresh query, even when revisiting an earlier site.
    // Legacy module bindings cannot safely display a cached, unhydrated scope.
    queryKey: [...DATASET_KEY, scope, version],
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Dataset> => {
      const { data: response } = await http.get('/dataset', { params: scope ? { scope } : undefined, signal });
      if (!response.success) throw new ApiRequestError(response.error.message, response.error.code, 200);
      const data = response.data as Dataset;
      if (!signal.aborted && scope === activeScopeId && version === generation) hydrate(data);
      return data;
    },
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
  };
}

export function useDataset(): UseQueryResult<Dataset> {
  useDatasetIdentity();
  return useQuery(datasetOptions());
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
  // Prefix match, so it invalidates the payload for every scope rather than
  // only the one currently selected — a write is a write regardless of which
  // site was in view when it happened.
  return () => queryClient.invalidateQueries({ queryKey: DATASET_KEY });
}
