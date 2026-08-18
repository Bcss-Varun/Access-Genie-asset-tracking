import { useId } from 'react';
import {
  MAINTENANCE_KINDS,
  MAINTENANCE_STATUSES,
  WORK_ORDER_PRIORITIES,
  type AssetCategory,
  type MaintenanceFilterOptions,
  type MaintenanceKind,
  type MaintenancePeriod,
  type MaintenanceStatus,
  type WorkOrderPriority,
} from '@access-genie/shared';
import type { MaintenanceDashboardFilters } from '@/api/maintenance-dashboard';
import { cn } from '@/lib/utils';

/**
 * The global filter strip.
 *
 * Two rules hold it together.
 *
 * **The location selectors cascade because the hierarchy does.** Organisation,
 * facility and warehouse/location are all nodes of one scope tree, so choosing
 * a facility narrows the location list to that facility's own buildings and
 * floors, and choosing a different organisation clears the two below it rather
 * than leaving a facility selected that is no longer reachable. The server is
 * sent all three and filters by the deepest.
 *
 * **The options come from the server.** Facilities, locations and categories
 * are the ones that exist in this estate, not a hard-coded list — an estate
 * with one warehouse gets one warehouse in the dropdown, and a category nobody
 * owns an asset in is not offered as a filter that can only ever return
 * nothing. The four enum filters (type, priority, status) are the domain
 * constants, because those are fixed by the schema rather than by the data.
 */

const PERIODS: { value: MaintenancePeriod; label: string }[] = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '3m', label: '3 Months' },
  { value: '6m', label: '6 Months' },
  { value: '1y', label: '1 Year' },
  { value: 'custom', label: 'Custom' },
];

const CONTROL =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25';

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <div id={id}>{children}</div>
    </div>
  );
}

/**
 * A multi-select rendered as a native `<select multiple>`… is what this is not.
 *
 * Those are close to unusable with a mouse. Each enum filter is a single-select
 * with an "All" option instead, which covers every cut anyone has asked for
 * from this screen, and the KPI tiles supply the multi-value cuts (Critical,
 * Overdue) by setting the filter for you.
 */
function EnumSelect<T extends string>({
  value,
  options,
  onChange,
  allLabel,
}: {
  value: T[];
  options: readonly T[];
  onChange: (next: T[]) => void;
  allLabel: string;
}) {
  // More than one value can be active (a KPI tile can set two); the control
  // then reports the count rather than pretending one of them is selected.
  const single = value.length === 1 ? value[0] : '';

  return (
    <select
      className={CONTROL}
      value={value.length > 1 ? '__multi' : single}
      onChange={(e) => onChange(e.target.value ? ([e.target.value] as T[]) : [])}
    >
      <option value="">{allLabel}</option>
      {value.length > 1 && (
        <option value="__multi" disabled>
          {value.length} selected
        </option>
      )}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

export function RangePicker({
  filters,
  onChange,
}: {
  filters: MaintenanceDashboardFilters;
  onChange: (next: Partial<MaintenanceDashboardFilters>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* `bg-slate-100` exactly, not an opacity variant: the dark theme remaps
          the bare utility and would leave a `/70` version light. */}
      <div className="inline-flex flex-wrap items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5">
        {PERIODS.map((period) => (
          <button
            key={period.value}
            type="button"
            onClick={() => onChange({ period: period.value })}
            aria-pressed={filters.period === period.value}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              filters.period === period.value
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {period.label}
          </button>
        ))}
      </div>

      {filters.period === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            aria-label="Range start"
            value={filters.from ?? ''}
            max={filters.to}
            onChange={(e) => onChange({ from: e.target.value })}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:border-primary-500 focus:outline-none"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            aria-label="Range end"
            value={filters.to ?? ''}
            min={filters.from}
            onChange={(e) => onChange({ to: e.target.value })}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:border-primary-500 focus:outline-none"
          />
          {/* Until both ends are set there is no range to send, so the screen
              keeps showing the last complete one rather than erroring. */}
          {(!filters.from || !filters.to) && (
            <span className="text-[11px] text-amber-600">Pick both dates</span>
          )}
        </div>
      )}
    </div>
  );
}

export function DashboardFilters({
  filters,
  options,
  onChange,
  onClear,
  activeCount,
}: {
  filters: MaintenanceDashboardFilters;
  options: MaintenanceFilterOptions | undefined;
  onChange: (next: Partial<MaintenanceDashboardFilters>) => void;
  onClear: () => void;
  activeCount: number;
}) {
  const organizations = options?.organizations ?? [];
  const facilities = (options?.facilities ?? []).filter(
    (f) => !filters.organization || f.organizationId === filters.organization,
  );
  const locations = (options?.locations ?? []).filter((l) => !filters.facility || l.facilityId === filters.facility);
  const categories = options?.categories ?? [];

  return (
    <div className="glass-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangePicker filters={filters} onChange={onChange} />
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
          </button>
        )}
      </div>

      <div
        className="mt-4 grid gap-x-3 gap-y-3 border-t border-slate-100 pt-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
      >
        <FilterField label="Organization">
          <select
            className={CONTROL}
            value={filters.organization ?? ''}
            // Changing the organisation invalidates everything below it.
            onChange={(e) => onChange({ organization: e.target.value || undefined, facility: undefined, location: undefined })}
          >
            <option value="">All organizations</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Facility">
          <select
            className={CONTROL}
            value={filters.facility ?? ''}
            onChange={(e) => onChange({ facility: e.target.value || undefined, location: undefined })}
          >
            <option value="">All facilities</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Warehouse / location">
          <select
            className={CONTROL}
            value={filters.location ?? ''}
            onChange={(e) => onChange({ location: e.target.value || undefined })}
            disabled={locations.length === 0}
          >
            <option value="">{locations.length === 0 ? 'None recorded' : 'All locations'}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Maintenance type">
          <EnumSelect<MaintenanceKind>
            value={filters.types}
            options={MAINTENANCE_KINDS}
            onChange={(types) => onChange({ types })}
            allLabel="All types"
          />
        </FilterField>

        <FilterField label="Priority">
          <EnumSelect<WorkOrderPriority>
            value={filters.priorities}
            options={WORK_ORDER_PRIORITIES}
            onChange={(priorities) => onChange({ priorities })}
            allLabel="All priorities"
          />
        </FilterField>

        <FilterField label="Status">
          <EnumSelect<MaintenanceStatus>
            value={filters.statuses}
            options={MAINTENANCE_STATUSES}
            onChange={(statuses) => onChange({ statuses })}
            allLabel="All statuses"
          />
        </FilterField>

        <FilterField label="Asset category">
          <EnumSelect<AssetCategory>
            value={filters.categories}
            options={categories}
            onChange={(next) => onChange({ categories: next })}
            allLabel={categories.length === 0 ? 'No assets yet' : 'All categories'}
          />
        </FilterField>
      </div>

      {filters.assetId && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50 px-2.5 py-0.5 font-medium text-primary-700">
            Asset {filters.assetId}
            <button
              type="button"
              onClick={() => onChange({ assetId: undefined })}
              aria-label="Clear asset filter"
              className="text-primary-400 hover:text-primary-700"
            >
              ×
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
