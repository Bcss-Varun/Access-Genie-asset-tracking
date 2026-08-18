import { useState } from 'react';
import type { ActiveWorkOrderType, Asset, CustodyAction, WorkOrderPriority } from '@access-genie/shared';
import { ACTIVE_WORK_ORDER_TYPES, WORK_ORDER_PRIORITIES } from '@access-genie/shared';
import { FormDialog, Field, Select, TextArea, TextInput, dateInDays, optionsFrom } from '@/components/ui/FormDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { useRefreshDataset } from '@/api/dataset';
import { custodyApi } from '@/api/catalog';
import { maintenanceApi } from '@/api/work-orders';
import { allUsers } from '@/lib/rbac';

/**
 * Bulk Assignment and Bulk Maintenance (§4) — the two list-view bulk actions
 * that aren't a stage change (that one is `ChangeStageDialog` in bulk mode).
 * Both loop a per-asset write and report one summary toast rather than one
 * per asset — the same reasoning `bulkStageChange` documents server-side,
 * applied here because these two ride existing single-asset endpoints that
 * have no bulk form of their own.
 */

function useBulkRun() {
  const { toast } = useToast();
  const refreshDataset = useRefreshDataset();
  const [isPending, setIsPending] = useState(false);

  const run = async (assets: Asset[], describe: string, write: (a: Asset) => Promise<unknown>) => {
    setIsPending(true);
    let ok = 0;
    const failed: string[] = [];
    for (const a of assets) {
      try {
        await write(a);
        ok += 1;
      } catch {
        failed.push(a.id);
      }
    }
    await refreshDataset();
    setIsPending(false);
    toast({
      title: failed.length === 0 ? `${describe} — ${ok} assets` : `${describe} — ${ok} of ${assets.length}`,
      description: failed.length > 0 ? `Failed: ${failed.join(', ')}` : undefined,
      tone: failed.length === 0 ? 'success' : 'error',
    });
    return failed.length === 0;
  };

  return { run, isPending };
}

export function BulkAssignDialog({ assets, onClose, onDone }: { assets: Asset[]; onClose: () => void; onDone?: () => void }) {
  const { run, isPending } = useBulkRun();
  const [holder, setHolder] = useState(allUsers[0]?.name ?? '');
  const [note, setNote] = useState('');

  const submit = async () => {
    const ok = await run(assets, 'Bulk assignment', (a) =>
      custodyApi.record({ assetId: a.id, holder: holder.trim(), action: 'Assigned' as CustodyAction, note: note.trim() || undefined }),
    );
    if (ok) onDone?.();
    onClose();
  };

  return (
    <FormDialog
      icon="🤝"
      title={`Assign ${assets.length} assets`}
      description="Each asset's custody record is updated individually — an asset already with a custodian is reassigned to this holder."
      submitLabel="Assign"
      busy={isPending}
      disabled={holder.trim().length < 2}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="Assign to" required>
        <TextInput autoFocus value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Name" list="lifecycle-bulk-users" />
        <datalist id="lifecycle-bulk-users">
          {allUsers.map((u) => (
            <option key={u.id} value={u.name} />
          ))}
        </datalist>
      </Field>
      <Field label="Note" hint="Optional — kept on each asset's timeline.">
        <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

export function BulkMaintenanceDialog({ assets, onClose, onDone }: { assets: Asset[]; onClose: () => void; onDone?: () => void }) {
  const { run, isPending } = useBulkRun();
  const [title, setTitle] = useState('Scheduled inspection');
  const [type, setType] = useState<ActiveWorkOrderType>('Preventive');
  const [priority, setPriority] = useState<WorkOrderPriority>('Medium');
  const [assignedTo, setAssignedTo] = useState(allUsers[0]?.name ?? '');
  const [dueDate, setDueDate] = useState(dateInDays(7));

  const submit = async () => {
    const ok = await run(assets, 'Bulk maintenance', (a) =>
      maintenanceApi.create({
        title, assetId: a.id, type, priority, assignedTo, dueDate,
        // Raised by a person from the Lifecycle module, whatever the work is.
        source: 'Manual',
        description: `Raised in bulk from the Lifecycle module against ${assets.length} assets.`,
        estimatedHours: 1,
      }),
    );
    if (ok) onDone?.();
    onClose();
  };

  return (
    <FormDialog
      icon="🛠️"
      title={`Raise maintenance — ${assets.length} assets`}
      description="One work order is opened per asset. An asset already In Service moves to Maintenance automatically."
      submitLabel="Raise work orders"
      busy={isPending}
      disabled={title.trim().length < 4 || assignedTo.trim().length < 2}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="Title" required>
        <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as ActiveWorkOrderType)} options={optionsFrom(ACTIVE_WORK_ORDER_TYPES)} />
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as WorkOrderPriority)} options={optionsFrom(WORK_ORDER_PRIORITIES)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Assigned to">
          <TextInput value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
        </Field>
        <Field label="Due date">
          <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
    </FormDialog>
  );
}
