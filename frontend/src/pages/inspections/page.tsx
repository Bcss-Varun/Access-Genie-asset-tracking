import { useCallback, useState } from 'react';
import type { InspectionTemplate } from '@access-genie/shared';
import {
  EMPTY_INSPECTION_FILTERS,
  activeInspectionFilterCount,
  inspectionsApi,
  useInspectionFacets,
  useInspectionList,
  useInspectionStats,
  useInspectionTemplates,
  useRefreshInspections,
  type InspectionFilters,
} from '@/api/inspections';
import { ApiRequestError } from '@/api/client';
import { useMutate } from '@/api/mutate';
import { ErrorState, MetricCard, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { InspectionFilterBar } from '@/components/maintenance/inspections/InspectionFilters';
import { RecordsList } from '@/components/maintenance/inspections/RecordsList';
import { TemplatesList } from '@/components/maintenance/inspections/TemplatesList';
import { TemplateEditor } from '@/components/maintenance/inspections/TemplateEditor';
import { ScheduleDialog } from '@/components/maintenance/inspections/ScheduleDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

/**
 * Inspections & Checklists — one module, two views.
 *
 * This replaces two separate screens. "Checklists" was a library of templates
 * made of plain strings, and "Inspections" was a list of records that could not
 * be created from one: the two halves of a single workflow, each unable to
 * reach the other. They are now the same page, and a template exists in order
 * to be scheduled.
 *
 * Everything on screen comes from the API. The summary cards take the same
 * filters as the list beneath them, so the numbers describe the cut in view
 * rather than the whole estate.
 */

type View = 'records' | 'templates';

export default function InspectionsPage() {
  const [view, setView] = useState<View>('records');
  const [filters, setFilters] = useState<InspectionFilters>(EMPTY_INSPECTION_FILTERS);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('scheduledFor');
  const [templateSearch, setTemplateSearch] = useState('');

  const [editing, setEditing] = useState<{ template?: InspectionTemplate } | null>(null);
  const [scheduling, setScheduling] = useState<{ template?: InspectionTemplate } | null>(null);
  const [retiring, setRetiring] = useState<InspectionTemplate | null>(null);

  const { run } = useMutate();
  const refresh = useRefreshInspections();
  const { toast } = useToast();

  const listFilters: InspectionFilters = { ...filters, page, limit: 25, sort };
  const list = useInspectionList(listFilters, view === 'records');
  const stats = useInspectionStats(filters);
  const facets = useInspectionFacets();
  const templates = useInspectionTemplates({ q: templateSearch || undefined }, view === 'templates');

  const activeCount = activeInspectionFilterCount(filters);
  const now = Date.now();

  const update = useCallback((next: Partial<InspectionFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    // Any filter change invalidates the page number: staying on page 3 of a
    // one-page result shows an empty table and reads as a bug.
    setPage(1);
  }, []);

  const clear = useCallback(() => {
    setFilters(EMPTY_INSPECTION_FILTERS);
    setPage(1);
  }, []);

  const confirmRetire = useCallback(async () => {
    if (!retiring) return;
    const used = (retiring.usageCount ?? 0) > 0;

    const result = await run(inspectionsApi.removeTemplate(retiring.id), {
      describe: used ? 'retire that template' : 'delete that template',
      refresh,
    });

    if (result) {
      toast({
        title: result.deleted ? `${retiring.name} deleted` : `${retiring.name} retired`,
        description: result.deleted
          ? 'It had never been scheduled, so nothing referenced it.'
          : 'Inspections raised from it stay readable; it can no longer be scheduled.',
        tone: 'success',
      });
    }
    setRetiring(null);
  }, [retiring, run, refresh, toast]);

  const activeQuery = view === 'records' ? list : templates;
  const error = activeQuery.error;

  const metrics = [
    { label: 'Scheduled', value: stats.data?.scheduled ?? 0, tone: 'slate' as const, icon: '🗓️', sub: 'Not started' },
    { label: 'In Progress', value: stats.data?.inProgress ?? 0, tone: 'amber' as const, icon: '🔎', sub: 'Being carried out' },
    { label: 'Passed', value: stats.data?.passed ?? 0, tone: 'emerald' as const, icon: '✅', sub: 'All checks clear' },
    { label: 'Failed', value: stats.data?.failed ?? 0, tone: 'red' as const, icon: '⚠️', sub: 'Defects found' },
    {
      label: 'Overdue',
      value: stats.data?.overdue ?? 0,
      // Zero overdue is good news, not an alarm — a red rail on "0" trains
      // people to stop reading the colour.
      tone: (stats.data?.overdue ?? 0) > 0 ? ('red' as const) : ('slate' as const),
      icon: '⏰',
      sub: (stats.data?.overdue ?? 0) > 0 ? 'Past their date' : 'On schedule',
    },
  ];

  return (
    <div className="flex h-full flex-col space-y-5">
      <PageHeader
        title="Inspections & Checklists"
        subtitle="Build reusable checklists, schedule them against assets, and record what was found."
        actions={
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-sm font-medium">
              {(
                [
                  ['records', 'Records'],
                  ['templates', 'Templates'],
                ] as [View, string][]
              ).map(([option, label]) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  aria-pressed={view === option}
                  className={cn(
                    'rounded-md px-3 py-1.5 transition-colors',
                    view === option ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {view === 'templates' ? (
              <Button onClick={() => setEditing({})}>+ New Template</Button>
            ) : (
              <Button onClick={() => setScheduling({})}>+ Schedule Inspection</Button>
            )}
          </div>
        }
      />

      {/* The five summary cards. Same filters as the list below them. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            sub={metric.sub}
            tone={metric.tone}
            icon={metric.icon}
          />
        ))}
      </div>

      {view === 'records' ? (
        <InspectionFilterBar
          filters={filters}
          facets={facets.data}
          onChange={update}
          onClear={clear}
          activeCount={activeCount}
        />
      ) : (
        <div className="glass-panel p-4">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" aria-hidden>
              🔍
            </span>
            <input
              type="search"
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              placeholder="Search templates by name, description or category…"
              aria-label="Search templates"
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-700 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25"
            />
          </div>
        </div>
      )}

      {error ? (
        <div className="glass-panel">
          <ErrorState
            title={view === 'records' ? 'Could not load inspections' : 'Could not load templates'}
            description={error instanceof ApiRequestError ? error.message : 'The request failed.'}
            requestId={error instanceof ApiRequestError ? error.requestId : undefined}
            onRetry={() => void activeQuery.refetch()}
          />
        </div>
      ) : view === 'records' ? (
        <RecordsList
          items={list.data?.items ?? []}
          meta={list.data?.meta}
          loading={list.isLoading}
          sort={sort}
          onSort={(next) => {
            setSort(next);
            setPage(1);
          }}
          onPage={setPage}
          now={now}
          filtersActive={activeCount > 0}
          onSchedule={() => setScheduling({})}
        />
      ) : (
        <TemplatesList
          templates={templates.data?.items ?? []}
          loading={templates.isLoading}
          onEdit={(template) => setEditing({ template })}
          onSchedule={(template) => setScheduling({ template })}
          onCreate={() => setEditing({})}
          onRetire={setRetiring}
          filtersActive={templateSearch.length > 0}
        />
      )}

      {editing && <TemplateEditor existing={editing.template} onClose={() => setEditing(null)} />}
      {scheduling && <ScheduleDialog template={scheduling.template} onClose={() => setScheduling(null)} />}

      {retiring && (
        <ConfirmDialog
          title={(retiring.usageCount ?? 0) > 0 ? `Retire ${retiring.name}?` : `Delete ${retiring.name}?`}
          // The consequence is spelled out because the two outcomes differ, and
          // which one applies depends on data the reader cannot see from here.
          description={
            (retiring.usageCount ?? 0) > 0
              ? `${retiring.usageCount} inspection${retiring.usageCount === 1 ? ' has' : 's have'} been raised from this template, so it will be retired rather than deleted — those records stay readable, and it can no longer be scheduled.`
              : 'This template has never been scheduled, so it will be deleted outright.'
          }
          confirmLabel={(retiring.usageCount ?? 0) > 0 ? 'Retire' : 'Delete'}
          onConfirm={() => void confirmRetire()}
          onCancel={() => setRetiring(null)}
        />
      )}
    </div>
  );
}
