'use client';

import { use } from 'react';
import Link from 'next/link';
import { getGateway, getSensorsForGateway } from '@/lib/mock-data';
import type { GatewayStatus, SensorStatus } from '@/types/asset';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime } from '@/lib/utils';

const gwStatusTone = (s: GatewayStatus): 'emerald' | 'amber' | 'red' =>
  s === 'Online' ? 'emerald' : s === 'Degraded' ? 'amber' : 'red';

const gwStatusDot: Record<GatewayStatus, string> = {
  Online: 'bg-emerald-500',
  Degraded: 'bg-amber-500',
  Offline: 'bg-red-500',
};

const sensorStatusTone = (s: SensorStatus): 'emerald' | 'amber' | 'red' =>
  s === 'Online' ? 'emerald' : s === 'Low Battery' ? 'amber' : 'red';

const uptimeColor = (u: number): string =>
  u >= 99 ? 'bg-emerald-500' : u >= 95 ? 'bg-amber-500' : 'bg-red-500';

const batteryColor = (b: number): string =>
  b > 50 ? 'bg-emerald-500' : b > 20 ? 'bg-amber-500' : 'bg-red-500';

const signalColor = (v: number): string =>
  v > 70 ? 'bg-emerald-500' : v > 40 ? 'bg-amber-500' : 'bg-red-500';

export default function GatewayDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const gateway = getGateway(id);

  if (!gateway) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          icon="📡"
          title="Gateway not found"
          description={`No gateway with id “${id}” exists in this session.`}
          action={<Link href="/gateways"><Button variant="outline">← Back to Gateways</Button></Link>}
        />
      </div>
    );
  }

  const sensors = getSensorsForGateway(gateway.id);

  const stats: { label: string; value: React.ReactNode }[] = [
    { label: 'Firmware', value: <span className="font-mono">{gateway.firmwareVersion}</span> },
    { label: 'IP Address', value: <span className="font-mono">{gateway.ip ?? '—'}</span> },
    { label: 'Location', value: gateway.location },
    { label: 'Connected Devices', value: `${gateway.connectedDevices}` },
    { label: 'Last Seen', value: relTime(gateway.lastSeen) },
  ];

  const td = 'px-4 py-3.5';
  const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={gateway.name}
        subtitle={`${gateway.kind} · ${gateway.id}`}
        breadcrumb={[
          { label: 'Tracking', href: '/tracking' },
          { label: 'Gateways', href: '/gateways' },
          { label: gateway.name },
        ]}
        actions={
          <span className="inline-flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', gwStatusDot[gateway.status])} />
            <Badge tone={gwStatusTone(gateway.status)} className="text-sm px-3 py-1">{gateway.status}</Badge>
          </span>
        }
      />

      <div className="glass-panel rounded-xl p-5 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-[200px]">
            <div className="text-sm font-medium text-slate-500 mb-1">Uptime (30d)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-heading text-slate-900 tabular-nums">{gateway.uptimePct}%</span>
            </div>
            <div className="mt-2 w-56 max-w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div className={cn('h-full rounded-full', uptimeColor(gateway.uptimePct))} style={{ width: `${gateway.uptimePct}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => toast({ title: 'Firmware Update', description: `Queued OTA update for ${gateway.name}.`, tone: 'info' })}>
              Firmware Update
            </Button>
            <Button variant="outline" onClick={() => toast({ title: 'Reboot requested', description: `${gateway.name} will restart shortly.`, tone: 'success' })}>
              Reboot
            </Button>
            <Button variant="outline" onClick={() => toast({ title: 'Diagnostics', description: `Running diagnostics on ${gateway.name}…`, tone: 'info' })}>
              Diagnostics
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-4 border-t border-slate-100">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-xs text-slate-400">{s.label}</div>
              <div className="mt-0.5 text-sm font-medium text-slate-700 truncate">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-xl flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Child Devices</h2>
          <span className="text-xs text-slate-400">{sensors.length} sensors</span>
        </div>

        {sensors.length === 0 ? (
          <EmptyState
            icon="🔌"
            title="No sensors linked"
            description="This gateway currently has no child devices reporting through it."
          />
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className={th}>Sensor</th>
                  <th className={th}>Kind</th>
                  <th className={th}>Status</th>
                  <th className={th}>Battery</th>
                  <th className={th}>Signal</th>
                  <th className={th}>Linked Asset</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sensors.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className={td}>
                      <Link href={`/sensors/${s.id}`} className="font-medium text-slate-900 hover:text-primary-600">{s.name}</Link>
                      <div className="text-xs text-slate-400">{s.id}{s.zone ? ` · ${s.zone}` : ''}</div>
                    </td>
                    <td className={td}><Badge tone="slate">{s.kind}</Badge></td>
                    <td className={td}><Badge tone={sensorStatusTone(s.status)}>{s.status}</Badge></td>
                    <td className={td}>
                      {s.batteryLevel != null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div className={cn('h-full rounded-full', batteryColor(s.batteryLevel))} style={{ width: `${s.batteryLevel}%` }} />
                          </div>
                          <span className="text-xs font-medium tabular-nums text-slate-600">{s.batteryLevel}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div className={cn('h-full rounded-full', signalColor(s.signalStrength))} style={{ width: `${s.signalStrength}%` }} />
                        </div>
                        <span className="text-xs font-medium tabular-nums text-slate-600">{s.signalStrength}%</span>
                      </div>
                    </td>
                    <td className={td}>
                      {s.assetId ? (
                        <Link href={`/assets/${s.assetId}`} className="text-primary-600 hover:text-primary-700 font-medium">
                          {s.assetName ?? s.assetId}
                        </Link>
                      ) : (
                        <span className="text-slate-400">Standalone</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
