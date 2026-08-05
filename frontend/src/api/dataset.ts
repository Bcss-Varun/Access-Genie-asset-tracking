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

/**
 * Which site the payload is narrowed to.
 *
 * Module-level rather than React state, for the same reason the dataset itself
 * is: `fetchDataset` is called from the query function and from the router's
 * loader path, neither of which sits inside the provider tree. The scope
 * provider is the only thing that writes it.
 *
 * `null` means the whole organisation — the server treats an absent `?scope=`
 * as "everything", so the root selection sends nothing rather than sending the
 * root's id and making the server do a filter with no effect.
 */
const SCOPE_STORAGE_KEY = 'ag.scope';
let activeScopeId: string | null = readStoredScope();

function readStoredScope(): string | null {
  try {
    return window.localStorage.getItem(SCOPE_STORAGE_KEY);
  } catch {
    // Private browsing, or storage disabled. Falling back to the whole estate
    // is the safe direction: it shows more, never less than the user expects.
    return null;
  }
}

export function getActiveScope(): string | null {
  return activeScopeId;
}

export function setActiveScope(id: string | null): void {
  activeScopeId = id;
  try {
    if (id) window.localStorage.setItem(SCOPE_STORAGE_KEY, id);
    else window.localStorage.removeItem(SCOPE_STORAGE_KEY);
  } catch {
    // Not fatal — the selection simply will not survive a reload.
  }
}

export async function fetchDataset(): Promise<Dataset> {
  const path = activeScopeId ? `/dataset?scope=${encodeURIComponent(activeScopeId)}` : '/dataset';
  const data = await apiGet<Dataset>(path);
  hydrate(data);
  return data;
}

export function useDataset(): UseQueryResult<Dataset> {
  return useQuery({
    // The scope is part of the identity of this payload: two scopes are two
    // different datasets, and caching them under one key would hand a screen
    // the previous site's rows while the new ones were still in flight.
    queryKey: [...DATASET_KEY, activeScopeId],
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
  // Prefix match, so it invalidates the payload for every scope rather than
  // only the one currently selected — a write is a write regardless of which
  // site was in view when it happened.
  return () => queryClient.invalidateQueries({ queryKey: DATASET_KEY });
}
