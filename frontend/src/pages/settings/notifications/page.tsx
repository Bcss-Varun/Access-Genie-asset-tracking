import { useState } from 'react';
import { PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { useToast } from '@/components/providers/ToastProvider';
import { preferencesApi, usePreferenceMutation, usePreferences } from '@/api/preferences';
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
  const { data: stored } = usePreferences();
  const save = usePreferenceMutation(preferencesApi.update);

  /**
   * Stored choices layered over the per-category defaults.
   *
   * A category the user has never touched falls back to its default rather
   * than to "off" — an absent key means "not chosen", not "silence me".
   */
  const [prefs, setPrefs] = useState<Record<string, Record<Channel, boolean>> | null>(null);
  const [digestChoice, setDigestChoice] = useState<string | null>(null);

  const effective =
    prefs ??
    Object.fromEntries(CATEGORIES.map((c) => [c.id, { ...c.defaults, ...(stored?.notifications?.[c.id] ?? {}) }]));
  const digest = digestChoice ?? stored?.digest ?? 'Daily digest';
  const dirty = prefs !== null || digestChoice !== null;

  const toggle = (catId: string, ch: Channel) =>
    setPrefs({ ...effective, [catId]: { ...(effective[catId] as Record<Channel, boolean>), [ch]: !effective[catId]?.[ch] } });

  const setDigest = (value: string) => setDigestChoice(value);

  const onSave = () => {
    save.mutate([{ notifications: effective as Record<string, { email: boolean; push: boolean; inApp: boolean }>, digest }], {
      onSuccess: () => {
        // Cleared so the fields go back to reading the stored values, which are
        // now the ones just written.
        setPrefs(null);
        setDigestChoice(null);
        toast({ title: 'Preferences saved', description: 'Applied to every device you sign in on.', tone: 'success' });
      },
      onError: () =>
        toast({ title: 'Could not save preferences', description: 'The request failed. Please try again.', tone: 'error' }),
    });
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Choose how and where Access Genie reaches you for each type of event."
        breadcrumb={[{ label: 'Settings', href: '/settings/profile' }, { label: 'Notifications' }]}
        actions={
          <Button variant="primary" disabled={save.isPending || !dirty} onClick={onSave}>
            {save.isPending ? 'Saving…' : dirty ? 'Save preferences' : 'Saved'}
          </Button>
        }
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
                        <Toggle
                          on={effective[cat.id]?.[c.key] ?? false}
                          onClick={() => toggle(cat.id, c.key)}
                          label={`${cat.label} — ${c.label}`}
                        />
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
