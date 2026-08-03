import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorState, KpiCard, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { trackingApi } from './tracking-api';

export function GeofencesPage() {
  const queryClient = useQueryClient();

  const { data, isPending, error, refetch } = useQuery({ queryKey: ['geofences'], queryFn: trackingApi.geofences });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => trackingApi.updateGeofence(id, { active }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['geofences'] }),
        queryClient.invalidateQueries({ queryKey: ['tracking'] }),
      ]);
    },
  });

  const active = data?.filter((fence) => fence.active).length ?? 0;
  const breaches = data?.reduce((sum, fence) => sum + fence.breaches24h, 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Geofencing Zones"
        subtitle="Entry, exit, dwell and restricted rules on the facility floor plan."
        breadcrumb={[{ label: 'Real-Time Tracking' }, { label: 'Geofences' }]}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Defined" value={data?.length ?? '—'} />
        <KpiCard label="Active" value={active} tone="emerald" />
        <KpiCard label="Breaches (24h)" value={breaches} tone={breaches > 0 ? 'amber' : 'emerald'} />
      </div>

      {error ? (
        <ErrorState title="Could not load geofences" description={error instanceof ApiRequestError ? error.message : undefined} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton rows={6} columns={4} />
      ) : data.length === 0 ? (
        <div className="glass-panel">
          <EmptyState icon="📍" title="No geofences defined" description="Draw a zone on the live map to start enforcing rules." />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {data.map((fence) => (
              <li key={fence.id} className="px-4 py-3 flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800">{fence.name}</span>
                  <span className="block text-[11px] text-slate-400">
                    {fence.id} · {fence.width}% × {fence.height}% at ({fence.x}, {fence.y})
                  </span>
                </span>

                <Badge tone={fence.rule === 'Restricted' ? 'red' : 'primary'}>{fence.rule}</Badge>

                <span className="text-xs text-slate-500 tabular-nums w-24 text-right">
                  {fence.breaches24h} breach{fence.breaches24h === 1 ? '' : 'es'}
                </span>

                <Button
                  variant={fence.active ? 'secondary' : 'ghost'}
                  size="sm"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ id: fence.id, active: !fence.active })}
                >
                  {fence.active ? 'Active' : 'Disabled'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
