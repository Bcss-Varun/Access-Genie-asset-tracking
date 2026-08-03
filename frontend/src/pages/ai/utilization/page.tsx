import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { mockAssets, mockInsights } from '@/lib/mock-data';
import { cn, formatMoney, relTime } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/providers/ToastProvider';

const IDLE_THRESHOLD = 20;
const OVER_THRESHOLD = 90;

type UtilTag = 'Idle' | 'Over' | 'Optimal' | 'Low';

function tagFor(util: number): UtilTag {
  if (util < IDLE_THRESHOLD) return 'Idle';
  if (util > OVER_THRESHOLD) return 'Over';
  if (util < 50) return 'Low';
  return 'Optimal';
}

const TAG_TONE: Record<UtilTag, 'slate' | 'emerald' | 'amber' | 'red'> = {
  Idle: 'red',
  Over: 'amber',
  Low: 'slate',
  Optimal: 'emerald',
};

function barColor(util: number): string {
  if (util < IDLE_THRESHOLD) return 'bg-health-critical';
  if (util > OVER_THRESHOLD) return 'bg-health-warning';
  if (util < 50) return 'bg-slate-400';
  return 'bg-health-good';
}

export default function UtilizationPage() {
  const { toast } = useToast();

  const assets = useMemo(
    () =>
      [...mockAssets]
        .map((a) => ({ ...a, util: a.utilization ?? 0 }))
        .sort((a, b) => b.util - a.util),
    [],
  );

  const avgUtil = Math.round(assets.reduce((s, a) => s + a.util, 0) / assets.length);
  const idleCount = assets.filter((a) => a.util < IDLE_THRESHOLD).length;
  const overCount = assets.filter((a) => a.util > OVER_THRESHOLD).length;

  const rebalanceInsights = useMemo(
    () => mockInsights.filter((i) => i.type === 'Utilization'),
    [],
  );
  const rebalanceInr = rebalanceInsights.reduce((s, i) => s + (i.impactInr ?? 0), 0);

  // Per-zone aggregation (deterministic — driven by asset order in mock-data).
  const zones = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const a of mockAssets) {
      const zone = a.location.zone ?? a.location.name;
      const entry = map.get(zone) ?? { total: 0, count: 0 };
      entry.total += a.utilization ?? 0;
      entry.count += 1;
      map.set(zone, entry);
    }
    return [...map.entries()]
      .map(([zone, v]) => ({ zone, avg: Math.round(v.total / v.count), count: v.count }))
      .sort((a, b) => b.avg - a.avg);
  }, []);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Utilization Optimization"
        subtitle="Rebalance idle and over-used assets to lift fleet-wide utilization."
        breadcrumb={[{ label: 'AI Intelligence', href: '/ai-insights' }, { label: 'Utilization' }]}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Avg Utilization" value={`${avgUtil}%`} sub="Across active fleet" tone="primary" accent />
        <KpiCard label="Idle Assets" value={idleCount} sub={`Under ${IDLE_THRESHOLD}% used`} tone="red" />
        <KpiCard label="Over-Utilized" value={overCount} sub={`Above ${OVER_THRESHOLD}% used`} tone="amber" />
        <KpiCard label="Rebalancing Opportunity" value={formatMoney(rebalanceInr)} sub="Recoverable value" tone="emerald" />
      </div>

      {/* Per-zone heat + distribution */}
      <div className="glass-panel rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-heading font-bold text-slate-900">Utilization by Zone</h2>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-health-critical" /> Idle</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-health-good" /> Optimal</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-health-warning" /> Over</span>
          </div>
        </div>
        <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="w-full h-48" role="img" aria-label="Utilization by zone">
          {/* gridlines */}
          {[0, 25, 50, 75, 100].map((g) => {
            const y = 55 - (g / 100) * 50;
            return <line key={g} x1={8} y1={y} x2={100} y2={y} stroke="#e2e8f0" strokeWidth={0.3} />;
          })}
          {zones.map((z, i) => {
            const slot = 92 / zones.length;
            const bw = slot * 0.55;
            const x = 8 + i * slot + (slot - bw) / 2;
            const h = (z.avg / 100) * 50;
            const y = 55 - h;
            const fill = z.avg < IDLE_THRESHOLD ? '#ef4444' : z.avg > OVER_THRESHOLD ? '#f59e0b' : z.avg < 50 ? '#94a3b8' : '#10b981';
            return (
              <g key={z.zone}>
                <rect x={x} y={y} width={bw} height={h} rx={0.8} fill={fill} />
                <text x={x + bw / 2} y={y - 1.5} textAnchor="middle" fontSize={2.6} fill="#475569" fontWeight={700}>{z.avg}</text>
              </g>
            );
          })}
        </svg>
        <div className="mt-2 grid gap-1 text-[10px] text-slate-500" style={{ gridTemplateColumns: `repeat(${zones.length}, minmax(0, 1fr))`, paddingLeft: '8%' }}>
          {zones.map((z) => (
            <div key={z.zone} className="text-center truncate px-0.5" title={`${z.zone} · ${z.count} assets`}>{z.zone}</div>
          ))}
        </div>
      </div>

      {/* Asset utilization table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-heading font-bold text-slate-900">Assets by Utilization</h2>
          <p className="text-xs text-slate-500 mt-0.5">Sorted high to low. Idle and over-used assets are flagged for rebalancing.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="px-5 py-3">Asset</th>
                <th className="px-5 py-3">Zone</th>
                <th className="px-5 py-3 w-64">Utilization</th>
                <th className="px-5 py-3">Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.map((a) => {
                const tag = tagFor(a.util);
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link to={`/assets/${a.id}`} className="font-medium text-slate-900 hover:text-primary-600">{a.name}</Link>
                      <div className="text-xs text-slate-400">{a.category}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{a.location.zone ?? a.location.name}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className={cn('h-full rounded-full', barColor(a.util))} style={{ width: `${a.util}%` }} />
                        </div>
                        <span className="tabular-nums text-xs font-semibold text-slate-700 w-9 text-right">{a.util}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {(tag === 'Idle' || tag === 'Over') ? (
                        <Badge tone={TAG_TONE[tag]}>{tag}</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">{tag}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rebalancing suggestions */}
      <div>
        <h2 className="text-base font-heading font-bold text-slate-900 mb-3">Rebalancing Suggestions</h2>
        {rebalanceInsights.length === 0 ? (
          <div className="glass-panel rounded-xl">
            <EmptyState icon="⚖️" title="No rebalancing opportunities" description="Utilization is balanced across zones — the model is watching for new imbalances." />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {rebalanceInsights.map((ins) => (
              <article key={ins.id} className="glass-panel rounded-xl p-5 relative overflow-hidden">
                <div className="absolute left-0 top-0 h-full w-1.5 bg-health-good" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone="emerald">Utilization</Badge>
                      <span className="text-xs text-slate-400">{relTime(ins.createdAt)}</span>
                    </div>
                    <h3 className="text-lg font-heading font-bold text-slate-900 leading-snug">{ins.title}</h3>
                  </div>
                  {ins.impactInr !== undefined && (
                    <div className="text-right shrink-0">
                      <div className="text-xl font-heading font-bold text-health-good">{formatMoney(ins.impactInr)}</div>
                      {ins.impactLabel && <div className="text-xs text-slate-400">{ins.impactLabel}</div>}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-500">{ins.summary}</p>

                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Why this? · Explainable AI</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ins.drivers.map((d, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600">
                        <span className="text-primary-500">✓</span>{d}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 pt-4 border-t border-slate-200">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">Confidence</span>
                    <span className="tabular-nums">{ins.confidence}%</span>
                  </div>
                  <Button
                    onClick={() =>
                      toast({ title: 'Transfer initiated', description: `${ins.assetName ?? ins.title} · ${formatMoney(ins.impactInr ?? 0)} opportunity`, tone: 'success' })
                    }
                  >
                    Initiate Transfer
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
