// ─────────────────────────────────────────────────────────────────────────────
// Shared vocabulary for the Asset Tracking modules.
//
// Colour carries one meaning across all five screens:
//   emerald = healthy / present     amber = degraded / needs watching
//   red     = exception / breached  slate = absence of signal (not a failure)
//   indigo  = in motion / selected
//
// "Offline" is deliberately grey rather than red: an asset we cannot hear is a
// gap in our knowledge, not proof of a problem. Red is reserved for facts.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type {
  AlertLifecycle,
  AlertPriority,
  CustodyState,
  DeviceState,
  LocationPrecision,
  PresenceState,
} from '@access-genie/shared';

export type Tone = 'emerald' | 'amber' | 'red' | 'slate' | 'primary';

const TONE_CHIP: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  primary: 'bg-primary-50 text-primary-700 border-primary-200',
};

const TONE_DOT: Record<Tone, string> = {
  emerald: 'bg-health-good',
  amber: 'bg-health-warning',
  red: 'bg-health-critical',
  slate: 'bg-slate-400',
  primary: 'bg-primary-500',
};

export const TONE_HEX: Record<Tone, string> = {
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  slate: '#94a3b8',
  primary: '#6366f1',
};

export const presenceTone: Record<PresenceState, Tone> = {
  Online: 'emerald',
  Stale: 'amber',
  Offline: 'slate',
  'In Transit': 'primary',
  Missing: 'red',
};

export const custodyTone: Record<CustodyState, Tone> = {
  'In Place': 'emerald',
  'Checked Out': 'primary',
  'In Transit': 'primary',
  Unaccounted: 'red',
};

export const priorityTone: Record<AlertPriority, Tone> = {
  P1: 'red',
  P2: 'amber',
  P3: 'primary',
  P4: 'slate',
};

export const lifecycleTone: Record<AlertLifecycle, Tone> = {
  New: 'red',
  Acknowledged: 'amber',
  Assigned: 'primary',
  'In Progress': 'primary',
  Escalated: 'red',
  Resolved: 'emerald',
  Closed: 'slate',
};

export const deviceTone: Record<DeviceState, Tone> = {
  Healthy: 'emerald',
  Degraded: 'amber',
  Offline: 'red',
  Maintenance: 'primary',
  Unprovisioned: 'slate',
};

/** Coverage / accuracy / battery all read the same way: high is good. */
export function scoreTone(pct: number, warn = 85, bad = 70): Tone {
  if (pct >= warn) return 'emerald';
  if (pct >= bad) return 'amber';
  return 'red';
}

// ── Chip ─────────────────────────────────────────────────────────────────────

