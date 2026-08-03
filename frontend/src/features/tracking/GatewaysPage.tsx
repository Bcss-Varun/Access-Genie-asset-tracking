import { useQuery } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorState, KpiCard, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { ApiRequestError } from '@/lib/api-client';
import { relTime } from '@/lib/format';
import type { Tone } from '@/lib/tone';
import { trackingApi } from './tracking-api';

const STATUS_TONE: Record<string, Tone> = { Online: 'emerald', Degraded: 'amber', Offline: 'red' };

export function GatewaysPage() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['gateways'], queryFn: trackingApi.gateways });

  const online = data?.filter((g) => g.status === 'Online').length ?? 0;
  const devices = data?.reduce((sum, g) => sum + g.connectedDevices, 0) ?? 0;
  const avgUptime = data?.length ? Math.round(data.reduce((sum, g) => sum + g.uptimePct, 0) / data.length) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gateways & Readers"
        subtitle="The edge tier: readers, anchors and bridges that sensors report through."
        breadcrumb={[{ label: 'Real-Time Tracking' }, { label: 'Gateways' }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Gateways" value={data?.length ?? '—'} />
        <KpiCard label="Online" value={online} tone={online === data?.length ? 'emerald' : 'amber'} />
        <KpiCard label="Connected devices" value={devices} tone="primary" />
        <KpiCard label="Average uptime" value={`${avgUptime}%`} tone={avgUptime >= 99 ? 'emerald' : 'amber'} />
      </div>

      {error ? (
        <ErrorState title="Could not load gateways" description={error instanceof ApiRequestError ? error.message : undefined} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton rows={6} columns={5} />
      ) : data.length === 0 ? (
        <div className="glass-panel">
          <EmptyState icon="📡" title="No gateways registered" />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60">
                {['Gateway', 'Kind', 'Location', 'Devices', 'Uptime', 'Status', 'Last seen'].map((heading) => (
                  <th key={heading} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((gateway) => (
                <tr key={gateway.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="block font-medium text-slate-800">{gateway.name}</span>
                    <span className="block text-[11px] text-slate-400 font-mono">
                      {gateway.id}
                      {gateway.ip ? ` · ${gateway.ip}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{gateway.kind}</td>
                  <td className="px-4 py-3 text-slate-600">{gateway.location}</td>
                  <td className="px-4 py-3 text-slate-600 tabular-nums">{gateway.connectedDevices}</td>
                  <td className="px-4 py-3 text-slate-600 tabular-nums">{gateway.uptimePct}%</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[gateway.status] ?? 'slate'}>{gateway.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{relTime(gateway.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
