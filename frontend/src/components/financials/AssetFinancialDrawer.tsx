import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { depreciationOn, type RegisteredAsset } from '@access-genie/shared';
import { Drawer, Field } from '@/components/tracking/shell';
import { Badge } from '@/components/ui/primitives';
import { Sparkline } from '@/components/charts/Sparkline';
import { depreciationInputFor, financialStateFor, facilityOf, roomOf } from '@/lib/financials';
import { formatMoney, formatDate, cn } from '@/lib/utils';

/**
 * The §12 "Asset Financial Detail Drawer" — a quick look from the register,
 * not a second asset profile. Reuses the app's existing `Drawer`/`Field`
 * primitives (`components/tracking/shell.tsx`) rather than a new overlay, and
 * links out to the real Asset 360 page for anyone who wants the rest of it.
 */
export function AssetFinancialDrawer({ asset, onClose }: { asset: RegisteredAsset | null; onClose: () => void }) {
  const fin = useMemo(() => (asset ? financialStateFor(asset) : null), [asset]);

  const series = useMemo(() => {
    if (!asset) return [];
    const input = depreciationInputFor(asset);
    const start = Date.parse(asset.purchaseDate);
    if (Number.isNaN(start)) return [];

    const points: number[] = [];
    const cursor = new Date(start);
    const now = Date.now();
    while (cursor.getTime() <= now) {
      const state = depreciationOn(input, cursor.getTime());
      points.push(state?.bookValue ?? 0);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (points.length < 2) points.push(depreciationOn(input, now)?.bookValue ?? 0);
    return points;
  }, [asset]);

  const statusTone = fin
    ? fin.status === 'Retired' || fin.status === 'Disposed'
      ? 'red'
      : fin.status === 'EOL' || fin.status === 'Near EOL'
        ? 'amber'
        : fin.status === 'Fully Depreciated'
          ? 'slate'
          : 'emerald'
    : 'slate';

  return (
    <Drawer
      open={Boolean(asset)}
      onClose={onClose}
      eyebrow={fin && <Badge tone={statusTone}>{fin.status}</Badge>}
      title={asset?.name ?? ''}
      subtitle={asset ? `${asset.id} · ${asset.category}` : undefined}
      footer={
        asset && (
          <Link to={`/assets/${asset.id}`} className="text-sm font-medium text-primary-600 hover:underline">
            Open full asset profile →
          </Link>
        )
      }
    >
      {asset && fin && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Location</h3>
            <Field label="Facility">{facilityOf(asset)}</Field>
            <Field label="Asset Room">{roomOf(asset)}</Field>
          </section>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Financial</h3>
            <Field label="Purchase Value">{formatMoney(asset.purchasePrice)}</Field>
            <Field label="Purchase Date">{formatDate(asset.purchaseDate)}</Field>
            <Field label="Current Book Value">
              <span className="font-semibold text-slate-900">{fin.state ? formatMoney(fin.state.bookValue) : '—'}</span>
            </Field>
            <Field label="Accumulated Depreciation">{fin.state ? formatMoney(fin.state.accumulated) : '—'}</Field>
            <Field label="Depreciation Method">{fin.state?.method === 'written-down-value' ? 'Written-down value' : fin.state ? 'Straight-line' : 'Not depreciable'}</Field>
            <Field label="Useful Life">{fin.state ? `${fin.state.usefulLifeYears} years` : '—'}</Field>
            <Field label="Residual Value">Not configured</Field>
          </section>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Lifecycle</h3>
            <Field label="Current Stage">{asset.lifecycleStage}</Field>
            <Field label="Asset Age">{fin.ageYears.toFixed(1)} years</Field>
            <Field label="Estimated EOL">{fin.estimatedEol ? formatDate(fin.estimatedEol.toISOString()) : '—'} <span className="text-[10px] text-slate-400">(estimate)</span></Field>
            <Field label="Remaining Useful Life">
              {fin.state ? `${Math.max(0, (fin.state.usefulLifeYears * (1 - fin.state.lifeUsed))).toFixed(1)} years` : '—'}
            </Field>
          </section>

          {series.length >= 2 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Value Over Time</h3>
              <Sparkline data={series} tone={statusTone === 'red' ? 'red' : statusTone === 'amber' ? 'amber' : 'primary'} />
              <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                <span>{formatDate(asset.purchaseDate)}</span>
                <span className={cn('font-medium', 'text-slate-500')}>Today</span>
              </div>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
