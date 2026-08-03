import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { allAssetClasses } from '@/lib/dataset';
import type { Asset, AssetCategory, Criticality, AttributeDef } from '@access-genie/shared';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { assetsApi } from '@/api/assets';
import { useRefreshDataset } from '@/api/dataset';
import { ApiRequestError } from '@/api/client';
import { cn } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES: AssetCategory[] = ['Compute', 'Network', 'Endpoints', 'Infrastructure', 'Sensors'];
const CRITICALITIES: Criticality[] = ['Low', 'Medium', 'High', 'Critical'];

// ── Form state shape ──────────────────────────────────────────────────────────
interface FormState {
  name: string;
  category: '' | AssetCategory;
  manufacturer: string;
  model: string;
  serialNumber: string;
  taxonomyClassId: string;
  attributes: Record<string, string | boolean>;
  custodian: string;
  locationName: string;
  building: string;
  zone: string;
  criticality: Criticality;
  purchasePrice: string;
  purchaseDate: string;
  warrantyExpiry: string;
  tags: string[];
}

function seedFromAsset(asset?: Asset): FormState {
  // Pre-select the taxonomy class whose name matches the asset's category.
  const cls = asset ? allAssetClasses.find((c) => c.name === asset.category) : undefined;
  return {
    name: asset?.name ?? '',
    category: asset?.category ?? '',
    manufacturer: asset?.manufacturer ?? '',
    model: asset?.model ?? '',
    serialNumber: asset?.serialNumber ?? '',
    taxonomyClassId: cls?.id ?? '',
    attributes: {},
    custodian: asset?.custodian ?? '',
    locationName: asset?.location.name ?? '',
    building: asset?.location.building ?? '',
    zone: asset?.location.zone ?? '',
    criticality: asset?.criticality ?? 'Medium',
    purchasePrice: asset?.purchasePrice != null ? String(asset.purchasePrice) : '',
    purchaseDate: asset?.purchaseDate ? asset.purchaseDate.slice(0, 10) : '',
    warrantyExpiry: asset?.warrantyExpiry ? asset.warrantyExpiry.slice(0, 10) : '',
    tags: asset?.tags ?? [],
  };
}

// ── Field primitives ──────────────────────────────────────────────────────────
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5';
const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 transition-colors';

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-xl p-6">
      <div className="mb-5">
        <h2 className="font-heading font-bold text-base text-slate-900">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  error,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className={labelCls}>
        {label}
        {required && <span className="text-health-critical ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs font-medium text-health-critical">{error}</p>}
    </div>
  );
}

