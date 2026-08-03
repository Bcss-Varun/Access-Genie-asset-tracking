import { useState } from 'react';
import { Link } from 'react-router-dom';
import { allAlertRules } from '@/lib/dataset';
import type { AlertRule } from '@access-genie/shared';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { alertsApi } from '@/api/alerts';
import { useMutate } from '@/api/mutate';

type Severity = AlertRule['severity'];
type Tone = 'slate' | 'primary' | 'emerald' | 'amber' | 'red';
const severityTone: Record<Severity, Tone> = { Critical: 'red', Warning: 'amber', Info: 'primary' };

export default function AlertRulesPage() {
  const { run } = useMutate();
  const [rules, setRules] = useState<AlertRule[]>(allAlertRules);

  const enabledCount = rules.filter((r) => r.enabled).length;
  const triggered = rules.reduce((sum, r) => sum + r.triggered24h, 0);

  function toggle(id: string) {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    const next = !rule.enabled;

    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: next } : r)));

    void run(alertsApi.toggleRule(id, next), {
      success: next ? 'Rule enabled' : 'Rule disabled',
      successDetail: rule.name,
      describe: `${next ? 'enable' : 'disable'} that rule`,
      rollback: () => setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !next } : r))),
    });
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Alert Rules"
        subtitle="Define the conditions that turn telemetry and AI signals into actionable alerts."
        breadcrumb={[{ label: 'Alerts', href: '/alerts' }, { label: 'Alert Rules' }]}
        actions={
          <Link to="/alert-rules/new">
            <Button>+ New Rule</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Total rules" value={rules.length} sub="Configured" tone="primary" accent />
        <KpiCard label="Enabled" value={enabledCount} sub="Actively evaluating" tone="emerald" />
        <KpiCard label="Triggered (24h)" value={triggered} sub="Across all rules" tone="amber" />
      </div>

      {rules.length === 0 ? (
        <EmptyState title="No alert rules yet" description="Create your first rule to start generating alerts." />
      ) : (
        <div className="glass-panel rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Rule</th>
                  <th className="px-4 py-3">Condition</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Channels</th>
                  <th className="px-4 py-3">Triggered 24h</th>
                  <th className="px-4 py-3 text-right">Enabled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-slate-900">{r.name}</div>
                      <div className="font-mono text-xs text-slate-400">{r.id}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{r.condition}</code>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge tone={severityTone[r.severity]}>{r.severity}</Badge>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {r.channels.map((c) => (
                          <span key={c} className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums text-slate-700">{r.triggered24h}</td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={r.enabled}
                          aria-label={`Toggle ${r.name}`}
                          onClick={() => toggle(r.id)}
                          className={cn(
                            'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                            r.enabled ? 'bg-primary-600' : 'bg-slate-300',
                          )}
                        >
                          <span
                            className={cn(
                              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                              r.enabled ? 'translate-x-5' : 'translate-x-0.5',
                            )}
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
