import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { cn } from '@/lib/format';
import { authApi } from './auth-api';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { session, isBootstrapping, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('raj@bcss.in');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The seeded accounts, so a reviewer can try each role without a user list.
  const { data: personas } = useQuery({
    queryKey: ['personas'],
    queryFn: authApi.personas,
    staleTime: Infinity,
  });

  if (isBootstrapping) return <div className="min-h-screen bg-background" />;
  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* ── Brand panel ─────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between bg-slate-900 text-white p-12">
        <img src="/access-genie-logo.png" alt="Access Genie" className="w-44 h-auto rounded-lg" />

        <div className="max-w-md">
          <h1 className="font-heading text-4xl font-bold leading-tight">
            One asset graph.
            <br />
            Every answer.
          </h1>
          <p className="mt-4 text-slate-300 leading-relaxed">
            Real-time tracking across RFID, BLE, GPS, QR and UWB — joined to AI intelligence, digital asset passports,
            predictive maintenance and compliance monitoring on a single record.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {[
              'Live location for every tracked asset',
              'Predictive failure with explainable drivers',
              'Automated work orders and chain of custody',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary-400 shrink-0" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-500">Powered by Blue Cloud Softech Solutions Ltd.</p>
      </div>

      {/* ── Form ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <img src="/access-genie-logo.png" alt="Access Genie" className="w-32 h-auto rounded-lg mb-8 lg:hidden" />

          <h2 className="font-heading text-2xl font-bold text-slate-900">Sign in</h2>
          <p className="text-slate-500 mt-1 text-sm">Use your Access Genie account to continue.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Work email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-health-critical bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full justify-center" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {/* Demo personas — one click fills the form for each seeded role. */}
          {personas && personas.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-3">
                Demo accounts · password <span className="font-mono text-slate-500">Genie@2026</span>
              </p>
              <div className="grid gap-1.5">
                {personas.map((persona) => (
                  <button
                    key={persona.email}
                    type="button"
                    onClick={() => {
                      setEmail(persona.email);
                      setPassword('Genie@2026');
                      setError(null);
                    }}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                      email === persona.email ? 'bg-primary-50' : 'hover:bg-slate-100',
                    )}
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-white text-[11px] font-bold shrink-0">
                      {persona.initials}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800 truncate">{persona.name}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{persona.roleName}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
