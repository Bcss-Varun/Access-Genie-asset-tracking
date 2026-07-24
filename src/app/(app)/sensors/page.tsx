'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { mockSensors } from '@/lib/mock-data';
import type { Sensor, SensorStatus, SensorKind } from '@/types/asset';
import { RegisterDeviceDialog } from '@/components/tracking/RegisterDeviceDialog';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime } from '@/lib/utils';

// ── token helpers ─────────────────────────────────────────────────────────────
type Tone = 'slate' | 'primary' | 'emerald' | 'amber' | 'red';

const statusTone = (s: SensorStatus): Tone =>
  s === 'Online' ? 'emerald' : s === 'Low Battery' ? 'amber' : 'red';

const kindTone = (k: SensorKind): Tone =>
  k === 'UWB Tag' ? 'primary'
    : k === 'BLE Beacon' ? 'emerald'
      : k === 'RFID Tag' ? 'amber'
        : k === 'GPS Tracker' ? 'red'
          : k === 'QR Label' ? 'primary'
            : 'slate';

const barHex = (pct: number): string =>
  pct > 60 ? '#10b981' : pct > 25 ? '#f59e0b' : '#ef4444';

// ── mini meters ───────────────────────────────────────────────────────────────
function Meter({ value, hint }: { value: number | undefined; hint?: string }) {
  if (typeof value !== 'number') {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <div className="flex items-center gap-2 min-w-[7rem]">
      <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: barHex(value) }}
        />
      </div>
      <span className="text-xs font-medium text-slate-600 tabular-nums w-8 text-right">
        {value}
        {hint}
      </span>
    </div>
  );
}

const STATUS_FILTERS: (SensorStatus | 'All')[] = ['All', 'Online', 'Low Battery', 'Offline'];
const KIND_FILTERS: SensorKind[] = ['RFID Tag', 'BLE Beacon', 'UWB Tag', 'GPS Tracker', 'QR Label', 'LoRaWAN Sensor', 'Environmental'];

