// ─────────────────────────────────────────────────────────────────────────────
// Asset Financials — organization-level financial intelligence over the IT
// asset portfolio. Every KPI, chart and table on this page is a reduction
// over the same filtered `RegisteredAsset[]`, run through `lib/financials.ts`
// — there is no second, independently-maintained number anywhere here.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ASSET_CATEGORIES,
  LIFECYCLE_STAGES,
  type AssetCategory,
  type LifecycleStage,
  type RegisteredAsset,
} from '@access-genie/shared';
import { useRegistry } from '@/components/providers/RegistryProvider';
import { useScope } from '@/components/providers/ScopeProvider';
import { flattenScope } from '@/lib/rbac';
import { useTabs, Tabs, type TabDef } from '@/components/tracking/shell';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { WidgetFrame, WidgetEmpty } from '@/components/dashboards/WidgetFrame';
import { HBars, TH, TD } from '@/components/dashboards/DashboardKit';
import { MultiLine } from '@/components/charts/MultiLine';
import { FinancialsFilterBar, DEFAULT_FINANCIAL_FILTERS, type FinancialFilters } from '@/components/financials/FinancialsFilterBar';
import { LocationHierarchyTable } from '@/components/financials/LocationHierarchyTable';
import { AssetFinancialDrawer } from '@/components/financials/AssetFinancialDrawer';
import { downloadCsv } from '@/api/configuration';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import { categoryEmoji } from '@/lib/asset-categories';
import {
  aggregateBy,
  facilityOf,
  roomOf,
  financialStateFor,
  financialSeries,
  periodBounds,
  TREND_METRIC_LABEL,
  AGE_BUCKETS,
  type TrendMetric,
  type FinancialStatusLabel,
} from '@/lib/financials';

// Indigo-anchored cool palette, index-based so segments stay stable — same
// family the old page's donut used.
const CAT_PALETTE = ['#4f46e5', '#6366f1', '#8b5cf6', '#a78bfa', '#60a5fa', '#38bdf8', '#0ea5e9', '#06b6d4'];

const TAB_KEYS = ['overview', 'trends', 'depreciation', 'aging', 'location', 'register'] as const;
type TabKey = (typeof TAB_KEYS)[number];
const TAB_DEFS: TabDef<TabKey>[] = [
  { key: 'overview', label: 'Portfolio Overview' },
  { key: 'trends', label: 'Financial Trends' },
  { key: 'depreciation', label: 'Depreciation Analysis' },
  { key: 'aging', label: 'Asset Aging & EOL Exposure' },
  { key: 'location', label: 'Location / Facility Analysis' },
  { key: 'register', label: 'Asset Valuation Register' },
];

/** What a facility/category click elsewhere on the page hands the Register tab. */
interface RegisterSeed {
  facility?: string;
  category?: AssetCategory;
}

interface PortfolioKpis {
  purchase: number;
  book: number;
  depreciation: number;
  depreciationPct: number;
  inService: number;
  eolValue: number;
  count: number;
  avgAge: number;
  periodAcquisition: number;
}

