import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mockGateways } from '@/lib/mock-data';
import type { Gateway, GatewayStatus } from '@/types/asset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime } from '@/lib/utils';

const statusTone = (s: GatewayStatus): 'emerald' | 'amber' | 'red' =>
  s === 'Online' ? 'emerald' : s === 'Degraded' ? 'amber' : 'red';

const statusDot: Record<GatewayStatus, string> = {
  Online: 'bg-emerald-500',
  Degraded: 'bg-amber-500',
  Offline: 'bg-red-500',
};

const uptimeColor = (u: number): string =>
  u >= 99 ? 'bg-emerald-500' : u >= 95 ? 'bg-amber-500' : 'bg-red-500';

type Filter = 'All' | GatewayStatus;
const FILTERS: Filter[] = ['All', 'Online', 'Degraded', 'Offline'];

export default function GatewaysPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('All');

  const total = mockGateways.length;
  const online = mockGateways.filter((g) => g.status === 'Online').length;
  const degraded = mockGateways.filter((g) => g.status === 'Degraded').length;
  const offline = mockGateways.filter((g) => g.status === 'Offline').length;
  const connected = mockGateways.reduce((sum, g) => sum + g.connectedDevices, 0);

  const visible = useMemo<Gateway[]>(
    () => (filter === 'All' ? mockGateways : mockGateways.filter((g) => g.status === filter)),
    [filter],
  );

  const countFor = (f: Filter): number =>
    f === 'All' ? total : mockGateways.filter((g) => g.status === f).length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Gateways"
        subtitle="Edge readers, gateways & anchors bridging your sensor fleet to the platform."
        breadcrumb={[
          { label: 'Tracking', href: '/tracking' },
          { label: 'Sensors & Gateways' },
        ]}
        actions={
          <Button onClick={() => toast({ title: 'Add Gateway', description: 'Gateway provisioning wizard is on the roadmap.', tone: 'info' })}>
            + Add Gateway
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Gateways" value={total} sub={`${connected.toLocaleString()} devices connected`} tone="primary" accent />
        <KpiCard label="Online" value={online} sub="Healthy & reporting" tone="emerald" />
        <KpiCard label="Degraded" value={degraded} sub="Intermittent link" tone="amber" />
        <KpiCard label="Offline" value={offline} sub="No signal" tone="red" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === f
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {f !== 'All' && <span className={cn('w-1.5 h-1.5 rounded-full', statusDot[f])} />}
            {f}
            <span className="text-slate-400">{countFor(f)}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          variant="no-results"
          title="No gateways match this filter"
          description={`There are no ${filter.toLowerCase()} gateways in this session.`}
          action={<Button variant="outline" onClick={() => setFilter('All')}>Clear filter</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((g) => (
            <Link
              key={g.id}
              to={`/gateways/${g.id}`}
              className="glass-panel rounded-xl p-5 flex flex-col gap-4 hover:border-primary-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate group-hover:text-primary-600">{g.name}</div>
                  <Badge tone="slate" className="mt-1">{g.kind}</Badge>
                </div>
                <span className="inline-flex items-center gap-1.5 shrink-0">
                  <span className={cn('w-2 h-2 rounded-full', statusDot[g.status])} />
                  <Badge tone={statusTone(g.status)}>{g.status}</Badge>
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-500">Uptime</span>
                  <span className="font-semibold tabular-nums text-slate-700">{g.uptimePct}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className={cn('h-full rounded-full', uptimeColor(g.uptimePct))} style={{ width: `${g.uptimePct}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <div className="text-slate-400">Connected</div>
                  <div className="font-medium text-slate-700 tabular-nums">{g.connectedDevices} devices</div>
                </div>
                <div>
                  <div className="text-slate-400">Location</div>
                  <div className="font-medium text-slate-700 truncate">{g.location}</div>
                </div>
                <div>
                  <div className="text-slate-400">IP Address</div>
                  <div className="font-medium text-slate-700 font-mono truncate">{g.ip ?? '—'}</div>
                </div>
                <div>
                  <div className="text-slate-400">Firmware</div>
                  <div className="font-medium text-slate-700 font-mono truncate">{g.firmwareVersion}</div>
                </div>
              </div>

              <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>{g.id}</span>
                <span>Last seen {relTime(g.lastSeen)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
