'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session, RoleId } from '@/types/platform';
import { mockUsers, defaultUser, buildSession } from '@/lib/rbac';

interface SessionContextValue {
  session: Session;
  /** Demo affordance: switch the active persona (user + role) from the user menu. */
  setPersona: (roleId: RoleId) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const STORAGE_KEY = 'ag.personaRoleId';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(() => buildSession(defaultUser));

  // Restore the last-selected persona on the client (after hydration).
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (saved) {
      const user = mockUsers.find((u) => u.roleId === saved);
      if (user) setSession(buildSession(user));
    }
  }, []);

  const setPersona = useCallback((roleId: RoleId) => {
    const user = mockUsers.find((u) => u.roleId === roleId) ?? defaultUser;
    setSession(buildSession(user));
    try {
      window.localStorage.setItem(STORAGE_KEY, roleId);
    } catch {
      /* ignore */
    }
  }, []);

  return <SessionContext.Provider value={{ session, setPersona }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}
