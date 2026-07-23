'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';

function MfaInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/';
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

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length < 6) {
      setError('Enter all 6 digits.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      // Mock: code ending in 000 fails, to demo the error state.
      if (code.endsWith('000')) {
        setLoading(false);
        setError('That code is incorrect or expired. Try again.');
        setDigits(['', '', '', '', '', '']);
        refs.current[0]?.focus();
        return;
      }
      router.push(next);
    }, 700);
  };

  return (
    <div>
      <h2 className="text-2xl font-heading font-bold text-slate-900">Two-factor authentication</h2>
      <p className="text-sm text-slate-500 mt-1">Enter the 6-digit code from your authenticator app.</p>

      <form onSubmit={verify} className="mt-6 space-y-5">
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

      <button
        onClick={() => router.push(next)}
        className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        🔑 Use a passkey instead
      </button>

      <p className="mt-5 text-center text-xs text-slate-400">
        {seconds > 0 ? (
          <>Resend code in {seconds}s</>
        ) : (
          <button onClick={() => setSeconds(30)} className="text-primary-600 hover:underline">Resend code</button>
        )}
      </p>
    </div>
  );
}

export default function MfaPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-slate-100" />}>
      <MfaInner />
    </Suspense>
  );
}
