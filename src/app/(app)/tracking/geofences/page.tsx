'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Asset Tracking ▸ Geofence Monitoring
//
// One question: **is everything where the rules say it should be?**
//
// A zone here is a rule with a boundary, not a polygon with an ID. Every policy
// is written as a sentence a facilities manager would say out loud — "nothing
// leaves without a check-out" — because that is the thing they are agreeing to
// enforce. The primitive underneath is an implementation detail.
//
// Arming is the only switch on the page, and it is deliberately one click with
// an honest consequence line: an unarmed zone still records movements, it just
// stops raising alerts. Silently recording nothing would be the worse default.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { FacilityMap, MapLegend } from '@/components/tracking/FacilityMap';
import { Drawer, Field, LiveStamp, ScopePicker, useFacilityScope } from '@/components/tracking/shell';
import {
  Chip, ChipFilter, Meter, Panel, PresencePill, StatTile, TableShell, scoreTone, td, th,
} from '@/components/tracking/bits';
import {
  FacilitySwitch, POLICY_TEXT, categoryEmoji, fmtDwell, isMisplaced, slugFor,
} from '@/lib/tracking-ui';
import {
  TRACKED_FACILITIES, facilityBySlug, inventoryRooms, presenceForFacility, trackedZones,
  zoneById, zonesForFacility,
} from '@/lib/tracking-data';
import { cn } from '@/lib/utils';
import type { TrackedZone } from '@/types/tracking';

/** What the operator is looking for, not what the data model calls it. */
type View = 'all' | 'armed' | 'violations' | 'weak';