export default function FinancialsPage() {
  const { assets } = useRegistry();
  const { setScopeId } = useScope();
  const [tab, setTab] = useTabs(TAB_KEYS, 'overview');
  const [filters, setFilters] = useState<FinancialFilters>(DEFAULT_FINANCIAL_FILTERS);
  const [drawerAsset, setDrawerAsset] = useState<RegisteredAsset | null>(null);
  const [registerSeed, setRegisterSeed] = useState<RegisterSeed>({});

  // Voided (deleted-in-session) registrations never counted toward the estate anywhere else either.
  const live = useMemo(() => assets.filter((a) => !a.onboarding?.voidedAt), [assets]);

  // Facility is already narrowed by `useScope()` upstream of `useRegistry()`'s
  // dataset — Room and Category are this page's own filters, applied here.
  const filtered = useMemo(
    () =>
      live.filter(
        (a) =>
          (!filters.room || roomOf(a) === filters.room) &&
          (!filters.category || a.category === filters.category),
      ),
    [live, filters.room, filters.category],
  );

  const roomOptions = useMemo(() => Array.from(new Set(live.map(roomOf))).sort(), [live]);

  const period = useMemo(
    () => periodBounds(filters.dateRangeKind, filters.granularity, { from: filters.customFrom ?? '', to: filters.customTo ?? '' }),
    [filters.dateRangeKind, filters.granularity, filters.customFrom, filters.customTo],
  );

  const acquiredInPeriod = useMemo(
    () =>
      filtered.filter((a) => {
        const t = Date.parse(a.purchaseDate);
        return t >= period.from.getTime() && t <= period.to.getTime();
      }),
    [filtered, period],
  );

  // ── Portfolio-level KPIs — §3, always "as of now" over the location/category
  // filtered fleet; only "This Period Acquisition" is date-scoped (a flow
  // metric among seven stock ones). ─────────────────────────────────────────
  const kpis = useMemo(() => {
    let purchase = 0;
    let book = 0;
    let inService = 0;
    let eolValue = 0;
    let ageSum = 0;

    for (const a of filtered) {
      const fin = financialStateFor(a);
      purchase += fin.state?.purchasePrice ?? a.purchasePrice;
      book += fin.state?.bookValue ?? 0;
      if (a.lifecycleStage === 'Assigned / In Service') inService += 1;
      if (fin.status === 'EOL' || fin.status === 'Near EOL') eolValue += fin.state?.bookValue ?? 0;
      ageSum += fin.ageYears;
    }

    const depreciation = purchase - book;
    return {
      purchase: Math.round(purchase),
      book: Math.round(book),
      depreciation: Math.round(depreciation),
      depreciationPct: purchase > 0 ? Math.round((depreciation / purchase) * 100) : 0,
      inService,
      eolValue: Math.round(eolValue),
      count: filtered.length,
      avgAge: filtered.length ? ageSum / filtered.length : 0,
      periodAcquisition: Math.round(acquiredInPeriod.reduce((s, a) => s + a.purchasePrice, 0)),
    };
  }, [filtered, acquiredInPeriod]);

  const openDrawer = (a: RegisteredAsset) => setDrawerAsset(a);
  const goToRegister = (seed: RegisterSeed) => {
    setRegisterSeed(seed);
    setTab('register');
  };
  /** §4/§10 — "clicking a facility drills down": sets the real app scope, same one `FinancialsFilterBar`'s own Facility select writes, then opens the dedicated Location/Facility Analysis tab. */
  const goToFacility = (facilityName: string) => {
    const match = flattenScope().find(({ node }) => node.name === facilityName);
    if (match) setScopeId(match.node.id);
    setFilters((p) => ({ ...p, room: '' }));
    setTab('location');
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      <PageHeader
        title="Asset Financials"
        subtitle="Organization-level financial intelligence over the IT asset portfolio — investment, book value, depreciation and EOL exposure."
        breadcrumb={[{ label: 'Asset Management', href: '/assets' }, { label: 'Financials' }]}
        actions={<ExportMenu assets={filtered} />}
      />

      <FinancialsFilterBar
        filters={filters}
        onChange={setFilters}
        rooms={roomOptions}
        onReset={() => setFilters(DEFAULT_FINANCIAL_FILTERS)}
      />

      <Tabs tabs={TAB_DEFS} value={tab} onChange={setTab} />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="glass-panel rounded-xl">
            <EmptyState icon="💰" title="No financial data available for this period." description="Nothing matches the current filters — try widening the facility, room or category selection." />
          </div>
        ) : (
          <>
            {tab === 'overview' && <OverviewTab kpis={kpis} filtered={filtered} onFacilityDrill={goToFacility} onRoomClick={(_facility, room) => { setFilters((p) => ({ ...p, room })); setTab('register'); }} />}
            {tab === 'trends' && <TrendsTab filtered={filtered} acquiredInPeriod={acquiredInPeriod} period={period} onCategoryClick={(c) => goToRegister({ category: c })} onFacilityClick={goToFacility} />}
            {tab === 'depreciation' && <DepreciationTab filtered={filtered} period={period} />}
            {tab === 'aging' && <AgingTab filtered={filtered} />}
            {tab === 'location' && <LocationTab filtered={filtered} onFacilityClick={goToFacility} onRoomClick={(_facility, room) => { setFilters((p) => ({ ...p, room })); setTab('register'); }} onCategoryClick={(c) => goToRegister({ category: c })} />}
            {tab === 'register' && <RegisterTab filtered={filtered} seed={registerSeed} onOpen={openDrawer} />}
          </>
        )}
      </div>

      <AssetFinancialDrawer asset={drawerAsset} onClose={() => setDrawerAsset(null)} />
    </div>
  );
}

