import { useEffect, useState } from 'react';
import {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  type WorkOrderFacets,
  type WorkOrderPriority,
  type WorkOrderSource,
  type WorkOrderStatus,
  type WorkOrderType,
} from '@access-genie/shared';
import type { WorkOrderFilters } from '@/api/work-orders';
import { cn } from '@/lib/utils';
import { sourceLabel } from './tokens';

/**
 * The filter strip above the board and the list.
 *
 * Every control here writes into one filter object that both views send to the
 * server verbatim. Nothing is filtered in the browser — which is what makes the
 * result counts trustworthy: a client-side filter over a capped page reports
 * "3 results" when the database holds forty, and there is no way to tell from
 * the screen which one you are looking at.
 *
 * Options come from `/work-orders/facets`, so a facility nobody has an asset in
 * is not offered and a technician who is not on the roster is not offered as
 * someone new work can be given to.
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

/**
 * A single-select over an enum, with "All" as the empty option.
 *
 * The filter model holds arrays because the API takes CSV and the quick chips
 * set two values at once (Critical + High). The control shows a count rather
 * than pretending one of them is selected when more than one is active.
 */
function EnumSelect<T extends string>({
  value,
  options,
  onChange,
  allLabel,
  labelFor,
}: {
  value: T[] | undefined;
  options: { value: T; label: string; count?: number; disabled?: boolean }[];
  onChange: (next: T[]) => void;
  allLabel: string;
  labelFor?: (option: { value: T; label: string; count?: number }) => string;
}) {
  const selected = value ?? [];

  return (
    <select
      className={CONTROL}
      value={selected.length > 1 ? '__multi' : (selected[0] ?? '')}
      onChange={(e) => onChange(e.target.value ? ([e.target.value] as T[]) : [])}
    >
      <option value="">{allLabel}</option>
      {selected.length > 1 && (
        <option value="__multi" disabled>
          {selected.length} selected
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {labelFor ? labelFor(option) : option.label}
          {option.count !== undefined ? ` (${option.count})` : ''}
        </option>
      ))}
    </select>
  );
}

export function WorkOrderFilterBar({
  filters,
  facets,
  onChange,
  onClear,
  activeCount,
}: {
  filters: WorkOrderFilters;
  facets: WorkOrderFacets | undefined;
  onChange: (next: Partial<WorkOrderFilters>) => void;
  onClear: () => void;
  activeCount: number;
}) {
  /*
   * The search box is local, then debounced into the filter object.
   *
   * Binding it straight to `filters.q` would fire a request per keystroke, and
   * because the query string is the cache key, every one of those would be a
   * separate cache entry. 300ms is long enough to finish a word and short
   * enough not to feel laggy.
   */
  const [search, setSearch] = useState(filters.q ?? '');

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = search.trim();
      if (next !== (filters.q ?? '')) onChange({ q: next || undefined });
    }, 300);
    return () => clearTimeout(timer);
    // `filters.q` is deliberately excluded: including it would re-arm the timer
    // when the filter it sets comes back round, and cancel the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Cleared from outside (the "Clear filters" button) — follow it back.
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

  const criticalActive =
    (filters.priority?.length ?? 0) === 2 &&
    filters.priority?.includes('Critical') === true &&
    filters.priority?.includes('High') === true;

  return (
    <div className="glass-panel p-4">
      {/* Search + the three cuts people reach for constantly. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, asset, technician or WO id…"
            aria-label="Search work orders"
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
          onClick={() => onChange({ priority: criticalActive ? [] : (['Critical', 'High'] as WorkOrderPriority[]) })}
          className={chip(criticalActive)}
        >
          Critical &amp; High
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
          <EnumSelect<WorkOrderStatus>
            value={filters.status}
            options={
              facets?.statuses.map((s) => ({ value: s.status, label: s.status, count: s.count })) ??
              WORK_ORDER_STATUSES.map((s) => ({ value: s, label: s }))
            }
            onChange={(status) => onChange({ status })}
            allLabel="All statuses"
          />
        </FilterField>

        <FilterField label="Priority">
          <EnumSelect<WorkOrderPriority>
            value={filters.priority}
            options={
              facets?.priorities.map((p) => ({ value: p.priority, label: p.priority, count: p.count })) ??
              WORK_ORDER_PRIORITIES.map((p) => ({ value: p, label: p }))
            }
            onChange={(priority) => onChange({ priority })}
            allLabel="All priorities"
          />
        </FilterField>

        <FilterField label="Source">
          <EnumSelect<WorkOrderSource>
            value={filters.source}
            // Parked sources are listed only when records still carry them, and
            // labelled so — they can be filtered for, and cannot be created.
            options={(facets?.sources ?? []).map((s) => ({
              value: s.source,
              label: s.active ? sourceLabel(s.source) : `${sourceLabel(s.source)} (legacy)`,
              count: s.count,
            }))}
            onChange={(source) => onChange({ source })}
            allLabel="All sources"
          />
        </FilterField>

        <FilterField label="Type">
          <EnumSelect<WorkOrderType>
            value={filters.type}
            options={(facets?.types ?? []).map((t) => ({
              value: t.type,
              label: t.active ? t.type : `${t.type} (legacy)`,
              count: t.count,
            }))}
            onChange={(type) => onChange({ type })}
            allLabel="All types"
          />
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

        <FilterField label="Technician">
          <select
            className={CONTROL}
            value={filters.assignedTo ?? ''}
            // Picking a person and "unassigned" at once matches nothing, so the
            // one clears the other rather than quietly returning an empty board.
            onChange={(e) => onChange({ assignedTo: e.target.value || undefined, unassigned: false })}
          >
            <option value="">All technicians</option>
            {(facets?.technicians ?? []).map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.count})
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Due from">
          <input
            type="date"
            value={filters.dueFrom ?? ''}
            max={filters.dueTo}
            onChange={(e) => onChange({ dueFrom: e.target.value || undefined })}
            className={CONTROL}
          />
        </FilterField>

        <FilterField label="Due to">
          <input
            type="date"
            value={filters.dueTo ?? ''}
            min={filters.dueFrom}
            onChange={(e) => onChange({ dueTo: e.target.value || undefined })}
            className={CONTROL}
          />
        </FilterField>
      </div>
    </div>
  );
}
