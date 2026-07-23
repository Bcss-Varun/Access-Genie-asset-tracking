'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { mockAssets, mockWorkOrders } from '@/lib/mock-data';
import type { WorkOrderPriority, WorkOrderType } from '@/types/asset';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

const TYPES: WorkOrderType[] = ['Preventive', 'Corrective', 'Predictive', 'Inspection'];
const PRIORITIES: WorkOrderPriority[] = ['Low', 'Medium', 'High', 'Critical'];

const typeEmoji = (t: WorkOrderType): string =>
  t === 'Preventive' ? '🛡️' : t === 'Corrective' ? '🔧' : t === 'Predictive' ? '📈' : '🔍';

const priorityTone = (p: WorkOrderPriority): 'slate' | 'primary' | 'amber' | 'red' =>
  p === 'Critical' ? 'red' : p === 'High' ? 'amber' : p === 'Medium' ? 'primary' : 'slate';

const categoryEmoji = (c: string): string =>
  c === 'Vehicles' ? '🚗'
    : c === 'IT' ? '💻'
      : c === 'Medical' ? '⚕️'
        : c === 'Heavy Machinery' ? '🏗️'
          : c === 'Facilities' ? '🏭'
            : c === 'Sensors' ? '📡'
              : '⚙️';

/** Unique, sorted list of technicians seen across the mock work orders. */
const ASSIGNEES = [
  'Unassigned',
  ...Array.from(new Set(mockWorkOrders.map((w) => w.assignedTo).filter((a) => a !== 'Unassigned'))).sort(),
];

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30';

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
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-health-critical ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-health-critical">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>
      )}
    </div>
  );
}

export default function NewWorkOrderPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [assetId, setAssetId] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<WorkOrderType>('Corrective');
  const [priority, setPriority] = useState<WorkOrderPriority>('Medium');
  const [assignee, setAssignee] = useState('Unassigned');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const asset = useMemo(() => mockAssets.find((a) => a.id === assetId), [assetId]);

  const titleError = submitted && title.trim().length === 0 ? 'A work order title is required.' : undefined;
  const assetError = submitted && !asset ? 'Select the asset this work order is for.' : undefined;
  const canCreate = title.trim().length > 0 && !!asset;

  function handleCreate() {
    setSubmitted(true);
    if (!canCreate) {
      toast({
        title: 'Missing required fields',
        description: 'Give the work order a title and pick an asset.',
        tone: 'error',
      });
      return;
    }
    const newId = `WO-${5013 + mockWorkOrders.length}`;
    toast({
      title: `Work order ${newId} created`,
      description: `${title.trim()} · ${priority} · ${type}`,
      tone: 'success',
    });
    router.push('/maintenance');
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="New Work Order"
        subtitle="Open a maintenance request against an asset and route it to a technician."
        breadcrumb={[{ label: 'Maintenance', href: '/maintenance' }, { label: 'New' }]}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/maintenance">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button onClick={handleCreate} disabled={submitted && !canCreate}>
              Create work order
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — the form */}
        <div className="glass-panel rounded-xl p-6 lg:col-span-2">
          <div className="space-y-5">
            {/* Asset picker */}
            <Field
              label="Asset"
              htmlFor="wo-asset"
              required
              error={assetError}
              hint="The asset this work order is performed on."
            >
              <select
                id="wo-asset"
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className={cn(inputCls, !assetId && 'text-slate-400')}
              >
                <option value="">Select an asset…</option>
                {mockAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {categoryEmoji(a.category)} {a.name} — {a.id}
                  </option>
                ))}
              </select>
            </Field>

            {/* Title */}
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

            {/* Type + Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Type" htmlFor="wo-type">
                <select
                  id="wo-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as WorkOrderType)}
                  className={inputCls}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {typeEmoji(t)} {t}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Priority" htmlFor="wo-priority">
                <select
                  id="wo-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as WorkOrderPriority)}
                  className={inputCls}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Assignee + Due date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Assignee" htmlFor="wo-assignee">
                <select
                  id="wo-assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className={inputCls}
                >
                  {ASSIGNEES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Due date" htmlFor="wo-due">
                <input
                  id="wo-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            {/* Description */}
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
            <Link href="/maintenance">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button onClick={handleCreate} disabled={submitted && !canCreate}>
              Create work order
            </Button>
          </div>
        </div>

        {/* RIGHT — live summary */}
        <div className="glass-panel rounded-xl p-6 lg:col-span-1 h-fit">
          <h3 className="font-heading font-bold text-base mb-4">Summary</h3>
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
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={priorityTone(priority)}>{priority}</Badge>
              <Badge tone="slate">
                {typeEmoji(type)} {type}
              </Badge>
              <Badge tone="primary">New</Badge>
            </div>
            <div className="pt-4 border-t border-slate-200 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Assignee</span>
                <span className="font-medium text-slate-800">{assignee}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Due</span>
                <span className="font-medium text-slate-800">{dueDate || '—'}</span>
              </div>
            </div>
          </div>
          <p className="mt-5 text-xs text-slate-400">
            This is a demo — the work order is announced via a toast and you are returned to the board.
          </p>
        </div>
      </div>
    </div>
  );
}
