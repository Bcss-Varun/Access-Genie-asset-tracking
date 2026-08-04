import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { DEFAULT_LANDING } from '@/lib/nav-config';
import { useAuth } from '@/api/auth';
import { ApiRequestError } from '@/api/client';

function MfaInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyMfa } = useAuth();
  const [search] = useSearchParams();

  // Handed over by the login screen. Arriving here without one means the page
  // was opened directly, and there is nothing to verify against.
  const challengeToken = (location.state as { challengeToken?: string } | null)?.challengeToken ?? '';
  // Same default as the password step — an MFA challenge is part of signing in,
  // not a separate journey, so completing it lands in the same place.
  const next = search.get('next') || DEFAULT_LANDING;
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(30);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const nextD = [...prev];
      nextD[i] = clean;
      return nextD;
    });
    if (clean && i < 5) refs.current[i + 1]?.focus();
    setError(null);
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length < 6) {
      setError('Enter all 6 digits.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await verifyMfa(challengeToken, code);
      navigate(next, { replace: true });
    } catch (err) {
      setLoading(false);
      setError(err instanceof ApiRequestError ? err.message : 'That code is incorrect or expired. Try again.');
      setDigits(['', '', '', '', '', '']);
      refs.current[0]?.focus();
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-heading font-bold text-slate-900">Two-factor authentication</h2>
      <p className="text-sm text-slate-500 mt-1">Enter the 6-digit code from your authenticator app.</p>

      {!challengeToken && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          There is no sign-in in progress.{' '}
          <Link to="/auth/login" className="font-semibold underline">
            Start from the sign-in screen
          </Link>
          .
        </div>
      )}

      <form onSubmit={(e) => void verify(e)} className="mt-6 space-y-5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <div className="flex justify-between gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { refs.current[i] = el; }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              inputMode="numeric"
              maxLength={1}
              aria-label={`Digit ${i + 1}`}
              className="h-12 w-full rounded-lg border border-slate-300 text-center text-lg font-semibold outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
            />
          ))}
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Verifying…' : 'Verify'}
        </Button>
      </form>

      {/*
        No "resend" and no passkey fallback. A TOTP code is generated on the
        device, so there is nothing to resend; a passkey button that signs you
        in without a passkey would defeat the factor it is standing in for.
        A recovery code goes in the same boxes and is accepted by the same
        endpoint.
      */}
      <p className="mt-5 text-center text-xs text-slate-400">
        Lost your device? Enter one of your recovery codes instead — it works in the same field and can only be used
        once.
      </p>
    </div>
  );
}

export default function MfaPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-slate-100" />}>
        <MfaInner />
      </Suspense>
    </AuthLayout>
  );
}
