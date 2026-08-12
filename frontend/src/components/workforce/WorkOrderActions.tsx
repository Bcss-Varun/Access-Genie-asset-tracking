import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormDialog, Field, FieldRow, Select, TextArea, TextInput } from '@/components/ui/FormDialog';
import { Badge } from '@/components/ui/primitives';
import { useMutate } from '@/api/mutate';
import { maintenanceApi } from '@/api/work-orders';
import { documentsApi, MAX_UPLOAD_BYTES } from '@/api/documents';
import { useToast } from '@/components/providers/ToastProvider';
import { nextFieldTransitions, stageComment, toolsForWorkOrder, type FieldTransition } from '@/lib/field-ops';
import type { WorkOrder } from '@access-genie/shared';

// ─────────────────────────────────────────────────────────────────────────────
// The field-lifecycle action bar: Accept → En Route → On Site → Start Work →
// (Pause/Resume) → Complete. Every step but Complete is a single call against
// the real work-order endpoints (see lib/field-ops.ts for why). Complete opens
// a short evidence flow — checklist, condition, notes, optional photos — and
// only then closes the order, so a completion always carries what actually
// happened rather than a bare status flip.
// ─────────────────────────────────────────────────────────────────────────────

const CONDITIONS = ['Good — no issues', 'Fair — minor wear noted', 'Needs attention', 'Damaged'];

