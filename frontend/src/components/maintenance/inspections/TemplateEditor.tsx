import { useState } from 'react';
import {
  ASSET_CATEGORIES,
  INSPECTION_QUESTION_TYPES,
  INSPECTION_TYPES,
  type AssetCategory,
  type InspectionQuestionType,
  type InspectionTemplate,
  type InspectionType,
} from '@access-genie/shared';
import { inspectionsApi, useRefreshInspections, type CheckpointInput, type TemplateBody } from '@/api/inspections';
import { ApiRequestError } from '@/api/client';
import { useMutate } from '@/api/mutate';
import { FormDialog, Field, FieldGroup, Select, TextArea, TextInput } from '@/components/ui/FormDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { scopeTree } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { QUESTION_EMOJI, QUESTION_HINT } from './tokens';

/**
 * Build or edit a template.
 *
 * The checkpoint rows are the substance. Each carries a type, and the fields
 * that type needs appear with it — a min/max band only for `Number`, a
 * "which answer fails" only for the two binary types. Showing every field for
 * every type would let somebody set a numeric band on a free-text question and
 * wonder why nothing enforced it.
 *
 * Existing checkpoints keep their `key` through an edit. That is what lets a
 * question be reworded without detaching it from the answers already recorded
 * against it on inspections carried out earlier.
 */

const BLANK: CheckpointInput = { label: '', type: 'Pass/Fail', required: true };

/** Facilities from the scope tree — the same list the rest of the app scopes by. */
function facilityOptions(): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const walk = (node: { id: string; name: string; level: string; children?: unknown[] }) => {
    if (node.level === 'facility') out.push({ id: node.id, name: node.name });
    for (const child of (node.children ?? []) as typeof node[]) walk(child);
  };
  walk(scopeTree as never);
  return out;
}

