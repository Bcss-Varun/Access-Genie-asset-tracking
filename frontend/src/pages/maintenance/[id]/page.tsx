import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  WORK_ORDER_TRANSITIONS,
  nextWorkOrderStatus,
  type WorkOrder,
  type WorkOrderStatus,
} from '@access-genie/shared';
import {
  maintenanceApi,
  useRefreshWorkOrders,
  useWorkOrder,
  useWorkOrderFacets,
} from '@/api/work-orders';
import { ApiRequestError } from '@/api/client';
import { useMutate } from '@/api/mutate';
import { PageHeader, Badge, EmptyState, ErrorState, Avatar, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { getAssetById } from '@/lib/dataset';
import { cn, formatMoney, relTime } from '@/lib/utils';
import { categoryEmoji } from '@/lib/asset-categories';
import { priorityTone, workOrderStatusTone } from '@/lib/tone';
import { FieldActionButtons, SlaChip } from '@/components/workforce/WorkOrderActions';
import { fieldStageLabel, toolsForWorkOrder, STAGE_TONE } from '@/lib/field-ops';
import { TYPE_EMOJI, formatDate, initials, sourceLabel } from '@/components/maintenance/work-orders/tokens';
import { SourceBadge } from '@/components/maintenance/work-orders/shared';

/**
 * One work order.
 *
 * Reads the record from the API rather than from the hydrated dataset, so this
 * page shows what is stored — including work orders raised since the session
 * started, which the dataset (fetched once at login) simply does not contain.
 *
 * Every control writes through an endpoint and re-reads. The previous version
 * kept status, checklist and comments in local state seeded from the mock
 * record: the page looked fully interactive, and a refresh discarded all of it.
 */

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 font-heading text-base font-bold">
      {children}
      {count !== undefined && (
        <span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-xs font-medium text-primary-600">{count}</span>
      )}
    </h3>
  );
}

/**
 * The status trail.
 *
 * Server-written on every transition, including the opening "created as New" —
 * so the state an order started in is recorded rather than inferred from the
 * absence of an entry.
 */
