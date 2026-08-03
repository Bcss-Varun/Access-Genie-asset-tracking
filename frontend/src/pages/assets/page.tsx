import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mockAssets } from '@/lib/mock-data';
import type { Asset } from '@/types/asset';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime, cn } from '@/lib/utils';

const categoryEmoji = (c: Asset['category']) =>
  c === 'Endpoints' ? '📱' : c === 'Compute' ? '💻' : c === 'Network' ? '🌐' : c === 'Sensors' ? '📡' : c === 'Infrastructure' ? '⚡' : '⚙️';

const statusTone = (s: Asset['status']) =>
  s === 'Active' ? 'emerald' : s === 'Maintenance' ? 'amber' : s === 'Missing' ? 'red' : 'slate';

const STATUSES = ['All', 'Active', 'Maintenance', 'Missing', 'Staging', 'End_Of_Life'] as const;
const CATEGORIES = ['All', 'Compute', 'Network', 'Endpoints', 'Infrastructure', 'Sensors'] as const;

type SortKey = 'name' | 'status' | 'healthScore' | 'category' | 'utilization' | 'riskScore' | 'lastPing';
const OPTIONAL_COLUMNS = ['category', 'location', 'custodian', 'utilization', 'riskScore', 'lastPing'] as const;
type OptCol = (typeof OPTIONAL_COLUMNS)[number];
const colLabels: Record<OptCol, string> = {
  category: 'Category', location: 'Location', custodian: 'Custodian', utilization: 'Utilization', riskScore: 'Risk', lastPing: 'Last Ping',
};

interface SavedView { name: string; status: string; category: string; search: string; }
const BUILT_IN_VIEWS: SavedView[] = [
  { name: 'All Assets', status: 'All', category: 'All', search: '' },
  { name: 'In Maintenance', status: 'Maintenance', category: 'All', search: '' },
  { name: 'Missing', status: 'Missing', category: 'All', search: '' },
  { name: 'Endpoints', status: 'All', category: 'Endpoints', search: '' },
];

const PAGE_SIZE = 10;

export default function AssetRegistryPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('All');
  const [category, setCategory] = useState<string>('All');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [hidden, setHidden] = useState<Set<OptCol>>(new Set<OptCol>(['utilization', 'riskScore', 'lastPing']));
  const [dense, setDense] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [views, setViews] = useState<SavedView[]>(BUILT_IN_VIEWS);
  const [activeView, setActiveView] = useState('All Assets');

  // Shareable state: reflect primary filters into the URL (no re-render loop).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('q')) setSearch(p.get('q')!);
    if (p.get('status')) setStatus(p.get('status')!);
    if (p.get('category')) setCategory(p.get('category')!);
  }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    if (status !== 'All') p.set('status', status);
    if (category !== 'All') p.set('category', category);
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [search, status, category]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = mockAssets.filter((a) => {
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
  }, [search, status, category, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  useEffect(() => { setPage(0); }, [search, status, category]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };
  const show = (c: OptCol) => !hidden.has(c);
  const toggleCol = (c: OptCol) => setHidden((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const toggleSelectAll = () => setSelected((prev) => {
    const n = new Set(prev);
    if (allOnPageSelected) pageRows.forEach((r) => n.delete(r.id));
    else pageRows.forEach((r) => n.add(r.id));
    return n;
  });
  const toggleRow = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const applyView = (v: SavedView) => { setStatus(v.status); setCategory(v.category); setSearch(v.search); setActiveView(v.name); };
  const saveCurrentView = () => {
    const name = `View ${views.length + 1}`;
    const v = { name, status, category, search };
    setViews((prev) => [...prev, v]);
    setActiveView(name);
    toast({ title: 'Saved view', description: `“${name}” saved for this session`, tone: 'success' });
  };

  const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500 select-none';
  const td = cn('px-4', dense ? 'py-2' : 'py-3.5');
  const SortHead = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <th className={cn(th, 'cursor-pointer hover:text-slate-800', className)} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">{label}{sortKey === k && <span className="text-primary-500">{sortDir === 'asc' ? '▲' : '▼'}</span>}</span>
    </th>
  );

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Asset Registry"
        subtitle="Manage and track your global enterprise assets."
        breadcrumb={[{ label: 'Assets' }, { label: 'Registry' }]}
        actions={
          <>
            <Button variant="outline" onClick={() => toast({ title: 'Export started', description: `${filtered.length} assets → CSV`, tone: 'success' })}>Export CSV</Button>
            <Button onClick={() => toast({ title: 'Register asset', description: 'Create form is on the roadmap.', tone: 'info' })}>+ Register Asset</Button>
          </>
        }
      />

      {/* Saved views */}
      <div className="flex items-center gap-2 flex-wrap">
        {views.map((v) => (
          <button
            key={v.name}
            onClick={() => applyView(v)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              activeView === v.name ? 'bg-primary-50 border-primary-200 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}
          >
            {v.name}
          </button>
        ))}
        <button onClick={saveCurrentView} className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-400 hover:text-slate-700 hover:border-slate-400">
          + Save current view
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
            <span className="text-xs text-slate-400">{filtered.length} of {mockAssets.length}</span>
            <button onClick={() => setDense((d) => !d)} title="Toggle density" className="rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50">
              {dense ? '≣ Comfortable' : '≡ Compact'}
            </button>
            <Dropdown
              ariaLabel="Column configuration"
              trigger={({ toggle }) => (
                <button onClick={toggle} className="rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50">⚙ Columns</button>
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
            <div className="flex items-center gap-1.5">
              {['Export', 'Assign Custodian', 'Start Transfer', 'Add to Group', 'Retire'].map((a) => (
                <button key={a} onClick={() => toast({ title: a, description: `${selected.size} assets`, tone: 'info' })} className="rounded-md px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100">{a}</button>
              ))}
            </div>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-800">Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} aria-label="Select all on page" className="accent-primary-600" />
                </th>
                <SortHead k="name" label="Asset ID / Name" />
                <SortHead k="status" label="Status" />
                <SortHead k="healthScore" label="Health" />
                {show('category') && <SortHead k="category" label="Category" />}
                {show('location') && <th className={th}>Location</th>}
                {show('custodian') && <th className={th}>Custodian</th>}
                {show('utilization') && <SortHead k="utilization" label="Util %" />}
                {show('riskScore') && <SortHead k="riskScore" label="Risk" />}
                {show('lastPing') && <SortHead k="lastPing" label="Last Ping" />}
                <th className={cn(th, 'text-right')}>Actions</th>
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
                        <Link to={`/assets/${a.id}`} className="font-medium text-slate-900 hover:text-primary-600">{a.name}</Link>
                        <div className="text-xs text-slate-400">{a.id} · SN {a.serialNumber}{a.trackingId ? ` · ${a.trackingId}` : ''}</div>
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
                    <Link to={`/assets/${a.id}`} className="text-slate-400 hover:text-primary-600 font-medium text-sm">Open →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pageRows.length === 0 && (
            <EmptyState variant="no-results" title="No assets match your filters" description="Try a different search, status, or category." action={<Button variant="outline" onClick={() => { setSearch(''); setStatus('All'); setCategory('All'); }}>Clear filters</Button>} />
          )}
        </div>

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-sm text-slate-500">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-slate-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-50">← Prev</button>
              <span className="px-2 text-xs">Page {page + 1} of {pageCount}</span>
              <button disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-slate-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-50">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
