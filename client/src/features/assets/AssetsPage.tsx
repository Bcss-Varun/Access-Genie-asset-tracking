import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ASSET_CATEGORIES, ASSET_STATUSES } from '@access-genie/shared';
import { Badge, EmptyState, ErrorState, HealthBar, KpiCard, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button, LinkButton } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { cn, formatMoney } from '@/lib/format';
import { assetStatusTone, criticalityTone, statusLabel } from '@/lib/tone';
import { assetsApi } from './assets-api';
import { useDebounced } from '@/lib/useDebounced';

const PAGE_SIZE = 20;

export function AssetsPage() {
  // Filters live in the URL, so a filtered registry view is a shareable link
  // and the browser's back button behaves the way users expect.
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get('q') ?? '');
  const search = useDebounced(searchInput, 300);

  const page = Number(params.get('page') ?? '1');
  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? '-createdAt';

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page'); // a new filter resets to page 1
    setParams(next, { replace: true });
  }

  const filters = { page, limit: PAGE_SIZE, sort, ...(search ? { q: search } : {}), ...(status ? { status } : {}), ...(category ? { category } : {}) };

  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ['assets', filters],
    queryFn: () => assetsApi.list(filters),
    placeholderData: keepPreviousData, // no table flash while paging
  });

  const { data: stats } = useQuery({ queryKey: ['assets', 'stats'], queryFn: assetsApi.stats, staleTime: 60_000 });

  const hasFilters = Boolean(search || status || category);

  return (
    <div className="space-y-6">
      <PageHeader
        title="IT Asset Registry"
        subtitle="Every asset in the graph — record, location, condition and prediction on one object."
        actions={
          <LinkButton to="/assets/new" size="sm">
            ➕ Register asset
          </LinkButton>
        }
      />

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total assets" value={stats.total} />
          <KpiCard label="Portfolio value" value={formatMoney(stats.portfolioValue)} />
          <KpiCard label="Average health" value={stats.avgHealth} tone={stats.avgHealth >= 75 ? 'emerald' : 'amber'} />
          <KpiCard label="Average utilization" value={`${stats.avgUtilization}%`} />
        </div>
      )}

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="glass-panel p-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setParam('q', e.target.value);
          }}
          placeholder="Search name, serial, tag ID…"
          aria-label="Search assets"
          className="flex-1 min-w-[220px] rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition"
        />

        <Select value={status} onChange={(v) => setParam('status', v)} label="Status">
          <option value="">All statuses</option>
          {ASSET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>

        <Select value={category} onChange={(v) => setParam('category', v)} label="Category">
          <option value="">All categories</option>
          {ASSET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>

        <Select value={sort} onChange={(v) => setParam('sort', v)} label="Sort">
          <option value="-createdAt">Newest first</option>
          <option value="name">Name A–Z</option>
          <option value="healthScore">Health (low → high)</option>
          <option value="-riskScore">Risk (high → low)</option>
          <option value="-purchasePrice">Value (high → low)</option>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput('');
              setParams({}, { replace: true });
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      {error ? (
        <ErrorState
          title="Could not load the registry"
          description={error instanceof ApiRequestError ? error.message : undefined}
          requestId={error instanceof ApiRequestError ? error.requestId : undefined}
          onRetry={() => void refetch()}
        />
      ) : isPending ? (
        <TableSkeleton rows={8} columns={6} />
      ) : data.items.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            variant={hasFilters ? 'no-results' : 'empty'}
            title={hasFilters ? 'No assets match those filters' : 'No assets registered yet'}
            description={hasFilters ? 'Try widening the search or clearing a filter.' : 'Register your first asset to start building the graph.'}
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>
                  Clear filters
                </Button>
              ) : (
                <LinkButton to="/assets/new" size="sm">
                  Register asset
                </LinkButton>
              )
            }
          />
        </div>
      ) : (
        <div className={cn('glass-panel overflow-hidden transition-opacity', isFetching && 'opacity-60')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60">
                  {['Asset', 'Category', 'Status', 'Health', 'Location', 'Tracking', 'Value'].map((heading) => (
                    <th key={heading} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/assets/${asset.id}`} className="block min-w-[200px]">
                        <span className="block font-medium text-slate-800 hover:text-primary-700 truncate">{asset.name}</span>
                        <span className="block text-[11px] text-slate-400">
                          {asset.id} · {asset.serialNumber}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{asset.category}</td>
                    <td className="px-4 py-3">
                      <Badge tone={assetStatusTone[asset.status]}>{statusLabel(asset.status)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <HealthBar score={asset.healthScore} />
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      <span className="block">{asset.location.name}</span>
                      {asset.location.zone && <span className="block text-[11px] text-slate-400">{asset.location.zone}</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {asset.trackingTech ? (
                        <>
                          <Badge tone="primary">{asset.trackingTech}</Badge>
                          {asset.trackingId && <span className="block text-[10px] text-slate-400 font-mono mt-1">{asset.trackingId}</span>}
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 whitespace-nowrap">
                      {formatMoney(asset.purchasePrice)}
                      {asset.criticality && (
                        <Badge tone={criticalityTone[asset.criticality]} className="ml-2">
                          {asset.criticality}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>
              Showing <strong className="text-slate-700">{(data.meta.page - 1) * data.meta.limit + 1}</strong>–
              <strong className="text-slate-700">{Math.min(data.meta.page * data.meta.limit, data.meta.total)}</strong> of{' '}
              <strong className="text-slate-700">{data.meta.total}</strong>
            </span>
            <span className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!data.meta.hasPrev} onClick={() => setParam('page', String(page - 1))}>
                Previous
              </Button>
              <span className="tabular-nums">
                {data.meta.page} / {data.meta.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={!data.meta.hasNext} onClick={() => setParam('page', String(page + 1))}>
                Next
              </Button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition bg-white"
    >
      {children}
    </select>
  );
}
