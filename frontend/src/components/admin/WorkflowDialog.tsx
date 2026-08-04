import { useState } from 'react';
import type { ApprovalWorkflow, WorkflowStep } from '@access-genie/shared';
import { FormDialog, Field, FieldRow, Select, TextInput } from '@/components/ui/FormDialog';
import { Button } from '@/components/ui/Button';
import { useMutate } from '@/api/mutate';
import { workflowsApi } from '@/api/configuration';
import { allTeams } from '@/lib/dataset';
import { allUsers, roles } from '@/lib/rbac';

/**
 * The approval-chain builder.
 *
 * "Visual workflow builder" was the roadmap item; this is the part of it that
 * carries the meaning. An approval chain is an ordered list of who signs off,
 * and order is the only thing about it that is hard to express — so the editor
 * is a list you can reorder, not a canvas.
 *
 * Approvers are picked from the people and teams that exist, rather than typed
 * free-hand, because a chain routed to a name nobody recognises stalls silently.
 */

/** The events worth gating. Each maps to an action that already exists. */
const TRIGGERS = [
  'Asset transfer requested',
  'Asset disposal requested',
  'Purchase order raised above threshold',
  'Work order marked complete',
  'Asset write-off',
  'Privileged access granted',
  'Cycle count variance recorded',
];

function approverOptions(): { value: string; label: string }[] {
  return [
    ...allTeams.map((t) => ({ value: t.name, label: `${t.emoji} ${t.name} (team)` })),
    ...allUsers.map((u) => ({ value: u.name, label: `${u.name} — ${roles[u.roleId]?.name ?? u.roleId}` })),
  ];
}

export function WorkflowDialog({ existing, onClose }: { existing?: ApprovalWorkflow; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const approvers = approverOptions();
  const firstApprover = approvers[0]?.value ?? 'Unassigned';

  const [name, setName] = useState(existing?.name ?? '');
  const [trigger, setTrigger] = useState(existing?.trigger ?? TRIGGERS[0]);
  const [status, setStatus] = useState<'Active' | 'Draft'>(existing?.status ?? 'Draft');
  const [steps, setSteps] = useState<WorkflowStep[]>(
    existing?.steps?.length ? existing.steps : [{ name: 'Manager approval', approver: firstApprover }],
  );

  const patchStep = (index: number, patch: Partial<WorkflowStep>) =>
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const addStep = () => setSteps((prev) => [...prev, { name: `Step ${prev.length + 1}`, approver: firstApprover }]);
  const removeStep = (index: number) => setSteps((prev) => prev.filter((_, i) => i !== index));

  /** Swap with the neighbour — the only reordering a short list needs. */
  const move = (index: number, delta: number) =>
    setSteps((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target] as WorkflowStep, next[index] as WorkflowStep];
      return next;
    });

  const submit = async () => {
    const body = { name: name.trim(), trigger, steps, status };
    const ok = await run(existing ? workflowsApi.update(existing.id, body) : workflowsApi.create(body), {
      success: existing ? 'Workflow saved' : `${name.trim()} created`,
      successDetail: `${steps.length} step${steps.length === 1 ? '' : 's'} · ${status}`,
      describe: existing ? 'save that workflow' : 'create that workflow',
    });
    if (ok) onClose();
  };

  const valid = name.trim().length >= 2 && steps.length > 0 && steps.every((s) => s.name.trim() && s.approver.trim());

  return (
    <FormDialog
      icon="🔀"
      title={existing ? `Edit ${existing.name}` : 'New approval workflow'}
      description="Approvals run in order. Each step must be signed off before the next is asked."
      submitLabel={existing ? 'Save' : 'Create'}
      width="lg"
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Workflow name" required>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="High-value asset transfer" />
        </Field>
        <Field label="Status" hint="Draft chains are saved but do not gate anything.">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'Active' | 'Draft')}
            options={[
              { value: 'Draft', label: 'Draft' },
              { value: 'Active', label: 'Active — gates the trigger' },
            ]}
          />
        </Field>
      </FieldRow>

      <Field label="Trigger" hint="What has to happen for this chain to start.">
        <Select value={trigger} onChange={(e) => setTrigger(e.target.value)} options={TRIGGERS.map((t) => ({ value: t, label: t }))} />
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Approval steps — {steps.length}
          </span>
          <button type="button" onClick={addStep} className="text-xs font-semibold text-primary-600 hover:text-primary-700">
            + Add step
          </button>
        </div>

        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <span className="mb-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                {i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Step name</label>
                <TextInput value={step.name} onChange={(e) => patchStep(i, { name: e.target.value })} placeholder="Finance sign-off" />
              </div>

              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Approver</label>
                <Select value={step.approver} onChange={(e) => patchStep(i, { approver: e.target.value })} options={approvers} />
              </div>

              <div className="flex shrink-0 items-center gap-0.5 pb-1">
                <button
                  type="button"
                  aria-label="Move earlier"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="rounded px-1.5 py-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move later"
                  disabled={i === steps.length - 1}
                  onClick={() => move(i, 1)}
                  className="rounded px-1.5 py-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label="Remove step"
                  disabled={steps.length === 1}
                  onClick={() => removeStep(i)}
                  className="rounded px-1.5 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        {approvers.length === 0 && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            There are no people or teams to route to yet. Add a user under Administration ▸ Users first.
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
        <Button type="button" variant="ghost" onClick={addStep}>
          + Add another step
        </Button>
      </div>
    </FormDialog>
  );
}
