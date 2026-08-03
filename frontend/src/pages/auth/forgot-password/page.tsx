import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { AuthLayout } from '@/components/layout/AuthLayout';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 700);
  };

  if (sent) {
    return (
      <AuthLayout>
        <div className="text-center">
        <div className="text-4xl mb-3">📨</div>
        <h2 className="text-2xl font-heading font-bold text-slate-900">Check your email</h2>
        <p className="text-sm text-slate-500 mt-2">
          If an account exists for <span className="font-medium text-slate-700">{email}</span>, a reset link is on
          its way. The link expires in 30 minutes.
        </p>
          <Link to="/login" className="mt-6 inline-block text-sm font-medium text-primary-600 hover:underline">
            ← Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div>
        <h2 className="text-2xl font-heading font-bold text-slate-900">Reset your password</h2>
      <p className="text-sm text-slate-500 mt-1">Enter your work email and we&apos;ll send a reset link.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Work email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
          />
        </label>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <Link to="/login" className="mt-6 inline-block text-sm font-medium text-slate-500 hover:text-slate-800">
        ← Back to sign in
      </Link>
    </div>
    </AuthLayout>
  );
}
