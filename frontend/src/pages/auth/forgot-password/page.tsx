import { Link } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <div>
        <h2 className="text-2xl font-heading font-bold text-slate-900">Recover your account</h2>
        <p className="text-sm text-slate-500 mt-3">
          Email password reset is not available. Contact your organization administrator
          to arrange account recovery.
        </p>
        <Link to="/login" className="mt-6 inline-block text-sm font-medium text-primary-600 hover:underline">
          ← Back to sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
