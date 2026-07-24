import { useState } from 'react';
import { PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

type Channel = 'email' | 'push' | 'inApp';

interface Category {
  id: string;
  label: string;
  description: string;
  defaults: Record<Channel, boolean>;
}

const CATEGORIES: Category[] = [
  { id: 'alerts', label: 'Critical alerts', description: 'Theft, tamper and geofence breaches.', defaults: { email: true, push: true, inApp: true } },
  { id: 'maintenance', label: 'Maintenance', description: 'Work orders, PM due dates and overdue tasks.', defaults: { email: true, push: false, inApp: true } },
  { id: 'inventory', label: 'Inventory', description: 'Low stock and reorder thresholds.', defaults: { email: true, push: false, inApp: true } },
  { id: 'ai', label: 'AI insights', description: 'Anomalies, forecasts and predictive findings.', defaults: { email: false, push: false, inApp: true } },
  { id: 'reports', label: 'Reports & digests', description: 'Scheduled report deliveries.', defaults: { email: true, push: false, inApp: false } },
  { id: 'mentions', label: 'Mentions & assignments', description: 'When someone @mentions or assigns you.', defaults: { email: true, push: true, inApp: true } },
];

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'push', label: 'Push' },
  { key: 'inApp', label: 'In-app' },
];

const DIGESTS = ['Real-time', 'Hourly summary', 'Daily digest', 'Weekly digest'];

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
        on ? 'bg-primary-600' : 'bg-slate-300',
      )}
    >
      <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform', on ? 'translate-x-[18px]' : 'translate-x-[2px]')} />
    </button>
  );
}

export default function NotificationSettingsPage() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Record<string, Record<Channel, boolean>>>(
    () => Object.fromEntries(CATEGORIES.map((c) => [c.id, { ...c.defaults }])),
  );
  const [digest, setDigest] = useState('Daily digest');

  const toggle = (catId: string, ch: Channel) =>
    setPrefs((prev) => ({ ...prev, [catId]: { ...prev[catId], [ch]: !prev[catId][ch] } }));

  const onSave = () => toast({ title: 'Preferences saved', description: 'Your notification settings have been updated.', tone: 'success' });

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Choose how and where Access Genie reaches you for each type of event."
        breadcrumb={[{ label: 'Settings', href: '/settings/profile' }, { label: 'Notifications' }]}
        actions={<Button variant="primary" onClick={onSave}>Save preferences</Button>}
      />

      <SettingsNav />

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500">Category</th>
                {CHANNELS.map((c) => (
                  <th key={c.key} className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-[11px] text-slate-500 w-24">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CATEGORIES.map((cat) => (
                <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-800">{cat.label}</div>
                    <div className="text-xs text-slate-400">{cat.description}</div>
                  </td>
                  {CHANNELS.map((c) => (
                    <td key={c.key} className="px-4 py-3.5 text-center">
                      <div className="flex justify-center">
                        <Toggle on={prefs[cat.id][c.key]} onClick={() => toggle(cat.id, c.key)} label={`${cat.label} — ${c.label}`} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-heading font-semibold text-slate-800">Email digest frequency</h3>
          <p className="text-sm text-slate-500 mt-0.5">Bundle non-critical email notifications into a single summary.</p>
        </div>
        <select
          value={digest}
          onChange={(e) => setDigest(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500 sm:w-56"
        >
          {DIGESTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
    </div>
  );
}
