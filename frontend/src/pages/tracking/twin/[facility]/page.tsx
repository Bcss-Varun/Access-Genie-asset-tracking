// ─────────────────────────────────────────────────────────────────────────────
// DIGITAL TWIN — one building, seen whole.
//
// Deliberately NOT a sidebar module. You launch this from the Dashboard when
// you want to *look at the building* rather than work a list, so the screen is
// mostly plan: one large floor, one layer at a time, and a legend that always
// says what the fills currently mean.
//
//   Where is everything right now?      → Presence layer
//   Where can we hear, and where not?   → Coverage layer
//   Where does the count disagree?      → Inventory layer
//   What is happening in this zone?     → zone inspector ▸ the four modules
//
// Nothing here is a dead end: every zone, device and asset hands off to the
// module that can act on it, already scoped to this facility.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { FacilityMap, MapLegend, type MapMode } from '@/components/tracking/FacilityMap';
import { Drawer, Field, LiveStamp } from '@/components/tracking/shell';
import {
  BatteryPill, Chip, ChipFilter, Meter, Panel, PrecisionChip, PresencePill, SplitMeter,
  StatTile, deviceTone, scoreTone, type Tone,
} from '@/components/tracking/bits';
import {
  TRACKED_FACILITIES, coverageCells, devicesForFacility, eventsForFacility, facilityBySlug,
  presenceForFacility, roomsForFacility, trackingKpis, zonesForFacility,
} from '@/lib/tracking-data';
import { cn, formatMoney, relTime } from '@/lib/utils';
import type { AssetPresence, TrackedFacility, ZoneKind } from '@access-genie/shared';

const LAYERS: { key: MapMode; label: string; blurb: string }[] = [
  { key: 'presence', label: 'Presence', blurb: 'where everything is right now' },
  { key: 'coverage', label: 'Coverage', blurb: 'where we can and cannot hear' },
  { key: 'inventory', label: 'Inventory truth', blurb: 'where the count disagrees with the book' },
];

const ZONE_ICON: Record<ZoneKind, string> = {
  Storeroom: '📦', 'Data Hall': '🖥️', Office: '🏢', Dock: '🚚',
  'Secure Cage': '🔐', Lab: '🧪', Transit: '↔️',
};

/**
 * One definition of "needs a human", used by the exceptions filter, the zone
 * tiles and the inspector alike — so the same asset is never an exception in
 * one place and fine in another.
 */
const isException = (p: AssetPresence): boolean =>
  p.state === 'Missing'
  || p.state === 'Offline'
  || p.custody === 'Unaccounted'
  || p.alertIds.length > 0
  || (p.zone !== p.homeZone && p.custody === 'In Place');

