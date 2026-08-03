// ─────────────────────────────────────────────────────────────────────────────
// SavedViewsProvider — views that outlive the page, the tab and the machine.
//
// "+ Save current view" wrote to component state, so a saved view vanished the
// moment you navigated away — which made it a worse Groups replacement than
// Groups. Lifting it to a provider fixed the navigation; storing it in the
// user's preferences document fixes the rest: the view is still there tomorrow,
// on another machine, after the browser has been cleared.
//
// Writes go to the server and its response replaces the cached preferences, so
// there is one source of truth and no local copy to drift from it.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useMemo } from 'react';
import { BUILT_IN_VIEWS, type Lens, type SavedView } from '@/lib/asset-views';
import { preferencesApi, usePreferences, usePreferenceMutation } from '@/api/preferences';
import { useToast } from './ToastProvider';

interface SavedViewsValue {
  /** Built-ins first, then whatever this user has saved. */
  views: SavedView[];
  saveView: (view: Omit<SavedView, 'id' | 'builtIn'>) => void;
  removeView: (id: string) => void;
  renameView: (id: string, name: string) => void;
  /** True while a write is in flight — for disabling the save control. */
  isSaving: boolean;
}

const SavedViewsContext = createContext<SavedViewsValue | null>(null);

export function SavedViewsProvider({ children }: { children: React.ReactNode }) {
  const { data } = usePreferences();
  const { toast } = useToast();

  const create = usePreferenceMutation(preferencesApi.createView);
  const rename = usePreferenceMutation(preferencesApi.renameView);
  const remove = usePreferenceMutation(preferencesApi.removeView);

  // A view is a small, deliberate thing to save, so a failed write has to be
  // said out loud: otherwise someone navigates away trusting it is there.
  const complain = useCallback(
    (describe: string) => (err: Error) =>
      toast({ title: `Could not ${describe}`, description: err.message, tone: 'error' }),
    [toast],
  );

  const saved = data?.savedViews;

  const value = useMemo<SavedViewsValue>(
    () => ({
      // `lens` is a plain string on the wire — the server has no reason to know
      // the union — so it is narrowed back here, at the one point it crosses in.
      views: [...BUILT_IN_VIEWS, ...(saved ?? []).map((v) => ({ ...v, lens: v.lens as Lens }))],

      saveView: (view) =>
        create.mutate([view], {
          onSuccess: () =>
            toast({ title: 'View saved', description: `“${view.name}” is on your view strip.`, tone: 'success' }),
          onError: complain('save that view'),
        }),

      renameView: (id, name) => rename.mutate([id, name], { onError: complain('rename that view') }),
      removeView: (id) => remove.mutate([id], { onError: complain('delete that view') }),

      isSaving: create.isPending || rename.isPending || remove.isPending,
    }),
    [saved, create, rename, remove, toast, complain],
  );

  return <SavedViewsContext.Provider value={value}>{children}</SavedViewsContext.Provider>;
}

export function useSavedViews(): SavedViewsValue {
  const ctx = useContext(SavedViewsContext);
  if (!ctx) throw new Error('useSavedViews must be used within <SavedViewsProvider>');
  return ctx;
}