export function FieldActionButtons({ wo, size = 'sm' }: { wo: WorkOrder; size?: 'sm' | 'md' }) {
  const { run, isPending } = useMutate();
  const [completing, setCompleting] = useState(false);
  const transitions = nextFieldTransitions(wo);

  if (wo.status === 'Completed') {
    return <span className="text-xs font-medium text-emerald-600">Completed ✓</span>;
  }
  if (wo.status === 'Cancelled') {
    return <span className="text-xs font-medium text-slate-400">Cancelled</span>;
  }
  if (transitions.length === 0) return null;

  async function apply(t: FieldTransition) {
    if (t.endpoint === 'status' && t.status === 'Completed') {
      setCompleting(true);
      return;
    }
    if (t.endpoint === 'comment') {
      await run(maintenanceApi.comment(wo.id, stageComment(t.stage)), {
        success: `${wo.id} → ${t.stage}`,
        describe: 'update that work order',
      });
    } else if (t.status) {
      await run(maintenanceApi.changeStatus(wo.id, t.status, stageComment(t.stage)), {
        success: `${wo.id} → ${t.stage}`,
        describe: 'update that work order',
      });
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        {transitions.map((t) => (
          <Button
            key={t.stage}
            size={size}
            variant={t.stage === 'Completed' ? 'primary' : 'outline'}
            disabled={isPending}
            onClick={(e) => {
              e.stopPropagation();
              void apply(t);
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {completing && <CompleteWorkOrderDialog wo={wo} onClose={() => setCompleting(false)} />}
    </>
  );
}

export function CompleteWorkOrderDialog({ wo, onClose }: { wo: WorkOrder; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const { toast } = useToast();

  const [step, setStep] = useState<'form' | 'summary'>('form');
  const [condition, setCondition] = useState(CONDITIONS[0]!);
  const [notes, setNotes] = useState('');
  const [signature, setSignature] = useState('');
  const [beforePhoto, setBeforePhoto] = useState<File | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const doneCount = (wo.checklist ?? []).filter((c) => c.done).length;
  const totalCount = (wo.checklist ?? []).length;
  const tools = toolsForWorkOrder(wo);

  async function uploadEvidence(file: File | null): Promise<boolean> {
    if (!file) return false;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({ title: 'File too large', description: `${file.name} exceeds the 5 MB upload limit.`, tone: 'error' });
      return false;
    }
    await documentsApi.upload(wo.assetId, file, 'Image');
    return true;
  }

  const submit = async () => {
    if (!signature.trim()) {
      toast({ title: 'Signature required', description: 'Type your name to attest the work is complete.', tone: 'error' });
      return;
    }

    setUploading(true);
    const beforeUploaded = await uploadEvidence(beforePhoto).catch(() => false);
    const afterUploaded = await uploadEvidence(afterPhoto).catch(() => false);
    setUploading(false);

    const summary = [
      `Work completed. Condition: ${condition}.`,
      notes.trim() ? `Notes: ${notes.trim()}.` : '',
      wo.parts.length > 0 ? `Parts used: ${wo.parts.map((p) => `${p.name} x${p.qty}`).join(', ')}.` : '',
      beforeUploaded || afterUploaded ? 'Before/after photos attached to the asset record.' : '',
      `Signed off by ${signature.trim()}.`,
    ]
      .filter(Boolean)
      .join(' ');

    const ok = await run(maintenanceApi.changeStatus(wo.id, 'Completed', stageComment('Completed', summary)), {
      success: `${wo.id} completed`,
      describe: 'complete that work order',
    });

    if (ok) setStep('summary');
  };

  if (step === 'summary') {
    return (
      <FormDialog
        icon="✅"
        title="Work order completed"
        submitLabel="Done"
        cancelLabel=""
        onSubmit={onClose}
        onCancel={onClose}
      >
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <strong>{wo.id}</strong> is closed out. {wo.assetName} is recorded as <strong>{condition}</strong>.
        </div>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Checklist</dt><dd className="font-medium text-slate-800">{doneCount}/{totalCount} done</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Parts used</dt><dd className="font-medium text-slate-800">{wo.parts.length || 'None'}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Evidence</dt><dd className="font-medium text-slate-800">{(beforePhoto ? 1 : 0) + (afterPhoto ? 1 : 0)} photo(s)</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Signed off by</dt><dd className="font-medium text-slate-800">{signature}</dd></div>
        </dl>
      </FormDialog>
    );
  }

  return (
    <FormDialog
      icon="🏁"
      title={`Complete ${wo.id}`}
      description="Record what happened before closing this work order out."
      submitLabel={uploading || isPending ? 'Completing…' : 'Complete Work Order'}
      busy={uploading || isPending}
      onSubmit={() => void submit()}
      onCancel={onClose}
      width="lg"
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs text-slate-500 space-y-1">
        <div className="flex justify-between"><span>Checklist</span><span className="font-medium text-slate-700">{doneCount}/{totalCount} done</span></div>
        <div className="flex justify-between"><span>Required tools</span><span className="font-medium text-slate-700">{tools.join(', ')}</span></div>
        {wo.parts.length > 0 && (
          <div className="flex justify-between"><span>Parts used</span><span className="font-medium text-slate-700">{wo.parts.map((p) => p.name).join(', ')}</span></div>
        )}
      </div>

      <Field label="Asset condition" required>
        <Select value={condition} onChange={(e) => setCondition(e.target.value)} options={CONDITIONS.map((c) => ({ value: c, label: c }))} />
      </Field>

      <Field label="Technician notes" hint="What was done, and anything the next person should know.">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Replaced the failed component, verified operation, tidied the site." />
      </Field>

      <FieldRow>
        <Field label="Before photo" hint="Optional.">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setBeforePhoto(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-700 hover:file:bg-primary-100"
          />
        </Field>
        <Field label="After photo" hint="Optional.">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setAfterPhoto(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-700 hover:file:bg-primary-100"
          />
        </Field>
      </FieldRow>

      <Field label="Digital signature" required hint="Type your full name to attest the work is complete and accurate.">
        <TextInput value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Full name" />
      </Field>
    </FormDialog>
  );
}

/** SLA chip — reused wherever a work order row needs "how much runway is left". */
export function SlaChip({ dueDate, status }: { dueDate: string; status: WorkOrder['status'] }) {
  if (status === 'Completed') return <Badge tone="emerald">Met</Badge>;

  const diffMs = Date.parse(dueDate) - Date.now();
  const hours = Math.round(diffMs / 3_600_000);

  if (hours < 0) return <Badge tone="red">Overdue {Math.abs(Math.round(hours / 24)) || 1}d</Badge>;
  if (hours <= 4) return <Badge tone="red">{hours}h left</Badge>;
  if (hours <= 24) return <Badge tone="amber">{hours}h left</Badge>;
  return <Badge tone="emerald">{Math.round(hours / 24)}d left</Badge>;
}
