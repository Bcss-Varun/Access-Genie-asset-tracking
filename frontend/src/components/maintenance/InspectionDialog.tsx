import { useState } from 'react';
import type { Inspection } from '@access-genie/shared';
import { FormDialog, Field, FieldRow, Select, TextInput, dateInDays } from '@/components/ui/FormDialog';
import { AssetPicker } from '@/components/ui/AssetPicker';
import { useMutate } from '@/api/mutate';
import { inspectionsApi } from '@/api/maintenance';
import { allChecklistTemplates } from '@/lib/dataset';
import { allUsers } from '@/lib/rbac';

/**
 * Schedule an inspection.
 *
 * The checks come from a template rather than being typed each time — that is
 * what the checklist library is for, and copying its items in at schedule time
 * means editing a template later cannot silently rewrite an inspection somebody
 * has already carried out.
 *
 * If there are no templates yet the dialog says so and offers a single ad-hoc
 * check, rather than creating an inspection with an empty body that reads as
 * passed the moment anyone opens it.
 */
export function InspectionDialog({ existing, onClose }: { existing?: Inspection; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const templates = allChecklistTemplates;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [assetId, setAssetId] = useState(existing?.assetId ?? '');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [dueDate, setDueDate] = useState(existing?.dueDate?.slice(0, 10) ?? dateInDays(7));
  const [inspector, setInspector] = useState(existing?.inspector ?? 'Unassigned');

  const template = templates.find((t) => t.id === templateId);

  const inspectors = [
    { value: 'Unassigned', label: 'Unassigned — anyone can pick it up' },
    ...allUsers.map((u) => ({ value: u.name, label: u.name })),
  ];

  const submit = async () => {
    const items = (template?.items ?? ['Inspect and record the outcome']).map((label) => ({ label }));

    const ok = await run(
      existing
        ? inspectionsApi.update(existing.id, {
            title: title.trim(),
            dueDate: new Date(dueDate).toISOString(),
            inspector,
          })
        : inspectionsApi.create({
            title: title.trim(),
            assetId,
            template: template?.name ?? 'Ad-hoc check',
            dueDate: new Date(dueDate).toISOString(),
            inspector,
            items,
          }),
      {
        success: existing ? 'Inspection updated' : `${title.trim()} scheduled`,
        successDetail: existing ? undefined : `${items.length} check${items.length === 1 ? '' : 's'} · due ${dueDate}`,
        describe: existing ? 'save that inspection' : 'schedule that inspection',
      },
    );
    if (ok) onClose();
  };

  const valid = title.trim().length >= 2 && (existing ? true : assetId.length > 0) && Boolean(dueDate);

  return (
    <FormDialog
      icon="🔍"
      title={existing ? `Edit ${existing.title}` : 'Schedule an inspection'}
      description="Appears in the field queue as soon as it is saved, and counts as overdue the day after it is due."
      submitLabel={existing ? 'Save' : 'Schedule'}
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="What is being checked" required>
        <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Annual safety check" />
      </Field>

      {existing ? (
        <Field label="Asset">
          <TextInput value={`${existing.assetName} · ${existing.assetId}`} disabled />
        </Field>
      ) : (
        <AssetPicker value={assetId} onChange={setAssetId} required />
      )}

      {!existing && (
        <Field
          label="Checklist"
          hint={
            templates.length === 0
              ? 'No templates yet — this will be scheduled with a single ad-hoc check. Write one under Maintenance ▸ Checklists.'
              : `${template?.items.length ?? 0} checks, copied in now so editing the template later cannot rewrite this inspection.`
          }
        >
          {templates.length === 0 ? (
            <TextInput value="Ad-hoc check" disabled />
          ) : (
            <Select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              options={templates.map((t) => ({ value: t.id, label: `${t.icon} ${t.name} (${t.items.length})` }))}
            />
          )}
        </Field>
      )}

      <FieldRow>
        <Field label="Due" required>
          <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Inspector">
          <Select value={inspector} onChange={(e) => setInspector(e.target.value)} options={inspectors} />
        </Field>
      </FieldRow>

      {!existing && template && template.items.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Checks that will be created
          </div>
          <ol className="list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
            {template.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </div>
      )}
    </FormDialog>
  );
}
