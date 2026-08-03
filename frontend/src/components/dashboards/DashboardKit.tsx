// ─────────────────────────────────────────────────────────────────────────────
// DashboardKit — small, hook-free presentational building blocks shared across
// the role dashboards. Pure SVG / markup so pages can stay server components.
// (Interactive charts live in @/components/charts/DashboardCharts.)
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom';
import type { AIInsight, InsightType } from '@/types/asset';
import { cn } from '@/lib/utils';

export const insightEmoji: Record<InsightType, string> = {
  'Predictive Failure': '⚠️',
  Utilization: '💡',
  'Theft/Security': '🔒',
  'Cost Optimization': '💰',
  Anomaly: '📈',
  Lifecycle: '♻️',
};

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({
  title, action, children, className,
}: {
  title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('glass-panel rounded-xl p-6 flex flex-col', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="font-bold text-lg font-heading text-slate-900">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Horizontal bar list (categorical distributions) ──────────────────────────
export type HBar = { label: string; value: number; color?: string; caption?: string };
export function HBars({
  data, format = (n: number) => `${n}`, barClassName,
}: {
  data: HBar[]; format?: (n: number) => string; barClassName?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-sm font-medium text-slate-600" title={d.label}>
            {d.label}
          </span>
          <div className="relative flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={cn('h-full rounded-full', !d.color && (barClassName ?? 'bg-primary-500'))}
              style={{ width: `${Math.round((d.value / max) * 100)}%`, backgroundColor: d.color }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">
            {format(d.value)}
          </span>
          {d.caption && <span className="w-20 shrink-0 text-right text-xs text-slate-400">{d.caption}</span>}
        </li>
      ))}
    </ul>
  );
}

// ── Funnel (decreasing centered bars) ────────────────────────────────────────
export function Funnel({ stages }: { stages: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-2">
      {stages.map((s) => {
        const pct = Math.max(8, Math.round((s.value / max) * 100));
        return (
          <div key={s.label} className="flex flex-col items-center">
            <div
              className="relative flex items-center justify-between rounded-lg px-3 py-2 text-white shadow-sm transition-all"
              style={{ width: `${pct}%`, minWidth: 120, backgroundColor: s.color }}
            >
              <span className="text-xs font-semibold truncate">{s.label}</span>
              <span className="text-sm font-bold tabular-nums">{s.value}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Grouped two-series horizontal bars (e.g. book vs purchase) ───────────────
export function GroupedBars({
  rows, aColor, bColor, aLabel, bLabel, format = (n: number) => `${n}`,
}: {
  rows: { label: string; a: number; b: number }[];
  aColor: string; bColor: string; aLabel: string; bLabel: string; format?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-5 text-xs font-medium text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ backgroundColor: aColor }} />
          {aLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ backgroundColor: bColor }} />
          {bLabel}
        </span>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-sm font-medium text-slate-600" title={r.label}>
              {r.label}
            </span>
            <div className="flex-1 space-y-1">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.round((r.a / max) * 100)}%`, backgroundColor: aColor }} />
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.round((r.b / max) * 100)}%`, backgroundColor: bColor }} />
              </div>
            </div>
            <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-500">
              {format(r.a)}
              <span className="block text-slate-400">{format(r.b)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── AI insight panel (matches executive dashboard feed) ──────────────────────
const sevTone: Record<string, string> = {
  Critical: 'text-health-critical',
  Warning: 'text-amber-600',
  Opportunity: 'text-emerald-600',
  Info: 'text-slate-500',
};
export function InsightPanel({
  insights, title = '✨ AI Insights', viewAllHref = '/ai-insights',
}: {
  insights: AIInsight[]; title?: string; viewAllHref?: string;
}) {
  return (
    <Card
      title={title}
      action={
        <Link to={viewAllHref} className="text-xs font-medium px-2 py-1 bg-primary-500/10 text-primary-600 rounded-full hover:bg-primary-500/20 transition-colors">
          View all
        </Link>
      }
    >
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {insights.map((insight) => (
          <Link
            key={insight.id}
            to={viewAllHref}
            className="block p-4 rounded-lg bg-slate-50 border border-slate-200 hover:border-primary-500/50 transition-colors"
          >
            <div className="flex items-start">
              <div className="text-xl mr-3">{insightEmoji[insight.type]}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900 truncate">{insight.title}</h4>
                  <span className={cn('text-[11px] font-semibold shrink-0', sevTone[insight.severity])}>
                    {insight.confidence}%
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{insight.summary}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-primary-600 font-medium">{insight.actionLabel} →</span>
                  {insight.impactLabel && (
                    <span className="text-[11px] text-slate-400">{insight.impactLabel}</span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────
export const categoryEmoji = (c: string): string =>
  c === 'Endpoints' ? '📱' : c === 'Compute' ? '💻' : c === 'Network' ? '🌐' : c === 'Sensors' ? '📡' : c === 'Infrastructure' ? '⚡' : '📦';

export function riskTone(score: number): string {
  return score > 70 ? 'text-health-critical' : score > 40 ? 'text-amber-600' : 'text-emerald-600';
}
export function riskBar(score: number): string {
  return score > 70 ? 'bg-health-critical' : score > 40 ? 'bg-health-warning' : 'bg-health-good';
}
