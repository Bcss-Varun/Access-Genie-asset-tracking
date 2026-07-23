'use client';

import { useState } from 'react';
import { PageHeader, Badge, Avatar } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { useSession } from '@/components/providers/SessionProvider';
import { useToast } from '@/components/providers/ToastProvider';

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
];

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-slate-50 disabled:text-slate-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5';

export default function ProfileSettingsPage() {
  const { session } = useSession();
  const { user, role } = session;
  const { toast } = useToast();

  const [name, setName] = useState(user.name);
  const [title, setTitle] = useState(user.title);
  const [phone, setPhone] = useState('+1 (415) 555-0148');
  const [timezone, setTimezone] = useState('America/Los_Angeles');

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast({ title: 'Profile saved', description: 'Your profile changes have been applied.', tone: 'success' });
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Profile"
        subtitle="Manage your personal information and how you appear across Access Genie."
        breadcrumb={[{ label: 'Settings', href: '/settings/profile' }, { label: 'Profile' }]}
      />

      <SettingsNav />

      {/* Identity card */}
      <div className="glass-panel rounded-xl p-5 flex items-center gap-4">
        <Avatar initials={user.initials} className="w-16 h-16 text-xl" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-heading font-semibold text-slate-900 truncate">{user.name}</h2>
            <Badge tone="primary">{role.name}</Badge>
          </div>
          <p className="text-sm text-slate-500 truncate">{user.email}</p>
          <p className="text-xs text-slate-400 mt-0.5">{user.id} · {role.tier}</p>
        </div>
      </div>

      {/* Editable form */}
      <form onSubmit={onSave} className="glass-panel rounded-xl p-5 space-y-5">
        <h3 className="font-heading font-semibold text-slate-800">Personal details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className={labelCls} htmlFor="pf-name">Full name</label>
            <input id="pf-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pf-email">Email</label>
            <input id="pf-email" className={inputCls} value={user.email} disabled />
            <p className="text-xs text-slate-400 mt-1">Managed by your organization — contact an admin to change.</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="pf-title">Job title</label>
            <input id="pf-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pf-phone">Phone</label>
            <input id="pf-phone" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pf-tz">Timezone</label>
            <select id="pf-tz" className={inputCls} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="pf-role">Role</label>
            <input id="pf-role" className={inputCls} value={role.name} disabled />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            onClick={() => { setName(user.name); setTitle(user.title); setPhone('+1 (415) 555-0148'); setTimezone('America/Los_Angeles'); }}
          >
            Reset
          </Button>
          <Button type="submit" variant="primary">Save changes</Button>
        </div>
      </form>
    </div>
  );
}
