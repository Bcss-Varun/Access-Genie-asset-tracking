import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Passkey } from '@access-genie/shared';
import { authApi } from '@/api/auth-endpoints';
import { useMutate } from '@/api/mutate';
import { passkeysApi } from '@/api/configuration';
import { allPasskeys } from '@/lib/dataset';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormDialog, Field, TextInput } from '@/components/ui/FormDialog';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { useToast } from '@/components/providers/ToastProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { MfaSetupDialog, MfaDisableDialog, RecoveryCodesDialog } from '@/components/settings/MfaDialogs';
import { relTime } from '@/lib/utils';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5';

const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
const td = 'px-4 py-3.5';

export default function SecuritySettingsPage() {
  const { run, isPending } = useMutate();
  const { toast } = useToast();
  const { refresh } = useSession();

  // The live refresh tokens issued to this account — revoking one really ends it.
  const { data: sessions = [], refetch } = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: authApi.sessions,
    staleTime: 30_000,
  });

  // MFA state comes from the server, not from a hard-coded "✓ Enabled" badge —
  // which is what this card used to show whether or not anything was enrolled.
  const { data: mfa, refetch: refetchMfa } = useQuery({
    queryKey: ['auth', 'mfa'],
    queryFn: authApi.mfaStatus,
    staleTime: 30_000,
  });

  const passkeys = allPasskeys;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [dialog, setDialog] = useState<'enable-mfa' | 'disable-mfa' | 'recovery' | 'add-passkey' | null>(null);
  const [removingPasskey, setRemovingPasskey] = useState<Passkey | null>(null);
  const [passkeyName, setPasskeyName] = useState('');

  const afterMfaChange = async () => {
    setDialog(null);
    await refetchMfa();
    // `mfaEnabled` rides on the session's user, so the shell has to re-read it.
    await refresh();
  };

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast({ title: 'Passwords do not match', description: 'Re-enter your new password.', tone: 'error' });
      return;
    }

    const ok = await run(authApi.changePassword(current, next), {
      success: 'Password updated',
      successDetail: 'Other devices stay signed in — revoke them below if that is not what you want.',
      describe: 'change your password',
    });
    if (!ok) return;

    setCurrent('');
    setNext('');
    setConfirm('');
  };

  const addPasskey = async () => {
    const ok = await run(passkeysApi.create({ name: passkeyName.trim() || 'This device' }), {
      success: 'Authenticator registered',
      describe: 'register that authenticator',
    });
    if (!ok) return;
    setPasskeyName('');
    setDialog(null);
  };

  const removePasskey = async () => {
    if (!removingPasskey) return;
    await run(passkeysApi.remove(removingPasskey.id), {
      success: 'Removed',
      successDetail: `${removingPasskey.name} can no longer be used.`,
      describe: 'remove that authenticator',
    });
    setRemovingPasskey(null);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Security"
        subtitle="Protect your account with a strong password, MFA and passkeys."
        breadcrumb={[{ label: 'Settings', href: '/settings/profile' }, { label: 'Security' }]}
      />

      <SettingsNav />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Password change */}
        <form onSubmit={(e) => void onChangePassword(e)} className="glass-panel rounded-xl p-5 space-y-4">
          <h3 className="font-heading font-semibold text-slate-800">Change password</h3>
          <div>
            <label className={labelCls} htmlFor="cur-pw">Current password</label>
            <input id="cur-pw" type="password" autoComplete="current-password" className={inputCls} value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="••••••••" />
          </div>
          <div>
            <label className={labelCls} htmlFor="new-pw">New password</label>
            <input id="new-pw" type="password" autoComplete="new-password" className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 12 characters" />
          </div>
          <div>
            <label className={labelCls} htmlFor="cf-pw">Confirm new password</label>
            <input id="cf-pw" type="password" autoComplete="new-password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter new password" />
          </div>
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button type="submit" variant="primary" disabled={isPending || !current || next.length < 10 || !confirm}>
              {isPending ? 'Updating…' : 'Update password'}
            </Button>
          </div>
        </form>

        {/* MFA card */}
        <div className="glass-panel rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-heading font-semibold text-slate-800">Multi-factor authentication</h3>
              <p className="text-sm text-slate-500 mt-1">An extra layer of security at sign-in.</p>
            </div>
            <Badge tone={mfa?.mfaEnabled ? 'emerald' : 'slate'}>{mfa?.mfaEnabled ? '✓ Enabled' : 'Not enabled'}</Badge>
          </div>
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">Authenticator app</div>
                <div className="text-xs text-slate-400">
                  {mfa?.mfaEnabled
                    ? 'TOTP · required at every sign-in'
                    : 'Any authenticator app — 6-digit codes, 30-second period'}
                </div>
              </div>
              {mfa?.mfaEnabled ? (
                <Button variant="outline" size="sm" onClick={() => setDialog('disable-mfa')}>
                  Turn off
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => setDialog('enable-mfa')}>
                  Set up
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">Recovery codes</div>
                <div className="text-xs text-slate-400">
                  {mfa?.mfaEnabled
                    ? `${mfa.recoveryCodesRemaining} unused code${mfa.recoveryCodesRemaining === 1 ? '' : 's'} remaining`
                    : 'Issued when you turn on multi-factor authentication'}
                </div>
              </div>
              <Button variant="outline" size="sm" disabled={!mfa?.mfaEnabled} onClick={() => setDialog('recovery')}>
                Regenerate
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Passkeys */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div>
            <h3 className="font-heading font-semibold text-slate-800">Registered devices</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Devices you have named for this account. WebAuthn is not wired to a relying party here, so these are a
              record rather than a sign-in method — the second factor is the authenticator app above.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDialog('add-passkey')}>
            Register device
          </Button>
        </div>
        <div className="divide-y divide-slate-100">
          {passkeys.length === 0 && (
            <EmptyState icon="🔑" title="No devices registered" description="Name a device to keep track of where this account is used." />
          )}
          {passkeys.map((pk) => (
            <div key={pk.id} className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className="text-lg">🔑</span>
                <div>
                  <div className="text-sm font-medium text-slate-800">{pk.name}</div>
                  <div className="text-xs text-slate-400">{pk.kind} · added {relTime(pk.added)}</div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setRemovingPasskey(pk)}>Remove</Button>
            </div>
          ))}
        </div>
      </div>

      {/* Active sessions */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-heading font-semibold text-slate-800">Active sessions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className={th}>Device</th>
                <th className={th}>Location</th>
                <th className={th}>Last active</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className={td}>
                    <span className="font-medium text-slate-800">{s.device}</span>
                    {s.current && <Badge tone="primary" className="ml-2">This device</Badge>}
                  </td>
                  <td className={td + ' text-slate-600'}>{s.location}</td>
                  <td className={td + ' text-slate-500 whitespace-nowrap'}>{relTime(s.lastActive)}</td>
                  <td className={td + ' text-right'}>
                    {s.current ? (
                      <span className="text-xs text-slate-400">Current</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void run(authApi.revokeSession(s.id), {
                            success: 'Session revoked',
                            successDetail: `Signed out ${s.device} (${s.location}).`,
                            describe: 'revoke that session',
                          }).then(() => refetch())
                        }
                      >
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialog === 'enable-mfa' && <MfaSetupDialog onDone={() => void afterMfaChange()} onClose={() => setDialog(null)} />}
      {dialog === 'disable-mfa' && <MfaDisableDialog onDone={() => void afterMfaChange()} onClose={() => setDialog(null)} />}
      {dialog === 'recovery' && <RecoveryCodesDialog onDone={() => void afterMfaChange()} onClose={() => setDialog(null)} />}

      {dialog === 'add-passkey' && (
        <FormDialog
          icon="🔑"
          title="Register a device"
          description="A name you will recognise, so an unfamiliar entry stands out."
          submitLabel="Register"
          busy={isPending}
          onSubmit={() => void addPasskey()}
          onCancel={() => setDialog(null)}
        >
          <Field label="Device name" required>
            <TextInput
              autoFocus
              value={passkeyName}
              onChange={(e) => setPasskeyName(e.target.value)}
              placeholder="Work MacBook"
            />
          </Field>
        </FormDialog>
      )}

      {removingPasskey && (
        <ConfirmDialog
          title={`Remove ${removingPasskey.name}?`}
          description="The record goes. Your authenticator app and password are unaffected."
          confirmLabel="Remove"
          busy={isPending}
          onConfirm={() => void removePasskey()}
          onCancel={() => setRemovingPasskey(null)}
        />
      )}
    </div>
  );
}
