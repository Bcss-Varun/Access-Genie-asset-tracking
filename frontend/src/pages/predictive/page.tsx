import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mockInsights, mockWorkOrders } from '@/lib/mock-data';
import { useToast } from '@/components/providers/ToastProvider';
import { PageHeader, KpiCard, EmptyState, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { cn, formatMoney, relTime } from '@/lib/utils';
import type { AIInsight, InsightSeverity } from '@/types/asset';

// ─────────────────────────────────────────────────────────────────────────────
// Static config (module scope → stable identity, no re-creation per render)
// ─────────────────────────────────────────────────────────────────────────────

/** Predictive-maintenance signal types surfaced on this board. */
const PREDICTIVE_TYPES = ['Predictive Failure', 'Anomaly'] as const;

/** Per-severity visual language — left accent bar, confidence-meter fill, pill tone. */
const SEVERITY: Record<
  InsightSeverity,
  { accent: string; meter: string; badge: 'red' | 'amber' | 'primary' | 'emerald' }
> = {
  Critical: { accent: 'border-l-health-critical', meter: 'bg-health-critical', badge: 'red' },
  Warning: { accent: 'border-l-amber-500', meter: 'bg-amber-500', badge: 'amber' },
  Info: { accent: 'border-l-primary-500', meter: 'bg-primary-500', badge: 'primary' },
  Opportunity: { accent: 'border-l-emerald-500', meter: 'bg-emerald-500', badge: 'emerald' },
};

/** Baseline of AI-generated work orders already in the pipeline. */
const BASE_AUTO_WOS = mockWorkOrders.filter((w) => w.aiGenerated).length;

// ─────────────────────────────────────────────────────────────────────────────

export default function PredictivePage() {
  const { toast } = useToast();

  // Source alerts: predictive-failure + anomaly insights, newest first.
  // Fallback to *any* insight so the board is never empty in the demo.
  const alerts = useMemo<AIInsight[]>(() => {
    const matched = mockInsights.filter((i) =>
      (PREDICTIVE_TYPES as readonly string[]).includes(i.type),
    );
    const source = matched.length > 0 ? matched : mockInsights;
    return [...source].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, []);

  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [autoWos, setAutoWos] = useState(BASE_AUTO_WOS);

  const visible = alerts.filter((a) => !dismissed.has(a.id));

  // ── KPIs (over the still-visible alerts) ─────────────────────────────────────
  const predicted30d = visible.length;
  const highConfidence = visible.filter((a) => a.confidence >= 80).length;
  const atRisk = visible.reduce((sum, a) => sum + (a.impactInr ?? 0), 0);

  // ── Actions ──────────────────────────────────────────────────────────────────
  function createWorkOrder(a: AIInsight) {
    setAutoWos((n) => n + 1);
    toast({
      title: 'Predictive work order created',
      description: `WO auto-generated for ${a.assetName ?? 'asset'} — dispatched to maintenance queue.`,
      tone: 'success',
    });
  }

  function dismiss(a: AIInsight) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(a.id);
      return next;
    });
    toast({ title: 'Alert dismissed', description: a.title, tone: 'default' });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Predictive Alerts"
        subtitle="AI-detected failure signatures and anomalies, ranked by severity and confidence."
        breadcrumb={[
          { label: 'Maintenance', href: '/maintenance' },
          { label: 'Predictive Alerts' },
        ]}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Predicted Failures (30d)" value={predicted30d} sub="Open predictive signals" tone="primary" accent />
        <KpiCard
          label="High-Confidence"
          value={highConfidence}
          sub="≥ 80% model confidence"
          tone={highConfidence > 0 ? 'amber' : 'slate'}
        />
        <KpiCard
          label="Potential $ at Risk"
          value={formatMoney(atRisk)}
          sub="Avoidable failure cost"
          tone={atRisk > 0 ? 'red' : 'slate'}
        />
        <KpiCard label="Auto-WOs Generated" value={autoWos} sub="By the predictive engine" tone="emerald" />
      </div>

      {/* Alert cards */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-1">
        {visible.length === 0 ? (
          <EmptyState
            icon="🛡️"
            title="No active predictive alerts"
            description="Every AI failure signal has been triaged. New anomalies will appear here as the model detects them."
          />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {visible.map((a) => {
              const sev = SEVERITY[a.severity];
              return (
                <article
                  key={a.id}
                  className={cn(
                    'glass-panel rounded-xl border-l-4 p-5 flex flex-col shadow-sm',
                    sev.accent,
                  )}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge tone={sev.badge}>{a.severity}</Badge>
                        <Badge tone="slate">{a.type}</Badge>
                      </div>
                      <h3 className="text-base font-heading font-semibold text-slate-900 leading-snug">
                        {a.title}
                      </h3>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-slate-400 whitespace-nowrap">
                      {relTime(a.createdAt)}
                    </span>
                  </div>

                  {/* Summary */}
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{a.summary}</p>

                  {/* Asset link + impact */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {a.assetId && (
                      <Link
                        to={`/assets/${a.assetId}`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
                      >
                        <span className="truncate">{a.assetName}</span>
                        <span className="text-slate-300">↗</span>
                      </Link>
                    )}
                    {a.impactInr != null && (
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span className="font-bold font-heading text-health-critical">
                          {formatMoney(a.impactInr)}
                        </span>
                        {a.impactLabel && <span className="text-xs text-slate-400">{a.impactLabel}</span>}
                      </span>
                    )}
                  </div>

                  {/* Confidence meter */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-slate-500">Model confidence</span>
                      <span className="font-semibold text-slate-700">{a.confidence}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', sev.meter)}
                        style={{ width: `${a.confidence}%` }}
                      />
                    </div>
                  </div>

                  {/* Explainable-AI drivers */}
                  <div className="mt-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Why the model flagged this
                    </div>
                    <ul className="space-y-1.5">
                      {a.drivers.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Recommended action */}
                  <div className="mt-4 rounded-lg bg-primary-50 border border-primary-100 px-3 py-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-600 mb-0.5">
                      Recommended action
                    </div>
                    <p className="text-sm text-slate-700">{a.recommendedAction}</p>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex items-center gap-2 pt-1">
                    <Button size="sm" onClick={() => createWorkOrder(a)}>
                      Create Predictive WO
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => dismiss(a)}>
                      Dismiss
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