// ── Export ───────────────────────────────────────────────────────────────────
function ExportMenu({ assets }: { assets: RegisteredAsset[] }) {
  const exportRegister = () =>
    downloadCsv(
      'asset-valuation-register.csv',
      assets.map((a) => {
        const fin = financialStateFor(a);
        return {
          Asset: a.name,
          AssetID: a.id,
          Category: a.category,
          Facility: facilityOf(a),
          AssetRoom: roomOf(a),
          PurchaseDate: a.purchaseDate,
          PurchaseValue: fin.state?.purchasePrice ?? a.purchasePrice,
          BookValue: fin.state?.bookValue ?? '',
          AccumulatedDepreciation: fin.state?.accumulated ?? '',
          DepreciationPct: fin.state ? Math.round((fin.state.accumulated / fin.state.purchasePrice) * 100) : '',
          AgeYears: fin.ageYears.toFixed(1),
          LifecycleStage: a.lifecycleStage,
          EstimatedEolDate: fin.estimatedEol ? fin.estimatedEol.toISOString().slice(0, 10) : '',
          FinancialStatus: fin.status,
        };
      }),
    );

  const exportSummary = () =>
    downloadCsv(
      'financial-summary.csv',
      aggregateBy(assets, facilityOf).map((f) => ({
        Facility: f.key,
        AssetCount: f.count,
        PurchaseValue: f.purchase,
        BookValue: f.book,
        Depreciation: f.depreciation,
        DepreciationPct: f.depreciationPct,
        EolAssets: f.eolCount,
      })),
    );

  return (
    <Dropdown
      ariaLabel="Export report"
      trigger={({ toggle }) => (
        <Button variant="outline" size="sm" onClick={toggle}>
          ⬇ Export Report
        </Button>
      )}
    >
      {({ close }) => (
        <>
          <MenuItem onClick={() => { exportRegister(); close(); }}>Export Asset Valuation (CSV)</MenuItem>
          <MenuItem onClick={() => { exportSummary(); close(); }}>Export Financial Summary (CSV)</MenuItem>
        </>
      )}
    </Dropdown>
  );
}

