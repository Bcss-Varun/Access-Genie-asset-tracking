import { useState } from 'react';
import type { AuditFinding } from '@access-genie/shared';
import { Field, FormDialog, TextArea, TextInput } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { auditCenterApi, useRefreshAuditCenter } from '@/api/compliance';

/** Attach a piece of evidence to a finding — a photo link, a document, a note. */
export function EvidenceDialog({ auditId, finding, onClose }: { auditId: string; finding: AuditFinding; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const refresh = useRefreshAuditCenter();

  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');

  const valid = label.trim().length >= 2;

  const submit = async () => {
    const ok = await run(
      auditCenterApi.addEvidence(auditId, finding.id, { label: label.trim(), note: note.trim() || undefined, url: url.trim() || undefined }),
      { success: 'Evidence attached', successDetail: finding.title, describe: 'attach that evidence', refresh },
    );
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="📎"
      title={`Attach evidence — ${finding.title}`}
      submitLabel="Attach"
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="Label" required>
        <TextInput autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Inspection tag photo" />
      </Field>
      <Field label="Link" hint="Optional — a URL to the document or photo.">
        <TextInput type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </Field>
      <Field label="Note" hint="Optional">
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </FormDialog>
  );
}
