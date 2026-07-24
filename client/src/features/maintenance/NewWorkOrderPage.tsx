import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WORK_ORDER_PRIORITIES, WORK_ORDER_TYPES } from '@access-genie/shared';
import { PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { assetsApi } from '@/features/assets/assets-api';
import { maintenanceApi } from './maintenance-api';

export function NewWorkOrderPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    title: '',
    assetId: params.get('assetId') ?? '',
    priority: 'Medium',
    type: 'Corrective',
    assignedTo: '',
    dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    description: '',
    estimatedHours: '2',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // The asset picker needs the registry, but only its identity columns.
  const { data: assets } = useQuery({
    queryKey: ['assets', { limit: 200, sort: 'name' }],
    queryFn: () => assetsApi.list({ limit: 200, sort: 'name' }),
  });

  const mutation = useMutation({
    mutationFn: maintenanceApi.create,
    onSuccess: async (workOrder) => {
      await queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      navigate(`/maintenance/${workOrder.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError) {
        setFieldErrors(error.fieldErrors);
        setFormError(Object.keys(error.fieldErrors).length ? 'Check the highlighted fields.' : error.message);
      } else {
        setFormError('Could not raise the work order.');
      }
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    mutation.mutate({
      title: form.title.trim(),
      assetId: form.assetId,
      priority: form.priority,
      type: form.type,
      assignedTo: form.assignedTo.trim() || 'Unassigned',
      dueDate: new Date(form.dueDate).toISOString(),
      description: form.description.trim(),
      estimatedHours: Number(form.estimatedHours) || 1,
    });
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: e.target.value }));

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Raise work order"
        breadcrumb={[{ label: 'Predictive Maintenance' }, { label: 'Work Orders', href: '/maintenance' }, { label: 'New' }]}
      />

      <form onSubmit={handleSubmit} className="glass-panel p-5 space-y-4" noValidate>
        <div>
          <label htmlFor="wo-title" className="block text-sm font-medium text-slate-700 mb-1.5">
            Title <span className="text-health-critical">*</span>
          </label>
          <input id="wo-title" required value={form.title} onChange={set('title')} className={inputClass} placeholder="Replace swollen battery pack" />
          {fieldErrors.title && <p className="text-[11px] text-health-critical mt-1">{fieldErrors.title}</p>}
        </div>

        <div>
          <label htmlFor="wo-asset" className="block text-sm font-medium text-slate-700 mb-1.5">
            Asset <span className="text-health-critical">*</span>
          </label>
          <select id="wo-asset" required value={form.assetId} onChange={set('assetId')} className={inputClass}>
            <option value="">Select an asset…</option>
            {assets?.items.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.id} — {asset.name}
              </option>
            ))}
          </select>
          {fieldErrors.assetId && <p className="text-[11px] text-health-critical mt-1">{fieldErrors.assetId}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="wo-priority" className="block text-sm font-medium text-slate-700 mb-1.5">
              Priority
            </label>
            <select id="wo-priority" value={form.priority} onChange={set('priority')} className={inputClass}>
              {WORK_ORDER_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="wo-type" className="block text-sm font-medium text-slate-700 mb-1.5">
              Type
            </label>
            <select id="wo-type" value={form.type} onChange={set('type')} className={inputClass}>
              {WORK_ORDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="wo-assignee" className="block text-sm font-medium text-slate-700 mb-1.5">
              Assign to
            </label>
            <input id="wo-assignee" value={form.assignedTo} onChange={set('assignedTo')} className={inputClass} placeholder="Deepak Nair" />
          </div>

          <div>
            <label htmlFor="wo-due" className="block text-sm font-medium text-slate-700 mb-1.5">
              Due date <span className="text-health-critical">*</span>
            </label>
            <input id="wo-due" type="date" required value={form.dueDate} onChange={set('dueDate')} className={inputClass} />
          </div>

          <div>
            <label htmlFor="wo-hours" className="block text-sm font-medium text-slate-700 mb-1.5">
              Estimated hours
            </label>
            <input id="wo-hours" type="number" step="0.5" min="0" value={form.estimatedHours} onChange={set('estimatedHours')} className={inputClass} />
          </div>
        </div>

        <div>
          <label htmlFor="wo-description" className="block text-sm font-medium text-slate-700 mb-1.5">
            Description
          </label>
          <textarea id="wo-description" rows={4} value={form.description} onChange={set('description')} className={inputClass} placeholder="What needs doing, and what does 'done' look like?" />
        </div>

        {formError && (
          <p role="alert" className="text-sm text-health-critical bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {formError}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Raising…' : 'Raise work order'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/maintenance')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
