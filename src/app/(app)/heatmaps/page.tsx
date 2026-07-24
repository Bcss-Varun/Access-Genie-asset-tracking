'use client';

import { useState } from 'react';
import { mockAssets, mockZones, mockTrails } from '@/lib/mock-data';
import type { MapZone, ZoneType } from '@/types/asset';
import { PageHeader, KpiCard } from '@/components/ui/primitives';

const ZONE_STYLE: Record<ZoneType, { fill: string; stroke: string }> = {
  warehouse: { fill: 'rgba(14,165,233,0.05)', stroke: 'rgba(14,165,233,0.35)' },
  dock: { fill: 'rgba(245,158,11,0.06)', stroke: 'rgba(245,158,11,0.35)' },
  office: { fill: 'rgba(139,92,246,0.06)', stroke: 'rgba(139,92,246,0.35)' },
  restricted: { fill: 'rgba(239,68,68,0.05)', stroke: 'rgba(239,68,68,0.40)' },
  lab: { fill: 'rgba(20,184,166,0.07)', stroke: 'rgba(20,184,166,0.35)' },
  yard: { fill: 'rgba(16,185,129,0.05)', stroke: 'rgba(16,185,129,0.35)' },
};

// Sequential single-hue ramp (sky), light → dark. Low density → high density.
const RAMP = ['#eef2ff', '#e0e7ff', '#c7d2fe', '#818cf8', '#6366f1', '#4f46e5'];
function heatColor(t: number): string {
  const idx = Math.min(RAMP.length - 1, Math.max(0, Math.round(t * (RAMP.length - 1))));
  return RAMP[idx];
}

type Metric = 'occupancy' | 'dwell' | 'movement';
const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: 'occupancy', label: 'Occupancy', unit: 'assets' },
  { key: 'dwell', label: 'Dwell', unit: 'min' },
  { key: 'movement', label: 'Movement', unit: 'pings' },
];

// Is an (x,y) point inside a zone rectangle?
function inZone(x: number, y: number, z: MapZone): boolean {
  return x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height;
}

// ── Deterministic per-zone density metrics (no randomness) ────────────────────
type ZoneStat = { zone: MapZone; occupancy: number; dwell: number; movement: number };

const zoneStats: ZoneStat[] = mockZones.map((z) => {
  const occupancy = mockAssets.filter((a) => a.mapPosition && inZone(a.mapPosition.x, a.mapPosition.y, z)).length;
  const dwell = mockTrails
    .flatMap((t) => t.dwellZones)
    .filter((d) => z.name.toLowerCase().includes(d.zone.toLowerCase()) || d.zone.toLowerCase().includes(z.name.toLowerCase()))
    .reduce((s, d) => s + d.minutes, 0);
  const movement = mockTrails
    .flatMap((t) => t.points)
    .filter((p) => inZone(p.x, p.y, z)).length;
  return { zone: z, occupancy, dwell, movement };
});

