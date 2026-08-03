import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import { useAuth } from '@/api/auth';
import type { Lens, SavedView } from '@/lib/asset-views';

/**
 * Per-user interface state, in MongoDB.
 *
 * The theme used to be a `localStorage` key, the facility scope a
 * `sessionStorage` key, and saved views React state that died on navigation.
 * All three now round-trip through `/me/preferences`, so a preference set on
 * one machine is already applied on the next, and clearing the browser loses
 * nothing.
 *
 * Writes are fire-and-forget against the cache: `setQueryData` applies the
 * server's response, so the UI never waits on a round trip to change a theme.
 */

export type Theme = 'light' | 'dark' | 'system';

/** A saved view as it crosses the wire — `lens` is a plain string there. */
export type StoredView = Omit<SavedView, 'builtIn' | 'lens'> & { lens: string };

export interface Preferences {
  theme: Theme;
  activeFacility: string | null;
  activeScope: string | null;
  savedViews: StoredView[];
  dismissed: string[];
}

export interface PreferencesPatch {
  theme?: Theme;
  activeFacility?: string | null;
  activeScope?: string | null;
  dismissed?: string[];
}

export const PREFERENCES_KEY = ['preferences'] as const;

export const preferencesApi = {
  get: () => apiGet<Preferences>('/me/preferences'),
  update: (patch: PreferencesPatch) => apiPatch<Preferences>('/me/preferences', patch),
  createView: (view: { name: string; search: string; status: string; category: string; lens: Lens }) =>
    apiPost<Preferences>('/me/views', view),
  renameView: (id: string, name: string) => apiPatch<Preferences>(`/me/views/${id}`, { name }),
  removeView: (id: string) => apiDelete<Preferences>(`/me/views/${id}`),
};

/**
 * Preferences are read once per session and then kept in the cache. They change
 * only through the mutations below, which write the response straight back — so
 * there is nothing to refetch and no window where the UI disagrees with the
 * server.
 *
 * Gated on the session because the endpoint is authenticated: without the gate
 * the theme provider — which sits above the router, and so renders on the login
 * screen too — would fire a 401 on every visit by a signed-out user and trip
 * the client's session-expired handler.
 */
export function usePreferences(): UseQueryResult<Preferences> {
  const { session } = useAuth();

  return useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: preferencesApi.get,
    enabled: session !== null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Every preference write funnels through here so the cache update is written once. */
export function usePreferenceMutation<TArgs extends unknown[]>(
  request: (...args: TArgs) => Promise<Preferences>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: TArgs) => request(...args),
    onSuccess: (preferences) => queryClient.setQueryData(PREFERENCES_KEY, preferences),
  });
}