function StatusHistory({ workOrder }: { workOrder: WorkOrder }) {
  const history = workOrder.history ?? [];

  return (
    <div className="glass-panel rounded-xl p-6">
      <SectionTitle count={history.length}>Status History</SectionTitle>

      {history.length === 0 ? (
        <p className="text-sm text-slate-500">
          No transitions recorded. This order predates status history — its trail starts from the next change.
        </p>
      ) : (
        <ol className="space-y-3">
          {[...history].reverse().map((event, i) => (
            <li key={`${event.at}-${i}`} className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  {event.from ? (
                    <>
                      <span className="text-slate-500">{event.from}</span>
                      <span className="text-slate-300">→</span>
                    </>
                  ) : (
                    <span className="text-slate-500">Created as</span>
                  )}
                  <span className="font-medium text-slate-800">{event.to}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {event.actor} · {relTime(event.at)}
                </p>
                {event.note && <p className="mt-1 text-xs text-slate-600">{event.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function WorkOrderDetailPage() {
  const { id = '' } = useParams();
  const query = useWorkOrder(id);
  const facets = useWorkOrderFacets();
  const { run, isPending } = useMutate();
  const refreshWorkOrders = useRefreshWorkOrders();

  const [draft, setDraft] = useState('');

  const wo = query.data;

  // ── Writes ─────────────────────────────────────────────────────────────────
  // Each re-reads on success. None are optimistic: a transition can be refused
  // by the server, and a screen that shows the new state and then snaps back is
  // worse than one that waits.
  //
  // `refresh` runs the moment the write lands, ahead of the shared dataset
  // re-read — otherwise this page sits on the pre-click state for as long as
  // the whole `/dataset` payload takes to come back.
  // Invalidating the work-order key already refetches this record — its query
  // lives under that key — so an explicit `query.refetch()` here would be a
  // second round trip for the answer already on its way.
  const refresh = refreshWorkOrders;

  const changeStatus = async (next: WorkOrderStatus) => {
    if (!wo) return;
    await run(maintenanceApi.changeStatus(wo.id, next), {
      success: `${wo.id} → ${next}`,
      describe: 'change that status',
      refresh,
    });
  };

  const assign = async (name: string) => {
    if (!wo) return;
    await run(maintenanceApi.assign(wo.id, name), {
      success: name === 'Unassigned' ? `${wo.id} returned to the queue` : `${wo.id} assigned to ${name}`,
      describe: 'assign that work order',
      refresh,
    });
  };

  const toggleItem = async (index: number, done: boolean) => {
    if (!wo) return;
    await run(maintenanceApi.toggleChecklist(wo.id, index, done), { describe: 'update that checklist item', refresh });
  };

  const addComment = async () => {
    const text = draft.trim();
    if (!text || !wo) return;
    const saved = await run(maintenanceApi.comment(wo.id, text), { success: 'Comment added', describe: 'add that comment', refresh });
    if (saved) setDraft('');
  };

  // ── Loading / error / not found ────────────────────────────────────────────
  if (query.isLoading) {
    return (
      <div className="flex h-full flex-col space-y-6">
        <PageHeader title="Work order" breadcrumb={[{ label: 'Automated Work Orders', href: '/maintenance' }, { label: id }]} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (query.isError || !wo) {
    const notFound = query.error instanceof ApiRequestError && query.error.status === 404;
    return (
      <div className="flex h-full flex-col space-y-6">
        <PageHeader
          title={notFound ? 'Work order not found' : 'Could not load this work order'}
          breadcrumb={[{ label: 'Automated Work Orders', href: '/maintenance' }, { label: id }]}
        />
        <div className="glass-panel rounded-xl">
          {notFound ? (
            <EmptyState
              icon="🔍"
              title="Work order not found"
              description={`No work order matches ${id}. It may have been deleted, or the link is out of date.`}
              action={
                <Link to="/maintenance">
                  <Button variant="primary">← Back to Work Orders</Button>
                </Link>
              }
            />
          ) : (
            <ErrorState
              description={query.error instanceof ApiRequestError ? query.error.message : undefined}
              requestId={query.error instanceof ApiRequestError ? query.error.requestId : undefined}
              onRetry={() => void query.refetch()}
            />
          )}
        </div>
      </div>
    );
  }

  const asset = getAssetById(wo.assetId);
  const checklist = wo.checklist ?? [];
  const doneCount = checklist.filter((c) => c.done).length;
  const progress = checklist.length === 0 ? 0 : Math.round((doneCount / checklist.length) * 100);
  const partsTotal = wo.parts.reduce((sum, p) => sum + p.qty * p.unitCost, 0);
  const laborHours = wo.laborLog.reduce((sum, l) => sum + l.hours, 0);

  // Only the moves the server will accept — one map, shared with the API.
  const allowed = WORK_ORDER_TRANSITIONS[wo.status];
  const next = nextWorkOrderStatus(wo.status);
  const closed = allowed.length === 0;

  const assignees = (facets.data?.technicians ?? []).filter((t) => t.kind !== 'historic');

  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader
        breadcrumb={[{ label: 'Automated Work Orders', href: '/maintenance' }, { label: wo.id }]}
        title={wo.title}
        subtitle={`${wo.id} • ${wo.type} • ${wo.assetName}`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {next && allowed.includes(next) && (
              <Button variant="primary" disabled={isPending} onClick={() => void changeStatus(next)}>
                Advance to {next} →
              </Button>
            )}

            {/* Only legal transitions are listed — a menu offering a move the
                server refuses is a button that fails every time. */}
            <Dropdown
              ariaLabel="Change status"
              trigger={({ toggle }) => (
                <Button variant="outline" onClick={toggle} disabled={closed || isPending}>
                  {closed ? `${wo.status} — closed` : 'Status ▾'}
                </Button>
              )}
            >
              {({ close }) => (
                <>
                  {allowed.map((status) => (
                    <MenuItem
                      key={status}
                      onClick={() => {
                        void changeStatus(status);
                        close();
                      }}
                    >
                      {status}
                    </MenuItem>
                  ))}
                </>
              )}
            </Dropdown>

            <Dropdown
              ariaLabel="Assign technician"
              trigger={({ toggle }) => (
                <Button variant="outline" onClick={toggle} disabled={isPending}>
                  Assign ▾
                </Button>
              )}
            >
              {({ close }) => (
                <>
                  <MenuItem
                    icon={wo.assignedTo === 'Unassigned' ? '✓' : ''}
                    onClick={() => {
                      void assign('Unassigned');
                      close();
                    }}
                  >
                    Unassigned
                  </MenuItem>
                  {assignees.map((tech) => (
                    <MenuItem
                      key={tech.name}
                      icon={wo.assignedTo === tech.name ? '✓' : ''}
                      onClick={() => {
                        void assign(tech.name);
                        close();
                      }}
                    >
                      {tech.name}
                      {tech.kind === 'user' ? ' (user)' : ''}
                    </MenuItem>
                  ))}
                </>
              )}
            </Dropdown>
          </div>
        }
      />

      {/* Chip row */}
      <div className="-mt-2 flex flex-wrap items-center gap-2">
        <Badge tone={workOrderStatusTone[wo.status]}>{wo.status}</Badge>
        {wo.status !== 'Completed' && <Badge tone={STAGE_TONE[fieldStageLabel(wo)]}>Field: {fieldStageLabel(wo)}</Badge>}
        <Badge tone={priorityTone[wo.priority]}>{wo.priority} priority</Badge>
        <Badge tone="slate">
          {TYPE_EMOJI[wo.type]} {wo.type}
        </Badge>
        <SourceBadge source={wo.source} />
        <Link
          to={`/assets/${wo.assetId}`}
          className="ml-1 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-primary-600"
        >
          <span>{categoryEmoji(asset?.category)}</span>
          <span className="truncate">{wo.assetName}</span>
          <span className="text-slate-300">↗</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT — main working area */}
        <div className="space-y-6 lg:col-span-2">
          <div className="glass-panel rounded-xl p-6">
            <SectionTitle>Description</SectionTitle>
            <p className="text-sm leading-relaxed text-slate-600">
              {wo.description || <span className="text-slate-400">No description was recorded.</span>}
            </p>
          </div>

          {checklist.length > 0 && (
            <div className="glass-panel rounded-xl p-6">
              <div className="mb-3 flex items-center justify-between">
                <SectionTitle>Checklist</SectionTitle>
                <span className="text-xs font-semibold text-slate-500">
                  {doneCount}/{checklist.length} done
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <ul className="mt-4 space-y-1">
                {checklist.map((item, index) => (
                  <li key={`${item.label}-${index}`}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={item.done}
                        disabled={isPending}
                        onChange={() => void toggleItem(index, !item.done)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-primary-600"
                      />
                      <span className={cn('text-sm', item.done ? 'text-slate-400 line-through' : 'text-slate-700')}>
                        {item.label}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="glass-panel rounded-xl p-6">
            <SectionTitle count={wo.parts.length}>Parts</SectionTitle>
            {wo.parts.length === 0 ? (
              <p className="text-sm text-slate-500">No parts recorded for this work order.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-medium">SKU</th>
                      <th className="py-2 pr-3 font-medium">Part</th>
                      <th className="py-2 pr-3 text-right font-medium">Qty</th>
                      <th className="py-2 pr-3 text-right font-medium">Unit</th>
                      <th className="py-2 text-right font-medium">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wo.parts.map((p) => (
                      <tr key={p.sku} className="border-b border-slate-100">
                        <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">{p.sku}</td>
                        <td className="py-2.5 pr-3 text-slate-800">{p.name}</td>
                        <td className="py-2.5 pr-3 text-right text-slate-700">{p.qty}</td>
                        <td className="py-2.5 pr-3 text-right text-slate-700">{formatMoney(p.unitCost)}</td>
                        <td className="py-2.5 text-right font-semibold text-slate-900">{formatMoney(p.qty * p.unitCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="py-2.5 pr-3 text-right text-sm font-medium text-slate-500">
                        Parts total
                      </td>
                      <td className="py-2.5 text-right font-heading text-base font-bold text-slate-900">
                        {formatMoney(partsTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="glass-panel rounded-xl p-6">
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle count={wo.laborLog.length}>Labor Log</SectionTitle>
              {laborHours > 0 && <span className="text-xs font-semibold text-slate-500">{laborHours}h logged</span>}
            </div>
            {wo.laborLog.length === 0 ? (
              <p className="text-sm text-slate-500">No labor logged yet — hours appear once work begins.</p>
            ) : (
              <ul className="space-y-3">
                {wo.laborLog.map((l, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                    <Avatar initials={initials(l.tech)} className="h-8 w-8 shrink-0 text-xs" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-800">{l.tech}</span>
                        <span className="shrink-0 text-xs font-semibold text-slate-500">{l.hours}h</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{l.note}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{relTime(l.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* RIGHT — details, history, comments */}
        <div className="space-y-6 lg:col-span-1">
          {wo.status !== 'Completed' && wo.status !== 'Cancelled' && (
            <div className="glass-panel rounded-xl p-6">
              <SectionTitle>Field Execution</SectionTitle>
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-slate-500">SLA</span>
                <SlaChip dueDate={wo.dueDate} status={wo.status} />
              </div>
              <div className="mb-4">
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Required tools</div>
                <div className="flex flex-wrap gap-1.5">
                  {toolsForWorkOrder(wo).map((t) => (
                    <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <FieldActionButtons wo={wo} size="md" />
            </div>
          )}

          <div className="glass-panel rounded-xl p-6">
            <SectionTitle>Details</SectionTitle>
            <div className="mb-5 flex items-center gap-3">
              <Avatar initials={initials(wo.assignedTo)} className="h-10 w-10 shrink-0 text-sm" />
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-slate-500">Assigned to</div>
                <div className="truncate text-sm font-semibold text-slate-900">{wo.assignedTo}</div>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <KV label="Status" value={<Badge tone={workOrderStatusTone[wo.status]}>{wo.status}</Badge>} />
              <KV label="Priority" value={<Badge tone={priorityTone[wo.priority]}>{wo.priority}</Badge>} />
              <KV label="Source" value={sourceLabel(wo.source)} />
              <KV label="Type" value={`${TYPE_EMOJI[wo.type]} ${wo.type}`} />
              <KV label="Scheduled" value={formatDate(wo.scheduledDate)} />
              <KV label="Due" value={formatDate(wo.dueDate)} />
              <KV label="Est. hours" value={`${wo.estimatedHours}h`} />
              <KV label="Created" value={relTime(wo.createdAt)} />
              {/* Read off the asset's location, not stored on the order — so it
                  follows the asset rather than freezing at raise time. */}
              <KV label="Facility" value={wo.placement?.facilityName ?? '—'} />
              <KV label="Organization" value={wo.placement?.organizationName ?? '—'} />
              {wo.completedAt && <KV label="Completed" value={relTime(wo.completedAt)} />}
              {wo.requiredSkill && <KV label="Required skill" value={wo.requiredSkill} />}
            </dl>

            <div className="mt-5 border-t border-slate-200 pt-4">
              <Link
                to={`/assets/${wo.assetId}`}
                className="flex items-center gap-2 text-sm text-slate-700 transition-colors hover:text-primary-600"
              >
                <span className="text-lg">{categoryEmoji(asset?.category)}</span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{wo.assetName}</div>
                  <div className="font-mono text-xs text-slate-400">{wo.assetId}</div>
                </div>
                <span className="ml-auto text-slate-300">↗</span>
              </Link>
            </div>
          </div>

          <StatusHistory workOrder={wo} />

          <div className="glass-panel rounded-xl p-6">
            <SectionTitle count={wo.comments.length}>Comments</SectionTitle>
            {wo.comments.length === 0 ? (
              <p className="text-sm text-slate-500">No comments yet.</p>
            ) : (
              <ul className="space-y-4">
                {wo.comments.map((c, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Avatar initials={initials(c.author)} className="h-8 w-8 shrink-0 text-xs" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">{c.author}</span>
                        <span className="text-[11px] text-slate-400">{relTime(c.at)}</span>
                      </div>
                      <p className="mt-0.5 break-words text-sm text-slate-600">{c.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 border-t border-slate-200 pt-4">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment…"
                rows={3}
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
              <div className="mt-2 flex justify-end">
                <Button variant="primary" size="sm" onClick={() => void addComment()} disabled={!draft.trim() || isPending}>
                  Comment
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