export default function SensorsPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SensorStatus | 'All'>('All');
  const [kinds, setKinds] = useState<Set<SensorKind>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Registry is in-session state so newly-onboarded devices appear immediately.
  const [devices, setDevices] = useState<Sensor[]>(mockSensors);
  const [registerOpen, setRegisterOpen] = useState(false);

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const total = devices.length;
  const online = devices.filter((s) => s.status === 'Online').length;
  const lowBattery = devices.filter((s) => s.status === 'Low Battery').length;
  const offline = devices.filter((s) => s.status === 'Offline').length;

  // ── filtered rows ─────────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices.filter((s) => {
      if (status !== 'All' && s.status !== status) return false;
      if (kinds.size > 0 && !kinds.has(s.kind)) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.assetName?.toLowerCase().includes(q) ?? false) ||
        s.gatewayId.toLowerCase().includes(q) ||
        (s.tagId?.toLowerCase().includes(q) ?? false) ||
        (s.facility?.toLowerCase().includes(q) ?? false) ||
        (s.zone?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [devices, query, status, kinds]);

  const registerDevice = (device: Sensor) => {
    setDevices((prev) => [device, ...prev]);
    setRegisterOpen(false);
    setQuery('');
    setStatus('All');
    setKinds(new Set());
    toast({
      title: 'Device registered',
      description: `${device.name} (${device.id}) is live on ${device.gatewayId}${device.assetName ? ` and bonded to ${device.assetName}` : ' as spare stock'}.`,
      tone: 'success',
    });
  };

  const toggleKind = (k: SensorKind) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const visibleIds = rows.map((r) => r.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });

  const runBulk = (action: 'OTA update' | 'Calibrate') => {
    const n = selected.size;
    toast({
      title: `${action} queued`,
      description: `${n} device${n === 1 ? '' : 's'} scheduled for ${action.toLowerCase()}.`,
      tone: 'success',
    });
    setSelected(new Set());
  };

  const selectionActive = selected.size > 0;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Tag & Device Registry"
        subtitle="Every RFID, BLE, UWB, GPS, QR and LoRaWAN device on the RTLS grid — and where each one reports."
        breadcrumb={[
          { label: 'Real-Time Asset Tracking', href: '/tracking' },
          { label: 'Tag & Device Registry' },
        ]}
        actions={
          <>
            <Button variant="outline" size="md" onClick={() => setRegisterOpen(true)}>
              + Register device
            </Button>
            <Link href="/tracking">
              <Button variant="primary" size="md">Live map</Button>
            </Link>
          </>
        }
      />

      {/* ── KPI row ─────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Devices" value={total} sub="On RTLS grid" tone="primary" accent />
        <KpiCard label="Online" value={online} sub="Reporting normally" tone="emerald" />
        <KpiCard label="Low Battery" value={lowBattery} sub="Needs attention" tone="amber" />
        <KpiCard label="Offline" value={offline} sub="No recent reading" tone="red" />
      </div>

      {/* ── Toolbar: search + status chips + kind chips ─────────────────────────── */}
      <div className="glass-panel rounded-xl p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search devices, tag IDs, assets, gateways, facilities…"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((s) => {
              const on = status === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    on
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 mr-1">Kind</span>
          {KIND_FILTERS.map((k) => {
            const on = kinds.has(k);
            return (
              <button
                key={k}
                onClick={() => toggleKind(k)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                  on
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200',
                )}
              >
                {k}
              </button>
            );
          })}
          {kinds.size > 0 && (
            <button
              onClick={() => setKinds(new Set())}
              className="text-xs font-medium text-slate-400 hover:text-slate-700 ml-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Bulk action bar ─────────────────────────────────────────────────────── */}
      {selectionActive && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
          <span className="text-sm font-medium text-primary-900">
            {selected.size} device{selected.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => runBulk('Calibrate')}>Calibrate</Button>
            <Button variant="primary" size="sm" onClick={() => runBulk('OTA update')}>OTA update</Button>
            <button onClick={() => setSelected(new Set())} className="text-xs font-medium text-slate-500 hover:text-slate-800 ml-1">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Device table ────────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th className="px-4 py-3 font-semibold">Device</th>
                <th className="px-4 py-3 font-semibold">Kind</th>
                <th className="px-4 py-3 font-semibold">Tag ID</th>
                <th className="px-4 py-3 font-semibold">Linked Asset</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Battery</th>
                <th className="px-4 py-3 font-semibold">Gateway</th>
                <th className="px-4 py-3 font-semibold">Last Reading</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const checked = selected.has(s.id);
                return (
                  <tr
                    key={s.id}
                    className={cn(
                      'border-b border-slate-100 transition-colors',
                      checked ? 'bg-primary-50/50' : s.registeredInSession ? 'bg-emerald-50/60 hover:bg-emerald-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRow(s.id)}
                        aria-label={`Select ${s.name}`}
                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <Link href={`/sensors/${s.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                          {s.name}
                        </Link>
                        {s.registeredInSession && <Badge tone="emerald">New</Badge>}
                      </span>
                      <div className="text-xs text-slate-400">
                        {s.id}{s.zone ? ` · ${s.zone}` : ''}{s.facility ? ` · ${s.facility}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={kindTone(s.kind)}>{s.kind}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-500">{s.tagId ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {s.assetId ? (
                        <Link href={`/assets/${s.assetId}`} className="text-primary-600 hover:underline">
                          {s.assetName ?? s.assetId}
                        </Link>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(s.status)}>
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: s.status === 'Online' ? '#10b981' : s.status === 'Low Battery' ? '#f59e0b' : '#ef4444' }}
                        />
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3"><Meter value={s.batteryLevel} hint="%" /></td>
                    <td className="px-4 py-3">
                      <Link href={`/gateways/${s.gatewayId}`} className="text-primary-600 hover:underline font-medium">
                        {s.gatewayId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{relTime(s.lastReading)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <EmptyState
            variant="no-results"
            title="No devices match"
            description="Try a different search term, status or device kind."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setStatus('All');
                  setKinds(new Set());
                }}
              >
                Reset filters
              </Button>
            }
          />
        )}
      </div>

      {registerOpen && (
        <RegisterDeviceDialog
          devices={devices}
          onClose={() => setRegisterOpen(false)}
          onRegister={registerDevice}
        />
      )}
    </div>
  );
}
