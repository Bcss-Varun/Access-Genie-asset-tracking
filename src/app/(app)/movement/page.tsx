'use client';

import { useState } from 'react';
import Link from 'next/link';
import { mockAssets, mockZones, mockTrails } from '@/lib/mock-data';
import type { Asset, ZoneType } from '@/types/asset';
import { PageHeader, KpiCard } from '@/components/ui/primitives';
import { relTime } from '@/lib/utils';

// ── Zone styling by type (muted fills, dark labels — matches Live Map) ────────
const ZONE_STYLE: Record<ZoneType, { fill: string; stroke: string }> = {
  warehouse: { fill: 'rgba(14,165,233,0.07)', stroke: 'rgba(14,165,233,0.40)' },
  dock: { fill: 'rgba(245,158,11,0.08)', stroke: 'rgba(245,158,11,0.40)' },
  office: { fill: 'rgba(139,92,246,0.08)', stroke: 'rgba(139,92,246,0.40)' },
  restricted: { fill: 'rgba(239,68,68,0.07)', stroke: 'rgba(239,68,68,0.45)' },
  lab: { fill: 'rgba(20,184,166,0.09)', stroke: 'rgba(20,184,166,0.40)' },
  yard: { fill: 'rgba(16,185,129,0.07)', stroke: 'rgba(16,185,129,0.40)' },
};

const healthHex = (score: number): string =>
  score > 80 ? '#10b981' : score > 50 ? '#f59e0b' : '#ef4444';

const trailAssetIds = new Set(mockTrails.map((t) => t.assetId));

export default function MovementHistoryPage() {
  const [activeId, setActiveId] = useState<string | null>(null);

  // ── KPI values (deterministic — derived from static mock data) ──────────────
  const assetsTracked = mockAssets.filter((a) => a.mapPosition).length;
  const totalDistanceM = mockTrails.reduce((sum, t) => sum + t.distanceM, 0);
  const dwellSpans = mockTrails.flatMap((t) => t.dwellZones.map((d) => d.minutes));
  const avgDwell = dwellSpans.length
    ? Math.round(dwellSpans.reduce((s, m) => s + m, 0) / dwellSpans.length)
    : 0;
  const activeTrails = mockTrails.length;

  const markers = mockAssets.filter((a) => a.mapPosition);

  // Assets ordered: those with recorded trails first, then the rest.
  const rows = [...mockAssets]
    .filter((a) => a.mapPosition)
    .sort((a, b) => {
      const at = trailAssetIds.has(a.id) ? 0 : 1;
      const bt = trailAssetIds.has(b.id) ? 0 : 1;
      if (at !== bt) return at - bt;
      return a.id.localeCompare(b.id);
    });

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Movement History"
        subtitle="Replay asset trails, dwell-time and floor-plan traffic across the facility."
        breadcrumb={[
          { label: 'Tracking', href: '/tracking' },
          { label: 'Movement History' },
        ]}
      />

      {/* ── KPI strip ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Assets Tracked" value={assetsTracked} sub="On the RTLS grid" tone="primary" accent />
        <KpiCard label="Distance Today" value={`${(totalDistanceM / 1000).toFixed(2)} km`} sub={`${totalDistanceM.toLocaleString()} m across trails`} tone="slate" />
        <KpiCard label="Avg Dwell" value={`${avgDwell}m`} sub="Per recorded zone" tone="amber" />
        <KpiCard label="Active Trails" value={activeTrails} sub="With movement replay" tone="emerald" />
      </div>

      {/* ── Main: map + asset list ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Facility map */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-2 flex flex-col">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-800">Facility Floor-Plan</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Central Warehouse · Building A · {markers.length} current positions
            </p>
          </div>

          <div className="relative w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
            <svg viewBox="0 0 100 100" className="w-full h-auto block" role="img" aria-label="Facility asset position map">
              <defs>
                <pattern id="mvGrid" width="5" height="5" patternUnits="userSpaceOnUse">
                  <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(100,116,139,0.14)" strokeWidth="0.15" />
                </pattern>
              </defs>

              <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
              <rect x="0" y="0" width="100" height="100" fill="url(#mvGrid)" />
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

              {/* Asset markers */}
              {markers.map((a: Asset) => {
                const p = a.mapPosition!;
                const hasTrail = trailAssetIds.has(a.id);
                const isActive = a.id === activeId;
                const color = hasTrail ? '#6366f1' : healthHex(a.healthScore);
                return (
                  <g
                    key={a.id}
                    className="cursor-pointer"
                    opacity={activeId && !isActive ? 0.35 : 1}
                    onMouseEnter={() => setActiveId(a.id)}
                    onMouseLeave={() => setActiveId(null)}
                  >
                    <circle cx={p.x} cy={p.y} r="3.4" fill="transparent" />
                    {isActive && (
                      <circle cx={p.x} cy={p.y} r="3" fill="none" stroke="#6366f1" strokeWidth="0.5" opacity="0.9" />
                    )}
                    <circle cx={p.x} cy={p.y} r="2.3" fill={color} opacity="0.22" />
                    <circle cx={p.x} cy={p.y} r={hasTrail ? 1.8 : 1.5} fill={color} stroke="#ffffff" strokeWidth="0.5" />
                    {hasTrail && (
                      <circle cx={p.x} cy={p.y} r="2.9" fill="none" stroke="#6366f1" strokeWidth="0.35" strokeDasharray="0.9 0.9" opacity="0.7" />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-dashed border-primary-500 bg-primary-500/40" /> Recorded trail
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-health-good" /> Good
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-health-warning" /> Warning
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-health-critical" /> Critical
            </span>
          </div>
        </div>

        {/* Asset list */}
        <div className="glass-panel rounded-xl p-5 flex flex-col lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-800">Assets</h3>
            <span className="text-xs font-medium px-2 py-1 bg-primary-50 text-primary-700 rounded-full">
              {activeTrails} with trails
            </span>
          </div>

          <div className="flex-1 min-h-0 max-h-[560px] lg:max-h-none overflow-y-auto pr-1 -mr-1 space-y-2">
            {rows.map((a) => {
              const trail = mockTrails.find((t) => t.assetId === a.id);
              const isActive = a.id === activeId;
              const p = a.mapPosition!;
              const content = (
                <div
                  onMouseEnter={() => setActiveId(a.id)}
                  onMouseLeave={() => setActiveId(null)}
                  className={`group flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    isActive
                      ? 'border-primary-500/60 bg-primary-500/5'
                      : 'border-slate-200 hover:bg-slate-50'
                  } ${trail ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: trail ? '#6366f1' : healthHex(a.healthScore) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{a.name}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {a.telemetry?.lastPing ? relTime(a.telemetry.lastPing) : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-slate-500">
                        {a.location.zone ?? a.location.name} · ({p.x}, {p.y})
                      </span>
                      {trail ? (
                        <span className="shrink-0 text-[11px] font-medium text-primary-500 group-hover:underline">
                          Replay →
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-slate-300">No trail</span>
                      )}
                    </div>
                    {trail && (
                      <div className="mt-1 text-[11px] text-slate-400">
                        {(trail.distanceM / 1000).toFixed(2)} km · {trail.points.length} waypoints
                      </div>
                    )}
                  </div>
                </div>
              );
              return trail ? (
                <Link key={a.id} href={`/movement/${a.id}`} className="block">
                  {content}
                </Link>
              ) : (
                <div key={a.id}>{content}</div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
