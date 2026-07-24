import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { formatDateTime, relTime } from '@/lib/format';
import { complianceApi } from '@/features/notifications/notifications-api';

/**
 * The immutable audit trail. Every state-changing request writes a row here —
 * including the ones made while you were reading this page.
 */
export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? '1');
  const category = params.get('category') ?? '';

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['audit', { page, category }],
    queryFn: () => complianceApi.audit({ page, limit: 30, ...(category ? { category } : {}) }),
    placeholderData: keepPreviousData,
  });

  const setPage = (next: number) => {
    const query = new URLSearchParams(params);
    query.set('page', String(next));
    setParams(query, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Immutable Audit Log"
        subtitle="Who did what, when, and from where. Append-only — there is no edit path to this collection."
        breadcrumb={[{ label: 'Security & Compliance' }, { label: 'Audit' }]}
      />

      {error ? (
        <ErrorState title="Could not load the audit log" description={error instanceof ApiRequestError ? error.message : undefined} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton rows={10} columns={5} />
      ) : data.items.length === 0 ? (
        <div className="glass-panel">
          <EmptyState icon="📒" title="No audit records" />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60">
                  {['When', 'Actor', 'Action', 'Target', 'Category', 'IP'].map((heading) => (
                    <th key={heading} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="block text-slate-700">{relTime(record.timestamp)}</span>
                      <span className="block text-[11px] text-slate-400">{formatDateTime(record.timestamp)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{record.actor}</td>
                    <td className="px-4 py-2.5">
                      <code className="text-[12px] text-slate-600">{record.action}</code>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-slate-600">{record.target}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone="slate">{record.category}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">{record.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>{data.meta.total} records</span>
            <span className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={!data.meta.hasPrev} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="tabular-nums">
                {data.meta.page} / {data.meta.totalPages}
              </span>
              <Button variant="secondary" size="sm" disabled={!data.meta.hasNext} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
