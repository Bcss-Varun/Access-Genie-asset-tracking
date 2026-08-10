import { useEffect, useRef, useState } from 'react';
import { ASSET_CATEGORIES, type AssetCategory } from '@access-genie/shared';
import type { DateRangeKind, Granularity } from '@/lib/financials';
import { useScope } from '@/components/providers/ScopeProvider';
import { organizationOf, organizationScopes, locationScopesWithin } from '@/lib/rbac';
import { Button } from '@/components/ui/Button';
import { cn, formatDate } from '@/lib/utils';

export interface FinancialFilters {
  room: string;
  category: AssetCategory | '';
  dateRangeKind: DateRangeKind;
  granularity: Granularity;
  customFrom?: string;
  customTo?: string;
}

export const DEFAULT_FINANCIAL_FILTERS: FinancialFilters = {
  room: '',
  category: '',
  dateRangeKind: 'thisYear',
  granularity: 'monthly',
};

const RANGE_LABEL: Record<DateRangeKind, string> = {
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
  thisQuarter: 'This Quarter',
  lastQuarter: 'Last Quarter',
  thisYear: 'This Year',
  lastYear: 'Last Year',
  custom: 'Custom Range',
};
const RANGE_ORDER: DateRangeKind[] = ['thisMonth', 'lastMonth', 'thisQuarter', 'lastQuarter', 'thisYear', 'lastYear'];

/**
 * The persistent filter bar every Financials tab reads from — Organization
 * and Facility write the app's real scope (`useScope()`, same as the main
 * dashboard's `FilterBar`, so a facility choice here narrows the same
 * hydrated dataset the rest of the app narrows); Asset Room, Category, Date
 * Range and Granularity are page-local, since nothing outside this page
 * needs to agree with them.
 */
export function FinancialsFilterBar({
  filters,
  onChange,
  rooms,
  onReset,
}: {
  filters: FinancialFilters;
  onChange: (next: FinancialFilters) => void;
  /** Asset Room options — computed by the page from assets in the selected facility. */
  rooms: string[];
  onReset: () => void;
}) {
  const { scopeId, setScopeId } = useScope();
  const organizations = organizationScopes();
  const currentOrg = organizationOf(scopeId) ?? organizations[0]?.node;
  const locations = currentOrg ? locationScopesWithin(currentOrg.id) : [];
  const isAllFacilities = !currentOrg || scopeId === currentOrg.id;

  const isDefault =
    isAllFacilities &&
    filters.room === '' &&
    filters.category === '' &&
    filters.dateRangeKind === DEFAULT_FINANCIAL_FILTERS.dateRangeKind &&
    filters.granularity === DEFAULT_FINANCIAL_FILTERS.granularity;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white/80 p-2.5">
      {organizations.length > 1 && currentOrg && (
        <Field label="Organization">
          <select
            value={currentOrg.id}
            onChange={(e) => setScopeId(e.target.value)}
            className={SELECT_CLS}
          >
            {organizations.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>{'  '.repeat(depth)}{node.name}</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Facility">
        <select
          value={isAllFacilities ? '' : scopeId}
          onChange={(e) => {
            setScopeId(e.target.value || (currentOrg?.id ?? scopeId));
            onChange({ ...filters, room: '' });
          }}
          className={SELECT_CLS}
        >
          <option value="">All Facilities</option>
          {locations.map(({ node, depth }) => (
            <option key={node.id} value={node.id}>{'  '.repeat(depth)}{node.name}</option>
          ))}
        </select>
      </Field>

      <Field label="Asset Room">
        <select
          value={filters.room}
          disabled={isAllFacilities || rooms.length === 0}
          onChange={(e) => onChange({ ...filters, room: e.target.value })}
          className={cn(SELECT_CLS, (isAllFacilities || rooms.length === 0) && 'cursor-not-allowed text-slate-400')}
        >
          <option value="">{isAllFacilities ? 'Select a facility first' : rooms.length ? 'All Rooms' : 'None recorded'}</option>
          {rooms.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </Field>

      <Field label="Category">
        <select
          value={filters.category}
          onChange={(e) => onChange({ ...filters, category: e.target.value as AssetCategory | '' })}
          className={SELECT_CLS}
        >
          <option value="">All Categories</option>
          {ASSET_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>

      <DateRangePicker filters={filters} onChange={onChange} />

      <Field label="Granularity">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(['monthly', 'quarterly', 'yearly'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange({ ...filters, granularity: g })}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                filters.granularity === g ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </Field>

      {!isDefault && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (currentOrg) setScopeId(currentOrg.id);
            onReset();
          }}
        >
          ✕ Reset Filters
        </Button>
      )}
    </div>
  );
}

const SELECT_CLS =
  'max-w-[13rem] truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function DateRangePicker({ filters, onChange }: { filters: FinancialFilters; onChange: (next: FinancialFilters) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const label =
    filters.dateRangeKind === 'custom' && filters.customFrom && filters.customTo
      ? `${formatDate(filters.customFrom)} – ${formatDate(filters.customTo)}`
      : RANGE_LABEL[filters.dateRangeKind];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="relative flex flex-col gap-0.5" ref={ref}>
      <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Date Range</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300"
      >
        <span className="truncate">{label}</span>
        <span className={cn('text-slate-300 transition-transform', open && 'rotate-180')} aria-hidden>▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {RANGE_ORDER.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                onChange({ ...filters, dateRangeKind: kind, customFrom: undefined, customTo: undefined });
                setOpen(false);
              }}
              className={cn(
                'block w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
                filters.dateRangeKind === kind ? 'bg-primary-50 font-semibold text-primary-700' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {RANGE_LABEL[kind]}
            </button>
          ))}

          <div className="mt-2 border-t border-slate-100 pt-2">
            <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Custom range</p>
            <div className="flex items-center gap-1.5 px-1">
              <input
                type="date"
                max={filters.customTo ?? today}
                value={filters.customFrom ?? ''}
                onChange={(e) => onChange({ ...filters, dateRangeKind: 'custom', customFrom: e.target.value || undefined })}
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                min={filters.customFrom ?? undefined}
                max={today}
                value={filters.customTo ?? ''}
                onChange={(e) => onChange({ ...filters, dateRangeKind: 'custom', customTo: e.target.value || undefined })}
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
