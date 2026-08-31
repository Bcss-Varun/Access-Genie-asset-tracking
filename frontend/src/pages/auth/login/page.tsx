import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/api/auth';
import { DEFAULT_LANDING } from '@/lib/nav-config';

export default function LoginPage() {
  const { session, isBootstrapping, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  /**
   * Signing in lands on the dashboard.
   *
   * It used to return you to whatever page the guard had bounced you off —
   * which meant a session that expired while you were deep in a work order put
   * you back in that work order, mid-task, with no sense of what had changed
   * while you were away. Signing in is the start of a shift, not the
   * continuation of the last one; the dashboard is what that should open on.
   *
   * Two exceptions, both explicit destinations the person chose rather than
   * places they happened to be:
   *
   *   ?next=   the MFA hand-off below, resuming this same sign-in.
   *   /a/:code a QR label. Someone standing at the equipment with a phone
   *            asked for that asset — sending them to a dashboard instead
   *            would make every printed label useless while signed out.
   */
  const from = (location.state as { from?: string } | null)?.from;
  const scanned = from?.startsWith('/a/') ? from : null;
  const next = searchParams.get('next') || scanned || DEFAULT_LANDING;

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

  const field =
    'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition ' +
    'placeholder:text-slate-400 hover:border-slate-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/15';

  return (
    <AuthLayout>
      <div>
        <h2 className="font-heading text-[1.7rem] font-bold tracking-tight text-slate-900">Sign in</h2>
        <p className="mt-1.5 text-sm text-slate-500">Welcome back. Sign in to your workspace.</p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              <span aria-hidden className="mt-px shrink-0">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-slate-700">
              Work email
            </label>
            <input
              id="login-email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              className={field}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="login-password" className="text-sm font-medium text-slate-700">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs font-medium text-primary-600 hover:underline">
                Forgot?
              </Link>
            </div>
            {/*
              Reveal is not a nicety on this form. The password is typed on a
              phone in a warehouse as often as at a desk, and "wrong password" on
              a value that was mistyped is the single most common way people get
              stuck at a login screen.
            */}
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className={`${field} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-400 transition-colors hover:text-slate-700 focus:outline-none focus-visible:text-primary-600"
              >
                <span aria-hidden className="text-sm">{showPassword ? '🙈' : '👁️'}</span>
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full !py-2.5" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
