'use client';

// ─────────────────────────────────────────────────────────────────────────────
// FacilityMap — one floor-plan component, four jobs.
//
//   presence   where things are right now          (Locate Assets, Dashboard)
//   coverage   where we can and cannot hear         (Infrastructure)
//   inventory  where the count agrees with the book (Inventory Control)
//   journey    where one thing has been             (Locate Assets ▸ replay)
//
// Every module draws the same building, so an operator learns the geography
// once. Zones keep their identity across modes; only the fill changes meaning,
// and the legend always says which meaning is currently on screen.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils';
import { relTime } from '@/lib/utils';
import { TONE_HEX, presenceTone, scoreTone } from './bits';
import type { AssetJourney, AssetPresence, TrackedZone, ZoneKind } from '@/types/tracking';

export type MapMode = 'presence' | 'coverage' | 'inventory';

const ZONE_FILL: Record<ZoneKind, { fill: string; stroke: string }> = {
  Storeroom: { fill: 'rgba(14,165,233,0.07)', stroke: 'rgba(14,165,233,0.38)' },
  'Data Hall': { fill: 'rgba(139,92,246,0.08)', stroke: 'rgba(139,92,246,0.38)' },
  Office: { fill: 'rgba(99,102,241,0.06)', stroke: 'rgba(99,102,241,0.32)' },
  Dock: { fill: 'rgba(245,158,11,0.08)', stroke: 'rgba(245,158,11,0.40)' },
  'Secure Cage': { fill: 'rgba(239,68,68,0.07)', stroke: 'rgba(239,68,68,0.42)' },
  Lab: { fill: 'rgba(20,184,166,0.09)', stroke: 'rgba(20,184,166,0.38)' },
  Transit: { fill: 'rgba(16,185,129,0.07)', stroke: 'rgba(16,185,129,0.38)' },
};

