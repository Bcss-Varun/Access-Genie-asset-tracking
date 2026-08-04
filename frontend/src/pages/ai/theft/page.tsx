import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allInsights, allAnomalies, allZones, getAssetById } from '@/lib/dataset';
import { cn, formatMoney, relTime } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/providers/ToastProvider';
import { useMutate } from '@/api/mutate';
import { alertsApi } from '@/api/alerts';
import { assetsApi } from '@/api/assets';

interface RiskItem {
  assetId: string;
  assetName: string;
  drivers: string[];
  confidence: number;
  description: string;
  lastSeenIso: string;
  impactInr: number;
  sources: string[];
}

const ZONE_FILL: Record<string, string> = {
  dock: '#eef2ff',
  warehouse: '#f1f5f9',
  lab: '#ede9fe',
  yard: '#ecfccb',
  office: '#fef9c3',
  restricted: '#fee2e2',
};

function buildRiskItems(): RiskItem[] {
  const byAsset = new Map<string, RiskItem>();

  for (const i of allInsights.filter((x) => x.type === 'Theft/Security')) {
    if (!i.assetId) continue;
    const asset = getAssetById(i.assetId);
    byAsset.set(i.assetId, {
      assetId: i.assetId,
      assetName: i.assetName ?? asset?.name ?? i.assetId,
      drivers: [...i.drivers],
      confidence: i.confidence,
      description: i.summary,
      lastSeenIso: asset?.telemetry?.lastPing ?? i.createdAt,
      impactInr: i.impactInr ?? asset?.bookValue ?? 0,
      sources: ['Theft/Security insight'],
    });
  }

  for (const a of allAnomalies.filter((x) => x.metric === 'Signal')) {
    const asset = getAssetById(a.assetId);
    const existing = byAsset.get(a.assetId);
    if (existing) {
      existing.sources.push('Signal-loss anomaly');
      existing.confidence = Math.max(existing.confidence, a.confidence);
      existing.drivers.push(`Signal anomaly ${a.zScore.toFixed(1)}σ`);
      existing.lastSeenIso = a.detectedAt;
    } else {
      byAsset.set(a.assetId, {
        assetId: a.assetId,
        assetName: a.assetName,
        drivers: [a.description, `Signal anomaly ${a.zScore.toFixed(1)}σ`],
        confidence: a.confidence,
        description: a.description,
        lastSeenIso: a.detectedAt,
        impactInr: asset?.bookValue ?? 0,
        sources: ['Signal-loss anomaly'],
      });
    }
  }

  return [...byAsset.values()].sort((x, y) => y.confidence - x.confidence);
}

