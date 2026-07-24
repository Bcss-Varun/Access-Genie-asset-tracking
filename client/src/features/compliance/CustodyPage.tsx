import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { ApiRequestError } from '@/lib/api-client';
import { formatDateTime, relTime } from '@/lib/format';
import { complianceApi } from '@/features/notifications/notifications-api';

export function CustodyPage() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['custody'],
    queryFn: () => complianceApi.custody({ limit: 50 }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chain of Custody"
        subtitle="Who held each asset, when it changed hands, and who recorded the move."
        breadcrumb={[{ label: 'Security & Compliance' }, { label: 'Custody' }]}
      />

      {error ? (
        <ErrorState title="Could not load custody records" description={error instanceof ApiRequestError ? error.message : undefined} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton rows={8} columns={4} />
      ) : data.items.length === 0 ? (
        <div className="glass-panel">
          <EmptyState icon="🔗" title="No custody records" description="Check-outs and transfers appear here." />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {data.items.map((record) => (
              <li key={record.id} className="px-4 py-3 flex items-center gap-3">
                <Badge tone={record.action === 'Checked Out' ? 'amber' : record.action === 'Checked In' ? 'emerald' : 'primary'}>
                  {record.action}
                </Badge>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-800">
                    <strong>{record.holder}</strong> ·{' '}
                    <Link to={`/assets/${record.assetId}`} className="text-primary-600 hover:text-primary-700">
                      {record.assetName}
                    </Link>
                  </span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">recorded by {record.by}</span>
                </span>

                <span className="text-xs text-slate-500 whitespace-nowrap text-right">
                  <span className="block">{relTime(record.at)}</span>
                  <span className="block text-[11px] text-slate-400">{formatDateTime(record.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
