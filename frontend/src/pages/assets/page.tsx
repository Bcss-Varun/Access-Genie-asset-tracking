import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ASSET_CATEGORIES, type Asset } from '@access-genie/shared';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { useToast } from '@/components/providers/ToastProvider';
import { useRegistry } from '@/components/providers/RegistryProvider';
import { useSavedViews } from '@/components/providers/SavedViewsProvider';
import { LENS_FILTERS, describeView, viewToQuery, type Lens, type SavedView } from '@/lib/asset-views';
import { BulkActionDialog, type BulkAction } from '@/components/assets/BulkActionDialog';
import { downloadCsv } from '@/api/configuration';
import { relTime, cn } from '@/lib/utils';
import { categoryEmoji } from '@/lib/asset-categories';

const statusTone = (s: Asset['status']) =>
  s === 'Active' ? 'emerald' : s === 'Maintenance' ? 'amber' : s === 'Missing' ? 'red' : 'slate';

const STATUSES = ['All', 'Active', 'Maintenance', 'Missing', 'Staging', 'End_Of_Life'] as const;
const CATEGORIES = ['All', ...ASSET_CATEGORIES] as const;

type SortKey = 'name' | 'status' | 'healthScore' | 'category' | 'utilization' | 'riskScore' | 'lastPing';

/**
 * A sortable column header.
 *
 * Two defects lived here. It was a `<th onClick={…}>` — a cell is not focusable
 * and does not fire on Enter or Space, so the registry could be filtered and
 * paged from the keyboard but never reordered. And it was declared *inside* the
 * page component, which meant every state change produced a new component type,
 * React unmounted the whole header row, and focus was thrown away on the very
 * keypress that sorted the table — so a keyboard user got one sort and then
 * landed back at the top of the document.
 *
 * Hoisted to module scope and built on a real `<button>`: activation, focus and
 * role come from the element. `aria-sort` lives on the cell, which is what a
 * screen reader announces on entering the column, and the direction is also
 * spelled out in the button's own text so it is never conveyed by an arrow
 * glyph alone.
 */
function SortHead({
  sortKey,
  label,
  className,
  active,
  direction,
  onSort,
  thClass,
}: {
  sortKey: SortKey;
  label: string;
  className?: string;
  active: SortKey;
  direction: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  thClass: string;
}) {
  const isActive = active === sortKey;
  const ariaSort = isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th scope="col" aria-sort={ariaSort} className={cn(thClass, 'p-0', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex w-full items-center gap-1 px-4 py-3 text-left font-semibold uppercase tracking-wider',
          'transition-colors hover:text-slate-800',
          isActive ? 'text-slate-800' : 'text-slate-500',
        )}
      >
        {label}
        <span aria-hidden className={cn('text-primary-500', !isActive && 'opacity-0')}>
          {direction === 'asc' ? '▲' : '▼'}
        </span>
        <span className="sr-only">
          {isActive
            ? `, sorted ${ariaSort}. Activate to sort ${direction === 'asc' ? 'descending' : 'ascending'}.`
            : ', not sorted. Activate to sort by this column.'}
        </span>
      </button>
    </th>
  );
}
const OPTIONAL_COLUMNS = ['category', 'location', 'custodian', 'utilization', 'riskScore', 'lastPing'] as const;
type OptCol = (typeof OPTIONAL_COLUMNS)[number];
const colLabels: Record<OptCol, string> = {
  category: 'Category', location: 'Location', custodian: 'Custodian', utilization: 'Utilization', riskScore: 'Risk', lastPing: 'Last Ping',
};

const PAGE_SIZE = 10;