export default function HeatmapsPage() {
  const [metric, setMetric] = useState<Metric>('occupancy');

  const values = zoneStats.map((s) => s[metric]);
  const maxVal = Math.max(...values, 1);
  const activeMeta = METRICS.find((m) => m.key === metric)!;

  const totalAssetsPlaced = zoneStats.reduce((s, z) => s + z.occupancy, 0);
  const hottest = [...zoneStats].sort((a, b) => b[metric] - a[metric])[0];

  const assetMarkers = mockAssets.filter((a) => a.mapPosition);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Heatmaps"
        subtitle="Facility occupancy, dwell-time and movement density across the floor-plan."
        breadcrumb={[
          { label: 'Tracking', href: '/tracking' },
          { label: 'Heatmaps' },
        ]}
        actions={
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  metric === m.key ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Zones" value={mockZones.length} sub="Mapped floor areas" tone="primary" accent />
        <KpiCard label="Assets Placed" value={totalAssetsPlaced} sub="Positioned on grid" tone="slate" />
        <KpiCard label={`Peak ${activeMeta.label}`} value={`${hottest[metric]} ${activeMeta.unit}`} sub={hottest.zone.name} tone="red" />
        <KpiCard label="Active Trails" value={mockTrails.length} sub="Feeding movement density" tone="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Heatmap */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">{activeMeta.label} Density</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Hyderabad Central Warehouse · Building A · blob size &amp; shade scale with {activeMeta.label.toLowerCase()}
              </p>
            </div>
          </div>

          <div className="relative w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
            <svg viewBox="0 0 100 100" className="w-full h-auto block" role="img" aria-label={`${activeMeta.label} density heatmap`}>
              <defs>
                <pattern id="hmGrid" width="5" height="5" patternUnits="userSpaceOnUse">
                  <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(100,116,139,0.12)" strokeWidth="0.15" />
                </pattern>
                {zoneStats.map((s) => {
                  const t = s[metric] / maxVal;
                  const color = heatColor(t);
                  return (
                    <radialGradient key={s.zone.id} id={`blob-${s.zone.id}`} cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor={color} stopOpacity={t > 0 ? 0.72 : 0} />
                      <stop offset="55%" stopColor={color} stopOpacity={t > 0 ? 0.34 : 0} />
                      <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </radialGradient>
                  );
                })}
              </defs>

              <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
              <rect x="0" y="0" width="100" height="100" fill="url(#hmGrid)" />
              <rect x="0.5" y="0.5" width="99" height="99" rx="2" fill="none" stroke="rgba(100,116,139,0.22)" strokeWidth="0.3" />

              {/* Zones (faint base) */}
              {mockZones.map((z) => {
                const style = ZONE_STYLE[z.type];
                return (
                  <rect key={z.id} x={z.x} y={z.y} width={z.width} height={z.height} rx="1.5" fill={style.fill} stroke={style.stroke} strokeWidth="0.3" />
                );
              })}

              {/* Density blobs at zone centers */}
              {zoneStats.map((s) => {
                const t = s[metric] / maxVal;
                if (t <= 0) return null;
                const cx = s.zone.x + s.zone.width / 2;
                const cy = s.zone.y + s.zone.height / 2;
                const r = 7 + t * 14;
                return <circle key={s.zone.id} cx={cx} cy={cy} r={r} fill={`url(#blob-${s.zone.id})`} />;
              })}

              {/* Asset position dots */}
              {assetMarkers.map((a) => {
                const p = a.mapPosition!;
                return (
                  <circle key={a.id} cx={p.x} cy={p.y} r="0.9" fill="#0f172a" opacity="0.55" />
                );
              })}

              {/* Zone labels on top */}
              {mockZones.map((z) => (
                <text key={z.id} x={z.x + 2} y={z.y + 4} fontSize="2.3" fontWeight="600" fill="rgba(51,65,85,0.85)" className="font-heading select-none">
                  {z.name}
                </text>
              ))}
            </svg>
          </div>

          {/* Legend low → high */}
          <div className="mt-4 flex items-center gap-3">
            <span className="text-[11px] font-medium text-slate-500">Low</span>
            <div className="flex-1 flex h-2.5 rounded-full overflow-hidden">
              {RAMP.map((c) => (
                <div key={c} className="flex-1" style={{ backgroundColor: c }} />
              ))}
            </div>
            <span className="text-[11px] font-medium text-slate-500">High</span>
            <span className="ml-3 inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-900/60" /> Asset
            </span>
          </div>
        </div>

        {/* Zone density table */}
        <div className="glass-panel rounded-xl p-5 flex flex-col lg:col-span-1">
          <h3 className="text-base font-semibold text-slate-800 mb-1">Zone Density</h3>
          <p className="text-xs text-slate-500 mb-4">Ranked by {activeMeta.label.toLowerCase()}.</p>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                  <th className="pb-2 font-semibold">Zone</th>
                  <th className="pb-2 font-semibold text-right">{activeMeta.label}</th>
                  <th className="pb-2 font-semibold w-20">Density</th>
                </tr>
              </thead>
              <tbody>
                {[...zoneStats]
                  .sort((a, b) => b[metric] - a[metric])
                  .map((s) => {
                    const t = s[metric] / maxVal;
                    return (
                      <tr key={s.zone.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5">
                          <div className="font-medium text-slate-800 leading-tight">{s.zone.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {s.occupancy} assets · {s.dwell}m · {s.movement} pings
                          </div>
                        </td>
                        <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900">
                          {s[metric]}
                          <span className="ml-1 text-[10px] font-normal text-slate-400">{activeMeta.unit}</span>
                        </td>
                        <td className="py-2.5">
                          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.round(t * 100)}%`, backgroundColor: heatColor(t) }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
