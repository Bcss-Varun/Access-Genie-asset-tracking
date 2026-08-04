import { useState } from 'react';
import type { Team } from '@access-genie/shared';
import { FormDialog, Field, FieldRow, Select, TextArea, TextInput } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { teamsApi } from '@/api/platform';
import { allUsers, roles } from '@/lib/rbac';

/**
 * A working group and its roster.
 *
 * Membership is picked from the directory rather than typed, because a team is
 * only useful if work can be routed to it — a name that matches nobody is a
 * dead end for every assignment that lands on it.
 */

const DEPARTMENTS = ['Operations', 'IT', 'Technology', 'Facilities', 'Finance', 'Risk & Compliance', 'Security'];
const EMOJI = ['👥', '🛠️', '🖥️', '🏢', '🔒', '📊', '🚚', '⚡'];

export function TeamDialog({ existing, onClose }: { existing?: Team; onClose: () => void }) {
  const { run, isPending } = useMutate();

  const [name, setName] = useState(existing?.name ?? '');
  const [department, setDepartment] = useState(existing?.department ?? 'Operations');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '👥');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(existing?.memberIds ?? []);
  const [extra, setExtra] = useState(String(existing?.extra ?? 0));

  const toggleMember = (id: string) =>
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  const submit = async () => {
    const body = {
      name: name.trim(),
      department,
      emoji,
      description: description.trim(),
      memberIds,
      extra: Number(extra) || 0,
    };
    const ok = await run(existing ? teamsApi.update(existing.id, body) : teamsApi.create(body), {
      success: existing ? 'Team updated' : `${name.trim()} created`,
      successDetail: `${memberIds.length} member${memberIds.length === 1 ? '' : 's'} in ${department}`,
      describe: existing ? 'save that team' : 'create that team',
    });
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon={emoji}
      title={existing ? `Edit ${existing.name}` : 'New team'}
      description="Teams group the people responsible for an area of the estate — work orders and approvals can be routed to one."
      submitLabel={existing ? 'Save' : 'Create team'}
      width="lg"
      busy={isPending}
      disabled={name.trim().length < 2}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Team name" required>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Field Maintenance" />
        </Field>
        <Field label="Department">
          <Select value={department} onChange={(e) => setDepartment(e.target.value)} options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} />
        </Field>
      </FieldRow>

      <Field label="Icon">
        <div className="flex flex-wrap gap-1.5">
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`rounded-lg border px-3 py-1.5 text-lg transition-colors ${
                emoji === e ? 'border-primary-300 bg-primary-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>

      <Field label="What this team owns">
        <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Preventive maintenance and corrective work across the Hyderabad campus." />
      </Field>

      <Field label={`Members — ${memberIds.length} selected`} hint="Only people with platform accounts appear here.">
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-3">
          {allUsers.length === 0 ? (
            <p className="text-sm text-slate-400">No users yet — add one under Administration ▸ Users.</p>
          ) : (
            allUsers.map((u) => (
              <label key={u.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={memberIds.includes(u.id)}
                  onChange={() => toggleMember(u.id)}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500/30"
                />
                <span className="font-medium">{u.name}</span>
                <span className="text-xs text-slate-400">{roles[u.roleId]?.name}</span>
              </label>
            ))
          )}
        </div>
      </Field>

      <Field
        label="Additional headcount"
        hint="People in this team who do not have a platform account — contractors, shared-service staff. Counted in the team size."
      >
        <TextInput type="number" min={0} value={extra} onChange={(e) => setExtra(e.target.value)} />
      </Field>
    </FormDialog>
  );
}
