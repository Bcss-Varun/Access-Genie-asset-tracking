import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ACTIVE_WORK_ORDER_SOURCES,
  ACTIVE_WORK_ORDER_TYPES,
  WORK_ORDER_PRIORITIES,
  type ActiveWorkOrderSource,
  type ActiveWorkOrderType,
  type WorkOrderPriority,
} from '@access-genie/shared';
import { maintenanceApi, useRefreshWorkOrders, useWorkOrderFacets } from '@/api/work-orders';
import { ApiRequestError } from '@/api/client';
import { useMutate } from '@/api/mutate';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { AssetPicker } from '@/components/ui/AssetPicker';
import { useToast } from '@/components/providers/ToastProvider';
import { allAssets } from '@/lib/dataset';
import { categoryEmoji } from '@/lib/asset-categories';
import { cn } from '@/lib/utils';
import { PRIORITY_PILL, TYPE_EMOJI, formatDate, sourceLabel } from '@/components/maintenance/work-orders/tokens';

/**
 * Raise a work order.
 *
 * The record is created by the API and the screen shows what came back — the id
 * in the confirmation is the one the server minted, not one this page guessed.
 * That matters more than it sounds: the previous version announced a success
 * toast for a locally-built object, so the "created" order had an id belonging
 * to nothing and was gone on the next refresh.
 *
 * Only the active origins are offered — the ones the server will accept. The
 * parked ones (Incident, Service Request, Transfer / Deployment) are left out,
 * because listing them here would be a dropdown entry that produces a
 * validation error.
 */

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30';

