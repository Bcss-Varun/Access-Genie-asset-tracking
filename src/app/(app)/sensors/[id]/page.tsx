'use client';

import { use } from 'react';
import Link from 'next/link';
import { getSensor, getGateway, getTelemetrySeries } from '@/lib/mock-data';
import type { Sensor, SensorStatus, TrendPoint } from '@/types/asset';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';

// ── token helpers ─────────────────────────────────────────────────────────────
type Tone = 'slate' | 'primary' | 'emerald' | 'amber' | 'red';

const statusTone = (s: SensorStatus): Tone =>
  s === 'Online' ? 'emerald' : s === 'Low Battery' ? 'amber' : 'red';

const statusHex = (s: SensorStatus): string =>
  s === 'Online' ? '#10b981' : s === 'Low Battery' ? '#f59e0b' : '#ef4444';

const kindEmoji = (k: string): string =>
  k === 'UWB Tag' ? '📶'
    : k === 'BLE Beacon' ? '🔵'
      : k === 'RFID Tag' ? '🏷️'
        : k === 'GPS Tracker' ? '🛰️'
          : k === 'LoRaWAN Sensor' ? '📡'
            : '🌡️';

const barHex = (pct: number): string =>
  pct > 60 ? '#10b981' : pct > 25 ? '#f59e0b' : '#ef4444';

// ── hand-rolled SVG line chart ────────────────────────────────────────────────
function LineChart({
  points,
  color,
  unit,
  label,
}: {
  points: TrendPoint[];
  color: string;
  unit?: string;
  label: string;
}) {
  const W = 100;
  const H = 34;
  const pad = 5;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = points.map((p, i) => {
    const x = points.length === 1 ? W / 2 : (i / (points.length - 1)) * W;
    const y = H - pad - ((p.value - min) / span) * (H - pad * 2);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const gid = `grad-${label.replace(/\s+/g, '')}`;
  const last = points[points.length - 1];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        <span className="text-lg font-bold font-heading tabular-nums" style={{ color }}>
          {last.value}
          {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 96 }} role="img" aria-label={`${label} — last 24 hours`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>{points[0].label}</span>
        <span>24h window</span>
        <span>{last.label}</span>
      </div>
    </div>
  );
}

// ── config stat row ────────────────────────────────────────────────────────────
function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className="text-xs font-semibold text-slate-700 tabular-nums">{value}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: barHex(value) }} />
      </div>
    </div>
  );
}

export default function SensorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const sensor: Sensor | undefined = getSensor(id);

  if (!sensor) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          title="Device not found"
          description={`No sensor matches "${id}".`}
          action={
            <Link href="/sensors">
              <Button variant="primary" size="sm">Back to devices</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const gateway = getGateway(sensor.gatewayId);

  // Live readings (only for asset-linked sensors).
  const batterySeries = sensor.assetId ? getTelemetrySeries(sensor.assetId, 'battery') : [];
  const secondMetric: 'temperature' | 'signal' =
    sensor.kind === 'Environmental' || sensor.kind === 'LoRaWAN Sensor' ? 'temperature' : 'signal';
  const secondSeries = sensor.assetId ? getTelemetrySeries(sensor.assetId, secondMetric) : [];

  // Synthesised recent events for the device.
  const events: { text: string; ts: string }[] = [
    { text: `Reading received via ${sensor.gatewayId}`, ts: sensor.lastReading },
    { text: typeof sensor.batteryLevel === 'number' ? `Battery reported at ${sensor.batteryLevel}%` : 'Battery not reported (line-powered)', ts: sensor.lastReading },
    { text: `Status: ${sensor.status}`, ts: sensor.lastReading },
    { text: `Firmware ${sensor.firmwareVersion} verified`, ts: sensor.lastReading },
    { text: `Provisioned on ${sensor.zone ?? 'facility'} network`, ts: sensor.lastReading },
  ];

  const configRows: { label: string; value: React.ReactNode }[] = [
    { label: 'Device ID', value: <span className="font-mono text-xs">{sensor.id}</span> },
    { label: 'Firmware', value: <span className="font-mono text-xs">{sensor.firmwareVersion}</span> },
    {
      label: 'Gateway',
      value: (
        <Link href={`/gateways/${sensor.gatewayId}`} className="text-primary-600 hover:underline">
          {gateway ? gateway.name : sensor.gatewayId}
        </Link>
      ),
    },
    { label: 'Zone', value: sensor.zone ?? '—' },
    {
      label: 'Linked asset',
      value: sensor.assetId ? (
        <Link href={`/assets/${sensor.assetId}`} className="text-primary-600 hover:underline">
          {sensor.assetName ?? sensor.assetId}
        </Link>
      ) : (
        <span className="text-slate-400">Unassigned</span>
      ),
    },
  ];

  const act = (name: string, tone: 'success' | 'info' = 'success') =>
    toast({ title: `${name} initiated`, description: `${sensor.name} (${sensor.id}) — command sent to ${sensor.gatewayId}.`, tone });

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={sensor.name}
        subtitle={`${sensor.kind}${sensor.zone ? ` · ${sensor.zone}` : ''}`}
        breadcrumb={[
          { label: 'Tracking', href: '/tracking' },
          { label: 'Sensors', href: '/sensors' },
          { label: sensor.name },
        ]}
        actions={
          <Badge tone={statusTone(sensor.status)} className="text-sm px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusHex(sensor.status) }} />
            {sensor.status}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Config card ───────────────────────────────────────────────────────── */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-1 space-y-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-2xl">
              {kindEmoji(sensor.kind)}
            </span>
            <div>
              <div className="font-bold font-heading text-slate-800">{sensor.kind}</div>
              <div className="text-xs text-slate-400">Last reading {relTime(sensor.lastReading)}</div>
            </div>
          </div>

          <dl className="divide-y divide-slate-100">
            {configRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-sm text-slate-500">{r.label}</dt>
                <dd className="text-sm font-medium text-slate-800 text-right">{r.value}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-3 pt-1">
            <StatBar label="Signal strength" value={sensor.signalStrength} />
            {typeof sensor.batteryLevel === 'number' ? (
              <StatBar label="Battery level" value={sensor.batteryLevel} />
            ) : (
              <div className="text-xs text-slate-400">Line-powered — no battery telemetry.</div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="primary" size="sm" onClick={() => act('Firmware OTA')}>Firmware OTA</Button>
            <Button variant="outline" size="sm" onClick={() => act('Calibration')}>Calibrate</Button>
            <Button variant="ghost" size="sm" onClick={() => act('Reboot', 'info')}>Reboot</Button>
          </div>
        </div>

        {/* ── Live readings + events ────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-800">Live Readings</h3>
              <p className="text-xs text-slate-500 mt-0.5">Rolling 24-hour telemetry window</p>
            </div>

            {sensor.assetId ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <LineChart points={batterySeries} color="#6366f1" unit="%" label="Battery" />
                <LineChart
                  points={secondSeries}
                  color={secondMetric === 'temperature' ? '#f97316' : '#10b981'}
                  unit={secondMetric === 'temperature' ? '°C' : '%'}
                  label={secondMetric === 'temperature' ? 'Temperature' : 'Signal'}
                />
              </div>
            ) : (
              <EmptyState
                title="No asset-linked telemetry"
                description="This device is not bound to a tracked asset, so no live time-series is available."
              />
            )}
          </div>

          <div className="glass-panel rounded-xl p-5">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Recent Events</h3>
            <ul className="space-y-3">
              {events.map((e, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">{e.text}</p>
                    <p className="text-xs text-slate-400">{relTime(e.ts)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
