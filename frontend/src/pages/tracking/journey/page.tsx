// ─────────────────────────────────────────────────────────────────────────────
// Asset Tracking ▸ Asset Journey
//
// One question: **where has this asset been?**
//
// The list is the page. Picking an asset opens its trail in a side panel rather
// than navigating away, so you can read one journey, close it, and read the next
// without losing your place in the list — the same pattern every other list on
// the platform uses for detail.
//
// There is deliberately no floor-plan here. A journey is a sequence, not a
// position: what is being read is the *order* of the stops and the time between
// them. Live Tracking owns the map; this screen owns the sequence.
//
// A coverage gap is drawn as a break in the line, never smoothed over — time we
// could not hear the asset is a statement about our readers, not about the
// asset, so it routes to the infrastructure team.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { Drawer, LiveStamp, ScopePicker, useFacilityScope } from '@/components/tracking/shell';
import {
  Chip, ChipFilter, Panel, PresencePill, TableShell, td, th, type Tone,
} from '@/components/tracking/bits';
import { categoryEmoji } from '@/lib/asset-categories';
import { facilityBySlug, journeyForAsset, journeys, presenceById } from '@/lib/tracking-data';
import { cn, dayKey, formatDate, formatDateTime, formatTime, relTime } from '@/lib/utils';
import type { JourneyEventKind, JourneyStop } from '@access-genie/shared';
import { downloadCsv } from '@/api/configuration';

// ── How each kind of event reads on the line ─────────────────────────────────
// A Gap is the only one drawn as an absence: hollow dot, dashed connector, muted
// text. Everything else is something we actually observed.

const KIND_STYLE: Record<JourneyEventKind, { dot: string; ring: string; tone: Tone; verb: string }> = {
  Seen: { dot: 'bg-slate-400', ring: 'ring-slate-100', tone: 'slate', verb: 'Detected in' },
  Entered: { dot: 'bg-primary-500', ring: 'ring-primary-100', tone: 'primary', verb: 'Entered' },
  Exited: { dot: 'bg-amber-500', ring: 'ring-amber-100', tone: 'amber', verb: 'Left' },
  Dwell: { dot: 'bg-slate-400', ring: 'ring-slate-100', tone: 'slate', verb: 'Stayed in' },
  'Checked Out': { dot: 'bg-primary-500', ring: 'ring-primary-100', tone: 'primary', verb: 'Checked out from' },
  'Checked In': { dot: 'bg-emerald-500', ring: 'ring-emerald-100', tone: 'emerald', verb: 'Checked in at' },
  Gap: { dot: 'bg-white', ring: 'ring-amber-100', tone: 'amber', verb: 'Trail goes cold near' },
  Alert: { dot: 'bg-health-critical', ring: 'ring-red-100', tone: 'red', verb: 'Alert raised in' },
};

/**
 * One stop on the line. The clock time leads in its own gutter so the column of
 * times reads as a column — that spacing between two stamps *is* the elapsed
 * time, which is the thing a trail is read for. `relTime` stays underneath as
 * the human anchor ("was that today?"), and `last` gets the "now" treatment.
 */
