// ─────────────────────────────────────────────────────────────────────────────
// Subscriptions — scheduled report deliveries. Derived from scheduled reports.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { allReports } from '@/lib/dataset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime, nowMs } from '@/lib/utils';

const ahead = (hours: number) => new Date(nowMs() + hours * 3_600_000).toISOString();

type Cadence = 'Daily' | 'Weekly' | 'Monthly';
interface Subscription {
  id: string;
  reportName: string;
  cadence: Cadence;
  recipients: string;
  recipientCount: number;
  channel: string;
  nextRun: string;
  enabled: boolean;
}

// Deterministic delivery config keyed off the scheduled reports.
const scheduleConfig: Record<string, { cadence: Cadence; recipients: string; recipientCount: number; channel: string; nextRunH: number; enabled: boolean }> = {
  'RPT-01': { cadence: 'Weekly', recipients: 'exec-team@accessgenie.in', recipientCount: 6, channel: 'Email', nextRunH: 20, enabled: true },
  'RPT-02': { cadence: 'Monthly', recipients: 'finance@accessgenie.in', recipientCount: 4, channel: 'Email + Drive', nextRunH: 96, enabled: true },
  'RPT-05': { cadence: 'Weekly', recipients: 'compliance@accessgenie.in', recipientCount: 3, channel: 'Slack #compliance', nextRunH: 44, enabled: false },
};

export default function SubscriptionsPage() {
  // Derived per render: the dataset is fetched, so a value computed once at
  // module scope would never see a refetch.
  const initialSubs: Subscription[] = allReports
    .filter((r) => r.scheduled)
    .map((r) => {
      const c = scheduleConfig[r.id] ?? { cadence: 'Weekly' as Cadence, recipients: 'team@accessgenie.in', recipientCount: 2, channel: 'Email', nextRunH: 24, enabled: true };
      return {
        id: `SUB-${r.id.replace('RPT-', '')}`,
        reportName: r.name,
        cadence: c.cadence,
        recipients: c.recipients,
        recipientCount: c.recipientCount,
        channel: c.channel,
        nextRun: ahead(c.nextRunH),
        enabled: c.enabled,
      };
    });

  const { toast } = useToast();
  const [subs, setSubs] = useState<Subscription[]>(initialSubs);

  const toggle = (id: string) =>
    setSubs((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const enabled = !s.enabled;
        toast({ title: enabled ? 'Subscription enabled' : 'Subscription paused', description: s.reportName, tone: enabled ? 'success' : 'info' });
        return { ...s, enabled };
      }),
    );

  const activeCount = subs.filter((s) => s.enabled).length;
  const totalRecipients = subs.reduce((n, s) => n + s.recipientCount, 0);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Subscriptions"
        subtitle="Scheduled report deliveries to your teams and channels."
        breadcrumb={[{ label: 'Analytics', href: '/dashboards' }, { label: 'Subscriptions' }]}
        actions={
          <Button onClick={() => toast({ title: 'New subscription', description: 'Schedule builder is on the roadmap.', tone: 'info' })}>
            + New Subscription
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Subscriptions" value={subs.length} sub="Scheduled reports" tone="primary" accent />
        <KpiCard label="Active" value={activeCount} sub="Currently delivering" tone="emerald" />
        <KpiCard label="Paused" value={subs.length - activeCount} sub="Delivery suspended" tone="amber" />
        <KpiCard label="Recipients" value={totalRecipients} sub="Across all schedules" tone="slate" />
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Report Subscriptions</h2>
        </div>
        {subs.length === 0 ? (
          <EmptyState title="No subscriptions" description="Schedule a report to have it delivered automatically." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Report</th>
                  <th className="px-5 py-2.5">Cadence</th>
                  <th className="px-5 py-2.5">Recipients</th>
                  <th className="px-5 py-2.5">Channel</th>
                  <th className="px-5 py-2.5">Next Run</th>
                  <th className="px-5 py-2.5 text-right">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{s.reportName}</div>
                      <div className="text-xs text-slate-400">{s.id}</div>
                    </td>
                    <td className="px-5 py-3"><Badge tone="primary">{s.cadence}</Badge></td>
                    <td className="px-5 py-3">
                      <div className="text-slate-700">{s.recipients}</div>
                      <div className="text-xs text-slate-400">{s.recipientCount} recipients</div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{s.channel}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{s.enabled ? relTime(s.nextRun) : <span className="text-slate-400">Paused</span>}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <button
                          role="switch"
                          aria-checked={s.enabled}
                          aria-label={`Toggle ${s.reportName}`}
                          onClick={() => toggle(s.id)}
                          className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1', s.enabled ? 'bg-primary-600' : 'bg-slate-300')}
                        >
                          <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', s.enabled ? 'translate-x-6' : 'translate-x-1')} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
