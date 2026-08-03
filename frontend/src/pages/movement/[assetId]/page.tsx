import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getTrailForAsset, getAssetById, mockZones } from '@/lib/mock-data';
import type { ZoneType } from '@/types/asset';
import { PageHeader, EmptyState, KpiCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { relTime } from '@/lib/utils';

const ZONE_STYLE: Record<ZoneType, { fill: string; stroke: string }> = {
  warehouse: { fill: 'rgba(14,165,233,0.07)', stroke: 'rgba(14,165,233,0.40)' },
  dock: { fill: 'rgba(245,158,11,0.08)', stroke: 'rgba(245,158,11,0.40)' },
  office: { fill: 'rgba(139,92,246,0.08)', stroke: 'rgba(139,92,246,0.40)' },
  restricted: { fill: 'rgba(239,68,68,0.07)', stroke: 'rgba(239,68,68,0.45)' },
  lab: { fill: 'rgba(20,184,166,0.09)', stroke: 'rgba(20,184,166,0.40)' },
  yard: { fill: 'rgba(16,185,129,0.07)', stroke: 'rgba(16,185,129,0.40)' },
};

export default function TrailReplayPage() {
  const { assetId = '' } = useParams();
  const trail = getTrailForAsset(assetId);
  const asset = getAssetById(assetId);
  const assetName = trail?.assetName ?? asset?.name ?? assetId;

  const pointCount = trail?.points.length ?? 0;
  // Playhead index — how many waypoints are revealed (defaults to the full trail).
  const [head, setHead] = useState(Math.max(0, pointCount - 1));
  const [playing, setPlaying] = useState(false);

  // Auto-advance the playhead while "playing" (deterministic in render — the
  // interval only runs in an effect, never touches Date.now during render).
  useEffect(() => {
    if (!playing || pointCount === 0) return;
    const id = setInterval(() => {
      setHead((h) => {
        if (h >= pointCount - 1) {
          setPlaying(false);
          return h;
        }
        return h + 1;
      });
    }, 900);
    return () => clearInterval(id);
  }, [playing, pointCount]);

  if (!trail) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <PageHeader
          title="Movement Trail"
          breadcrumb={[
            { label: 'Tracking', href: '/tracking' },
            { label: 'Movement', href: '/movement' },
            { label: assetName },
          ]}
        />
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="🧭"
            title="No movement trail recorded"
            description={`We have no RTLS trail on file for ${assetName}. Trails appear once the asset's tag reports positional pings.`}
            action={
              <Link to="/movement">
                <Button variant="outline">← Back to Movement History</Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const revealed = trail.points.slice(0, head + 1);
  const polyPoints = revealed.map((p) => `${p.x},${p.y}`).join(' ');
  const current = trail.points[head];
  const maxDwell = Math.max(...trail.dwellZones.map((d) => d.minutes), 1);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={assetName}
        subtitle={`Movement replay · ${trail.points.length} waypoints · ${(trail.distanceM / 1000).toFixed(2)} km travelled`}
        breadcrumb={[
          { label: 'Tracking', href: '/tracking' },
          { label: 'Movement', href: '/movement' },
          { label: assetName },
        ]}
        actions={
          <Link to={`/assets/${assetId}`}>
            <Button variant="outline">View asset profile →</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Distance" value={`${(trail.distanceM / 1000).toFixed(2)} km`} sub={`${trail.distanceM.toLocaleString()} m`} tone="primary" accent />
        <KpiCard label="Waypoints" value={trail.points.length} sub="Positional pings" tone="slate" />
        <KpiCard label="Zones Visited" value={trail.dwellZones.length} sub="Distinct dwell zones" tone="emerald" />
        <KpiCard label="Total Dwell" value={`${trail.dwellZones.reduce((s, d) => s + d.minutes, 0)}m`} sub="Across all zones" tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Map + playhead */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Trail Replay</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Step {head + 1} of {trail.points.length}
                {current?.label ? ` · ${current.label}` : ''}
                {current ? ` · ${relTime(current.timestamp)}` : ''}
              </p>
            </div>
          </div>

          <div className="relative w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
            <svg viewBox="0 0 100 100" className="w-full h-auto block" role="img" aria-label={`Movement trail for ${assetName}`}>
              <defs>
                <pattern id="trGrid" width="5" height="5" patternUnits="userSpaceOnUse">
                  <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(100,116,139,0.14)" strokeWidth="0.15" />
                </pattern>
              </defs>

              <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
              <rect x="0" y="0" width="100" height="100" fill="url(#trGrid)" />
              <rect x="0.5" y="0.5" width="99" height="99" rx="2" fill="none" stroke="rgba(100,116,139,0.22)" strokeWidth="0.3" />

              {/* Zones */}
              {mockZones.map((z) => {
                const style = ZONE_STYLE[z.type];
                return (
                  <g key={z.id}>
                    <rect x={z.x} y={z.y} width={z.width} height={z.height} rx="1.5" fill={style.fill} stroke={style.stroke} strokeWidth="0.35" />
                    <text x={z.x + 2} y={z.y + 4} fontSize="2.4" fontWeight="600" fill="rgba(51,65,85,0.75)" className="font-heading select-none">
                      {z.name}
                    </text>
                  </g>
                );
              })}

              {/* Full path (faint) */}
              <polyline
                points={trail.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="rgba(14,165,233,0.20)"
                strokeWidth="0.5"
                strokeDasharray="1 1"
                strokeLinejoin="round"
              />

              {/* Revealed path */}
              {revealed.length > 1 && (
                <polyline
                  points={polyPoints}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="0.7"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {/* Waypoint dots */}
              {trail.points.map((p, i) => {
                const shown = i <= head;
                const isHead = i === head;
                return (
                  <g key={i} opacity={shown ? 1 : 0.25}>
                    {isHead && (
                      <circle cx={p.x} cy={p.y} r="2.6" fill="none" stroke="#6366f1" strokeWidth="0.5">
                        <animate attributeName="r" values="2.4;3.4;2.4" dur="1.6s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.9;0.2;0.9" dur="1.6s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle cx={p.x} cy={p.y} r="1.8" fill={isHead ? '#4f46e5' : shown ? '#6366f1' : '#cbd5e1'} stroke="#ffffff" strokeWidth="0.4" />
                    <text x={p.x} y={p.y + 0.9} fontSize="1.9" fontWeight="700" fill="#ffffff" textAnchor="middle" className="select-none">
                      {i + 1}
                    </text>
                    {p.label && shown && (
                      <text x={p.x + 3} y={p.y + 1} fontSize="2.1" fontWeight="600" fill="rgba(15,23,42,0.85)" className="font-heading select-none">
                        {p.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Playhead controls */}
          <div className="mt-4 flex items-center gap-4">
            <Button
              size="sm"
              variant={playing ? 'secondary' : 'primary'}
              onClick={() => {
                if (head >= pointCount - 1) setHead(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? '❚❚ Pause' : '▶ Play'}
            </Button>
            <input
              type="range"
              min={0}
              max={Math.max(0, pointCount - 1)}
              value={head}
              onChange={(e) => {
                setPlaying(false);
                setHead(Number(e.target.value));
              }}
              className="flex-1 accent-primary-600 cursor-pointer"
              aria-label="Trail playhead"
            />
            <span className="text-xs font-medium text-slate-500 tabular-nums w-16 text-right">
              {head + 1} / {pointCount}
            </span>
          </div>
        </div>

        {/* Dwell zones */}
        <div className="glass-panel rounded-xl p-5 flex flex-col lg:col-span-1">
          <h3 className="text-base font-semibold text-slate-800 mb-1">Dwell by Zone</h3>
          <p className="text-xs text-slate-500 mb-4">Time the asset lingered in each zone.</p>

          <div className="space-y-4">
            {trail.dwellZones.map((d) => (
              <div key={d.zone}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-slate-700">{d.zone}</span>
                  <span className="tabular-nums text-slate-500">{d.minutes}m</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary-500"
                    style={{ width: `${Math.round((d.minutes / maxDwell) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Total distance</span>
              <span className="font-semibold text-slate-900 tabular-nums">
                {trail.distanceM.toLocaleString()} m
              </span>
            </div>
            <Link
              to={`/assets/${assetId}`}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline"
            >
              Open asset profile →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