// ── Portfolio Overview ───────────────────────────────────────────────────────
function OverviewTab({
  kpis, filtered, onFacilityDrill, onRoomClick,
}: {
  kpis: PortfolioKpis;
  filtered: RegisteredAsset[];
  onFacilityDrill: (facility: string) => void;
  onRoomClick: (facility: string, room: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Asset Cost" value={formatMoney(kpis.purchase)} sub="Original acquisition cost" tone="slate" />
        <KpiCard label="Current Book Value" value={formatMoney(kpis.book)} sub="After depreciation" tone="primary" accent />
        <KpiCard label="Accumulated Depreciation" value={formatMoney(kpis.depreciation)} sub={`${kpis.depreciationPct}% of cost basis`} tone="slate" />
        <KpiCard label="Assets in Service" value={kpis.inService} sub={`of ${kpis.count} in scope`} tone="emerald" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Asset Count" value={kpis.count} tone="slate" />
        <KpiCard label="EOL Value" value={formatMoney(kpis.eolValue)} sub="Book value nearing/at EOL" tone={kpis.eolValue > 0 ? 'amber' : 'slate'} />
        <KpiCard label="Avg Asset Age" value={`${kpis.avgAge.toFixed(1)}y`} tone="slate" />
        <KpiCard label="This Period Acquisition" value={formatMoney(kpis.periodAcquisition)} sub="Selected date range" tone="slate" />
      </div>

      <WidgetFrame title="Asset Value by Location" subtitle="Organization → Facility → Asset Room" icon="📍">
        <LocationHierarchyTable assets={filtered} onFacilityClick={onFacilityDrill} onRoomClick={onRoomClick} />
      </WidgetFrame>
    </div>
  );
}
// ── Financial Trends ─────────────────────────────────────────────────────────
function TrendsTab({
  filtered, acquiredInPeriod, period, onCategoryClick, onFacilityClick,
}: {
  filtered: RegisteredAsset[];
  acquiredInPeriod: RegisteredAsset[];
  period: ReturnType<typeof periodBounds>;
  onCategoryClick: (c: AssetCategory) => void;
  onFacilityClick: (f: string) => void;
}) {
  const [metric, setMetric] = useState<TrendMetric>('bookValue');
  const labels = period.buckets.map((b) => b.label);
  const series = useMemo(() => financialSeries(filtered, period.buckets, metric), [filtered, period, metric]);

  const byCategory = useMemo(() => aggregateBy(acquiredInPeriod, (a) => a.category), [acquiredInPeriod]);
  const byFacility = useMemo(() => aggregateBy(acquiredInPeriod, facilityOf), [acquiredInPeriod]);
  const topMonthIdx = useMemo(() => {
    const acquisitionSeries = financialSeries(filtered, period.buckets, 'acquisition');
    let best = 0;
    acquisitionSeries.forEach((v, i) => { if (v > acquisitionSeries[best]) best = i; });
    return acquisitionSeries[best] > 0 ? best : -1;
  }, [filtered, period]);

  return (
    <div className="space-y-4">
      <WidgetFrame
        title="Financial Trend"
        subtitle={`${formatDate(period.from.toISOString())} – ${formatDate(period.to.toISOString())}`}
        icon="📈"
        loading={false}
      >
        <div className="mb-3 flex gap-1.5">
          {(Object.keys(TREND_METRIC_LABEL) as TrendMetric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                metric === m ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50',
              )}
            >
              {TREND_METRIC_LABEL[m]}
            </button>
          ))}
        </div>
        {labels.length === 0 ? (
          <WidgetEmpty icon="📈">No data in the selected date range.</WidgetEmpty>
        ) : (
          <MultiLine
            labels={labels}
            series={[{ label: TREND_METRIC_LABEL[metric], color: '#4f46e5', points: series, fill: true }]}
            format={metric === 'assetCount' ? (n) => String(n) : formatMoney}
          />
        )}
      </WidgetFrame>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Purchases (period)" value={formatMoney(acquiredInPeriod.reduce((s, a) => s + a.purchasePrice, 0))} tone="slate" />
        <KpiCard label="Assets Acquired" value={acquiredInPeriod.length} tone="slate" />
        <KpiCard label="Avg Acquisition Cost" value={formatMoney(acquiredInPeriod.length ? acquiredInPeriod.reduce((s, a) => s + a.purchasePrice, 0) / acquiredInPeriod.length : 0)} tone="slate" />
        <KpiCard label="Highest Acquisition Bucket" value={topMonthIdx >= 0 ? labels[topMonthIdx] : '—'} tone="slate" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WidgetFrame title="Acquisition Spend Over Time" icon="🛒">
          {labels.length === 0 ? (
            <WidgetEmpty icon="🛒">No data in the selected date range.</WidgetEmpty>
          ) : (
            <MultiLine
              labels={labels}
              series={[{ label: 'Acquisition', color: '#0ea5e9', points: financialSeries(filtered, period.buckets, 'acquisition') }]}
              format={formatMoney}
            />
          )}
        </WidgetFrame>

        <WidgetFrame title="Top Acquisition Categories" subtitle="Selected date range" icon="🏷️">
          {byCategory.length === 0 ? (
            <WidgetEmpty icon="🏷️">Nothing acquired in this period.</WidgetEmpty>
          ) : (
            <button type="button" className="w-full text-left" onClick={() => byCategory[0] && onCategoryClick(byCategory[0].key as AssetCategory)}>
              <HBars data={byCategory.map((c) => ({ label: c.key, value: c.purchase }))} format={formatMoney} barClassName="bg-indigo-500" />
            </button>
          )}
          {byCategory.length > 0 && <p className="mt-2 text-[11px] text-slate-400">Click a bar's category to filter the register (top category shown).</p>}
        </WidgetFrame>
      </div>

      {byFacility.length > 0 && (
        <WidgetFrame title="Acquisition by Facility" subtitle="Selected date range" icon="🏢">
          <HBars data={byFacility.map((f) => ({ label: f.key, value: f.purchase }))} format={formatMoney} barClassName="bg-sky-500" />
          <button type="button" onClick={() => onFacilityClick(byFacility[0].key)} className="mt-2 text-xs font-medium text-primary-600 hover:underline">
            View top facility in register →
          </button>
        </WidgetFrame>
      )}
    </div>
  );
}

