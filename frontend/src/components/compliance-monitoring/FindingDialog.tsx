import { useState } from 'react';
import { COMPLIANCE_SEVERITIES } from '@access-genie/shared';
import { Field, FieldRow, FormDialog, Select, TextArea, TextInput, optionsFrom } from '@/components/ui/FormDialog';
import { AssetPicker } from '@/components/ui/AssetPicker';
import { useMutate } from '@/api/mutate';
import { auditCenterApi, useRefreshAuditCenter } from '@/api/compliance';

/** Raise a finding against the audit currently open. */
export function FindingDialog({ auditId, onClose }: { auditId: string; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const refresh = useRefreshAuditCenter();

  const [assetId, setAssetId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<(typeof COMPLIANCE_SEVERITIES)[number]>('Medium');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [dueDate, setDueDate] = useState('');

  const valid = title.trim().length >= 4 && description.trim().length >= 4;

  const submit = async () => {
    const created = await run(
      auditCenterApi.createFinding(auditId, {
        assetId: assetId || undefined,
        title: title.trim(),
        description: description.trim(),
        severity,
        correctiveAction: correctiveAction.trim() || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      }),
      { success: 'Finding raised', successDetail: title.trim(), describe: 'raise that finding', refresh },
    );
    if (created) onClose();
  };

  return (
    <FormDialog
      icon="📌"
      title="Raise a finding"
      submitLabel="Raise finding"
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <AssetPicker value={assetId} onChange={setAssetId} label="Asset (optional)" hint="Leave blank for a finding that isn't asset-specific." />

      <Field label="Title" required>
        <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Extinguisher inspection overdue" />
      </Field>

      <Field label="Description" required>
        <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <FieldRow>
        <Field label="Severity" required>
          <Select options={optionsFrom(COMPLIANCE_SEVERITIES)} value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} />
        </Field>
        <Field label="Due date" hint="Optional">
          <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label="Corrective action" hint="Optional — what needs to happen to close this.">
        <TextArea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} />
      </Field>
    </FormDialog>
  );
}
