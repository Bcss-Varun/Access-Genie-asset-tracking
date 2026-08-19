import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  APPROVAL_TRIGGER_LABELS,
  ROLES,
  type ApprovalRequestStatus,
  type ApprovalRequestView,
  type RoleId,
} from '@access-genie/shared';
import { ApiRequestError } from '@/api/client';
import { useMutate } from '@/api/mutate';
import { approvalsApi, useApprovals, APPROVALS_KEY } from '@/api/admin-rules';
import { Badge, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Field, FormDialog, TextArea } from '@/components/ui/FormDialog';
import { cn, relTime } from '@/lib/utils';

/**
 * Approvals — the queue an approver actually works from.
 *
 * The workflow builder in Administration decides what needs signing off; this is
 * where it gets signed. Without it the chain existed only in the database and
 * the sole way to clear a request was an API call, which made a configurable
 * approval process unusable by the people it routes to.
 *
 * Whether the signed-in user may decide a request is `canDecide` from the
 * server, never worked out here. The rule involves the current step's approver
 * role, the caller's own scope and whether they raised the request themselves —
 * three things the API already resolves, and reimplementing them in the client
 * would produce a second answer that is wrong the moment either drifts.
 */

const STATUS_TONE: Record<ApprovalRequestStatus, 'amber' | 'emerald' | 'red' | 'slate'> = {
  Pending: 'amber',
  Approved: 'emerald',
  Rejected: 'red',
  Cancelled: 'slate',
};

export default function ApprovalsPage() {
  const [mine, setMine] = useState(true);
  const [status, setStatus] = useState<ApprovalRequestStatus | undefined>('Pending');
  const query = useApprovals(mine, status);
  const cache = useQueryClient();

  const [deciding, setDeciding] = useState<{ request: ApprovalRequestView; decision: 'Approved' | 'Rejected' } | null>(
    null,
  );

  const refresh = () => cache.invalidateQueries({ queryKey: APPROVALS_KEY });

  if (query.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Approvals" subtitle="Requests waiting on a decision." />
        <ErrorState
          title="Could not load approvals"
          description={query.error instanceof ApiRequestError ? query.error.message : 'The request failed.'}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const requests = query.data ?? [];

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Approvals"
        subtitle="Transactions held by an approval workflow. Deciding the final step releases the record it is gating."
        breadcrumb={[{ label: 'Approvals' }]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
          {[
            { key: true, label: 'Waiting on me' },
            { key: false, label: 'All requests' },
          ].map((opt) => (
            <button
              key={String(opt.key)}
              type="button"
              onClick={() => setMine(opt.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                mine === opt.key ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {([undefined, 'Pending', 'Approved', 'Rejected', 'Cancelled'] as const).map((s) => (
            <button
              key={s ?? 'all'}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                status === s
                  ? 'border-primary-200 bg-primary-50 text-primary-700'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50',
              )}
            >
              {s ?? 'Any status'}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <TableSkeleton rows={4} columns={5} />
      ) : requests.length === 0 ? (
        <EmptyState
          title={mine ? 'Nothing is waiting on you' : 'No approval requests'}
          description={
            mine
              ? 'Requests appear here when a workflow step names your role and the record sits inside your part of the estate.'
              : 'Requests are raised automatically when an operation matches an active approval workflow.'
          }
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <ApprovalCard
              key={request.id}
              request={request}
              onDecide={(decision) => setDeciding({ request, decision })}
            />
          ))}
        </div>
      )}

      {deciding && (
        <DecisionDialog
          request={deciding.request}
          decision={deciding.decision}
          onClose={() => {
            setDeciding(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function ApprovalCard({
  request,
  onDecide,
}: {
  request: ApprovalRequestView;
  onDecide: (decision: 'Approved' | 'Rejected') => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-800">{request.subjectLabel || request.subjectId}</span>
            <Badge tone={STATUS_TONE[request.status]}>{request.status}</Badge>
            <span className="text-xs text-slate-400">{APPROVAL_TRIGGER_LABELS[request.trigger]}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {request.workflowName} · raised by {request.requestedByName} {relTime(request.requestedAt)}
            {request.status === 'Pending' && ` · step ${request.currentStep + 1} of ${request.steps.length}`}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide history' : 'History'}
          </Button>
          {request.canDecide && (
            <>
              <Button variant="outline" size="sm" onClick={() => onDecide('Rejected')}>
                Reject
              </Button>
              <Button size="sm" onClick={() => onDecide('Approved')}>
                Approve
              </Button>
            </>
          )}
        </div>
      </div>

      {/* The chain, so an approver can see who else is involved before deciding. */}
      <ol className="mt-3 flex flex-wrap items-center gap-1.5">
        {request.steps.map((step, i) => {
          const done = Boolean(step.decision);
          const current = request.status === 'Pending' && i === request.currentStep;
          return (
            <li
              key={step.order}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px]',
                done && step.decision === 'Approved' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                done && step.decision === 'Rejected' && 'border-red-200 bg-red-50 text-red-700',
                current && 'border-amber-300 bg-amber-50 font-semibold text-amber-800',
                !done && !current && 'border-slate-200 text-slate-400',
              )}
            >
              {step.order}. {step.name}
              {step.approverRole && ` · ${ROLES[step.approverRole as RoleId]?.name ?? step.approverRole}`}
              {step.decidedByName && ` — ${step.decidedByName}`}
            </li>
          );
        })}
      </ol>

      {open && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">History</div>
          <ul className="space-y-1.5">
            {request.history.map((entry, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2 text-xs">
                <span className="font-medium text-slate-700">{entry.actorName}</span>
                <span className="text-slate-500">{entry.action}</span>
                {entry.step !== undefined && <span className="text-slate-400">step {entry.step}</span>}
                <span className="text-slate-400">{relTime(entry.at)}</span>
                {entry.comment && <span className="text-slate-500">“{entry.comment}”</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DecisionDialog({
  request,
  decision,
  onClose,
}: {
  request: ApprovalRequestView;
  decision: 'Approved' | 'Rejected';
  onClose: () => void;
}) {
  const { run, isPending } = useMutate();
  const [comment, setComment] = useState('');

  const isFinal = request.currentStep === request.steps.length - 1;

  const submit = async () => {
    const ok = await run(approvalsApi.decide(request.id, decision, comment.trim()), {
      success: decision === 'Approved' ? 'Approved' : 'Rejected',
      successDetail:
        decision === 'Rejected'
          ? 'The request is settled and the record it was holding has been rejected.'
          : isFinal
            ? 'Final step — the record it was holding has been released.'
            : 'Passed to the next approver.',
      describe: 'record that decision',
    });
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon={decision === 'Approved' ? '✅' : '⛔'}
      title={`${decision === 'Approved' ? 'Approve' : 'Reject'} ${request.subjectLabel || request.subjectId}`}
      description={
        decision === 'Rejected'
          ? 'Rejecting settles the whole request — the remaining approvers are not asked.'
          : isFinal
            ? 'This is the last step, so approving releases the record this request is holding.'
            : 'This passes the request to the next approver in the chain.'
      }
      submitLabel={decision === 'Approved' ? 'Approve' : 'Reject'}
      busy={isPending}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field
        label="Comment"
        hint={decision === 'Rejected' ? 'Say why — it is stored on the step and visible in the history.' : 'Optional.'}
      >
        <TextArea
          autoFocus
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={decision === 'Rejected' ? 'Not this quarter — budget is committed.' : 'Released.'}
        />
      </Field>
    </FormDialog>
  );
}
