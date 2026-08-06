// ─────────────────────────────────────────────────────────────────────────────
// DashboardKit — the small, hook-free pieces the dashboard widgets are drawn
// from. Pure markup and SVG; the card around them is `WidgetFrame`.
// ─────────────────────────────────────────────────────────────────────────────

import type { InsightType } from '@access-genie/shared';
import { cn } from '@/lib/utils';

export const insightEmoji: Record<InsightType, string> = {
  'Predictive Failure': '⚠️',
  Utilization: '💡',
  'Theft/Security': '🔒',
  'Cost Optimization': '💰',
  Anomaly: '📈',
  Lifecycle: '♻️',
};

// ── Horizontal bar list (categorical distributions) ──────────────────────────
export type HBar = { label: string; value: number; color?: string; caption?: string };

export function HBars({
  data,
  format = (n: number) => `${n}`,
  barClassName,
}: {
  data: HBar[];
  format?: (n: number) => string;
  barClassName?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm font-medium text-slate-600" title={d.label}>
            {d.label}
          </span>
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn('h-full rounded-full', !d.color && (barClassName ?? 'bg-primary-500'))}
              style={{ width: `${Math.round((d.value / max) * 100)}%`, backgroundColor: d.color }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">
            {format(d.value)}
          </span>
          {d.caption && <span className="w-16 shrink-0 text-right text-xs text-slate-400">{d.caption}</span>}
        </li>
      ))}
    </ul>
  );
}

// ── Funnel (decreasing centred bars) ─────────────────────────────────────────
export function Funnel({ stages }: { stages: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-2">
      {stages.map((s) => (
        <div key={s.label} className="flex flex-col items-center">
          <div
            className="relative flex items-center justify-between rounded-lg px-3 py-2 text-white shadow-sm"
            style={{ width: `${Math.max(8, Math.round((s.value / max) * 100))}%`, minWidth: 130, backgroundColor: s.color }}
          >
            <span className="truncate text-xs font-semibold">{s.label}</span>
            <span className="text-sm font-bold tabular-nums">{s.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Grouped two-series bars (e.g. purchase vs book value) ────────────────────
export function GroupedBars({
  rows,
  aColor,
  bColor,
  aLabel,
  bLabel,
  format = (n: number) => `${n}`,
}: {
  rows: { label: string; a: number; b: number }[];
  aColor: string;
  bColor: string;
  aLabel: string;
  bLabel: string;
  format?: (n: number) => string;
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
            <span className="w-24 shrink-0 truncate text-sm font-medium text-slate-600" title={r.label}>
              {r.label}
            </span>
            <div className="flex-1 space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${Math.round((r.a / max) * 100)}%`, backgroundColor: aColor }} />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
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

// ── A compact table inside a widget ──────────────────────────────────────────
export const TH = 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500';
export const TD = 'px-3 py-2.5 align-top';

export function WidgetTable<T>({
  columns,
  rows,
  renderRow,
  keyOf,
}: {
  columns: string[];
  rows: T[];
  /** The `<td>` cells for one row — the `<tr>` is supplied. */
  renderRow: (row: T) => React.ReactNode;
  keyOf: (row: T) => string;
}) {
  return (
    <div className="-mx-5 -mb-5 overflow-x-auto">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="border-y border-slate-100 bg-slate-50/70">
          <tr>
            {columns.map((c) => (
              <th key={c} className={TH}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={keyOf(row)} className="transition-colors hover:bg-slate-50">
              {renderRow(row)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────
/** Percentage, but 0 rather than NaN when there is nothing to divide by. */
export const pctOf = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Mean of a list, or `undefined` when empty — an empty estate has no average. */
export function meanOf<T>(rows: T[], value: (row: T) => number): number | undefined {
  return rows.length ? Math.round(rows.reduce((sum, row) => sum + value(row), 0) / rows.length) : undefined;
}

export function riskTone(score: number): string {
  return score > 70 ? 'text-health-critical' : score > 40 ? 'text-amber-600' : 'text-emerald-600';
}

export function riskBar(score: number): string {
  return score > 70 ? 'bg-health-critical' : score > 40 ? 'bg-health-warning' : 'bg-health-good';
}