export default function TheftPage() {
  const { toast } = useToast();
  const { run, isPending } = useMutate();
  const [acted, setActed] = useState<Set<string>>(new Set());
  const items = useMemo(buildRiskItems, []);

  /** Raise a critical alert, which is what actually puts this in front of somebody. */
  const startRecovery = async (item: RiskItem) => {
    const created = await run(
      alertsApi.create({
        title: `Recovery — ${item.assetName} at risk of loss`,
        severity: 'Critical',
        type: 'Security',
        assetId: item.assetId,
        source: `Theft-risk review · ${item.confidence}% confidence`,
      }),
      { describe: 'raise that recovery alert' },
    );
    if (!created) return;

    setActed((prev) => new Set(prev).add(item.assetId));
    toast({
      title: `${created.id} raised`,
      description: `${item.assetName} — critical, in the alert queue. Last seen ${relTime(item.lastSeenIso)}.`,
      tone: 'error',
    });
  };

  /**
   * Mark it missing.
   *
   * "Quarantine" was the old label and there is no quarantine state; `Missing`
   * is the real one, and it is what stops the asset being counted as available
   * everywhere else in the product.
   */
  const markMissing = (item: RiskItem) =>
    void run(assetsApi.update(item.assetId, { status: 'Missing' }), {
      success: `${item.assetName} marked missing`,
      successDetail: 'It no longer counts as available, and its risk score reflects it.',
      describe: 'mark that asset missing',
      refreshTracking: true,
    });

  const geofenceBreaches = items.filter((i) => i.drivers.some((d) => /geofence/i.test(d)) || /geofence/i.test(i.description)).length;
  const custodyGaps = items.filter((i) => i.drivers.some((d) => /custody/i.test(d)) || /custody/i.test(i.description)).length;
  const atRiskInr = items.reduce((s, i) => s + i.impactInr, 0);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Theft & Loss Detection"
        subtitle="Explainable loss-risk scoring from custody, geofence and signal signals."
        breadcrumb={[{ label: 'AI Intelligence', href: '/ai-insights' }, { label: 'Theft Detection' }]}
        actions={
          <Link to="/ai/anomaly">
            <Button variant="outline">Anomaly Feed</Button>
          </Link>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Loss-Risk Assets" value={items.length} sub="Flagged for review" tone="red" accent />
        <KpiCard label="Geofence Breaches" value={geofenceBreaches} sub="Boundary exits" tone="amber" />
        <KpiCard label="Custody Gaps" value={custodyGaps} sub="Unlogged handoffs" tone="amber" />
        <KpiCard label="Value at Risk" value={formatMoney(atRiskInr)} sub="Book value exposed" tone="primary" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Risk cards */}
        <div className="xl:col-span-2 space-y-4">
          {items.length === 0 ? (
            <div className="glass-panel rounded-xl">
              <EmptyState icon="🛡️" title="No loss-risk assets" description="Every tracked asset is within its geofence with an intact custody chain." />
            </div>
          ) : (
            items.map((item) => (
              <article key={item.assetId} className="glass-panel rounded-xl p-5 relative overflow-hidden">
                <div className="absolute left-0 top-0 h-full w-1.5 bg-health-critical" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge tone="red"><span className="h-1.5 w-1.5 rounded-full bg-health-critical" />Loss Risk</Badge>
                      {item.sources.map((s) => (
                        <span key={s} className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600">{s}</span>
                      ))}
                    </div>
                    <h3 className="text-lg font-heading font-bold text-slate-900">
                      <Link to={`/assets/${item.assetId}`} className="hover:text-primary-600">{item.assetName}</Link>
                    </h3>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-heading font-bold text-health-critical">{formatMoney(item.impactInr)}</div>
                    <div className="text-xs text-slate-400">at risk</div>
                  </div>
                </div>

                <p className="mt-2 text-sm text-slate-500">{item.description}</p>

                {/* Confidence + last seen */}
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[160px]">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-600">Risk confidence</span>
                      <span className="tabular-nums font-bold text-slate-900">{item.confidence}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-health-critical" style={{ width: `${item.confidence}%` }} />
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-600">Last seen:</span> {relTime(item.lastSeenIso)}
                  </div>
                </div>

                {/* Drivers */}
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Why flagged? · Explainable AI</div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.drivers.map((d, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600">
                        <span className="text-health-critical">!</span>{d}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 pt-4 border-t border-slate-200">
                  {/*
                    Both of these now write. "Start recovery" raises a critical
                    alert, which is what actually puts it in front of somebody;
                    "mark missing" changes the asset's status, which is what
                    stops it being counted as available and what every other
                    screen reads.
                  */}
                  <Button size="sm" variant="danger" disabled={isPending || acted.has(item.assetId)} onClick={() => void startRecovery(item)}>
                    {acted.has(item.assetId) ? 'Recovery raised' : 'Start recovery'}
                  </Button>
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => void markMissing(item)}>
                    Mark missing
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>

        {/* Facility map */}
        <div className="glass-panel rounded-xl p-5 self-start">
          <h2 className="text-base font-heading font-bold text-slate-900 mb-1">Facility Map</h2>
          <p className="text-xs text-slate-500 mb-3">At-risk asset positions marked in red.</p>
          <svg viewBox="0 0 100 100" className="w-full rounded-lg border border-slate-200 bg-slate-50" role="img" aria-label="Facility map with at-risk assets">
            {allZones.map((z) => (
              <g key={z.id}>
                <rect x={z.x} y={z.y} width={z.width} height={z.height} rx={1.5} fill={ZONE_FILL[z.type] ?? '#f1f5f9'} stroke="#cbd5e1" strokeWidth={0.4} />
                <text x={z.x + 1.5} y={z.y + 4} fontSize={2.3} fill="#64748b" fontWeight={600}>{z.name}</text>
              </g>
            ))}
            {items.map((item) => {
              const pos = getAssetById(item.assetId)?.mapPosition;
              if (!pos) return null;
              return (
                <g key={item.assetId}>
                  <circle cx={pos.x} cy={pos.y} r={3.4} fill="#ef4444" opacity={0.25}>
                    <animate attributeName="r" values="3.4;5;3.4" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.25;0;0.25" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={pos.x} cy={pos.y} r={1.8} fill="#ef4444" stroke="#fff" strokeWidth={0.6} />
                </g>
              );
            })}
          </svg>
          <div className="mt-3 space-y-1.5">
            {items.map((item) => {
              const asset = getAssetById(item.assetId);
              return (
                <Link key={item.assetId} to={`/assets/${item.assetId}`} className="flex items-center gap-2 text-xs text-slate-600 hover:text-primary-600">
                  <span className={cn('h-2 w-2 rounded-full bg-health-critical shrink-0')} />
                  <span className="truncate">{item.assetName}</span>
                  <span className="ml-auto text-slate-400 shrink-0">{asset?.location.zone ?? asset?.location.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
