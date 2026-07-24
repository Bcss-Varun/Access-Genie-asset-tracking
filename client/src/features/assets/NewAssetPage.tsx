import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ASSET_CATEGORIES, CRITICALITIES, TRACKING_TECHS } from '@access-genie/shared';
import { PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { cn } from '@/lib/format';
import { assetsApi } from './assets-api';

interface FormState {
  name: string;
  category: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  custodian: string;
  purchaseDate: string;
  purchasePrice: string;
  criticality: string;
  healthScore: string;
  locationName: string;
  locationBuilding: string;
  locationZone: string;
  trackingTech: string;
  trackingId: string;
  tags: string;
}

const INITIAL: FormState = {
  name: '',
  category: 'Compute',
  serialNumber: '',
  manufacturer: '',
  model: '',
  custodian: '',
  purchaseDate: new Date().toISOString().slice(0, 10),
  purchasePrice: '',
  criticality: 'Medium',
  healthScore: '100',
  locationName: 'Hyderabad Central Warehouse',
  locationBuilding: '',
  locationZone: '',
  trackingTech: '',
  trackingId: '',
  tags: '',
};

export function NewAssetPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(INITIAL);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const mutation = useMutation({
    mutationFn: assetsApi.create,
    onSuccess: async (asset) => {
      // The registry list and its counters are both stale now.
      await queryClient.invalidateQueries({ queryKey: ['assets'] });
      navigate(`/assets/${asset.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError) {
        // Server-side field errors map onto the same inputs the user just filled.
        setFieldErrors(error.fieldErrors);
        setFormError(Object.keys(error.fieldErrors).length ? 'Check the highlighted fields.' : error.message);
      } else {
        setFormError('Could not register the asset.');
      }
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    mutation.mutate({
      name: form.name.trim(),
      category: form.category,
      serialNumber: form.serialNumber.trim(),
      healthScore: Number(form.healthScore) || 100,
      custodian: form.custodian.trim(),
      purchaseDate: new Date(form.purchaseDate).toISOString(),
      purchasePrice: Number(form.purchasePrice) || 0,
      criticality: form.criticality,
      location: {
        // A location ID is required by the contract; derive a stable slug from
        // the facility name until the scope picker lands.
        id: `LOC-${form.locationName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 24)}`,
        name: form.locationName.trim(),
        ...(form.locationBuilding.trim() ? { building: form.locationBuilding.trim() } : {}),
        ...(form.locationZone.trim() ? { zone: form.locationZone.trim() } : {}),
      },
      ...(form.manufacturer.trim() ? { manufacturer: form.manufacturer.trim() } : {}),
      ...(form.model.trim() ? { model: form.model.trim() } : {}),
      ...(form.trackingTech ? { trackingTech: form.trackingTech } : {}),
      ...(form.trackingId.trim() ? { trackingId: form.trackingId.trim() } : {}),
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Register asset"
        subtitle="Create the record. Location, condition and tracking can all be refined later."
        breadcrumb={[{ label: 'Passport & Lifecycle' }, { label: 'IT Asset Registry', href: '/assets' }, { label: 'Register' }]}
      />

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Section title="Identity">
          <Input label="Asset name" required value={form.name} onChange={set('name')} error={fieldErrors.name} placeholder="Dell PowerEdge R760 Server" />
          <Select label="Category" value={form.category} onChange={set('category')} error={fieldErrors.category}>
            {ASSET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input label="Serial number" required value={form.serialNumber} onChange={set('serialNumber')} error={fieldErrors.serialNumber} placeholder="SVR-902-KX" />
          <Input label="Manufacturer" value={form.manufacturer} onChange={set('manufacturer')} error={fieldErrors.manufacturer} placeholder="Dell" />
          <Input label="Model" value={form.model} onChange={set('model')} error={fieldErrors.model} placeholder="PowerEdge R760" />
          <Input label="Tags" value={form.tags} onChange={set('tags')} hint="Comma separated" placeholder="RFID, Server" />
        </Section>

        <Section title="Ownership & value">
          <Input label="Custodian" required value={form.custodian} onChange={set('custodian')} error={fieldErrors.custodian} placeholder="IT Ops Team" />
          <Input label="Purchase date" type="date" required value={form.purchaseDate} onChange={set('purchaseDate')} error={fieldErrors.purchaseDate} />
          <Input label="Purchase price (₹)" type="number" min="0" required value={form.purchasePrice} onChange={set('purchasePrice')} error={fieldErrors.purchasePrice} placeholder="850000" />
          <Select label="Criticality" value={form.criticality} onChange={set('criticality')}>
            {CRITICALITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input label="Health score" type="number" min="0" max="100" value={form.healthScore} onChange={set('healthScore')} error={fieldErrors.healthScore} hint="0–100; the band is derived from it" />
        </Section>

        <Section title="Location">
          <Input label="Facility" required value={form.locationName} onChange={set('locationName')} error={fieldErrors['location.name']} />
          <Input label="Building" value={form.locationBuilding} onChange={set('locationBuilding')} placeholder="Building A" />
          <Input label="Zone" value={form.locationZone} onChange={set('locationZone')} placeholder="Rack 42" />
        </Section>

        <Section title="Tracking">
          <Select label="Tracking technology" value={form.trackingTech} onChange={set('trackingTech')}>
            <option value="">Not tracked yet</option>
            {TRACKING_TECHS.map((tech) => (
              <option key={tech} value={tech}>
                {tech}
              </option>
            ))}
          </Select>
          <Input label="Tag ID" value={form.trackingId} onChange={set('trackingId')} error={fieldErrors.trackingId} hint="RFID EPC, BLE MAC, QR payload or UWB anchor" placeholder="RFID-E28011606015" />
        </Section>

        {formError && (
          <p role="alert" className="text-sm text-health-critical bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {formError}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Registering…' : 'Register asset'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/assets')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass-panel p-5">
      <h2 className="font-heading text-sm font-semibold text-slate-800 mb-4">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
}

function Input({
  label,
  error,
  hint,
  ...props
}: FieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {props.required && <span className="text-health-critical ml-0.5">*</span>}
      </label>
      <input
        id={id}
        {...props}
        aria-invalid={Boolean(error)}
        className={cn(
          'w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2',
          error ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-300 focus:border-primary-500 focus:ring-primary-100',
        )}
      />
      {error ? (
        <p className="text-[11px] text-health-critical mt-1">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-slate-400 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

function Select({
  label,
  error,
  children,
  ...props
}: FieldProps & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = `field-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
      </label>
      <select
        id={id}
        {...props}
        className={cn(
          'w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2',
          error ? 'border-red-300 focus:ring-red-100' : 'border-slate-300 focus:border-primary-500 focus:ring-primary-100',
        )}
      >
        {children}
      </select>
      {error && <p className="text-[11px] text-health-critical mt-1">{error}</p>}
    </div>
  );
}
