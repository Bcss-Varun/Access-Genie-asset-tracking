import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_SEVERITIES,
  COMPLIANCE_STATUSES,
  type ComplianceCategory,
  type ComplianceRecord,
  type ComplianceSeverity,
  type ComplianceStatus,
} from '@access-genie/shared';
import {
  EMPTY_COMPLIANCE_FILTERS,
  activeComplianceFilterCount,
  useComplianceRecordCount,
  useComplianceRecordList,
  type ComplianceFilters,
} from '@/api/compliance';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/api/auth';
import { Badge, EmptyState, ErrorState, FilterBar, MetricCard, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Select, TextInput, optionsFrom } from '@/components/ui/FormDialog';
import { Button } from '@/components/ui/Button';
import { cn, relTime } from '@/lib/utils';
import { COMPLIANCE_STATUS_TONE, SEVERITY_TONE, formatDateShort } from '@/components/compliance-monitoring/tokens';
import { ComplianceRecordDialog } from '@/components/compliance-monitoring/ComplianceRecordDialog';
import { ResolveComplianceRecordDialog } from '@/components/compliance-monitoring/ResolveFindingDialog';

/**
 * Compliance Monitoring.
 *
 * Findings against the estate — raised by hand, or automatically when a
 * certification expires or a predictive alert crosses Critical. One server
 * query, filtered and paged the way work orders are; the four headline
 * counts below are the same query run four times with a different status or
 * severity cut, never a client-side tally over whatever page happens to be
 * on screen.
 */

const DEFAULT_SORT = '-createdAt';

