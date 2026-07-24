import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { Avatar } from '@/components/ui/primitives';

interface Tier {
  tier: number;
  notify: string;
  afterMin: number;
  channels: string[];
}
interface Policy {
  id: string;
  name: string;
  scope: string;
  tone: 'red' | 'amber' | 'primary';
  severity: string;
  tiers: Tier[];
}

const POLICIES: Policy[] = [
  {
    id: 'ESC-01',
    name: 'Critical Infrastructure',
    scope: 'Servers, HVAC, Power',
    tone: 'red',
    severity: 'Critical',
    tiers: [
      { tier: 1, notify: 'Facilities On-call', afterMin: 0, channels: ['Push', 'SMS'] },
      { tier: 2, notify: 'IT Ops Lead (Arjun Menon)', afterMin: 10, channels: ['Call', 'Email'] },
      { tier: 3, notify: 'Site Director (Sneha Iyer)', afterMin: 30, channels: ['Call'] },
    ],
  },
  {
    id: 'ESC-02',
    name: 'Data Center Core',
    scope: 'Servers, storage & network core',
    tone: 'amber',
    severity: 'Critical',
    tiers: [
      { tier: 1, notify: 'Data Center Technician', afterMin: 0, channels: ['Push', 'In-app'] },
      { tier: 2, notify: 'Infrastructure Engineering', afterMin: 15, channels: ['SMS', 'Email'] },
    ],
  },
  {
    id: 'ESC-03',
    name: 'Tracking & Geofence',
    scope: 'RTLS, custody exceptions',
    tone: 'primary',
    severity: 'Warning',
    tiers: [
      { tier: 1, notify: 'Security Officer', afterMin: 0, channels: ['In-app'] },
      { tier: 2, notify: 'Operations Manager', afterMin: 20, channels: ['Email'] },
    ],
  },
];

interface Shift {
  day: string;
  primary: string;
  secondary: string;
  window: string;
}
const ROTATION: Shift[] = [
  { day: 'Mon–Tue', primary: 'Arjun Menon', secondary: 'Deepak Nair', window: '08:00 – 20:00' },
  { day: 'Wed–Thu', primary: 'Sneha Iyer', secondary: 'Arjun Menon', window: '08:00 – 20:00' },
  { day: 'Fri–Sun', primary: 'Deepak Nair', secondary: 'Sneha Iyer', window: '20:00 – 08:00' },
];

const initials = (name: string) =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export default function EscalationsPage() {
  const { toast } = useToast();

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Escalation Policies"
        subtitle="Tiered routing rules and on-call rotation that decide who gets paged when."
        breadcrumb={[{ label: 'Alerts', href: '/alerts' }, { label: 'Escalation Policies' }]}
        actions={
          <Button onClick={() => toast({ title: 'New policy', description: 'The escalation policy builder is on the roadmap.', tone: 'info' })}>
            + New Policy
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {POLICIES.map((p) => (
          <div key={p.id} className="glass-panel rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold font-heading text-slate-900">{p.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{p.scope}</div>
              </div>
              <Badge tone={p.tone}>{p.severity}</Badge>
            </div>

            <ol className="space-y-3">
              {p.tiers.map((t, i) => (
                <li key={t.tier} className="relative">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                      {t.tier}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800">{t.notify}</div>
                      <div className="text-xs text-slate-500">
                        {t.afterMin === 0 ? 'Immediately' : `After ${t.afterMin} min`} · {t.channels.join(', ')}
                      </div>
                    </div>
                  </div>
                  {i < p.tiers.length - 1 && <div className="ml-3.5 h-3 w-px bg-slate-200" />}
                </li>
              ))}
            </ol>

            <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono">{p.id}</span>
              <button
                className="font-medium text-primary-600 hover:underline"
                onClick={() => toast({ title: 'Policy opened', description: `${p.name} — editor coming soon.`, tone: 'info' })}
              >
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* On-call rotation */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">On-call rotation</h3>
          <p className="text-xs text-slate-500 mt-0.5">Current weekly schedule — primary and backup responders.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Shift</th>
                <th className="px-5 py-3">Primary</th>
                <th className="px-5 py-3">Secondary</th>
                <th className="px-5 py-3">Coverage window</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ROTATION.map((s) => (
                <tr key={s.day} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-medium text-slate-800">{s.day}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2">
                      <Avatar initials={initials(s.primary)} className="w-7 h-7 text-xs" />
                      <span className="text-slate-700">{s.primary}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2">
                      <Avatar initials={initials(s.secondary)} className="w-7 h-7 text-xs bg-slate-400" />
                      <span className="text-slate-600">{s.secondary}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-600 tabular-nums">{s.window}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
