import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorState, HealthBar, KpiCard, PageHeader, Skeleton } from '@/components/ui/primitives';
import { LinkButton } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { cn, formatDate, formatRupees, isOverdue, relTime } from '@/lib/format';
import { alertSeverityTone, assetStatusTone, criticalityTone, healthTone, priorityTone, statusLabel, workOrderStatusTone } from '@/lib/tone';
import { assetsApi } from './assets-api';

type Tab = 'overview' | 'maintenance' | 'timeline' | 'intelligence' | 'custody';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'intelligence', label: 'AI intelligence' },
  { id: 'custody', label: 'Chain of custody' },
];

/** Asset 360 — one record, every timeline that hangs off it. */
export function AssetDetailPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<Tab>('overview');

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['assets', id, 'profile'],
    queryFn: () => assetsApi.profile(id),
    enabled: Boolean(id),
  });

  if (error) {
    const notFound = error instanceof ApiRequestError && error.code === 'NOT_FOUND';
    return (
      <ErrorState
        title={notFound ? `No asset with ID ${id}` : 'Could not load this asset'}
        description={notFound ? 'It may have been retired, or the ID may be mistyped.' : error instanceof ApiRequestError ? error.message : undefined}
        requestId={error instanceof ApiRequestError ? error.requestId : undefined}
        onRetry={notFound ? undefined : () => void refetch()}
      />
    );
  }

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { asset, workOrders, activity, insights, custody } = data;
  const openWorkOrders = workOrders.filter((wo) => wo.status !== 'Completed');

  return (
    <div className="space-y-6">
      <PageHeader
        title={asset.name}
        subtitle={`${asset.manufacturer ?? ''} ${asset.model ?? ''}`.trim() || asset.category}
        breadcrumb={[{ label: 'Passport & Lifecycle' }, { label: 'IT Asset Registry', href: '/assets' }, { label: asset.id }]}
        actions={
          <LinkButton to={`/maintenance/new?assetId=${asset.id}`} size="sm">
            🔧 Raise work order
          </LinkButton>
        }
      />

      {/* ── Identity strip ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={assetStatusTone[asset.status]}>{statusLabel(asset.status)}</Badge>
        <Badge tone={healthTone[asset.healthStatus]}>Health {asset.healthScore}</Badge>
        {asset.criticality && <Badge tone={criticalityTone[asset.criticality]}>{asset.criticality} criticality</Badge>}
        {asset.trackingTech && <Badge tone="primary">{asset.trackingTech}</Badge>}
        {asset.trackingId && <span className="text-[11px] font-mono text-slate-400">{asset.trackingId}</span>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Health score" value={asset.healthScore} sub={asset.healthStatus} tone={healthTone[asset.healthStatus]} />
        <KpiCard label="Risk score" value={asset.riskScore ?? '—'} sub={asset.riskScore && asset.riskScore > 60 ? 'Action recommended' : 'Within tolerance'} tone={asset.riskScore && asset.riskScore > 60 ? 'red' : 'emerald'} />
        <KpiCard label="Utilization" value={asset.utilization !== undefined ? `${asset.utilization}%` : '—'} />
        <KpiCard label="Open work orders" value={openWorkOrders.length} tone={openWorkOrders.length > 0 ? 'amber' : 'emerald'} />
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={cn(
              'px-3.5 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
              tab === entry.id ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {entry.label}
            {entry.id === 'maintenance' && openWorkOrders.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">{openWorkOrders.length}</span>
            )}
            {entry.id === 'intelligence' && insights.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-primary-100 text-primary-700 rounded-full px-1.5 py-0.5">{insights.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Record">
            <Field label="Asset ID" value={asset.id} mono />
            <Field label="Serial number" value={asset.serialNumber} mono />
            <Field label="Category" value={asset.category} />
            <Field label="Manufacturer" value={asset.manufacturer} />
            <Field label="Model" value={asset.model} />
            <Field label="Custodian" value={asset.custodian} />
            <Field label="Lifecycle stage" value={asset.lifecycleStage} />
            <Field label="Tags" value={asset.tags.length ? asset.tags.join(', ') : undefined} />
          </Panel>

          <Panel title="Location">
            <Field label="Facility" value={asset.location.name} />
            <Field label="Building" value={asset.location.building} />
            <Field label="Floor" value={asset.location.floor} />
            <Field label="Zone" value={asset.location.zone} />
            {asset.mapPosition && (
              <Field label="Floor-plan position" value={`${asset.mapPosition.x}%, ${asset.mapPosition.y}%`} />
            )}
            <div className="pt-2">
              <Link to="/tracking" className="text-xs font-medium text-primary-600 hover:text-primary-700">
                View on the live map →
              </Link>
            </div>
          </Panel>

          <Panel title="Financials">
            <Field label="Purchase price" value={formatRupees(asset.purchasePrice)} />
            <Field label="Book value" value={formatRupees(asset.bookValue)} />
            <Field label="Depreciation" value={asset.depreciationMethod} />
            <Field label="Purchased" value={formatDate(asset.purchaseDate)} />
            <Field label="Warranty expiry" value={formatDate(asset.warrantyExpiry)} />
          </Panel>

          <Panel title="Condition & telemetry">
            <div className="mb-3">
              <HealthBar score={asset.healthScore} />
            </div>
            {asset.telemetry ? (
              <>
                <Field label="Temperature" value={asset.telemetry.temperature !== undefined ? `${asset.telemetry.temperature}°C` : undefined} />
                <Field label="Humidity" value={asset.telemetry.humidity !== undefined ? `${asset.telemetry.humidity}%` : undefined} />
                <Field label="Vibration" value={asset.telemetry.vibration !== undefined ? `${asset.telemetry.vibration} mm/s` : undefined} />
                <Field label="Battery" value={asset.telemetry.batteryLevel !== undefined ? `${asset.telemetry.batteryLevel}%` : undefined} />
                <Field label="Last ping" value={relTime(asset.telemetry.lastPing)} />
              </>
            ) : (
              <p className="text-sm text-slate-400">No telemetry reported for this asset.</p>
            )}
          </Panel>
        </div>
      )}

      {tab === 'maintenance' && (
        <Panel title="Work orders" padded={false}>
          {workOrders.length === 0 ? (
            <EmptyState icon="🔧" title="No work orders" description="Nothing has been raised against this asset." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {workOrders.map((wo) => (
                <li key={wo.id}>
                  <Link to={`/maintenance/${wo.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800 truncate">{wo.title}</span>
                      <span className="block text-[11px] text-slate-400">
                        {wo.id} · {wo.assignedTo} · due {formatDate(wo.dueDate)}
                        {isOverdue(wo.dueDate) && wo.status !== 'Completed' && <span className="text-health-critical font-semibold"> · overdue</span>}
                      </span>
                    </span>
                    {wo.aiGenerated && <Badge tone="primary">AI</Badge>}
                    <Badge tone={priorityTone[wo.priority]}>{wo.priority}</Badge>
                    <Badge tone={workOrderStatusTone[wo.status]}>{wo.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === 'timeline' && (
        <Panel title="Event stream" padded={false}>
          {activity.length === 0 ? (
            <EmptyState icon="🕓" title="No events recorded" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {activity.map((event) => (
                <li key={event.id} className="px-5 py-3 flex items-start gap-3">
                  <Badge tone="slate" className="mt-0.5 shrink-0">
                    {event.type}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-700">{event.description}</span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">
                      {event.actor} · {relTime(event.timestamp)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === 'intelligence' && (
        <div className="space-y-4">
          {insights.length === 0 ? (
            <Panel title="AI intelligence">
              <EmptyState icon="✨" title="No open insights" description="The models have nothing outstanding for this asset." />
            </Panel>
          ) : (
            insights.map((insight) => (
              <div key={insight.id} className="glass-panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={alertSeverityTone[insight.severity === 'Opportunity' ? 'Info' : insight.severity]}>{insight.severity}</Badge>
                      <Badge tone="slate">{insight.type}</Badge>
                      <span className="text-[11px] text-slate-400">{insight.confidence}% confidence</span>
                    </div>
                    <h3 className="font-heading text-base font-semibold text-slate-800 mt-2">{insight.title}</h3>
                    <p className="text-sm text-slate-600 mt-1">{insight.summary}</p>
                  </div>
                  {insight.impactLabel && <Badge tone="amber">{insight.impactLabel}</Badge>}
                </div>

                {/* Explainability: the drivers ship with the score. */}
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

                <p className="text-[13px] text-slate-600 mt-4 bg-slate-50 rounded-lg px-3 py-2">
                  <strong className="text-slate-700">Recommended:</strong> {insight.recommendedAction}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'custody' && (
        <Panel title="Chain of custody" padded={false}>
          {custody.length === 0 ? (
            <EmptyState icon="🔗" title="No custody records" description="This asset has not changed hands." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {custody.map((record) => (
                <li key={record.id} className="px-5 py-3 flex items-center gap-3">
                  <Badge tone="slate">{record.action}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-700">{record.holder}</span>
                    <span className="block text-[11px] text-slate-400">
                      recorded by {record.by} · {relTime(record.at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}

function Panel({ title, children, padded = true }: { title: string; children: React.ReactNode; padded?: boolean }) {
  return (
    <section className="glass-panel overflow-hidden">
      <header className="px-5 py-3.5 border-b border-slate-100">
        <h2 className="font-heading text-sm font-semibold text-slate-800">{title}</h2>
      </header>
      <div className={padded ? 'p-5 space-y-2.5' : undefined}>{children}</div>
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value?: string | number; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={cn('text-slate-800 text-right truncate', mono && 'font-mono text-[13px]')}>{value ?? '—'}</span>
    </div>
  );
}
