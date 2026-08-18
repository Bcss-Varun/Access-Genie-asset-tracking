import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allAnomalies } from '@/lib/dataset';
import type { AnomalyEvent, AnomalySeverity } from '@access-genie/shared';
import { cn, relTime } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/providers/ToastProvider';
import { useMutate } from '@/api/mutate';
import { maintenanceApi } from '@/api/work-orders';
import { useSession } from '@/components/providers/SessionProvider';

type SevMeta = { accent: string; tone: 'red' | 'amber' | 'primary'; gauge: string };
const SEV: Record<AnomalySeverity, SevMeta> = {
  Critical: { accent: 'bg-health-critical', tone: 'red', gauge: 'bg-health-critical' },
  Warning: { accent: 'bg-health-warning', tone: 'amber', gauge: 'bg-health-warning' },
  Info: { accent: 'bg-primary-500', tone: 'primary', gauge: 'bg-primary-500' },
};

const SEV_FILTERS: (AnomalySeverity | 'All')[] = ['All', 'Critical', 'Warning', 'Info'];
const MAX_Z = 5; // gauge full-scale

export default function AnomalyPage() {
  const { toast } = useToast();
  const { run, isPending } = useMutate();
  const { session } = useSession();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [severity, setSeverity] = useState<AnomalySeverity | 'All'>('All');
  const [raised, setRaised] = useState<Set<string>>(new Set());

  /**
   * Turn a detection into work.
   *
   * The anomaly's own numbers go into the description, because whoever picks
   * the order up needs to know *why* it was raised — "investigate an anomaly"
   * with no evidence is a job nobody can start.
   */
  const raiseWorkOrder = async (a: AnomalyEvent) => {
    const created = await run(
      maintenanceApi.create({
        title: `Investigate ${a.metric} anomaly`,
        assetId: a.assetId,
        // A person reviewed the anomaly and decided to act, which is a manual
        // corrective order. Predictive raising is parked for this phase.
        type: 'Corrective',
        source: 'Manual',
        priority: a.severity === 'Critical' ? 'Critical' : a.severity === 'Warning' ? 'High' : 'Medium',
        assignedTo: 'Unassigned',
        // A week: long enough to plan around, short enough that the evidence
        // is still current when somebody looks.
        dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        description:
          `Raised from anomaly ${a.id}. ${a.description} ` +
          `Metric: ${a.metric}. Z-score ${a.zScore}, detector confidence ${a.confidence}%. ` +
          `Detected ${new Date(a.detectedAt).toISOString()} by ${session.user.name}'s review.`,
        estimatedHours: 2,
        checklist: [
          { label: `Confirm the ${a.metric} reading against the device`, done: false },
          { label: 'Decide whether it is a fault or a false positive', done: false },
          { label: 'Raise corrective work if confirmed', done: false },
        ],
      }),
      { describe: 'raise that work order' },
    );
    if (!created) return;

    setRaised((prev) => new Set(prev).add(a.id));
    toast({
      title: `${created.id} raised`,
      description: `Investigate ${a.metric} on ${a.assetName} — in the maintenance queue now.`,
      tone: 'success',
    });
  };

  const live = useMemo(() => allAnomalies.filter((a) => !dismissed.has(a.id)), [dismissed]);

  const critical = live.filter((a) => a.severity === 'Critical').length;
  const avgZ = live.length ? (live.reduce((s, a) => s + a.zScore, 0) / live.length).toFixed(1) : '0.0';
  const avgConf = live.length ? Math.round(live.reduce((s, a) => s + a.confidence, 0) / live.length) : 0;

  const visible = live.filter((a) => severity === 'All' || a.severity === severity);

  const dismiss = (a: AnomalyEvent) => {
    setDismissed((prev) => new Set(prev).add(a.id));
    toast({ title: 'Anomaly dismissed', description: `${a.assetName} · ${a.metric}`, tone: 'default' });
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Anomaly Detection"
        subtitle="Statistical outliers surfaced from live telemetry, ranked by severity."
        breadcrumb={[{ label: 'AI Intelligence', href: '/ai-insights' }, { label: 'Anomaly & Theft' }]}
        actions={
          <Link to="/ai/theft">
            <Button variant="outline">Theft Detection</Button>
          </Link>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Anomalies (24h)" value={live.length} sub="Currently open" tone="primary" accent />
        <KpiCard label="Critical" value={critical} sub="Immediate review" tone="red" />
        <KpiCard label="Avg Z-Score" value={`${avgZ}σ`} sub="Deviation from baseline" tone="amber" />
        <KpiCard label="Avg Confidence" value={`${avgConf}%`} sub="Model certainty" tone="emerald" />
      </div>

      {/* Severity filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-1">Severity</span>
        {SEV_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setSeverity(s)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              severity === s ? 'bg-primary-600 text-white border-primary-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:border-primary-500/50',
            )}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">Showing {visible.length} of {live.length}</span>
      </div>

      {/* Anomaly feed */}
      {visible.length === 0 ? (
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon={live.length === 0 ? '✅' : '🔍'}
            title={live.length === 0 ? 'No open anomalies' : 'No anomalies match this filter'}
            description={live.length === 0 ? 'All anomalies have been triaged. The model keeps scanning telemetry for new outliers.' : 'Try a different severity filter.'}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((a) => {
            const sev = SEV[a.severity];
            const zPct = Math.min(100, (a.zScore / MAX_Z) * 100);
            return (
              <article key={a.id} className="glass-panel rounded-xl p-5 relative overflow-hidden">
                <div className={cn('absolute left-0 top-0 h-full w-1.5', sev.accent)} />
                <div className="flex flex-col lg:flex-row lg:items-start gap-5">
                  {/* Left: identity + description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={sev.tone}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', sev.gauge)} />{a.severity}
                      </Badge>
                      <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600">{a.metric}</span>
                      <span className="text-xs text-slate-400">{relTime(a.detectedAt)}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-heading font-bold text-slate-900">
                      <Link to={`/assets/${a.assetId}`} className="hover:text-primary-600">{a.assetName}</Link>
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">{a.description}</p>
                    <Link to={`/assets/${a.assetId}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700">
                      {a.assetId} <span aria-hidden>→</span>
                    </Link>
                  </div>

                  {/* Right: gauges */}
                  <div className="lg:w-64 shrink-0 space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-600">Z-Score</span>
                        <span className="tabular-nums font-bold text-slate-900">{a.zScore.toFixed(1)}σ</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className={cn('h-full rounded-full', sev.gauge)} style={{ width: `${zPct}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-600">Confidence</span>
                        <span className="tabular-nums font-bold text-slate-900">{a.confidence}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-primary-500" style={{ width: `${a.confidence}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action row */}
                <div className="mt-4 flex flex-wrap items-center gap-2 pt-4 border-t border-slate-200">
                  {/*
                    "Acknowledge" is gone. An anomaly is a detection, not a
                    queue item — there is nowhere for an acknowledgement to be
                    stored and nothing downstream reads one. Raising work is the
                    action that actually changes what happens next, and that is
                    now a real work order somebody will find in their queue.
                  */}
                  <Button
                    size="sm"
                    disabled={isPending || raised.has(a.id)}
                    onClick={() => void raiseWorkOrder(a)}
                  >
                    Create WO
                  </Button>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => dismiss(a)}>
                    Dismiss
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
