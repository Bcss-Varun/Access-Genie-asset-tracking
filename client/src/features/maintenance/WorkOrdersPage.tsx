import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { WORK_ORDER_PRIORITIES, WORK_ORDER_STATUSES } from '@access-genie/shared';
import { Badge, EmptyState, ErrorState, KpiCard, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button, LinkButton } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { cn, formatDate, isOverdue } from '@/lib/format';
import { priorityTone, workOrderStatusTone } from '@/lib/tone';
import { maintenanceApi } from './maintenance-api';

export function WorkOrdersPage() {
  const [params, setParams] = useSearchParams();

  const status = params.get('status') ?? '';
  const priority = params.get('priority') ?? '';
  const overdue = params.get('overdue') === 'true';
  const page = Number(params.get('page') ?? '1');

  const filters = {
    page,
    limit: 25,
    sort: 'dueDate',
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(overdue ? { overdue: true } : {}),
  };

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['work-orders', filters],
    queryFn: () => maintenanceApi.list(filters),
    placeholderData: keepPreviousData,
  });

  const { data: stats } = useQuery({ queryKey: ['work-orders', 'stats'], queryFn: maintenanceApi.stats });

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automated Work Orders"
        subtitle="Corrective, preventive and AI-raised predictive work in one queue."
        actions={
          <LinkButton to="/maintenance/new" size="sm">
            ➕ Raise work order
          </LinkButton>
        }
      />

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Open" value={stats.open} sub={`${stats.estimatedHoursOpen}h estimated`} accent tone="primary" />
          <KpiCard label="Overdue" value={stats.overdue} tone={stats.overdue > 0 ? 'red' : 'emerald'} />
          <KpiCard label="AI-generated" value={stats.aiGenerated} sub="Raised by the predictive engine" tone="primary" />
          <KpiCard label="Completed" value={stats.completed} tone="emerald" />
        </div>
      )}

      <div className="glass-panel p-3 flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setParam('status', e.target.value)}
          aria-label="Filter by status"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        >
          <option value="">All statuses</option>
          {WORK_ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(e) => setParam('priority', e.target.value)}
          aria-label="Filter by priority"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        >
          <option value="">All priorities</option>
          {WORK_ORDER_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <Button variant={overdue ? 'primary' : 'ghost'} size="sm" onClick={() => setParam('overdue', overdue ? '' : 'true')}>
          Overdue only
        </Button>

        {(status || priority || overdue) && (
          <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
            Clear
          </Button>
        )}
      </div>

      {error ? (
        <ErrorState
          title="Could not load work orders"
          description={error instanceof ApiRequestError ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : isPending ? (
        <TableSkeleton rows={8} columns={5} />
      ) : data.items.length === 0 ? (
        <div className="glass-panel">
          <EmptyState icon="🔧" title="No work orders here" description="Nothing matches this view." />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {data.items.map((wo) => {
              const late = isOverdue(wo.dueDate) && wo.status !== 'Completed';
              return (
                <li key={wo.id}>
                  <Link to={`/maintenance/${wo.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-800 truncate">{wo.title}</span>
                        {wo.aiGenerated && <Badge tone="primary">AI</Badge>}
                      </span>
                      <span className="block text-[11px] text-slate-400 mt-0.5">
                        {wo.id} · {wo.assetName} · {wo.assignedTo} · {wo.type}
                      </span>
                    </span>

                    <span className={cn('text-xs whitespace-nowrap shrink-0', late ? 'text-health-critical font-semibold' : 'text-slate-500')}>
                      {late ? 'Overdue · ' : 'Due '}
                      {formatDate(wo.dueDate)}
                    </span>

                    <Badge tone={priorityTone[wo.priority]}>{wo.priority}</Badge>
                    <Badge tone={workOrderStatusTone[wo.status]}>{wo.status}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>{data.meta.total} work orders</span>
            <span className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={!data.meta.hasPrev} onClick={() => setParam('page', String(page - 1))}>
                Previous
              </Button>
              <span className="tabular-nums">
                {data.meta.page} / {data.meta.totalPages}
              </span>
              <Button variant="secondary" size="sm" disabled={!data.meta.hasNext} onClick={() => setParam('page', String(page + 1))}>
                Next
              </Button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
