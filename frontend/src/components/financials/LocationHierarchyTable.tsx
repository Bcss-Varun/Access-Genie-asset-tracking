import { useMemo, useState } from 'react';
import type { RegisteredAsset } from '@access-genie/shared';
import { aggregateBy, facilityOf, roomOf, type FinancialAggregate } from '@/lib/financials';
import { EmptyState } from '@/components/ui/primitives';
import { cn, formatMoney } from '@/lib/utils';

const TH = 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500';
const TD = 'px-3 py-2.5 align-top text-sm';

/**
 * "Asset Value by Location" — Organization (implicit) → Facility → Asset
 * Room. One aggregation, two depths: the same `aggregateBy` reducer the
 * category/depreciation tables use, called once over the whole selection for
 * facility rows and once per expanded facility for its room rows, so a
 * facility's room totals always add back up to the facility row above them —
 * there's no second, independently-maintained number to drift.
 *
 * Doubles as the facility drill-down: when the page's Facility filter is
 * already set (via `useScope()`), `assets` arrives pre-narrowed to that one
 * facility, so this same component naturally renders as a single expanded
 * facility with its rooms — no separate "drill-down view" to build.
 */
export function LocationHierarchyTable({
  assets,
  onFacilityClick,
  onRoomClick,
}: {
  assets: RegisteredAsset[];
  /** Sets the page's Facility filter — the §4 "clicking a facility drills down" behaviour. */
  onFacilityClick?: (facility: string) => void;
  /** Sends the Register tab a room filter. */
  onRoomClick?: (facility: string, room: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const facilities = useMemo(() => aggregateBy(assets, facilityOf), [assets]);
  const portfolioTotal = facilities.reduce((s, f) => s + f.book, 0) || 1;

  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  };

  if (facilities.length === 0) {
    return <EmptyState icon="🏢" title="No financial data available for this period." description="Nothing matches the current filters." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70">
            <th className={TH}>Location</th>
            <th className={cn(TH, 'text-right')}>Asset Count</th>
            <th className={cn(TH, 'text-right')}>Purchase Value</th>
            <th className={cn(TH, 'text-right')}>Book Value</th>
            <th className={cn(TH, 'text-right')}>Depreciation</th>
            <th className={cn(TH, 'text-right')}>Depreciation %</th>
            <th className={cn(TH, 'text-right')}>EOL Assets</th>
            <th className={cn(TH, 'text-right')}>% of Portfolio</th>
            <th className={TH} aria-hidden />
          </tr>
        </thead>
        <tbody>
          {facilities.map((f) => (
            <FacilityRows
              key={f.key}
              facility={f}
              isOpen={expanded.has(f.key)}
              onToggle={() => toggle(f.key)}
              onFacilityClick={onFacilityClick}
              onRoomClick={onRoomClick}
              assetsInFacility={assets.filter((a) => facilityOf(a) === f.key)}
              portfolioTotal={portfolioTotal}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FacilityRows({
  facility, isOpen, onToggle, onFacilityClick, onRoomClick, assetsInFacility, portfolioTotal,
}: {
  facility: FinancialAggregate;
  isOpen: boolean;
  onToggle: () => void;
  onFacilityClick?: (facility: string) => void;
  onRoomClick?: (facility: string, room: string) => void;
  assetsInFacility: RegisteredAsset[];
  portfolioTotal: number;
}) {
  const rooms = useMemo(() => (isOpen ? aggregateBy(assetsInFacility, roomOf) : []), [isOpen, assetsInFacility]);

  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50/60">
        <td className={TD}>
          <button type="button" onClick={onToggle} className="flex items-center gap-2 text-left font-semibold text-slate-800 hover:text-primary-600">
            <span className={cn('inline-block text-slate-400 transition-transform', isOpen && 'rotate-90')} aria-hidden>▸</span>
            {facility.key}
          </button>
        </td>
        <Cells row={facility} portfolioTotal={portfolioTotal} />
        <td className={cn(TD, 'text-right')}>
          {onFacilityClick && (
            <button type="button" onClick={() => onFacilityClick(facility.key)} className="text-xs font-medium text-primary-600 hover:underline">
              Drill in →
            </button>
          )}
        </td>
      </tr>

      {isOpen &&
        (rooms.length === 0 ? (
          <tr className="border-b border-slate-100 bg-slate-50/40">
            <td className={TD} colSpan={9}>
              <span className="pl-6 text-xs text-slate-400">No asset rooms recorded for {facility.key}.</span>
            </td>
          </tr>
        ) : (
          rooms.map((r) => (
            <tr key={r.key} className="border-b border-slate-100 bg-slate-50/40 hover:bg-slate-100/60">
              <td className={TD}>
                <button
                  type="button"
                  onClick={() => onRoomClick?.(facility.key, r.key)}
                  className="pl-6 text-left text-slate-600 hover:text-primary-600"
                >
                  {r.key}
                </button>
              </td>
              <Cells row={r} portfolioTotal={portfolioTotal} />
              <td className={TD} />
            </tr>
          ))
        ))}
    </>
  );
}

function Cells({ row, portfolioTotal }: { row: FinancialAggregate; portfolioTotal: number }) {
  return (
    <>
      <td className={cn(TD, 'text-right tabular-nums text-slate-600')}>{row.count}</td>
      <td className={cn(TD, 'text-right tabular-nums text-slate-700')}>{formatMoney(row.purchase)}</td>
      <td className={cn(TD, 'text-right tabular-nums font-semibold text-slate-900')}>{formatMoney(row.book)}</td>
      <td className={cn(TD, 'text-right tabular-nums text-slate-600')}>{formatMoney(row.depreciation)}</td>
      <td className={cn(TD, 'text-right tabular-nums text-slate-600')}>{row.depreciationPct}%</td>
      <td className={cn(TD, 'text-right tabular-nums', row.eolCount > 0 ? 'font-medium text-amber-600' : 'text-slate-400')}>{row.eolCount}</td>
      <td className={cn(TD, 'text-right tabular-nums text-slate-500')}>{Math.round((row.book / portfolioTotal) * 100)}%</td>
    </>
  );
}
