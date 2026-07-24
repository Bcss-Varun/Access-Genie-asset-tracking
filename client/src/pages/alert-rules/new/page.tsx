import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

type Severity = 'Critical' | 'Warning' | 'Info';
type Tone = 'primary' | 'amber' | 'red';
const severityTone: Record<Severity, Tone> = { Critical: 'red', Warning: 'amber', Info: 'primary' };

const METRICS = [
  { value: 'ai.failure_probability', label: 'AI failure probability', unit: '' },
  { value: 'telemetry.temperature', label: 'Temperature (°C)', unit: '°C' },
  { value: 'device.battery', label: 'Battery level (%)', unit: '%' },
  { value: 'tracking.last_ping_age', label: 'Signal loss (hours)', unit: 'h' },
  { value: 'utilization.rate', label: 'Utilization rate (%)', unit: '%' },
];
const OPERATORS = [
  { value: '>', label: '> greater than' },
  { value: '>=', label: '≥ at least' },
  { value: '<', label: '< less than' },
  { value: '<=', label: '≤ at most' },
  { value: '==', label: '= equals' },
];
const SEVERITIES: Severity[] = ['Critical', 'Warning', 'Info'];
const CHANNELS = ['Email', 'SMS', 'Slack', 'Push', 'In-app'];

export default function NewAlertRulePage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [metric, setMetric] = useState(METRICS[0].value);
  const [operator, setOperator] = useState('>');
  const [value, setValue] = useState('0.7');
  const [severity, setSeverity] = useState<Severity>('Critical');
  const [channels, setChannels] = useState<Record<string, boolean>>({ Email: true, Slack: true });

  const selectedChannels = CHANNELS.filter((c) => channels[c]);
  const preview = useMemo(
    () => `WHEN ${metric} ${operator} ${value || '?'} → raise ${severity} alert${selectedChannels.length ? ` · notify ${selectedChannels.join(', ')}` : ''}`,
    [metric, operator, value, severity, selectedChannels],
  );

  const canCreate = name.trim().length > 0 && value.trim().length > 0 && selectedChannels.length > 0;

  function handleCreate() {
    if (!canCreate) {
      toast({ title: 'Incomplete rule', description: 'Add a name, a threshold value, and at least one channel.', tone: 'error' });
      return;
    }
    toast({ title: 'Rule created', description: `${name.trim()} — ${severity} · ${selectedChannels.join(', ')}`, tone: 'success' });
    navigate('/alert-rules');
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30';

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="New Alert Rule"
        subtitle="Compose a condition, choose a severity, and pick the channels to notify."
        breadcrumb={[
          { label: 'Alerts', href: '/alerts' },
          { label: 'Rules', href: '/alert-rules' },
          { label: 'New' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/alert-rules">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button onClick={handleCreate} disabled={!canCreate}>Create rule</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel rounded-xl p-5 space-y-6">
          {/* Name */}
          <div>
            <label htmlFor="rule-name" className="block text-sm font-medium text-slate-700 mb-1.5">Rule name</label>
            <input
              id="rule-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Predicted failure > 70%"
              className={inputClass}
            />
          </div>

          {/* Condition builder */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Condition</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select value={metric} onChange={(e) => setMetric(e.target.value)} className={inputClass} aria-label="Metric">
                {METRICS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <select value={operator} onChange={(e) => setOperator(e.target.value)} className={inputClass} aria-label="Operator">
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Value"
                aria-label="Threshold value"
                className={inputClass}
              />
            </div>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Severity</label>
            <div className="flex flex-wrap gap-2">
              {SEVERITIES.map((s) => {
                const on = severity === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className={cn(
                      'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                      on ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Channels */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notification channels</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CHANNELS.map((c) => {
                const on = !!channels[c];
                return (
                  <label
                    key={c}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors',
                      on ? 'border-primary-500 bg-primary-50/60' : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setChannels((prev) => ({ ...prev, [c]: !prev[c] }))}
                      className="h-4 w-4 rounded border-slate-300 accent-primary-600"
                    />
                    <span className="text-slate-700">{c}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div className="glass-panel rounded-xl p-5 space-y-4 self-start">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Rule preview</h3>
            <Badge tone={severityTone[severity]}>{severity}</Badge>
          </div>
          <p className="text-xs text-slate-500">This is how the rule will be evaluated against incoming signals.</p>
          <code className="block rounded-lg bg-slate-900 px-3 py-3 font-mono text-xs leading-relaxed text-slate-100 break-words">
            {preview}
          </code>
          <div className="text-xs text-slate-500">
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span>Channels</span>
              <span className="font-medium text-slate-700">{selectedChannels.length ? selectedChannels.join(', ') : 'none'}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span>Status on create</span>
              <span className="font-medium text-emerald-600">Enabled</span>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={!canCreate} className="w-full">Create rule</Button>
        </div>
      </div>
    </div>
  );
}
