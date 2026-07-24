'use client';

import { useState } from 'react';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5';

const passkeys = [
  { id: 'PK-1', name: 'MacBook Pro — Touch ID', added: '2026-05-02T10:00:00.000Z', kind: 'Platform authenticator' },
  { id: 'PK-2', name: 'iPhone 15 — Face ID', added: '2026-06-18T14:30:00.000Z', kind: 'Platform authenticator' },
  { id: 'PK-3', name: 'YubiKey 5C', added: '2026-01-11T09:15:00.000Z', kind: 'Security key' },
];

const sessions = [
  { id: 'S-1', device: 'Chrome · macOS', location: 'Hyderabad, IN', lastActive: '2026-07-23T08:52:00.000Z', current: true },
  { id: 'S-2', device: 'Safari · iOS', location: 'Hyderabad, IN', lastActive: '2026-07-23T06:20:00.000Z', current: false },
  { id: 'S-3', device: 'Edge · Windows', location: 'Bengaluru, IN', lastActive: '2026-07-22T21:05:00.000Z', current: false },
  { id: 'S-4', device: 'Firefox · Linux', location: 'Mumbai, IN', lastActive: '2026-07-20T13:40:00.000Z', current: false },
];

const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
const td = 'px-4 py-3.5';

export default function SecuritySettingsPage() {
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const onChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast({ title: 'Passwords do not match', description: 'Re-enter your new password.', tone: 'error' });
      return;
    }
    toast({ title: 'Password updated', description: 'Your password has been changed successfully.', tone: 'success' });
    setCurrent(''); setNext(''); setConfirm('');
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
        <form onSubmit={onChangePassword} className="glass-panel rounded-xl p-5 space-y-4">
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
            <Button type="submit" variant="primary">Update password</Button>
          </div>
        </form>

        {/* MFA card */}
        <div className="glass-panel rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-heading font-semibold text-slate-800">Multi-factor authentication</h3>
              <p className="text-sm text-slate-500 mt-1">An extra layer of security at sign-in.</p>
            </div>
            <Badge tone="emerald">✓ Enabled</Badge>
          </div>
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">Authenticator app</div>
                <div className="text-xs text-slate-400">TOTP · Google Authenticator</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => toast({ title: 'Manage MFA', description: 'Opening authenticator settings…', tone: 'info' })}>Manage</Button>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">Recovery codes</div>
                <div className="text-xs text-slate-400">8 unused codes remaining</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => toast({ title: 'Manage recovery codes', description: 'Generate or view your backup codes.', tone: 'info' })}>Manage</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Passkeys */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-heading font-semibold text-slate-800">Passkeys</h3>
          <Button variant="outline" size="sm" onClick={() => toast({ title: 'Add passkey', description: 'Follow your device prompt to register a passkey.', tone: 'info' })}>Add passkey</Button>
        </div>
        <div className="divide-y divide-slate-100">
          {passkeys.map((pk) => (
            <div key={pk.id} className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className="text-lg">🔑</span>
                <div>
                  <div className="text-sm font-medium text-slate-800">{pk.name}</div>
                  <div className="text-xs text-slate-400">{pk.kind} · added {relTime(pk.added)}</div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => toast({ title: 'Passkey removed', description: `${pk.name} was removed.`, tone: 'success' })}>Remove</Button>
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
                      <Button variant="ghost" size="sm" onClick={() => toast({ title: 'Session revoked', description: `Signed out ${s.device} (${s.location}).`, tone: 'success' })}>Revoke</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
