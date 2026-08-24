import { useState } from 'react';
import type { ComplianceRecord } from '@access-genie/shared';
import { FormDialog, Field, Select, TextArea, optionsFrom } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { complianceApi, useRefreshCompliance } from '@/api/compliance';

/** Close a finding — Resolved (fixed) or Waived (accepted as-is), never a plain delete. */
export function ResolveComplianceRecordDialog({ record, onClose }: { record: ComplianceRecord; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const refresh = useRefreshCompliance();

  const [status, setStatus] = useState<'Resolved' | 'Waived'>('Resolved');
  const [resolutionNote, setResolutionNote] = useState('');

  const submit = async () => {
    const ok = await run(complianceApi.resolve(record.id, { status, resolutionNote: resolutionNote.trim() || undefined }), {
      success: `Finding ${status.toLowerCase()}`,
      successDetail: record.title,
      describe: 'close that finding',
      refresh,
    });
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="✅"
      title={`Close: ${record.title}`}
      submitLabel={status}
      busy={isPending}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="Outcome" required>
        <Select
          options={optionsFrom(['Resolved', 'Waived'])}
          value={status}
          onChange={(e) => setStatus(e.target.value as 'Resolved' | 'Waived')}
        />
      </Field>
      <Field label="Resolution note" hint="Optional — what was done, or why it's accepted as-is.">
        <TextArea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} />
      </Field>
    </FormDialog>
  );
}