// ── Depreciation Analysis ────────────────────────────────────────────────────
function DepreciationTab({ filtered, period }: { filtered: RegisteredAsset[]; period: ReturnType<typeof periodBounds> }) {
  const [mode, setMode] = useState<'amount' | 'percent'>('amount');

  const totals = useMemo(() => {
    let purchase = 0;
    let book = 0;
    let fully = 0;
    let near = 0;
    for (const a of filtered) {
      const fin = financialStateFor(a);
      purchase += fin.state?.purchasePrice ?? 0;
      book += fin.state?.bookValue ?? 0;
      if (fin.status === 'Fully Depreciated') fully += 1;
      if (fin.status === 'Near EOL') near += 1;
    }
    return { purchase, book, depreciation: purchase - book, fully, near };
  }, [filtered]);

  const periodDepreciation = useMemo(() => {
    const series = financialSeries(filtered, period.buckets, 'depreciation');
    if (series.length < 2) return series[0] ?? 0;
    return series[series.length - 1] - series[0];
  }, [filtered, period]);

  const byCategory = useMemo(() => aggregateBy(filtered, (a) => a.category), [filtered]);
  const byFacility = useMemo(() => aggregateBy(filtered, facilityOf), [filtered]);
  const trendSeries = useMemo(() => financialSeries(filtered, period.buckets, 'depreciation'), [filtered, period]);

  const barValue = (row: { book: number; purchase: number; depreciation: number; depreciationPct: number }) =>
    mode === 'amount' ? row.depreciation : row.depreciationPct;
  const barFormat = mode === 'amount' ? formatMoney : (n: number) => `${n}%`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Total Depreciated" value={formatMoney(totals.depreciation)} tone="slate" />
        <KpiCard label="Current Period Depreciation" value={formatMoney(Math.max(0, periodDepreciation))} tone="slate" />
        <KpiCard label="Depreciation %" value={`${totals.purchase > 0 ? Math.round((totals.depreciation / totals.purchase) * 100) : 0}%`} tone="slate" />
        <KpiCard label="Fully Depreciated" value={totals.fully} tone="slate" />
        <KpiCard label="Near EOL" value={totals.near} tone={totals.near > 0 ? 'amber' : 'slate'} />
      </div>

      <div className="flex justify-end">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(['amount', 'percent'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn('rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors', mode === m ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WidgetFrame title="Depreciation by Category" icon="🏷️">
          {byCategory.length === 0 ? <WidgetEmpty>No data.</WidgetEmpty> : (
            <HBars data={byCategory.map((c) => ({ label: c.key, value: barValue(c) }))} format={barFormat} barClassName="bg-violet-500" />
          )}
        </WidgetFrame>
        <WidgetFrame title="Depreciation by Facility" icon="🏢">
          {byFacility.length === 0 ? <WidgetEmpty>No data.</WidgetEmpty> : (
            <HBars data={byFacility.map((f) => ({ label: f.key, value: barValue(f) }))} format={barFormat} barClassName="bg-fuchsia-500" />
          )}
        </WidgetFrame>
      </div>

      <WidgetFrame title="Depreciation Trend" subtitle={`${formatDate(period.from.toISOString())} – ${formatDate(period.to.toISOString())}`} icon="📉">
        {period.buckets.length === 0 ? <WidgetEmpty>No data in the selected date range.</WidgetEmpty> : (
          <MultiLine labels={period.buckets.map((b) => b.label)} series={[{ label: 'Accumulated Depreciation', color: '#c026d3', points: trendSeries, fill: true }]} format={formatMoney} />
        )}
      </WidgetFrame>
    </div>
  );
}

// ── Asset Aging & EOL Exposure ───────────────────────────────────────────────
function AgingTab({ filtered }: { filtered: RegisteredAsset[] }) {
  const byBucket = useMemo(() => {
    const groups = aggregateBy(filtered, (a) => financialStateFor(a).ageBucket);
    return AGE_BUCKETS.map((b) => groups.find((g) => g.key === b) ?? { key: b, count: 0, purchase: 0, book: 0, depreciation: 0, depreciationPct: 0, avgAgeYears: 0, eolCount: 0 });
  }, [filtered]);

  const eol = useMemo(() => {
    const rows = filtered.filter((a) => {
      const fin = financialStateFor(a);
      return fin.status === 'EOL' || fin.status === 'Near EOL';
    });
    const book = rows.reduce((s, a) => s + (financialStateFor(a).state?.bookValue ?? 0), 0);
    const purchase = rows.reduce((s, a) => s + a.purchasePrice, 0);
    return { count: rows.length, book: Math.round(book), purchase: Math.round(purchase) };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <WidgetFrame title="Asset Aging Distribution" icon="📅">
        {byBucket.every((b) => b.count === 0) ? (
          <WidgetEmpty>No assets to age.</WidgetEmpty>
        ) : (
          <HBars data={byBucket.map((b) => ({ label: b.key, value: b.count }))} format={(n) => String(n)} barClassName="bg-cyan-500" />
        )}
      </WidgetFrame>

      <WidgetFrame title="Age Buckets" icon="📅">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className={TH}>Age</th>
                <th className={cn(TH, 'text-right')}>Asset Count</th>
                <th className={cn(TH, 'text-right')}>Purchase Value</th>
                <th className={cn(TH, 'text-right')}>Book Value</th>
                <th className={cn(TH, 'text-right')}>Depreciation %</th>
              </tr>
            </thead>
            <tbody>
              {byBucket.map((b) => (
                <tr key={b.key} className="border-b border-slate-100">
                  <td className={cn(TD, 'font-medium text-slate-800')}>{b.key} {b.key !== '7+' ? 'Years' : ''}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{b.count}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{formatMoney(b.purchase)}</td>
                  <td className={cn(TD, 'text-right tabular-nums font-semibold text-slate-900')}>{formatMoney(b.book)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{b.depreciationPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WidgetFrame>

      <WidgetFrame title="End-of-Life Exposure" subtitle="EOL within the last year of useful life" icon="⚠️">
        {eol.count === 0 ? (
          <WidgetEmpty icon="✅">No assets are near end-of-life.</WidgetEmpty>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <div className="text-2xl font-heading font-bold text-slate-900">{eol.count}</div>
              <div className="text-xs text-slate-500">EOL / Near-EOL assets</div>
            </div>
            <div>
              <div className="text-2xl font-heading font-bold text-slate-900">{formatMoney(eol.book)}</div>
              <div className="text-xs text-slate-500">Current book value</div>
            </div>
            <div>
              <div className="text-2xl font-heading font-bold text-slate-900">{formatMoney(eol.purchase)}</div>
              <div className="text-xs text-slate-500">
                Replacement exposure <span className="text-slate-400">(estimate — based on original purchase price; no replacement pricing is modeled)</span>
              </div>
            </div>
          </div>
        )}
      </WidgetFrame>
    </div>
  );
}

// ── Location / Facility Analysis ─────────────────────────────────────────────
function LocationTab({
  filtered, onFacilityClick, onRoomClick, onCategoryClick,
}: {
  filtered: RegisteredAsset[];
  onFacilityClick: (f: string) => void;
  onRoomClick: (facility: string, room: string) => void;
  onCategoryClick: (c: AssetCategory) => void;
}) {
  const byCategory = useMemo(() => aggregateBy(filtered, (a) => a.category), [filtered]);

  return (
    <div className="space-y-4">
      <WidgetFrame title="Facility & Asset Room Breakdown" icon="🏢">
        <LocationHierarchyTable assets={filtered} onFacilityClick={onFacilityClick} onRoomClick={onRoomClick} />
      </WidgetFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        <WidgetFrame title="Book Value by Category" icon="🏷️">
          {byCategory.length === 0 ? <WidgetEmpty>No data.</WidgetEmpty> : (
            <HBars data={byCategory.map((c, i) => ({ label: c.key, value: c.book, color: CAT_PALETTE[i % CAT_PALETTE.length] }))} format={formatMoney} />
          )}
        </WidgetFrame>

        <WidgetFrame title="Category Financial Table" icon="🏷️">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className={TH}>Category</th>
                  <th className={cn(TH, 'text-right')}>Count</th>
                  <th className={cn(TH, 'text-right')}>Book Value</th>
                  <th className={cn(TH, 'text-right')}>Avg Age</th>
                  <th className={cn(TH, 'text-right')}>EOL</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((c) => (
                  <tr key={c.key} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className={TD}>
                      <button type="button" onClick={() => onCategoryClick(c.key as AssetCategory)} className="font-medium text-slate-700 hover:text-primary-600">
                        {categoryEmoji(c.key as AssetCategory)} {c.key}
                      </button>
                    </td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{c.count}</td>
                    <td className={cn(TD, 'text-right tabular-nums font-semibold text-slate-900')}>{formatMoney(c.book)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{c.avgAgeYears}y</td>
                    <td className={cn(TD, 'text-right tabular-nums', c.eolCount > 0 && 'font-medium text-amber-600')}>{c.eolCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WidgetFrame>
      </div>
    </div>
  );
}

// ── Asset Valuation Register ─────────────────────────────────────────────────
type SortField = 'purchase' | 'book' | 'depreciation' | 'age' | 'eol';
const PAGE_SIZE = 20;

function RegisterTab({
  filtered, seed, onOpen,
}: {
  filtered: RegisteredAsset[];
  seed: RegisterSeed;
  onOpen: (a: RegisteredAsset) => void;
}) {
  const [q, setQ] = useState('');
  const [facility, setFacility] = useState(seed.facility ?? '');
  const [category, setCategory] = useState<AssetCategory | ''>(seed.category ?? '');
  const [lifecycle, setLifecycle] = useState<LifecycleStage | ''>('');
  const [age, setAge] = useState('');
  const [sort, setSort] = useState<{ field: SortField; dir: 'asc' | 'desc' }>({ field: 'book', dir: 'desc' });
  const [page, setPage] = useState(1);

  // A drill-down click elsewhere on the page re-seeds these once.
  const seedKey = `${seed.facility ?? ''}|${seed.category ?? ''}`;
  const [lastSeedKey, setLastSeedKey] = useState(seedKey);
  if (seedKey !== lastSeedKey) {
    setLastSeedKey(seedKey);
    if (seed.facility) setFacility(seed.facility);
    if (seed.category) setCategory(seed.category);
    setPage(1);
  }

  const facilities = useMemo(() => Array.from(new Set(filtered.map(facilityOf))).sort(), [filtered]);

  const rows = useMemo(() => {
    const rx = q.trim() ? new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    return filtered
      .filter((a) => !rx || rx.test(a.name) || rx.test(a.id) || rx.test(a.serialNumber))
      .filter((a) => !facility || facilityOf(a) === facility)
      .filter((a) => !category || a.category === category)
      .filter((a) => !lifecycle || a.lifecycleStage === lifecycle)
      .filter((a) => !age || financialStateFor(a).ageBucket === age)
      .map((a) => ({ asset: a, fin: financialStateFor(a) }))
      .sort((x, y) => {
        const dir = sort.dir === 'asc' ? 1 : -1;
        switch (sort.field) {
          case 'purchase': return dir * (x.asset.purchasePrice - y.asset.purchasePrice);
          case 'book': return dir * ((x.fin.state?.bookValue ?? 0) - (y.fin.state?.bookValue ?? 0));
          case 'depreciation': return dir * ((x.fin.state?.accumulated ?? 0) - (y.fin.state?.accumulated ?? 0));
          case 'age': return dir * (x.fin.ageYears - y.fin.ageYears);
          case 'eol': return dir * ((x.fin.estimatedEol?.getTime() ?? 0) - (y.fin.estimatedEol?.getTime() ?? 0));
        }
      });
  }, [filtered, q, facility, category, lifecycle, age, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (field: SortField) =>
    setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' }));

  const statusTone = (s: FinancialStatusLabel): 'red' | 'amber' | 'slate' | 'emerald' =>
    s === 'Retired' || s === 'Disposed' ? 'red' : s === 'EOL' || s === 'Near EOL' ? 'amber' : s === 'Fully Depreciated' ? 'slate' : 'emerald';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search by name, id or serial…"
          className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
        <RegisterSelect label="Facility" value={facility} onChange={(v) => { setFacility(v); setPage(1); }} options={facilities} />
        <RegisterSelect label="Category" value={category} onChange={(v) => { setCategory(v as AssetCategory | ''); setPage(1); }} options={ASSET_CATEGORIES} />
        <RegisterSelect label="Lifecycle" value={lifecycle} onChange={(v) => { setLifecycle(v as LifecycleStage | ''); setPage(1); }} options={LIFECYCLE_STAGES} />
        <RegisterSelect label="Age" value={age} onChange={(v) => { setAge(v); setPage(1); }} options={AGE_BUCKETS} />
        <span className="ml-auto text-xs text-slate-400">{rows.length} of {filtered.length} assets</span>
      </div>

      {rows.length === 0 ? (
        <div className="glass-panel rounded-xl">
          <EmptyState title="No matching assets" description="Try a different search or clear the filters." variant="no-results" />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Asset</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Facility</th>
                  <th className="px-4 py-2.5">Room</th>
                  <th className="px-4 py-2.5">Purchase Date</th>
                  <SortableTh label="Purchase Value" field="purchase" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Book Value" field="book" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Depreciation" field="depreciation" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Age" field="age" sort={sort} onSort={toggleSort} />
                  <th className="px-4 py-2.5">Lifecycle</th>
                  <SortableTh label="EOL Date" field="eol" sort={sort} onSort={toggleSort} />
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ asset: a, fin }) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <Link to={`/assets/${a.id}`} className="font-medium text-slate-900 hover:text-primary-600">{a.name}</Link>
                      <div className="text-xs text-slate-400">{a.id}</div>
                    </td>
                    <td className="px-4 py-3"><Badge tone="slate">{a.category}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{facilityOf(a)}</td>
                    <td className="px-4 py-3 text-slate-500">{roomOf(a)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(a.purchaseDate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatMoney(a.purchasePrice)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">{fin.state ? formatMoney(fin.state.bookValue) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{fin.state ? formatMoney(fin.state.accumulated) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{fin.ageYears.toFixed(1)}y</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{a.lifecycleStage}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fin.estimatedEol ? formatDate(fin.estimatedEol.toISOString()) : '—'}</td>
                    <td className="px-4 py-3"><Badge tone={statusTone(fin.status)}>{fin.status}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => onOpen(a)} title="Financial details" className="text-base hover:opacity-70">💰</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-1.5">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded px-2 py-1 font-medium disabled:opacity-30 hover:bg-slate-100">← Prev</button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded px-2 py-1 font-medium disabled:opacity-30 hover:bg-slate-100">Next →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SortableTh({
  label, field, sort, onSort,
}: {
  label: string;
  field: SortField;
  sort: { field: SortField; dir: 'asc' | 'desc' };
  onSort: (f: SortField) => void;
}) {
  return (
    <th className="px-4 py-2.5 text-right">
      <button type="button" onClick={() => onSort(field)} className="font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700">
        {label}{sort.field === field ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );
}

function RegisterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
    >
      <option value="">All {label}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