export function TemplateEditor({ existing, onClose }: { existing?: InspectionTemplate; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const refresh = useRefreshInspections();
  const { toast } = useToast();

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [type, setType] = useState<InspectionType>(existing?.type ?? 'Safety');
  const [category, setCategory] = useState(existing?.category ?? 'General');
  const [icon, setIcon] = useState(existing?.icon ?? '🔎');
  const [estimatedMinutes, setEstimatedMinutes] = useState(String(existing?.estimatedMinutes ?? 15));
  const [checkpoints, setCheckpoints] = useState<CheckpointInput[]>(
    existing?.checkpoints.map((c) => ({ ...c })) ?? [{ ...BLANK }],
  );
  const [categories, setCategories] = useState<AssetCategory[]>(existing?.scope.assetCategories ?? []);
  const [facilityIds, setFacilityIds] = useState<string[]>(existing?.scope.facilityIds ?? []);
  const [error, setError] = useState<string | null>(null);

  const facilities = facilityOptions();

  const patch = (index: number, next: Partial<CheckpointInput>) =>
    setCheckpoints((current) => current.map((c, i) => (i === index ? { ...c, ...next } : c)));

  const move = (index: number, delta: number) =>
    setCheckpoints((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target] as CheckpointInput, next[index] as CheckpointInput];
      return next;
    });

  const valid = name.trim().length >= 3 && checkpoints.length > 0 && checkpoints.every((c) => c.label.trim().length >= 2);

  async function submit() {
    setError(null);

    if (!valid) {
      setError('Give the template a name of at least 3 characters, and every checkpoint a label of at least 2.');
      return;
    }

    const body: TemplateBody = {
      name: name.trim(),
      description: description.trim(),
      type,
      category: category.trim() || 'General',
      icon: icon.trim() || '🔎',
      estimatedMinutes: Number(estimatedMinutes) || 15,
      // Numeric fields are sent only where the type uses them; the server
      // strips the rest, but sending them would let the payload imply a rule
      // that will not be enforced.
      checkpoints: checkpoints.map((c) => ({
        key: c.key,
        label: c.label.trim(),
        type: c.type,
        required: c.required,
        helpText: c.helpText?.trim() || undefined,
        min: c.type === 'Number' && c.min !== undefined && !Number.isNaN(c.min) ? c.min : undefined,
        max: c.type === 'Number' && c.max !== undefined && !Number.isNaN(c.max) ? c.max : undefined,
        unit: c.type === 'Number' ? c.unit?.trim() || undefined : undefined,
        failWhen: c.type === 'Pass/Fail' || c.type === 'Yes/No' ? c.failWhen : undefined,
      })),
      scope: { assetIds: existing?.scope.assetIds ?? [], assetCategories: categories, facilityIds },
    };

    try {
      const saved = await run(existing ? inspectionsApi.updateTemplate(existing.id, body) : inspectionsApi.createTemplate(body), {
        describe: existing ? 'save that template' : 'create that template',
        refresh,
      });
      if (!saved) return;

      toast({
        title: existing ? `${saved.name} saved` : `${saved.name} created`,
        description: `${saved.checkpoints.length} checkpoint${saved.checkpoints.length === 1 ? '' : 's'} · v${saved.version}`,
        tone: 'success',
      });
      onClose();
    } catch (err) {
      // `run` already reported it; this surfaces the server's specific reason —
      // a bad band, a scope naming something that no longer exists — inline.
      setError(err instanceof ApiRequestError ? err.message : 'The request failed.');
    }
  }

  return (
    <FormDialog
      icon="📋"
      title={existing ? `Edit ${existing.name}` : 'New inspection template'}
      description="A template is the reusable body of checks. Editing the checkpoints creates a new version; inspections already carried out keep the version they were built from."
      submitLabel={existing ? 'Save template' : 'Create template'}
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
      width="xl"
    >
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Monthly fire safety check" />
        </Field>
        <Field label="Inspection type">
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as InspectionType)}
            options={INSPECTION_TYPES.map((t) => ({ value: t, label: t }))}
          />
        </Field>
      </div>

      <Field label="Description" hint="What this inspection is for, and anything the inspector should know before starting.">
        <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Category">
          <TextInput value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Fire" />
        </Field>
        <Field label="Icon">
          <TextInput value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} />
        </Field>
        <Field label="Estimated minutes">
          <TextInput type="number" min={0} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} />
        </Field>
      </div>

      {/* ── Scope ─────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-700">Applies to</p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Leave both empty to make this template available for any asset. Selecting narrows it — an asset matches if its
          category is listed <em>or</em> it sits in one of the facilities.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FieldGroup label="Asset categories">
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {ASSET_CATEGORIES.map((option) => {
                const on = categories.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setCategories((c) => (on ? c.filter((x) => x !== option) : [...c, option]))}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                      on ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 text-slate-600 hover:border-primary-300',
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </FieldGroup>

          <FieldGroup label="Facilities">
            {facilities.length === 0 ? (
              <p className="text-[11px] text-slate-400">No facilities in the scope tree yet.</p>
            ) : (
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {facilities.map((facility) => {
                  const on = facilityIds.includes(facility.id);
                  return (
                    <button
                      key={facility.id}
                      type="button"
                      onClick={() => setFacilityIds((f) => (on ? f.filter((x) => x !== facility.id) : [...f, facility.id]))}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                        on ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 text-slate-600 hover:border-primary-300',
                      )}
                    >
                      {facility.name}
                    </button>
                  );
                })}
              </div>
            )}
          </FieldGroup>
        </div>
      </div>

      {/* ── Checkpoints ───────────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700">
            Checkpoints <span className="font-normal text-slate-400">({checkpoints.length})</span>
          </p>
          <button
            type="button"
            onClick={() => setCheckpoints((c) => [...c, { ...BLANK }])}
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            + Add checkpoint
          </button>
        </div>

        <ol className="space-y-2">
          {checkpoints.map((checkpoint, index) => (
            <li key={index} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-5 shrink-0 text-center text-[11px] font-semibold text-slate-400">{index + 1}</span>

                <div className="min-w-0 flex-1 space-y-2">
                  <TextInput
                    value={checkpoint.label}
                    onChange={(e) => patch(index, { label: e.target.value })}
                    placeholder="What is being checked?"
                  />

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      value={checkpoint.type}
                      onChange={(e) => {
                        const next = e.target.value as InspectionQuestionType;
                        // Reset the type-specific rule so a leftover setting
                        // from the previous type cannot silently survive.
                        patch(index, {
                          type: next,
                          failWhen: next === 'Yes/No' ? 'No' : next === 'Pass/Fail' ? 'Fail' : undefined,
                          min: undefined,
                          max: undefined,
                          unit: undefined,
                        });
                      }}
                      options={INSPECTION_QUESTION_TYPES.map((t) => ({ value: t, label: `${QUESTION_EMOJI[t]} ${t}` }))}
                    />

                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={checkpoint.required}
                        onChange={(e) => patch(index, { required: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 accent-primary-600"
                      />
                      Required — must be answered before the inspection can close
                    </label>
                  </div>

                  <p className="text-[11px] text-slate-400">{QUESTION_HINT[checkpoint.type]}</p>

                  {(checkpoint.type === 'Pass/Fail' || checkpoint.type === 'Yes/No') && (
                    <Select
                      value={checkpoint.failWhen ?? (checkpoint.type === 'Yes/No' ? 'No' : 'Fail')}
                      onChange={(e) => patch(index, { failWhen: e.target.value as 'Fail' | 'No' | 'Yes' })}
                      options={
                        checkpoint.type === 'Yes/No'
                          ? [
                              { value: 'No', label: 'Fails when the answer is No' },
                              { value: 'Yes', label: 'Fails when the answer is Yes' },
                            ]
                          : [{ value: 'Fail', label: 'Fails when the answer is Fail' }]
                      }
                    />
                  )}

                  {checkpoint.type === 'Number' && (
                    <div className="grid grid-cols-3 gap-2">
                      <TextInput
                        type="number"
                        placeholder="Min"
                        value={checkpoint.min ?? ''}
                        onChange={(e) => patch(index, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                      />
                      <TextInput
                        type="number"
                        placeholder="Max"
                        value={checkpoint.max ?? ''}
                        onChange={(e) => patch(index, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                      />
                      <TextInput placeholder="Unit" value={checkpoint.unit ?? ''} onChange={(e) => patch(index, { unit: e.target.value })} />
                    </div>
                  )}

                  <TextInput
                    value={checkpoint.helpText ?? ''}
                    onChange={(e) => patch(index, { helpText: e.target.value })}
                    placeholder="Guidance for the inspector (optional)"
                  />
                </div>

                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                    className="rounded px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === checkpoints.length - 1}
                    aria-label="Move down"
                    className="rounded px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckpoints((c) => c.filter((_, i) => i !== index))}
                    disabled={checkpoints.length === 1}
                    aria-label="Remove checkpoint"
                    className="rounded px-1 text-slate-400 hover:text-health-critical disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </FormDialog>
  );
}