export default function DigitalTwinPage() {
  const { facility: slug = '' } = useParams();
  const facility = facilityBySlug(slug);

  if (!facility || !facility.twinReady) {
    return (
      <div className="space-y-5 pb-4">
        <PageHeader
          title="Digital Twin"
          breadcrumb={[
            { label: 'Asset Tracking', href: '/tracking' },
            { label: 'Live Tracking', href: '/tracking' },
            { label: 'Digital Twin' },
          ]}
        />
        <div className="glass-panel">
          <EmptyState
            icon="🏢"
            title="No twin for this facility"
            description={`Nothing is published for "${slug}". A building needs a floor-plan and live coverage before it can be twinned.`}
            action={
              <Link to="/tracking">
                <Button variant="outline">← Back to the tracking dashboard</Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return <TwinWorkspace facility={facility} />;
}

function TwinWorkspace({ facility }: { facility: TrackedFacility }) {
  const { toast } = useToast();

  const [mode, setMode] = useState<MapMode>('presence');
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [hoverZone, setHoverZone] = useState<string | null>(null);
  const [showMarkers, setShowMarkers] = useState(true);
  const [onlyExceptions, setOnlyExceptions] = useState(false);
  const [hoverAsset, setHoverAsset] = useState<string | null>(null);
  const [openAsset, setOpenAsset] = useState<string | null>(null);
  // In-session state so actions visibly do something.
  const [flagged, setFlagged] = useState<string[]>([]);
  const [recounted, setRecounted] = useState<string[]>([]);

  const zones = useMemo(() => zonesForFacility(facility.name), [facility.name]);
  const presence = useMemo(() => presenceForFacility(facility.slug), [facility.slug]);
  const rooms = useMemo(() => roomsForFacility(facility.slug), [facility.slug]);
  const devices = useMemo(() => devicesForFacility(facility.slug), [facility.slug]);
  const kpis = useMemo(() => trackingKpis(facility.slug), [facility.slug]);
  const events = useMemo(() => eventsForFacility(facility.slug).slice(0, 8), [facility.slug]);

  // The one derived table the plan, the tiles and the inspector all read from.
  const rows = useMemo(
    () =>
      zones.map((z) => {
        const inZone = presence.filter((p) => p.zone === z.name);
        const cell = coverageCells.find((c) => c.zoneId === z.id);
        return {
          zone: z,
          assets: inZone,
          exceptions: inZone.filter(isException),
          value: inZone.reduce((s, p) => s + p.valueInr, 0),
          countPct: z.expected ? Math.round((z.detected / z.expected) * 100) : 100,
          blindSpots: cell?.blindSpots ?? 0,
          atRisk: cell?.assetsAtRisk ?? 0,
          infra: devices.filter((d) => d.zone === z.name && d.role !== 'Tag'),
          tags: devices.filter((d) => d.zone === z.name && d.role === 'Tag').length,
          room: rooms.find((r) => r.zoneId === z.id),
        };
      }),
    [zones, presence, rooms, devices],
  );

  const exceptions = useMemo(() => presence.filter(isException), [presence]);
  const markers = useMemo(() => {
    if (!showMarkers) return [];
    return onlyExceptions ? exceptions : presence;
  }, [showMarkers, onlyExceptions, exceptions, presence]);

  const selected = rows.find((r) => r.zone.id === zoneId) ?? null;
  const asset = openAsset ? presence.find((p) => p.assetId === openAsset) ?? null : null;

  const expectedTotal = zones.reduce((s, z) => s + z.expected, 0);
  const detectedTotal = zones.reduce((s, z) => s + z.detected, 0);
  const blindTotal = rows.reduce((s, r) => s + r.blindSpots, 0);

  // ── URL state: the layer and the open zone travel in a shared link ─────────
  const writeParam = useCallback((key: string, value: string | null) => {
    const p = new URLSearchParams(window.location.search);
    if (value) p.set(key, value);
    else p.delete(key);
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, []);

  // Deep links are applied after mount, never during render, so the server HTML
  // is identical for every visitor and hydration cannot drift. The one-shot
  // setState below is that handover, not a render cascade.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const m = p.get('mode');
    if (m === 'presence' || m === 'coverage' || m === 'inventory') setMode(m);
    const z = p.get('zone');
    if (z && zones.some((x) => x.id === z)) setZoneId(z);
    if (p.get('state') === 'exceptions') setOnlyExceptions(true);
    // Locate Assets and the alert queue hand an asset over by id.
    const a = p.get('asset');
    if (a && presence.some((x) => x.assetId === a)) setOpenAsset(a);
  }, [zones, presence]);

  const pickLayer = (m: MapMode) => { setMode(m); writeParam('mode', m); };
  const pickZone = (id: string | null) => { setZoneId(id); writeParam('zone', id); };

  const layerBlurb =
    mode === 'presence'
      ? `${markers.length} signals plotted · ${exceptions.length} need a person`
      : mode === 'coverage'
        ? `${facility.coverage}% average coverage · ${blindTotal} known blind spot${blindTotal === 1 ? '' : 's'}`
        : `${detectedTotal.toLocaleString('en-IN')} detected of ${expectedTotal.toLocaleString('en-IN')} expected`;

  const scoped = `facility=${facility.slug}`;
  const MODULE_LINKS = [
    { icon: '🔎', label: 'Live tracking', href: `/tracking?${scoped}`, hint: `${presence.length} tracked in this building` },
    { icon: '📦', label: 'Inventory control', href: `/tracking/inventory?tab=rooms&${scoped}`, hint: `${kpis.roomsVerified} of ${kpis.roomsTotal} rooms reconciled` },
    { icon: '🚨', label: 'Alerts & incidents', href: `/tracking/alerts?tab=queue&${scoped}`, hint: `${kpis.openAlerts} open · ${kpis.slaBreached} overdue` },
    { icon: '📡', label: 'Tracking infrastructure', href: `/tracking/infrastructure?tab=tags&${scoped}`, hint: `${kpis.devicesTotal} devices · ${kpis.devicesOffline} not reporting` },
  ];

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        title={facility.name}
        subtitle={`${facility.building} — the live twin of this building.`}
        breadcrumb={[
          { label: 'Asset Tracking', href: '/tracking' },
          { label: 'Live Tracking', href: '/tracking' },
          { label: 'Digital Twin' },
        ]}
        actions={
          <>
            <LiveStamp />
            {/* Switching buildings is a switch of twin, not a filter — the whole
                screen is about one place at a time. */}
            <nav aria-label="Facility" className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
              {TRACKED_FACILITIES.filter((f) => f.twinReady).map((f) => (
                <Link
                  key={f.slug}
                  to={`/tracking/twin/${f.slug}`}
                  aria-current={f.slug === facility.slug ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    f.slug === facility.slug
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <span aria-hidden>{f.emoji}</span>
                  {f.short}
                </Link>
              ))}
            </nav>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── The plan ─────────────────────────────────────────────────────── */}
        <Panel
          title="Live floor plan"
          subtitle={layerBlurb}
          actions={
            <span className="text-[11px] text-slate-400">
              {zones.length} zones · {LAYERS.find((l) => l.key === mode)?.blurb}
            </span>
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ChipFilter
              options={LAYERS.map((l) => ({ key: l.key, label: l.label }))}
              value={mode}
              onChange={pickLayer}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <Toggle on={showMarkers} onClick={() => setShowMarkers((v) => !v)} hint="Plot every tracked asset on the plan">
                Asset markers
              </Toggle>
              <Toggle
                on={onlyExceptions}
                /* Narrowing to exceptions is pointless with the markers hidden,
                   so asking for them brings the markers back. */
                onClick={() => {
                  const next = !onlyExceptions;
                  setOnlyExceptions(next);
                  if (next) setShowMarkers(true);
                }}
                hint="Show only assets that are missing, unheard, misplaced or under alert"
              >
                Only exceptions
                <span className="tabular-nums">{exceptions.length}</span>
              </Toggle>
            </div>
          </div>

          <div className="mt-3">
            <FacilityMap
              className="mx-auto max-w-3xl"
              ariaLabel={`${facility.name} floor plan — ${mode} layer`}
              zones={zones}
              mode={mode}
              markers={markers}
              /* Hovering a zone tile lights the same rect on the plan. */
              selectedZoneId={hoverZone ?? zoneId}
              onZoneSelect={pickZone}
              hoveredId={hoverAsset}
              onHover={setHoverAsset}
              selectedId={openAsset}
              onSelect={setOpenAsset}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <MapLegend mode={mode} />
            <span className="text-[11px] text-slate-400">
              {showMarkers
                ? 'Click a zone to inspect it · click a marker for the asset'
                : 'Markers hidden — click a zone to inspect it'}
            </span>
          </div>
        </Panel>

        {/* ── Rail: inspector, vitals, feed, ways out ──────────────────────── */}
        <aside className="space-y-4">
          {selected && (
            <Panel
              title={selected.zone.name}
              subtitle={`${selected.zone.kind} · ${selected.zone.policy}`}
              actions={
                <button
                  type="button"
                  onClick={() => pickZone(null)}
                  aria-label="Close zone inspector"
                  className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  ✕
                </button>
              }
            >
              <div className="flex flex-wrap gap-1.5">
                <Chip tone={selected.zone.armed ? 'primary' : 'slate'}>
                  {selected.zone.armed ? '🔒 Policy enforced' : 'Open zone'}
                </Chip>
                {selected.zone.dwellLimitMin !== undefined && (
                  <Chip tone="slate">Dwell limit {Math.round(selected.zone.dwellLimitMin / 60)}h</Chip>
                )}
                {selected.zone.violations24h > 0 && (
                  <Chip tone="amber">{selected.zone.violations24h} violations · 24h</Chip>
                )}
                {recounted.includes(selected.zone.id) && <Chip tone="primary" dot>Re-count queued</Chip>}
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                <Stat label="Detected" value={`${selected.zone.detected}/${selected.zone.expected}`} />
                <Stat label="Live signals" value={selected.assets.length.toString()} />
                {/* Same thresholds the plan paints with, so the legend under
                    the map and the numbers beside it never disagree. */}
                <Stat
                  label="Coverage"
                  value={`${selected.zone.coverage}%`}
                  tone={scoreTone(selected.zone.coverage)}
                />
                <Stat
                  label="Needs a person"
                  value={selected.exceptions.length.toString()}
                  tone={selected.exceptions.length ? 'red' : 'emerald'}
                />
              </dl>

              <div className="mt-3">
                {selected.room ? (
                  <SplitMeter
                    matched={selected.room.detected - selected.room.unexpected}
                    missing={selected.room.missing}
                    unexpected={selected.room.unexpected}
                    total={selected.room.expected}
                  />
                ) : (
                  <Meter value={selected.countPct} tone={scoreTone(selected.countPct, 99, 97)} />
                )}
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {formatMoney(selected.value)} of asset value resolves to this zone
                  {selected.atRisk > 0 && ` · ${selected.atRisk} assets sit outside reliable coverage`}.
                </p>
              </div>

              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Assets here
                </p>
                {selected.assets.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">Nothing is resolving to this zone right now.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100">
                    {selected.assets.slice(0, 6).map((p) => (
                      <li key={p.assetId}>
                        <button
                          type="button"
                          onClick={() => setOpenAsset(p.assetId)}
                          onMouseEnter={() => setHoverAsset(p.assetId)}
                          onMouseLeave={() => setHoverAsset(null)}
                          className="flex w-full items-center justify-between gap-2 py-1.5 text-left transition-colors hover:text-primary-700"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-slate-800">
                              {flagged.includes(p.assetId) && <span aria-hidden>🚩 </span>}
                              {p.assetName}
                            </span>
                            <span className="block truncate text-[11px] text-slate-400">
                              {p.assetId} · {p.custodian}
                            </span>
                          </span>
                          <PresencePill state={p.state} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {selected.assets.length > 6 && (
                  <Link
                    to={`/tracking/geofences?zone=${selected.zone.id}&${scoped}`}
                    className="mt-2 inline-block text-xs font-semibold text-primary-600 hover:text-primary-700"
                  >
                    See all {selected.assets.length} in Locate Assets →
                  </Link>
                )}
              </div>

              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Serving this zone
                </p>
                {selected.infra.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">
                    No fixed equipment covers this zone — positions here come from nearby readings.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {selected.infra.map((d) => (
                      <li key={d.id}>
                        <Link
                          to={`/tracking/infrastructure?tab=tags&device=${d.id}&${scoped}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 transition-colors hover:bg-slate-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-slate-700">{d.name}</span>
                            <span className="block text-[11px] text-slate-400">{d.role} · serves {d.serves}</span>
                          </span>
                          <Chip tone={deviceTone[d.state]} dot>{d.state}</Chip>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {selected.tags > 0 && (
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Plus {selected.tags} asset tags reporting from this zone.
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Link to={`/tracking/geofences?zone=${selected.zone.id}&${scoped}`}>
                  <Button size="sm">Locate in this zone</Button>
                </Link>
                {selected.room && (
                  <Link to={`/tracking/inventory?tab=rooms&room=${selected.room.id}&${scoped}`}>
                    <Button size="sm" variant="outline">Open the room record</Button>
                  </Link>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRecounted((prev) => (prev.includes(selected.zone.id) ? prev : [...prev, selected.zone.id]));
                    toast({
                      title: `Re-count queued for ${selected.zone.name}`,
                      description: 'The zone will verify itself on the next pass and post the variance to Inventory Control.',
                      tone: 'success',
                    });
                  }}
                >
                  Re-count this zone
                </Button>
              </div>
            </Panel>
          )}

          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Tracked here" value={presence.length.toLocaleString('en-IN')}
              sub={`${kpis.online} reporting now`}
              href={`/tracking?tab=list&${scoped}`}
            />
            <StatTile
              label="Coverage" value={`${facility.coverage}%`}
              tone={scoreTone(facility.coverage)} meter={facility.coverage}
              href={`/tracking/infrastructure?tab=readers&${scoped}`}
            />
            <StatTile
              label="Rooms reconciled" value={`${kpis.roomsVerified}/${kpis.roomsTotal}`}
              tone={kpis.roomsVerified === kpis.roomsTotal ? 'emerald' : 'amber'}
              sub={`${kpis.inventoryAccuracy}% accuracy`}
              href={`/tracking/inventory?tab=rooms&${scoped}`}
            />
            <StatTile
              label="Open alerts" value={kpis.openAlerts.toLocaleString('en-IN')}
              tone={kpis.p1Alerts ? 'red' : kpis.openAlerts ? 'amber' : 'emerald'}
              sub={`${kpis.p1Alerts} critical`}
              href={`/tracking/alerts?tab=queue&${scoped}`}
            />
          </div>

          <Panel title="What this building is reporting" subtitle="Newest first" actions={<LiveStamp />}>
            {events.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">Nothing reported here today.</p>
            ) : (
              <ol className="space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="flex gap-2.5">
                    <span
                      className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        e.tone === 'good' ? 'bg-health-good' : e.tone === 'warn' ? 'bg-health-warning' : e.tone === 'bad' ? 'bg-health-critical' : 'bg-primary-500')}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-medium text-slate-800">{e.title}</span>
                        <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{relTime(e.at)}</span>
                      </div>
                      <p className="truncate text-[11px] text-slate-500">{e.detail}</p>
                      {e.zone && zones.some((z) => z.name === e.zone) && (
                        <button
                          type="button"
                          onClick={() => {
                            const z = zones.find((x) => x.name === e.zone);
                            if (z) pickZone(z.id);
                          }}
                          className="mt-0.5 text-[11px] font-medium text-primary-600 hover:text-primary-700"
                        >
                          Show {e.zone} on the plan →
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Work this building" subtitle="Every module, already scoped here" padded={false}>
            <ul className="divide-y divide-slate-100">
              {MODULE_LINKS.map((m) => (
                <li key={m.href}>
                  <Link to={m.href} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50">
                    <span className="text-base" aria-hidden>{m.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{m.label}</span>
                      <span className="block truncate text-[11px] text-slate-500">{m.hint}</span>
                    </span>
                    <span className="text-xs text-slate-300">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>

      {/* ── Zone strip — the plan, read as a list ───────────────────────────── */}
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Zones in this building
          </h2>
          <span className="text-[11px] text-slate-400">
            Hover to find a zone on the plan · click to inspect it
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {rows.map((r) => {
            const on = r.zone.id === zoneId;
            return (
              <button
                key={r.zone.id}
                type="button"
                aria-pressed={on}
                onClick={() => pickZone(on ? null : r.zone.id)}
                onMouseEnter={() => setHoverZone(r.zone.id)}
                onMouseLeave={() => setHoverZone(null)}
                onFocus={() => setHoverZone(r.zone.id)}
                onBlur={() => setHoverZone(null)}
                className={cn(
                  'glass-panel p-3 text-left transition-shadow hover:shadow-md',
                  on && 'ring-2 ring-primary-500',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-800">
                      <span aria-hidden>{ZONE_ICON[r.zone.kind]} </span>{r.zone.name}
                    </span>
                    <span className="block truncate text-[11px] text-slate-400">{r.zone.kind}</span>
                  </span>
                  {r.zone.armed && <span role="img" className="shrink-0 text-[11px]" title={r.zone.policy} aria-label={r.zone.policy}>🔒</span>}
                </div>

                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="text-[11px] tabular-nums text-slate-500">
                    {r.zone.detected}/{r.zone.expected}
                  </span>
                  <span className={cn('text-[11px] font-semibold tabular-nums',
                    r.countPct >= 99 ? 'text-emerald-600' : r.countPct >= 97 ? 'text-amber-600' : 'text-health-critical')}>
                    {r.countPct}%
                  </span>
                </div>

                <div className="mt-1.5">
                  <Meter value={r.zone.coverage} tone={scoreTone(r.zone.coverage)} height="h-1" />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span className="tabular-nums">{r.zone.coverage}% coverage</span>
                  {r.exceptions.length > 0 && (
                    <span className="font-semibold text-health-critical tabular-nums">{r.exceptions.length} ⚑</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Asset detail, straight off the plan ─────────────────────────────── */}
      <Drawer
        open={asset !== null}
        onClose={() => setOpenAsset(null)}
        width="max-w-md"
        title={asset?.assetName ?? ''}
        subtitle={asset ? `${asset.assetId} · ${asset.category}` : undefined}
        eyebrow={
          asset && (
            <>
              <PresencePill state={asset.state} />
              <PrecisionChip precision={asset.precision} confidence={asset.confidence} />
              {flagged.includes(asset.assetId) && <Chip tone="red" dot>Flagged for recovery</Chip>}
            </>
          )
        }
        footer={
          asset && (
            <>
              <Link to={`/tracking?asset=${asset.assetId}&${scoped}`}>
                <Button size="sm">Open in Locate Assets</Button>
              </Link>
              {asset.alertIds.length > 0 && (
                <Link to={`/tracking/alerts?tab=queue&alert=${asset.alertIds[0]}`}>
                  <Button size="sm" variant="outline">See the open alert</Button>
                </Link>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFlagged((prev) => (prev.includes(asset.assetId) ? prev : [...prev, asset.assetId]));
                  toast({
                    title: `${asset.assetName} flagged for recovery`,
                    description: 'A search task has been raised against this asset for the facility team.',
                    tone: 'success',
                  });
                }}
              >
                Flag for recovery
              </Button>
            </>
          )
        }
      >
        {asset && (
          <dl className="divide-y divide-slate-100">
            <Field label="Resolved to">{asset.zone}</Field>
            <Field label="Should be in">
              {asset.zone === asset.homeZone
                ? <span className="text-slate-500">Where it belongs</span>
                : <span className="font-medium text-amber-600">{asset.homeZone}</span>}
            </Field>
            <Field label="Custody">{asset.custody}</Field>
            <Field label="Held by">{asset.custodian}</Field>
            <Field label="Last seen">{relTime(asset.lastSeen)}</Field>
            <Field label="Movement">{asset.movingNow ? 'Moving now' : 'Stationary'}</Field>
            <Field label="Criticality">{asset.criticality}</Field>
            <Field label="Value">{formatMoney(asset.valueInr)}</Field>
            <Field label="Tag battery"><BatteryPill pct={asset.batteryPct} /></Field>
          </dl>
        )}
      </Drawer>
    </div>
  );
}

// ── Local bits ───────────────────────────────────────────────────────────────

function Toggle({
  on, onClick, hint, children,
}: {
  on: boolean; onClick: () => void; hint: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={hint}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        on
          ? 'border-primary-200 bg-primary-50 text-primary-700'
          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', on ? 'bg-primary-500' : 'bg-slate-300')} aria-hidden />
      {children}
    </button>
  );
}

const TEXT_TONE: Record<Tone, string> = {
  emerald: 'text-emerald-600',
  amber: 'text-amber-600',
  red: 'text-health-critical',
  slate: 'text-slate-900',
  primary: 'text-primary-600',
};

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: Tone }) {
  return (
    <div>
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className={cn('font-heading text-base font-semibold tabular-nums', TEXT_TONE[tone])}>{value}</dd>
    </div>
  );
}
