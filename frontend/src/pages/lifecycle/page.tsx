import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LIFECYCLE_STAGES, type LifecycleStage, type RegisteredAsset } from '@access-genie/shared';
import { allLifecycleTransitions, allPmSchedules, getWorkOrdersForAsset } from '@/lib/dataset';
import { useRegistry } from '@/components/providers/RegistryProvider';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { optionsFrom } from '@/components/ui/FormDialog';
import { ChangeStageDialog } from '@/components/lifecycle/ChangeStageDialog';
import { BulkAssignDialog, BulkMaintenanceDialog } from '@/components/lifecycle/BulkActionDialogs';
import { downloadCsv } from '@/api/configuration';
import { cn, formatMoney, formatDate, nowMs } from '@/lib/utils';
import { categoryEmoji } from '@/lib/asset-categories';

// ── Stage presentation ──────────────────────────────────────────────────────
const STAGE_THEME: Record<LifecycleStage, { dot: string; head: string; badge: 'slate' | 'primary' | 'emerald' | 'amber' | 'red'; emoji: string }> = {
  Planning: { dot: 'bg-slate-400', head: 'text-slate-600', badge: 'slate', emoji: '📝' },
  Procurement: { dot: 'bg-slate-400', head: 'text-slate-600', badge: 'slate', emoji: '🛒' },
  Received: { dot: 'bg-primary-500', head: 'text-primary-700', badge: 'primary', emoji: '📦' },
  Commissioning: { dot: 'bg-primary-500', head: 'text-primary-700', badge: 'primary', emoji: '🔧' },
  Available: { dot: 'bg-health-good', head: 'text-emerald-700', badge: 'emerald', emoji: '✅' },
  'Assigned / In Service': { dot: 'bg-health-good', head: 'text-emerald-700', badge: 'emerald', emoji: '👤' },
  Maintenance: { dot: 'bg-health-warning', head: 'text-amber-700', badge: 'amber', emoji: '🛠️' },
  Returned: { dot: 'bg-health-warning', head: 'text-amber-700', badge: 'amber', emoji: '↩️' },
  Retired: { dot: 'bg-health-critical', head: 'text-red-700', badge: 'red', emoji: '🗄️' },
  Disposed: { dot: 'bg-health-critical', head: 'text-red-700', badge: 'red', emoji: '🗑️' },
};

const HEALTH_ATTENTION_FLOOR = 45;
const WARRANTY_ATTENTION_DAYS = 30;

const healthColor = (h: number) => (h > 80 ? 'bg-health-good' : h > 50 ? 'bg-health-warning' : 'bg-health-critical');

function warrantyDaysLeft(a: RegisteredAsset): number | null {
  if (!a.warrantyExpiry) return null;
  return Math.round((Date.parse(a.warrantyExpiry) - nowMs()) / 86_400_000);
}

function trackingStatus(a: RegisteredAsset): 'Untracked' | 'Tracked' | 'Signal Lost' {
  if (!a.trackingId) return 'Untracked';
  const lastPing = a.telemetry?.lastPing;
  if (lastPing && nowMs() - Date.parse(lastPing) < 24 * 60 * 60_000) return 'Tracked';
  return 'Signal Lost';
}

function needsAttention(a: RegisteredAsset): boolean {
  const days = warrantyDaysLeft(a);
  return a.healthScore < HEALTH_ATTENTION_FLOOR || (days !== null && days <= WARRANTY_ATTENTION_DAYS);
}

// ── Filters ──────────────────────────────────────────────────────────────────
interface Filters {
  facility: string;
  department: string;
  stage: string;
  category: string;
  custodian: string;
  health: string;
  warranty: string;
  tracking: string;
  criticality: string;
  vendor: string;
}
const EMPTY_FILTERS: Filters = {
  facility: '', department: '', stage: '', category: '', custodian: '', health: '', warranty: '', tracking: '', criticality: '', vendor: '',
};

