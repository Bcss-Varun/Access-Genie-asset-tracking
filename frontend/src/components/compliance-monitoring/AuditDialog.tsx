import { useState } from 'react';
import { AUDIT_TYPES } from '@access-genie/shared';
import { Field, FieldRow, FormDialog, Select, TextArea, TextInput, optionsFrom } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { auditCenterApi, useRefreshAuditCenter } from '@/api/compliance';
import { useAuth } from '@/api/auth';

/** Open a new audit engagement — the entity findings and evidence hang off. */
export function AuditDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: (auditId: string) => void }) {
  const { run, isPending } = useMutate();
  const refresh = useRefreshAuditCenter();
  const { session } = useAuth();

  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof AUDIT_TYPES)[number]>('Internal');
  const [scopeId, setScopeId] = useState(session?.user.homeScopeId ?? '');
  const [leadAuditor, setLeadAuditor] = useState(session?.user.email ?? '');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [summary, setSummary] = useState('');

  const valid = name.trim().length >= 4 && scopeId.trim().length > 0 && leadAuditor.trim().length > 0 && dueDate.length > 0;

  const submit = async () => {
    const created = await run(
      auditCenterApi.create({
        name: name.trim(),
        type,
        scopeId: scopeId.trim(),
        leadAuditor: leadAuditor.trim(),
        startDate: new Date(startDate).toISOString(),
        dueDate: new Date(dueDate).toISOString(),
        summary: summary.trim() || undefined,
      }),
      { success: 'Audit opened', successDetail: name.trim(), describe: 'open that audit', refresh },
    );
    if (created) {
      onClose();
      onCreated?.(created.id);
    }
  };

  return (
    <FormDialog
      icon="🕵️"
      title="Open an audit"
      description="Findings and evidence are worked through the audit once it's open."
      submitLabel="Open audit"
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="Audit name" required>
        <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 fire-safety audit" />
      </Field>

      <FieldRow>
        <Field label="Type" required>
          <Select options={optionsFrom(AUDIT_TYPES)} value={type} onChange={(e) => setType(e.target.value as typeof type)} />
        </Field>
        <Field label="Facility / scope ID" required hint="A scope-node id, e.g. FAC-1.">
          <TextInput value={scopeId} onChange={(e) => setScopeId(e.target.value)} placeholder="FAC-1" />
        </Field>
      </FieldRow>

      <Field label="Lead auditor" required>
        <TextInput value={leadAuditor} onChange={(e) => setLeadAuditor(e.target.value)} placeholder="raj@bcss.in" />
      </Field>

      <FieldRow>
        <Field label="Start date" required>
          <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Due date" required>
          <TextInput type="date" value={dueDate} min={startDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label="Summary" hint="Optional — scope and objectives.">
        <TextArea value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
    </FormDialog>
  );
}
