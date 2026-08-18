import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { InspectionTemplate } from '@access-genie/shared';
import {
  inspectionsApi,
  useInspectionFacets,
  useInspectionTemplates,
  useRefreshInspections,
  useTemplateAssets,
} from '@/api/inspections';
import { ApiRequestError } from '@/api/client';
import { useMutate } from '@/api/mutate';
import { FormDialog, Field, FieldGroup, Select, TextInput } from '@/components/ui/FormDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';
import { dateInDays } from './tokens';

/**
 * Schedule a template against one asset or many.
 *
 * The asset list is the template's own scope, resolved by the server
 * (`/inspection-templates/:id/assets`) rather than re-derived here — scope
 * matching is a union of three rules, and a second implementation in the
 * browser would be a second thing to keep in step.
 *
 * Selecting several assets creates one inspection each, because an inspection
 * records the condition of *a thing*: one record covering twelve assets cannot
 * say which of them failed.
 */
export function ScheduleDialog({ template, onClose }: { template?: InspectionTemplate; onClose: () => void }) {
  const navigate = useNavigate();
  const { run, isPending } = useMutate();
  const refresh = useRefreshInspections();
  const { toast } = useToast();
  const facets = useInspectionFacets();

  // Only active templates can be scheduled — the server refuses retired ones,
  // so offering them here would be a dropdown entry that always errors.
  const templates = useInspectionTemplates({ active: 'true' });
  const [templateId, setTemplateId] = useState(template?.id ?? '');
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [scheduledFor, setScheduledFor] = useState(dateInDays(7));
  const [assignedTo, setAssignedTo] = useState('Unassigned');
  const [error, setError] = useState<string | null>(null);

  const assets = useTemplateAssets(templateId || undefined);

  // Changing the template invalidates the selection: the new one's scope may
  // not contain the assets that were ticked.
  useEffect(() => setAssetIds([]), [templateId]);

  const available = assets.data ?? [];
  const chosen = templates.data?.items.find((t) => t.id === templateId);
  const valid = Boolean(templateId) && assetIds.length > 0 && Boolean(scheduledFor);

  async function submit() {
    setError(null);
    if (!valid) {
      setError('Pick a template, at least one asset, and a date.');
      return;
    }

    try {
      if (assetIds.length === 1) {
        const created = await run(
          inspectionsApi.schedule({ templateId, assetId: assetIds[0] as string, scheduledFor, assignedTo }),
          { describe: 'schedule that inspection', refresh },
        );
        if (!created) return;
        toast({ title: `${created.id} scheduled`, description: created.title, tone: 'success' });
        onClose();
        // Straight to the record, so the confirmation can be checked rather
        // than taken on trust.
        navigate(`/inspections/${created.id}`);
        return;
      }

      const result = await run(inspectionsApi.scheduleBulk({ templateId, assetIds, scheduledFor, assignedTo }), {
        describe: 'schedule those inspections',
        refresh,
      });
      if (!result) return;

      toast({
        title: `${result.created.length} inspection${result.created.length === 1 ? '' : 's'} scheduled`,
        // A partial batch says so rather than reporting a clean success — the
        // assets that did not take are the ones somebody needs to look at.
        description:
          result.failed.length > 0
            ? `${result.failed.length} could not be scheduled: ${result.failed.map((f) => f.assetId).join(', ')}`
            : chosen?.name,
        tone: result.failed.length > 0 ? 'error' : 'success',
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'The request failed.');
    }
  }

  return (
    <FormDialog
      icon="🗓️"
      title="Schedule an inspection"
      description="The template's checklist is copied onto each record when it is created, so it is answerable straight away."
      submitLabel={assetIds.length > 1 ? `Schedule ${assetIds.length} inspections` : 'Schedule inspection'}
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
      width="lg"
    >
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <Field label="Template" required>
        {templates.isLoading ? (
          <p className="text-xs text-slate-400">Loading templates…</p>
        ) : (templates.data?.items.length ?? 0) === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            There are no active templates yet. Build one in the Templates view first — an inspection is an execution of a
            template, so it cannot exist without one.
          </p>
        ) : (
          <Select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            options={[
              { value: '', label: 'Select a template…' },
              ...(templates.data?.items ?? []).map((t) => ({
                value: t.id,
                label: `${t.icon} ${t.name} — ${t.checkpoints.length} check${t.checkpoints.length === 1 ? '' : 's'}`,
              })),
            ]}
          />
        )}
      </Field>

      {templateId && (
        <FieldGroup
          label="Assets"
          required
          hint={
            available.length === 0
              ? undefined
              : `${assetIds.length} of ${available.length} selected — one inspection is created per asset.`
          }
        >
          {assets.isLoading ? (
            <p className="text-xs text-slate-400">Resolving the template's scope…</p>
          ) : available.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              This template's scope matches no assets. Widen its categories or facilities, or register the assets it is
              meant for.
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-3 text-[11px]">
                <button
                  type="button"
                  onClick={() => setAssetIds(available.map((a) => a.id))}
                  className="font-medium text-primary-600 hover:text-primary-700"
                >
                  Select all
                </button>
                {assetIds.length > 0 && (
                  <button type="button" onClick={() => setAssetIds([])} className="text-slate-400 hover:text-slate-700">
                    Clear
                  </button>
                )}
              </div>
              <ul className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {available.map((asset) => {
                  const on = assetIds.includes(asset.id);
                  return (
                    <li key={asset.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                          on ? 'bg-primary-50' : 'hover:bg-slate-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setAssetIds((ids) => (on ? ids.filter((x) => x !== asset.id) : [...ids, asset.id]))}
                          className="h-4 w-4 rounded border-slate-300 accent-primary-600"
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{asset.name}</span>
                        <span className="shrink-0 text-[10px] text-slate-400">{asset.location}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </FieldGroup>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Scheduled for" required>
          <TextInput type="date" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        </Field>
        <Field label="Assign to" hint="Leave unassigned to send it to the field queue.">
          <Select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            options={[
              { value: 'Unassigned', label: 'Unassigned' },
              // Historic names are filterable but not assignable — the server
              // refuses them, so they are not offered.
              ...(facets.data?.assignees ?? [])
                .filter((a) => a.kind !== 'historic')
                .map((a) => ({ value: a.name, label: a.kind === 'user' ? `${a.name} (user)` : a.name })),
            ]}
          />
        </Field>
      </div>
    </FormDialog>
  );
}
