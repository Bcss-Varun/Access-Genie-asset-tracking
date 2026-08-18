import { useState } from 'react';
import {
  PREDICTIVE_ALERT_TYPES,
  PREDICTIVE_SEVERITIES,
  WORK_ORDER_PRIORITIES,
  type PredictiveAlertType,
  type PredictiveSeverity,
  type WorkOrderPriority,
} from '@access-genie/shared';
import { FormDialog, Field, FieldGroup, FieldRow, Select, TextArea, TextInput, optionsFrom } from '@/components/ui/FormDialog';
import { AssetPicker } from '@/components/ui/AssetPicker';
import type { RaiseAlertBody, SignalInput } from '@/api/predictive-alerts';

/**
 * Raise a predictive alert by hand.
 *
 * This is the module's honest answer to "there is no model yet". A reliability
 * engineer who has watched a bearing run hot for a fortnight has made a
 * prediction; it deserves the same record, the same triage queue and the same
 * route to a work order as one a model will make later. What it does *not* get
 * is a detector name — the API refuses that, and the board says "Raised
 * manually" wherever a model's name would otherwise appear.
 *
 * It posts to the same endpoint an engine will, which is the cheapest possible
 * proof that the ingestion contract works.
 */

const BLANK_SIGNAL: SignalInput = { label: '', value: '', baseline: '' };

export function RaiseAlertDialog({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (body: RaiseAlertBody) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [assetId, setAssetId] = useState('');
  const [severity, setSeverity] = useState<PredictiveSeverity>('High');
  const [type, setType] = useState<PredictiveAlertType>('Degradation Trend');
  const [confidence, setConfidence] = useState(70);
  const [predictedFailureAt, setPredictedFailureAt] = useState('');
  const [reason, setReason] = useState('');
  const [signals, setSignals] = useState<SignalInput[]>([{ ...BLANK_SIGNAL }]);

  const [action, setAction] = useState('');
  const [priority, setPriority] = useState<WorkOrderPriority>('High');
  const [dueInDays, setDueInDays] = useState('7');
  const [estimatedHours, setEstimatedHours] = useState('2');

  // Mirrors the server's schema so the dialog refuses what the API would refuse,
  // rather than posting and translating a 422 back into field-level guidance.
  const valid = title.trim().length >= 4 && assetId !== '' && reason.trim().length >= 10 && action.trim().length >= 5;

  const updateSignal = (index: number, patch: Partial<SignalInput>) =>
    setSignals((current) => current.map((signal, i) => (i === index ? { ...signal, ...patch } : signal)));

  return (
    <FormDialog
      title="Raise a predictive alert"
      icon="⚡"
      width="xl"
      description="Records an observed condition that is heading for a failure. It enters the same queue, and takes the same actions, as an alert a predictive engine will raise."
      submitLabel="Raise alert"
      busy={busy}
      disabled={!valid}
      onCancel={onCancel}
      onSubmit={() =>
        onSubmit({
          title: title.trim(),
          severity,
          type,
          assetId,
          confidence,
          predictedFailureAt: predictedFailureAt ? new Date(`${predictedFailureAt}T00:00:00.000Z`).toISOString() : undefined,
          reason: reason.trim(),
          // Half-filled rows are dropped rather than posted as empty evidence.
          signals: signals
            .filter((signal) => signal.label.trim() && signal.value.trim())
            .map((signal) => ({
              label: signal.label.trim(),
              value: signal.value.trim(),
              baseline: signal.baseline?.trim() || undefined,
            })),
          recommendation: {
            action: action.trim(),
            priority,
            dueInDays: Number(dueInDays) || 7,
            estimatedHours: Number(estimatedHours) || 2,
          },
          source: 'Manual',
        })
      }
    >
      <Field label="What is predicted" required hint="Reads as the alert's headline on the board.">
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          placeholder="e.g. Drive-end bearing heading for seizure"
        />
      </Field>

      <AssetPicker value={assetId} onChange={setAssetId} required hint="The machine the prediction is about." />

      <FieldRow>
        <Field label="Severity" hint="How bad it is if the prediction is right.">
          <Select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as PredictiveSeverity)}
            options={optionsFrom(PREDICTIVE_SEVERITIES)}
          />
        </Field>
        <Field label="Alert type">
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as PredictiveAlertType)}
            options={optionsFrom(PREDICTIVE_ALERT_TYPES)}
          />
        </Field>
      </FieldRow>

      <FieldGroup
        label={`Confidence — ${confidence}%`}
        required
        hint="How sure you are. There is no default: an unstated confidence would be this screen inventing the one number it exists to report honestly."
      >
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="w-full accent-primary-600"
          aria-label="Confidence"
        />
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>0% — a hunch</span>
          <span>80% — high confidence</span>
          <span>100% — certain</span>
        </div>
      </FieldGroup>

      <Field label="Why" required hint="The evidence in prose. At least a sentence.">
        <TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          placeholder="What has been observed, over what period, and why it points at a failure."
        />
      </Field>

      <FieldGroup label="Signals" hint="The readings behind the call. Optional, but they are what the detail view shows as evidence.">
        <div className="space-y-2">
          {signals.map((signal, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
              <TextInput
                value={signal.label}
                onChange={(e) => updateSignal(index, { label: e.target.value })}
                placeholder="Signal (e.g. Bearing temperature)"
                maxLength={120}
              />
              <TextInput
                value={signal.value}
                onChange={(e) => updateSignal(index, { value: e.target.value })}
                placeholder="Reading (78 °C)"
                maxLength={120}
              />
              <TextInput
                value={signal.baseline ?? ''}
                onChange={(e) => updateSignal(index, { baseline: e.target.value })}
                placeholder="Baseline (55 °C)"
                maxLength={120}
              />
              <button
                type="button"
                onClick={() => setSignals((current) => current.filter((_, i) => i !== index))}
                disabled={signals.length === 1}
                aria-label={`Remove signal ${index + 1}`}
                className="rounded-lg border border-slate-200 px-2.5 text-sm text-slate-400 transition-colors hover:border-red-200 hover:text-red-500 disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {signals.length < 12 && (
          <button
            type="button"
            onClick={() => setSignals((current) => [...current, { ...BLANK_SIGNAL }])}
            className="mt-2 text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            + Add signal
          </button>
        )}
      </FieldGroup>

      <Field label="Predicted failure date" hint="Optional. Left blank if you cannot put a date on it.">
        <TextInput
          type="date"
          value={predictedFailureAt}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setPredictedFailureAt(e.target.value)}
        />
      </Field>

      <Field
        label="Recommended action"
        required
        hint="What the work order should say. Prefilled into the Create Work Order dialog."
      >
        <TextArea
          value={action}
          onChange={(e) => setAction(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="e.g. Inspect and re-grease the drive-end bearing; replace if play is detected."
        />
      </Field>

      <FieldRow>
        <Field label="Work order priority">
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value as WorkOrderPriority)}
            options={optionsFrom(WORK_ORDER_PRIORITIES)}
          />
        </Field>
        <Field label="Due in (days)">
          <TextInput type="number" min={0} max={365} value={dueInDays} onChange={(e) => setDueInDays(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label="Estimated hours">
        <TextInput
          type="number"
          min={0}
          step="0.5"
          value={estimatedHours}
          onChange={(e) => setEstimatedHours(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
