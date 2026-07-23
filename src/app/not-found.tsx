import Link from 'next/link';

/** Global 404 — renders with the root layout only (no app shell). */
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-6">
      <div className="text-6xl mb-4">🧭</div>
      <h1 className="text-3xl font-heading font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-500 max-w-sm">
        We couldn&apos;t find that page. It may have moved, or the link is out of date.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link href="/" className="text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors">
          Back to Workspace
        </Link>
        <Link href="/help" className="text-sm font-medium text-slate-500 hover:text-slate-800">
          Get help →
        </Link>
      </div>
    </div>
  );
}