export default function AssetRegistryPage() {
  const { toast } = useToast();
  const { assets, sessionIds } = useRegistry();
  const [lens, setLens] = useState<Lens>('all');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('All');
  const [category, setCategory] = useState<string>('All');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [hidden, setHidden] = useState<Set<OptCol>>(new Set<OptCol>(['utilization', 'riskScore', 'lastPing']));
  const [dense, setDense] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const { views, saveView, removeView } = useSavedViews();
  const [activeView, setActiveView] = useState('All Assets');
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState('');
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);

  // Shareable state: the whole view — including the lens — lives in the URL, so
  // sending the link sends the view. This is what a "group" becomes.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('q')) setSearch(p.get('q')!);
    if (p.get('status')) setStatus(p.get('status')!);
    if (p.get('category')) setCategory(p.get('category')!);
    const v = p.get('view');
    if (v && v in LENS_FILTERS) setLens(v as Lens);
  }, []);
  useEffect(() => {
    const qs = viewToQuery({ search, status, category, lens });
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [search, status, category, lens]);

  const visible = useMemo(() => assets.filter((a) => !a.onboarding.voidedAt), [assets]);

  /** Live counts for the lens chips — the queue sizes are the point. */
  const lensCounts = useMemo(() => {
    const out = {} as Record<Lens, number>;
    for (const key of Object.keys(LENS_FILTERS) as Lens[]) {
      out[key] = visible.filter(LENS_FILTERS[key]).length;
    }
    return out;
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = visible.filter(LENS_FILTERS[lens]).filter((a) => {
      if (status !== 'All' && a.status !== status) return false;
      if (category !== 'All' && a.category !== category) return false;
      if (q && !`${a.name} ${a.id} ${a.serialNumber} ${a.trackingId ?? ''} ${a.tags.join(' ')} ${a.custodian}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let av: string | number = '', bv: string | number = '';
      if (sortKey === 'name') { av = a.name; bv = b.name; }
      else if (sortKey === 'status') { av = a.status; bv = b.status; }
      else if (sortKey === 'category') { av = a.category; bv = b.category; }
      else if (sortKey === 'healthScore') { av = a.healthScore; bv = b.healthScore; }
      else if (sortKey === 'utilization') { av = a.utilization ?? 0; bv = b.utilization ?? 0; }
      else if (sortKey === 'riskScore') { av = a.riskScore ?? 0; bv = b.riskScore ?? 0; }
      else if (sortKey === 'lastPing') { av = Date.parse(a.telemetry?.lastPing ?? ''); bv = Date.parse(b.telemetry?.lastPing ?? ''); }
      return typeof av === 'number' ? (av - (bv as number)) * dir : String(av).localeCompare(String(bv)) * dir;
    });
    return rows;
  }, [visible, lens, search, status, category, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  useEffect(() => { setPage(0); }, [search, status, category, lens]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };
  const show = (c: OptCol) => !hidden.has(c);
  const toggleCol = (c: OptCol) =>
    setHidden((prev) => {
      const n = new Set(prev);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const toggleSelectAll = () => setSelected((prev) => {
    const n = new Set(prev);
    if (allOnPageSelected) pageRows.forEach((r) => n.delete(r.id));
    else pageRows.forEach((r) => n.add(r.id));
    return n;
  });
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** Select every asset the current view matches — not just this page. This is
   *  what lets a view stand in for a group as a bulk-action target. */
  const selectAllMatching = () => setSelected(new Set(filtered.map((a) => a.id)));

  const applyView = (v: SavedView) => {
    setStatus(v.status); setCategory(v.category); setSearch(v.search);
    setLens(v.lens); setActiveView(v.name);
  };

  const saveCurrentView = () => {
    const name = viewName.trim();
    if (!name) return;
    saveView({ name, status, category, search, lens });
    setActiveView(name);
    setNaming(false);
    setViewName('');
    toast({ title: `“${name}” saved`, description: describeView({ id: '', name, status, category, search, lens }), tone: 'success' });
  };

  /**
   * Download what is on screen.
   *
   * Takes the rows it is handed rather than re-querying: "export this" means
   * the assets the user has filtered to, and only the browser knows what those
   * are.
   */
  const exportCsv = (rows: Asset[]) => {
    const count = downloadCsv(
      `assets-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((a) => ({
        'Asset ID': a.id,
        Name: a.name,
        Category: a.category,
        'Serial number': a.serialNumber,
        Status: a.status,
        Criticality: a.criticality ?? '',
        Custodian: a.custodian,
        Location: a.location?.name ?? '',
        Health: a.healthScore,
        Risk: a.riskScore ?? '',
        'Utilization %': a.utilization ?? '',
        'Tracking ID': a.trackingId ?? '',
        'Purchase date': a.purchaseDate?.slice(0, 10) ?? '',
        'Purchase price': a.purchasePrice,
        'Book value': a.bookValue ?? '',
      })),
    );

    toast({
      title: count > 0 ? `${count} asset${count === 1 ? '' : 's'} exported` : 'Nothing to export',
      description: count > 0 ? 'Downloaded as CSV.' : 'No assets match the current filters.',
      tone: count > 0 ? 'success' : 'info',
    });
  };

  const shareView = () => {
    const qs = viewToQuery({ search, status, category, lens });
    const url = `${window.location.origin}/assets${qs ? `?${qs}` : ''}`;
    navigator.clipboard?.writeText(url);
    toast({ title: 'Link copied', description: `${filtered.length} assets — resolved live, not a frozen list`, tone: 'success' });
  };

  const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500 select-none';
  const td = cn('px-4', dense ? 'py-2' : 'py-3.5');

  const sortHead = (k: SortKey, label: string, className?: string) => (
    <SortHead key={k} sortKey={k} label={label} className={className} active={sortKey} direction={sortDir} onSort={toggleSort} thClass={th} />
  );

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Asset Registry"
        subtitle="Manage and track your global enterprise assets."
        breadcrumb={[{ label: 'Assets' }, { label: 'Registry' }]}
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv(filtered)}>Export CSV</Button>
            {/* Straight to the Add Asset page. The source picker there IS this
                menu — better presented, and asked once instead of twice. */}
            <Link to="/assets/new">
              <Button>+ Add Asset</Button>
            </Link>
          </>
        }
      />

      {/* Saved views — the onboarding exception queues sit alongside the
          ordinary status views, because they are the same kind of thing. */}
      <div className="flex items-center gap-2 flex-wrap">
        {views.map((v) => {
          const count = v.lens !== 'all' ? lensCounts[v.lens] : undefined;
          const active = activeView === v.name;
          return (
            <span
              key={v.id}
              title={describeView(v)}
              className={cn('inline-flex items-center rounded-full border transition-colors',
                active ? 'bg-primary-50 border-primary-200 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                count === 0 && !active && 'opacity-45')}
            >
              <button type="button" onClick={() => applyView(v)} className="px-3 py-1 text-xs font-medium">
                {v.name}
                {count !== undefined && <span className="ml-1.5 tabular-nums text-slate-400">{count}</span>}
              </button>
              {/* Only views someone saved can be removed. */}
              {!v.builtIn && (
                <button
                  type="button"
                  onClick={() => { removeView(v.id); if (active) applyView(views[0]); }}
                  aria-label={`Delete view ${v.name}`}
                  className="pr-2.5 pl-0.5 text-xs text-slate-300 hover:text-health-critical"
                >
                  ✕
                </button>
              )}
            </span>
          );
        })}

        {naming ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-white px-2 py-0.5">
            <input
              autoFocus
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCurrentView();
                if (e.key === 'Escape') { setNaming(false); setViewName(''); }
              }}
              placeholder="Name this view…"
              aria-label="Name this view"
              className="w-40 bg-transparent px-1 py-0.5 text-xs outline-none placeholder:text-slate-400"
            />
            <button type="button" onClick={saveCurrentView} disabled={!viewName.trim()} className="text-xs font-semibold text-primary-600 disabled:opacity-40">Save</button>
            <button type="button" onClick={() => { setNaming(false); setViewName(''); }} aria-label="Cancel" className="text-xs text-slate-300 hover:text-slate-600">✕</button>
          </span>
        ) : (
          <button type="button" onClick={() => setNaming(true)} className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-400 hover:border-slate-400 hover:text-slate-700">
            + Save current view
          </button>
        )}

        <button
          onClick={shareView}
          title="Copy a link to this exact view"
          className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-400 hover:border-slate-400 hover:text-slate-700"
        >
          🔗 Share view
        </button>
      </div>

      <div className="glass-panel rounded-xl flex-1 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setActiveView(''); }}
            placeholder="Filter by name, serial, tag, custodian…"
            className="w-64 max-w-full px-3 py-1.5 bg-slate-100 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-500"
          />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setActiveView(''); }} className="px-3 py-1.5 bg-slate-100 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-500">
            {STATUSES.map((s) => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s.replace('_', ' ')}</option>)}
          </select>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setActiveView(''); }} className="px-3 py-1.5 bg-slate-100 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-500">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400">{filtered.length} of {visible.length}</span>
            <button type="button" onClick={() => setDense((d) => !d)} title="Toggle density" className="rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50">
              {dense ? '≣ Comfortable' : '≡ Compact'}
            </button>
            <Dropdown
              ariaLabel="Column configuration"
              trigger={({ toggle }) => (
                <button type="button" onClick={toggle} className="rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50">⚙ Columns</button>
              )}
            >
              {() => (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Visible columns</div>
                  {OPTIONAL_COLUMNS.map((c) => (
                    <MenuItem key={c} onClick={() => toggleCol(c)} icon={show(c) ? '☑' : '☐'}>{colLabels[c]}</MenuItem>
                  ))}
                </>
              )}
            </Dropdown>
          </div>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 bg-primary-50 border-b border-primary-100 px-4 py-2 text-sm">
            <span className="font-medium text-primary-700">{selected.size} selected</span>
            {/* A view is only a real replacement for a group if you can act on
                the whole set, not just the ten rows you can see. */}
            {selected.size < filtered.length && (
              <button type="button" onClick={selectAllMatching} className="rounded-md border border-primary-200 bg-white px-2.5 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-50">
                Select all {filtered.length} matching
              </button>
            )}
            <div className="flex items-center gap-1.5">
              {/* Labelling is a real destination, not a toast: the selection is
                  handed to the label module through the URL so the designer
                  opens on exactly these assets. */}
              <Link
                to={`/assets/labels?ids=${[...selected].join(',')}`}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
              >
                Print Labels
              </Link>
              <button
                onClick={() => exportCsv(assets.filter((a) => selected.has(a.id)))}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
              >
                Export
              </button>
              {/*
                Each of these is a real write against every selected asset. The
                two the old bar offered and this one does not — "Start Transfer"
                and "Apply Class Policy" — live in Operations ▸ Transfers and on
                the class itself; a second path to them here would give the
                estate two ways to do one thing.
              */}
              {(
                [
                  ['custodian', 'Assign Custodian'],
                  ['location', 'Move Location'],
                  ['criticality', 'Set Criticality'],
                  ['status', 'Change Status'],
                ] as const
              ).map(([action, label]) => (
                <button
                  key={action}
                  onClick={() => setBulkAction(action)}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-800">Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} aria-label="Select all on page" className="accent-primary-600" />
                </th>
                {sortHead('name', 'Asset ID / Name')}
                {sortHead('status', 'Status')}
                {sortHead('healthScore', 'Health')}
                {show('category') && sortHead('category', 'Category')}
                {show('location') && <th scope="col" className={th}>Location</th>}
                {show('custodian') && <th scope="col" className={th}>Custodian</th>}
                {show('utilization') && sortHead('utilization', 'Util %')}
                {show('riskScore') && sortHead('riskScore', 'Risk')}
                {show('lastPing') && sortHead('lastPing', 'Last Ping')}
                <th scope="col" className={cn(th, 'text-right')}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((a) => (
                <tr key={a.id} className={cn('hover:bg-slate-50 transition-colors', selected.has(a.id) && 'bg-primary-50/40')}>
                  <td className={td}><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleRow(a.id)} aria-label={`Select ${a.name}`} className="accent-primary-600" /></td>
                  <td className={td}>
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-base mr-3 shrink-0">{categoryEmoji(a.category)}</div>
                      <div className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Link to={`/assets/${a.id}`} className="font-medium text-slate-900 hover:text-primary-600">{a.name}</Link>
                          {a.onboarding.state === 'Draft' && <Badge tone="primary">Setup incomplete</Badge>}
                          {a.onboarding.state === 'Pending Approval' && <Badge tone="amber">Awaiting approval</Badge>}
                          {sessionIds.includes(a.id) && <Badge tone="emerald">New</Badge>}
                        </span>
                        <div className="text-xs text-slate-400">{a.id}{a.serialNumber ? ` · SN ${a.serialNumber}` : ''}{a.trackingId ? ` · ${a.trackingId}` : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className={td}><Badge tone={statusTone(a.status)}>{a.status.replace('_', ' ')}</Badge></td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div className={cn('h-full rounded-full', a.healthScore > 80 ? 'bg-health-good' : a.healthScore > 50 ? 'bg-health-warning' : 'bg-health-critical')} style={{ width: `${a.healthScore}%` }} />
                      </div>
                      <span className="text-xs font-medium tabular-nums">{a.healthScore}</span>
                    </div>
                  </td>
                  {show('category') && <td className={cn(td, 'text-slate-600')}>{a.category}</td>}
                  {show('location') && <td className={td}><div className="text-slate-700">{a.location.name}</div><div className="text-xs text-slate-400">{a.location.zone}</div></td>}
                  {show('custodian') && <td className={cn(td, 'text-slate-600')}>{a.custodian}</td>}
                  {show('utilization') && <td className={cn(td, 'tabular-nums text-slate-600')}>{a.utilization ?? '—'}%</td>}
                  {show('riskScore') && (
                    <td className={td}>
                      <span className={cn('text-sm font-semibold tabular-nums', (a.riskScore ?? 0) > 70 ? 'text-health-critical' : (a.riskScore ?? 0) > 40 ? 'text-health-warning' : 'text-health-good')}>{a.riskScore ?? 0}</span>
                    </td>
                  )}
                  {show('lastPing') && <td className={cn(td, 'text-slate-400 text-xs')}>{a.telemetry?.lastPing ? relTime(a.telemetry.lastPing) : 'Unknown'}</td>}
                  <td className={cn(td, 'text-right')}>
                    {a.onboarding.state === 'Draft' ? (
                      <Link to={`/assets/new?resume=${a.id}`} className="text-primary-600 hover:text-primary-700 font-medium text-sm">Finish setup →</Link>
                    ) : (
                      <Link to={`/assets/${a.id}`} className="text-slate-400 hover:text-primary-600 font-medium text-sm">Open →</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pageRows.length === 0 && (
            <EmptyState variant="no-results" title="No assets match your filters" description="Try a different search, status, or view." action={<Button variant="outline" onClick={() => { setSearch(''); setStatus('All'); setCategory('All'); setLens('all'); setActiveView('All Assets'); }}>Clear filters</Button>} />
          )}
        </div>

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-sm text-slate-500">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-slate-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-50">← Prev</button>
              <span className="px-2 text-xs">Page {page + 1} of {pageCount}</span>
              <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-slate-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-50">Next →</button>
            </div>
          </div>
        )}
      </div>

      {bulkAction && (
        <BulkActionDialog
          action={bulkAction}
          ids={[...selected]}
          onClose={() => {
            setBulkAction(null);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}
