// ─────────────────────────────────────────────────────────────────────────────
// Asset Tracking ▸ Live Tracking
//
// The module home, and the answer to one question: **where is it right now?**
// Two views of the same set of assets — a floor-plan for "show me", a table for
// "list them" — and one drawer that opens from either.
//
// This landing page used to be a Dashboard that summarised four other screens.
// It was a lobby: every tile linked somewhere else, so the first click never did
// any work. Now the landing page *is* the work, and the numbers across the top
// filter the list in place instead of navigating away.
//
// Precision is the only location language here. The radio behind a fix is never
// named: an operator acts on "Room-level, 88% confident", never on which
// technology produced it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { FacilityMap, MapLegend } from '@/components/tracking/FacilityMap';
import {
  Drawer, Field, LiveStamp, ScopePicker, Tabs, TimelineRail, useFacilityScope, useTabs,
  type TabDef,
} from '@/components/tracking/shell';
import {
  BatteryPill, Chip, ChipFilter, FilterSelect, Meter, Panel, PrecisionChip, PresencePill,
  StatTile, TONE_HEX, TableShell, presenceTone, scoreTone, td, th, type Tone,
} from '@/components/tracking/bits';
import {
  CRIT_FILTERS, CUSTODY_FILTERS, FacilitySwitch, STATE_FILTERS, STATE_RANK,
  categoryEmoji, isMisplaced, matchesState, slugFor, stopItem, type StateFilter,
} from '@/lib/tracking-ui';
import {
  TRACKED_FACILITIES, alertById, facilityBySlug, journeyForAsset, presenceById,
  presenceForFacility, trackedZones, trackingKpis, zoneById, zonesForFacility,
} from '@/lib/tracking-data';
import { cn, formatMoney, relTime } from '@/lib/utils';
import type { PresenceState } from '@access-genie/shared';
import { downloadCsv } from '@/api/configuration';
import { useMutate } from '@/api/mutate';
import { movementsApi } from '@/api/tracking-ops';
import { alertsApi } from '@/api/alerts';
import { useSession } from '@/components/providers/SessionProvider';

