import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ApiRequestError } from '@/api/client';
import { authApi } from '@/api/auth-endpoints';
import { useAuth } from '@/api/auth';
import { DEFAULT_LANDING } from '@/lib/nav-config';

/**
 * Password the account shortcuts prefill.
 *
 * Env-driven rather than written into this file: it has to agree with the API's
 * ADMIN_PASSWORD (or SEED_PASSWORD, if the demo fixtures were loaded), and a
 * literal here would silently drift the moment either changed. Unset — the
 * default — means the shortcuts fill the email only, which is what you want
 * anywhere the account is real: a shortcut that prefills a *stale* password is
 * worse than one that prefills none, because it fails as "incorrect password"
 * against credentials that are in fact correct.
 */
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? '';

export default function LoginPage() {
  const { session, isBootstrapping, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Where to land afterwards: an explicit `?next=`, otherwise the route the
   * guard bounced away from, otherwise the default landing page.
   *
   * `from === '/'` is treated as "nowhere in particular" rather than as a
   * destination. Opening the app at its root while signed out is the ordinary
   * way in, and `RequireAuth` records that as `from: '/'` — so honouring it
   * literally would send every normal sign-in to the workspace and make the
   * default landing page apply to almost nobody.
   */
  const from = (location.state as { from?: string } | null)?.from;
  const next = searchParams.get('next') || (from && from !== '/' ? from : DEFAULT_LANDING);

  // The seeded accounts, so a first sign-in does not require knowing one.
  const { data: personas } = useQuery({
    queryKey: ['personas'],
    queryFn: authApi.personas,
    staleTime: Infinity,
  });

  // Hold the screen while the silent refresh settles, so reloading an
  // authenticated session does not flash the login form on the way through.
  if (isBootstrapping) return <div className="min-h-screen bg-background" />;
  if (session) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const challenge = await login(email, password);

      // A correct password against an MFA-protected account is not a session
      // yet: the challenge token is carried to the code step, which exchanges
      // it. It is deliberately not persisted anywhere — it expires in five
      // minutes and only completes this one sign-in.
      if (challenge) {
        navigate(`/auth/mfa?next=${encodeURIComponent(next)}`, {
          replace: true,
          state: { challengeToken: challenge.challengeToken, email },
        });
        return;
      }

      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Sign-in failed. Please try again.');
      setLoading(false);
    }
  }

  /**
   * Fill in an account. The password is only touched when one is configured —
   * otherwise a click would wipe a password the person had already typed.
   */
  const pick = (personaEmail: string) => {
    setEmail(personaEmail);
    if (DEMO_PASSWORD) setPassword(DEMO_PASSWORD);
    setError(null);
  };

  const useDemo = () => pick(personas?.[0]?.email ?? '');

  return (
    <AuthLayout>
      <div>
        <h2 className="text-2xl font-heading font-bold text-slate-900">Sign in</h2>
        <p className="text-sm text-slate-500 mt-1">Welcome back. Sign in to your workspace.</p>

        <form onSubmit={submit} className="space-y-4 mt-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Work email</span>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
            />
          </label>
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Password</span>
              <Link to="/forgot-password" className="text-xs text-primary-600 hover:underline">Forgot?</Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
            />
          </label>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <button onClick={useDemo} className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-800">
          Use demo account →
        </button>

        {/* The seeded personas, so each role can be tried without a user list. */}
        {personas && personas.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Sign in as</p>
            <div className="space-y-1">
              {personas.map((p) => (
                <button
                  key={p.email}
                  type="button"
                  onClick={() => pick(p.email)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="h-6 w-6 shrink-0 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center">
                    {p.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-slate-700 truncate">{p.name}</span>
                    <span className="block text-[11px] text-slate-400 truncate">{p.roleName}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
