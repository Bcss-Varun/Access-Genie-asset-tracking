import { useState } from 'react';
import type { WorkOrder } from '@access-genie/shared';
import { FormDialog, Field, Select } from '@/components/ui/FormDialog';
import { useWorkOrderFacets } from '@/api/work-orders';

/**
 * "Who is doing this?" — asked before an order moves to Assigned.
 *
 * The board's one-click advance used to move a card from New to Assigned with
 * nobody on it, which stored a job counted as dispatched that sat in no one's
 * queue. The server now refuses that move, so every control offering it asks
 * for the technician first, and the caller assigns (which advances a New order
 * by itself) instead of flipping the status.
 */
export function AssignDialog({
  workOrder,
  busy,
  onAssign,
  onCancel,
}: {
  workOrder: WorkOrder;
  busy: boolean;
  onAssign: (assignee: string) => void;
  onCancel: () => void;
}) {
  const facets = useWorkOrderFacets();
  // Historic names are filterable but not assignable — the server refuses them.
  const assignees = (facets.data?.technicians ?? []).filter((tech) => tech.kind !== 'historic');
  const [assignee, setAssignee] = useState('');

  return (
    <FormDialog
      icon="👤"
      title={`Assign ${workOrder.id}`}
      description={`${workOrder.title} — an order is Assigned once someone has it, so pick who.`}
      submitLabel="Assign"
      busy={busy}
      disabled={!assignee}
      onSubmit={() => onAssign(assignee)}
      onCancel={onCancel}
    >
      <Field label="Technician" required hint={assignees.length === 0 ? 'No one is on the roster yet.' : undefined}>
        <Select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          options={[
            { value: '', label: facets.isLoading ? 'Loading the roster…' : 'Choose a technician' },
            ...assignees.map((tech) => ({ value: tech.name, label: tech.kind === 'user' ? `${tech.name} (user)` : tech.name })),
          ]}
        />
      </Field>
    </FormDialog>
  );
}
