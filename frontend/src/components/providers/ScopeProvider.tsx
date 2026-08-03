import { createContext, useContext, useState, useCallback } from 'react';
import { ScopeNode } from '@access-genie/shared';
import { scopeTree, findScope } from '@/lib/rbac';

interface ScopeContextValue {
  scopeId: string;
  scope: ScopeNode;
  setScopeId: (id: string) => void;
  tree: ScopeNode;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const [scopeId, setScopeIdState] = useState<string>(scopeTree.id);
  const scope = findScope(scopeId) ?? scopeTree;

  const setScopeId = useCallback((id: string) => {
    if (findScope(id)) setScopeIdState(id);
  }, []);

  return (
    <ScopeContext.Provider value={{ scopeId, scope, setScopeId, tree: scopeTree }}>
      {children}
    </ScopeContext.Provider>
  );
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope must be used within <ScopeProvider>');
  return ctx;
}
