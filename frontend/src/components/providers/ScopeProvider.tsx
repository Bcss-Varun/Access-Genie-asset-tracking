import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ScopeNode } from '@access-genie/shared';
import { scopeTree, findScope } from '@/lib/rbac';
import { DATASET_KEY, getActiveScope, setActiveScope } from '@/api/dataset';

/**
 * Which part of the organisation is in view.
 *
 * This used to change a label and nothing else: the switcher set an id, one
 * heading read its name, and every screen carried on showing the whole estate.
 * Selecting a site now re-reads the dataset narrowed to that site, so the
 * hundred-odd screens that read from the module bindings are all scoped at
 * once — see the `?scope=` handling in dataset.service.ts for why the filter
 * lives on the server rather than in each screen.
 *
 * The root selection is stored as `null` rather than the org's id: "everything"
 * is the absence of a filter, and encoding it that way means a deployment whose
 * root node is renamed or re-issued does not strand anyone on a stale id.
 */

interface ScopeContextValue {
  scopeId: string;
  scope: ScopeNode;
  setScopeId: (id: string) => void;
  tree: ScopeNode;
  /** True while the narrowed dataset is in flight. */
  isSwitching: boolean;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // Seeded from what was persisted, so a reload keeps the site you were in.
  // Falls back to the root when the stored id no longer resolves — a facility
  // can be deleted while somebody has it selected.
  const [scopeId, setScopeIdState] = useState<string>(() => {
    const stored = getActiveScope();
    return stored && findScope(stored) ? stored : scopeTree.id;
  });
  const [isSwitching, setSwitching] = useState(false);

  const scope = findScope(scopeId) ?? scopeTree;

  const setScopeId = useCallback(
    (id: string) => {
      if (!findScope(id) || id === scopeId) return;

      setScopeIdState(id);
      setActiveScope(id === scopeTree.id ? null : id);
      setSwitching(true);

      // Refetch rather than invalidate: the screens read module bindings that
      // are only rewritten when the payload lands, so an invalidation would
      // leave them showing the previous site until the request happened to
      // resolve. This settles once the new payload has hydrated.
      void queryClient.refetchQueries({ queryKey: DATASET_KEY }).finally(() => setSwitching(false));
    },
    [queryClient, scopeId],
  );

  const value = useMemo(
    () => ({ scopeId, scope, setScopeId, tree: scopeTree, isSwitching }),
    [scopeId, scope, setScopeId, isSwitching],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope must be used within <ScopeProvider>');
  return ctx;
}
