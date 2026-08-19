import { useState } from 'react';
import {
  APPROVAL_TRIGGERS,
  APPROVAL_TRIGGER_LABELS,
  ROLES,
  WIRED_TRIGGERS,
  type ApprovalTrigger,
  type ApprovalWorkflow,
  type RoleId,
  type WorkflowStatus,
  type WorkflowStep,
} from '@access-genie/shared';
import { FormDialog, Field, FieldRow, Select, TextInput } from '@/components/ui/FormDialog';
import { Button } from '@/components/ui/Button';
import { useMutate } from '@/api/mutate';
import { workflowsApi } from '@/api/configuration';
import { allUsers } from '@/lib/rbac';

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

/**
 * The events worth gating.
 *
 * A closed list taken from the shared contract rather than free text, because
 * the server only fires a workflow whose trigger it recognises. The previous
 * version offered seven English sentences, none of which any service consulted —
 * which is precisely how a workflow feature ends up being configuration that
 * affects nothing.
 */

/**
 * Who a step can be routed to: any role, or a specific person.
 *
 * Roles first and prefixed, because a step pinned to one individual is the
 * exception — it stops working the day they leave.
 */
function approverOptions(): { value: string; label: string }[] {
  return [
    ...Object.values(ROLES).map((r) => ({ value: `role:${r.id}`, label: `${r.name} (role)` })),
    ...allUsers.map((u) => ({ value: `user:${u.id}`, label: `${u.name} — ${ROLES[u.roleId]?.name ?? u.roleId}` })),
  ];
}

/** The picker's value for a step, derived from whichever approver it carries. */
function approverValue(step: WorkflowStep): string {
  if (step.approverUserId) return `user:${step.approverUserId}`;
  if (step.approverRole) return `role:${step.approverRole}`;
  return '';
}

/** Split a picker value back into the one field the server expects. */
function applyApprover(value: string): Pick<WorkflowStep, 'approverRole' | 'approverUserId'> {
  if (value.startsWith('user:')) return { approverUserId: value.slice(5), approverRole: undefined };
  if (value.startsWith('role:')) return { approverRole: value.slice(5) as RoleId, approverUserId: undefined };
  return {};
}

export function WorkflowDialog({ existing, onClose }: { existing?: ApprovalWorkflow; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const approvers = approverOptions();
  const firstApprover = approvers[0]?.value ?? '';

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [trigger, setTrigger] = useState<ApprovalTrigger>(
    (existing?.trigger as ApprovalTrigger) ?? APPROVAL_TRIGGERS[0],
  );
  const [status, setStatus] = useState<WorkflowStatus>(existing?.status ?? 'Draft');
  const [steps, setSteps] = useState<WorkflowStep[]>(
    existing?.steps?.length
      ? existing.steps
      : [{ order: 1, name: 'Manager approval', approver: '', ...applyApprover(firstApprover) }],
  );

  const patchStep = (index: number, patch: Partial<WorkflowStep>) =>
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      { order: prev.length + 1, name: `Step ${prev.length + 1}`, approver: '', ...applyApprover(firstApprover) },
    ]);
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
    const body = {
      name: name.trim(),
      description: description.trim(),
      trigger,
      status,
      // `order` is the position in this list. Renumbered on save rather than
      // maintained on every move, so the arrows only have to reorder an array.
      steps: steps.map((step, i) => ({ ...step, order: i + 1 })),
    };
    const ok = await run(existing ? workflowsApi.update(existing.id, body) : workflowsApi.create(body), {
      success: existing ? 'Workflow saved' : `${name.trim()} created`,
      successDetail: `${steps.length} step${steps.length === 1 ? '' : 's'} · ${status}`,
      describe: existing ? 'save that workflow' : 'create that workflow',
    });
    if (ok) onClose();
  };

  const valid =
    name.trim().length >= 2 &&
    steps.length > 0 &&
    steps.every((s) => s.name.trim() && (s.approverRole || s.approverUserId));

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
            onChange={(e) => setStatus(e.target.value as WorkflowStatus)}
            options={[
              { value: 'Draft', label: 'Draft' },
              { value: 'Inactive', label: 'Inactive — switched off' },
              { value: 'Active', label: 'Active — gates the trigger' },
            ]}
          />
        </Field>
      </FieldRow>

      <Field label="Description" hint="What this chain is for.">
        <TextInput
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Transfers out of a facility need the facility manager and an org admin."
        />
      </Field>

      <Field
        label="Trigger"
        hint="The operation this chain gates. Only wired operations raise a real approval today."
      >
        <Select
          value={trigger}
          onChange={(e) => setTrigger(e.target.value as ApprovalTrigger)}
          options={APPROVAL_TRIGGERS.map((t) => ({
            value: t,
            label: WIRED_TRIGGERS.includes(t)
              ? APPROVAL_TRIGGER_LABELS[t]
              : `${APPROVAL_TRIGGER_LABELS[t]} — not wired yet`,
          }))}
        />
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
                <Select
                  value={approverValue(step)}
                  onChange={(e) => patchStep(i, applyApprover(e.target.value))}
                  options={approvers}
                />
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
            There is nobody to route to yet. Add a user under Administration ▸ Users first.
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
