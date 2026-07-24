import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { hasModule, type ModuleKey, type Session } from '@access-genie/shared';
import { setAccessToken, setSessionExpiredHandler } from '@/lib/api-client';
import { authApi } from './auth-api';

interface AuthContextValue {
  session: Session | null;
  /** True until the initial silent refresh settles — gate routing on this. */
  isBootstrapping: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (module: ModuleKey) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const queryClient = useQueryClient();

  /**
   * On load, try to trade the refresh cookie for a session.
   *
   * Failure here is the *normal* path for a signed-out visitor, so it resolves
   * quietly to "no session" rather than surfacing an error.
   */
  useEffect(() => {
    let cancelled = false;

    authApi
      .refresh()
      .then((auth) => {
        if (cancelled) return;
        setAccessToken(auth.accessToken);
        setSession({ user: auth.user, role: auth.role, modules: auth.modules });
      })
      .catch(() => {
        if (!cancelled) setAccessToken(null);
      })
      .finally(() => {
        if (!cancelled) setIsBootstrapping(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // When the API says a session is unrecoverable, drop it and clear cached
  // data so the next user cannot see the previous one's rows.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setSession(null);
      queryClient.clear();
    });
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      const auth = await authApi.login(email, password);
      setAccessToken(auth.accessToken);
      setSession({ user: auth.user, role: auth.role, modules: auth.modules });
      queryClient.clear();
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Local state is cleared even if the network call fails — the user asked
      // to be logged out, and the refresh cookie expires on its own regardless.
      setAccessToken(null);
      setSession(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const can = useCallback((module: ModuleKey) => (session ? hasModule(session.modules, module) : false), [session]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, isBootstrapping, login, logout, can }),
    [session, isBootstrapping, login, logout, can],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Convenience for screens that are only reachable when signed in. */
export function useSession(): Session {
  const { session } = useAuth();
  if (!session) throw new Error('useSession used outside an authenticated route');
  return session;
}
