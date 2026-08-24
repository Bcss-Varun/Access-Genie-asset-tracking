import { useState } from 'react';
import type { AuditFinding } from '@access-genie/shared';
import { Field, FormDialog, Select, TextArea, optionsFrom } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { auditCenterApi, useRefreshAuditCenter } from '@/api/compliance';

/** Close an audit finding — Resolved (fixed) or Waived (accepted as-is). */
export function ResolveFindingDialog({ auditId, finding, onClose }: { auditId: string; finding: AuditFinding; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const refresh = useRefreshAuditCenter();

  const [status, setStatus] = useState<'Resolved' | 'Waived'>('Resolved');
  const [correctiveAction, setCorrectiveAction] = useState(finding.correctiveAction ?? '');

  const submit = async () => {
    const ok = await run(
      auditCenterApi.updateFinding(auditId, finding.id, { status, correctiveAction: correctiveAction.trim() || undefined }),
      { success: `Finding ${status.toLowerCase()}`, successDetail: finding.title, describe: 'close that finding', refresh },
    );
    if (ok) onClose();
  };

  return (
    <FormDialog icon="✅" title={`Close: ${finding.title}`} submitLabel={status} busy={isPending} onSubmit={() => void submit()} onCancel={onClose}>
      <Field label="Outcome" required>
        <Select options={optionsFrom(['Resolved', 'Waived'])} value={status} onChange={(e) => setStatus(e.target.value as 'Resolved' | 'Waived')} />
      </Field>
      <Field label="Corrective action" hint="What was done, or why it's accepted as-is.">
        <TextArea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} />
      </Field>
    </FormDialog>
  );
}
