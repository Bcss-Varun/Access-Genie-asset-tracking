import { useEffect, useState } from 'react';
import {
  PREDICTIVE_ALERT_STATUSES,
  PREDICTIVE_ALERT_TYPES,
  PREDICTIVE_SEVERITIES,
  type PredictiveAlertFacets,
  type PredictiveAlertStatus,
  type PredictiveAlertType,
  type PredictiveSeverity,
} from '@access-genie/shared';
import type { PredictiveFilters } from '@/api/predictive-alerts';
import { cn } from '@/lib/utils';

/**
 * The filter strip above the alert table.
 *
 * Every control writes into one filter object sent to the server verbatim.
 * Nothing is filtered in the browser — a client-side filter over a fetched page
 * reports "3 results" when the database holds forty, and the screen gives no way
 * to tell which number you are looking at.
 *
 * Options come from `/predictive-alerts/facets`. The fixed vocabularies
 * (severity, type, status) are always offered in full so a cut that currently
 * matches nothing can still be selected — that is how you check that nothing is
 * there. Facilities and assets are offered only where alerts exist, because a
 * facility with no alerts is a filter that can only ever return an empty table.
 */

const CONTROL =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25';

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </div>
  );
}

export function PredictiveFilterBar({
  filters,
  facets,
  onChange,
  onClear,
  activeCount,
}: {
  filters: PredictiveFilters;
  facets: PredictiveAlertFacets | undefined;
  onChange: (next: Partial<PredictiveFilters>) => void;
  onClear: () => void;
  activeCount: number;
}) {
  /*
   * Local search, debounced into the filter object.
   *
   * Bound straight to `filters.q` it would fire a request per keystroke, and
   * because the query string is the cache key, each of those becomes its own
   * cache entry.
   */
  const [search, setSearch] = useState(filters.q ?? '');

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = search.trim();
      if (next !== (filters.q ?? '')) onChange({ q: next || undefined });
    }, 300);
    return () => clearTimeout(timer);
    // `filters.q` is excluded deliberately: including it re-arms the timer when
    // the filter it just set comes back round, cancelling the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!filters.q) setSearch((current) => (current ? '' : current));
  }, [filters.q]);

  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
      active
        ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
        : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300 hover:text-slate-900',
    );

  const singleSelect = <T extends string>(value: T[] | undefined) => (value?.length === 1 ? value[0] : '');
  const criticalOnly = filters.severity?.length === 1 && filters.severity[0] === 'Critical';

  return (
    <div className="glass-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search alert, asset, reason or alert id…"
            aria-label="Search predictive alerts"
            className={cn(CONTROL, 'pl-9')}
          />
        </div>

        {/* The three cuts people actually take, one press each. */}
        <button type="button" onClick={() => onChange({ open: !filters.open })} className={chip(Boolean(filters.open))}>
          Needs triage
        </button>
        <button
          type="button"
          onClick={() => onChange({ severity: criticalOnly ? [] : ['Critical'] })}
          className={chip(criticalOnly)}
        >
          Critical
        </button>
        <button
          type="button"
          onClick={() => onChange({ minConfidence: filters.minConfidence === 80 ? undefined : 80 })}
          className={chip(filters.minConfidence === 80)}
        >
          ≥ 80% confidence
        </button>

        {activeCount > 0 && (
          <button type="button" onClick={onClear} className="ml-auto text-xs font-medium text-primary-600 hover:text-primary-700">
            Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
          </button>
        )}
      </div>

      <div
        className="mt-4 grid gap-x-3 gap-y-3 border-t border-slate-100 pt-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
      >
        <FilterField label="Severity">
          <select
            className={CONTROL}
            value={singleSelect(filters.severity)}
            onChange={(e) => onChange({ severity: e.target.value ? [e.target.value as PredictiveSeverity] : [] })}
          >
            <option value="">All severities</option>
            {(facets?.severities ?? PREDICTIVE_SEVERITIES.map((severity) => ({ severity, count: undefined }))).map((s) => (
              <option key={s.severity} value={s.severity}>
                {s.severity}
                {s.count !== undefined ? ` (${s.count})` : ''}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Alert type">
          <select
            className={CONTROL}
            value={singleSelect(filters.type)}
            onChange={(e) => onChange({ type: e.target.value ? [e.target.value as PredictiveAlertType] : [] })}
          >
            <option value="">All types</option>
            {(facets?.types ?? PREDICTIVE_ALERT_TYPES.map((type) => ({ type, count: undefined }))).map((t) => (
              <option key={t.type} value={t.type}>
                {t.type}
                {t.count !== undefined ? ` (${t.count})` : ''}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Status">
          <select
            className={CONTROL}
            value={singleSelect(filters.status)}
            // Picking a status and "needs triage" at once can contradict, so one
            // clears the other rather than silently returning an empty table.
            onChange={(e) => onChange({ status: e.target.value ? [e.target.value as PredictiveAlertStatus] : [], open: false })}
          >
            <option value="">All statuses</option>
            {(facets?.statuses ?? PREDICTIVE_ALERT_STATUSES.map((status) => ({ status, count: undefined }))).map((s) => (
              <option key={s.status} value={s.status}>
                {s.status}
                {s.count !== undefined ? ` (${s.count})` : ''}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Facility">
          <select
            className={CONTROL}
            value={filters.facility ?? ''}
            onChange={(e) => onChange({ facility: e.target.value || undefined })}
            disabled={(facets?.facilities.length ?? 0) === 0}
          >
            <option value="">{(facets?.facilities.length ?? 0) === 0 ? 'None recorded' : 'All facilities'}</option>
            {(facets?.facilities ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.count})
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Asset">
          <select
            className={CONTROL}
            value={filters.assetId ?? ''}
            onChange={(e) => onChange({ assetId: e.target.value || undefined })}
            disabled={(facets?.assets.length ?? 0) === 0}
          >
            <option value="">{(facets?.assets.length ?? 0) === 0 ? 'No alerts yet' : 'All assets'}</option>
            {(facets?.assets ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.count})
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Detected from">
          <input
            type="date"
            value={filters.from ?? ''}
            max={filters.to}
            onChange={(e) => onChange({ from: e.target.value || undefined })}
            className={CONTROL}
          />
        </FilterField>

        <FilterField label="Detected to">
          <input
            type="date"
            value={filters.to ?? ''}
            min={filters.from}
            onChange={(e) => onChange({ to: e.target.value || undefined })}
            className={CONTROL}
          />
        </FilterField>
      </div>
    </div>
  );
}