function scoreFill(pct: number): { fill: string; stroke: string } {
  const tone = scoreTone(pct);
  const hex = TONE_HEX[tone];
  const alpha = tone === 'emerald' ? 0.1 : tone === 'amber' ? 0.16 : 0.2;
  return { fill: hexA(hex, alpha), stroke: hexA(hex, 0.5) };
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function zoneStyle(z: TrackedZone, mode: MapMode) {
  if (mode === 'coverage') return scoreFill(z.coverage);
  if (mode === 'inventory') return scoreFill(z.expected ? (z.detected / z.expected) * 100 : 100);
  return ZONE_FILL[z.kind];
}

export function FacilityMap({
  zones,
  markers = [],
  mode = 'presence',
  selectedId = null,
  onSelect,
  hoveredId = null,
  onHover,
  selectedZoneId = null,
  onZoneSelect,
  journey = null,
  journeyIndex,
  compact = false,
  className,
  ariaLabel = 'Facility floor-plan',
}: {
  zones: TrackedZone[];
  markers?: AssetPresence[];
  mode?: MapMode;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  hoveredId?: string | null;
  onHover?: (id: string | null) => void;
  selectedZoneId?: string | null;
  onZoneSelect?: (zoneId: string | null) => void;
  journey?: AssetJourney | null;
  /** Index of the stop the replay scrubber is parked on. */
  journeyIndex?: number;
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const activeId = hoveredId ?? selectedId;
  const active = activeId ? markers.find((m) => m.assetId === activeId) ?? null : null;

  // Journey replay: everything up to the scrubber is solid, the rest is ghosted.
  const stops = journey?.stops ?? [];
  const cursor = journeyIndex === undefined ? stops.length - 1 : Math.min(journeyIndex, stops.length - 1);
  const path = stops
    .slice(0, cursor + 1)
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${s.x} ${s.y}`)
    .join(' ');
  const ghostPath = stops.map((s, i) => `${i === 0 ? 'M' : 'L'} ${s.x} ${s.y}`).join(' ');
  const head = stops[cursor];

  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50', className)}>
      <svg viewBox="0 0 100 100" className="block h-auto w-full" role="img" aria-label={ariaLabel}>
        <defs>
          <pattern id="fm-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(100,116,139,0.13)" strokeWidth="0.15" />
          </pattern>
        </defs>

        <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
        <rect x="0" y="0" width="100" height="100" fill="url(#fm-grid)" />
        <rect x="0.4" y="0.4" width="99.2" height="99.2" rx="2" fill="none" stroke="rgba(100,116,139,0.22)" strokeWidth="0.3" />

        {/* ── Zones ─────────────────────────────────────────────────────────── */}
        {zones.map((z) => {
          const s = zoneStyle(z, mode);
          const on = z.id === selectedZoneId;
          return (
            <g
              key={z.id}
              className={onZoneSelect ? 'cursor-pointer' : undefined}
              onClick={onZoneSelect ? () => onZoneSelect(on ? null : z.id) : undefined}
            >
              <rect
                x={z.x} y={z.y} width={z.width} height={z.height} rx="1.5"
                fill={s.fill}
                stroke={on ? '#6366f1' : s.stroke}
                strokeWidth={on ? 0.6 : 0.35}
                /* An armed zone is drawn with a dashed edge — the policy is
                   visible on the plan, not buried in a settings table. */
                strokeDasharray={z.armed && !on ? '1.6 1' : undefined}
              />
              {!compact && (
                <text
                  x={z.x + 1.8} y={z.y + 3.6} fontSize="2.2" fontWeight="600"
                  fill="rgba(51,65,85,0.78)" className="select-none font-heading"
                >
                  {z.name}
                </text>
              )}
              {!compact && mode === 'coverage' && (
                <text x={z.x + 1.8} y={z.y + 6.6} fontSize="1.9" fill="rgba(71,85,105,0.6)" className="select-none tabular-nums">
                  {z.coverage}% coverage
                </text>
              )}
              {!compact && mode === 'inventory' && (
                <text x={z.x + 1.8} y={z.y + 6.6} fontSize="1.9" fill="rgba(71,85,105,0.6)" className="select-none tabular-nums">
                  {z.detected}/{z.expected}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Journey trail ─────────────────────────────────────────────────── */}
        {journey && stops.length > 1 && (
          <g>
            <path d={ghostPath} fill="none" stroke="rgba(99,102,241,0.22)" strokeWidth="0.5" strokeDasharray="1 1" />
            <path d={path} fill="none" stroke="#6366f1" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" />
            {stops.slice(0, cursor + 1).map((s, i) => (
              <circle
                key={i} cx={s.x} cy={s.y} r={s.kind === 'Gap' ? 1.1 : 0.9}
                fill={s.kind === 'Gap' ? '#ffffff' : s.kind === 'Alert' ? '#ef4444' : '#6366f1'}
                stroke={s.kind === 'Gap' ? '#ef4444' : '#ffffff'} strokeWidth="0.35"
                strokeDasharray={s.kind === 'Gap' ? '0.6 0.6' : undefined}
              />
            ))}
            {head && (
              <g>
                <circle cx={head.x} cy={head.y} r="2.6" fill="none" stroke="#6366f1" strokeWidth="0.45" opacity="0.85">
                  <animate attributeName="r" values="2.2;3.2;2.2" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <circle cx={head.x} cy={head.y} r="1.5" fill="#6366f1" stroke="#ffffff" strokeWidth="0.5" />
              </g>
            )}
          </g>
        )}

        {/* ── Asset markers ─────────────────────────────────────────────────── */}
        {markers.map((m) => {
          if (!m.position) return null;
          const tone = presenceTone[m.state];
          const color = TONE_HEX[tone];
          const isActive = m.assetId === activeId;
          const alarmed = m.state === 'Missing' || m.alertIds.length > 0;
          const r = compact ? 1.1 : 1.6;
          return (
            <g
              key={m.assetId}
              className={cn('transition-opacity', onSelect && 'cursor-pointer')}
              opacity={activeId && !isActive ? 0.35 : 1}
              onMouseEnter={onHover ? () => onHover(m.assetId) : undefined}
              onMouseLeave={onHover ? () => onHover(null) : undefined}
              onClick={onSelect ? () => onSelect(selectedId === m.assetId ? null : m.assetId) : undefined}
            >
              {onSelect && <circle cx={m.position.x} cy={m.position.y} r="3" fill="transparent" />}

              {alarmed && !compact && (
                <circle cx={m.position.x} cy={m.position.y} r="1.6" fill="none" stroke={color} strokeWidth="0.4">
                  <animate attributeName="r" values="1.6;5.2" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0" dur="2s" repeatCount="indefinite" />
                </circle>
              )}

              {m.movingNow && !compact && (
                <animateTransform
                  attributeName="transform" type="translate"
                  values="0 0; 1.2 0.7; 0 0; -0.9 0.5; 0 0" dur="7s" repeatCount="indefinite"
                />
              )}

              {isActive && (
                <circle cx={m.position.x} cy={m.position.y} r="3.1" fill="none" stroke="#6366f1" strokeWidth="0.5" opacity="0.9" />
              )}

              <circle cx={m.position.x} cy={m.position.y} r={r * 1.5} fill={color} opacity="0.2" />
              <circle cx={m.position.x} cy={m.position.y} r={r} fill={color} stroke="#ffffff" strokeWidth="0.45" />
            </g>
          );
        })}
      </svg>

      {/* ── Hover / selection callout (HTML, for crisp text) ─────────────────── */}
      {!compact && active?.position && (
        <div
          className="pointer-events-none absolute z-20 w-56"
          style={{
            left: `${active.position.x}%`,
            top: `${active.position.y}%`,
            transform: `translate(${active.position.x < 24 ? '0%' : active.position.x > 76 ? '-100%' : '-50%'}, ${active.position.y < 34 ? '14%' : '-114%'})`,
          }}
        >
          <div className="pointer-events-auto rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-heading text-sm font-bold leading-tight text-slate-900">{active.assetName}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{active.assetId} · {active.category}</div>
              </div>
              <span
                className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: TONE_HEX[presenceTone[active.state]] }}
                aria-hidden
              />
            </div>
            <dl className="mt-2 space-y-1 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Zone</dt>
                <dd className="truncate text-right text-slate-700">{active.zone}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Last seen</dt>
                <dd className="text-slate-700">{relTime(active.lastSeen)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Held by</dt>
                <dd className="truncate text-right text-slate-700">{active.custodian}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

/** The legend that tells you what the fills currently mean. */
export function MapLegend({ mode }: { mode: MapMode }) {
  const items =
    mode === 'presence'
      ? [
          { c: TONE_HEX.emerald, l: 'Online' },
          { c: TONE_HEX.amber, l: 'Not seen recently' },
          { c: TONE_HEX.slate, l: 'No signal' },
          { c: TONE_HEX.primary, l: 'In transit' },
          { c: TONE_HEX.red, l: 'Missing' },
        ]
      : mode === 'coverage'
        ? [
            { c: TONE_HEX.emerald, l: 'Strong coverage (85%+)' },
            { c: TONE_HEX.amber, l: 'Patchy (70–84%)' },
            { c: TONE_HEX.red, l: 'Blind spots (<70%)' },
          ]
        : [
            { c: TONE_HEX.emerald, l: 'Count agrees' },
            { c: TONE_HEX.amber, l: 'Small variance' },
            { c: TONE_HEX.red, l: 'Significant variance' },
          ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
      {items.map((i) => (
        <span key={i.l} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i.c }} />
          {i.l}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-[2px] border border-dashed border-slate-400" />
        Policy-enforced zone
      </span>
    </div>
  );
}
