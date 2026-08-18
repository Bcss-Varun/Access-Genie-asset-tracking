import { useState } from 'react';
import { ANALYTICS_PERIODS, type AnalyticsFilterOptions, type AnalyticsPeriod } from '@access-genie/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import type { AnalyticsFilters } from '@/api/analytics';

/**
 * The global filter bar.
 *
 * Every control here changes a query parameter and nothing else — there is no
 * client-side narrowing behind any of them, so the KPI strip, the charts and
 * the tables all move together because they are all reading the same new
 * response.
 *
 * The facility list is `filterOptions.facilities` from that response, which the
 * server has already narrowed to what this session may see. A facility manager
 * simply does not receive the rest of the estate as options, so the picker
 * cannot offer a selection the API would then refuse.
 */

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  '30d': '30 days',
  '90d': '90 days',
  '6m': '6 months',
  '12m': '12 months',
  ytd: 'Year to date',
  all: 'All time',
  custom: 'Custom',
};

/** Indent a scope option by its depth, so the tree reads as a tree. */
const INDENT = ['', '　', '　　', '　　　'];

export function AnalyticsFilterBar({
  filters,
  options,
  scopeName,
  onChange,
  onClear,
  activeCount,
  right,
}: {
  filters: AnalyticsFilters;
  options: AnalyticsFilterOptions | undefined;
  scopeName: string | undefined;
  onChange: (next: Partial<AnalyticsFilters>) => void;
  onClear: () => void;
  activeCount: number;
  right?: React.ReactNode;
}) {
  const [showMore, setShowMore] = useState(false);

  const select =
    'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200';

  return (
    <div className="glass-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="analytics-facility">
          Facility
        </label>
        <select
          id="analytics-facility"
          className={select}
          value={filters.facility ?? ''}
          onChange={(e) => onChange({ facility: e.target.value || undefined })}
        >
          <option value="">
            {options?.facilities[0] ? `${options.facilities[0].name} — everything` : 'All facilities'}
          </option>
          {(options?.facilities ?? []).slice(1).map((node) => (
            <option key={node.id} value={node.id}>
              {INDENT[Math.min(3, Math.max(0, node.depth - 1))]}
              {node.name} ({node.assetCount})
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="analytics-period">
          Period
        </label>
        <select
          id="analytics-period"
          className={select}
          value={filters.period}
          onChange={(e) => onChange({ period: e.target.value as AnalyticsPeriod })}
        >
          {ANALYTICS_PERIODS.map((period) => (
            <option key={period} value={period}>
              {PERIOD_LABELS[period]}
            </option>
          ))}
        </select>

        {filters.period === 'custom' && (
          <>
            <input
              type="date"
              aria-label="From"
              className={select}
              value={filters.from ?? ''}
              onChange={(e) => onChange({ from: e.target.value || undefined })}
            />
            <input
              type="date"
              aria-label="To"
              className={select}
              value={filters.to ?? ''}
              onChange={(e) => onChange({ to: e.target.value || undefined })}
            />
            {(!filters.from || !filters.to) && (
              <span className="text-[11px] text-amber-600">
                Pick both dates — showing the last 12 months until you do.
              </span>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => setShowMore((open) => !open)}
          className={cn(
            'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
            showMore || filters.categories.length > 0 || filters.statuses.length > 0
              ? 'border-primary-300 bg-primary-50 text-primary-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          )}
          aria-expanded={showMore}
        >
          Category &amp; status
          {filters.categories.length + filters.statuses.length > 0 && (
            <span className="ml-1.5 tabular-nums">{filters.categories.length + filters.statuses.length}</span>
          )}
        </button>

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          {scopeName && <span className="text-xs text-slate-500">Showing {scopeName}</span>}
          {right}
        </div>
      </div>

      {showMore && (
        <div className="mt-3 grid gap-4 border-t border-slate-100 pt-3 sm:grid-cols-2">
          <CheckboxGroup
            title="Category"
            values={options?.categories ?? []}
            selected={filters.categories}
            onChange={(categories) => onChange({ categories })}
          />
          <CheckboxGroup
            title="Status"
            values={options?.statuses ?? []}
            selected={filters.statuses}
            onChange={(statuses) => onChange({ statuses })}
            label={(v) => v.replace(/_/g, ' ')}
          />
        </div>
      )}
    </div>
  );
}

function CheckboxGroup({
  title,
  values,
  selected,
  onChange,
  label = (v: string) => v,
}: {
  title: string;
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  label?: (value: string) => string;
}) {
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => {
          const on = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => toggle(value)}
              aria-pressed={on}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                on
                  ? 'border-primary-400 bg-primary-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {label(value)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
