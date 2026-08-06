import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * One card on the dashboard.
 *
 * The frame owns three things every widget would otherwise repeat: the header
 * with its drill-through link, the loading skeleton, and — the reason this is a
 * component rather than a `<div>` — an error boundary.
 *
 * A dashboard composed of a dozen independent widgets is exactly where a render
 * crash is most expensive: `RouteError` is route-level, so before this one bad
 * derivation took the whole screen down and the user lost the eleven widgets
 * that were fine. Now the broken card says so and the rest of the dashboard
 * keeps working.
 */
export function WidgetFrame({
  title,
  subtitle,
  icon,
  href,
  linkLabel = 'Open',
  loading = false,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  /** Where this widget drills through to. Omitted for widgets that own no screen. */
  href?: string;
  linkLabel?: string;
  loading?: boolean;
  className?: string;
  children: ReactNode;
}) {
  // `h-full` so two widgets sharing a grid row end level with each other rather
  // than one floating above a ragged gap.
  return (
    <section className={cn('glass-panel flex h-full flex-col rounded-xl', className)}>
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold font-heading text-slate-800">
            {icon && <span aria-hidden>{icon}</span>}
            <span className="truncate">{title}</span>
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {href && (
          <Link to={href} className="shrink-0 text-xs font-medium text-primary-600 hover:underline">
            {linkLabel} →
          </Link>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-5">
        {loading ? <WidgetSkeleton /> : <WidgetBoundary title={title}>{children}</WidgetBoundary>}
      </div>
    </section>
  );
}

function WidgetSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="h-3 w-2/3 rounded bg-slate-200/70" />
      <div className="h-3 w-1/2 rounded bg-slate-200/70" />
      <div className="h-24 rounded bg-slate-200/50" />
    </div>
  );
}

/** Contains a render crash to the card it happened in. */
export class WidgetBoundary extends Component<{ title: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Left as a console error on purpose: there is no error-reporting sink in
    // this build, and swallowing it entirely would make a broken widget
    // invisible to whoever has to fix it.
    console.error(`Dashboard widget "${this.props.title}" failed to render`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center">
        <span className="text-xl" aria-hidden>
          ⚠️
        </span>
        <p className="text-sm font-medium text-slate-600">This widget could not be drawn</p>
        <p className="text-xs text-slate-400">The rest of the dashboard is unaffected.</p>
      </div>
    );
  }
}

/** What a widget renders when it has nothing to show — calm, not alarming. */
export function WidgetEmpty({ icon = '✓', children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-8 text-center">
      <span className="text-lg text-slate-300" aria-hidden>
        {icon}
      </span>
      <p className="text-sm text-slate-400">{children}</p>
    </div>
  );
}