export default function ComplianceMonitoringPage() {
  const { can } = useAuth();
  const [filters, setFilters] = useState<ComplianceFilters>(EMPTY_COMPLIANCE_FILTERS);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [resolving, setResolving] = useState<ComplianceRecord | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

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

  const update = useCallback((next: Partial<ComplianceFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPage(1);
  }, []);

  const clear = useCallback(() => {
    setFilters(EMPTY_COMPLIANCE_FILTERS);
    setSearch('');
    setPage(1);
  }, []);

  const activeCount = activeComplianceFilterCount(filters);
  const list = useComplianceRecordList({ ...filters, page, limit: 25, sort });

  const openCount = useComplianceRecordCount({ status: ['Open'] });
  const criticalCount = useComplianceRecordCount({ status: ['Open'], severity: ['Critical'] });
  const inProgressCount = useComplianceRecordCount({ status: ['In Progress'] });
  const resolvedCount = useComplianceRecordCount({ status: ['Resolved'] });

  const items = list.data?.items ?? [];
  const meta = list.data?.meta;
  const canWrite = can('compliance');

  return (
    <div className="flex h-full flex-col space-y-5">
      <PageHeader
        title="Compliance Monitoring"
        subtitle="Findings raised against the estate — by hand, by an audit, or automatically from certifications and predictive alerts."
        breadcrumb={[{ label: 'Security & Compliance' }, { label: 'Compliance Monitoring' }]}
        actions={canWrite && <Button onClick={() => setCreating(true)}>+ Raise finding</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Open" value={openCount.data ?? '—'} tone="red" icon="🛡️" sub="Awaiting action" />
        <MetricCard label="Critical & open" value={criticalCount.data ?? '—'} tone="red" icon="🚨" sub="Highest priority" />
        <MetricCard label="In progress" value={inProgressCount.data ?? '—'} tone="amber" icon="🕓" sub="Being worked" />
        <MetricCard label="Resolved" value={resolvedCount.data ?? '—'} tone="emerald" icon="✅" sub="Closed out" />
      </div>

      <FilterBar>
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
          <TextInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or description…"
          />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
          <Select
            options={[{ value: '', label: 'All statuses' }, ...optionsFrom(COMPLIANCE_STATUSES)]}
            value={filters.status?.[0] ?? ''}
            onChange={(e) => update({ status: e.target.value ? [e.target.value as ComplianceStatus] : undefined })}
          />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Severity</span>
          <Select
            options={[{ value: '', label: 'All severities' }, ...optionsFrom(COMPLIANCE_SEVERITIES)]}
            value={filters.severity?.[0] ?? ''}
            onChange={(e) => update({ severity: e.target.value ? [e.target.value as ComplianceSeverity] : undefined })}
          />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
          <Select
            options={[{ value: '', label: 'All categories' }, ...optionsFrom(COMPLIANCE_CATEGORIES)]}
            value={filters.category?.[0] ?? ''}
            onChange={(e) => update({ category: e.target.value ? [e.target.value as ComplianceCategory] : undefined })}
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
            title="Could not load compliance records"
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
            icon="🛡️"
            title={activeCount > 0 ? 'No findings match these filters' : 'No compliance findings yet'}
            description={
              activeCount > 0
                ? 'Clear a filter to widen the search.'
                : 'Raise one by hand, or let a certification expiry or a Critical predictive alert raise it for you.'
            }
          />
        </div>
      ) : (
        <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Finding</th>
                  <th className="px-5 py-3.5">Asset</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Severity</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Source</th>
                  <th className="px-5 py-3.5">Raised</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((record) => (
                  <Fragment key={record.id}>
                    <tr
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                      onClick={() => setExpanded((current) => (current === record.id ? null : record.id))}
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{record.title}</div>
                        <div className="font-mono text-[11px] text-slate-400">{record.id}</div>
                      </td>
                      <td className="px-5 py-3">
                        {record.assetId ? (
                          <Link
                            to={`/assets/${record.assetId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-700 hover:text-primary-700"
                          >
                            {record.assetName ?? record.assetId}
                          </Link>
                        ) : (
                          <span className="text-slate-400">{record.scopeId ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{record.category}</td>
                      <td className="px-5 py-3">
                        <Badge tone={SEVERITY_TONE[record.severity]}>{record.severity}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={COMPLIANCE_STATUS_TONE[record.status]}>{record.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{record.source}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-slate-500">{relTime(record.createdAt)}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {canWrite && (record.status === 'Open' || record.status === 'In Progress') ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setResolving(record);
                            }}
                            className="text-xs font-medium text-primary-600 hover:text-primary-700"
                          >
                            Close →
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">{record.status === 'Resolved' ? 'Done ✓' : '—'}</span>
                        )}
                      </td>
                    </tr>
                    {expanded === record.id && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Description</div>
                              <p className="mt-1 text-sm text-slate-700">{record.description}</p>
                            </div>
                            <div className="space-y-1.5 text-sm">
                              <div>
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Due date: </span>
                                <span className={cn(record.dueDate && new Date(record.dueDate) < new Date() && record.status === 'Open' ? 'font-medium text-health-critical' : 'text-slate-600')}>
                                  {formatDateShort(record.dueDate)}
                                </span>
                              </div>
                              <div>
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Raised by: </span>
                                <span className="text-slate-600">{record.createdBy}</span>
                              </div>
                              {record.relatedAuditId && (
                                <div>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Audit: </span>
                                  <Link to={`/audit/${record.relatedAuditId}`} className="text-primary-600 hover:text-primary-700">
                                    {record.relatedAuditId}
                                  </Link>
                                </div>
                              )}
                              {record.resolvedAt && (
                                <div>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                    {record.status} by:{' '}
                                  </span>
                                  <span className="text-slate-600">
                                    {record.resolvedBy} · {relTime(record.resolvedAt)}
                                  </span>
                                </div>
                              )}
                              {record.resolutionNote && (
                                <div>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Note: </span>
                                  <span className="text-slate-600">{record.resolutionNote}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              <span>
                Page {meta.page} of {meta.totalPages} · {meta.total} finding{meta.total === 1 ? '' : 's'}
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

      {creating && <ComplianceRecordDialog onClose={() => setCreating(false)} />}
      {resolving && <ResolveComplianceRecordDialog record={resolving} onClose={() => setResolving(null)} />}
    </div>
  );
}
