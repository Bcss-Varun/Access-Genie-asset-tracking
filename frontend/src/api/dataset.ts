import { useCallback, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
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
    // Thirty seconds, like every other query. At five minutes, a screen opened
    // after someone else's change kept showing the old record for that long.
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  };
}

export function useDataset(): UseQueryResult<Dataset> {
  useDatasetIdentity();
  return useQuery(datasetOptions());
}

/**
 * Query roots a write never changes — or that must not be re-read under someone
 * mid-edit (the registration form re-seeds its fields from its query).
 */
const UNAFFECTED_BY_WRITES = new Set(['auth', 'preferences', 'registration-form', 'registration-defaults', 'field-catalog', 'clone-source']);

/**
 * Re-read everything a write can have changed.
 *
 * It used to re-read only the dataset. But roughly twenty screens keep their own
 * query — the maintenance board, inspections, predictive alerts, approvals,
 * notifications, both dashboards, analytics — so a work order raised from Asset
 * 360 never reached the board, an acknowledgement never reached the dashboard
 * tile, and the bell kept its old count, until a reload. A write is cross-module
 * by nature, so the refresh is too: every data query is marked stale, and the
 * ones on screen are re-read now. Inactive ones re-read when next opened.
 */
export function refreshAfterWrite(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => !UNAFFECTED_BY_WRITES.has(String(query.queryKey[0])),
  });
}

/** Every mutation in the app ends with this — see {@link refreshAfterWrite}. */
export function useRefreshDataset(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(() => refreshAfterWrite(queryClient), [queryClient]);
}

/** The payloads screens read through module bindings rather than a hook. */
const HYDRATED_ROOTS = new Set(['dataset', 'tracking', 'labels']);

/**
 * Changes whenever a hydrated payload (dataset, tracking, labels) is re-read.
 *
 * Screens read those payloads from module bindings, so nothing told them a
 * refresh had landed: a screen stayed on whatever it rendered first until it
 * happened to re-render for another reason. Calling this subscribes the caller,
 * and is also the right dependency for any memo derived from those bindings.
 */
export function useDataVersion(): string {
  const queryClient = useQueryClient();
  const cache = queryClient.getQueryCache();
  return useSyncExternalStore(
    useCallback(
      (onChange: () => void) =>
        cache.subscribe((event) => {
          if (event.type !== 'updated' && event.type !== 'removed') return;
          if (!HYDRATED_ROOTS.has(String(event.query.queryKey[0]))) return;
          // The cache can emit while another component is rendering (a gate
          // creating its query); notifying synchronously then re-rendered this
          // screen mid-render, which React rejects. A microtask is after it.
          queueMicrotask(onChange);
        }),
      [cache],
    ),
    () =>
      cache
        .getAll()
        .filter((query) => HYDRATED_ROOTS.has(String(query.queryKey[0])))
        .map((query) => query.state.dataUpdatedAt)
        .join(':'),
  );
}
