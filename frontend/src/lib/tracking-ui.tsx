// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary shared by the Asset Tracking screens.
//
// Live Tracking, Asset Journey and Geofence Monitoring were one page until the
// navigation rework split them into the three questions they actually answer.
// They still have to agree on what a word means — "misplaced" has to count the
// same rows on the KPI tile, the row chip and the filter, or a tile sends you
// to a longer list than it counted. So the definitions live here, once.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils';
import { relTime } from '@/lib/utils';
import { TRACKED_FACILITIES } from '@/lib/tracking-data';
import type { AssetCategory } from '@access-genie/shared';
import type { AssetPresence, JourneyStop, PresenceState, ZonePolicy } from '@access-genie/shared';

export const categoryEmoji = (c: AssetCategory) =>
  c === 'Endpoints' ? '📱' : c === 'Compute' ? '💻' : c === 'Network' ? '🌐'
    : c === 'Sensors' ? '📡' : '⚡';

/** The policy, said out loud. Nobody manages a building in geofence primitives. */
export const POLICY_TEXT: Record<ZonePolicy, string> = {
  Open: 'Anything may come and go',
  'Authorised only': 'Approved people and assets only',
  'No exit without check-out': 'Nothing leaves without a check-out',
  'Dwell limit': 'Flag anything parked too long',
  'After-hours watch': 'Watched outside working hours',
};

/**
 * "Not seen" deliberately folds Stale and Offline together. The distinction is
 * how long we have been deaf, not whether anything is wrong.
 */
export const STATE_FILTERS = ['All', 'Online', 'Not seen', 'In Transit', 'Missing'] as const;
export type StateFilter = (typeof STATE_FILTERS)[number];
export const CUSTODY_FILTERS = ['All', 'In Place', 'Checked Out', 'In Transit', 'Unaccounted'] as const;
export const CRIT_FILTERS = ['All', 'Critical', 'High', 'Medium', 'Low'] as const;

export const matchesState = (p: AssetPresence, f: StateFilter) =>
  f === 'All' ? true : f === 'Not seen' ? p.state === 'Offline' || p.state === 'Stale' : p.state === f;

/**
 * Misplaced is "away from its home zone while still nominally sitting there".
 * A checked-out laptop on someone's desk is not misplaced, and neither is an
 * asset already declared missing.
 */
export const isMisplaced = (p: AssetPresence) => p.zone !== p.homeZone && p.custody === 'In Place';

export const STATE_RANK: Record<PresenceState, number> = {
  Missing: 0, Offline: 1, Stale: 2, 'In Transit': 3, Online: 4,
};

export const fmtDwell = (min: number) => {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

/** One stop, said the way an operator would read it off a timeline. */
export const stopItem = (s: JourneyStop) => ({
  at: relTime(s.at),
  title: s.kind === 'Gap' ? 'Trail goes cold' : `${s.kind} · ${s.zone}`,
  detail: s.note ?? (s.dwellMin ? `Stayed ${fmtDwell(s.dwellMin)}` : undefined),
  actor: s.actor,
  tone: (s.kind === 'Gap' || s.kind === 'Alert' ? 'bad' : s.kind === 'Exited' ? 'warn' : 'info') as 'bad' | 'warn' | 'info',
});

export const slugFor = (facilityName: string) =>
  TRACKED_FACILITIES.find((f) => f.name === facilityName)?.slug ?? TRACKED_FACILITIES[0].slug;

/** With the whole estate in scope a plan still needs one building — this picks it. */
export function FacilitySwitch({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      {TRACKED_FACILITIES.map((f) => (
        <button
          key={f.slug}
          type="button"
          onClick={() => onChange(f.slug)}
          aria-pressed={value === f.slug}
          className={cn(
            'rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
            value === f.slug
              ? 'border-primary-200 bg-primary-50 text-primary-700'
              : 'border-slate-200 text-slate-500 hover:bg-slate-50',
          )}
        >
          <span aria-hidden>{f.emoji}</span> {f.short}
        </button>
      ))}
    </div>
  );
}
