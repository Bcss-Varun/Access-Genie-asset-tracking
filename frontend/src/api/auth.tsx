import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { hasModule, type ModuleKey, type Session } from '@access-genie/shared';
import { setAccessToken, setSessionExpiredHandler } from '@/api/client';
import { authApi, isMfaChallenge } from './auth-endpoints';

interface AuthContextValue {
  session: Session | null;
  /** True until the initial silent refresh settles — gate routing on this. */
  isBootstrapping: boolean;
  /**
   * Sign in.
   *
   * Resolves to a challenge token when the account has a second factor: the
   * password was right, but there is no session yet and the caller has to
   * complete `verifyMfa` before there is one.
   */
  login: (email: string, password: string) => Promise<{ mfaRequired: true; challengeToken: string } | null>;
  /** Exchange an MFA challenge for the session. */
  verifyMfa: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Re-read the session from the server.
   *
   * Needed after anything that changes who you are or what you may do — editing
   * your own profile, or an administrator changing your role's grants. Without
   * it the header keeps the old name and the sidebar keeps the old modules
   * until the next full reload.
   */
  refreshSession: () => Promise<void>;
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
      const result = await authApi.login(email, password);

      if (isMfaChallenge(result)) {
        // No token, no session — the screen routes to the code step and comes
        // back through `verifyMfa`.
        return { mfaRequired: true as const, challengeToken: result.challengeToken };
      }

      setAccessToken(result.accessToken);
      setSession({ user: result.user, role: result.role, modules: result.modules });
      queryClient.clear();
      return null;
    },
    [queryClient],
  );

  const verifyMfa = useCallback(
    async (challengeToken: string, code: string) => {
      const auth = await authApi.verifyMfa(challengeToken, code);
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

  const refreshSession = useCallback(async () => {
    // Failure is deliberately swallowed: this runs after a successful write, and
    // a stale header is a far better outcome than throwing the user out of a
    // screen whose save actually landed.
    try {
      const me = await authApi.me();
      setSession({ user: me.user, role: me.role, modules: me.modules });
    } catch {
      /* keep the current session */
    }
  }, []);

  const can = useCallback((module: ModuleKey) => (session ? hasModule(session.modules, module) : false), [session]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, isBootstrapping, login, verifyMfa, logout, refreshSession, can }),
    [session, isBootstrapping, login, verifyMfa, logout, refreshSession, can],
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
