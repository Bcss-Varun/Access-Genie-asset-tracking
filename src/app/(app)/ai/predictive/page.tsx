'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { mockAssets, mockInsights } from '@/lib/mock-data';
import { useToast } from '@/components/providers/ToastProvider';
import { PageHeader, KpiCard, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { cn, formatMoney, DEMO_NOW } from '@/lib/utils';
import type { Asset, AIInsight, InsightSeverity } from '@/types/asset';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic helpers (module scope → stable, no Date.now / hydration drift)
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_ACCURACY = 89; // headline model quality (%)
const RUL_HORIZON = 60; // days shown on the RUL axis

/** Estimated days-to-failure from the risk score (higher risk → sooner). */
function daysToFail(risk: number): number {
  return Math.max(1, Math.round((100 - risk) / 2));
}

/** Model confidence for an asset-level prediction, derived from its risk score. */
function riskConfidence(risk: number): number {
  return Math.min(98, 52 + Math.round(risk * 0.45));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a date `d` days after the demo clock as e.g. "Jul 31". Deterministic (UTC). */
function futureDateLabel(days: number): string {
  const dt = new Date(DEMO_NOW + days * 86_400_000);
  return `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}

/** Colour band for a days-to-failure figure. */
function rulTone(days: number): { bar: string; text: string; badge: 'red' | 'amber' | 'emerald'; label: string } {
  if (days < 7) return { bar: '#ef4444', text: 'text-health-critical', badge: 'red', label: 'Imminent' };
  if (days < 30) return { bar: '#f59e0b', text: 'text-health-warning', badge: 'amber', label: 'At risk' };
  return { bar: '#10b981', text: 'text-health-good', badge: 'emerald', label: 'Monitored' };
}

const SEVERITY: Record<
  InsightSeverity,
  { accent: string; meter: string; badge: 'red' | 'amber' | 'primary' | 'emerald'; icon: string }
> = {
  Critical: { accent: 'border-l-health-critical', meter: 'bg-health-critical', badge: 'red', icon: '🔴' },
  Warning: { accent: 'border-l-amber-500', meter: 'bg-amber-500', badge: 'amber', icon: '🟠' },
  Info: { accent: 'border-l-primary-500', meter: 'bg-primary-500', badge: 'primary', icon: '🔵' },
  Opportunity: { accent: 'border-l-emerald-500', meter: 'bg-emerald-500', badge: 'emerald', icon: '🟢' },
};

// ─────────────────────────────────────────────────────────────────────────────
// RUL (Remaining Useful Life) timeline — one horizontal bar per at-risk asset
// ─────────────────────────────────────────────────────────────────────────────
function RulRow({ asset }: { asset: Asset }) {
  const risk = asset.riskScore ?? 0;
  const days = daysToFail(risk);
  const conf = riskConfidence(risk);
  const tone = rulTone(days);
  const pct = Math.min(100, (days / RUL_HORIZON) * 100);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,15rem)_1fr] gap-x-4 gap-y-1.5 items-center py-3">
      {/* Asset identity */}
      <div className="min-w-0">
        <Link
          href={`/assets/${asset.id}`}
          className="text-sm font-medium text-slate-800 hover:text-primary-600 transition-colors truncate block"
        >
          {asset.name}
        </Link>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge tone={tone.badge}>{tone.label}</Badge>
          <span className="text-[11px] text-slate-400">{conf}% conf</span>
        </div>
      </div>

      {/* Timeline bar */}
      <div className="min-w-0">
        <div className="relative h-7 w-full rounded-lg bg-slate-100 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-lg transition-all"
            style={{ width: `${pct}%`, backgroundColor: tone.bar, opacity: 0.9 }}
          />
          <div className="absolute inset-0 flex items-center justify-between px-2.5">
            <span className="text-xs font-semibold text-white drop-shadow-sm tabular-nums">
              {days} {days === 1 ? 'day' : 'days'} to failure
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              est. {futureDateLabel(days)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function AiPredictivePage() {
  const { toast } = useToast();

  // Most at-risk assets, highest risk first — the RUL watchlist.
  const atRisk = useMemo(
    () =>
      [...mockAssets]
        .filter((a) => a.riskScore != null)
        .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
        .slice(0, 6),
    [],
  );

  // Explainable predictive-failure signals.
  const failures = useMemo<AIInsight[]>(
    () =>
      mockInsights
        .filter((i) => i.type === 'Predictive Failure')
        .sort((a, b) => b.confidence - a.confidence),
    [],
  );

  // ── KPIs (all deterministic) ─────────────────────────────────────────────────
  const predicted30d = atRisk.filter((a) => daysToFail(a.riskScore ?? 0) <= 30).length;
  const avgLeadTime = atRisk.length
    ? Math.round(atRisk.reduce((s, a) => s + daysToFail(a.riskScore ?? 0), 0) / atRisk.length)
    : 0;
  const downtimeAvoided = failures.reduce((s, i) => s + (i.impactUsd ?? 0), 0);

  function createPredictiveWo(source: { assetName?: string }) {
    toast({
      title: 'Predictive work order created',
      description: `WO auto-generated for ${source.assetName ?? 'asset'} — dispatched to the maintenance queue.`,
      tone: 'success',
    });
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Predictive Maintenance"
        subtitle="Remaining-useful-life forecasts and explainable failure predictions across the asset graph."
        breadcrumb={[
          { label: 'AI Intelligence', href: '/ai-insights' },
          { label: 'Predictive Maintenance' },
        ]}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Predicted Failures (30d)" value={predicted30d} sub="Assets within RUL horizon" tone="primary" accent />
        <KpiCard label="Avg Lead Time" value={`${avgLeadTime} days`} sub="Warning before failure" tone="amber" />
        <KpiCard label="Downtime Avoided" value={formatMoney(downtimeAvoided)} sub="If predictions actioned" tone="emerald" />
        <KpiCard label="Model Accuracy" value={`${MODEL_ACCURACY}%`} sub="Rolling 90-day backtest" tone="primary" />
      </div>

      {/* RUL timeline */}
      <section className="glass-panel rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div>
            <h2 className="text-base font-heading font-semibold text-slate-900">Remaining Useful Life — watchlist</h2>
            <p className="text-sm text-slate-500 mt-0.5">Estimated days to failure for the {atRisk.length} highest-risk assets, over a {RUL_HORIZON}-day horizon.</p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#ef4444' }} />&lt;7d</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />&lt;30d</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#10b981' }} />≥30d</span>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {atRisk.map((a) => (
            <RulRow key={a.id} asset={a} />
          ))}
        </div>
      </section>

      {/* Explainable failure predictions */}
      <section>
        <h2 className="text-base font-heading font-semibold text-slate-900 mb-3">Explainable failure predictions</h2>
        {failures.length === 0 ? (
          <EmptyState
            icon="🛡️"
            title="No active failure predictions"
            description="The RUL model has not flagged any imminent failures. New signals appear here as telemetry shifts."
          />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {failures.map((f) => {
              const sev = SEVERITY[f.severity];
              return (
                <article key={f.id} className={cn('glass-panel rounded-xl border-l-4 p-5 flex flex-col shadow-sm', sev.accent)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge tone={sev.badge}>{f.severity}</Badge>
                        {f.impactLabel && <Badge tone="slate">{f.impactLabel}</Badge>}
                      </div>
                      <h3 className="text-base font-heading font-semibold text-slate-900 leading-snug">{f.title}</h3>
                    </div>
                    {f.impactUsd != null && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold font-heading text-health-critical">{formatMoney(f.impactUsd)}</div>
                        <div className="text-[11px] text-slate-400">at risk</div>
                      </div>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.summary}</p>

                  {/* Confidence meter */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-slate-500">Model confidence</span>
                      <span className="font-semibold text-slate-700">{f.confidence}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div className={cn('h-full rounded-full', sev.meter)} style={{ width: `${f.confidence}%` }} />
                    </div>
                  </div>

                  {/* Explainable drivers */}
                  <div className="mt-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Why the model flagged this</div>
                    <ul className="space-y-1.5">
                      {f.drivers.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex items-center gap-2 pt-4 border-t border-slate-100">
                    <Button size="sm" onClick={() => createPredictiveWo(f)}>Create Predictive WO</Button>
                    {f.assetId && (
                      <Link
                        href={`/assets/${f.assetId}`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-colors"
                      >
                        View asset →
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
