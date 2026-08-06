import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Small SVG charts for the dashboard tiles and widgets.
//
// Hand-rolled, like everything else in components/charts — the project carries
// no chart library, and these shapes are simple enough that one would cost more
// than it saves. All of them are pure: no hooks, no measurement, no layout
// effects, so a widget can render one during its first paint.
// ─────────────────────────────────────────────────────────────────────────────

export type ChartTone = 'primary' | 'emerald' | 'amber' | 'red' | 'slate';

export const TONE_HEX: Record<ChartTone, string> = {
  primary: '#6366f1',
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  slate: '#94a3b8',
};

/**
 * The trend line on a KPI tile.
 *
 * Drawn in a fixed viewBox and stretched by CSS, so it fills whatever width the
 * tile gives it without measuring anything. A flat series still draws a line —
 * through the middle rather than along the floor, because "nothing happened" is
 * a fact and a line pinned to the bottom edge reads as "everything collapsed".
 */
export function Sparkline({
  data,
  tone = 'primary',
  className,
}: {
  data: number[];
  tone?: ChartTone;
  className?: string;
}) {
  if (data.length < 2) return null;

  const W = 100;
  const H = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min;

  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = span === 0 ? H / 2 : H - ((value - min) / span) * (H - 4) - 2;
    return { x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const last = points[points.length - 1];

  const stroke = TONE_HEX[tone];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn('h-7 w-full overflow-visible', className)}
      aria-hidden
    >
      <path d={area} fill={stroke} opacity={0.1} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {last && <circle cx={last.x} cy={last.y} r={1.8} fill={stroke} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
