import { useEffect, useState } from 'react';
import {
  INSPECTION_STATUSES,
  INSPECTION_TYPES,
  type InspectionFacets,
  type InspectionStatus,
  type InspectionType,
} from '@access-genie/shared';
import type { InspectionFilters } from '@/api/inspections';
import { cn } from '@/lib/utils';

/**
 * The filter strip above the records list.
 *
 * Every control writes into one filter object sent to the server verbatim.
 * Nothing is filtered in the browser — a client-side filter over a fetched page
 * reports "3 results" when the database holds forty, and the screen gives no
 * way to tell which number you are looking at.
 *
 * Options come from `/inspections/facets`, so a facility nobody has an asset in
 * is not offered and a template nobody has scheduled is not offered as a cut
 * that can only ever return nothing.
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

export function InspectionFilterBar({
  filters,
  facets,
  onChange,
  onClear,
  activeCount,
}: {
  filters: InspectionFilters;
  facets: InspectionFacets | undefined;
  onChange: (next: Partial<InspectionFilters>) => void;
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
            placeholder="Search title, asset, template or inspection id…"
            aria-label="Search inspections"
            className={cn(CONTROL, 'pl-9')}
          />
        </div>

        <button type="button" onClick={() => onChange({ overdue: !filters.overdue })} className={chip(Boolean(filters.overdue))}>
          Overdue
        </button>
        <button
          type="button"
          onClick={() => onChange({ unassigned: !filters.unassigned })}
          className={chip(Boolean(filters.unassigned))}
        >
          Unassigned
        </button>
        <button
          type="button"
          onClick={() => onChange({ status: filters.status?.length === 1 && filters.status[0] === 'Failed' ? [] : ['Failed'] })}
          className={chip(filters.status?.length === 1 && filters.status[0] === 'Failed')}
        >
          Failed
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
        <FilterField label="Status">
          <select
            className={CONTROL}
            value={singleSelect(filters.status)}
            onChange={(e) => onChange({ status: e.target.value ? [e.target.value as InspectionStatus] : [] })}
          >
            <option value="">All statuses</option>
            {(facets?.statuses ?? INSPECTION_STATUSES.map((status) => ({ status, count: undefined }))).map((s) => (
              <option key={s.status} value={s.status}>
                {s.status}
                {'count' in s && s.count !== undefined ? ` (${s.count})` : ''}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Inspection type">
          <select
            className={CONTROL}
            value={singleSelect(filters.type)}
            onChange={(e) => onChange({ type: e.target.value ? [e.target.value as InspectionType] : [] })}
          >
            <option value="">All types</option>
            {(facets?.types ?? INSPECTION_TYPES.map((type) => ({ type, count: undefined }))).map((t) => (
              <option key={t.type} value={t.type}>
                {t.type}
                {'count' in t && t.count !== undefined ? ` (${t.count})` : ''}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Template">
          <select
            className={CONTROL}
            value={filters.templateId ?? ''}
            onChange={(e) => onChange({ templateId: e.target.value || undefined })}
            disabled={(facets?.templates.length ?? 0) === 0}
          >
            <option value="">{(facets?.templates.length ?? 0) === 0 ? 'No templates yet' : 'All templates'}</option>
            {(facets?.templates ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.count})
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

        <FilterField label="Assigned to">
          <select
            className={CONTROL}
            value={filters.assignedTo ?? ''}
            // Picking a person and "unassigned" at once matches nothing, so one
            // clears the other rather than silently returning an empty list.
            onChange={(e) => onChange({ assignedTo: e.target.value || undefined, unassigned: false })}
          >
            <option value="">Anyone</option>
            {(facets?.assignees ?? []).map((a) => (
              <option key={a.name} value={a.name}>
                {a.name} ({a.count})
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Scheduled from">
          <input
            type="date"
            value={filters.from ?? ''}
            max={filters.to}
            onChange={(e) => onChange({ from: e.target.value || undefined })}
            className={CONTROL}
          />
        </FilterField>

        <FilterField label="Scheduled to">
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
