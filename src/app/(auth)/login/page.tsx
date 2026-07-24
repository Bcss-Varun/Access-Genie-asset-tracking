'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';


function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      // Mock auth: only allow specific credentials
      const validAdmin = email === 'admin' && password === 'admin123';
      const validRaj = email === 'raj@bcss.in' && password === 'admin123';

      if (!validAdmin && !validRaj) {
        setLoading(false);
        setError('Incorrect email or password. Please try again.');
        return;
      }
      router.push(next);
    }, 700);
  };

  const useDemo = () => {
    setEmail('raj@bcss.in');
    setPassword('admin123');
    setError(null);
  };

  return (
    <div>
      <h2 className="text-2xl font-heading font-bold text-slate-900">Sign in</h2>
      <p className="text-sm text-slate-500 mt-1">Welcome back. Sign in to your workspace.</p>


      <form onSubmit={submit} className="space-y-4">
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
            <Link href="/forgot-password" className="text-xs text-primary-600 hover:underline">Forgot?</Link>
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

      <p className="mt-6 text-center text-xs text-slate-400">
        New organization? <Link href="/login" className="text-primary-600 hover:underline">Request access</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-slate-100" />}>
      <LoginInner />
    </Suspense>
  );
}
