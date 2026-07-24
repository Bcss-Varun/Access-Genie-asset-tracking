import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkOrderStatus } from '@access-genie/shared';
import { Badge, EmptyState, ErrorState, KpiCard, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { cn, formatDate, formatRupees, isOverdue, relTime } from '@/lib/format';
import { priorityTone, workOrderStatusTone } from '@/lib/tone';
import { maintenanceApi } from './maintenance-api';

/**
 * The transitions the API will accept from each state. Mirrored here so the UI
 * only ever offers a legal move — the server still enforces it, this just keeps
 * the user from discovering the rule through an error toast.
 */
const NEXT_STATUSES: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  New: ['Assigned', 'In Progress', 'On Hold'],
  Assigned: ['In Progress', 'On Hold', 'New'],
  'In Progress': ['On Hold', 'Completed'],
  'On Hold': ['In Progress', 'Assigned'],
  Completed: [],
};

export function WorkOrderDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();

  const [comment, setComment] = useState('');
  const [hours, setHours] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: workOrder, isPending, error, refetch } = useQuery({
    queryKey: ['work-orders', id],
    queryFn: () => maintenanceApi.get(id),
    enabled: Boolean(id),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['work-orders'] });
  const onActionError = (err: unknown) => setActionError(err instanceof ApiRequestError ? err.message : 'Action failed.');

  const changeStatus = useMutation({
    mutationFn: (status: WorkOrderStatus) => maintenanceApi.changeStatus(id, status),
    onSuccess: () => {
      setActionError(null);
      void invalidate();
    },
    onError: onActionError,
  });

  const addComment = useMutation({
    mutationFn: (text: string) => maintenanceApi.comment(id, text),
    onSuccess: () => {
      setComment('');
      void invalidate();
    },
    onError: onActionError,
  });

  const logLabor = useMutation({
    mutationFn: (value: number) => maintenanceApi.logLabor(id, value, 'Logged from the work order'),
    onSuccess: () => {
      setHours('');
      void invalidate();
    },
    onError: onActionError,
  });

  const toggleChecklist = useMutation({
    mutationFn: ({ index, done }: { index: number; done: boolean }) => maintenanceApi.toggleChecklist(id, index, done),
    onSuccess: () => void invalidate(),
    onError: onActionError,
  });

  if (error) {
    const notFound = error instanceof ApiRequestError && error.code === 'NOT_FOUND';
    return (
      <ErrorState
        title={notFound ? `No work order with ID ${id}` : 'Could not load this work order'}
        description={error instanceof ApiRequestError ? error.message : undefined}
        onRetry={notFound ? undefined : () => void refetch()}
      />
    );
  }

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const late = isOverdue(workOrder.dueDate) && workOrder.status !== 'Completed';
  const partsCost = workOrder.parts.reduce((sum, part) => sum + part.qty * part.unitCost, 0);
  const loggedHours = workOrder.laborLog.reduce((sum, entry) => sum + entry.hours, 0);
  const doneItems = workOrder.checklist.filter((item) => item.done).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={workOrder.title}
        subtitle={workOrder.description || undefined}
        breadcrumb={[
          { label: 'Predictive Maintenance' },
          { label: 'Work Orders', href: '/maintenance' },
          { label: workOrder.id },
        ]}
        actions={
          <div className="flex items-center gap-1.5">
            {NEXT_STATUSES[workOrder.status].map((next) => (
              <Button
                key={next}
                size="sm"
                variant={next === 'Completed' ? 'primary' : 'secondary'}
                disabled={changeStatus.isPending}
                onClick={() => changeStatus.mutate(next)}
              >
                {next === 'Completed' ? '✓ Complete' : `Move to ${next}`}
              </Button>
            ))}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={workOrderStatusTone[workOrder.status]}>{workOrder.status}</Badge>
        <Badge tone={priorityTone[workOrder.priority]}>{workOrder.priority}</Badge>
        <Badge tone="slate">{workOrder.type}</Badge>
        {workOrder.aiGenerated && <Badge tone="primary">AI generated</Badge>}
        <span className={cn('text-xs', late ? 'text-health-critical font-semibold' : 'text-slate-500')}>
          {late ? 'Overdue — due ' : 'Due '}
          {formatDate(workOrder.dueDate)}
        </span>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-health-critical bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {actionError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Asset" value={<Link to={`/assets/${workOrder.assetId}`} className="text-primary-700 hover:underline text-lg">{workOrder.assetId}</Link>} sub={workOrder.assetName} />
        <KpiCard label="Assigned to" value={<span className="text-lg">{workOrder.assignedTo}</span>} />
        <KpiCard label="Labour logged" value={`${loggedHours}h`} sub={`of ${workOrder.estimatedHours}h estimated`} tone={loggedHours > workOrder.estimatedHours ? 'amber' : 'slate'} />
        <KpiCard label="Parts cost" value={formatRupees(partsCost)} sub={`${workOrder.parts.length} line item(s)`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Checklist ─────────────────────────────────────────────────── */}
        <section className="glass-panel overflow-hidden">
          <header className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold text-slate-800">Checklist</h2>
            <span className="text-[11px] text-slate-400">
              {doneItems} / {workOrder.checklist.length} done
            </span>
          </header>

          {workOrder.checklist.length === 0 ? (
            <EmptyState icon="✅" title="No checklist" description="This work order has no steps recorded." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {workOrder.checklist.map((item, index) => (
                <li key={`${item.label}-${index}`} className="px-5 py-2.5 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={workOrder.status === 'Completed' || toggleChecklist.isPending}
                    onChange={(e) => toggleChecklist.mutate({ index, done: e.target.checked })}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-400"
                    aria-label={item.label}
                  />
                  <span className={cn('text-sm', item.done ? 'text-slate-400 line-through' : 'text-slate-700')}>{item.label}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Parts ─────────────────────────────────────────────────────── */}
        <section className="glass-panel overflow-hidden">
          <header className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="font-heading text-sm font-semibold text-slate-800">Parts</h2>
          </header>

          {workOrder.parts.length === 0 ? (
            <EmptyState icon="📦" title="No parts booked" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {workOrder.parts.map((part) => (
                <li key={part.sku} className="px-5 py-2.5 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm text-slate-700 truncate">{part.name}</span>
                    <span className="block text-[11px] text-slate-400 font-mono">{part.sku}</span>
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
                    {part.qty} × {formatRupees(part.unitCost)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Labour ────────────────────────────────────────────────────── */}
        <section className="glass-panel overflow-hidden">
          <header className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="font-heading text-sm font-semibold text-slate-800">Labour log</h2>
          </header>

          <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {workOrder.laborLog.length === 0 ? (
              <li className="px-5 py-6 text-center text-sm text-slate-400">No labour logged yet.</li>
            ) : (
              workOrder.laborLog.map((entry, index) => (
                <li key={index} className="px-5 py-2.5">
                  <p className="text-sm text-slate-700">
                    <strong>{entry.hours}h</strong> — {entry.tech}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {entry.note} · {relTime(entry.at)}
                  </p>
                </li>
              ))
            )}
          </ul>

          {workOrder.status !== 'Completed' && (
            <form
              className="px-5 py-3 border-t border-slate-100 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const value = Number(hours);
                if (value > 0) logLabor.mutate(value);
              }}
            >
              <input
                type="number"
                step="0.5"
                min="0.1"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Hours"
                aria-label="Hours worked"
                className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
              <Button type="submit" size="sm" variant="outline" disabled={!hours || logLabor.isPending}>
                Log time
              </Button>
            </form>
          )}
        </section>

        {/* ── Comments ──────────────────────────────────────────────────── */}
        <section className="glass-panel overflow-hidden">
          <header className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="font-heading text-sm font-semibold text-slate-800">Comments</h2>
          </header>

          <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {workOrder.comments.length === 0 ? (
              <li className="px-5 py-6 text-center text-sm text-slate-400">No comments yet.</li>
            ) : (
              workOrder.comments.map((entry, index) => (
                <li key={index} className="px-5 py-2.5">
                  <p className="text-sm text-slate-700">{entry.text}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {entry.author} · {relTime(entry.at)}
                  </p>
                </li>
              ))
            )}
          </ul>

          <form
            className="px-5 py-3 border-t border-slate-100 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (comment.trim()) addComment.mutate(comment.trim());
            }}
          >
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment…"
              aria-label="Add a comment"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!comment.trim() || addComment.isPending}>
              Post
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