export function Chip({
  tone = 'slate', dot = false, children, className, title,
}: {
  tone?: Tone; dot?: boolean; children: React.ReactNode; className?: string; title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        TONE_CHIP[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', TONE_DOT[tone])} />}
      {children}
    </span>
  );
}

export const PresencePill = ({ state }: { state: PresenceState }) => (
  <Chip tone={presenceTone[state]} dot>{state}</Chip>
);

export const PriorityPill = ({ priority }: { priority: AlertPriority }) => (
  <span
    className={cn(
      'inline-flex h-5 min-w-[26px] items-center justify-center rounded px-1.5 text-[10px] font-bold tracking-wide',
      priority === 'P1' ? 'bg-health-critical text-white'
        : priority === 'P2' ? 'bg-health-warning text-white'
          : priority === 'P3' ? 'bg-primary-100 text-primary-700'
            : 'bg-slate-100 text-slate-500',
    )}
  >
    {priority}
  </span>
);

/**
 * How well we know where something is. This chip is the *only* place the
 * platform talks about location quality — the radio behind it is never named.
 */
export function PrecisionChip({ precision, confidence }: { precision: LocationPrecision; confidence?: number }) {
  const label: Record<LocationPrecision, string> = {
    Precise: 'Precise · ±30 cm',
    Room: 'Room-level',
    Site: 'Site-level',
    'Last scan': 'Last scan',
  };
  const bars: Record<LocationPrecision, number> = { Precise: 3, Room: 2, Site: 1, 'Last scan': 1 };
  const tone: Tone = precision === 'Precise' ? 'emerald' : precision === 'Room' ? 'primary' : 'slate';
  return (
    <span
      title={confidence !== undefined ? `${label[precision]} · ${confidence}% confidence` : label[precision]}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium', TONE_CHIP[tone])}
    >
      <span className="flex items-end gap-[1.5px]" aria-hidden>
        {[1, 2, 3].map((b) => (
          <span
            key={b}
            className={cn('w-[2.5px] rounded-sm', b <= bars[precision] ? TONE_DOT[tone] : 'bg-slate-300')}
            style={{ height: `${3 + b * 2}px` }}
          />
        ))}
      </span>
      {label[precision]}
    </span>
  );
}

// ── Meters ───────────────────────────────────────────────────────────────────

export function Meter({
  value, tone, className, height = 'h-1.5',
}: {
  value: number; tone?: Tone; className?: string; height?: string;
}) {
  const t = tone ?? scoreTone(value);
  return (
    <div className={cn('w-full rounded-full bg-slate-200 overflow-hidden', height, className)}>
      <div className={cn('h-full rounded-full transition-all', TONE_DOT[t])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** Expected vs detected, as one bar. The bar *is* the inventory story. */
export function SplitMeter({
  matched, missing, unexpected, total,
}: {
  matched: number; missing: number; unexpected: number; total: number;
}) {
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200" role="img"
      aria-label={`${matched} matched, ${missing} missing, ${unexpected} unexpected of ${total} expected`}>
      <div className="bg-health-good" style={{ width: `${pct(matched)}%` }} />
      <div className="bg-health-critical" style={{ width: `${pct(missing)}%` }} />
      <div className="bg-health-warning" style={{ width: `${pct(unexpected)}%` }} />
    </div>
  );
}

export function BatteryPill({ pct }: { pct?: number }) {
  if (pct === undefined) return <span className="text-xs text-slate-400">Passive</span>;
  const tone = scoreTone(pct, 40, 20);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-3 w-6 items-center rounded-[3px] border border-slate-300 p-[1.5px]">
        <span className={cn('h-full rounded-[1px]', TONE_DOT[tone])} style={{ width: `${Math.max(6, pct)}%` }} />
        <span className="absolute -right-[3px] h-1.5 w-[2px] rounded-r-sm bg-slate-300" />
      </span>
      <span className="text-xs tabular-nums text-slate-600">{pct}%</span>
    </span>
  );
}

// ── Stat tiles ───────────────────────────────────────────────────────────────

export function StatTile({
  label, value, sub, tone = 'slate', meter, href, onClick, active, icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  meter?: number;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  icon?: string;
}) {
  const valueTone =
    tone === 'emerald' ? 'text-emerald-600'
      : tone === 'amber' ? 'text-amber-600'
        : tone === 'red' ? 'text-health-critical'
          : tone === 'primary' ? 'text-primary-600'
            : 'text-slate-900';

  const body = (
    <>
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-xs leading-none" aria-hidden>{icon}</span>}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <div className={cn('mt-1.5 font-heading text-2xl font-semibold tabular-nums leading-tight sm:text-[28px]', valueTone)}>
        {value}
      </div>
      {meter !== undefined ? (
        <Meter value={meter} tone={tone === 'slate' ? undefined : tone} className="mt-2.5" />
      ) : sub ? (
        <div className="mt-1.5 text-xs font-medium text-slate-400">{sub}</div>
      ) : null}
    </>
  );

  const shell = cn(
    'glass-panel p-4 text-left transition-shadow',
    active && 'ring-2 ring-primary-500',
    (href || onClick) && 'hover:shadow-md cursor-pointer',
  );

  if (href) return <Link to={href} className={cn(shell, 'block')}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cn(shell, 'w-full')}>{body}</button>;
  return <div className={shell}>{body}</div>;
}

/** A "what changed today" figure: a number with a direction and a plain label. */
export function DeltaStat({
  label, value, tone = 'slate', hint,
}: {
  label: string; value: number; tone?: Tone; hint?: string;
}) {
  return (
    <div className="flex items-baseline gap-2" title={hint}>
      <span className={cn('font-heading text-lg font-semibold tabular-nums',
        tone === 'red' ? 'text-health-critical' : tone === 'amber' ? 'text-amber-600' : tone === 'emerald' ? 'text-emerald-600' : 'text-slate-900')}>
        {value}
      </span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

// ── Section framing ──────────────────────────────────────────────────────────

export function Panel({
  title, subtitle, actions, children, className, bodyClassName, padded = true,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
}) {
  return (
    <section className={cn('glass-panel flex flex-col overflow-hidden', className)}>
      {/*
        `flex-wrap` on the header matters. `actions` is `shrink-0`, so a wide
        control group used to win every pixel it wanted and squeeze the title
        column to nothing — the heading then wrapped one word per line and the
        controls spilled across it. Wrapping means an over-wide group drops to
        its own row instead, which is the only outcome that stays readable as
        the estate grows and these strips get longer.
      */}
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-slate-200 px-4 py-3">
          <div className="min-w-[12rem] flex-1">
            {title && <h2 className="font-heading text-sm font-semibold text-slate-800">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {/* `max-w-full` is what lets a wrapping control group actually wrap:
              `shrink-0` alone sizes the box to its content, so a long strip ran
              past the panel edge and was clipped by `overflow-hidden`. */}
          {actions && (
            <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5">{actions}</div>
          )}
        </header>
      )}
      <div className={cn('min-h-0 flex-1', padded && 'p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** A quiet horizontal donut for one percentage — used for infrastructure health. */
export function Donut({ value, tone, label, size = 92 }: { value: number; tone?: Tone; label?: string; size?: number }) {
  const t = tone ?? scoreTone(value);
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`${label ?? 'Score'} ${value}%`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={TONE_HEX[t]} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-lg font-semibold tabular-nums text-slate-900">{value}%</span>
        {label && <span className="text-[10px] uppercase tracking-wide text-slate-400">{label}</span>}
      </div>
    </div>
  );
}

/** Horizontal distribution bar with a legend — categories, states, priorities. */
export function BarStrip({ items }: { items: { label: string; value: number; tone: Tone }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        {items.map((i) => (
          <div key={i.label} className={TONE_DOT[i.tone]} style={{ width: `${(i.value / total) * 100}%` }} title={`${i.label}: ${i.value}`} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((i) => (
          <span key={i.label} className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className={cn('h-2 w-2 rounded-full', TONE_DOT[i.tone])} />
            {i.label}
            <span className="font-semibold tabular-nums text-slate-700">{i.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Table helpers — every tracking table uses these, so they all line up ──────

export const th = 'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 select-none whitespace-nowrap';
export const td = 'px-4 py-3 align-middle';

export function TableShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-auto', className)}>
      <table className="w-full text-left text-sm">
        {children}
      </table>
    </div>
  );
}

/** A compact toolbar filter select styled like the Registry's. */
export function FilterSelect({
  value, onChange, options, label,
}: {
  value: string; onChange: (v: string) => void; options: readonly string[]; label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md bg-slate-100 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary-500"
    >
      {options.map((o) => (
        <option key={o} value={o}>{o === 'All' ? label : o}</option>
      ))}
    </select>
  );
}

/** Filter chips with live counts — the counts are the point, not decoration. */
export function ChipFilter<T extends string>({
  options, value, onChange, className,
}: {
  options: { key: T; label: string; count?: number; tone?: Tone }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              on
                ? 'border-primary-600 bg-primary-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {o.tone && !on && <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[o.tone])} />}
            {o.label}
            {o.count !== undefined && (
              <span className={cn('tabular-nums', on ? 'text-primary-100' : 'text-slate-400')}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
