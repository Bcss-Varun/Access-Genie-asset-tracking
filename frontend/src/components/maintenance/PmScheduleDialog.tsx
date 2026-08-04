import { useState } from 'react';
import type { PmFrequency, PmSchedule, WorkOrderType } from '@access-genie/shared';
import { PM_FREQUENCIES, WORK_ORDER_TYPES } from '@access-genie/shared';
import { FormDialog, Field, FieldRow, Select, TextInput, dateInDays } from '@/components/ui/FormDialog';
import { AssetPicker } from '@/components/ui/AssetPicker';
import { useMutate } from '@/api/mutate';
import { pmApi } from '@/api/maintenance';
import { allTeams } from '@/lib/dataset';

/**
 * A preventive schedule — the rule that says how often an asset needs work.
 *
 * This is the input to the automation that raises work orders, so creating one
 * is the act that starts preventive maintenance happening at all. Which is why
 * the button that opened this used to say "not part of this demo": without it,
 * the entire preventive side of the product was whatever the seed contained.
 *
 * `assetId` is only editable when creating. Moving a schedule to a different
 * asset is a different schedule with a different history, and the server
 * refuses it — so the field is not offered on edit rather than being offered
 * and rejected.
 */

const HINTS: Record<PmFrequency, string> = {
  Monthly: 'Raised every 30 days.',
  Quarterly: 'Raised every 91 days.',
  'Semi-Annual': 'Raised every 182 days.',
  Annual: 'Raised every 365 days.',
  'Usage-based': 'Driven by runtime rather than the calendar — re-evaluated monthly.',
};

export function PmScheduleDialog({ existing, onClose }: { existing?: PmSchedule; onClose: () => void }) {
  const { run, isPending } = useMutate();

  const [title, setTitle] = useState(existing?.title ?? '');
  const [assetId, setAssetId] = useState(existing?.assetId ?? '');
  const [frequency, setFrequency] = useState<PmFrequency>(existing?.frequency ?? 'Quarterly');
  const [type, setType] = useState<WorkOrderType>((existing?.type as WorkOrderType) ?? 'Preventive');
  const [nextDue, setNextDue] = useState(existing?.nextDue?.slice(0, 10) ?? dateInDays(30));
  const [estHours, setEstHours] = useState(String(existing?.estHours ?? 2));
  const [assignedTeam, setAssignedTeam] = useState(existing?.assignedTeam ?? 'Unassigned');

  const teams = [
    { value: 'Unassigned', label: 'Unassigned' },
    ...allTeams.map((t) => ({ value: t.name, label: `${t.emoji} ${t.name}` })),
  ];

  const submit = async () => {
    const shared = {
      title: title.trim(),
      frequency,
      type,
      nextDue: new Date(nextDue).toISOString(),
      estHours: Number(estHours) || 1,
      assignedTeam,
    };

    const ok = await run(existing ? pmApi.update(existing.id, shared) : pmApi.create({ ...shared, assetId }), {
      success: existing ? 'Schedule updated' : `${title.trim()} scheduled`,
      successDetail: existing
        ? undefined
        : `${frequency} — the first work order is raised when it falls due.`,
      describe: existing ? 'save that schedule' : 'create that schedule',
    });
    if (ok) onClose();
  };

  const valid = title.trim().length >= 4 && (existing ? true : assetId.length > 0) && Boolean(nextDue);

  return (
    <FormDialog
      icon="🗓️"
      title={existing ? `Edit ${existing.title}` : 'New PM schedule'}
      description="Work orders are raised automatically when a schedule falls due, then the schedule rolls forward."
      submitLabel={existing ? 'Save' : 'Create schedule'}
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="What the work is" required>
        <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quarterly filter change and coil clean" />
      </Field>

      {existing ? (
        <Field label="Asset" hint="A schedule cannot be moved between assets — create a new one instead.">
          <TextInput value={`${existing.assetName} · ${existing.assetId}`} disabled />
        </Field>
      ) : (
        <AssetPicker value={assetId} onChange={setAssetId} required />
      )}

      <FieldRow>
        <Field label="Frequency" hint={HINTS[frequency]}>
          <Select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as PmFrequency)}
            options={PM_FREQUENCIES.map((f) => ({ value: f, label: f }))}
          />
        </Field>
        <Field label="Work type">
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as WorkOrderType)}
            options={WORK_ORDER_TYPES.map((t) => ({ value: t, label: t }))}
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="First due" required hint="A date already past raises its work order on the next automation run.">
          <TextInput type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
        </Field>
        <Field label="Estimated hours">
          <TextInput type="number" min={0} step={0.5} value={estHours} onChange={(e) => setEstHours(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label="Assigned team" hint="Whoever the raised work order lands on.">
        <Select value={assignedTeam} onChange={(e) => setAssignedTeam(e.target.value)} options={teams} />
      </Field>
    </FormDialog>
  );
}
