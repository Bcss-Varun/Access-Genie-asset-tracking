import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  REPORT_VISUALIZATIONS,
  type ReportDataSource,
  type ReportDefinition,
  type ReportFieldDef,
  type ReportFilterClause,
  type ReportFilterOperator,
  type ReportSourceDef,
  type ReportVisualization,
} from '@access-genie/shared';
import {
  exportApi,
  reportsApi,
  useRefreshAnalytics,
  useReport,
  useReportCatalogue,
  useReportPreview,
} from '@/api/analytics';
import { useMutate } from '@/api/mutate';
import { ApiRequestError } from '@/api/client';
import { ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ExportMenu } from '@/components/analytics/ExportMenu';
import { ReportResultView } from '@/components/analytics/ReportResultView';
import { NoData } from '@/components/analytics/charts';
import { cn } from '@/lib/utils';
import { useDebounced } from '@/lib/useDebounced';

/**
 * Report Builder.
 *
 * Pick a data source, choose what to group by and what to measure, add filters,
 * pick a chart. The preview under it is not a mock and not a client-side
 * aggregation of a payload fetched once — every change to the definition posts
 * it to `/analytics/preview`, which runs it against MongoDB and returns rows.
 * If the preview shows a number, that number came out of the database a moment
 * ago.
 *
 * The field list is fetched from the server's catalogue rather than imported,
 * so the builder can only ever offer fields this API can actually execute.
 *
 * The definition is debounced before it is sent — a filter value is typed
 * character by character, and firing a query per keystroke would put the
 * database under load to answer questions nobody asked.
 */

const VIS_LABEL: Record<ReportVisualization, string> = {
  table: '▦ Table',
  bar: '▮ Bar',
  line: '📈 Line',
  pie: '◕ Pie',
  donut: '◍ Donut',
};

const OPERATOR_LABEL: Record<ReportFilterOperator, string> = {
  eq: 'is',
  ne: 'is not',
  in: 'is one of',
  gt: 'greater than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  between: 'between',
  contains: 'contains',
};

/** Which operators make sense for a field's type. */
function operatorsFor(type: ReportFieldDef['type']): ReportFilterOperator[] {
  if (type === 'date') return ['between', 'gte', 'lte'];
  if (type === 'number' || type === 'currency' || type === 'percent') return ['gte', 'lte', 'gt', 'lt', 'eq'];
  if (type === 'boolean') return ['eq'];
  return ['eq', 'ne', 'contains'];
}

