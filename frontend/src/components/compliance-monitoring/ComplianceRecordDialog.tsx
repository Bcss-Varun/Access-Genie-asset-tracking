import { useState } from 'react';
import { COMPLIANCE_CATEGORIES, COMPLIANCE_SEVERITIES } from '@access-genie/shared';
import { FormDialog, Field, FieldRow, TextArea, TextInput, Select, optionsFrom } from '@/components/ui/FormDialog';
import { AssetPicker } from '@/components/ui/AssetPicker';
import { useMutate } from '@/api/mutate';
import { complianceApi, useRefreshCompliance } from '@/api/compliance';

/**
 * Raise a compliance finding.
 *
 * Either an asset or a facility scope, never neither — the server refuses a
 * finding with nowhere to hang, and the disabled submit here says so before
 * the round trip does.
 */
export function ComplianceRecordDialog({ onClose }: { onClose: () => void }) {
  const { run, isPending } = useMutate();
  const refresh = useRefreshCompliance();

  const [assetId, setAssetId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof COMPLIANCE_CATEGORIES)[number]>('Safety');
  const [severity, setSeverity] = useState<(typeof COMPLIANCE_SEVERITIES)[number]>('Medium');
  const [dueDate, setDueDate] = useState('');

  const valid = title.trim().length >= 4 && description.trim().length >= 4 && assetId.length > 0;

  const submit = async () => {
    const created = await run(
      complianceApi.create({
        assetId,
        title: title.trim(),
        description: description.trim(),
        category,
        severity,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      }),
      {
        success: 'Finding raised',
        successDetail: title.trim(),
        describe: 'raise that finding',
        refresh,
      },
    );
    if (created) onClose();
  };

  return (
    <FormDialog
      icon="🛡️"
      title="Raise a compliance finding"
      description="Findings against assets outside your visible estate are refused server-side."
      submitLabel="Raise finding"
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <AssetPicker value={assetId} onChange={setAssetId} required />

      <Field label="Title" required>
        <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Missing fire safety placard" />
      </Field>

      <Field label="Description" required>
        <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was found, and why it matters." />
      </Field>

      <FieldRow>
        <Field label="Category" required>
          <Select
            options={optionsFrom(COMPLIANCE_CATEGORIES)}
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          />
        </Field>
        <Field label="Severity" required>
          <Select
            options={optionsFrom(COMPLIANCE_SEVERITIES)}
            value={severity}
            onChange={(e) => setSeverity(e.target.value as typeof severity)}
          />
        </Field>
      </FieldRow>

      <Field label="Due date" hint="Optional — when this needs to be closed by.">
        <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
    </FormDialog>
  );
}
