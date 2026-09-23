import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ModuleKey, RoleId } from '@access-genie/shared';
import { ROLE_IDS } from '@access-genie/shared';
import { FormDialog, Field, FieldRow, Select, TextInput } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { adminApi } from '@/api/users';
import { flattenScope, resolveModules, roles } from '@/lib/rbac';
import { ExtraModulesPicker } from '@/components/admin/ExtraModulesPicker';
import { useSession } from '@/components/providers/SessionProvider';

/**
 * Create an account.
 *
 * Called "Invite" on the button because that is what it is from the
 * administrator's side, but there is no mail server here and pretending an
 * email went out would leave someone waiting for it. So the account is created
 * with a starting password the administrator hands over, and the screen says
 * so plainly.
 */

/** Flatten the scope tree into a picker — a user's home can be at any depth. */
function scopeOptions(): { value: string; label: string }[] {
  return flattenScope().map(({ node, depth }) => ({
    value: node.id,
    label: `${'\u00a0\u00a0'.repeat(depth)}${node.name}`,
  }));
}

/** Long enough to satisfy the server's policy, and readable enough to dictate. */
function suggestPassword(): string {
  const words = ['Falcon', 'Harbour', 'Lantern', 'Meadow', 'Quartz', 'Summit', 'Willow', 'Anchor'];
  const word = words[Math.floor(Math.random() * words.length)];
  return `${word}${Math.floor(Math.random() * 9000) + 1000}!x`;
}

export function InviteUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const { run, isPending } = useMutate();
  const { session } = useSession();
  const { data: roleViews } = useQuery({ queryKey: ['roles'], queryFn: adminApi.roles });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [roleId, setRoleId] = useState<RoleId>('technician');
  const [homeScopeId, setHomeScopeId] = useState(scopeOptions()[0]?.value ?? 'ORG-1');
  const [password, setPassword] = useState(suggestPassword);
  const [extraModules, setExtraModules] = useState<ModuleKey[]>([]);

  // Switching roles can grant a module the extra list had picked by hand —
  // dropping it from the list rather than leaving a redundant, invisible grant.
  const roleModules = roleViews?.find((role) => role.id === roleId)?.modules ?? resolveModules(roleId);
  const effectiveExtra = extraModules.filter((m) => !roleModules.includes(m));

  const submit = async () => {
    const created = await run(
      adminApi.createUser({
        name: name.trim(),
        email: email.trim(),
        title: title.trim(),
        roleId,
        homeScopeId,
        password,
        extraModules: effectiveExtra,
      }),
      {
        success: `${name.trim()} can now sign in`,
        successDetail: `Give them the starting password — they can change it under Settings ▸ Security.`,
        describe: 'create that account',
      },
    );
    if (!created) return;
    onCreated?.();
    onClose();
  };

  const passwordValid = password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
  const valid = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && title.trim().length >= 2 && passwordValid;
  const assignableRoles = ROLE_IDS.filter((id) => session.role.id === 'super_admin' || id !== 'super_admin');

  return (
    <FormDialog
      icon="👤"
      title="Invite a user"
      description="Creates the account immediately. There is no mail server configured, so hand over the starting password yourself."
      submitLabel="Create account"
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Full name" required>
          <TextInput id="invite-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ananya Sharma" />
        </Field>
        <Field label="Email" required>
          <TextInput id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ananya@company.com" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Job title" required>
          <TextInput id="invite-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Facilities Technician" />
        </Field>
        <Field label="Role" hint={`Tier: ${roles[roleId]?.tier}`}>
          <Select
            id="invite-role"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value as RoleId)}
            options={assignableRoles.map((id) => ({ value: id, label: `${roles[id].name} · ${roles[id].tier}` }))}
          />
        </Field>
      </FieldRow>

      <Field label="Home scope" hint="Where they land by default, and what they see first.">
        <Select id="invite-scope" value={homeScopeId} onChange={(e) => setHomeScopeId(e.target.value)} options={scopeOptions()} />
      </Field>

      <ExtraModulesPicker roleModules={roleModules} value={effectiveExtra} onChange={setExtraModules} />

      <Field
        label="Starting password"
        required
        hint="At least 10 characters with an upper case letter, a lower case letter and a number."
      >
        <div className="flex gap-2">
          <TextInput id="invite-password" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!passwordValid} />
          <button
            type="button"
            onClick={() => setPassword(suggestPassword())}
            className="shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Suggest
          </button>
        </div>
        {!passwordValid && (
          <p className="mt-2 text-xs text-red-600" role="alert">
            Password needs 10 characters, including uppercase, lowercase and a number.
          </p>
        )}
      </Field>
    </FormDialog>
  );
}
