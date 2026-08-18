import { Link, useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/ui/primitives';

/**
 * Terminal page for a feature that has been withdrawn.
 *
 * Distinct from `ComingSoonPage`, and deliberately so. The catch-all tells a
 * visitor the screen is specced and scheduled; saying that about something
 * deliberately removed would be a promise nobody intends to keep, and the
 * router already treats that distinction as worth routing around (see the
 * `maintenance/calendar` forward).
 *
 * A withdrawn module has no successor screen to forward to either — silently
 * landing somebody on the dashboard leaves them wondering whether they
 * mistyped. So this says what happened, once, and offers the way on.
 */
export default function RemovedPage() {
  const path = useLocation().pathname;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader title="Inventory & Parts has been removed" subtitle={`Route: ${path}`} />
      <div className="glass-panel rounded-xl flex-1 min-h-[360px] flex flex-col items-center justify-center text-center p-8">
        <div className="text-5xl mb-4">📦</div>
        <h2 className="text-lg font-heading font-bold text-slate-800">This module is no longer part of the product</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-md">
          Spare parts, warehouses, suppliers, reorder planning and purchase orders were withdrawn along with
          their data. Asset records, work orders and their parts costing are unaffected.
        </p>
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
