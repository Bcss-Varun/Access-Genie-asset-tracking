import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Inspection } from '@access-genie/shared';
import {
  inspectionsApi,
  useInspection,
  useInspectionFacets,
  useInspectionFailures,
  useRefreshInspections,
  type AnswerInput,
} from '@/api/inspections';
import { ApiRequestError } from '@/api/client';
import { useMutate } from '@/api/mutate';
import { Avatar, Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { CheckpointRunner } from '@/components/maintenance/inspections/CheckpointRunner';
import { STATUS_PILL, TYPE_EMOJI, completion, formatDate, initials } from '@/components/maintenance/inspections/tokens';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime } from '@/lib/utils';

/**
 * Carry out one inspection.
 *
 * The screen is the checklist. Answers save as they are given — a long walk
 * round a building should not lose twenty checks because a phone locked — and
 * each comes back graded by the server, so the result pill shows a verdict
 * rather than a guess.
 *
 * Completing is refused while a required checkpoint is unanswered or a failure
 * has no finding written against it. Those are the two ways a compliance record
 * ends up unusable, so they are stopped at the point the record would be signed.
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

/** The failures, each with the corrective work order it produced (or a button). */
function Failures({ inspection, onRaise, busy }: { inspection: Inspection; onRaise: (key?: string) => void; busy: boolean }) {
  const failures = useInspectionFailures(inspection.id, inspection.summary.failed > 0);
  const rows = failures.data ?? [];
  const outstanding = rows.filter((row) => !row.workOrderId);

  if (inspection.summary.failed === 0) return null;

  return (
    <div className="glass-panel rounded-xl border-l-4 border-l-health-critical p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionTitle count={rows.length}>Findings</SectionTitle>
        {outstanding.length > 0 && (
          <Button size="sm" disabled={busy} onClick={() => onRaise()}>
            Raise {outstanding.length} work order{outstanding.length === 1 ? '' : 's'}
          </Button>
        )}
      </div>

      <ul className="space-y-3">
        {rows.map((failure) => (
          <li key={failure.key} className="rounded-lg border border-red-200 bg-red-50/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{failure.label}</p>
                <p className="mt-0.5 text-xs text-slate-600">{failure.finding || 'No finding recorded.'}</p>
                {failure.value !== null && (
                  <p className="mt-0.5 text-[11px] text-slate-400">Answer: {String(failure.value)}</p>
                )}
              </div>

              <div className="shrink-0 text-right">
                {failure.workOrderId ? (
                  <Link
                    to={`/maintenance/${failure.workOrderId}`}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700"
                  >
                    {failure.workOrderId} →
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRaise(failure.key)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-primary-400 disabled:opacity-50"
                  >
                    Raise work order
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function InspectionDetailPage() {
  const { id = '' } = useParams();
  const query = useInspection(id);
  const facets = useInspectionFacets();
  const { run, isPending } = useMutate();
  const refresh = useRefreshInspections();
  const { toast } = useToast();

  const [saving, setSaving] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const inspection = query.data;

  const answer = async (input: AnswerInput) => {
    if (!inspection) return;
    setSaving(input.key);
    await run(inspectionsApi.respond(inspection.id, [input]), { describe: 'save that answer', refresh });
    setSaving(null);
  };

  const start = async () => {
    if (!inspection) return;
    await run(inspectionsApi.start(inspection.id), { success: `${inspection.id} started`, describe: 'start that inspection', refresh });
  };

  const complete = async () => {
    if (!inspection) return;
    const done = await run(inspectionsApi.complete(inspection.id, notes !== null ? { notes } : {}), {
      describe: 'complete that inspection',
      refresh,
    });
    if (done) {
      toast({
        title: `${done.id} — ${done.status}`,
        description: `${done.summary.passed} passed · ${done.summary.failed} failed · ${done.summary.na} n/a`,
        tone: done.status === 'Passed' ? 'success' : 'error',
      });
    }
  };

  const assign = async (name: string) => {
    if (!inspection) return;
    await run(inspectionsApi.assign(inspection.id, name), {
      success: name === 'Unassigned' ? `${inspection.id} returned to the queue` : `${inspection.id} assigned to ${name}`,
      describe: 'assign that inspection',
      refresh,
    });
  };

  const raiseCorrective = async (key?: string) => {
    if (!inspection) return;
    // The two endpoints answer with different shapes — one order or many — so
    // they are normalised to a list of ids before the shared toast below.
    const request: Promise<{ workOrderIds: string[] }> = key
      ? inspectionsApi.raiseCorrective(inspection.id, key).then((r) => ({ workOrderIds: [r.workOrderId] }))
      : inspectionsApi.raiseAllCorrective(inspection.id).then((r) => ({ workOrderIds: r.workOrderIds }));

    const result = await run(request, { describe: 'raise that corrective work', refresh });
    if (!result) return;

    const ids = result.workOrderIds;
    toast({
      title: `${ids.length} work order${ids.length === 1 ? '' : 's'} raised`,
      description: ids.join(', '),
      tone: 'success',
    });
  };

  // ── Loading / error / not found ────────────────────────────────────────────
  if (query.isLoading) {
    return (
      <div className="flex h-full flex-col space-y-6">
        <PageHeader title="Inspection" breadcrumb={[{ label: 'Inspections & Checklists', href: '/inspections' }, { label: id }]} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (query.isError || !inspection) {
    const notFound = query.error instanceof ApiRequestError && query.error.status === 404;
    return (
      <div className="flex h-full flex-col space-y-6">
        <PageHeader
          title={notFound ? 'Inspection not found' : 'Could not load this inspection'}
          breadcrumb={[{ label: 'Inspections & Checklists', href: '/inspections' }, { label: id }]}
        />
        <div className="glass-panel rounded-xl">
          {notFound ? (
            <EmptyState
              icon="🔍"
              title="Inspection not found"
              description={`No inspection matches ${id}. It may have been deleted, or the link is out of date.`}
              action={
                <Link to="/inspections">
                  <Button variant="primary">← Back to Inspections</Button>
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

  const closed = inspection.status === 'Passed' || inspection.status === 'Failed';
  const progress = completion(inspection);
  const assignees = (facets.data?.assignees ?? []).filter((a) => a.kind !== 'historic');
  const blockers = inspection.responses.filter(
    (r) => (r.required && r.result === 'Pending') || (r.result === 'Fail' && !r.finding?.trim()),
  );

  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader
        breadcrumb={[{ label: 'Inspections & Checklists', href: '/inspections' }, { label: inspection.id }]}
        title={inspection.title}
        subtitle={`${inspection.id} • ${inspection.templateName}${inspection.templateVersion ? ` v${inspection.templateVersion}` : ''} • ${inspection.assetName}`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {inspection.status === 'Scheduled' && (
              <Button variant="primary" disabled={isPending} onClick={() => void start()}>
                Start inspection →
              </Button>
            )}
            {inspection.status === 'In Progress' && (
              <Button
                variant="primary"
                disabled={isPending || blockers.length > 0}
                // Disabled with the reason spelled out below rather than
                // failing on submit: the blocker is visible before the click.
                title={blockers.length > 0 ? `${blockers.length} checkpoint(s) still need attention` : undefined}
                onClick={() => void complete()}
              >
                Complete inspection
              </Button>
            )}
            {!closed && (
              <Dropdown
                ariaLabel="Assign inspection"
                trigger={({ toggle }) => (
                  <Button variant="outline" onClick={toggle} disabled={isPending}>
                    Assign ▾
                  </Button>
                )}
              >
                {({ close }) => (
                  <>
                    <MenuItem
                      icon={inspection.assignedTo === 'Unassigned' ? '✓' : ''}
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
                        icon={inspection.assignedTo === tech.name ? '✓' : ''}
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
            )}
          </div>
        }
      />

      <div className="-mt-2 flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', STATUS_PILL[inspection.status])}>
          {inspection.status}
        </span>
        <Badge tone="slate">
          {TYPE_EMOJI[inspection.type]} {inspection.type}
        </Badge>
        {inspection.summary.failed > 0 && <Badge tone="red">{inspection.summary.failed} failed</Badge>}
        <Link
          to={`/assets/${inspection.assetId}`}
          className="ml-1 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-primary-600"
        >
          <span className="truncate">{inspection.assetName}</span>
          <span className="text-slate-300">↗</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT — the checklist */}
        <div className="space-y-6 lg:col-span-2">
          <div className="glass-panel overflow-hidden rounded-xl">
            <header className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <SectionTitle count={inspection.summary.total}>Checklist</SectionTitle>
                <span className="text-xs font-semibold text-slate-500">
                  {inspection.summary.total - inspection.summary.pending}/{inspection.summary.total} answered
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    inspection.summary.failed > 0 ? 'bg-health-critical' : 'bg-primary-500',
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                <span>✅ {inspection.summary.passed} passed</span>
                <span>⚠️ {inspection.summary.failed} failed</span>
                <span>➖ {inspection.summary.na} n/a</span>
                <span>⏳ {inspection.summary.pending} pending</span>
              </div>
            </header>

            {inspection.status === 'Scheduled' && (
              <p className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-800">
                Answering a checkpoint starts this inspection automatically — or press “Start inspection” first.
              </p>
            )}

            <CheckpointRunner
              inspection={inspection}
              readOnly={closed}
              saving={saving}
              onAnswer={(input) => void answer(input)}
            />
          </div>

          <Failures inspection={inspection} onRaise={(key) => void raiseCorrective(key)} busy={isPending} />

          {/* Why the Complete button is disabled, before it is pressed. */}
          {inspection.status === 'In Progress' && blockers.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <p className="font-semibold">
                {blockers.length} checkpoint{blockers.length === 1 ? '' : 's'} still need attention before this can be
                completed:
              </p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5">
                {blockers.slice(0, 5).map((r) => (
                  <li key={r.key}>
                    {r.label} — {r.result === 'Pending' ? 'not answered' : 'failed, but no finding recorded'}
                  </li>
                ))}
                {blockers.length > 5 && <li>and {blockers.length - 5} more…</li>}
              </ul>
            </div>
          )}
        </div>

        {/* RIGHT — details, notes, history */}
        <div className="space-y-6 lg:col-span-1">
          <div className="glass-panel rounded-xl p-6">
            <SectionTitle>Details</SectionTitle>
            <div className="mb-5 flex items-center gap-3">
              <Avatar initials={initials(inspection.assignedTo)} className="h-10 w-10 shrink-0 text-sm" />
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-slate-500">Assigned to</div>
                <div className="truncate text-sm font-semibold text-slate-900">{inspection.assignedTo}</div>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <KV label="Template" value={inspection.templateName} />
              <KV label="Version" value={inspection.templateVersion ? `v${inspection.templateVersion}` : '—'} />
              <KV label="Scheduled" value={formatDate(inspection.scheduledFor)} />
              <KV label="Started" value={inspection.startedAt ? relTime(inspection.startedAt) : '—'} />
              <KV label="Completed" value={inspection.completedAt ? relTime(inspection.completedAt) : '—'} />
              <KV label="Performed by" value={inspection.performedBy ?? '—'} />
              {/* Read off the asset's location, so it follows the asset rather
                  than freezing at the moment the inspection was raised. */}
              <KV label="Facility" value={inspection.placement?.facilityName ?? '—'} />
              <KV label="Organization" value={inspection.placement?.organizationName ?? '—'} />
            </dl>

            <div className="mt-5 border-t border-slate-200 pt-4">
              <Link
                to={`/assets/${inspection.assetId}`}
                className="flex items-center gap-2 text-sm text-slate-700 transition-colors hover:text-primary-600"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{inspection.assetName}</div>
                  <div className="font-mono text-xs text-slate-400">{inspection.assetId}</div>
                </div>
                <span className="ml-auto text-slate-300">↗</span>
              </Link>
            </div>
          </div>

          <div className="glass-panel rounded-xl p-6">
            <SectionTitle>Notes</SectionTitle>
            {closed ? (
              <p className="text-sm text-slate-600">{inspection.notes || <span className="text-slate-400">No notes recorded.</span>}</p>
            ) : (
              <textarea
                rows={4}
                value={notes ?? inspection.notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Overall observations — saved when the inspection is completed."
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
            )}
          </div>

          {inspection.workOrderIds.length > 0 && (
            <div className="glass-panel rounded-xl p-6">
              <SectionTitle count={inspection.workOrderIds.length}>Corrective Work</SectionTitle>
              <ul className="space-y-1.5">
                {inspection.workOrderIds.map((workOrderId) => (
                  <li key={workOrderId}>
                    <Link
                      to={`/maintenance/${workOrderId}`}
                      className="font-mono text-xs text-primary-600 hover:text-primary-700"
                    >
                      {workOrderId} →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="glass-panel rounded-xl p-6">
            <SectionTitle count={inspection.history.length}>History</SectionTitle>
            <ol className="space-y-3">
              {[...inspection.history].reverse().map((event, i) => (
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
          </div>
        </div>
      </div>
    </div>
  );
}
