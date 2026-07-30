'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Shared field + card primitives for the onboarding flow.
// Same visual language as the rest of the app (glass panels, hairline borders).
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils';

export const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5';
export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 transition-colors';

export function Field({
  label, hint, error, required, htmlFor, children, className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={htmlFor} className={labelCls}>
        {label}
        {required && <span className="ml-0.5 text-health-critical">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-health-critical">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>
      )}
    </div>
  );
}

/**
 * A Configure card. Every one of these is skippable and resumable — the status
 * chip tells you where it stands without ever blocking the way forward.
 */
export function ConfigCard({
  step, title, description, status, required, children, actions,
}: {
  step: number;
  title: string;
  description: string;
  status: 'met' | 'pending' | 'open';
  required: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-xl p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
              status === 'met' ? 'bg-emerald-100 text-emerald-700'
                : status === 'pending' ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-500',
            )}
          >
            {status === 'met' ? '✓' : step}
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-base font-bold text-slate-900">
              {title}
              {!required && (
                <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  optional for this class
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">{description}</p>
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Inline note — used for inheritance hints and derived-value callouts. */
export function Note({
  tone = 'slate', icon, children,
}: {
  tone?: 'slate' | 'primary' | 'amber' | 'emerald' | 'red';
  icon?: string;
  children: React.ReactNode;
}) {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    primary: 'border-primary-100 bg-primary-50 text-primary-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  }[tone];
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed', tones)}>
      {icon && <span className="text-sm leading-none">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A read-only derived value. Deliberately not an input (docs/21 §21.2 P3). */
export function Derived({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={cn('mt-0.5 text-sm font-semibold', tone ?? 'text-slate-800')}>{value}</div>
    </div>
  );
}

/** Segmented choice — used wherever a decision has 2–4 named options. */
export function Choice<T extends string>({
  options, value, onChange, name,
}: {
  options: { value: T; label: string; blurb?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div className={cn('grid gap-2', options.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')} role="radiogroup" aria-label={name}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-lg border px-3 py-2.5 text-left transition-colors',
              on ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500/25' : 'border-slate-200 hover:bg-slate-50',
            )}
          >
            <span className={cn('block text-sm font-semibold', on ? 'text-primary-700' : 'text-slate-800')}>
              {o.label}
            </span>
            {o.blurb && <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{o.blurb}</span>}
          </button>
        );
      })}
    </div>
  );
}
