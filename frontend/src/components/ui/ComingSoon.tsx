import { Link } from 'react-router-dom';
import { PageHeader } from './primitives';

/** Honest placeholder for routes that are specced in the blueprint but not yet
 *  built in the demo — so nav never dead-ends. */
export function ComingSoon({
  title,
  subtitle,
  blueprint,
  breadcrumb,
}: {
  title: string;
  subtitle?: string;
  blueprint?: string; // e.g. "docs/06-page-catalog.md §I"
  breadcrumb?: { label: string; href?: string }[];
}) {
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader title={title} subtitle={subtitle} breadcrumb={breadcrumb} />
      <div className="glass-panel rounded-xl flex-1 min-h-[360px] flex flex-col items-center justify-center text-center p-8">
        <div className="text-5xl mb-4">🚧</div>
        <h2 className="text-lg font-heading font-bold text-slate-800">This module is on the roadmap</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-md">
          {title} is fully specified in the product blueprint and scheduled in the phased rebuild plan. This
          screen is a placeholder so navigation never dead-ends.
        </p>
        {blueprint && (
          <p className="mt-3 text-xs text-slate-400">
            Spec: <span className="font-mono">{blueprint}</span>
          </p>
        )}
        <div className="mt-6 flex items-center gap-3">
          <Link
            to="/"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            Back to Dashboard
          </Link>
          <Link to="/assets" className="text-sm font-medium text-slate-500 hover:text-slate-800">
            Asset registry →
          </Link>
        </div>
      </div>
    </div>
  );
}