const SOURCE_HINT: Record<ActiveWorkOrderSource, string> = {
  Manual: 'Somebody raised this job.',
  'Scheduled Maintenance': 'Preventive work, normally raised by a PM schedule falling due.',
  'Inspection Failure': 'Corrective work following a failed inspection.',
  // Normally raised by the Predictive Alerts board, which links the order back
  // to the alert. Raising one here is the manual equivalent, and loses that link.
  'Predictive Maintenance': 'Work ahead of a predicted failure — usually raised from a predictive alert.',
};

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-health-critical">*</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-health-critical">{error}</p> : hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/** `<input type="date">` speaks `YYYY-MM-DD`. */
function dateInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export default function NewWorkOrderPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { run, isPending } = useMutate();
  const refreshWorkOrders = useRefreshWorkOrders();
  const facets = useWorkOrderFacets();

  const [assetId, setAssetId] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ActiveWorkOrderType>('Corrective');
  const [source, setSource] = useState<ActiveWorkOrderSource>('Manual');
  const [priority, setPriority] = useState<WorkOrderPriority>('Medium');
  const [assignedTo, setAssignedTo] = useState('Unassigned');
  const [scheduledDate, setScheduledDate] = useState('');
  // Unscheduled work is still due: a week out is a real date the overdue queue
  // can use, rather than a work order with no deadline that ages invisibly.
  const [dueDate, setDueDate] = useState(dateInDays(7));
  const [estimatedHours, setEstimatedHours] = useState('1');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const asset = useMemo(() => allAssets.find((a) => a.id === assetId), [assetId]);

  // Mirrors the server's rules so the common mistakes are caught before a round
  // trip. The server still enforces all of them — this is a courtesy, not the
  // validation.
  const titleError = submitted && title.trim().length < 4 ? 'Give the work order a title of at least 4 characters.' : fieldErrors.title;
  const assetError = submitted && !asset ? 'Select the asset this work order is for.' : fieldErrors.assetId;
  const dateError =
    scheduledDate && dueDate && scheduledDate > dueDate ? 'The scheduled start cannot be after the due date.' : fieldErrors.scheduledDate;

  const canCreate = title.trim().length >= 4 && Boolean(asset) && Boolean(dueDate) && !dateError;

  async function handleCreate() {
    setSubmitted(true);
    setFieldErrors({});

    if (!canCreate) {
      toast({
        title: 'Check the form',
        description: 'A work order needs a title, an asset and a due date.',
        tone: 'error',
      });
      return;
    }

    try {
      // The id is the server's to mint — the counter behind it is what stops
      // two technicians filing WO-5027 at the same time.
      const created = await run(
        maintenanceApi.create({
          title: title.trim(),
          assetId: asset!.id,
          type,
          source,
          priority,
          assignedTo,
          scheduledDate: scheduledDate || null,
          dueDate,
          description: description.trim(),
          estimatedHours: Number(estimatedHours) || 1,
        }),
        { describe: 'create that work order', refresh: refreshWorkOrders },
      );

      if (!created) return;

      toast({
        title: `Work order ${created.id} created`,
        description: `${created.title} · ${created.priority} · ${sourceLabel(created.source)}`,
        tone: 'success',
      });
      // Straight to the record that was just written, so the confirmation can
      // be checked rather than taken on trust.
      navigate(`/maintenance/${created.id}`);
    } catch (error) {
      // `run` already reported it; this maps field-level detail onto the inputs.
      if (error instanceof ApiRequestError) setFieldErrors(error.fieldErrors);
    }
  }

  const assignees = facets.data?.technicians ?? [];

  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader
        title="New Work Order"
        subtitle="Open a maintenance request against an asset and route it to a technician."
        breadcrumb={[{ label: 'Automated Work Orders', href: '/maintenance' }, { label: 'New' }]}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/maintenance">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button onClick={() => void handleCreate()} disabled={isPending}>
              {isPending ? 'Creating…' : 'Create work order'}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT — the form */}
        <div className="glass-panel p-6 lg:col-span-2">
          <div className="space-y-5">
            {/* Committed by id, not by name: the server resolves the name, so a
                renamed asset does not leave stale text on the order. */}
            <AssetPicker
              value={assetId}
              onChange={setAssetId}
              required
              hint={assetError ?? 'The asset this work order is performed on. Its facility is read from the registry.'}
            />
            {assetError && <p className="-mt-3 text-xs text-health-critical">{assetError}</p>}

            <Field label="Title" htmlFor="wo-title" required error={titleError}>
              <input
                id="wo-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Replace worn drive belt"
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Source" htmlFor="wo-source" hint={SOURCE_HINT[source]}>
                <select
                  id="wo-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value as ActiveWorkOrderSource)}
                  className={inputCls}
                >
                  {ACTIVE_WORK_ORDER_SOURCES.map((option) => (
                    <option key={option} value={option}>
                      {sourceLabel(option)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Type" htmlFor="wo-type">
                <select
                  id="wo-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as ActiveWorkOrderType)}
                  className={inputCls}
                >
                  {ACTIVE_WORK_ORDER_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {TYPE_EMOJI[option]} {option}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Priority" htmlFor="wo-priority">
                <select
                  id="wo-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as WorkOrderPriority)}
                  className={inputCls}
                >
                  {WORK_ORDER_PRIORITIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Technician"
                htmlFor="wo-assignee"
                hint={assignees.length === 0 ? 'No roster yet — the job can be raised unassigned.' : 'Leave unassigned to send it to the dispatch queue.'}
              >
                <select
                  id="wo-assignee"
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className={inputCls}
                >
                  <option value="Unassigned">Unassigned</option>
                  {/* Historic names are filterable but not assignable — the
                      server refuses them, so they are not offered here. */}
                  {assignees
                    .filter((tech) => tech.kind !== 'historic')
                    .map((tech) => (
                      <option key={tech.name} value={tech.name}>
                        {tech.name}
                        {tech.kind === 'user' ? ' (user)' : ''}
                      </option>
                    ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Field label="Scheduled start" htmlFor="wo-scheduled" error={dateError} hint="Optional — when work is planned to begin.">
                <input
                  id="wo-scheduled"
                  type="date"
                  value={scheduledDate}
                  max={dueDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Due date" htmlFor="wo-due" required>
                <input
                  id="wo-due"
                  type="date"
                  value={dueDate}
                  min={scheduledDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Estimated hours" htmlFor="wo-hours">
                <input
                  id="wo-hours"
                  type="number"
                  min={0}
                  step={0.5}
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="wo-desc" hint="Optional — describe the fault, scope, or instructions.">
              <textarea
                id="wo-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="What needs to be done and why…"
                className={cn(inputCls, 'resize-none')}
              />
            </Field>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Link to="/maintenance">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button onClick={() => void handleCreate()} disabled={isPending}>
              {isPending ? 'Creating…' : 'Create work order'}
            </Button>
          </div>
        </div>

        {/* RIGHT — what will be written */}
        <div className="glass-panel h-fit p-6 lg:col-span-1">
          <h3 className="mb-4 font-heading text-base font-bold">Summary</h3>
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Title</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {title.trim() || <span className="text-slate-400">Untitled work order</span>}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Asset</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {asset ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span>{categoryEmoji(asset.category)}</span>
                    {asset.name}
                  </span>
                ) : (
                  <span className="text-slate-400">No asset selected</span>
                )}
              </div>
              {/* Facility is not asked for — the registry already owns it, and a
                  second, independently-typed copy is one that can disagree. */}
              {asset && <div className="mt-0.5 text-xs text-slate-400">{asset.location.name}</div>}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', PRIORITY_PILL[priority])}>{priority}</span>
              <Badge tone="slate">
                {TYPE_EMOJI[type]} {type}
              </Badge>
              <Badge tone="primary">New</Badge>
            </div>

            <dl className="space-y-2 border-t border-slate-200 pt-4 text-sm">
              {[
                ['Source', sourceLabel(source)],
                ['Technician', assignedTo],
                ['Scheduled', scheduledDate ? formatDate(scheduledDate) : '—'],
                ['Due', dueDate ? formatDate(dueDate) : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="truncate font-medium text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="mt-5 text-xs text-slate-400">
            The work order is written to the database and given an id by the server. You will be taken to it.
          </p>
        </div>
      </div>
    </div>
  );
}
