import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { alertSeverityTone } from '@/lib/tone';
import { alertsApi } from './alerts-api';

export function AlertRulesPage() {
  const queryClient = useQueryClient();

  const { data, isPending, error, refetch } = useQuery({ queryKey: ['alert-rules'], queryFn: alertsApi.rules });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => alertsApi.toggleRule(id, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert Rules"
        subtitle="The conditions that mint alerts, and where each one is delivered."
        breadcrumb={[{ label: 'Security & Compliance' }, { label: 'Alert Rules' }]}
      />

      {error ? (
        <ErrorState title="Could not load alert rules" description={error instanceof ApiRequestError ? error.message : undefined} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton rows={6} columns={4} />
      ) : data.length === 0 ? (
        <div className="glass-panel">
          <EmptyState icon="⚙️" title="No rules defined" />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {data.map((rule) => (
              <li key={rule.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className="min-w-[240px] flex-1">
                  <span className="block text-sm font-medium text-slate-800">{rule.name}</span>
                  <span className="block text-[11px] text-slate-400 font-mono mt-0.5">{rule.condition}</span>
                </span>

                <Badge tone={alertSeverityTone[rule.severity]}>{rule.severity}</Badge>

                <span className="flex items-center gap-1">
                  {rule.channels.map((channel) => (
                    <Badge key={channel} tone="slate">
                      {channel}
                    </Badge>
                  ))}
                </span>

                <span className="text-xs text-slate-500 tabular-nums w-28 text-right">{rule.triggered24h} fired (24h)</span>

                <Button
                  variant={rule.enabled ? 'secondary' : 'ghost'}
                  size="sm"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ id: rule.id, enabled: !rule.enabled })}
                >
                  {rule.enabled ? 'Enabled' : 'Disabled'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
