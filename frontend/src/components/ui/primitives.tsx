import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/format';
import type { Tone } from '@/lib/tone';

// ── Badge ────────────────────────────────────────────────────────────────────
const BADGE_TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  primary: 'bg-primary-50 text-primary-700 border-primary-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
};

export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────
export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-primary-600 text-white font-bold shrink-0',
        className ?? 'w-8 h-8 text-sm',
      )}
    >
      {initials}
    </span>
  );
}

// ── Kbd ──────────────────────────────────────────────────────────────────────
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">
      {children}
    </kbd>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />;
}

/** Placeholder for a table while its first page loads. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="glass-panel divide-y divide-slate-100">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-3.5">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-1/3' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── KpiCard ──────────────────────────────────────────────────────────────────
export function KpiCard({
  label,
  value,
  sub,
  tone = 'slate',
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  accent?: boolean;
}) {
  const subTone: Record<Tone, string> = {
    slate: 'text-slate-400',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-health-critical',
    primary: 'text-primary-600',
  };

  return (
    <div className={cn('glass-panel p-5', accent && 'ring-1 ring-primary-100')}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1.5 text-2xl sm:text-[28px] font-semibold font-heading text-slate-900 tabular-nums leading-tight">
        {value}
      </div>
      {sub && <div className={cn('mt-1.5 text-xs font-medium', subTone[tone])}>{sub}</div>}
    </div>
  );
}

// ── PageHeader ───────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: { label: string; href?: string }[];
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
            {breadcrumb.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {crumb.href ? (
                  <Link to={crumb.href} className="hover:text-primary-600">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-slate-500">{crumb.label}</span>
                )}
                {i < breadcrumb.length - 1 && <span className="text-slate-300">/</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
  variant = 'empty',
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: 'empty' | 'no-results';
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="text-4xl mb-3">{variant === 'no-results' ? '🔍' : icon}</div>
      <h3 className="text-base font-semibold text-slate-800 font-heading">{title}</h3>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── ErrorState ───────────────────────────────────────────────────────────────
export function ErrorState({
  title = 'Something went wrong',
  description,
  requestId,
  onRetry,
}: {
  title?: string;
  description?: string;
  requestId?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="text-4xl mb-3">⚠️</div>
      <h3 className="text-base font-semibold text-slate-800 font-heading">{title}</h3>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-md">{description}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
        >
          Retry
        </button>
      )}
      {/* The request ID is the thread from this screen to the server log line. */}
      {requestId && <p className="mt-3 text-[11px] text-slate-400 font-mono">trace: {requestId}</p>}
    </div>
  );
}

// ── HealthBar ────────────────────────────────────────────────────────────────
export function HealthBar({ score, className }: { score: number; className?: string }) {
  const color = score >= 75 ? 'bg-health-good' : score >= 45 ? 'bg-health-warning' : 'bg-health-critical';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 w-16 rounded-full bg-slate-200 overflow-hidden shrink-0">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-slate-600">{score}</span>
    </div>
  );
}