const TAB_KEYS = ['map', 'list'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const PAGE_SIZE = 15;

type SortKey = 'name' | 'state' | 'zone' | 'custodian' | 'lastSeen' | 'battery';
interface Sort { key: SortKey; dir: 'asc' | 'desc' }

function SortHead({ k, label, sort, onSort }: { k: SortKey; label: string; sort: Sort; onSort: (k: SortKey) => void }) {
  return (
    <th
      className={cn(th, 'cursor-pointer hover:text-slate-800')}
      onClick={() => onSort(k)}
      aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sort.key === k && <span className="text-primary-500">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  );
}

const BULK_BTN = 'rounded-md px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100';


export default function LiveTrackingPage() {
  const { toast } = useToast();
  const { run, isPending } = useMutate();
  const { session } = useSession();
  const [scope, setScope] = useFacilityScope();
  const [tab, setTab] = useTabs<TabKey>(TAB_KEYS, 'map');

  // Reporting an asset missing rewrites its row here and now — the operator
  // should see the estate change, not just read a toast about it.
  const [reported, setReported] = useState<Set<string>>(new Set());

  // ── Selection shared by the map, the list and the drawer ───────────────────
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mapSlug, setMapSlug] = useState(TRACKED_FACILITIES[0].slug);
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  // ── Map view filters ───────────────────────────────────────────────────────
  const [mapQuery, setMapQuery] = useState('');
  const [mapState, setMapState] = useState<PresenceState | 'all'>('all');
  const [mapCustody, setMapCustody] = useState<string>('All');
  const [mapMisplaced, setMapMisplaced] = useState(false);

  // ── List view ──────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('All');
  const [custodyFilter, setCustodyFilter] = useState<string>('All');
  const [critFilter, setCritFilter] = useState<string>('All');
  const [misplacedOnly, setMisplacedOnly] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const facilityName = scope === 'all' ? null : facilityBySlug(scope)?.name ?? null;

  const scoped = useMemo(() => {
    const base = presenceForFacility(scope);
    if (reported.size === 0) return base;
    return base.map((p) =>
      reported.has(p.assetId) && p.state !== 'Missing'
        ? { ...p, state: 'Missing' as PresenceState, custody: 'Unaccounted' as const }
        : p,
    );
  }, [scope, reported]);

  const kpis = useMemo(() => trackingKpis(scope), [scope]);
  const live = useMemo(() => ({
    online: scoped.filter((p) => p.state === 'Online').length,
    notSeen: scoped.filter((p) => p.state === 'Offline' || p.state === 'Stale').length,
    missing: scoped.filter((p) => p.state === 'Missing').length,
    checkedOut: scoped.filter((p) => p.custody === 'Checked Out').length,
    misplaced: scoped.filter(isMisplaced).length,
  }), [scoped]);

  // A plan needs a building. With the estate in scope we show one and say so.
  const mapFacility = useMemo(
    () => (facilityName ? facilityBySlug(slugFor(facilityName)) : facilityBySlug(mapSlug)) ?? TRACKED_FACILITIES[0],
    [facilityName, mapSlug],
  );
  const mapZones = useMemo(() => zonesForFacility(mapFacility.name), [mapFacility.name]);
  const onPlan = useMemo(
    () => scoped.filter((p) => p.facility === mapFacility.name && p.position),
    [scoped, mapFacility.name],
  );

  // ── Deep links — the alert queue, Asset 360 and the retired routes land here.
  // The query string can only be read after mount without breaking hydration,
  // so this one effect seeds state from the link exactly once.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get('state');
    if (s === 'Online' || s === 'Missing' || s === 'In Transit') { setStateFilter(s); setTab('list'); }
    else if (s === 'Offline' || s === 'Stale') { setStateFilter('Not seen'); setTab('list'); }
    const z = p.get('zone');
    if (z) {
      const zone = zoneById(z);
      if (zone) setMapSlug(slugFor(zone.facility));
    }
    const a = p.get('asset');
    if (a) {
      const hit = presenceById(a);
      if (hit) { setMapSlug(slugFor(hit.facility)); setSelectedAsset(a); }
    }
  }, [setTab]);

  // Narrowing the list puts you back at the top of it, as in the Registry.
  useEffect(() => { setPage(0); }, [query, stateFilter, custodyFilter, critFilter, misplacedOnly, scope]);

  // ── Actions ────────────────────────────────────────────────────────────────

  /**
   * Report an asset missing.
   *
   * Raises a critical alert per asset — that is the queue security actually
   * works, and it is what "opened a recovery search" has to mean if it is to
   * mean anything. The last known position goes in the alert's source so
   * whoever picks it up starts where the asset was last seen.
   */
  const reportMissing = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;

      const rows = scoped.filter((p) => ids.includes(p.assetId));
      const results = await Promise.all(
        rows.map((p) =>
          run(
            alertsApi.create({
              title: `Recovery — ${p.assetName} reported missing`,
              severity: 'Critical',
              type: 'Security',
              assetId: p.assetId,
              source: `Last seen ${p.zone} · ${p.custodian ?? 'no custodian'} · ${relTime(p.lastSeen)}`,
            }),
            { describe: 'open that recovery search' },
          ),
        ),
      );

      const opened = results.filter(Boolean).length;
      if (opened === 0) return;

      setReported((prev) => { const n = new Set(prev); ids.forEach((i) => n.add(i)); return n; });
      toast({
        title: opened === 1 ? 'Recovery search opened' : `${opened} recovery searches opened`,
        description: 'Critical alerts raised with the last known position, custodian and time of loss.',
        tone: 'error',
      });
    },
    [toast, run, scoped],
  );

  /** Every map filter has to come off, or "locate" can land on a plan that is
   *  filtering out the very asset it was asked to point at. */
  const locateOnMap = useCallback((assetId: string) => {
    const hit = presenceById(assetId);
    if (hit) setMapSlug(slugFor(hit.facility));
    setMapState('all');
    setMapQuery('');
    setMapCustody('All');
    setMapMisplaced(false);
    setSelectedAsset(assetId);
    setTab('map');
  }, [setTab]);

  // ── Map data ───────────────────────────────────────────────────────────────

  const mapCounts = useMemo(() => {
    const c: Record<PresenceState | 'all', number> = {
      all: onPlan.length, Online: 0, Stale: 0, Offline: 0, 'In Transit': 0, Missing: 0,
    };
    onPlan.forEach((p) => { c[p.state] += 1; });
    return c;
  }, [onPlan]);

  const mapRows = useMemo(() => {
    const q = mapQuery.trim().toLowerCase();
    return onPlan.filter((p) => {
      if (mapState !== 'all' && p.state !== mapState) return false;
      if (mapCustody !== 'All' && p.custody !== mapCustody) return false;
      if (mapMisplaced && !isMisplaced(p)) return false;
      if (q && !`${p.assetName} ${p.assetId} ${p.zone} ${p.custodian}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.assetName.localeCompare(b.assetName));
  }, [onPlan, mapQuery, mapState, mapCustody, mapMisplaced]);

  const selectFromMap = (id: string | null) => {
    setSelectedAsset(id);
    if (id) rowRefs.current[id]?.scrollIntoView({ block: 'nearest' });
  };

  // ── List data ──────────────────────────────────────────────────────────────

  /**
   * Download what is on screen.
   *
   * This used to say "queued" and put nothing anywhere. The rows the user has
   * filtered to only exist in the browser, so the file is built here rather
   * than asked for from the server with the filter state re-sent.
   */
  const exportRows = (name: string, rows: Record<string, unknown>[]) => {
    const n = downloadCsv(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast({
      title: n > 0 ? `${n} row${n === 1 ? '' : 's'} exported` : 'Nothing to export',
      description: n > 0 ? 'Downloaded as CSV.' : 'Nothing matches the current filters.',
      tone: n > 0 ? 'success' : 'info',
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = scoped.filter((p) => {
      if (!matchesState(p, stateFilter)) return false;
      if (custodyFilter !== 'All' && p.custody !== custodyFilter) return false;
      if (critFilter !== 'All' && p.criticality !== critFilter) return false;
      if (misplacedOnly && !isMisplaced(p)) return false;
      if (q && !`${p.assetName} ${p.assetId} ${p.zone} ${p.custodian} ${p.facility}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      if (sort.key === 'state') return (STATE_RANK[a.state] - STATE_RANK[b.state]) * dir;
      if (sort.key === 'lastSeen') return (Date.parse(a.lastSeen) - Date.parse(b.lastSeen)) * dir;
      if (sort.key === 'battery') return ((a.batteryPct ?? 999) - (b.batteryPct ?? 999)) * dir;
      const av = sort.key === 'zone' ? a.zone : sort.key === 'custodian' ? a.custodian : a.assetName;
      const bv = sort.key === 'zone' ? b.zone : sort.key === 'custodian' ? b.custodian : b.assetName;
      return av.localeCompare(bv) * dir;
    });
  }, [scoped, query, stateFilter, custodyFilter, critFilter, misplacedOnly, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Reporting assets missing can shrink the list under your feet, so the page
  // is clamped rather than trusted — no "showing 46–45 of 44".
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.assetId));
  const toggleSort = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' }));
  const toggleRow = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const resetList = () => {
    setQuery(''); setStateFilter('All'); setCustodyFilter('All'); setCritFilter('All'); setMisplacedOnly(false);
  };

  // ── Drawer subject ─────────────────────────────────────────────────────────

  const asset = useMemo(
    () => (selectedAsset ? scoped.find((p) => p.assetId === selectedAsset) ?? presenceById(selectedAsset) ?? null : null),
    [selectedAsset, scoped],
  );
  const assetJourney = asset ? journeyForAsset(asset.assetId) : undefined;
  const homeZone = asset
    ? trackedZones.find((z) => z.facility === asset.facility && z.name === asset.homeZone)
    : undefined;

  const TABS: TabDef<TabKey>[] = [
    { key: 'map', label: 'Map', count: mapRows.length },
    { key: 'list', label: 'List', count: filtered.length },
  ];

  const facilitySwitch = scope === 'all' ? <FacilitySwitch value={mapSlug} onChange={setMapSlug} /> : undefined;

  /** The six numbers this screen exists to answer — each one a filter. */
  const tiles: { label: string; value: number; tone: Tone; sub: string; on: boolean; apply: () => void }[] = [
    { label: 'Tracked', value: kpis.tracked, tone: 'slate', sub: facilityName ?? 'across the estate',
      on: stateFilter === 'All' && custodyFilter === 'All' && !misplacedOnly, apply: () => {} },
    { label: 'Online', value: live.online, tone: 'emerald', sub: 'seen within their window',
      on: stateFilter === 'Online', apply: () => setStateFilter('Online') },
    { label: 'Not seen', value: live.notSeen, tone: live.notSeen > 12 ? 'amber' : 'slate', sub: 'no recent detection',
      on: stateFilter === 'Not seen', apply: () => setStateFilter('Not seen') },
    { label: 'Missing', value: live.missing, tone: live.missing ? 'red' : 'emerald', sub: live.missing ? 'recovery open' : 'all accounted for',
      on: stateFilter === 'Missing', apply: () => setStateFilter('Missing') },
    { label: 'Checked out', value: live.checkedOut, tone: 'primary', sub: 'held by a person',
      on: custodyFilter === 'Checked Out', apply: () => setCustodyFilter('Checked Out') },
    { label: 'Misplaced', value: live.misplaced, tone: live.misplaced ? 'amber' : 'emerald', sub: 'outside their home zone',
      on: misplacedOnly, apply: () => setMisplacedOnly(true) },
  ];

  return (
    <div className="space-y-5 pb-4">
      <PageHeader
        title="Live Tracking"
        subtitle="Where every tracked asset is right now, who is holding it, and whether it belongs there."
        breadcrumb={[{ label: 'Asset Tracking' }, { label: 'Live Tracking' }]}
        actions={
          <>
            <LiveStamp />
            <ScopePicker value={scope} onChange={setScope} />
            <Link to={`/tracking/twin/${mapFacility.slug}`}>
              <Button variant="outline">🏢 Digital twin</Button>
            </Link>
            <Button
              variant="outline"
              onClick={() =>
                exportRows(
                  'asset-positions',
                  filtered.map((a) => ({
                    'Asset ID': a.assetId,
                    Name: a.assetName,
                    Zone: a.zone,
                    State: a.state,
                    Precision: a.precision,
                    Confidence: a.confidence,
                    Custody: a.custody,
                    Custodian: a.custodian ?? '',
                    'Last seen': a.lastSeen,
                  })),
                )
              }
            >
              ⤓ Export
            </Button>
          </>
        }
      />

      {/* ── KPI strip — every tile is a filter, applied to the list in place ─── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <StatTile
            key={t.label} label={t.label} value={t.value} tone={t.tone} sub={t.sub}
            active={tab === 'list' && t.on} onClick={() => { resetList(); t.apply(); setTab('list'); }}
          />
        ))}
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {/* ═══ MAP ════════════════════════════════════════════════════════════ */}
      {tab === 'map' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Panel title="Narrow it down" subtitle={`${mapRows.length} of ${onPlan.length} on this plan`} className="lg:col-span-3">
            <input
              value={mapQuery} onChange={(e) => setMapQuery(e.target.value)}
              placeholder="Name, id, zone or custodian…" aria-label="Search assets on this floor-plan"
              className="w-full rounded-md bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Presence</div>
            <ChipFilter
              className="mt-2" value={mapState} onChange={setMapState}
              options={[
                { key: 'all', label: 'All', count: mapCounts.all },
                { key: 'Online', label: 'Online', count: mapCounts.Online, tone: 'emerald' },
                { key: 'Stale', label: 'Not seen recently', count: mapCounts.Stale, tone: 'amber' },
                { key: 'Offline', label: 'No signal', count: mapCounts.Offline, tone: 'slate' },
                { key: 'In Transit', label: 'In transit', count: mapCounts['In Transit'], tone: 'primary' },
                { key: 'Missing', label: 'Missing', count: mapCounts.Missing, tone: 'red' },
              ]}
            />
            <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Custody</div>
            <div className="mt-2">
              <FilterSelect value={mapCustody} onChange={setMapCustody} options={CUSTODY_FILTERS} label="Any custody" />
            </div>
            <button
              type="button" onClick={() => setMapMisplaced((v) => !v)} aria-pressed={mapMisplaced}
              className={cn('mt-4 w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors',
                mapMisplaced ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
            >
              📍 Only misplaced assets
            </button>
            <button
              type="button"
              onClick={() => { setMapQuery(''); setMapState('all'); setMapCustody('All'); setMapMisplaced(false); }}
              className="mt-2 w-full rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
            >
              Reset filters
            </button>
          </Panel>

          <Panel
            title={`${mapFacility.name} — live floor`}
            subtitle={scope === 'all'
              ? `Showing ${mapFacility.short} — a plan needs one building, so pick the one you are working`
              : `${mapZones.length} zones · ${mapFacility.coverage}% coverage · ${mapRows.length} signals shown`}
            className="lg:col-span-6"
            actions={facilitySwitch}
          >
            <FacilityMap
              zones={mapZones} markers={mapRows} mode="presence"
              selectedId={selectedAsset} onSelect={selectFromMap}
              hoveredId={hovered} onHover={setHovered}
              ariaLabel={`${mapFacility.name} live asset positions`}
            />
            <div className="mt-3"><MapLegend mode="presence" /></div>
          </Panel>

          <Panel title="Results" subtitle="Hover to light the marker · click for the record" className="lg:col-span-3" padded={false}>
            {mapRows.length === 0 ? (
              <EmptyState variant="no-results" title="Nothing matches" description="No asset on this plan fits the current filters." />
            ) : (
              <ul className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
                {mapRows.map((p) => (
                  <li key={p.assetId} ref={(el) => { rowRefs.current[p.assetId] = el; }}>
                    <button
                      type="button"
                      onMouseEnter={() => setHovered(p.assetId)} onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(p.assetId)} onBlur={() => setHovered(null)}
                      onClick={() => setSelectedAsset(p.assetId)}
                      className={cn('flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-50',
                        (hovered === p.assetId || selectedAsset === p.assetId) && 'bg-primary-50/60')}
                    >
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TONE_HEX[presenceTone[p.state]] }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-slate-800">{p.assetName}</span>
                        <span className="block truncate text-[11px] text-slate-500">{p.zone} · {p.custodian}</span>
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{relTime(p.lastSeen)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {/* ═══ LIST ═══════════════════════════════════════════════════════════ */}
      {tab === 'list' && (
        <div className="glass-panel flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
            <input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, id, zone, custodian…" aria-label="Search tracked assets"
              className="w-64 max-w-full rounded-md bg-slate-100 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
            <FilterSelect value={stateFilter} onChange={(v) => setStateFilter(v as StateFilter)} options={STATE_FILTERS} label="Any state" />
            <FilterSelect value={custodyFilter} onChange={setCustodyFilter} options={CUSTODY_FILTERS} label="Any custody" />
            <FilterSelect value={critFilter} onChange={setCritFilter} options={CRIT_FILTERS} label="Any criticality" />
            <button
              type="button" onClick={() => setMisplacedOnly((v) => !v)} aria-pressed={misplacedOnly}
              className={cn('rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                misplacedOnly ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}
            >
              📍 Misplaced only
            </button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs tabular-nums text-slate-400">{filtered.length} of {scoped.length}</span>
              <button onClick={resetList} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50">
                Clear
              </button>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-primary-100 bg-primary-50 px-4 py-2 text-sm">
              <span className="font-medium text-primary-700">{selected.size} selected</span>
              {selected.size < filtered.length && (
                <button
                  onClick={() => setSelected(new Set(filtered.map((p) => p.assetId)))}
                  className="rounded-md border border-primary-200 bg-white px-2.5 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-50"
                >
                  Select all {filtered.length} matching
                </button>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => { const first = Array.from(selected)[0]; if (first) locateOnMap(first); }} className={BULK_BTN}>
                  Locate on map
                </button>
                {/*
                  The bar used to offer "Assign custodian", "Start transfer" and
                  "Export" as three toasts. Assigning and transferring are real
                  flows that live on the asset registry and Operations, and a
                  second copy here would have been a second way to do them that
                  could disagree. Export is the one that belongs on this screen —
                  it exports what this screen is showing — so it is the one that
                  stayed, and it writes a file.
                */}
                {[{ label: 'Export selection' }].map((a) => (
                  <button
                    key={a.label} className={BULK_BTN}
                    onClick={() =>
                      exportRows(
                        'selected-positions',
                        filtered
                          .filter((p) => selected.has(p.assetId))
                          .map((p) => ({
                            'Asset ID': p.assetId,
                            Name: p.assetName,
                            Zone: p.zone,
                            State: p.state,
                            Precision: p.precision,
                            Confidence: p.confidence,
                            Custody: p.custody,
                            Custodian: p.custodian ?? '',
                            'Last seen': p.lastSeen,
                          })),
                      )
                    }
                  >
                    {a.label}
                  </button>
                ))}
                <button
                  onClick={() => { void reportMissing(Array.from(selected)); setSelected(new Set()); }}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-health-critical hover:bg-red-100"
                >
                  Report missing
                </button>
              </div>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-800">Clear</button>
            </div>
          )}

          <TableShell>
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox" checked={allOnPage} aria-label="Select all on this page" className="accent-primary-600"
                    onChange={() => setSelected((prev) => {
                      const n = new Set(prev);
                      pageRows.forEach((r) => (allOnPage ? n.delete(r.assetId) : n.add(r.assetId)));
                      return n;
                    })}
                  />
                </th>
                <SortHead k="name" label="Asset" sort={sort} onSort={toggleSort} />
                <SortHead k="state" label="Presence" sort={sort} onSort={toggleSort} />
                <th className={th}>Precision</th>
                <SortHead k="zone" label="Zone" sort={sort} onSort={toggleSort} />
                <SortHead k="custodian" label="Custodian" sort={sort} onSort={toggleSort} />
                <th className={th}>Custody</th>
                <SortHead k="lastSeen" label="Last seen" sort={sort} onSort={toggleSort} />
                <SortHead k="battery" label="Battery" sort={sort} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((p) => (
                <tr
                  key={p.assetId} onClick={() => setSelectedAsset(p.assetId)}
                  className={cn('cursor-pointer transition-colors hover:bg-slate-50', selected.has(p.assetId) && 'bg-primary-50/40')}
                >
                  <td className={td} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox" checked={selected.has(p.assetId)} onChange={() => toggleRow(p.assetId)}
                      aria-label={`Select ${p.assetName}`} className="accent-primary-600"
                    />
                  </td>
                  <td className={td}>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-base" aria-hidden>
                        {categoryEmoji(p.category)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-slate-900">{p.assetName}</span>
                          {reported.has(p.assetId) && <Chip tone="red">Reported</Chip>}
                          {isMisplaced(p) && <Chip tone="amber">Misplaced</Chip>}
                        </div>
                        <div className="text-xs text-slate-400">{p.assetId} · {p.category}</div>
                      </div>
                    </div>
                  </td>
                  <td className={td}><PresencePill state={p.state} /></td>
                  <td className={td}><PrecisionChip precision={p.precision} confidence={p.confidence} /></td>
                  <td className={cn(td, 'text-slate-600')}>
                    <div className="truncate">{p.zone}</div>
                    {scope === 'all' && <div className="truncate text-xs text-slate-400">{p.facility}</div>}
                  </td>
                  <td className={cn(td, 'text-slate-600')}>{p.custodian}</td>
                  <td className={td}>
                    <Chip tone={p.custody === 'Unaccounted' ? 'red' : p.custody === 'In Place' ? 'emerald' : 'primary'}>{p.custody}</Chip>
                  </td>
                  <td className={cn(td, 'whitespace-nowrap text-xs tabular-nums text-slate-500')}>{relTime(p.lastSeen)}</td>
                  <td className={td}><BatteryPill pct={p.batteryPct} /></td>
                </tr>
              ))}
            </tbody>
          </TableShell>

          {pageRows.length === 0 && (
            <EmptyState
              variant="no-results" title="No assets match these filters"
              description="Widen the state or custody filter, or clear the search."
              action={<Button variant="outline" onClick={resetList}>Clear filters</Button>}
            />
          )}

          {filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-sm text-slate-500">
              <span className="tabular-nums">
                Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="rounded-md border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-40">← Prev</button>
                <span className="px-2 text-xs tabular-nums">Page {safePage + 1} of {pageCount}</span>
                <button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className="rounded-md border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-40">Next →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Asset drawer — shared by the map and the list ──────────────────── */}
      <Drawer
        open={!!asset} onClose={() => setSelectedAsset(null)} title={asset?.assetName ?? ''}
        subtitle={asset ? `${asset.assetId} · ${asset.category} · ${formatMoney(asset.valueInr)}` : undefined}
        eyebrow={asset && (
          <>
            <PresencePill state={asset.state} />
            <PrecisionChip precision={asset.precision} confidence={asset.confidence} />
            <Chip tone={asset.criticality === 'Critical' ? 'red' : asset.criticality === 'High' ? 'amber' : 'slate'}>{asset.criticality}</Chip>
            {asset.movingNow && <Chip tone="primary" dot>Moving now</Chip>}
          </>
        )}
        footer={asset && (
          <>
            <Link to={`/assets/${asset.assetId}`}>
              <Button size="sm" variant="outline">Open asset profile</Button>
            </Link>
            {assetJourney && (
              <Link to={`/tracking/journey?asset=${asset.assetId}`}>
                <Button size="sm" variant="outline">Replay journey</Button>
              </Link>
            )}
            {/*
              Real custody: this books the asset out through the movements
              ledger, which is what the check-in/out screen and the asset's own
              custody history both read. "Request sent" was neither sent nor
              recorded.
            */}
            <Button
              size="sm"
              variant="outline"
              disabled={isPending || asset.custody === 'Checked Out'}
              title={asset.custody === 'Checked Out' ? `Already held by ${asset.custodian ?? 'someone'}` : undefined}
              onClick={() =>
                void run(
                  movementsApi.create({
                    assetId: asset.assetId,
                    assetName: asset.assetName,
                    direction: 'Out',
                    person: session.user.name,
                    purpose: 'Taken from the live tracking map',
                    location: asset.zone,
                  }),
                  {
                    success: 'Checked out to you',
                    successDetail: `${asset.assetName} — recorded in the custody ledger.`,
                    describe: 'take custody of that asset',
                    refreshTracking: true,
                  },
                )
              }
            >
              Take custody
            </Button>
            <Button
              size="sm" variant="danger" className="ml-auto"
              disabled={reported.has(asset.assetId) || asset.state === 'Missing'}
              onClick={() => void reportMissing([asset.assetId])}
            >
              {reported.has(asset.assetId) || asset.state === 'Missing' ? 'Recovery open' : 'Report missing'}
            </Button>
          </>
        )}
      >
        {asset && (
          <div className="space-y-5">
            {asset.zone !== asset.homeZone && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <div className="text-sm font-semibold text-amber-800">
                  {asset.custody === 'Unaccounted' ? 'Last seen away from its home zone' : 'Not where it belongs'}
                </div>
                <p className="mt-0.5 text-xs text-amber-700">
                  {asset.custody === 'Unaccounted' ? 'Last detected in ' : 'Detected in '}{asset.zone}, home zone is {asset.homeZone}
                  {asset.custody === 'Checked Out' ? ' — but it is checked out, so this may be legitimate.'
                    : asset.custody === 'Unaccounted' ? ' — that is where the trail went cold, so start the search there.'
                      : '. Return it or update the home zone.'}
                </p>
                {homeZone && (
                  <Link
                    to={`/tracking/geofences?zone=${homeZone.id}`}
                    className="mt-1.5 inline-block text-xs font-semibold text-amber-900 underline underline-offset-2"
                  >
                    Open {homeZone.name} →
                  </Link>
                )}
              </div>
            )}

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Live position</div>
              <dl className="mt-1 divide-y divide-slate-100">
                <Field label="Facility">{asset.facility}</Field>
                <Field label="Zone">{asset.zone}</Field>
                <Field label="Home zone">{asset.homeZone}</Field>
                <Field label="Confidence">
                  <span className="inline-flex items-center gap-2">
                    <Meter value={asset.confidence} tone={scoreTone(asset.confidence, 85, 60)} className="w-20" />
                    <span className="tabular-nums">{asset.confidence}%</span>
                  </span>
                </Field>
                <Field label="Last seen">{relTime(asset.lastSeen)}</Field>
              </dl>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Custody & condition</div>
              <dl className="mt-1 divide-y divide-slate-100">
                <Field label="Custody">
                  <Chip tone={asset.custody === 'Unaccounted' ? 'red' : asset.custody === 'In Place' ? 'emerald' : 'primary'}>{asset.custody}</Chip>
                </Field>
                <Field label="Held by">{asset.custodian}</Field>
                <Field label="Tag battery"><BatteryPill pct={asset.batteryPct} /></Field>
              </dl>
            </div>

            {asset.alertIds.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Open alerts</div>
                <ul className="mt-2 space-y-2">
                  {asset.alertIds.map((id) => {
                    const a = alertById(id);
                    return (
                      <li key={id}>
                        <Link to={`/tracking/alerts?tab=queue&alert=${id}`} className="block rounded-lg border border-slate-200 px-3 py-2 transition-colors hover:bg-slate-50">
                          <div className="text-sm font-medium text-slate-800">{a?.title ?? id}</div>
                          <div className="mt-0.5 text-xs text-slate-500">{a ? `${a.priority} · ${a.state} · ${a.team}` : 'Open alert'}</div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {assetJourney && (
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recent journey</div>
                  <span className="text-[11px] tabular-nums text-slate-400">{assetJourney.distanceM} m · {assetJourney.zonesVisited} zones</span>
                </div>
                <div className="mt-3"><TimelineRail items={assetJourney.stops.map(stopItem)} /></div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
