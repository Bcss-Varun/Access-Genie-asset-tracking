import { useMemo, useState } from 'react';
import type { ChecklistTemplate } from '@access-genie/shared';
import { allChecklistTemplates, allInspections } from '@/lib/dataset';
import { PageHeader, Badge, EmptyState, KpiCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormDialog, Field, FieldRow, Select, TextArea, TextInput } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { checklistTemplatesApi } from '@/api/configuration';

/**
 * The checklist library.
 *
 * This page used to derive its templates by scanning existing inspections and
 * merging them with a hard-coded map. That looked like a library and was not
 * one: you could not edit what it showed, and it could not produce a template
 * for work nobody had scheduled yet — which is exactly when you want to write
 * one.
 *
 * Templates are now stored. Usage stays derived — how many inspections
 * currently reference the template by name — because a stored counter drifts
 * the moment an inspection is deleted.
 */

const CATEGORIES = ['IT Ops', 'Facilities', 'Infrastructure', 'Compliance', 'Safety', 'Security', 'General'];
const ICONS = ['📋', '💻', '❄️', '🛡️', '⚡', '🔒', '🔧', '🚨', '🧯', '🔋'];

function TemplateDialog({ existing, onClose }: { existing?: ChecklistTemplate; onClose: () => void }) {
  const { run, isPending } = useMutate();

  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState(existing?.category ?? 'General');
  const [icon, setIcon] = useState(existing?.icon ?? '📋');
  const [description, setDescription] = useState(existing?.description ?? '');
  // Edited as text: a checklist is a list of lines, and a row-per-item editor
  // makes reordering and pasting from an existing procedure needlessly hard.
  const [itemsText, setItemsText] = useState((existing?.items ?? []).join('\n'));

  const items = itemsText
    .split('\n')
    .map((line) => line.replace(/^\s*[-*\d.)\]]+\s*/, '').trim())
    .filter(Boolean);

  const submit = async () => {
    const body = { name: name.trim(), category, icon, description: description.trim(), items };
    const ok = await run(
      existing ? checklistTemplatesApi.update(existing.id, body) : checklistTemplatesApi.create(body),
      {
        success: existing ? 'Template saved' : `${name.trim()} created`,
        successDetail: `${items.length} check${items.length === 1 ? '' : 's'}`,
        describe: existing ? 'save that template' : 'create that template',
      },
    );
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon={icon}
      title={existing ? `Edit ${existing.name}` : 'New checklist template'}
      description="The checks are copied into an inspection when it is scheduled, so editing this later never rewrites work already done."
      submitLabel={existing ? 'Save' : 'Create template'}
      width="lg"
      busy={isPending}
      disabled={name.trim().length < 2 || items.length === 0}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Template name" required>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Endpoint provisioning" />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </Field>
      </FieldRow>

      <Field label="Icon">
        <div className="flex flex-wrap gap-1.5">
          {ICONS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIcon(i)}
              className={`rounded-lg border px-3 py-1.5 text-lg transition-colors ${
                icon === i ? 'border-primary-300 bg-primary-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              {i}
            </button>
          ))}
        </div>
      </Field>

      <Field label="When to use it">
        <TextArea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Run before handing a laptop to a new joiner."
        />
      </Field>

      <Field label={`Checks — ${items.length}`} required hint="One per line. Numbering and bullets are stripped.">
        <TextArea
          rows={10}
          className="font-mono text-xs"
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
          placeholder={'Verify serial number matches the asset record\nConfirm disk encryption is enabled\nInstall endpoint agent and confirm check-in\nHand over and record the custodian'}
        />
      </Field>
    </FormDialog>
  );
}

export default function ChecklistsPage() {
  const { run, isPending } = useMutate();
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; template: ChecklistTemplate } | null>(null);
  const [deleting, setDeleting] = useState<ChecklistTemplate | null>(null);

  const templates = useMemo(() => {
    const usage = new Map<string, number>();
    for (const insp of allInspections) usage.set(insp.template, (usage.get(insp.template) ?? 0) + 1);

    return allChecklistTemplates
      .map((t) => ({ ...t, usageCount: usage.get(t.name) ?? t.usageCount ?? 0 }))
      .sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));
  }, []);

  /**
   * Inspections raised from a template the library has no record of.
   *
   * Worth surfacing rather than hiding: it means somebody is running a
   * procedure nobody can schedule again, which is the gap this page exists to
   * close.
   */
  const orphaned = useMemo(() => {
    const known = new Set(allChecklistTemplates.map((t) => t.name));
    const out = new Map<string, number>();
    for (const insp of allInspections) {
      if (!known.has(insp.template)) out.set(insp.template, (out.get(insp.template) ?? 0) + 1);
    }
    return [...out.entries()].sort((a, b) => b[1] - a[1]);
  }, []);

  const remove = async () => {
    if (!deleting) return;
    await run(checklistTemplatesApi.remove(deleting.id), {
      success: 'Template deleted',
      successDetail: 'Inspections already scheduled from it keep their own copy of the checks.',
      describe: 'delete that template',
    });
    setDeleting(null);
  };

  const totalChecks = templates.reduce((sum, t) => sum + t.items.length, 0);
  const inUse = templates.filter((t) => t.usageCount > 0).length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Checklists"
        subtitle="Reusable inspection templates for scheduling recurring checks."
        breadcrumb={[{ label: 'Maintenance', href: '/maintenance' }, { label: 'Checklists' }]}
        actions={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Template</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard label="Templates" value={templates.length} sub="In the library" tone="primary" accent />
        <KpiCard label="In use" value={inUse} sub="Referenced by an inspection" tone="emerald" />
        <KpiCard label="Total checks" value={totalChecks} sub="Across all templates" tone="slate" />
      </div>

      {orphaned.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5">
          <div className="text-sm font-semibold text-amber-900">
            {orphaned.length} procedure{orphaned.length === 1 ? '' : 's'} in use without a template
          </div>
          <p className="mt-0.5 text-xs text-amber-700">
            Inspections reference these by name, but the library has no record of them — so nobody can schedule the
            same checks again.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {orphaned.map(([name, count]) => (
              <Badge key={name} tone="amber">
                {name} · {count}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="📋"
            title="No templates yet"
            description="Write a procedure down once and every future inspection can be scheduled from it — same checks, same order, whoever carries it out."
            action={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Template</Button>}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="glass-panel flex flex-col rounded-xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-2xl">{t.icon}</span>
                  <h3 className="truncate font-heading font-semibold text-slate-900">{t.name}</h3>
                </div>
                <Badge tone="slate">{t.category}</Badge>
              </div>

              {t.description && <p className="mt-2 text-sm text-slate-500">{t.description}</p>}

              <ol className="mt-3 flex-1 list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
                {t.items.slice(0, 5).map((item, i) => (
                  <li key={i} className="truncate">
                    {item}
                  </li>
                ))}
                {t.items.length > 5 && <li className="list-none text-xs text-slate-400">+{t.items.length - 5} more</li>}
              </ol>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-400">
                  {t.items.length} check{t.items.length === 1 ? '' : 's'} ·{' '}
                  {t.usageCount > 0 ? `used ${t.usageCount}×` : 'never used'}
                </span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'edit', template: t })}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(t)}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog?.mode === 'new' && <TemplateDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit' && <TemplateDialog existing={dialog.template} onClose={() => setDialog(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          description={
            (deleting.usageCount ?? 0) > 0
              ? `${deleting.usageCount} inspection${deleting.usageCount === 1 ? '' : 's'} were scheduled from this. They keep their own copy of the checks, but nothing new can be scheduled from it.`
              : 'Nothing has been scheduled from this template yet.'
          }
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
