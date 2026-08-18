import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { NEUTRAL_HEX, SEQUENTIAL_HEX, SERIES_HEX, formatCount } from './tokens';

/**
 * The four chart forms this module uses, and nothing else.
 *
 * Each is here because a specific question needs it, not because a dashboard is
 * expected to have variety:
 *
 *   `BarList`      — compare magnitude across named things (categories,
 *                    facilities, work-order types). Horizontal, because the
 *                    labels are words, and one hue, because there is one series.
 *   `SegmentedBar` — part-to-whole for a small closed vocabulary (asset status).
 *   `TrendChart`   — change over time, one or two series on **one** axis.
 *   `DonutChart`   — the mix, when the reader's question is share rather than
 *                    ranking. Used sparingly; a bar list is usually better.
 *
 * Rules that hold across all four: marks are thin, grid lines are recessive,
 * every series is labelled as well as coloured, and a hover readout gives the
 * exact number rather than printing one on every mark. Zero-valued members of a
 * closed vocabulary are drawn, because "no assets are Missing" is a fact worth
 * seeing and a chart that silently omits it reads as though nothing can go
 * missing.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────────────────────

export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('glass-panel flex flex-col p-5', className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/** What a panel shows when the estate genuinely holds nothing to draw. */
export function NoData({ message = 'No data available' }: { message?: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BarList
// ─────────────────────────────────────────────────────────────────────────────

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** A second figure shown after the first — a value beside a count. */
  caption?: string;
}

/**
 * Horizontal bars against the largest value in the set.
 *
 * Horizontal rather than vertical because the labels are words ("Audio Visual",
 * "Hyderabad warehouse") and a vertical axis would either truncate or rotate
 * them. The bar is a proportion of the row, so the reader compares lengths on a
 * common baseline — the one comparison the eye is reliably good at.
 */
export function BarList({
  data,
  color = SEQUENTIAL_HEX,
  format = formatCount,
  emptyMessage,
  onSelect,
  selected,
  max: maxOverride,
}: {
  data: BarDatum[];
  color?: string;
  format?: (n: number) => string;
  emptyMessage?: string;
  onSelect?: (key: string) => void;
  selected?: string | null;
  /** Scale against a fixed maximum instead of the largest row. */
  max?: number;
}) {
  const drawable = data.filter((d) => Number.isFinite(d.value));
  if (drawable.length === 0 || drawable.every((d) => d.value === 0)) {
    return <NoData message={emptyMessage ?? 'Nothing recorded yet'} />;
  }

  const max = Math.max(maxOverride ?? 0, ...drawable.map((d) => d.value), 1);

  return (
    <ul className="space-y-2.5">
      {drawable.map((row) => {
        const share = Math.max(0, (row.value / max) * 100);
        const active = selected === row.key;
        const Row = onSelect ? 'button' : 'div';

        return (
          <li key={row.key}>
            <Row
              {...(onSelect
                ? { type: 'button' as const, onClick: () => onSelect(row.key), 'aria-pressed': active }
                : {})}
              className={cn(
                'w-full text-left',
                onSelect && 'group cursor-pointer rounded-md px-1 -mx-1 py-0.5 hover:bg-slate-50',
                active && 'bg-primary-50/70',
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-xs font-medium text-slate-700">{row.label}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-900">
                  {format(row.value)}
                  {row.caption && <span className="ml-1.5 font-normal text-slate-400">{row.caption}</span>}
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${share}%`, backgroundColor: row.value === 0 ? NEUTRAL_HEX : color }}
                />
              </div>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SegmentedBar
// ─────────────────────────────────────────────────────────────────────────────

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * One bar split into its parts, with a legend beneath.
 *
 * The legend is always present and always carries the count, so identity never
 * depends on hue alone — which matters doubly here, because these are the
 * product's status colours and several of them sit below 3:1 against the page.
 * Segments are separated by a 2px gap in the surface colour so two adjacent
 * fills never touch.
 */
export function SegmentedBar({ segments, total }: { segments: Segment[]; total?: number }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const sum = total ?? segments.reduce((acc, s) => acc + s.value, 0);

  if (sum === 0) return <NoData message="No assets in this selection" />;

  const present = segments.filter((s) => s.value > 0);

  return (
    <div>
      <div className="flex h-7 w-full gap-0.5 overflow-hidden rounded-lg" role="img" aria-label="Assets by status">
        {present.map((segment) => (
          <div
            key={segment.key}
            className="h-full transition-opacity"
            style={{
              width: `${(segment.value / sum) * 100}%`,
              backgroundColor: segment.color,
              opacity: hovered && hovered !== segment.key ? 0.45 : 1,
            }}
            onMouseEnter={() => setHovered(segment.key)}
            onMouseLeave={() => setHovered(null)}
            title={`${segment.label}: ${segment.value}`}
          />
        ))}
      </div>

      {/* Two columns at every width: this panel is a third of the row on a wide
          screen, and a third column truncates "Under maintenance" to "Under…",
          which defeats the point of labelling the segments at all. */}
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
        {segments.map((segment) => (
          <li
            key={segment.key}
            className="flex items-center gap-2"
            onMouseEnter={() => setHovered(segment.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: segment.value === 0 ? NEUTRAL_HEX : segment.color }}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{segment.label}</span>
            <span
              className={cn(
                'shrink-0 text-xs font-semibold tabular-nums',
                segment.value === 0 ? 'text-slate-300' : 'text-slate-900',
              )}
            >
              {segment.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TrendChart
// ─────────────────────────────────────────────────────────────────────────────

export interface TrendSeries {
  key: string;
  label: string;
  points: number[];
  /** Soft fill under the line. One at most, or the chart turns to mud. */
  fill?: boolean;
}

/**
 * One or two series against a shared axis.
 *
 * Deliberately never a dual axis. Two measures on different scales are two
 * charts; the pairs drawn here (raised against completed, assets added against
 * months) are counts against counts, so one scale is the honest one. The axis
 * starts at zero for the same reason.
 *
 * The hover layer is a crosshair with a readout rather than a number printed on
 * every point, so the chart stays a shape and the exact figures are one pointer
 * away.
 */
export function TrendChart({
  labels,
  series,
  format = formatCount,
  emptyMessage,
  height = 210,
}: {
  labels: string[];
  series: TrendSeries[];
  format?: (n: number) => string;
  emptyMessage?: string;
  height?: number;
}) {
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  if (labels.length === 0 || series.length === 0) {
    return <NoData message={emptyMessage ?? 'No activity in this period'} />;
  }

  const W = 760;
  const H = 260;
  const pad = { top: 16, right: 16, bottom: 30, left: 44 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const max = Math.max(1, ...series.flatMap((s) => s.points));
  // A tidy ceiling so the top gridline is a number a reader recognises.
  const ceiling = niceCeiling(max);
  const x = (i: number) => pad.left + (labels.length === 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - (v / ceiling) * plotH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(ceiling * f));
  // Enough labels to orient without collision — every nth, plus the last.
  const step = Math.max(1, Math.ceil(labels.length / 8));

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ height }}
        className="w-full"
        role="img"
        aria-label={series.map((s) => s.label).join(' and ')}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_HEX[0]} stopOpacity={0.22} />
            <stop offset="100%" stopColor={SERIES_HEX[0]} stopOpacity={0} />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={pad.left + plotW}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-slate-200"
              strokeWidth={1}
            />
            <text x={pad.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400" fontSize={10}>
              {format(tick)}
            </text>
          </g>
        ))}

        {series.map((s, index) => {
          const color = SERIES_HEX[index % SERIES_HEX.length] as string;
          const path = s.points.map((value, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(value)}`).join(' ');

          return (
            <g key={s.key}>
              {s.fill && labels.length > 1 && (
                <path
                  d={`${path} L ${x(labels.length - 1)} ${pad.top + plotH} L ${x(0)} ${pad.top + plotH} Z`}
                  fill={`url(#${gradientId})`}
                />
              )}
              <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {/* A single bucket has no line to read, so it gets a dot. */}
              {labels.length === 1 && <circle cx={x(0)} cy={y(s.points[0] ?? 0)} r={4} fill={color} />}
            </g>
          );
        })}

        {hovered !== null && (
          <g>
            <line
              x1={x(hovered)}
              x2={x(hovered)}
              y1={pad.top}
              y2={pad.top + plotH}
              className="stroke-slate-300"
              strokeDasharray="3 3"
            />
            {series.map((s, index) => (
              <circle
                key={s.key}
                cx={x(hovered)}
                cy={y(s.points[hovered] ?? 0)}
                r={4}
                fill={SERIES_HEX[index % SERIES_HEX.length]}
                // A 2px surface ring keeps overlapping markers separable.
                stroke="#ffffff"
                strokeWidth={2}
              />
            ))}
          </g>
        )}

        {labels.map((label, i) => (
          <g key={`${label}-${i}`}>
            {(i % step === 0 || i === labels.length - 1) && (
              <text x={x(i)} y={H - 10} textAnchor="middle" className="fill-slate-400" fontSize={10}>
                {label}
              </text>
            )}
            {/* Hit targets are wider than the marks they select. */}
            <rect
              x={x(i) - plotW / Math.max(1, labels.length) / 2}
              y={pad.top}
              width={Math.max(8, plotW / Math.max(1, labels.length))}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
            />
          </g>
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
        {/* A legend for two series; one series is named by the panel title. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.length > 1 &&
            series.map((s, index) => (
              <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="h-0.5 w-3.5 rounded-full" style={{ backgroundColor: SERIES_HEX[index % SERIES_HEX.length] }} />
                {s.label}
              </span>
            ))}
        </div>
        {hovered !== null && (
          <p className="text-[11px] tabular-nums text-slate-600">
            <span className="font-medium text-slate-800">{labels[hovered]}</span>
            {series.map((s) => (
              <span key={s.key} className="ml-3">
                {s.label} <span className="font-semibold">{format(s.points[hovered] ?? 0)}</span>
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

/** Round an axis maximum up to something a person would have chosen. */
function niceCeiling(max: number): number {
  if (max <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / (magnitude / 2)) * (magnitude / 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// DonutChart
// ─────────────────────────────────────────────────────────────────────────────

export interface DonutDatum {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * A ring with a legend, for when the question is share rather than ranking.
 *
 * Drawn as stroked arcs on one circle rather than filled wedge paths: a
 * stroke's length is `stroke-dasharray`, so each slice is two numbers and there
 * is no arc-flag trigonometry to get wrong at the halfway point.
 */
export function DonutChart({
  data,
  totalLabel,
  emptyMessage,
}: {
  data: DonutDatum[];
  totalLabel: string;
  emptyMessage?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) return <NoData message={emptyMessage ?? 'Nothing recorded yet'} />;

  const R = 56;
  const circumference = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 150 150" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label={totalLabel}>
        <circle cx={75} cy={75} r={R} fill="none" className="stroke-slate-100" strokeWidth={16} />
        {data
          .filter((d) => d.value > 0)
          .map((slice) => {
            const length = (slice.value / total) * circumference;
            const dash = `${Math.max(0, length - 2)} ${circumference - Math.max(0, length - 2)}`;
            const element = (
              <circle
                key={slice.key}
                cx={75}
                cy={75}
                r={R}
                fill="none"
                stroke={slice.color}
                strokeWidth={16}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                opacity={hovered && hovered !== slice.key ? 0.4 : 1}
                onMouseEnter={() => setHovered(slice.key)}
                onMouseLeave={() => setHovered(null)}
              />
            );
            offset += length;
            return element;
          })}
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((slice) => (
          <li
            key={slice.key}
            className="flex items-center gap-2"
            onMouseEnter={() => setHovered(slice.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }} />
            <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{slice.label}</span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-900">{slice.value}</span>
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-slate-400">
              {Math.round((slice.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