function Stop({ stop, first, last }: { stop: JourneyStop; first: boolean; last: boolean }) {
  const s = KIND_STYLE[stop.kind];
  const gap = stop.kind === 'Gap';

  return (
    <li className="relative flex gap-3 pb-6 last:pb-0 sm:gap-4">
      {/* Time gutter */}
      <div className="w-[52px] shrink-0 pt-0.5 text-right sm:w-[58px]">
        <div className={cn('font-heading text-sm font-semibold tabular-nums', gap ? 'text-amber-700' : 'text-slate-800')}>
          {formatTime(stop.at)}
        </div>
        <div className="mt-0.5 text-[10px] tabular-nums leading-tight text-slate-400">{relTime(stop.at)}</div>
      </div>

      {/* The line itself — dashed through a gap, solid where we could hear. */}
      <div className="relative flex shrink-0 justify-center">
        {!last && (
          <span
            aria-hidden
            className={cn(
              'absolute top-5 bottom-[-24px] w-px',
              gap ? 'border-l border-dashed border-amber-300' : 'bg-slate-200',
            )}
          />
        )}
        <span
          aria-hidden
          className={cn(
            'relative z-10 mt-1 h-[15px] w-[15px] rounded-full ring-4',
            s.dot, s.ring,
            gap && 'border-2 border-dashed border-amber-400',
            last && !gap && 'ring-[6px]',
          )}
        />
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[13px] text-slate-500">{s.verb}</span>
          <span className={cn('font-heading text-sm font-semibold', gap ? 'text-amber-700' : 'text-slate-900')}>
            {stop.zone}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <Chip tone={s.tone} title={formatDateTime(stop.at)}>{stop.kind}</Chip>
          {last && !gap && <Chip tone="emerald" dot>Where it is now</Chip>}
          {first && !last && <Chip tone="slate">Start of window</Chip>}
          {stop.actor && <span className="text-xs text-slate-400">by {stop.actor}</span>}
        </div>

        {stop.note && <p className={cn('mt-1.5 text-xs', gap ? 'text-amber-700' : 'text-slate-500')}>{stop.note}</p>}
      </div>
    </li>
  );
}

/** Day heading, so a multi-day trail does not read as one long afternoon. */
function DayBreak({ iso }: { iso: string }) {
  return (
    <li className="relative flex items-center gap-3 pb-4 sm:gap-4">
      <div className="w-[52px] shrink-0 sm:w-[58px]" />
      <div className="flex w-[15px] shrink-0 justify-center">
        <span aria-hidden className="h-px w-full bg-slate-200" />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{formatDate(iso)}</span>
        <span aria-hidden className="h-px flex-1 bg-slate-100" />
      </div>
    </li>
  );
}

type View = 'all' | 'gaps' | 'custody';

