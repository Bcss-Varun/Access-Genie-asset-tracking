import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AUDIT_STATUSES, AUDIT_TYPES, type AuditStatus, type AuditType } from '@access-genie/shared';
import { EMPTY_AUDIT_FILTERS, activeAuditFilterCount, useAuditCount, useAuditList, type AuditFilters } from '@/api/compliance';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/api/auth';
import { Badge, EmptyState, ErrorState, FilterBar, MetricCard, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Select, TextInput, optionsFrom } from '@/components/ui/FormDialog';
import { Button } from '@/components/ui/Button';
import { relTime } from '@/lib/utils';
import { AUDIT_STATUS_TONE, formatDateShort } from '@/components/compliance-monitoring/tokens';
import { AuditDialog } from '@/components/compliance-monitoring/AuditDialog';

/**
 * Audit Center.
 *
 * An audit is an engagement, not a physical count — it carries a lifecycle
 * (Planned → In Progress → Completed → Closed), a lead auditor, and the
 * findings raised as it's worked. This replaced a hub whose "Start Audit"
 * opened a cycle-count session; that screen is still reachable from Asset
 * Tracking, this one is the compliance audit trail.
 */

const DEFAULT_SORT = 'dueDate';

export default function AuditCenterPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [page, setPage] = useState(1);
  const sort = DEFAULT_SORT;
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

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

  const update = useCallback((next: Partial<AuditFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPage(1);
  }, []);

  const clear = useCallback(() => {
    setFilters(EMPTY_AUDIT_FILTERS);
    setSearch('');
    setPage(1);
  }, []);

  const activeCount = activeAuditFilterCount(filters);
  const list = useAuditList({ ...filters, page, limit: 25, sort });

  const inProgressCount = useAuditCount({ status: ['In Progress'] });
  const plannedCount = useAuditCount({ status: ['Planned'] });
  const overdueCount = useAuditCount({ status: ['In Progress', 'Planned'] });
  const completedCount = useAuditCount({ status: ['Completed', 'Closed'] });

  const items = list.data?.items ?? [];
  const meta = list.data?.meta;
  const canWrite = can('compliance');

  return (
    <div className="flex h-full flex-col space-y-5">
      <PageHeader
        title="Audit Center"
        subtitle="Compliance audits, their findings and the evidence behind each one."
        breadcrumb={[{ label: 'Security & Compliance' }, { label: 'Audit Center' }]}
        actions={canWrite && <Button onClick={() => setCreating(true)}>+ Open audit</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Planned" value={plannedCount.data ?? '—'} tone="slate" icon="🗓️" sub="Not yet started" />
        <MetricCard label="In progress" value={inProgressCount.data ?? '—'} tone="primary" icon="🕵️" sub="Being worked" />
        <MetricCard label="Open engagements" value={overdueCount.data ?? '—'} tone="amber" icon="📋" sub="Planned + in progress" />
        <MetricCard label="Completed" value={completedCount.data ?? '—'} tone="emerald" icon="✅" sub="Completed or closed" />
      </div>

      <FilterBar>
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
          <TextInput type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search audit name…" />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
          <Select
            options={[{ value: '', label: 'All statuses' }, ...optionsFrom(AUDIT_STATUSES)]}
            value={filters.status?.[0] ?? ''}
            onChange={(e) => update({ status: e.target.value ? [e.target.value as AuditStatus] : undefined })}
          />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Type</span>
          <Select
            options={[{ value: '', label: 'All types' }, ...optionsFrom(AUDIT_TYPES)]}
            value={filters.type?.[0] ?? ''}
            onChange={(e) => update({ type: e.target.value ? [e.target.value as AuditType] : undefined })}
          />
        </div>
        {activeCount > 0 && (
          <button type="button" onClick={clear} className="text-xs font-medium text-primary-600 hover:text-primary-700 justify-self-start">
            Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
          </button>
        )}
      </FilterBar>

      {list.error ? (
        <div className="glass-panel">
          <ErrorState
            title="Could not load audits"
            description={list.error instanceof ApiRequestError ? list.error.message : 'The request failed.'}
            requestId={list.error instanceof ApiRequestError ? list.error.requestId : undefined}
            onRetry={() => void list.refetch()}
          />
        </div>
      ) : list.isLoading && items.length === 0 ? (
        <TableSkeleton rows={8} columns={6} />
      ) : items.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            variant={activeCount > 0 ? 'no-results' : 'empty'}
            icon="🕵️"
            title={activeCount > 0 ? 'No audits match these filters' : 'No audits yet'}
            description={activeCount > 0 ? 'Clear a filter to widen the search.' : 'Open one against a facility to start raising findings.'}
          />
        </div>
      ) : (
        <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Audit</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Facility</th>
                  <th className="px-5 py-3.5">Lead auditor</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Findings</th>
                  <th className="px-5 py-3.5">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((audit) => (
                  <tr key={audit.id} className="cursor-pointer transition-colors hover:bg-slate-50" onClick={() => navigate(`/audit/${audit.id}`)}>
                    <td className="px-5 py-3">
                      <Link to={`/audit/${audit.id}`} className="font-medium text-slate-900 hover:text-primary-700" onClick={(e) => e.stopPropagation()}>
                        {audit.name}
                      </Link>
                      <div className="font-mono text-[11px] text-slate-400">{audit.id}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{audit.type}</td>
                    <td className="px-5 py-3 text-slate-600">{audit.scopeId}</td>
                    <td className="px-5 py-3 text-slate-600">{audit.leadAuditor}</td>
                    <td className="px-5 py-3">
                      <Badge tone={AUDIT_STATUS_TONE[audit.status]}>{audit.status}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      {audit.findingsCount === 0 ? (
                        <span className="text-slate-400">None yet</span>
                      ) : (
                        <span className={audit.openFindingsCount > 0 ? 'font-medium text-health-critical' : 'text-emerald-600'}>
                          {audit.openFindingsCount} open / {audit.findingsCount} total
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-500">
                      {formatDateShort(audit.dueDate)}
                      <div className="text-[11px] text-slate-400">{relTime(audit.dueDate)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              <span>
                Page {meta.page} of {meta.totalPages} · {meta.total} audit{meta.total === 1 ? '' : 's'}
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

      {creating && <AuditDialog onClose={() => setCreating(false)} onCreated={(id) => navigate(`/audit/${id}`)} />}
    </div>
  );
}