export default function LifecyclePage() {
  const { assets } = useRegistry();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [changeStageAsset, setChangeStageAsset] = useState<RegisteredAsset | null>(null);
  const [bulkAction, setBulkAction] = useState<'stage' | 'disposal' | 'assign' | 'maintenance' | null>(null);

  const live = useMemo(() => assets.filter((a) => !a.onboarding?.voidedAt), [assets]);

  // ── KPIs — §7, computed over the whole (unfiltered) fleet ─────────────────
  const kpis = useMemo(() => {
    const now = nowMs();
    const warrantyWindow = now + WARRANTY_ATTENTION_DAYS * 86_400_000;
    const count = (s: LifecycleStage) => live.filter((a) => a.lifecycleStage === s).length;
    const avg = (nums: number[]) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0);

    return {
      inService: count('Assigned / In Service'),
      maintenanceDue: allPmSchedules.filter((p) => Date.parse(p.nextDue) <= now).length,
      warrantyExpiring: live.filter((a) => {
        const t = a.warrantyExpiry ? Date.parse(a.warrantyExpiry) : null;
        return t !== null && t >= now && t <= warrantyWindow;
      }).length,
      returned: count('Returned'),
      retired: count('Retired'),
      disposed: count('Disposed'),
      awaitingAssignment: count('Available'),
      avgHealth: avg(live.map((a) => a.healthScore)),
      avgAgeYears: live.length
        ? Math.round((live.reduce((sum, a) => sum + (now - Date.parse(a.purchaseDate)), 0) / live.length / (365.25 * 86_400_000)) * 10) / 10
        : 0,
      portfolioValue: Math.round(live.reduce((sum, a) => sum + (a.bookValue ?? 0), 0)),
      requiringApproval: allLifecycleTransitions.filter((t) => t.status === 'Pending').length,
    };
  }, [live]);

  // ── Board columns — §3, always over the whole fleet ────────────────────────
  const boardColumns = useMemo(() => {
    const byStage = new Map(LIFECYCLE_STAGES.map((s) => [s, [] as RegisteredAsset[]]));
    for (const a of live) byStage.get(a.lifecycleStage)?.push(a);
    return LIFECYCLE_STAGES.map((stage) => {
      const items = byStage.get(stage) ?? [];
      const healthSum = items.reduce((sum, a) => sum + a.healthScore, 0);
      return {
        stage,
        items,
        total: items.length,
        requiringAttention: items.filter(needsAttention).length,
        avgHealth: items.length ? Math.round(healthSum / items.length) : 0,
        totalValue: Math.round(items.reduce((sum, a) => sum + (a.bookValue ?? 0), 0)),
        criticalCount: items.filter((a) => a.healthStatus === 'Critical').length,
      };
    });
  }, [live]);

  // ── Facets for the filter bar ───────────────────────────────────────────────
  const facets = useMemo(
    () => ({
      facilities: Array.from(new Set(live.map((a) => a.location.name))).sort(),
      departments: Array.from(new Set(live.map((a) => a.onboarding?.department).filter(Boolean))) as string[],
      categories: Array.from(new Set(live.map((a) => a.category))).sort(),
      vendors: Array.from(new Set(live.map((a) => a.manufacturer).filter(Boolean))) as string[],
    }),
    [live],
  );

  // ── List — search + advanced filters, §4 ────────────────────────────────────
  const filtered = useMemo(() => {
    const rx = q.trim() ? new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    return live.filter((a) => {
      if (rx && !rx.test(a.name) && !rx.test(a.id) && !rx.test(a.serialNumber)) return false;
      if (filters.facility && a.location.name !== filters.facility) return false;
      if (filters.department && a.onboarding?.department !== filters.department) return false;
      if (filters.stage && a.lifecycleStage !== filters.stage) return false;
      if (filters.category && a.category !== filters.category) return false;
      if (filters.custodian && a.custodian !== filters.custodian) return false;
      if (filters.health && a.healthStatus !== filters.health) return false;
      if (filters.criticality && a.criticality !== filters.criticality) return false;
      if (filters.vendor && a.manufacturer !== filters.vendor) return false;
      if (filters.tracking && trackingStatus(a) !== filters.tracking) return false;
      if (filters.warranty) {
        const days = warrantyDaysLeft(a);
        if (filters.warranty === 'Expiring' && !(days !== null && days >= 0 && days <= WARRANTY_ATTENTION_DAYS)) return false;
        if (filters.warranty === 'Expired' && !(days !== null && days < 0)) return false;
        if (filters.warranty === 'Active' && !(days !== null && days > WARRANTY_ATTENTION_DAYS)) return false;
        if (filters.warranty === 'None' && days !== null) return false;
      }
      return true;
    });
  }, [live, q, filters]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const selectedAssets = live.filter((a) => selected.has(a.id));

  const exportRows = () =>
    downloadCsv(
      'lifecycle-export.csv',
      filtered.map((a) => ({
        Asset: a.name,
        AssetID: a.id,
        Category: a.category,
        AssignedUser: a.custodian,
        Department: a.onboarding?.department ?? '',
        Location: a.location.name,
        LifecycleStage: a.lifecycleStage,
        Health: a.healthScore,
        WarrantyExpiry: a.warrantyExpiry ?? '',
        BookValue: a.bookValue ?? 0,
        TrackingStatus: trackingStatus(a),
        LastUpdated: a.updatedAt,
      })),
    );

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Asset Lifecycle"
        subtitle="Governed, workflow-driven lifecycle — every stage change is requested, reasoned and recorded."
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Lifecycle' }]}
        actions={
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            {(['board', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-colors',
                  view === v ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

      {/* KPI row — §7 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="In Service" value={kpis.inService} tone="emerald" accent />
        <KpiCard label="Maintenance Due" value={kpis.maintenanceDue} tone="amber" />
        <KpiCard label="Warranty Expiring" value={kpis.warrantyExpiring} tone="amber" sub={`≤${WARRANTY_ATTENTION_DAYS}d`} />
        <KpiCard label="Awaiting Assignment" value={kpis.awaitingAssignment} tone="primary" />
        <KpiCard label="Requiring Approval" value={kpis.requiringApproval} tone={kpis.requiringApproval > 0 ? 'red' : 'slate'} />
        <KpiCard label="Portfolio Value" value={formatMoney(kpis.portfolioValue)} tone="slate" sub={`${live.length} assets`} />
        <KpiCard label="Returned" value={kpis.returned} tone="slate" />
        <KpiCard label="Retired" value={kpis.retired} tone="slate" />
        <KpiCard label="Disposed" value={kpis.disposed} tone="slate" />
        <KpiCard label="Avg Health" value={`${kpis.avgHealth}`} tone="slate" />
        <KpiCard label="Avg Asset Age" value={`${kpis.avgAgeYears}y`} tone="slate" />
      </div>

      {view === 'board' ? (
        <BoardView
          columns={boardColumns}
          onChangeStage={setChangeStageAsset}
        />
      ) : (
        <ListView
          rows={filtered}
          total={live.length}
          q={q}
          onQ={setQ}
          filters={filters}
          onFilters={setFilters}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((s) => !s)}
          activeFilterCount={activeFilterCount}
          facets={facets}
          selected={selected}
          onSelect={setSelected}
          onChangeStage={setChangeStageAsset}
          onExport={exportRows}
          onBulk={setBulkAction}
        />
      )}

      {changeStageAsset && (
        <ChangeStageDialog mode="single" asset={changeStageAsset} onClose={() => setChangeStageAsset(null)} />
      )}
      {bulkAction === 'stage' && (
        <ChangeStageDialog mode="bulk" assetIds={[...selected]} onClose={() => setBulkAction(null)} onDone={() => setSelected(new Set())} />
      )}
      {bulkAction === 'disposal' && (
        <ChangeStageDialog
          mode="bulk"
          assetIds={[...selected]}
          initialStage="Disposed"
          onClose={() => setBulkAction(null)}
          onDone={() => setSelected(new Set())}
        />
      )}
      {bulkAction === 'assign' && (
        <BulkAssignDialog assets={selectedAssets} onClose={() => setBulkAction(null)} onDone={() => setSelected(new Set())} />
      )}
      {bulkAction === 'maintenance' && (
        <BulkMaintenanceDialog assets={selectedAssets} onClose={() => setBulkAction(null)} onDone={() => setSelected(new Set())} />
      )}
    </div>
  );
}

// ── Board view — §3: operational overview, not a drag board ────────────────
interface BoardColumn {
  stage: LifecycleStage;
  items: RegisteredAsset[];
  total: number;
  requiringAttention: number;
  avgHealth: number;
  totalValue: number;
  criticalCount: number;
}

function BoardView({
  columns, onChangeStage,
}: {
  columns: BoardColumn[];
  onChangeStage: (a: RegisteredAsset) => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex gap-4 overflow-x-auto pb-2">
      {columns.map((col) => {
        const theme = STAGE_THEME[col.stage];
        return (
          <div key={col.stage} className="glass-panel flex w-80 shrink-0 flex-col rounded-xl">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', theme.dot)} />
                  <h2 className={cn('font-heading text-sm font-bold truncate', theme.head)}>{col.stage}</h2>
                </div>
                <Badge tone={theme.badge}>{col.total}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span>Attention: <strong className={col.requiringAttention > 0 ? 'text-amber-600' : 'text-slate-600'}>{col.requiringAttention}</strong></span>
                <span>Critical: <strong className={col.criticalCount > 0 ? 'text-red-600' : 'text-slate-600'}>{col.criticalCount}</strong></span>
                <span>Avg health: <strong className="text-slate-600">{col.avgHealth}</strong></span>
                <span>Value: <strong className="text-slate-600">{formatMoney(col.totalValue)}</strong></span>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {col.items.length === 0 ? (
                <EmptyState icon={theme.emoji} title="No assets" description={`Nothing in ${col.stage}.`} />
              ) : (
                col.items.map((a) => <AssetCard key={a.id} asset={a} onChangeStage={onChangeStage} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AssetCard({ asset, onChangeStage }: { asset: RegisteredAsset; onChangeStage: (a: RegisteredAsset) => void }) {
  const days = warrantyDaysLeft(asset);
  // "Incident count" has no dedicated model in this build — open work orders
  // against the asset are the closest real proxy (see docs/26 gap notes).
  const openIncidents = getWorkOrdersForAsset(asset.id).filter((wo) => wo.status !== 'Completed').length;
  return (
    <div className="group relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-base">
          {categoryEmoji(asset.category)}
        </div>
        <div className="min-w-0 flex-1">
          <Link to={`/assets/${asset.id}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-primary-600">
            {asset.name}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
            <span className="font-mono">{asset.id}</span>
            <span>·</span>
            <span>{asset.category}</span>
          </div>
        </div>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-500">
        <div className="truncate">👤 {asset.custodian}</div>
        <div className="truncate">📍 {asset.location.name}</div>
        <div className="truncate">📶 {trackingStatus(asset)}</div>
        <div className="truncate">🛡️ {days === null ? 'No warranty' : days < 0 ? 'Expired' : `${days}d left`}</div>
      </dl>

      <div className="mt-2.5">
        <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-400">
          <span>Health</span>
          <span className="tabular-nums text-slate-600">{asset.healthScore}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={cn('h-full rounded-full', healthColor(asset.healthScore))} style={{ width: `${asset.healthScore}%` }} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-bold font-heading tabular-nums text-slate-900">{formatMoney(asset.bookValue ?? 0)}</span>
        {openIncidents > 0 && <Badge tone="amber">{openIncidents} open</Badge>}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1 border-t border-slate-100 pt-2 text-center">
        <Link to={`/assets/${asset.id}`} className="rounded py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-primary-600">
          View
        </Link>
        <button onClick={() => onChangeStage(asset)} className="rounded py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-primary-600">
          Stage
        </button>
        <Link to={`/assets/${asset.id}?tab=lifecycle`} className="rounded py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-primary-600">
          History
        </Link>
        <Dropdown
          ariaLabel="More actions"
          trigger={({ toggle }) => (
            <button onClick={toggle} className="rounded py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-primary-600">
              More
            </button>
          )}
        >
          {({ close }) => (
            <>
              <MenuItem onClick={() => { window.location.href = `/assets/${asset.id}?tab=custody`; close(); }}>Custody</MenuItem>
              <MenuItem onClick={() => { window.location.href = `/assets/${asset.id}?tab=documents`; close(); }}>Documents</MenuItem>
              <MenuItem onClick={() => { window.location.href = `/assets/${asset.id}?tab=maintenance`; close(); }}>Maintenance</MenuItem>
            </>
          )}
        </Dropdown>
      </div>
    </div>
  );
}

// ── List view — §4: the primary operational workspace ──────────────────────
function ListView({
  rows, total, q, onQ, filters, onFilters, showFilters, onToggleFilters, activeFilterCount, facets,
  selected, onSelect, onChangeStage, onExport, onBulk,
}: {
  rows: RegisteredAsset[];
  total: number;
  q: string;
  onQ: (v: string) => void;
  filters: Filters;
  onFilters: (f: Filters) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
  facets: { facilities: string[]; departments: string[]; categories: string[]; vendors: string[] };
  selected: Set<string>;
  onSelect: (s: Set<string>) => void;
  onChangeStage: (a: RegisteredAsset) => void;
  onExport: () => void;
  onBulk: (a: 'stage' | 'disposal' | 'assign' | 'maintenance') => void;
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => onSelect(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect(next);
  };
  const set = (k: keyof Filters, v: string) => onFilters({ ...filters, [k]: v });

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder="Search by name, id or serial…"
          className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
        <Button variant="outline" size="sm" onClick={onToggleFilters}>
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Button>
        {activeFilterCount > 0 && (
          <button onClick={() => onFilters(EMPTY_FILTERS)} className="text-xs font-medium text-slate-400 hover:text-slate-600">
            Clear
          </button>
        )}
        <span className="text-xs text-slate-400">{rows.length} of {total}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExport}>⬇ Export</Button>
        </div>
      </div>

      {showFilters && (
        <div className="glass-panel grid grid-cols-2 gap-3 rounded-xl p-3 sm:grid-cols-3 lg:grid-cols-5">
          <FilterSelect label="Facility" value={filters.facility} onChange={(v) => set('facility', v)} options={facets.facilities} />
          <FilterSelect label="Department" value={filters.department} onChange={(v) => set('department', v)} options={facets.departments} />
          <FilterSelect label="Lifecycle" value={filters.stage} onChange={(v) => set('stage', v)} options={[...LIFECYCLE_STAGES]} />
          <FilterSelect label="Category" value={filters.category} onChange={(v) => set('category', v)} options={facets.categories} />
          <FilterSelect label="Health" value={filters.health} onChange={(v) => set('health', v)} options={['Good', 'Warning', 'Critical']} />
          <FilterSelect label="Warranty" value={filters.warranty} onChange={(v) => set('warranty', v)} options={['Active', 'Expiring', 'Expired', 'None']} />
          <FilterSelect label="Tracking" value={filters.tracking} onChange={(v) => set('tracking', v)} options={['Tracked', 'Signal Lost', 'Untracked']} />
          <FilterSelect label="Criticality" value={filters.criticality} onChange={(v) => set('criticality', v)} options={['Low', 'Medium', 'High', 'Critical']} />
          <FilterSelect label="Vendor" value={filters.vendor} onChange={(v) => set('vendor', v)} options={facets.vendors} />
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800">
          <strong>{selected.size}</strong> selected
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onBulk('stage')}>Bulk Stage Change</Button>
            <Button size="sm" variant="outline" onClick={() => onBulk('assign')}>Bulk Assignment</Button>
            <Button size="sm" variant="outline" onClick={() => onBulk('maintenance')}>Bulk Maintenance</Button>
            <Button size="sm" variant="danger" onClick={() => onBulk('disposal')}>Bulk Disposal</Button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="glass-panel rounded-xl">
          <EmptyState title="No matching assets" description="Try a different search or clear the filters." variant="no-results" />
        </div>
      ) : (
        <div className="glass-panel flex-1 min-h-0 overflow-auto rounded-xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} className="rounded border-slate-300" />
                </th>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Assigned User</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Lifecycle Stage</th>
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3">Warranty</th>
                <th className="px-4 py-3 text-right">Book Value</th>
                <th className="px-4 py-3">Tracking</th>
                <th className="px-4 py-3">Last Updated</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => {
                const theme = STAGE_THEME[a.lifecycleStage];
                const days = warrantyDaysLeft(a);
                return (
                  <tr key={a.id} className={cn('hover:bg-slate-50/70', selected.has(a.id) && 'bg-primary-50/40')}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} className="rounded border-slate-300" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-base">
                          {categoryEmoji(a.category)}
                        </div>
                        <div className="min-w-0">
                          <Link to={`/assets/${a.id}`} className="block truncate font-semibold text-slate-800 hover:text-primary-600">
                            {a.name}
                          </Link>
                          <div className="text-xs text-slate-400 font-mono">{a.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.category}</td>
                    <td className="px-4 py-3 text-slate-600">{a.custodian}</td>
                    <td className="px-4 py-3 text-slate-500">{a.onboarding?.department || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{a.location.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full', theme.dot)} />
                        <span className={theme.head}>{a.lifecycleStage}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div className={cn('h-full rounded-full', healthColor(a.healthScore))} style={{ width: `${a.healthScore}%` }} />
                        </div>
                        <span className="w-6 tabular-nums text-xs font-medium text-slate-600">{a.healthScore}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{days === null ? '—' : days < 0 ? 'Expired' : `${days}d`}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{formatMoney(a.bookValue ?? 0)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{trackingStatus(a)}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDate(a.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => onChangeStage(a)} className="text-xs font-medium text-primary-600 hover:text-primary-700">
                          Change Stage
                        </button>
                        <Link to={`/assets/${a.id}?tab=lifecycle`} className="text-xs font-medium text-slate-400 hover:text-slate-600">
                          History
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
      >
        <option value="">All</option>
        {optionsFrom(options).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
