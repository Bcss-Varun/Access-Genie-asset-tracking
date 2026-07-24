'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { mockAssets, mockZones, mockSensors, mockGeofences } from '@/lib/mock-data';
import type { Asset, ZoneType } from '@/types/asset';
import { PageHeader, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Facility registry (matches the picker on /twin)
// ─────────────────────────────────────────────────────────────────────────────
type Facility = { slug: string; name: string; locationName: string; building: string };
const FACILITIES: Facility[] = [
  { slug: 'central-warehouse', name: 'Central Warehouse', locationName: 'Central Warehouse', building: 'Building A' },
  { slug: 'hq-building', name: 'HQ Building', locationName: 'HQ Building', building: 'Floors 1–4 · Offices & IT Storeroom' },
  { slug: 'primary-data-center', name: 'Primary Data Center', locationName: 'Primary Data Center', building: 'Server Room Alpha' },
];

// ── Zone styling by type ─────────────────────────────────────────────────────
const ZONE_STYLE: Record<ZoneType, { fill: string; stroke: string; label: string }> = {
  warehouse: { fill: 'rgba(14,165,233,0.07)', stroke: 'rgba(14,165,233,0.40)', label: 'Warehouse' },
  dock: { fill: 'rgba(245,158,11,0.08)', stroke: 'rgba(245,158,11,0.40)', label: 'Loading Dock' },
  office: { fill: 'rgba(139,92,246,0.08)', stroke: 'rgba(139,92,246,0.40)', label: 'Office' },
  restricted: { fill: 'rgba(239,68,68,0.07)', stroke: 'rgba(239,68,68,0.45)', label: 'Restricted' },
  lab: { fill: 'rgba(20,184,166,0.09)', stroke: 'rgba(20,184,166,0.40)', label: 'Test Lab' },
  yard: { fill: 'rgba(16,185,129,0.07)', stroke: 'rgba(16,185,129,0.40)', label: 'Yard' },
};

function assetHex(a: Asset): string {
  if (a.status === 'Missing' || a.status === 'Maintenance' || a.healthStatus === 'Critical') return '#ef4444';
  if (a.healthStatus === 'Warning') return '#f59e0b';
  return '#10b981';
}
function assetPulses(a: Asset): boolean {
  return a.status === 'Missing' || a.healthStatus === 'Critical';
}

// ── Layer model ──────────────────────────────────────────────────────────────
type LayerKey = 'zones' | 'assets' | 'sensors' | 'heat' | 'geofences';
const LAYER_META: { key: LayerKey; label: string; icon: string; hint: string }[] = [
  { key: 'zones', label: 'Zones', icon: '▚', hint: 'Floor-plan areas' },
  { key: 'assets', label: 'Assets', icon: '●', hint: 'Tracked asset positions' },
  { key: 'sensors', label: 'Sensors', icon: '◆', hint: 'IoT tags & beacons' },
  { key: 'heat', label: 'Heat', icon: '◍', hint: 'Density & risk overlay' },
  { key: 'geofences', label: 'Geofences', icon: '⬚', hint: 'Boundary rules' },
];

const sensorHex = (s: (typeof mockSensors)[number]): string =>
  s.status === 'Offline' ? '#ef4444' : s.status === 'Low Battery' ? '#f59e0b' : '#10b981';

export default function TwinCanvasPage({ params }: { params: Promise<{ facility: string }> }) {
  const { facility: slug } = use(params);
  const { toast } = useToast();

  const facility = FACILITIES.find((f) => f.slug === slug);

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    zones: true,
    assets: true,
    sensors: false,
    heat: false,
    geofences: false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'2D' | '3D'>('2D');

  // ── Facility miss → EmptyState + link back ─────────────────────────────────
  if (!facility) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <PageHeader
          title="Facility not found"
          breadcrumb={[
            { label: 'Tracking', href: '/tracking' },
            { label: 'Digital Twin', href: '/twin' },
          ]}
        />
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="🏢"
            title="No such facility twin"
            description={`No facility matches "${slug}". It may have been decommissioned or the link is out of date.`}
            action={
              <Link
                href="/twin"
                className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                Back to Digital Twin
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const assets = mockAssets.filter((a) => a.location.name === facility.locationName && a.mapPosition);
  const assetIds = new Set(assets.map((a) => a.id));
  // Sensors bound to an in-facility asset (rendered near that asset), positioned by the asset dot.
  const sensors = mockSensors
    .map((s) => ({ sensor: s, asset: assets.find((a) => a.id === s.assetId) }))
    .filter((x): x is { sensor: (typeof mockSensors)[number]; asset: Asset } => Boolean(x.asset));

  const selected = selectedId ? assets.find((a) => a.id === selectedId) ?? null : null;
  const selectedSensor = selected ? mockSensors.find((s) => s.assetId === selected.id) : undefined;

  const toggle = (k: LayerKey) => setLayers((prev) => ({ ...prev, [k]: !prev[k] }));

  const onModeChange = (next: '2D' | '3D') => {
    if (next === '3D') {
      toast({
        title: '3D Twin coming soon',
        description: 'The volumetric WebGL model is in development — staying in 2D for now.',
        tone: 'info',
      });
      return;
    }
    setMode(next);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={`${facility.name} · Digital Twin`}
        subtitle={`${facility.building} · ${assets.length} tracked assets · ${sensors.length} live sensors`}
        breadcrumb={[
          { label: 'Tracking', href: '/tracking' },
          { label: 'Digital Twin', href: '/twin' },
          { label: facility.name },
        ]}
        actions={
          <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
            <button
              onClick={() => onModeChange('2D')}
              className={cn(
                'px-3 py-1.5 rounded-md font-medium transition-colors',
                mode === '2D' ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              2D
            </button>
            <button
              onClick={() => onModeChange('3D')}
              className="px-3 py-1.5 rounded-md font-medium text-slate-400 hover:bg-slate-100"
            >
              3D <span className="text-[10px] uppercase tracking-wide">(soon)</span>
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        {/* ── Canvas ────────────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 glass-panel rounded-xl p-5 flex flex-col min-h-0">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-800">Live 2D Model</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {facility.name} · streaming positions · click an asset to inspect
            </p>
          </div>

          <div className="relative w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
            <svg viewBox="0 0 100 100" className="w-full h-auto block" role="img" aria-label={`${facility.name} digital twin`}>
              <defs>
                <pattern id="twinGrid" width="5" height="5" patternUnits="userSpaceOnUse">
                  <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(100,116,139,0.14)" strokeWidth="0.15" />
                </pattern>
                {/* Per-asset radial heat gradients */}
                {assets.map((a) => {
                  const hex = assetHex(a);
                  return (
                    <radialGradient key={a.id} id={`heat-${a.id}`} cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor={hex} stopOpacity="0.55" />
                      <stop offset="55%" stopColor={hex} stopOpacity="0.22" />
                      <stop offset="100%" stopColor={hex} stopOpacity="0" />
                    </radialGradient>
                  );
                })}
              </defs>

              {/* Backdrop */}
              <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
              <rect x="0" y="0" width="100" height="100" fill="url(#twinGrid)" />
              <rect x="0.5" y="0.5" width="99" height="99" rx="2" fill="none" stroke="rgba(100,116,139,0.22)" strokeWidth="0.3" />

              {/* Heat layer (below zones so labels stay legible) */}
              {layers.heat &&
                assets.map((a) => {
                  const p = a.mapPosition!;
                  const r = assetPulses(a) ? 22 : a.healthStatus === 'Warning' ? 17 : 13;
                  return <circle key={`h-${a.id}`} cx={p.x} cy={p.y} r={r} fill={`url(#heat-${a.id})`} style={{ mixBlendMode: 'multiply' }} />;
                })}

              {/* Zones */}
              {layers.zones &&
                mockZones.map((z) => {
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

              {/* Geofences */}
              {layers.geofences &&
                mockGeofences.map((g) => (
                  <g key={g.id}>
                    <rect
                      x={g.x}
                      y={g.y}
                      width={g.width}
                      height={g.height}
                      rx="1"
                      fill="none"
                      stroke={g.active ? '#8b5cf6' : 'rgba(100,116,139,0.5)'}
                      strokeWidth="0.4"
                      strokeDasharray="1.6 1.2"
                    />
                    <text x={g.x + g.width - 1} y={g.y + g.height - 1.4} fontSize="1.9" fontWeight="600" textAnchor="end" fill={g.active ? '#7c3aed' : '#94a3b8'} className="select-none">
                      {g.rule}{g.breaches24h > 0 ? ` · ${g.breaches24h}⚠` : ''}
                    </text>
                  </g>
                ))}

              {/* Sensors (offset from their asset) */}
              {layers.sensors &&
                sensors.map(({ sensor, asset }) => {
                  const p = asset.mapPosition!;
                  const sx = p.x + 3.2;
                  const sy = p.y - 3.2;
                  const hex = sensorHex(sensor);
                  return (
                    <g key={sensor.id} className="pointer-events-none">
                      <line x1={p.x} y1={p.y} x2={sx} y2={sy} stroke={hex} strokeWidth="0.2" opacity="0.5" />
                      <rect x={sx - 1} y={sy - 1} width="2" height="2" transform={`rotate(45 ${sx} ${sy})`} fill={hex} stroke="#ffffff" strokeWidth="0.35" />
                    </g>
                  );
                })}

              {/* Assets */}
              {layers.assets &&
                assets.map((a) => {
                  const p = a.mapPosition!;
                  const hex = assetHex(a);
                  const isSel = a.id === selectedId;
                  return (
                    <g key={a.id} className="cursor-pointer" onClick={() => setSelectedId((prev) => (prev === a.id ? null : a.id))}>
                      <circle cx={p.x} cy={p.y} r="3.4" fill="transparent" />
                      {assetPulses(a) && (
                        <circle cx={p.x} cy={p.y} r="1.6" fill="none" stroke={hex} strokeWidth="0.4">
                          <animate attributeName="r" values="1.6;5.5" dur="1.9s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.55;0" dur="1.9s" repeatCount="indefinite" />
                        </circle>
                      )}
                      {isSel && (
                        <circle cx={p.x} cy={p.y} r="3.4" fill="none" stroke="#6366f1" strokeWidth="0.5" opacity="0.9">
                          <animate attributeName="r" values="3;3.6;3" dur="1.6s" repeatCount="indefinite" />
                        </circle>
                      )}
                      <circle cx={p.x} cy={p.y} r="2.4" fill={hex} opacity="0.22" />
                      <circle cx={p.x} cy={p.y} r="1.7" fill={hex} stroke="#ffffff" strokeWidth="0.5" />
                    </g>
                  );
                })}
            </svg>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
            <span className="font-semibold uppercase tracking-wide text-slate-400">Asset health</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-health-good" /> Good / Active</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-health-warning" /> Warning</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-health-critical" /> Critical / Maint. / Missing</span>
            <span className="mx-1 hidden h-3 w-px bg-slate-300 sm:inline-block" />
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 bg-emerald-500 ring-1 ring-white" /> Sensor</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-violet-500" /> Geofence</span>
          </div>
        </div>

        {/* ── Right rail: layers + inspector ────────────────────────────────── */}
        <div className="lg:col-span-1 flex flex-col gap-6 min-h-0">
          {/* Layer toggles */}
          <div className="glass-panel rounded-xl p-5">
            <h3 className="text-base font-semibold text-slate-800 mb-3">Layers</h3>
            <div className="flex flex-col gap-2">
              {LAYER_META.map((l) => {
                const on = layers[l.key];
                return (
                  <button
                    key={l.key}
                    onClick={() => toggle(l.key)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                      on ? 'border-primary-300 bg-primary-50' : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-md text-sm',
                        on ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-400',
                      )}
                    >
                      {l.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm font-medium', on ? 'text-primary-900' : 'text-slate-700')}>{l.label}</span>
                      <span className="block text-[11px] text-slate-400 truncate">{l.hint}</span>
                    </span>
                    <span
                      className={cn(
                        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                        on ? 'bg-primary-600' : 'bg-slate-300',
                      )}
                    >
                      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', on ? 'left-[1.125rem]' : 'left-0.5')} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Twin Inspector */}
          <div className="glass-panel rounded-xl p-5 flex-1 min-h-0 flex flex-col">
            <h3 className="text-base font-semibold text-slate-800 mb-3">Inspector</h3>
            {selected ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold font-heading leading-tight truncate">{selected.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{selected.id} · {selected.category}</div>
                  </div>
                  <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: assetHex(selected) }} />
                </div>

                {/* Health bar */}
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${selected.healthScore}%`, backgroundColor: assetHex(selected) }} />
                  </div>
                  <span className="text-[11px] font-semibold">{selected.healthScore}</span>
                </div>

                <dl className="grid grid-cols-1 gap-1.5 text-xs">
                  <Row label="Status" value={selected.status} />
                  <Row label="Health" value={selected.healthStatus} />
                  <Row label="Zone" value={selected.location.zone ?? selected.location.name} />
                  <Row label="Tracking" value={selected.trackingTech ?? '—'} />
                  <Row label="Last ping" value={selected.telemetry?.lastPing ? relTime(selected.telemetry.lastPing) : 'Unknown'} />
                  {selectedSensor && <Row label="Sensor" value={`${selectedSensor.name} (${selectedSensor.status})`} />}
                </dl>

                <div className="mt-1 flex items-center gap-2">
                  <Link href={`/assets/${selected.id}`} className="flex-1">
                    <Button size="sm" className="w-full">View asset →</Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>Clear</Button>
                </div>
              </div>
            ) : (
              <EmptyState
                icon="🛰️"
                title="No asset selected"
                description="Click any asset dot on the twin canvas to inspect its live status, zone and telemetry."
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800 text-right truncate">{value}</dd>
    </div>
  );
}
