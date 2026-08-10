import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ASSET_CATEGORIES,
  FIELD_TYPES,
  type AssetCategory,
  type AssetTemplate,
  type FieldType,
  type SectionKey,
} from '@access-genie/shared';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { ApiRequestError } from '@/api/client';
import { registrationApi, templatesApi, SECTION_ORDER } from '@/api/registration';
import { IconPicker } from './IconPicker';
import { WizardPanel, WizardRail, type WizardStep } from './WizardShell';
import { cn } from '@/lib/utils';

/**
 * Build a template: choose the questions this kind of asset is worth asking.
 *
 * Laid out as the registration form is — the same sections, in the same order —
 * so the author is picking fields inside the shape the person filling it in
 * will see. An editor organised any other way makes you hold the mapping in
 * your head.
 *
 * Two decisions per field and no more: *ask it?* and *insist on it?* Everything
 * else about a field (its type, limits, help text) already exists in the
 * catalogue and is not the author's problem.
 */

interface Selection {
  required: boolean;
  order: number;
}

interface CustomDraft {
  key: string;
  label: string;
  section: SectionKey;
  type: FieldType;
  options: string;
  required: boolean;
  order: number;
}

export function TemplateEditor({ existing }: { existing?: AssetTemplate }) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? '📋');
  const [category, setCategory] = useState<AssetCategory>(existing?.category ?? 'Compute');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Record<string, Selection>>(() =>
    Object.fromEntries((existing?.fields ?? []).map((f) => [f.key, { required: f.required, order: f.order }])),
  );
  const [custom, setCustom] = useState<CustomDraft[]>(() =>
    (existing?.customFields ?? []).map((c) => ({
      key: c.key,
      label: c.label,
      section: c.section,
      type: c.type,
      options: (c.options ?? []).join(', '),
      required: c.required,
      order: c.order,
    })),
  );
  const [addingTo, setAddingTo] = useState<SectionKey | null>(null);
  const [step, setStep] = useState(0);

  const { data: catalog, isLoading } = useQuery({
    queryKey: ['field-catalog'],
    queryFn: () => registrationApi.catalog(),
  });

  // The catalogue only offers what a template can decide: the category comes
  // from this editor's own header, and the minted numbers are nobody's choice.
  const coreKeys = useMemo(() => new Set(catalog?.coreFields ?? []), [catalog]);
  const alwaysCount = coreKeys.size;

  const toggleField = (key: string) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[key]) delete next[key];
      else next[key] = { required: false, order: Object.keys(next).length };
      return next;
    });

  const toggleRequired = (key: string) =>
    setSelected((s) => (s[key] ? { ...s, [key]: { ...s[key], required: !s[key].required } } : s));

  const removeCustom = (key: string) => {
    setCustom((c) => c.filter((x) => x.key !== key));
    setSelected((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
  };

  /**
   * Selections the catalogue still offers.
   *
   * A template written before the category and the asset tag stopped being
   * questions still names them. They are dropped here rather than migrated,
   * because re-saving is the only moment we can be sure the author sees the
   * result — and a count that includes a field the form will never render is
   * the kind of small lie that outlives the release that caused it.
   */
  const pickableKeys = useMemo(
    () => new Set([...(catalog?.sections ?? []).flatMap((s) => s.fields.map((f) => f.key)), ...custom.map((c) => c.key)]),
    [catalog, custom],
  );
  const chosenEntries = useMemo(
    () => Object.entries(selected).filter(([key]) => pickableKeys.has(key)),
    [selected, pickableKeys],
  );
  const chosenCount = chosenEntries.length;
  const requiredCount = chosenEntries.filter(([, s]) => s.required).length;

  const save = async () => {
    setError(null);
    if (name.trim().length < 2) {
      setError('Give the template a name of at least two characters.');
      return;
    }

    const body = {
      name: name.trim(),
      description: description.trim(),
      icon: icon.trim() || '📋',
      category,
      fields: chosenEntries.map(([key, s]) => ({ key, required: s.required, order: s.order })),
      customFields: custom.map((c) => ({
        key: c.key,
        label: c.label,
        section: c.section,
        type: c.type,
        required: c.required,
        order: c.order,
        ...(c.type === 'select'
          ? { options: c.options.split(',').map((o) => o.trim()).filter(Boolean) }
          : {}),
      })),
    };

    setSaving(true);
    try {
      const saved = existing ? await templatesApi.update(existing.id, body) : await templatesApi.create(body);
      toast({ title: `“${saved.name}” saved`, description: `${chosenCount} fields, ${requiredCount} required.`, tone: 'success' });
      navigate('/assets/templates');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'The template could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !catalog) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading the field catalogue…</div>;
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

  // One step for the template's own details, then one per section of the form
  // it will produce — the same order the person filling it in will meet them.
  const sectionSteps = SECTION_ORDER
    .map((key) => catalog.sections.find((s) => s.key === key))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const chosenIn = (sectionKey: string) =>
    sectionSteps
      .find((s) => s.key === sectionKey)!
      .fields.filter((f) => coreKeys.has(f.key) || !!selected[f.key]).length +
    custom.filter((c) => c.section === sectionKey).length;

  const steps: WizardStep[] = [
    {
      key: '__basics__',
      label: 'What is this template for?',
      description: 'Name it after the kind of asset it registers.',
      state: name.trim().length >= 2 ? 'done' : 'todo',
    },
    ...sectionSteps.map((s) => ({
      key: s.key,
      label: s.label,
      description: 'Tick what this kind of asset needs, then mark what you insist on.',
      optional: !s.alwaysShown,
      state: (chosenIn(s.key) > 0 ? 'done' : 'todo') as WizardStep['state'],
      hint: `${chosenIn(s.key)} of ${s.fields.length + custom.filter((c) => c.section === s.key).length} chosen`,
    })),
  ];

  const current = steps[step] ?? steps[0];
  const onBasics = current.key === '__basics__';
  const section = onBasics ? undefined : sectionSteps.find((s) => s.key === current.key);
  const goto = (i: number) => {
    setStep(Math.max(0, Math.min(steps.length - 1, i)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <WizardRail
        steps={steps}
        current={step}
        onGo={goto}
        footnote={
          <p className="text-xs leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-700">{chosenCount + alwaysCount} fields</span> asked,{' '}
            <span className="font-semibold text-slate-700">{requiredCount + alwaysCount} mandatory</span>. Name and site
            are always included; the category comes from this template, and the asset tag is issued automatically.
          </p>
        }
      />

      <WizardPanel
        step={current}
        index={step}
        total={steps.length}
        onBack={step > 0 ? () => goto(step - 1) : undefined}
        onNext={step < steps.length - 1 ? () => goto(step + 1) : undefined}
        status={
          error ? (
            <span className="font-medium text-health-critical">{error}</span>
          ) : (
            <span className="text-slate-500">
              {chosenCount + alwaysCount} asked · {requiredCount + alwaysCount} mandatory
            </span>
          )
        }
        actions={
          step === steps.length - 1 ? (
            <>
              <Button variant="outline" onClick={() => navigate('/assets/templates')} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving…' : existing ? 'Save changes' : 'Create template'}
              </Button>
            </>
          ) : undefined
        }
      >
        {onBasics ? (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="t-name" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Template name<span className="ml-0.5 text-health-critical">*</span>
                </label>
                <input
                  id="t-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Computer / Laptop"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="t-category" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Category<span className="ml-0.5 text-health-critical">*</span>
                </label>
                <select
                  id="t-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as AssetCategory)}
                  className={inputCls}
                >
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="t-desc" className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
                <input
                  id="t-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What it is for, in one line"
                  className={inputCls}
                />
              </div>
            </div>
            <IconPicker value={icon} onChange={setIcon} />
          </div>
        ) : (
          section && (
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-sm text-slate-500">{section.description}</p>
                <button
                  type="button"
                  onClick={() => setAddingTo(addingTo === section.key ? null : section.key)}
                  className="rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-primary-400 hover:text-primary-600"
                >
                  + Custom field
                </button>
              </div>

              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {section.fields.map((f) => {
                  const isCore = coreKeys.has(f.key);
                  const sel = selected[f.key];
                  const on = isCore || !!sel;
                  return (
                    <li key={f.key} className={cn('flex flex-wrap items-center gap-3 px-4 py-2.5', on && 'bg-primary-50/25')}>
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={isCore}
                          onChange={() => toggleField(f.key)}
                          aria-label={`Include ${f.label}`}
                          className="h-4 w-4 shrink-0 accent-primary-600 disabled:opacity-50"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {f.label}
                            {f.identity && (
                              <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                identifies the unit
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {f.type}
                            {f.unit ? ` · ${f.unit}` : ''}
                            {isCore ? ' · always included' : ''}
                          </span>
                        </span>
                      </label>

                      <label
                        className={cn(
                          'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                          isCore || sel?.required
                            ? 'border-primary-300 bg-primary-50 text-primary-700'
                            : 'border-slate-200 text-slate-400 hover:bg-slate-50',
                          !on && 'pointer-events-none opacity-40',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isCore || !!sel?.required}
                          disabled={isCore || !on}
                          onChange={() => toggleRequired(f.key)}
                          aria-label={`Make ${f.label} mandatory`}
                          className="h-3.5 w-3.5 accent-primary-600"
                        />
                        Mandatory
                      </label>
                    </li>
                  );
                })}

                {custom.filter((c) => c.section === section.key).map((c) => (
                  <li key={c.key} className="flex flex-wrap items-center gap-3 bg-primary-50/25 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {c.label}
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">custom</span>
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">{c.type} · {c.key}</span>
                    </span>
                    <label className={cn(
                      'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium',
                      c.required ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-400',
                    )}>
                      <input
                        type="checkbox"
                        checked={c.required}
                        onChange={() => setCustom((all) => all.map((x) => (x.key === c.key ? { ...x, required: !x.required } : x)))}
                        aria-label={`Make ${c.label} mandatory`}
                        className="h-3.5 w-3.5 accent-primary-600"
                      />
                      Mandatory
                    </label>
                    <button
                      type="button"
                      onClick={() => removeCustom(c.key)}
                      aria-label={`Remove ${c.label}`}
                      className="shrink-0 text-xs text-slate-300 hover:text-health-critical"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              {addingTo === section.key && (
                <CustomFieldForm
                  section={section.key}
                  taken={new Set([...section.fields.map((f) => f.key), ...custom.map((c) => c.key)])}
                  onCancel={() => setAddingTo(null)}
                  onAdd={(draft) => {
                    setCustom((c) => [...c, draft]);
                    setSelected((s) => ({ ...s, [draft.key]: { required: draft.required, order: Object.keys(s).length } }));
                    setAddingTo(null);
                  }}
                />
              )}
            </div>
          )
        )}
      </WizardPanel>
    </div>
  );
}

/** Define a field the catalogue does not have — a MAC address on a laptop, say. */
function CustomFieldForm({
  section,
  taken,
  onAdd,
  onCancel,
}: {
  section: SectionKey;
  taken: Set<string>;
  onAdd: (draft: CustomDraft) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The key becomes a Mongo path, so it is derived from the label rather than
  // asked for — one less thing to get wrong, and it cannot contain a dot.
  const key = label
    .trim()
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('');

  const submit = () => {
    if (label.trim().length < 2) return setErr('Give the field a label.');
    if (!key || !/^[a-zA-Z]/.test(key)) return setErr('The label needs to start with a letter.');
    if (taken.has(key)) return setErr(`"${key}" already exists — pick a different label.`);
    if (type === 'select' && !options.split(',').map((o) => o.trim()).filter(Boolean).length) {
      return setErr('A dropdown needs at least one option.');
    }
    onAdd({ key, label: label.trim(), section, type, options, required, order: 900 });
  };

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">Field label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Warranty agent" className={inputCls} />
          {key && <p className="mt-1 text-[11px] text-slate-400">Stored as <code className="font-mono">{key}</code></p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as FieldType)} className={inputCls}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        {type === 'select' && (
          <div className="sm:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">Options (comma separated)</label>
            <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Small, Medium, Large" className={inputCls} />
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={required} onChange={() => setRequired((r) => !r)} className="h-3.5 w-3.5 accent-primary-600" />
          Mandatory
        </label>
        {err && <span className="text-xs font-medium text-health-critical">{err}</span>}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={submit}>Add field</Button>
        </div>
      </div>
    </div>
  );
}