export default function ReportBuilderPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editingId = params.get('report') ?? undefined;

  const catalogue = useReportCatalogue();
  const existing = useReport(editingId);
  const refresh = useRefreshAnalytics();
  const { run: mutate, isPending } = useMutate();

  const [definition, setDefinition] = useState<ReportDefinition | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loadedId, setLoadedId] = useState<string | undefined>(undefined);

  // Memoised so the seeding effect and the source lookup below are not
  // re-keyed on a new empty array every render.
  const sources = useMemo(() => catalogue.data ?? [], [catalogue.data]);
  const source: ReportSourceDef | undefined = useMemo(
    () => sources.find((s) => s.id === definition?.source),
    [sources, definition?.source],
  );

  /*
   * Seed the composition once.
   *
   * Either from the report being edited, or from the first source's declared
   * defaults. Guarded by `loadedId` rather than by an empty dependency list so
   * that navigating from one report's edit link to another's actually reloads,
   * while typing in the form never gets overwritten by a background refetch.
   */
  useEffect(() => {
    if (editingId) {
      const report = existing.data;
      if (!report || loadedId === report.id || !report.definition) return;
      setDefinition(report.definition);
      setName(report.name);
      setDescription(report.description);
      setLoadedId(report.id);
      return;
    }

    if (definition || sources.length === 0) return;
    const first = sources[0] as ReportSourceDef;
    setDefinition({
      source: first.id,
      dimensions: [...first.defaults.dimensions],
      measures: [...first.defaults.measures],
      filters: [],
      visualization: 'bar',
    });
  }, [editingId, existing.data, sources, definition, loadedId]);

  // The preview runs against a settled definition, not against every keystroke.
  const debounced = useDebounced(definition, 350);
  const preview = useReportPreview(debounced, undefined);

  const update = useCallback(
    (patch: Partial<ReportDefinition>) => setDefinition((current) => (current ? { ...current, ...patch } : current)),
    [],
  );

  /** Switching source invalidates every field choice, so the whole definition is rebuilt. */
  const changeSource = (id: ReportDataSource) => {
    const next = sources.find((s) => s.id === id);
    if (!next) return;
    setDefinition({
      source: id,
      dimensions: [...next.defaults.dimensions],
      measures: [...next.defaults.measures],
      filters: [],
      visualization: definition?.visualization ?? 'bar',
    });
  };

  const toggleDimension = (key: string) =>
    update({
      dimensions: definition?.dimensions.includes(key)
        ? definition.dimensions.filter((d) => d !== key)
        : [...(definition?.dimensions ?? []), key].slice(0, 4),
    });

  const toggleMeasure = (key: string) => {
    if (!definition) return;
    const on = definition.measures.includes(key);
    // A report with no measure is not a question, so the last one cannot be
    // removed — the field simply stops responding rather than producing an
    // error the user did not ask for.
    if (on && definition.measures.length === 1) return;
    update({ measures: on ? definition.measures.filter((m) => m !== key) : [...definition.measures, key] });
  };

  const addFilter = () => {
    const field = source?.filters[0];
    if (!field || !definition) return;
    update({
      filters: [
        ...definition.filters,
        { field: field.key, op: operatorsFor(field.type)[0] as ReportFilterOperator, value: '' },
      ],
    });
  };

  const patchFilter = (index: number, patch: Partial<ReportFilterClause>) =>
    update({ filters: (definition?.filters ?? []).map((clause, i) => (i === index ? { ...clause, ...patch } : clause)) });

  const removeFilter = (index: number) =>
    update({ filters: (definition?.filters ?? []).filter((_, i) => i !== index) });

  const save = async () => {
    if (!definition) return;
    const trimmed = name.trim() || suggestName(definition, source);

    const result = editingId
      ? await mutate(reportsApi.update(editingId, { name: trimmed, description, definition }), {
          success: 'Report saved',
          successDetail: `"${trimmed}" now runs this definition.`,
          describe: 'save that report',
          refresh,
        })
      : await mutate(reportsApi.create({ name: trimmed, description, definition }), {
          success: 'Report saved',
          successDetail: `"${trimmed}" is in Reports — run, export or schedule it from there.`,
          describe: 'save that report',
          refresh,
        });

    if (result) navigate(`/reports/${result.id}`);
  };

  if (catalogue.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Report Builder" subtitle="Compose a report over live data." />
        <ErrorState
          title="Could not load the field catalogue"
          description={catalogue.error instanceof ApiRequestError ? catalogue.error.message : undefined}
          onRetry={() => void catalogue.refetch()}
        />
      </div>
    );
  }

  if (!definition || !source) {
    return (
      <div className="space-y-6">
        <PageHeader title="Report Builder" subtitle="Compose a report over live data." />
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  const previewError = preview.error;

  return (
    <div className="space-y-5">
      <PageHeader
        title={editingId ? 'Edit report' : 'Report Builder'}
        subtitle="Every preview below is executed against the live database — there is no sample data here."
        breadcrumb={[
          { label: 'Analytics', href: '/analytics' },
          { label: 'Reports', href: '/reports' },
          { label: editingId ? 'Edit' : 'Builder' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu
              label="Export preview"
              disabled={!preview.data || preview.data.rows.length === 0}
              onExport={(format) => exportApi.preview(definition, format, name.trim() || suggestName(definition, source))}
            />
            <Button onClick={() => void save()} disabled={isPending}>
              {isPending ? 'Saving…' : editingId ? 'Save changes' : 'Save report'}
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* ── Composition ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <section className="glass-panel p-4">
            <Legend>Data source</Legend>
            <select
              aria-label="Data source"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200"
              value={definition.source}
              onChange={(e) => changeSource(e.target.value as ReportDataSource)}
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">{source.description}</p>
            <p className="mt-1 text-[11px] text-slate-400">{source.basis}</p>
          </section>

          <section className="glass-panel p-4">
            <Legend>
              Dimensions <Count>{definition.dimensions.length}</Count>
            </Legend>
            <p className="mb-2 text-[11px] text-slate-400">What to group the rows by. Up to four.</p>
            <FieldChips
              fields={source.dimensions}
              selected={definition.dimensions}
              onToggle={toggleDimension}
              orderable
            />
          </section>

          <section className="glass-panel p-4">
            <Legend>
              Measures <Count>{definition.measures.length}</Count>
            </Legend>
            <p className="mb-2 text-[11px] text-slate-400">What to compute. The first one drives the chart.</p>
            <FieldChips fields={source.measures} selected={definition.measures} onToggle={toggleMeasure} orderable />
          </section>

          <section className="glass-panel p-4">
            <div className="flex items-center justify-between">
              <Legend>
                Filters <Count>{definition.filters.length}</Count>
              </Legend>
              <Button variant="ghost" size="sm" onClick={addFilter}>
                ＋ Add
              </Button>
            </div>
            {definition.filters.length === 0 ? (
              <p className="text-[11px] text-slate-400">
                No filters — the report covers everything in {source.label.toLowerCase()}.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {definition.filters.map((clause, index) => (
                  <FilterRow
                    key={index}
                    clause={clause}
                    fields={source.filters}
                    onChange={(patch) => patchFilter(index, patch)}
                    onRemove={() => removeFilter(index)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="glass-panel p-4">
            <Legend>Visualization</Legend>
            <div className="grid grid-cols-2 gap-2">
              {REPORT_VISUALIZATIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update({ visualization: value })}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                    definition.visualization === value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {VIS_LABEL[value]}
                </button>
              ))}
            </div>
            {definition.dimensions.length === 0 && definition.visualization !== 'table' && (
              <p className="mt-2 text-[11px] text-amber-600">
                With no dimension the report is a single totals row — add one to plot a chart.
              </p>
            )}
          </section>

          <section className="glass-panel p-4">
            <Legend>Report details</Legend>
            <label className="mb-1 block text-[11px] font-medium text-slate-500" htmlFor="report-name">
              Name
            </label>
            <input
              id="report-name"
              className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200"
              value={name}
              placeholder={suggestName(definition, source)}
              onChange={(e) => setName(e.target.value)}
            />
            <label className="mb-1 block text-[11px] font-medium text-slate-500" htmlFor="report-description">
              Description
            </label>
            <textarea
              id="report-description"
              className="min-h-[64px] w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200"
              value={description}
              placeholder="What question does this answer?"
              onChange={(e) => setDescription(e.target.value)}
            />
          </section>
        </div>

        {/* ── Preview ─────────────────────────────────────────────────── */}
        <section className="glass-panel flex min-h-[420px] flex-col p-5">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-sm font-semibold text-slate-900">Live preview</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {preview.isFetching
                  ? 'Querying…'
                  : preview.data
                    ? `${preview.data.recordsScanned} record${preview.data.recordsScanned === 1 ? '' : 's'} aggregated into ${preview.data.rowCount} row${preview.data.rowCount === 1 ? '' : 's'} · ${preview.data.scope.name}`
                    : 'Choose at least one measure'}
              </p>
            </div>
            <Link to="/reports" className="text-xs font-medium text-primary-600 hover:text-primary-700">
              All reports →
            </Link>
          </header>

          <div className="min-h-0 flex-1">
            {previewError ? (
              <ErrorState
                title="This report could not be run"
                description={previewError instanceof ApiRequestError ? previewError.message : 'The query failed.'}
                onRetry={() => void preview.refetch()}
              />
            ) : preview.isLoading ? (
              <Skeleton className="h-64 rounded-lg" />
            ) : !preview.data ? (
              <NoData message="Add a measure to see results." />
            ) : (
              <ReportResultView result={preview.data} visualization={definition.visualization} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────────────

const Legend = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
    {children}
  </div>
);

const Count = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-600">{children}</span>
);

/**
 * The field picker.
 *
 * Selected fields carry their position, because order is meaningful: dimensions
 * group outer-to-inner and the first measure is the one a chart plots. A chip
 * list that hid that would leave the user unable to say which measure they
 * meant.
 */
function FieldChips({
  fields,
  selected,
  onToggle,
  orderable,
}: {
  fields: readonly ReportFieldDef[];
  selected: string[];
  onToggle: (key: string) => void;
  orderable?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {fields.map((field) => {
        const index = selected.indexOf(field.key);
        const on = index >= 0;
        return (
          <button
            key={field.key}
            type="button"
            onClick={() => onToggle(field.key)}
            aria-pressed={on}
            title={field.hint ?? field.label}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
              on
                ? 'border-primary-400 bg-primary-50 text-primary-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-primary-200 hover:bg-primary-50/40',
            )}
          >
            {on && orderable && (
              <span className="grid size-4 place-items-center rounded-full bg-primary-600 text-[9px] font-bold text-white">
                {index + 1}
              </span>
            )}
            {field.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterRow({
  clause,
  fields,
  onChange,
  onRemove,
}: {
  clause: ReportFilterClause;
  fields: readonly ReportFieldDef[];
  onChange: (patch: Partial<ReportFilterClause>) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.key === clause.field) ?? (fields[0] as ReportFieldDef);
  const operators = operatorsFor(field.type);
  const control =
    'rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200';
  const inputType = field.type === 'date' ? 'date' : field.type === 'string' || field.type === 'boolean' ? 'text' : 'number';

  const pair = Array.isArray(clause.value) ? clause.value : ['', ''];

  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
      <div className="flex items-center gap-1.5">
        <select
          aria-label="Filter field"
          className={cn(control, 'min-w-0 flex-1')}
          value={field.key}
          onChange={(e) => {
            const next = fields.find((f) => f.key === e.target.value) as ReportFieldDef;
            // Changing the field can invalidate the operator, so both are reset
            // together rather than leaving an impossible pairing behind.
            onChange({ field: next.key, op: operatorsFor(next.type)[0] as ReportFilterOperator, value: '' });
          }}
        >
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove filter"
          className="shrink-0 rounded px-1.5 text-slate-400 hover:text-health-critical"
        >
          ✕
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <select
          aria-label="Operator"
          className={cn(control, 'shrink-0')}
          value={clause.op}
          onChange={(e) => onChange({ op: e.target.value as ReportFilterOperator, value: '' })}
        >
          {operators.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABEL[op]}
            </option>
          ))}
        </select>

        {clause.op === 'between' ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input
              type={inputType}
              aria-label="From"
              className={cn(control, 'min-w-0 flex-1')}
              value={String(pair[0] ?? '')}
              onChange={(e) => onChange({ value: [e.target.value, String(pair[1] ?? '')] })}
            />
            <input
              type={inputType}
              aria-label="To"
              className={cn(control, 'min-w-0 flex-1')}
              value={String(pair[1] ?? '')}
              onChange={(e) => onChange({ value: [String(pair[0] ?? ''), e.target.value] })}
            />
          </div>
        ) : (
          <input
            type={inputType}
            aria-label="Value"
            placeholder={field.type === 'boolean' ? 'true / false' : 'Value'}
            className={cn(control, 'min-w-0 flex-1')}
            value={Array.isArray(clause.value) ? clause.value.join(', ') : String(clause.value ?? '')}
            onChange={(e) => onChange({ value: e.target.value })}
          />
        )}
      </div>

      {field.hint && <p className="mt-1 text-[10px] text-slate-400">{field.hint}</p>}
    </li>
  );
}

/** A name from the composition, so a saved report is never called "Untitled". */
function suggestName(definition: ReportDefinition, source: ReportSourceDef | undefined): string {
  const measure =
    source?.measures.find((m) => m.key === definition.measures[0])?.label ?? definition.measures[0] ?? 'Report';
  const dimension = source?.dimensions.find((d) => d.key === definition.dimensions[0])?.label;
  return dimension ? `${measure} by ${dimension.toLowerCase()}` : `${source?.label ?? 'Report'} — ${measure.toLowerCase()}`;
}
