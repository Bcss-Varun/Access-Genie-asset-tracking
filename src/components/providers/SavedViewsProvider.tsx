'use client';

// ─────────────────────────────────────────────────────────────────────────────
// SavedViewsProvider — views that outlive the page you created them on.
//
// Until now "+ Save current view" wrote to component state, so a saved view
// vanished the moment you navigated away. That made it a worse Groups
// replacement than Groups. Lifting it to a provider is what turns a filter into
// something you can actually keep and come back to.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { BUILT_IN_VIEWS, type SavedView } from '@/lib/asset-views';

interface SavedViewsValue {
  /** Built-ins first, then whatever this session has saved. */
  views: SavedView[];
  saveView: (view: Omit<SavedView, 'id' | 'builtIn'>) => SavedView;
  removeView: (id: string) => void;
  renameView: (id: string, name: string) => void;
}

const SavedViewsContext = createContext<SavedViewsValue | null>(null);

export function SavedViewsProvider({ children }: { children: React.ReactNode }) {
  const [custom, setCustom] = useState<SavedView[]>([]);

  const saveView = useCallback((view: Omit<SavedView, 'id' | 'builtIn'>) => {
    const created: SavedView = { ...view, id: `v-${view.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.parse('2026-07-23')}` };
    setCustom((prev) => {
      // Saving under an existing name overwrites it rather than duplicating.
      const without = prev.filter((v) => v.name !== created.name);
      return [...without, created];
    });
    return created;
  }, []);

  const value = useMemo<SavedViewsValue>(
    () => ({
      views: [...BUILT_IN_VIEWS, ...custom],
      saveView,
      removeView: (id) => setCustom((prev) => prev.filter((v) => v.id !== id)),
      renameView: (id, name) => setCustom((prev) => prev.map((v) => (v.id === id ? { ...v, name } : v))),
    }),
    [custom, saveView],
  );

  return <SavedViewsContext.Provider value={value}>{children}</SavedViewsContext.Provider>;
}

export function useSavedViews(): SavedViewsValue {
  const ctx = useContext(SavedViewsContext);
  if (!ctx) throw new Error('useSavedViews must be used within <SavedViewsProvider>');
  return ctx;
}
