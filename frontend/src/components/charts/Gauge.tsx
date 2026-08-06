import { cn } from '@/lib/utils';

/**
 * A banded arc for a single percentage — fleet utilization, health.
 *
 * The bands are the point. A bare needle at 84% says nothing about whether 84
 * is good; a red-amber-green track says what the organisation considers good
 * before the reader has to ask.
 */
export function Gauge({
  value,
  label,
  bands = DEFAULT_BANDS,
  className,
}: {
  /** 0–100, or `null` when there is nothing to average. */
  value: number | null;
  label: string;
  bands?: { upTo: number; color: string }[];
  className?: string;
}) {
  const R = 70;
  const CX = 90;
  const CY = 90;

  // A 180° arc, drawn left to right.
  const pointOn = (fraction: number) => {
    const angle = Math.PI * (1 - Math.max(0, Math.min(1, fraction)));
    return { x: CX + R * Math.cos(angle), y: CY - R * Math.sin(angle) };
  };

  const arc = (from: number, to: number) => {
    const a = pointOn(from);
    const b = pointOn(to);
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${R} ${R} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  };

  let cursor = 0;
  const segments = bands.map((band) => {
    const segment = { d: arc(cursor, band.upTo / 100), color: band.color };
    cursor = band.upTo / 100;
    return segment;
  });

  const needle = value === null ? null : pointOn(value / 100);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <svg viewBox="0 0 180 110" className="w-full max-w-[220px]" role="img" aria-label={`${label}: ${value ?? 'unknown'}`}>
        {segments.map((segment, i) => (
          <path key={i} d={segment.d} fill="none" stroke={segment.color} strokeWidth={14} strokeLinecap="butt" />
        ))}

        {needle && (
          <>
            <line x1={CX} y1={CY} x2={needle.x} y2={needle.y} stroke="#0f172a" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={CX} cy={CY} r={5} fill="#0f172a" />
          </>
        )}

        <text x={CX} y={CY - 14} textAnchor="middle" className="fill-slate-900 text-[22px] font-bold">
          {value === null ? '—' : `${value}%`}
        </text>
      </svg>

      <div className="-mt-1 flex w-full max-w-[220px] justify-between px-1 text-[10px] text-slate-400">
        <span>0%</span>
        <span className="text-slate-500">{label}</span>
        <span>100%</span>
      </div>
    </div>
  );
}

const DEFAULT_BANDS = [
  { upTo: 50, color: '#ef4444' },
  { upTo: 80, color: '#f59e0b' },
  { upTo: 100, color: '#10b981' },
];
