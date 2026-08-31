import { useState } from 'react';
import type { PublicUser } from '@access-genie/shared';
import { FormDialog, Field, TextInput } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { adminApi } from '@/api/users';

const WORDS = ['Falcon', 'Harbour', 'Lantern', 'Meadow', 'Quartz', 'Summit', 'Willow', 'Anchor'];

/** Long enough to satisfy the server's policy, and readable enough to dictate. */
function suggestPassword(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${word}${Math.floor(Math.random() * 9000) + 1000}!x`;
}

/**
 * Set a new password on someone's behalf — the "they forgot it" path.
 *
 * Not "reset via email": there is no mail server here, so an administrator sets
 * the new password directly and hands it over, the same as inviting a user.
 * Ends every session the account has open, which the dialog says up front
 * rather than leaving the administrator to discover it.
 */
export function ChangePasswordDialog({ user, onClose }: { user: PublicUser; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const [password, setPassword] = useState(suggestPassword);

  const valid = password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);

  const submit = async () => {
    const ok = await run(adminApi.setPassword(user.id, password), {
      success: `${user.name}'s password changed`,
      successDetail: 'Hand over the new password — they have been signed out everywhere.',
      describe: 'change that password',
    });
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="🔑"
      title={`Change ${user.name}'s password`}
      description="This signs them out of every open session immediately."
      submitLabel="Change password"
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field
        label="New password"
        required
        hint="At least 10 characters with an upper case letter, a lower case letter and a number."
      >
        <div className="flex gap-2">
          <TextInput autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          <button
            type="button"
            onClick={() => setPassword(suggestPassword())}
            className="shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Suggest
          </button>
        </div>
      </Field>
    </FormDialog>
  );
}