export default function AssetJourneyPage() {
  const { toast } = useToast();
  const [scope, setScope] = useFacilityScope();

  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('all');

  const facilityName = scope === 'all' ? null : facilityBySlug(scope)?.name ?? null;

  /** Every asset with a recorded trail in this scope, freshest movement first. */
  const options = useMemo(
    () => journeys
      .filter((j) => !facilityName || presenceById(j.assetId)?.facility === facilityName)
      .slice()
      .sort((a, b) => Date.parse(b.windowTo) - Date.parse(a.windowTo)),
    [facilityName],
  );

  const hasCustody = (assetId: string) =>
    journeyForAsset(assetId)?.stops.some((s) => s.kind === 'Checked Out' || s.kind === 'Checked In') ?? false;

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((j) => {
      if (view === 'gaps' && j.gaps === 0) return false;
      if (view === 'custody' && !hasCustody(j.assetId)) return false;
      if (!q) return true;
      const p = presenceById(j.assetId);
      return `${j.assetName} ${j.assetId} ${p?.custodian ?? ''} ${p?.zone ?? ''}`.toLowerCase().includes(q);
    });
  }, [options, query, view]);

  const counts = useMemo(() => ({
    all: options.length,
    gaps: options.filter((j) => j.gaps > 0).length,
    custody: options.filter((j) => hasCustody(j.assetId)).length,
  }), [options]);

  // A deep link from Live Tracking or Asset 360 names the asset to open.
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get('asset');
    if (a && journeyForAsset(a)) setOpenId(a);
  }, []);

  const journey = openId ? journeyForAsset(openId) ?? null : null;
  const stops = journey?.stops ?? [];
  const presence = openId ? presenceById(openId) : undefined;


  /** Download what is on screen — built here because only the browser knows the filtered rows. */
  const exportRows = (name: string, rows: Record<string, unknown>[]) => {
    const n = downloadCsv(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast({
      title: n > 0 ? `${n} row${n === 1 ? '' : 's'} exported` : 'Nothing to export',
      description: n > 0 ? 'Downloaded as CSV.' : 'Nothing matches the current filters.',
      tone: n > 0 ? 'success' : 'info',
    });
  };


  return (
    <div className="space-y-5 pb-4">
      <PageHeader
        title="Asset Journey"
        subtitle="Where an asset has been, in the order it happened. Pick one to read its trail."
        breadcrumb={[{ label: 'Asset Tracking', href: '/tracking' }, { label: 'Asset Journey' }]}
        actions={
          <>
            <LiveStamp label="Trails live" />
            <ScopePicker value={scope} onChange={setScope} />
            <Button
              variant="outline"
              onClick={() =>
                // One row per stop, not per trail: a journey is only useful in
                // a spreadsheet if each place it stopped is its own line.
                exportRows(
                  'asset-journeys',
                  listed.flatMap((j) =>
                    j.stops.map((stop, i) => ({
                      'Asset ID': j.assetId,
                      Asset: j.assetName,
                      Stop: i + 1,
                      Zone: stop.zone,
                      At: stop.at,
                      Event: stop.kind,
                      'Dwell (min)': stop.dwellMin ?? '',
                      Actor: stop.actor ?? '',
                      Note: stop.note ?? '',
                    })),
                  ),
                )
              }
            >
              ⤓ Export
            </Button>
          </>
        }
      />

      {options.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            icon="🛰️" title="No movement history in this scope"
            description="Journeys are recorded for assets that have moved between zones. Widen the facility scope to see the estate's trails."
            action={<Button variant="outline" onClick={() => setScope('all')}>View all facilities</Button>}
          />
        </div>
      ) : (
        <Panel padded={false}>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
            <input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search asset, id, custodian or zone…" aria-label="Search assets with a journey"
              className="w-72 max-w-full rounded-md bg-slate-100 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
            <ChipFilter
              value={view} onChange={setView}
              options={[
                { key: 'all' as View, label: 'All trails', count: counts.all },
                { key: 'custody' as View, label: 'Changed hands', count: counts.custody, tone: 'primary' },
                { key: 'gaps' as View, label: 'With coverage gaps', count: counts.gaps, tone: 'amber' },
              ]}
            />
            <span className="ml-auto text-xs tabular-nums text-slate-400">
              {listed.length} of {options.length}
            </span>
          </div>

          <TableShell>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={th}>Asset</th>
                <th className={th}>Presence</th>
                <th className={th}>Currently in</th>
                <th className={th}>Custodian</th>
                <th className={th}>Stops</th>
                <th className={th}>Zones visited</th>
                <th className={th}>Trail quality</th>
                <th className={th}>Last movement</th>
                <th className={cn(th, 'text-right')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listed.map((j) => {
                const p = presenceById(j.assetId);
                return (
                  <tr
                    key={j.assetId}
                    onClick={() => setOpenId(j.assetId)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-base" aria-hidden>
                          {p ? categoryEmoji(p.category) : '📦'}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900">{j.assetName}</div>
                          <div className="text-xs text-slate-400">{j.assetId}</div>
                        </div>
                      </div>
                    </td>
                    <td className={td}>{p ? <PresencePill state={p.state} /> : <span className="text-xs text-slate-400">—</span>}</td>
                    <td className={cn(td, 'text-slate-600')}>
                      <div className="truncate">{p?.zone ?? '—'}</div>
                      {scope === 'all' && p && <div className="truncate text-xs text-slate-400">{p.facility}</div>}
                    </td>
                    <td className={cn(td, 'text-slate-600')}>{p?.custodian ?? '—'}</td>
                    <td className={cn(td, 'tabular-nums text-slate-700')}>{j.stops.length}</td>
                    <td className={cn(td, 'tabular-nums text-slate-700')}>{j.zonesVisited}</td>
                    <td className={td}>
                      {j.gaps === 0
                        ? <Chip tone="emerald">Complete</Chip>
                        : <Chip tone="amber">{j.gaps} gap{j.gaps === 1 ? '' : 's'}</Chip>}
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-xs tabular-nums text-slate-500')}>{relTime(j.windowTo)}</td>
                    <td className={cn(td, 'whitespace-nowrap text-right')}>
                      <span className="text-xs font-medium text-primary-600">View trail →</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>

          {listed.length === 0 && (
            <EmptyState
              variant="no-results" title="No trails match"
              description="Try another filter, or clear the search."
              action={<Button variant="outline" onClick={() => { setView('all'); setQuery(''); }}>Show all trails</Button>}
            />
          )}
        </Panel>
      )}

      {/* ── The trail ─────────────────────────────────────────────────────── */}
      <Drawer
        open={!!journey}
        onClose={() => setOpenId(null)}
        width="max-w-2xl"
        title={journey?.assetName ?? ''}
        subtitle={journey
          ? `${journey.assetId}${presence ? ` · ${presence.facility}` : ''} · ${relTime(journey.windowFrom)} → ${relTime(journey.windowTo)}`
          : undefined}
        eyebrow={journey && (
          <>
            {presence && <PresencePill state={presence.state} />}
            <Chip tone="slate">{journey.stops.length} stops</Chip>
            <Chip tone="slate">{journey.zonesVisited} zones</Chip>
            {journey.gaps > 0 && <Chip tone="amber">{journey.gaps} coverage gap{journey.gaps === 1 ? '' : 's'}</Chip>}
          </>
        )}
        footer={journey && (
          <>
            <Link to={`/tracking?asset=${journey.assetId}`}>
              <Button size="sm" variant="outline">Locate now</Button>
            </Link>
            <Link to={`/assets/${journey.assetId}`}>
              <Button size="sm" variant="outline">Open asset profile</Button>
            </Link>
            <Button
              size="sm" variant="ghost" className="ml-auto"
              onClick={() =>
                exportRows(
                  `trail-${journey.assetId}`,
                  journey.stops.map((stop, i) => ({
                    'Asset ID': journey.assetId,
                    Asset: journey.assetName,
                    Stop: i + 1,
                    Zone: stop.zone,
                    At: stop.at,
                    Event: stop.kind,
                    'Dwell (min)': stop.dwellMin ?? '',
                    Actor: stop.actor ?? '',
                    Note: stop.note ?? '',
                  })),
                )
              }
            >
              ⤓ Export trail
            </Button>
          </>
        )}
      >
        {journey && (
          <div>
            {/* A gap is a hole in our hearing, not misbehaviour by the asset —
                so it routes to the infrastructure team, not to the custodian. */}
            {journey.gaps > 0 && (
              <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <div className="text-sm font-semibold text-amber-900">
                  {journey.gaps === 1
                    ? 'One stretch of this trail is missing'
                    : `${journey.gaps} stretches of this trail are missing`}
                </div>
                <p className="mt-0.5 text-xs text-amber-800">
                  That is a coverage problem where the asset was, not a problem with the asset.{' '}
                  <Link to="/tracking/infrastructure?tab=readers" className="font-semibold underline underline-offset-2">
                    Review coverage →
                  </Link>
                </p>
              </div>
            )}

            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                The trail, oldest first
              </h3>
              <span className="text-[11px] text-slate-400">
                {formatDateTime(journey.windowFrom)} → {formatDateTime(journey.windowTo)}
              </span>
            </div>

            <ol className="pl-0.5">
              {stops.map((s, i) => (
                <Fragment key={`${s.at}-${i}`}>
                  {/* A heading whenever the calendar day turns over, including
                      before the first stop, so no time is read without a date. */}
                  {(i === 0 || dayKey(s.at) !== dayKey(stops[i - 1].at)) && <DayBreak iso={s.at} />}
                  <Stop stop={s} first={i === 0} last={i === stops.length - 1} />
                </Fragment>
              ))}
            </ol>
          </div>
        )}
      </Drawer>
    </div>
  );
}
