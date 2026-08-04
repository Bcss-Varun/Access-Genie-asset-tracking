import { useState } from 'react';
import type { ApprovalWorkflow } from '@access-genie/shared';
import { allWorkflows } from '@/lib/dataset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { WorkflowDialog } from '@/components/admin/WorkflowDialog';
import { useMutate } from '@/api/mutate';
import { workflowsApi } from '@/api/configuration';
import { cn } from '@/lib/utils';

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
        on ? 'bg-primary-600' : 'bg-slate-300',
      )}
    >
      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

function WorkflowCard({
  wf,
  onEdit,
  onDelete,
}: {
  wf: ApprovalWorkflow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { run, isPending } = useMutate();
  const enabled = wf.status === 'Active';

  // Publishing and un-publishing is the same write. Reading `wf.status` rather
  // than local state means the toggle reflects what was stored, so a rejected
  // write leaves the switch where it was instead of lying about it.
  const toggle = () =>
    void run(workflowsApi.update(wf.id, { status: enabled ? 'Draft' : 'Active' }), {
      success: enabled ? 'Workflow moved to draft' : 'Workflow published',
      successDetail: enabled ? `${wf.name} no longer gates its trigger.` : `${wf.name} now gates: ${wf.trigger}`,
      describe: `${enabled ? 'unpublish' : 'publish'} that workflow`,
    });

  return (
    <div className="glass-panel rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-semibold text-slate-900">{wf.name}</h3>
            <Badge tone={enabled ? 'emerald' : 'slate'}>{enabled ? 'Active' : 'Draft'}</Badge>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Trigger:{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">{wf.trigger}</code>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium text-slate-500">{enabled ? 'Enabled' : 'Disabled'}</span>
          <Toggle on={enabled} label={`Toggle ${wf.name}`} onChange={toggle} />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="flex items-stretch gap-2">
          {wf.steps.map((step, i) => (
            <div key={i} className="flex items-stretch gap-2">
              <div className="min-w-[9.5rem] rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-50 text-[11px] font-bold text-primary-700">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-slate-800">{step.name}</span>
                </div>
                <div className="mt-1.5 pl-7 text-[11px] text-slate-500">
                  Approver: <span className="font-medium text-slate-700">{step.approver}</span>
                </div>
              </div>
              {i < wf.steps.length - 1 && (
                <div className="flex items-center text-slate-300" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-1 border-t border-slate-100 pt-3">
        <Button size="sm" variant="ghost" disabled={isPending} onClick={onEdit}>
          Edit chain
        </Button>
        <Button size="sm" variant="ghost" disabled={isPending} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const { run, isPending } = useMutate();
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; wf: ApprovalWorkflow } | null>(null);
  const [deleting, setDeleting] = useState<ApprovalWorkflow | null>(null);

  const active = allWorkflows.filter((w) => w.status === 'Active').length;
  const draft = allWorkflows.filter((w) => w.status === 'Draft').length;

  const remove = async () => {
    if (!deleting) return;
    await run(workflowsApi.remove(deleting.id), { success: `${deleting.name} deleted`, describe: 'delete that workflow' });
    setDeleting(null);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Approval Workflows"
        subtitle="Multi-step approval chains for transfers, disposals, purchasing & privileged access."
        breadcrumb={[{ label: 'Administration' }, { label: 'Approval Workflows' }]}
        actions={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Workflow</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:max-w-md">
        <KpiCard label="Active" value={active} sub="Live approval chains" tone="emerald" accent />
        <KpiCard label="Draft" value={draft} sub="Pending publish" tone="slate" />
      </div>

      {allWorkflows.length === 0 ? (
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="🔀"
            title="No approval chains yet"
            description="A chain decides who has to sign off before something happens — a transfer, a disposal, a purchase over a threshold. Without one, those actions go through unreviewed."
            action={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Workflow</Button>}
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {allWorkflows.map((wf) => (
            <WorkflowCard
              key={wf.id}
              wf={wf}
              onEdit={() => setDialog({ mode: 'edit', wf })}
              onDelete={() => setDeleting(wf)}
            />
          ))}
        </div>
      )}

      {dialog?.mode === 'new' && <WorkflowDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit' && <WorkflowDialog existing={dialog.wf} onClose={() => setDialog(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          description="Anything currently waiting on this chain will no longer be gated by it."
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
