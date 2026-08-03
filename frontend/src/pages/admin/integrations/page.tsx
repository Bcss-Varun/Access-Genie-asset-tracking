import { useState } from 'react';
import { mockIntegrations } from '@/lib/mock-data';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime } from '@/lib/utils';
import type { IntegrationStatus } from '@/types/asset';

const statusPill: Record<IntegrationStatus, { dot: string; text: string; label: string }> = {
  Connected: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Connected' },
  Error: { dot: 'bg-red-500', text: 'text-red-700', label: 'Error' },
  Disconnected: { dot: 'bg-slate-400', text: 'text-slate-500', label: 'Disconnected' },
};

type Filter = 'All' | IntegrationStatus;
const filters: Filter[] = ['All', 'Connected', 'Error', 'Disconnected'];

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('All');

  const connected = mockIntegrations.filter((i) => i.status === 'Connected').length;
  const errors = mockIntegrations.filter((i) => i.status === 'Error').length;
  const visible = mockIntegrations.filter((i) => filter === 'All' || i.status === filter);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Integrations & API"
        subtitle="Connected systems, adapters & data pipelines across your asset platform."
        breadcrumb={[{ label: 'Administration' }, { label: 'Integrations & API' }]}
        actions={
          <Button
            onClick={() =>
              toast({ title: 'Browse catalog', description: 'The full integration marketplace is on the roadmap.', tone: 'info' })
            }
          >
            + Add Integration
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:max-w-md">
        <KpiCard label="Connected" value={connected} sub="Healthy adapters" tone="emerald" accent />
        <KpiCard label="Errors" value={errors} sub="Needs attention" tone="red" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === f
                ? 'border-primary-200 bg-primary-50 text-primary-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState variant="no-results" title="No integrations" description="No integrations match this filter." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((int) => {
            const pill = statusPill[int.status];
            return (
              <div key={int.id} className="glass-panel flex flex-col rounded-xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-heading font-semibold text-slate-900">{int.name}</h3>
                    <Badge tone="slate" className="mt-1">{int.category}</Badge>
                  </div>
                  <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', pill.text)}>
                    <span className={cn('h-2 w-2 rounded-full', pill.dot)} />
                    {pill.label}
                  </span>
                </div>

                <p className="mt-3 text-sm text-slate-500">{int.description}</p>

                <div className="mt-3 text-xs text-slate-400">
                  Last sync: <span className="font-medium text-slate-600">{relTime(int.lastSync)}</span>
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
                  {int.status === 'Connected' ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          toast({ title: 'Syncing…', description: `${int.name} sync triggered.`, tone: 'success' })
                        }
                      >
                        Sync
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          toast({ title: 'Configure', description: `Opening ${int.name} settings.`, tone: 'info' })
                        }
                      >
                        Configure
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          toast({ title: 'Connect', description: `Launching ${int.name} auth flow.`, tone: 'info' })
                        }
                      >
                        Connect
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          toast({ title: 'Configure', description: `Opening ${int.name} settings.`, tone: 'info' })
                        }
                      >
                        Configure
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