// ── Dynamic attribute field (driven by the taxonomy schema) ───────────────────
function AttributeField({
  attr,
  value,
  onChange,
}: {
  attr: AttributeDef;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const id = `attr-${attr.key}`;

  if (attr.type === 'boolean') {
    const on = value === true;
    return (
      <Field label={attr.label} required={attr.required} htmlFor={id}>
        <button
          type="button"
          id={id}
          role="switch"
          aria-checked={on}
          onClick={() => onChange(!on)}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
            on ? 'bg-primary-600' : 'bg-slate-300',
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
              on ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </button>
      </Field>
    );
  }

  if (attr.type === 'select') {
    return (
      <Field label={attr.label} required={attr.required} htmlFor={id}>
        <select id={id} className={inputCls} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(attr.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  const inputType = attr.type === 'number' ? 'number' : attr.type === 'date' ? 'date' : 'text';
  return (
    <Field label={attr.unit ? `${attr.label} (${attr.unit})` : attr.label} required={attr.required} htmlFor={id}>
      <input
        id={id}
        type={inputType}
        className={inputCls}
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={attr.type === 'number' ? '0' : undefined}
      />
    </Field>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────
export function AssetForm({ mode, asset }: { mode: 'create' | 'edit'; asset?: Asset }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const refreshDataset = useRefreshDataset();

  const initial = useMemo(() => seedFromAsset(asset), [asset]);
  const [form, setForm] = useState<FormState>(initial);
  const [tagDraft, setTagDraft] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const selectedClass = useMemo(
    () => allAssetClasses.find((c) => c.id === form.taxonomyClassId),
    [form.taxonomyClassId],
  );

  // ── Validation ──────────────────────────────────────────────────────────────
  const errors = useMemo(() => {
    const e: Partial<Record<'name' | 'category' | 'serialNumber', string>> = {};
    if (!form.name.trim()) e.name = 'Asset name is required.';
    if (!form.category) e.category = 'Select a category.';
    if (!form.serialNumber.trim()) e.serialNumber = 'Serial number is required.';
    return e;
  }, [form.name, form.category, form.serialNumber]);

  const isValid = Object.keys(errors).length === 0;
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial) || tagDraft.trim() !== '', [form, initial, tagDraft]);
  const showError = (k: 'name' | 'category' | 'serialNumber') => (touched ? errors[k] : undefined);

  // ── Tags ────────────────────────────────────────────────────────────────────
  const commitTags = (raw: string) => {
    const parts = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setForm((f) => ({ ...f, tags: Array.from(new Set([...f.tags, ...parts])) }));
    setTagDraft('');
  };
  const removeTag = (tag: string) => setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));

  // ── Submit ──────────────────────────────────────────────────────────────────

  /**
   * The form's fields, in the shape the API takes.
   *
   * Location is nested and needs an id of its own; money and dates arrive from
   * the inputs as strings. Doing that conversion in one place means the create
   * and update paths cannot disagree about it.
   */
  const toBody = (): Record<string, unknown> => {
    const locationName = form.locationName.trim() || 'Unassigned';
    return {
      name: form.name.trim(),
      category: form.category,
      serialNumber: form.serialNumber.trim(),
      custodian: form.custodian.trim() || 'Unassigned',
      criticality: form.criticality,
      manufacturer: form.manufacturer.trim() || undefined,
      model: form.model.trim() || undefined,
      tags: form.tags,
      location: {
        // Reuse the existing location id on edit so the asset stays attached to
        // the same place rather than being re-pointed at a new one on every save.
        id: asset?.location.id ?? `LOC-${locationName.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 24)}`,
        name: locationName,
        building: form.building.trim() || undefined,
        zone: form.zone.trim() || undefined,
      },
      purchasePrice: Number(form.purchasePrice) || 0,
      // The API requires a purchase date; an asset registered without one is
      // dated today rather than rejected at the last step of a long form.
      purchaseDate: form.purchaseDate || new Date().toISOString().slice(0, 10),
      warrantyExpiry: form.warrantyExpiry || undefined,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (tagDraft.trim()) commitTags(tagDraft);
    if (!isValid) return;

    setSaving(true);
    try {
      const saved =
        mode === 'create'
          ? await assetsApi.create(toBody())
          : await assetsApi.update(asset!.id, toBody());

      // Every other screen reads the same asset, so the dataset is re-read
      // before navigating — otherwise the registry you land on still shows the
      // record as it was before this save.
      await refreshDataset();

      toast({
        title: mode === 'create' ? 'Asset created' : 'Changes saved',
        description: `${saved.name} · ${saved.id}`,
        tone: 'success',
      });
      navigate(mode === 'create' ? `/assets/${saved.id}` : `/assets/${asset?.id ?? ''}`);
    } catch (err) {
      toast({
        title: mode === 'create' ? 'Could not create that asset' : 'Could not save those changes',
        description: err instanceof ApiRequestError ? err.message : 'The request failed. Please try again.',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const cancelHref = mode === 'edit' && asset ? `/assets/${asset.id}` : '/assets';

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 min-h-0 flex flex-col space-y-6">
      {/* Identity */}
      <FormSection title="Identity" description="Core details that identify this asset.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
          <Field label="Asset Name" required error={showError('name')} htmlFor="f-name">
            <input
              id="f-name"
              className={cn(inputCls, showError('name') && 'border-health-critical focus:ring-red-500/30')}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Dell PowerEdge R740 Server"
            />
          </Field>

          <Field label="Category" required error={showError('category')} htmlFor="f-category">
            <select
              id="f-category"
              className={cn(inputCls, showError('category') && 'border-health-critical focus:ring-red-500/30')}
              value={form.category}
              onChange={(e) => set('category', e.target.value as FormState['category'])}
            >
              <option value="">Select a category…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Manufacturer" htmlFor="f-manufacturer">
            <input
              id="f-manufacturer"
              className={inputCls}
              value={form.manufacturer}
              onChange={(e) => set('manufacturer', e.target.value)}
              placeholder="e.g. Dell"
            />
          </Field>

          <Field label="Model" htmlFor="f-model">
            <input
              id="f-model"
              className={inputCls}
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
              placeholder="e.g. PowerEdge R740"
            />
          </Field>

          <Field label="Serial Number" required error={showError('serialNumber')} htmlFor="f-serial">
            <input
              id="f-serial"
              className={cn(inputCls, 'font-mono', showError('serialNumber') && 'border-health-critical focus:ring-red-500/30')}
              value={form.serialNumber}
              onChange={(e) => set('serialNumber', e.target.value)}
              placeholder="e.g. SN-48210-A"
            />
          </Field>
        </div>
      </FormSection>

      {/* Classification */}
      <FormSection title="Classification" description="Pick an asset class to capture its class-specific attributes.">
        <Field label="Asset Class" htmlFor="f-class">
          <select
            id="f-class"
            className={inputCls}
            value={form.taxonomyClassId}
            onChange={(e) => set('taxonomyClassId', e.target.value)}
          >
            <option value="">No class selected</option>
            {allAssetClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </Field>

        {selectedClass ? (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4 border-t border-slate-200 pt-5">
            {selectedClass.attributes.map((attr) => (
              <AttributeField
                key={attr.key}
                attr={attr}
                value={form.attributes[attr.key]}
                onChange={(v) => setForm((f) => ({ ...f, attributes: { ...f.attributes, [attr.key]: v } }))}
              />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">Select a class above to reveal its attribute fields.</p>
        )}
      </FormSection>

      {/* Assignment */}
      <FormSection title="Assignment" description="Who owns it and where it lives.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
          <Field label="Custodian" htmlFor="f-custodian">
            <input
              id="f-custodian"
              className={inputCls}
              value={form.custodian}
              onChange={(e) => set('custodian', e.target.value)}
              placeholder="e.g. Jordan Blake"
            />
          </Field>

          <Field label="Criticality" htmlFor="f-criticality">
            <select
              id="f-criticality"
              className={inputCls}
              value={form.criticality}
              onChange={(e) => set('criticality', e.target.value as Criticality)}
            >
              {CRITICALITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Location Name" htmlFor="f-locname">
            <input
              id="f-locname"
              className={inputCls}
              value={form.locationName}
              onChange={(e) => set('locationName', e.target.value)}
              placeholder="e.g. North Distribution Center"
            />
          </Field>

          <Field label="Building" htmlFor="f-building">
            <input
              id="f-building"
              className={inputCls}
              value={form.building}
              onChange={(e) => set('building', e.target.value)}
              placeholder="e.g. Building A"
            />
          </Field>

          <Field label="Zone" htmlFor="f-zone">
            <input
              id="f-zone"
              className={inputCls}
              value={form.zone}
              onChange={(e) => set('zone', e.target.value)}
              placeholder="e.g. Zone 3 — Loading Dock"
            />
          </Field>
        </div>
      </FormSection>

      {/* Financials */}
      <FormSection title="Financials" description="Purchase and warranty details.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-4">
          <Field label="Purchase Price (₹)" htmlFor="f-price">
            <input
              id="f-price"
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={form.purchasePrice}
              onChange={(e) => set('purchasePrice', e.target.value)}
              placeholder="0"
            />
          </Field>

          <Field label="Purchase Date" htmlFor="f-pdate">
            <input
              id="f-pdate"
              type="date"
              className={inputCls}
              value={form.purchaseDate}
              onChange={(e) => set('purchaseDate', e.target.value)}
            />
          </Field>

          <Field label="Warranty Expiry" htmlFor="f-warranty">
            <input
              id="f-warranty"
              type="date"
              className={inputCls}
              value={form.warrantyExpiry}
              onChange={(e) => set('warrantyExpiry', e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      {/* Tags */}
      <FormSection title="Tags" description="Comma-separated labels for search and grouping.">
        <Field label="Add Tags" htmlFor="f-tags">
          <input
            id="f-tags"
            className={inputCls}
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                commitTags(tagDraft);
              }
            }}
            onBlur={() => tagDraft.trim() && commitTags(tagDraft)}
            placeholder="Type a tag and press Enter or comma…"
          />
        </Field>
        {form.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {form.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-primary-400 hover:text-primary-700"
                  aria-label={`Remove ${tag}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </FormSection>

      {/* Footer / actions */}
      <div className="sticky bottom-0 -mx-1 flex flex-col-reverse items-stretch gap-3 border-t border-slate-200 bg-white/80 px-1 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-slate-500">
          {dirty ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          ) : (
            <span className="text-slate-400">No changes yet</span>
          )}
          {touched && !isValid && (
            <span className="ml-3 text-health-critical">Fix the highlighted fields to continue.</span>
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Link to={cancelHref}>
            <Button type="button" variant="outline" disabled={saving}>
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={saving || (touched && !isValid)}>
            {saving ? 'Saving…' : mode === 'create' ? 'Create Asset' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </form>
  );
}
