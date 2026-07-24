import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { LiveMapPayload } from '@access-genie/shared';
import { Badge, ErrorState, KpiCard, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { cn, relTime } from '@/lib/format';
import { healthTone } from '@/lib/tone';
import { trackingApi } from './tracking-api';

const ZONE_FILL: Record<string, string> = {
  warehouse: 'fill-slate-100',
  dock: 'fill-amber-50',
  office: 'fill-primary-50',
  restricted: 'fill-red-50',
  lab: 'fill-emerald-50',
  yard: 'fill-slate-50',
};

const DOT_FILL: Record<string, string> = {
  Good: 'fill-health-good',
  Warning: 'fill-health-warning',
  Critical: 'fill-health-critical',
};

export function LiveMapPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [showGeofences, setShowGeofences] = useState(true);

  const { data, isPending, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['tracking', 'live'],
    queryFn: trackingApi.live,
    // The map is a live view; poll rather than making the user reload. A socket
    // is the right answer at scale (docs/11) — this is the honest version of it.
    refetchInterval: 30_000,
  });

  if (error) {
    return (
      <ErrorState
        title="Could not load the live map"
        description={error instanceof ApiRequestError ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const selectedAsset = data?.assets.find((a) => a.id === selected);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Asset Map"
        subtitle="Real-time positions across RFID, BLE, GPS, QR and UWB."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowGeofences((v) => !v)}>
              {showGeofences ? '👁️ Geofences on' : '🚫 Geofences off'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              ↻ Refresh
            </Button>
          </>
        }
      />

      {isPending ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-[420px]" />
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Tracked assets" value={data.stats.tracked} sub={`${data.stats.online} devices online`} tone="primary" accent />
            <KpiCard label="Active geofences" value={data.stats.activeGeofences} sub={`${data.geofences.length} defined`} />
            <KpiCard label="Breaches (24h)" value={data.stats.breaches24h} tone={data.stats.breaches24h > 0 ? 'amber' : 'emerald'} />
            <KpiCard
              label="Technology mix"
              value={data.stats.byTech.length}
              sub={data.stats.byTech.map((t) => `${t.tech} ${t.count}`).join(' · ')}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* ── Floor plan ────────────────────────────────────────────── */}
            <div className="glass-panel p-4 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-base font-semibold text-slate-800">Facility floor plan</h2>
                <span className="text-[11px] text-slate-400">Updated {relTime(new Date(dataUpdatedAt).toISOString())}</span>
              </div>

              <svg viewBox="0 0 100 70" className="w-full h-auto rounded-lg border border-slate-200 bg-slate-50/40" role="img" aria-label="Facility floor plan with tracked asset positions">
                {data.zones.map((zone) => (
                  <g key={zone.id}>
                    <rect
                      x={zone.x}
                      y={zone.y * 0.7}
                      width={zone.width}
                      height={zone.height * 0.7}
                      className={cn(ZONE_FILL[zone.type] ?? 'fill-slate-100', 'stroke-slate-200')}
                      strokeWidth={0.2}
                      rx={1}
                    />
                    <text x={zone.x + 1.5} y={zone.y * 0.7 + 3} className="fill-slate-400 text-[2px] font-medium">
                      {zone.name}
                    </text>
                  </g>
                ))}

                {showGeofences &&
                  data.geofences
                    .filter((fence) => fence.active)
                    .map((fence) => (
                      <rect
                        key={fence.id}
                        x={fence.x}
                        y={fence.y * 0.7}
                        width={fence.width}
                        height={fence.height * 0.7}
                        fill="none"
                        className={fence.rule === 'Restricted' ? 'stroke-health-critical' : 'stroke-primary-400'}
                        strokeWidth={0.3}
                        strokeDasharray="1 0.8"
                        rx={1}
                      />
                    ))}

                {data.assets.map((asset) => (
                  <g
                    key={asset.id}
                    onClick={() => setSelected(asset.id === selected ? null : asset.id)}
                    className="cursor-pointer"
                  >
                    {/* Generous transparent hit target — the visible dot is 1.2 units. */}
                    <circle cx={asset.mapPosition.x} cy={asset.mapPosition.y * 0.7} r={2.5} fill="transparent" />
                    <circle
                      cx={asset.mapPosition.x}
                      cy={asset.mapPosition.y * 0.7}
                      r={selected === asset.id ? 1.8 : 1.2}
                      className={cn(DOT_FILL[asset.healthStatus] ?? 'fill-slate-400', 'stroke-white')}
                      strokeWidth={0.35}
                    />
                  </g>
                ))}
              </svg>

              <div className="flex flex-wrap items-center gap-4 mt-3 text-[11px] text-slate-500">
                {(['Good', 'Warning', 'Critical'] as const).map((band) => (
                  <span key={band} className="flex items-center gap-1.5">
                    <span className={cn('h-2 w-2 rounded-full', band === 'Good' ? 'bg-health-good' : band === 'Warning' ? 'bg-health-warning' : 'bg-health-critical')} />
                    {band}
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-3 border border-dashed border-health-critical rounded-[2px]" />
                  Restricted geofence
                </span>
              </div>
            </div>

            {/* ── Asset list / selection ────────────────────────────────── */}
            <div className="glass-panel overflow-hidden flex flex-col">
              <header className="px-5 py-3.5 border-b border-slate-100">
                <h2 className="font-heading text-sm font-semibold text-slate-800">
                  {selectedAsset ? 'Selected asset' : `Tracked assets (${data.assets.length})`}
                </h2>
              </header>

              {selectedAsset ? (
                <div className="p-5 space-y-3">
                  <div>
                    <Link to={`/assets/${selectedAsset.id}`} className="font-medium text-slate-800 hover:text-primary-700">
                      {selectedAsset.name}
                    </Link>
                    <p className="text-[11px] text-slate-400">{selectedAsset.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={healthTone[selectedAsset.healthStatus]}>{selectedAsset.healthStatus}</Badge>
                    {selectedAsset.trackingTech && <Badge tone="primary">{selectedAsset.trackingTech}</Badge>}
                  </div>
                  {selectedAsset.trackingId && <p className="text-[11px] font-mono text-slate-500">{selectedAsset.trackingId}</p>}
                  {selectedAsset.zone && <p className="text-sm text-slate-600">Zone: {selectedAsset.zone}</p>}
                  {selectedAsset.lastPing && <p className="text-[11px] text-slate-400">Last ping {relTime(selectedAsset.lastPing)}</p>}
                  <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>
                    Clear selection
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 overflow-y-auto max-h-[420px]">
                  {data.assets.map((asset) => (
                    <li key={asset.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(asset.id)}
                        className="w-full text-left px-5 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-2.5"
                      >
                        <span className={cn('h-2 w-2 rounded-full shrink-0', asset.healthStatus === 'Good' ? 'bg-health-good' : asset.healthStatus === 'Warning' ? 'bg-health-warning' : 'bg-health-critical')} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-slate-700 truncate">{asset.name}</span>
                          <span className="block text-[10px] text-slate-400">{asset.zone ?? asset.id}</span>
                        </span>
                        {asset.trackingTech && <span className="text-[10px] text-slate-400 shrink-0">{asset.trackingTech}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export type { LiveMapPayload };