export default function GeofenceMonitoringPage() {
  const { toast } = useToast();
  const [scope, setScope] = useFacilityScope();

  const [armedOverrides, setArmedOverrides] = useState<Record<string, boolean>>({});
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [planSlug, setPlanSlug] = useState(TRACKED_FACILITIES[0].slug);
  const [view, setView] = useState<View>('all');
  const [query, setQuery] = useState('');

  const facilityName = scope === 'all' ? null : facilityBySlug(scope)?.name ?? null;

  // A plan needs one building; the rules table is happy to span the estate.
  const planFacility = useMemo(
    () => (facilityName ? facilityBySlug(slugFor(facilityName)) : facilityBySlug(planSlug)) ?? TRACKED_FACILITIES[0],
    [facilityName, planSlug],
  );
  const planZones = useMemo(() => zonesForFacility(planFacility.name), [planFacility.name]);

  const scoped = useMemo(() => presenceForFacility(scope), [scope]);
  const onPlan = useMemo(
    () => scoped.filter((p) => p.facility === planFacility.name && p.position),
    [scoped, planFacility.name],
  );

  /** Every zone in scope — the estate when unscoped, one building when not. */
  const zonesInScope = useMemo(
    () => (facilityName ? trackedZones.filter((z) => z.facility === facilityName) : trackedZones),
    [facilityName],
  );

  const isArmed = (z: TrackedZone) => armedOverrides[z.id] ?? z.armed;

  // A deep link from Live Tracking or the alert queue names the zone to open.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const z = new URLSearchParams(window.location.search).get('zone');
    if (z) {
      const zone = zoneById(z);
      if (zone) { setSelectedZone(zone.id); setPlanSlug(slugFor(zone.facility)); }
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleArmed = (z: TrackedZone) => {
    const next = !isArmed(z);
    setArmedOverrides((prev) => ({ ...prev, [z.id]: next }));
    toast({
      title: next ? `${z.name} armed` : `${z.name} disarmed`,
      description: next ? POLICY_TEXT[z.policy] : 'Movements are recorded but no longer raise alerts',
      tone: next ? 'success' : 'info',
    });
  };

  const stats = useMemo(() => ({
    total: zonesInScope.length,
    armed: zonesInScope.filter(isArmed).length,
    violations: zonesInScope.reduce((s, z) => s + z.violations24h, 0),
    weak: zonesInScope.filter((z) => z.coverage < 85).length,
    outsideHome: scoped.filter(isMisplaced).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isArmed closes over armedOverrides, which is in the dep list
  }), [zonesInScope, scoped, armedOverrides]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return zonesInScope
      .filter((z) => {
        if (view === 'armed' && !isArmed(z)) return false;
        if (view === 'violations' && z.violations24h === 0) return false;
        if (view === 'weak' && z.coverage >= 85) return false;
        if (q && !`${z.name} ${z.kind} ${z.facility} ${z.policy}`.toLowerCase().includes(q)) return false;
        return true;
      })
      // Trouble first: the zones breaking their own rule, then the ones we
      // cannot hear properly, then everything quiet.
      .sort((a, b) => b.violations24h - a.violations24h || a.coverage - b.coverage || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isArmed closes over armedOverrides, which is in the dep list
  }, [zonesInScope, view, query, armedOverrides]);

  const zoneRecord = selectedZone ? zoneById(selectedZone) ?? null : null;
  /** Only a zone that is also a counted room can be sent to Inventory — the
   *  rest are open floor, and offering to count them would go nowhere. */
  const zoneRoom = zoneRecord ? inventoryRooms.find((r) => r.zoneId === zoneRecord.id) : undefined;
  const zoneAssets = useMemo(
    () => (zoneRecord ? scoped.filter((p) => p.facility === zoneRecord.facility && p.zone === zoneRecord.name) : []),
    [zoneRecord, scoped],
  );

  return (
    <div className="space-y-5 pb-4">
      <PageHeader
        title="Geofence Monitoring"
        subtitle="The rules each zone enforces, which of them are armed, and who broke one today."
        breadcrumb={[{ label: 'Asset Tracking', href: '/tracking' }, { label: 'Geofence Monitoring' }]}
        actions={
          <>
            <LiveStamp label="Rules live" />
            <ScopePicker value={scope} onChange={setScope} />
            <Button
              variant="outline"
              onClick={() => toast({
                title: 'Zone report queued',
                description: `${stats.total} zones with their policy, coverage and violations`,
                tone: 'success',
              })}
            >
              ⤓ Export
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Zones" value={stats.total} icon="🗺️" sub={facilityName ?? 'across the estate'}
          active={view === 'all'} onClick={() => setView('all')} />
        <StatTile label="Armed" value={stats.armed} icon="🛡️" tone={stats.armed === stats.total ? 'emerald' : 'slate'}
          sub={`${stats.total - stats.armed} recording only`} active={view === 'armed'} onClick={() => setView('armed')} />
        <StatTile label="Violations 24h" value={stats.violations} icon="🚨"
          tone={stats.violations ? 'red' : 'emerald'} sub={stats.violations ? 'rules broken today' : 'nothing broke a rule'}
          active={view === 'violations'} onClick={() => setView('violations')} />
        <StatTile label="Weak coverage" value={stats.weak} icon="📡" tone={stats.weak ? 'amber' : 'emerald'}
          sub="under 85% — false alerts start here" active={view === 'weak'} onClick={() => setView('weak')} />
        <StatTile label="Outside home zone" value={stats.outsideHome} icon="📍"
          tone={stats.outsideHome ? 'amber' : 'emerald'} sub="assets away from where they live"
          href="/tracking?tab=list" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* ── The plan ─────────────────────────────────────────────────────── */}
        <Panel
          title={`${planFacility.name} — zones`}
          subtitle={scope === 'all'
            ? `Showing ${planFacility.short} · click a zone on the plan`
            : 'Click a zone on the plan to see what is inside it'}
          className="xl:col-span-2"
          actions={scope === 'all' ? <FacilitySwitch value={planSlug} onChange={setPlanSlug} /> : undefined}
        >
          <FacilityMap
            zones={planZones} markers={onPlan} mode="presence" compact
            selectedZoneId={selectedZone} onZoneSelect={setSelectedZone}
            ariaLabel={`${planFacility.name} zones and policies`}
          />
          <div className="mt-3"><MapLegend mode="presence" /></div>
        </Panel>

        {/* ── The rules ────────────────────────────────────────────────────── */}
        <Panel
          title="Rules in force" className="xl:col-span-3" padded={false}
          subtitle={`${stats.armed} of ${stats.total} zones armed`}
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
            <input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search zone, kind or policy…" aria-label="Search zones"
              className="w-56 max-w-full rounded-md bg-slate-100 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
            <ChipFilter
              value={view} onChange={setView}
              options={[
                { key: 'all' as View, label: 'All', count: stats.total },
                { key: 'armed' as View, label: 'Armed', count: stats.armed },
                { key: 'violations' as View, label: 'Violations', count: stats.violations, tone: 'red' },
                { key: 'weak' as View, label: 'Weak signal', count: stats.weak, tone: 'amber' },
              ]}
            />
          </div>

          <TableShell>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={th}>Zone</th>
                <th className={th}>What it enforces</th>
                <th className={th}>Expected</th>
                <th className={th}>Coverage</th>
                <th className={th}>Violations 24h</th>
                <th className={cn(th, 'text-right')}>Armed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((z) => {
                const pct = z.expected ? Math.round((z.detected / z.expected) * 100) : 100;
                return (
                  <tr
                    key={z.id} onClick={() => setSelectedZone(z.id)}
                    className={cn('cursor-pointer transition-colors hover:bg-slate-50', selectedZone === z.id && 'bg-primary-50/50')}
                  >
                    <td className={td}>
                      <div className="font-medium text-slate-900">{z.name}</div>
                      <div className="text-xs text-slate-400">
                        {z.kind}{scope === 'all' ? ` · ${z.facility}` : ''}
                      </div>
                    </td>
                    <td className={cn(td, 'text-slate-600')}>
                      <div className="text-xs">{POLICY_TEXT[z.policy]}</div>
                      {z.dwellLimitMin && <div className="text-[11px] text-slate-400">Limit {fmtDwell(z.dwellLimitMin)}</div>}
                    </td>
                    <td className={cn(td, 'whitespace-nowrap tabular-nums text-slate-600')}>
                      <span className={pct >= 99 ? 'text-slate-600' : 'text-amber-600'}>{z.detected}</span>
                      <span className="text-slate-400"> / {z.expected}</span>
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <Meter value={z.coverage} className="w-16" />
                        <span className="text-xs tabular-nums text-slate-500">{z.coverage}%</span>
                      </div>
                    </td>
                    <td className={td}>
                      {z.violations24h > 0
                        ? <Chip tone="amber">{z.violations24h}</Chip>
                        : <span className="text-xs text-slate-400">None</span>}
                    </td>
                    <td className={cn(td, 'text-right')} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button" role="switch" aria-checked={isArmed(z)} onClick={() => toggleArmed(z)}
                        aria-label={`${isArmed(z) ? 'Disarm' : 'Arm'} ${z.name}`}
                        className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors', isArmed(z) ? 'bg-primary-600' : 'bg-slate-300')}
                      >
                        <span className={cn('absolute h-4 w-4 rounded-full bg-white transition-all', isArmed(z) ? 'left-[18px]' : 'left-0.5')} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>

          {rows.length === 0 && (
            <EmptyState
              variant="no-results" icon="🗺️" title="No zones match"
              description="Try another view, or clear the search."
              action={<Button variant="outline" onClick={() => { setView('all'); setQuery(''); }}>Show all zones</Button>}
            />
          )}
        </Panel>
      </div>

      {/* ── Zone drawer ──────────────────────────────────────────────────────── */}
      <Drawer
        open={!!zoneRecord} onClose={() => setSelectedZone(null)} title={zoneRecord?.name ?? ''}
        subtitle={zoneRecord ? `${zoneRecord.facility} · ${zoneRecord.kind}` : undefined}
        eyebrow={zoneRecord && (
          <>
            <Chip tone={isArmed(zoneRecord) ? 'primary' : 'slate'} dot>{isArmed(zoneRecord) ? 'Armed' : 'Not armed'}</Chip>
            <Chip tone={scoreTone(zoneRecord.coverage)}>{zoneRecord.coverage}% coverage</Chip>
            {zoneRecord.violations24h > 0 && <Chip tone="amber">{zoneRecord.violations24h} violations today</Chip>}
          </>
        )}
        footer={zoneRecord && (
          <>
            <Button size="sm" variant={isArmed(zoneRecord) ? 'outline' : 'primary'} onClick={() => toggleArmed(zoneRecord)}>
              {isArmed(zoneRecord) ? 'Disarm zone' : 'Arm zone'}
            </Button>
            <Link href={`/tracking/infrastructure?tab=readers&zone=${zoneRecord.id}`}>
              <Button size="sm" variant="outline">Review coverage</Button>
            </Link>
            {zoneRoom && (
              <Link href={`/tracking/inventory?tab=rooms&room=${zoneRoom.id}`}>
                <Button size="sm" variant="outline">Count this zone</Button>
              </Link>
            )}
          </>
        )}
      >
        {zoneRecord && (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Policy</div>
              <p className="mt-1 text-sm font-medium text-slate-800">{POLICY_TEXT[zoneRecord.policy]}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {isArmed(zoneRecord)
                  ? 'Breaking this rule raises an alert immediately.'
                  : 'Movements are still recorded, but nothing is raised.'}
                {zoneRecord.dwellLimitMin ? ` Dwell limit ${fmtDwell(zoneRecord.dwellLimitMin)}.` : ''}
              </p>
            </div>

            {zoneRecord.coverage < 85 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <div className="text-sm font-semibold text-amber-800">This rule is only as good as the signal</div>
                <p className="mt-0.5 text-xs text-amber-700">
                  At {zoneRecord.coverage}% coverage an asset can sit in this zone unheard, so an exit alert may
                  fire late — or a present asset may look like it left. Close the gap before trusting the rule.
                </p>
              </div>
            )}

            <dl className="divide-y divide-slate-100">
              <Field label="Expected here"><span className="tabular-nums">{zoneRecord.expected}</span></Field>
              <Field label="Detected now"><span className="tabular-nums">{zoneRecord.detected}</span></Field>
              <Field label="Coverage">
                <span className="inline-flex items-center gap-2">
                  <Meter value={zoneRecord.coverage} className="w-20" />
                  <span className="tabular-nums">{zoneRecord.coverage}%</span>
                </span>
              </Field>
              <Field label="Violations (24h)"><span className="tabular-nums">{zoneRecord.violations24h}</span></Field>
            </dl>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Tracked assets inside ({zoneAssets.length})
              </div>
              {zoneAssets.length === 0 ? (
                <p className="mt-2 rounded-lg border border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
                  Nothing individually tracked is resolving to this zone right now.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {zoneAssets.map((p) => (
                    <li key={p.assetId}>
                      <Link
                        href={`/tracking?asset=${p.assetId}`}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-slate-50"
                      >
                        <span aria-hidden>{categoryEmoji(p.category)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-800">{p.assetName}</span>
                          <span className="block truncate text-[11px] text-slate-400">{p.assetId} · {p.custodian}</span>
                        </span>
                        <PresencePill state={p.state} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
