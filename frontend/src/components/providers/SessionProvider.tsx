import { useAuth } from '@/api/auth';
import type { Session } from '@access-genie/shared';

/**
 * Session accessor in the shape the ported prototype screens expect
 * (`const { session } = useSession()`), backed by the real authenticated
 * session rather than the prototype's local persona state.
 *
 * The prototype switched persona in-memory from the user menu; here a persona
 * *is* an account, so switching means signing in as them. That is the whole
 * difference, and it is why this is a thin adapter instead of a copy.
 */
export function useSession(): { session: Session } {
  const { session } = useAuth();
  if (!session) throw new Error('useSession used outside an authenticated route');
  return { session };
}
