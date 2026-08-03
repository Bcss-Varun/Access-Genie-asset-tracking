import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorState, KpiCard, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { formatMoney, relTime } from '@/lib/format';
import type { Tone } from '@/lib/tone';
import { insightsApi } from './insights-api';

const SEVERITY_TONE: Record<string, Tone> = {
  Critical: 'red',
  Warning: 'amber',
  Info: 'primary',
  Opportunity: 'emerald',
};

export function InsightsPage() {
  const queryClient = useQueryClient();

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['insights', { status: 'open' }],
    queryFn: () => insightsApi.list({ limit: 50 }),
  });

  const { data: stats } = useQuery({ queryKey: ['insights', 'stats'], queryFn: insightsApi.stats });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'action' | 'dismiss' }) => insightsApi[action](id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['insights'] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Insights Feed"
        subtitle="What the models found, why they think it, and what to do about it."
      />

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Open insights" value={stats.open} tone="primary" accent />
          <KpiCard label="Critical" value={stats.critical} tone={stats.critical > 0 ? 'red' : 'emerald'} />
          <KpiCard label="Value at stake" value={formatMoney(stats.impactInr)} sub="Avoided loss or savings if actioned" />
          <KpiCard label="Average confidence" value={`${stats.avgConfidence}%`} />
        </div>
      )}

      {error ? (
        <ErrorState
          title="Could not load insights"
          description={error instanceof ApiRequestError ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="glass-panel">
          <EmptyState icon="✨" title="Nothing outstanding" description="Every insight has been actioned or dismissed." />
        </div>
      ) : (
        <div className="space-y-4">
          {data.items.map((insight) => (
            <article key={insight.id} className="glass-panel p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone={SEVERITY_TONE[insight.severity] ?? 'slate'}>{insight.severity}</Badge>
                    <Badge tone="slate">{insight.type}</Badge>
                    <span className="text-[11px] text-slate-400">
                      {insight.confidence}% confidence · {relTime(insight.createdAt)}
                    </span>
                  </div>

                  <h2 className="font-heading text-base font-semibold text-slate-800 mt-2">{insight.title}</h2>
                  <p className="text-sm text-slate-600 mt-1">{insight.summary}</p>

                  {insight.assetId && (
                    <Link to={`/assets/${insight.assetId}`} className="inline-block text-xs font-medium text-primary-600 hover:text-primary-700 mt-2">
                      {insight.assetName ?? insight.assetId} →
                    </Link>
                  )}
                </div>

                {insight.impactInr !== undefined && (
                  <div className="text-right shrink-0">
                    <p className="text-lg font-heading font-semibold text-slate-800 tabular-nums">{formatMoney(insight.impactInr)}</p>
                    {insight.impactLabel && <p className="text-[11px] text-slate-400">{insight.impactLabel}</p>}
                  </div>
                )}
              </div>

              {/* Explainability travels with the score — an insight you cannot
                  interrogate is one nobody acts on. */}
              {insight.drivers.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Why the model says this</p>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {insight.drivers.map((driver) => (
                      <li key={driver} className="text-[13px] text-slate-600 flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 rounded-full bg-primary-400 shrink-0" />
                        {driver}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-slate-600 bg-slate-50 rounded-lg px-3 py-2 flex-1 min-w-[240px]">
                  <strong className="text-slate-700">Recommended:</strong> {insight.recommendedAction}
                </p>

                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: insight.id, action: 'action' })}>
                    {insight.actionLabel}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ id: insight.id, action: 'dismiss' })}>
                    Dismiss
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
