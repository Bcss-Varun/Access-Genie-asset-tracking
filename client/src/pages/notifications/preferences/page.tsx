import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

const CATEGORIES = ['Maintenance', 'AI Insights', 'Inventory', 'Compliance', 'IoT', 'Security'];
const CHANNELS = ['Email', 'SMS', 'Push', 'In-app'] as const;
type Channel = (typeof CHANNELS)[number];

// Deterministic default matrix.
const DEFAULTS: Record<string, Record<Channel, boolean>> = {
  Maintenance: { Email: true, SMS: false, Push: true, 'In-app': true },
  'AI Insights': { Email: true, SMS: false, Push: false, 'In-app': true },
  Inventory: { Email: false, SMS: false, Push: false, 'In-app': true },
  Compliance: { Email: true, SMS: true, Push: true, 'In-app': true },
  IoT: { Email: false, SMS: false, Push: true, 'In-app': true },
  Security: { Email: true, SMS: true, Push: true, 'In-app': true },
};

const DIGESTS = ['Real-time', 'Hourly digest', 'Daily digest', 'Weekly digest'];

export default function NotificationPreferencesPage() {
  const { toast } = useToast();
  const [matrix, setMatrix] = useState<Record<string, Record<Channel, boolean>>>(DEFAULTS);
  const [digest, setDigest] = useState('Real-time');
  const [quietHours, setQuietHours] = useState(true);
  const [quietFrom, setQuietFrom] = useState('22:00');
  const [quietTo, setQuietTo] = useState('07:00');

  function toggle(cat: string, ch: Channel) {
    setMatrix((prev) => ({ ...prev, [cat]: { ...prev[cat], [ch]: !prev[cat][ch] } }));
  }

  function save() {
    toast({ title: 'Preferences saved', description: 'Your notification settings have been updated.', tone: 'success' });
  }

  const inputClass =
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30';

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Notification Preferences"
        subtitle="Choose which channels each category of notification uses to reach you."
        breadcrumb={[{ label: 'Alerts', href: '/alerts' }, { label: 'Notification Preferences' }]}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/notifications">
              <Button variant="outline">Back to inbox</Button>
            </Link>
            <Button onClick={save}>Save changes</Button>
          </div>
        }
      />

      {/* Channel matrix */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">Category × Channel</h3>
          <p className="text-xs text-slate-500 mt-0.5">Toggle delivery per category and channel.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 text-left">Category</th>
                {CHANNELS.map((c) => (
                  <th key={c} className="px-5 py-3 text-center">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CATEGORIES.map((cat) => (
                <tr key={cat} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-medium text-slate-800">{cat}</td>
                  {CHANNELS.map((ch) => {
                    const on = matrix[cat][ch];
                    return (
                      <td key={ch} className="px-5 py-3 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${cat} via ${ch}`}
                          onClick={() => toggle(cat, ch)}
                          className={cn(
                            'relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors align-middle',
                            on ? 'bg-primary-600' : 'bg-slate-300',
                          )}
                        >
                          <span
                            className={cn(
                              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                              on ? 'translate-x-5' : 'translate-x-0.5',
                            )}
                          />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Digest frequency */}
        <div className="glass-panel rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Digest frequency</h3>
            <p className="text-xs text-slate-500 mt-0.5">Bundle low-priority notifications into a summary.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {DIGESTS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDigest(d)}
                className={cn(
                  'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                  digest === d ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Quiet hours */}
        <div className="glass-panel rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Quiet hours</h3>
              <p className="text-xs text-slate-500 mt-0.5">Mute non-critical notifications overnight.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={quietHours}
              aria-label="Enable quiet hours"
              onClick={() => setQuietHours((v) => !v)}
              className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', quietHours ? 'bg-primary-600' : 'bg-slate-300')}
            >
              <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', quietHours ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
          </div>
          <div className={cn('flex items-center gap-3', !quietHours && 'opacity-50 pointer-events-none')}>
            <div className="flex-1">
              <label htmlFor="q-from" className="block text-xs font-medium text-slate-500 mb-1">From</label>
              <input id="q-from" type="time" value={quietFrom} onChange={(e) => setQuietFrom(e.target.value)} className={cn(inputClass, 'w-full')} />
            </div>
            <div className="flex-1">
              <label htmlFor="q-to" className="block text-xs font-medium text-slate-500 mb-1">To</label>
              <input id="q-to" type="time" value={quietTo} onChange={(e) => setQuietTo(e.target.value)} className={cn(inputClass, 'w-full')} />
            </div>
          </div>
          <p className="text-xs text-slate-400">Critical alerts always break through quiet hours.</p>
        </div>
      </div>
    </div>
  );
}
