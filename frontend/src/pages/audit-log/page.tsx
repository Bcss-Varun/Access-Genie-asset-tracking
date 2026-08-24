import { useCallback, useEffect, useState } from 'react';
import { EMPTY_AUDIT_LOG_FILTERS, useAuditLogList, type AuditLogFilters } from '@/api/compliance';
import { ApiRequestError } from '@/api/client';
import { Badge, EmptyState, ErrorState, FilterBar, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { TextInput } from '@/components/ui/FormDialog';
import { relTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

/**
 * Immutable Audit Log.
 *
 * Read-only by construction: this page renders `GET /audit` and nothing
 * else — no create, edit or delete affordance exists here or in the API
 * client, because the log is append-only by design (see
 * `backend/src/services/audit.service.ts`). Every row is a real write
 * somewhere else in the system — a status change, a finding raised, a
 * certificate crossing its expiry date — not a fixture.
 */

const CATEGORIES = ['Compliance', 'Configuration', 'Data', 'Support'];

export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditLogFilters>(EMPTY_AUDIT_LOG_FILTERS);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = search.trim();
      if (next !== (filters.q ?? '')) {
        setFilters((f) => ({ ...f, q: next || undefined }));
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const setCategory = useCallback((category: string | undefined) => {
    setFilters((f) => ({ ...f, category }));
    setPage(1);
  }, []);

  const list = useAuditLogList({ ...filters, page, limit: 50, sort: '-timestamp' });
  const items = list.data?.items ?? [];
  const meta = list.data?.meta;

  const chip = (active: boolean) =>
    cn(
      'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
      active
        ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
        : 'bg-transparent text-slate-500 border-slate-200 hover:border-primary-500/50 hover:text-slate-700',
    );

  return (
    <div className="flex h-full flex-col space-y-5">
      <PageHeader
        title="Immutable Audit Log"
        subtitle="Read-only, append-only system of record for every privileged and automated action."
        breadcrumb={[{ label: 'Security & Compliance' }, { label: 'Immutable Audit Log' }]}
      />

      <FilterBar min={200}>
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
          <TextInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, action, target or IP…"
          />
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <button type="button" onClick={() => setCategory(undefined)} className={chip(!filters.category)}>
            All categories
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" onClick={() => setCategory(c)} className={chip(filters.category === c)}>
              {c}
            </button>
          ))}
        </div>
      </FilterBar>

      {list.error ? (
        <div className="glass-panel">
          <ErrorState
            title="Could not load the audit log"
            description={list.error instanceof ApiRequestError ? list.error.message : 'The request failed.'}
            requestId={list.error instanceof ApiRequestError ? list.error.requestId : undefined}
            onRetry={() => void list.refetch()}
          />
        </div>
      ) : list.isLoading && items.length === 0 ? (
        <TableSkeleton rows={10} columns={6} />
      ) : items.length === 0 ? (
        <div className="glass-panel">
          <EmptyState variant="no-results" icon="📒" title="No matching entries" description="Adjust your search or category filter." />
        </div>
      ) : (
        <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Actor</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Target</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Source IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-500">{relTime(r.timestamp)}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{r.actor}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700">
                        {r.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{r.target}</td>
                    <td className="px-6 py-4">
                      <Badge tone="slate">{r.category}</Badge>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{r.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              <span>
                Page {meta.page} of {meta.totalPages} · {meta.total} entr{meta.total === 1 ? 'y' : 'ies'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(meta.page - 1)}
                  disabled={!meta.hasPrev}
                  className="rounded-lg border border-slate-200 px-3 py-1 font-medium hover:border-slate-300 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage(meta.page + 1)}
                  disabled={!meta.hasNext}
                  className="rounded-lg border border-slate-200 px-3 py-1 font-medium hover:border-slate-300 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
