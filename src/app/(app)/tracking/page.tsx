'use client';

import { useState } from 'react';
import Link from 'next/link';
import { mockAssets, mockZones } from '@/lib/mock-data';
import type { Asset, AssetStatus, ZoneType } from '@/types/asset';
import { PageHeader } from '@/components/ui/primitives';

// ─────────────────────────────────────────────────────────────────────────────
// Demo clock — the mock data anchors all timestamps to this instant, so we
// measure "time ago" against it (deterministic → no hydration drift).
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_NOW = Date.parse('2026-07-23T09:00:00.000Z');

function relTime(iso: string): string {
  const s = Math.max(0, Math.floor((DEMO_NOW - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Assets we flag as physically moving right now (drives the "In Motion" KPI +
// a subtle drift animation on the map). Deterministic, mobile asset classes.
const IN_MOTION = new Set(['AST-1001', 'AST-1005', 'AST-1014']);

// ── Zone styling by type (muted, glass-friendly fills) ───────────────────────
const ZONE_STYLE: Record<ZoneType, { fill: string; stroke: string; label: string }> = {
  warehouse: { fill: 'rgba(14,165,233,0.07)', stroke: 'rgba(14,165,233,0.40)', label: 'Warehouse' },
  dock: { fill: 'rgba(245,158,11,0.08)', stroke: 'rgba(245,158,11,0.40)', label: 'Loading Dock' },
  office: { fill: 'rgba(139,92,246,0.08)', stroke: 'rgba(139,92,246,0.40)', label: 'Office / Clinical' },
  restricted: { fill: 'rgba(239,68,68,0.07)', stroke: 'rgba(239,68,68,0.45)', label: 'Restricted' },
  lab: { fill: 'rgba(20,184,166,0.09)', stroke: 'rgba(20,184,166,0.40)', label: 'Lab / Cold Storage' },
  yard: { fill: 'rgba(16,185,129,0.07)', stroke: 'rgba(16,185,129,0.40)', label: 'Yard' },
};

// ── Marker visual by status / health ─────────────────────────────────────────
type MarkerVisual = { color: string; pulse: boolean; ring: boolean };
function markerVisual(a: Asset): MarkerVisual {
  if (a.status === 'Missing') return { color: '#ef4444', pulse: true, ring: true };
  if (a.status === 'Maintenance') return { color: '#ef4444', pulse: false, ring: false };
  if (a.healthStatus === 'Critical') return { color: '#ef4444', pulse: true, ring: false };
  if (a.healthStatus === 'Warning') return { color: '#f59e0b', pulse: false, ring: false };
  return { color: '#10b981', pulse: false, ring: false };
}

type FilterKey = 'All' | 'Active' | 'Warning' | 'Missing';
function matchesFilter(a: Asset, f: FilterKey): boolean {
  if (f === 'All') return true;
  if (f === 'Active') return a.status === 'Active';
  if (f === 'Warning') return a.healthStatus === 'Warning';
  return a.status === 'Missing';
}

// ── Status pill (matches the Asset Registry pattern) ─────────────────────────
function statusPillClass(status: AssetStatus): string {
  switch (status) {
    case 'Active':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
    case 'Maintenance':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
    case 'Missing':
      return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20';
  }
}

function healthFillClass(score: number): string {
  if (score > 80) return 'bg-health-good';
  if (score > 50) return 'bg-health-warning';
  return 'bg-health-critical';
}

export default function LiveTrackingPage() {
  const [filter, setFilter] = useState<FilterKey>('All');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeId = hoveredId ?? selectedId;
  const activeAsset = activeId ? mockAssets.find((a) => a.id === activeId) ?? null : null;

  // ── KPI values ─────────────────────────────────────────────────────────────
  const totalTracked = mockAssets.length;
  const activeCount = mockAssets.filter((a) => a.status === 'Active').length;
  const missingCount = mockAssets.filter((a) => a.status === 'Missing').length;
  const warningCount = mockAssets.filter((a) => a.healthStatus === 'Warning').length;
  const batteryAssets = mockAssets.filter((a) => typeof a.telemetry?.batteryLevel === 'number');
  const avgBattery = batteryAssets.length
    ? Math.round(
        batteryAssets.reduce((sum, a) => sum + (a.telemetry!.batteryLevel ?? 0), 0) /
          batteryAssets.length,
      )
    : 0;

  const filterChips: { key: FilterKey; label: string; count: number }[] = [
    { key: 'All', label: 'All', count: totalTracked },
    { key: 'Active', label: 'Active', count: activeCount },
    { key: 'Warning', label: 'Warning', count: warningCount },
    { key: 'Missing', label: 'Missing', count: missingCount },
  ];

  // Live feed — newest ping first, filtered by the active chip.
  const feed = mockAssets
    .filter((a) => matchesFilter(a, filter))
    .slice()
    .sort(
      (a, b) =>
        Date.parse(b.telemetry?.lastPing ?? '') - Date.parse(a.telemetry?.lastPing ?? ''),
    );

  const markers = mockAssets.filter((a) => a.mapPosition);

  type Kpi = {
    label: string;
    value: string;
    sub: string;
    accent: string;
    battery?: number;
  };
  const kpis: Kpi[] = [
    { label: 'Total Tracked', value: String(totalTracked), sub: 'Assets on RTLS grid', accent: 'text-slate-900' },
    { label: 'Active', value: String(activeCount), sub: 'Online & in service', accent: 'text-health-good' },
    { label: 'Missing', value: String(missingCount), sub: 'Custody exception', accent: 'text-health-critical' },
    { label: 'Avg Battery', value: `${avgBattery}%`, sub: `${batteryAssets.length} tagged devices`, accent: 'text-slate-900', battery: avgBattery },
  ];

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Live Tracking"
        subtitle="Real-time RTLS & GPS positioning across the facility floor-plan."
        actions={
          <select className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium">
            <option>Central Warehouse — Building A</option>
            <option>General Hospital — North Wing</option>
            <option>Primary Data Center</option>
          </select>
        }
      />

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="glass-panel p-5 rounded-xl">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{k.label}</div>
            <div className={`text-2xl sm:text-[28px] font-semibold font-heading tabular-nums ${k.accent}`}>{k.value}</div>
            {typeof k.battery === 'number' ? (
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full rounded-full ${healthFillClass(k.battery)}`}
                  style={{ width: `${k.battery}%` }}
                />
              </div>
            ) : (
              <div className="mt-2 text-xs font-medium text-slate-400">{k.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* ── Main: map + live feed ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Facility map */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-2 flex flex-col">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-800">Facility Floor-Plan</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Central Warehouse · Building A · {markers.length} tracked signals
            </p>
          </div>

          <div className="relative w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
            <svg viewBox="0 0 100 100" className="w-full h-auto block" role="img" aria-label="Facility live asset map">
              <defs>
                <pattern id="floorGrid" width="5" height="5" patternUnits="userSpaceOnUse">
                  <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(100,116,139,0.14)" strokeWidth="0.15" />
                </pattern>
              </defs>

              {/* Backdrop */}
              <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
              <rect x="0" y="0" width="100" height="100" fill="url(#floorGrid)" />
              <rect x="0.5" y="0.5" width="99" height="99" rx="2" fill="none" stroke="rgba(100,116,139,0.22)" strokeWidth="0.3" />

              {/* Zones */}
              {mockZones.map((z) => {
                const style = ZONE_STYLE[z.type];
                return (
                  <g key={z.id}>
                    <rect
                      x={z.x}
                      y={z.y}
                      width={z.width}
                      height={z.height}
                      rx="1.5"
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth="0.35"
                    />
                    <text
                      x={z.x + 2}
                      y={z.y + 4}
                      fontSize="2.4"
                      fontWeight="600"
                      fill="rgba(51,65,85,0.75)"
                      className="font-heading select-none"
                    >
                      {z.name}
                    </text>
                  </g>
                );
              })}

              {/* Asset markers */}
              {markers.map((a) => {
                const p = a.mapPosition!;
                const v = markerVisual(a);
                const isActive = a.id === activeId;
                const emphasized = filter === 'All' || matchesFilter(a, filter) || isActive;
                const moving = IN_MOTION.has(a.id);
                return (
                  <g
                    key={a.id}
                    className="transition-opacity duration-300 cursor-pointer"
                    opacity={emphasized ? 1 : 0.2}
                    onMouseEnter={() => setHoveredId(a.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setSelectedId((prev) => (prev === a.id ? null : a.id))}
                  >
                    {/* Larger invisible hit area for easier hover/click */}
                    <circle cx={p.x} cy={p.y} r="3.4" fill="transparent" />

                    <g>
                      {moving && (
                        <animateTransform
                          attributeName="transform"
                          type="translate"
                          values="0 0; 1.4 0.8; 0 0; -1.1 0.6; 0 0"
                          dur="6s"
                          repeatCount="indefinite"
                        />
                      )}

                      {/* Predictive / missing pulse */}
                      {v.pulse && (
                        <circle cx={p.x} cy={p.y} r="1.6" fill="none" stroke={v.color} strokeWidth="0.4">
                          <animate attributeName="r" values="1.6;5.5" dur="1.9s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.55;0" dur="1.9s" repeatCount="indefinite" />
                        </circle>
                      )}

                      {/* Missing → rotating "searching" ring */}
                      {v.ring && (
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="3"
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="0.45"
                          strokeDasharray="1.2 1.2"
                          opacity="0.85"
                        >
                          <animateTransform
                            attributeName="transform"
                            type="rotate"
                            from={`0 ${p.x} ${p.y}`}
                            to={`360 ${p.x} ${p.y}`}
                            dur="7s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}

                      {/* Selection highlight */}
                      {isActive && (
                        <circle cx={p.x} cy={p.y} r="3.4" fill="none" stroke="#6366f1" strokeWidth="0.5" opacity="0.9">
                          <animate attributeName="r" values="3;3.6;3" dur="1.6s" repeatCount="indefinite" />
                        </circle>
                      )}

                      {/* Soft halo + dot */}
                      <circle cx={p.x} cy={p.y} r="2.4" fill={v.color} opacity="0.22" />
                      <circle cx={p.x} cy={p.y} r="1.7" fill={v.color} stroke="#ffffff" strokeWidth="0.5" />
                    </g>
                  </g>
                );
              })}
            </svg>

            {/* Floating callout (HTML overlay for crisp, readable text) */}
            {activeAsset?.mapPosition && (
              <div
                className="pointer-events-none absolute z-20 w-56"
                style={{
                  left: `${activeAsset.mapPosition.x}%`,
                  top: `${activeAsset.mapPosition.y}%`,
                  transform: `translate(${
                    activeAsset.mapPosition.x < 24 ? '0%' : activeAsset.mapPosition.x > 76 ? '-100%' : '-50%'
                  }, ${activeAsset.mapPosition.y < 34 ? '16%' : '-116%'})`,
                }}
              >
                <div className="pointer-events-auto glass-panel rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 p-3 shadow-xl">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold font-heading leading-tight">{activeAsset.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {activeAsset.id} · {activeAsset.category}
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusPillClass(
                        activeAsset.status,
                      )}`}
                    >
                      {activeAsset.status}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${healthFillClass(activeAsset.healthScore)}`}
                        style={{ width: `${activeAsset.healthScore}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold">{activeAsset.healthScore}</span>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-slate-500">
                    <div className="flex justify-between gap-2">
                      <span>Zone</span>
                      <span className="text-slate-700 dark:text-slate-300 text-right truncate">
                        {activeAsset.location.zone ?? activeAsset.location.name}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Last ping</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {activeAsset.telemetry?.lastPing ? relTime(activeAsset.telemetry.lastPing) : 'Unknown'}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/assets/${activeAsset.id}`}
                    className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-primary-500 hover:underline"
                  >
                    View asset profile →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Legend — asset status */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-health-good" /> Good / Active
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-health-warning" /> Warning
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-health-critical" /> Critical / Maint.
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-dashed border-health-critical bg-health-critical/40" />{' '}
              Missing
            </span>
          </div>
        </div>

        {/* Live feed */}
        <div className="glass-panel rounded-xl p-5 flex flex-col lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-800">Live Asset Feed</h3>
            <span className="text-xs font-medium px-2 py-1 bg-primary-50 text-primary-700 rounded-full">
              {feed.length} shown
            </span>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            {filterChips.map((c) => {
              const on = filter === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    on
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-transparent hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {c.label}
                  <span className={`ml-1.5 ${on ? 'text-primary-100' : 'text-slate-400'}`}>{c.count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-0 max-h-[520px] lg:max-h-none overflow-y-auto pr-1 -mr-1 space-y-2">
            {feed.map((a) => {
              const v = markerVisual(a);
              const isActive = a.id === activeId;
              return (
                <div
                  key={a.id}
                  onMouseEnter={() => setHoveredId(a.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setSelectedId((prev) => (prev === a.id ? null : a.id))}
                  className={`group flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    isActive
                      ? 'border-primary-500/60 bg-primary-500/5'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30'
                  }`}
                >
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    {v.pulse && (
                      <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                        style={{ backgroundColor: v.color }}
                      />
                    )}
                    <span
                      className="relative inline-flex h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: v.color }}
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{a.name}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {a.telemetry?.lastPing ? relTime(a.telemetry.lastPing) : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-slate-500">
                        {a.location.zone ?? a.location.name}
                      </span>
                      <Link
                        href={`/assets/${a.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 text-[11px] font-medium text-primary-500 opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
                      >
                        View →
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}

            {feed.length === 0 && (
              <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                No assets match this filter.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
