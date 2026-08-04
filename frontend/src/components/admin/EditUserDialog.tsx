import { useState } from 'react';
import type { PublicUser, RoleId } from '@access-genie/shared';
import { ROLE_IDS } from '@access-genie/shared';
import { FormDialog, Field, FieldRow, Select, TextInput } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { adminApi } from '@/api/users';
import { flattenScope, roles } from '@/lib/rbac';
import { useSession } from '@/components/providers/SessionProvider';

/**
 * Change someone's role, title or standing.
 *
 * The server refuses to let you change your own role or suspend yourself, and
 * that refusal is mirrored here so the fields are visibly disabled rather than
 * accepting input that will be rejected on submit.
 *
 * Both actions end every session the user has open. That is the point — a role
 * revoked at 4pm should not last until their token expires — so the dialog says
 * it before you press the button.
 */
export function EditUserDialog({ user, onClose }: { user: PublicUser; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const { session } = useSession();

  const isSelf = session.user.id === user.id;

  const [name, setName] = useState(user.name);
  const [title, setTitle] = useState(user.title);
  const [roleId, setRoleId] = useState<RoleId>(user.roleId);
  const [homeScopeId, setHomeScopeId] = useState(user.homeScopeId);
  const [status, setStatus] = useState<'active' | 'suspended'>(user.status);

  const roleChanged = roleId !== user.roleId;
  const suspending = status === 'suspended' && user.status !== 'suspended';

  const submit = async () => {
    const ok = await run(
      adminApi.updateUser(user.id, { name: name.trim(), title: title.trim(), roleId, homeScopeId, status }),
      {
        success: `${name.trim()} updated`,
        successDetail:
          roleChanged || suspending ? 'Their open sessions have been signed out.' : undefined,
        describe: 'save those changes',
      },
    );
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="✏️"
      title={`Edit ${user.name}`}
      description={user.email}
      busy={isPending}
      disabled={name.trim().length < 2 || title.trim().length < 2}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Full name" required>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Job title" required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field
          label="Role"
          hint={isSelf ? 'You cannot change your own role.' : `Tier: ${roles[roleId]?.tier}`}
        >
          <Select
            value={roleId}
            disabled={isSelf}
            onChange={(e) => setRoleId(e.target.value as RoleId)}
            options={ROLE_IDS.map((id) => ({ value: id, label: `${roles[id].name} · ${roles[id].tier}` }))}
          />
        </Field>
        <Field label="Status" hint={isSelf ? 'You cannot suspend your own account.' : undefined}>
          <Select
            value={status}
            disabled={isSelf}
            onChange={(e) => setStatus(e.target.value as 'active' | 'suspended')}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended — cannot sign in' },
            ]}
          />
        </Field>
      </FieldRow>

      <Field label="Home scope">
        <Select
          value={homeScopeId}
          onChange={(e) => setHomeScopeId(e.target.value)}
          options={flattenScope().map(({ node, depth }) => ({
            value: node.id,
            label: `${'  '.repeat(depth)}${node.name}`,
          }))}
        />
      </Field>

      {(roleChanged || suspending) && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {suspending
            ? 'Suspending signs them out everywhere and blocks sign-in until reactivated.'
            : 'A role change signs them out everywhere, so the new permissions take effect immediately.'}
        </p>
      )}
    </FormDialog>
  );
}
