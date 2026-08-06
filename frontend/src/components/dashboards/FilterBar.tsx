import { useEffect, useRef, useState } from 'react';
import { ASSET_CATEGORIES, DASHBOARD_PERIODS, type AssetCategory, type DashboardPeriod } from '@access-genie/shared';
import { useScope } from '@/components/providers/ScopeProvider';
import { locationScopesWithin, organizationOf, organizationScopes } from '@/lib/rbac';
import type { DashboardFilters } from '@/api/dashboard';
import { cn, formatDate } from '@/lib/utils';

/**
 * How the dashboard is cut.
 *
 * Organization and Location both write the *same* scope state the top bar's
 * switcher writes — they are two views of one selection, not two selections.
 * That is deliberate: separate Organization / Business Unit / Region / Facility
 * dropdowns can each be set to something the others contradict, and then no one
 * can say what the numbers on screen are actually counting. Here, Location only
 * ever lists sites inside the chosen organisation, and choosing an organisation
 * resets the location to "all of it".
 *
 * Department and Category are ordinary filters passed to the API, which folds
 * them into the same asset query the scope uses — so they narrow the charts and
 * the lists, not only the tiles.
 */
const PERIOD_LABEL: Record<DashboardPeriod, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  fy: 'Last 12 months',
};

export function FilterBar({
  filters,
  onChange,
  departments,
}: {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  /** Departments present in the estate in scope — the server sends them with the payload. */
  departments: string[];
}) {
  const { scopeId, setScopeId, tree } = useScope();

  const organizations = organizationScopes();
  const currentOrg = organizationOf(scopeId) ?? tree;
  const locations = locationScopesWithin(currentOrg.id);

  const customRange = Boolean(filters.from && filters.to);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white/80 p-2.5">
      {organizations.length > 1 && (
        <Select
          label="Organization"
          value={currentOrg.id}
          onChange={(id) => setScopeId(id)}
          options={organizations.map(({ node, depth }) => ({
            value: node.id,
            label: `${'  '.repeat(depth)}${node.name}`,
          }))}
        />
      )}

      <Select
        label="Location"
        value={scopeId === currentOrg.id ? '' : scopeId}
        onChange={(id) => setScopeId(id || currentOrg.id)}
        options={[
          { value: '', label: `All of ${currentOrg.name}` },
          ...locations.map(({ node, depth }) => ({
            value: node.id,
            label: `${'  '.repeat(depth)}${node.name}`,
          })),
        ]}
      />

      <Select
        label="Department"
        value={filters.department ?? ''}
        disabled={departments.length === 0}
        onChange={(value) => onChange({ ...filters, department: value || undefined })}
        options={[
          { value: '', label: departments.length ? 'All departments' : 'None recorded' },
          ...departments.map((d) => ({ value: d, label: d })),
        ]}
      />

      <Select
        label="Category"
        value={filters.category ?? ''}
        onChange={(value) => onChange({ ...filters, category: (value || undefined) as AssetCategory | undefined })}
        options={[
          { value: '', label: 'All categories' },
          ...ASSET_CATEGORIES.map((c) => ({ value: c, label: c })),
        ]}
      />

      <PeriodPicker filters={filters} onChange={onChange} customRange={customRange} />
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'max-w-[13rem] truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 outline-none transition-colors',
          'hover:border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20',
          disabled && 'cursor-not-allowed text-slate-400',
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Presets, with a custom range behind them.
 *
 * The presets carry the common cases in one click; the range picker exists
 * because "the July board pack" is a real request and no preset answers it.
 */
function PeriodPicker({
  filters,
  onChange,
  customRange,
}: {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  customRange: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const label = customRange
    ? `${formatDate(filters.from as string)} – ${formatDate(filters.to as string)}`
    : PERIOD_LABEL[filters.period];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="relative flex flex-col gap-0.5" ref={ref}>
      <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Period</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300"
      >
        <span className="truncate">{label}</span>
        <span className={cn('text-slate-300 transition-transform', open && 'rotate-180')} aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {DASHBOARD_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                onChange({ ...filters, period: p, from: undefined, to: undefined });
                setOpen(false);
              }}
              className={cn(
                'block w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
                !customRange && filters.period === p
                  ? 'bg-primary-50 font-semibold text-primary-700'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}

          <div className="mt-2 border-t border-slate-100 pt-2">
            <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Custom range
            </p>
            <div className="flex items-center gap-1.5 px-1">
              <input
                type="date"
                max={filters.to ?? today}
                value={filters.from ?? ''}
                onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                min={filters.from ?? undefined}
                max={today}
                value={filters.to ?? ''}
                onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
              />
            </div>
            {customRange && (
              <button
                type="button"
                onClick={() => onChange({ ...filters, from: undefined, to: undefined })}
                className="mt-1.5 px-2.5 text-xs font-medium text-primary-600 hover:underline"
              >
                Back to presets
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
