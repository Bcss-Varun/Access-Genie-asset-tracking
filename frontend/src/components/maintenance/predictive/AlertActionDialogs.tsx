import { useState } from 'react';
import { WORK_ORDER_PRIORITIES, type PredictiveAlert, type WorkOrderPriority } from '@access-genie/shared';
import { FormDialog, Field, FieldRow, Select, TextArea, TextInput, optionsFrom } from '@/components/ui/FormDialog';
import { useWorkOrderFacets } from '@/api/work-orders';
import type { RaiseWorkOrderBody } from '@/api/predictive-alerts';
import { SEVERITY_PILL } from './tokens';
import { cn } from '@/lib/utils';

/**
 * The two dialogs that stand between a decision and a write.
 *
 * Both exist because the action they confirm takes an input the row cannot
 * supply: a work order needs a due date and an owner, and a dismissal needs a
 * reason. Everything else on the board acts on one click.
 */

/**
 * Raise a work order from an alert.
 *
 * Every field is prefilled from the alert's own recommendation, so the default
 * path is "do what the alert said" and the form is a review rather than a
 * transcription. The API applies the same fallbacks if a field is left off, so
 * what is shown and what is sent cannot drift apart.
 */
export function CreateWorkOrderDialog({
  alert,
  busy,
  onSubmit,
  onCancel,
}: {
  alert: PredictiveAlert;
  busy: boolean;
  onSubmit: (body: RaiseWorkOrderBody) => void;
  onCancel: () => void;
}) {
  const facets = useWorkOrderFacets();

  const [title, setTitle] = useState(`${alert.title} — ${alert.assetName}`);
  const [priority, setPriority] = useState<WorkOrderPriority>(alert.recommendation.priority);
  const [assignedTo, setAssignedTo] = useState('');
  const [dueInDays, setDueInDays] = useState(String(alert.recommendation.dueInDays));
  const [estimatedHours, setEstimatedHours] = useState(String(alert.recommendation.estimatedHours));
  const [notes, setNotes] = useState('');

  const follow = alert.workOrderIds.length > 0;

  return (
    <FormDialog
      title={follow ? 'Raise a follow-up work order' : 'Create work order from alert'}
      icon="🔧"
      width="lg"
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', SEVERITY_PILL[alert.severity])}>
            {alert.severity}
          </span>
          <span className="font-mono text-xs text-slate-400">{alert.id}</span>
          <span>· {alert.confidence}% confidence · {alert.assetName}</span>
        </span>
      }
      submitLabel="Create work order"
      busy={busy}
      disabled={title.trim().length < 4}
      onCancel={onCancel}
      onSubmit={() =>
        onSubmit({
          title: title.trim(),
          priority,
          assignedTo: assignedTo || undefined,
          dueInDays: Number(dueInDays) || alert.recommendation.dueInDays,
          estimatedHours: Number(estimatedHours) || alert.recommendation.estimatedHours,
          notes: notes.trim() || undefined,
        })
      }
    >
      <div className="rounded-lg border border-primary-100 bg-primary-50 px-3 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-primary-600">Recommended action</div>
        <p className="mt-0.5 text-sm text-slate-700">{alert.recommendation.action}</p>
      </div>

      <Field label="Work order title" required>
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
      </Field>

      <FieldRow>
        <Field label="Priority">
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value as WorkOrderPriority)}
            options={optionsFrom(WORK_ORDER_PRIORITIES)}
          />
        </Field>
        <Field label="Assign to" hint="Leave unassigned to send it to the dispatch queue.">
          <Select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            options={[
              { value: '', label: 'Unassigned' },
              // The roster and the user list, straight from the work-order
              // facets — the same options the Work Orders screen offers, so a
              // name valid there is valid here.
              ...(facets.data?.technicians ?? [])
                .filter((tech) => tech.kind !== 'historic')
                .map((tech) => ({ value: tech.name, label: tech.name })),
            ]}
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Due in (days)">
          <TextInput
            type="number"
            min={0}
            max={365}
            value={dueInDays}
            onChange={(e) => setDueInDays(e.target.value)}
          />
        </Field>
        <Field label="Estimated hours">
          <TextInput
            type="number"
            min={0}
            step="0.5"
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(e.target.value)}
          />
        </Field>
      </FieldRow>

      <Field label="Notes for the technician" hint="Appended to the description, under the prediction and the recommendation.">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
      </Field>

      <p className="text-xs text-slate-400">
        The order is raised as <span className="font-medium text-slate-600">Predictive</span> with source{' '}
        <span className="font-medium text-slate-600">Predictive Maintenance</span>, linked to this alert in both
        directions, and appears on the work-order board immediately.
      </p>
    </FormDialog>
  );
}

/**
 * Dismiss an alert.
 *
 * The reason is required, and the API enforces it too. Dismissing is the one
 * action that takes an alert out of every queue with nothing done about it, so
 * "why" is the only thing that makes the decision reviewable six months later.
 */
export function DismissAlertDialog({
  alert,
  busy,
  onSubmit,
  onCancel,
}: {
  alert: PredictiveAlert;
  busy: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');

  const PRESETS = [
    'False positive — the reading was a sensor fault',
    'Already covered by scheduled maintenance',
    'Asset is being retired',
    'Condition inspected and found acceptable',
  ];

  return (
    <FormDialog
      title="Dismiss this alert"
      icon="🚫"
      description={`${alert.id} · ${alert.assetName} · ${alert.confidence}% confidence`}
      submitLabel="Dismiss alert"
      busy={busy}
      disabled={reason.trim().length < 3}
      onCancel={onCancel}
      onSubmit={() => onSubmit(reason.trim())}
    >
      <Field label="Reason" required hint="Recorded on the alert trail. It can be reopened later if this turns out to be wrong.">
        <TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="Why is no action needed?"
          autoFocus
        />
      </Field>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setReason(preset)}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition-colors hover:border-primary-300 hover:text-slate-900"
          >
            {preset}
          </button>
        ))}
      </div>
    </FormDialog>
  );
}
