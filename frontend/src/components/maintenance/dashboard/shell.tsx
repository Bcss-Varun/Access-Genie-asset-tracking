import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * The furniture the Maintenance Dashboard's sections share.
 *
 * Every panel on that screen is the same object: a titled card that is either
 * showing rows, showing that it has none, or showing that the request failed.
 * Keeping the three states in one place is what stops half the sections
 * rendering a spinner and the other half rendering nothing at all when the
 * estate is empty — which, on a dashboard whose whole premise is "0 is a real
 * answer, not a bug", is the state that matters most.
 */

export function SectionCard({
  title,
  hint,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  hint?: ReactNode;
  /** Usually the "open the real module" link — the section-level drill-down. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('glass-panel flex min-w-0 flex-col overflow-hidden', className)}>
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="font-heading text-sm font-semibold text-slate-900">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
        {action && <div className="shrink-0 text-xs">{action}</div>}
      </header>
      <div className={cn('min-w-0 flex-1', bodyClassName ?? 'p-5')}>{children}</div>
    </section>
  );
}

/** The "→ open the module this section summarises" link in a section header. */
export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-primary-600 hover:text-primary-700 whitespace-nowrap">
      {children} →
    </Link>
  );
}

/**
 * Nothing to show, and why.
 *
 * Deliberately distinguishes an estate with no records from a filter that
 * matched none of them: the first is answered by going and creating some work,
 * the second by widening the filter, and telling someone to do the wrong one is
 * how a working dashboard gets reported as broken.
 */
export function PanelEmpty({ icon = '—', message, hint }: { icon?: string; message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-2 text-2xl opacity-40" aria-hidden>
        {icon}
      </div>
      <p className="text-sm font-medium text-slate-600">{message}</p>
      {hint && <p className="mt-1 max-w-xs text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 p-1" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-slate-200/70" />
          <div className="h-3 flex-1 animate-pulse rounded bg-slate-200/70" />
          <div className="h-3 w-12 shrink-0 animate-pulse rounded bg-slate-200/70" />
        </div>
      ))}
    </div>
  );
}

/**
 * A proportion bar — the facility table's one piece of chart.
 *
 * Scaled against the busiest row rather than against its own total, so the
 * bars compare sites with each other, which is the only comparison the table
 * is for.
 */
export function MiniBar({ value, max, tone }: { value: number; max: number; tone: 'red' | 'amber' | 'primary' | 'emerald' }) {
  const colors = {
    red: 'bg-health-critical',
    amber: 'bg-amber-500',
    primary: 'bg-primary-500',
    emerald: 'bg-emerald-500',
  } as const;

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={cn('h-full rounded-full transition-all', colors[tone])}
        style={{ width: max > 0 ? `${Math.max(value > 0 ? 6 : 0, (value / max) * 100)}%` : '0%' }}
      />
    </div>
  );
}
