import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getHealthMatrix } from '@/lib/dataset';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Color tokens (mirror globals.css health tokens — kept as literals so SVG fills
// stay deterministic and don't depend on class resolution)
// ─────────────────────────────────────────────────────────────────────────────
const C_GOOD = '#10b981';
const C_WARN = '#f59e0b';
const C_CRIT = '#ef4444';
const C_PRIMARY = '#4f46e5';
const C_GRID = '#e2e8f0';
const C_AXIS = '#94a3b8';

const healthColor = (h: number) => (h > 80 ? C_GOOD : h > 50 ? C_WARN : C_CRIT);
const riskColor = (r: number) => (r > 70 ? C_CRIT : r > 40 ? C_WARN : C_GOOD);

const healthTone = (h: number): 'emerald' | 'amber' | 'red' =>
  h > 80 ? 'emerald' : h > 50 ? 'amber' : 'red';

const statusTone: Record<string, 'emerald' | 'amber' | 'red' | 'slate' | 'primary'> = {
  Active: 'emerald',
  Maintenance: 'amber',
  Missing: 'red',
  Staging: 'primary',
  End_Of_Life: 'slate',
};

type Row = ReturnType<typeof getHealthMatrix>[number];
type SortKey = 'health' | 'risk' | 'utilization';
type FilterKey = 'all' | 'at-risk' | 'critical';

// ─────────────────────────────────────────────────────────────────────────────
// Risk vs Health scatter — hand-rolled SVG with hover tooltip
// ─────────────────────────────────────────────────────────────────────────────
function RiskHealthScatter({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<string | null>(null);

  const W = 440;
  const H = 300;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xOf = (health: number) => padL + (health / 100) * plotW;
  const yOf = (risk: number) => padT + plotH - (risk / 100) * plotH;

  const axisTicks = [0, 25, 50, 75, 100];
  const hovered = rows.find((r) => r.id === hover) ?? null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Risk versus health scatter plot"
    >
      {/* grid */}
      {axisTicks.map((t) => {
        const x = xOf(t);
        const y = yOf(t);
        return (
          <g key={t}>
            <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke={C_GRID} strokeWidth={1} />
            <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke={C_GRID} strokeWidth={1} />
            <text x={x} y={padT + plotH + 16} textAnchor="middle" fontSize={10} fill={C_AXIS}>
              {t}
            </text>
            <text x={padL - 8} y={y + 3} textAnchor="end" fontSize={10} fill={C_AXIS}>
              {t}
            </text>
          </g>
        );
      })}
      {/* axis titles */}
      <text x={padL + plotW / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={C_AXIS} fontWeight={600}>
        Health score →
      </text>
      <text
        x={12}
        y={padT + plotH / 2}
        textAnchor="middle"
        fontSize={10}
        fill={C_AXIS}
        fontWeight={600}
        transform={`rotate(-90 12 ${padT + plotH / 2})`}
      >
        Risk score →
      </text>

      {/* points */}
      {rows.map((r) => {
        const cx = xOf(r.health);
        const cy = yOf(r.risk);
        const isHover = hover === r.id;
        return (
          <circle
            key={r.id}
            cx={cx}
            cy={cy}
            r={isHover ? 8 : 5.5}
            fill={riskColor(r.risk)}
            fillOpacity={isHover ? 1 : 0.8}
            stroke="#fff"
            strokeWidth={1.5}
            style={{ cursor: 'pointer', transition: 'r 120ms' }}
            onMouseEnter={() => setHover(r.id)}
            onMouseLeave={() => setHover(null)}
          />
        );
      })}

      {/* tooltip */}
      {hovered && (() => {
        const cx = xOf(hovered.health);
        const cy = yOf(hovered.risk);
        const label = hovered.name;
        const sub = `H ${hovered.health} · R ${hovered.risk}`;
        const boxW = Math.max(label.length, sub.length) * 6 + 20;
        const boxH = 34;
        const bx = Math.min(Math.max(cx - boxW / 2, 2), W - boxW - 2);
        const by = cy - boxH - 12 < padT ? cy + 12 : cy - boxH - 12;
        return (
          <g pointerEvents="none">
            <rect x={bx} y={by} width={boxW} height={boxH} rx={6} fill="#0f172a" opacity={0.92} />
            <text x={bx + boxW / 2} y={by + 14} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
              {label}
            </text>
            <text x={bx + boxW / 2} y={by + 27} textAnchor="middle" fontSize={10} fill="#cbd5e1">
              {sub}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Meter bar (health / utilization) used in the table
// ─────────────────────────────────────────────────────────────────────────────
function MeterBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 min-w-[92px]">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold text-slate-600 tabular-nums w-8 text-right">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function HealthRiskPage() {
  const matrix = useMemo(() => getHealthMatrix(), []);

  const [sortBy, setSortBy] = useState<SortKey>('risk');
  const [filter, setFilter] = useState<FilterKey>('all');

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const avgHealth = Math.round(matrix.reduce((s, r) => s + r.health, 0) / matrix.length);
  const atRiskCount = matrix.filter((r) => r.risk > 60).length;
  const criticalCount = matrix.filter((r) => r.health < 50).length;
  const avgUtil = Math.round(matrix.reduce((s, r) => s + r.utilization, 0) / matrix.length);

  // ── Filter + sort ───────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const filtered = matrix.filter((r) =>
      filter === 'at-risk' ? r.risk > 60 : filter === 'critical' ? r.health < 50 : true,
    );
    const dir = sortBy === 'health' ? 1 : -1; // health ascending (worst first), risk/util descending
    return [...filtered].sort((a, b) => (a[sortBy] - b[sortBy]) * dir);
  }, [matrix, filter, sortBy]);

  const sortTabs: { key: SortKey; label: string }[] = [
    { key: 'risk', label: 'Risk' },
    { key: 'health', label: 'Health' },
    { key: 'utilization', label: 'Utilization' },
  ];
  const filterChips: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: matrix.length },
    { key: 'at-risk', label: 'At Risk', count: atRiskCount },
    { key: 'critical', label: 'Critical', count: criticalCount },
  ];

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Health & Risk"
        subtitle="Portfolio condition scoring, risk banding and utilization across the asset graph."
        breadcrumb={[
          { label: 'AI Intelligence', href: '/ai-insights' },
          { label: 'Health & Risk' },
        ]}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Avg Health Score"
          value={avgHealth}
          tone={healthTone(avgHealth)}
          sub={`${avgHealth > 80 ? 'Healthy portfolio' : avgHealth > 50 ? 'Watch trending assets' : 'Degraded fleet'}`}
        />
        <KpiCard
          label="Assets at Risk"
          value={atRiskCount}
          tone="red"
          sub="Risk score above 60"
        />
        <KpiCard
          label="Critical Health"
          value={criticalCount}
          tone="red"
          sub="Health score below 50"
        />
        <KpiCard
          label="Avg Utilization"
          value={`${avgUtil}%`}
          tone="primary"
          sub="Capacity used across fleet"
        />
      </div>

      {/* Primary visual — Risk vs Health */}
      <div className="glass-panel rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-slate-800">Risk vs Health</h2>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C_GOOD }} />Low</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C_WARN }} />Elevated</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C_CRIT }} />Critical</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">Hover a point to inspect the asset. Top-left = high risk, low health.</p>
        <div className="mx-auto max-w-xl">
          <RiskHealthScatter rows={matrix} />
        </div>
      </div>

      {/* Matrix table */}
      <div className="glass-panel rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-800">Health Matrix</h2>
          <div className="flex flex-wrap items-center gap-4">
            {/* filter chips */}
            <div className="flex items-center gap-1.5">
              {filterChips.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    filter === c.key
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-primary-300',
                  )}
                >
                  {c.label}
                  <span className={cn('ml-1.5 tabular-nums', filter === c.key ? 'text-primary-100' : 'text-slate-400')}>
                    {c.count}
                  </span>
                </button>
              ))}
            </div>
            {/* sort */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sort</span>
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                {sortTabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setSortBy(t.key)}
                    className={cn(
                      'px-3 py-1.5 transition-colors',
                      sortBy === t.key ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-200">
                <th className="py-2.5 px-3">Asset</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3 w-40">Health</th>
                <th className="py-2.5 px-3">Risk</th>
                <th className="py-2.5 px-3 w-40">Utilization</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-3">
                    <Link to={`/assets/${r.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                      {r.name}
                    </Link>
                    <div className="text-[11px] text-slate-400 font-mono">{r.id}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">{r.category}</td>
                  <td className="py-2.5 px-3">
                    <MeterBar value={r.health} color={healthColor(r.health)} />
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-bold tabular-nums" style={{ color: riskColor(r.risk) }}>
                      {r.risk}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <MeterBar value={r.utilization} color={C_PRIMARY} />
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge tone={statusTone[r.status] ?? 'slate'}>{r.status.replace(/_/g, ' ')}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
