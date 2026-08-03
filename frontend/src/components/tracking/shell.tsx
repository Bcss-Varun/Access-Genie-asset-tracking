// ─────────────────────────────────────────────────────────────────────────────
// Module chrome — built for the Asset Tracking screens and since adopted by any
// module that follows the same shape (Assets ▸ Label Printing uses
// `Tabs`/`useTabs`/`Drawer`/`Field`). The scope helpers below stay
// tracking-specific; the tab, drawer and field primitives are general.
//
// Sidebar rows are questions; tabs are views of one answer. A row exists when an
// operator would go looking for it by name ("where has this been?"); a tab
// exists when it is the same subject seen another way (a map and a list of the
// same assets). Tabs are never used to stack unrelated jobs onto one route.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { TRACKED_FACILITIES } from '@/lib/tracking-data';
import { preferencesApi, usePreferences, usePreferenceMutation } from '@/api/preferences';

// ── Scope ────────────────────────────────────────────────────────────────────

/**
 * The URL is still read through `useSyncExternalStore` rather than an effect:
 * it is a client-only store, the server snapshot is the stable default, and
 * React swaps in the real value during hydration without a cascading re-render.
 * Nothing ever notifies — the value only changes when this hook changes it — so
 * `subscribe` is inert.
 */
const inertStore = () => () => {};

/** A slug is only honoured if it names a facility that exists. */
const known = (slug: string | null | undefined): slug is string =>
  !!slug && (slug === 'all' || TRACKED_FACILITIES.some((f) => f.slug === slug));

function readUrlScope(): string | null {
  const url = new URLSearchParams(window.location.search).get('facility');
  return known(url) ? url : null;
}

/**
 * The facility scope, so that jumping Dashboard → Locate Assets keeps you in
 * the same building.
 *
 * It used to live in `sessionStorage`, which made it per-tab and per-browser:
 * close the tab and you were back to "All facilities", and a site manager who
 * works out of one building re-picked it every morning. It is now part of the
 * user's preferences document, so the choice survives — while an explicit
 * `?facility=` in the URL still wins for the life of that page, which is what
 * makes a pasted link show the sender's building rather than the reader's.
 */
export function useFacilityScope(): [string, (slug: string) => void] {
  const fromUrl = useSyncExternalStore(inertStore, readUrlScope, () => null);
  const { data } = usePreferences();
  const save = usePreferenceMutation(preferencesApi.update);
  const [chosen, setChosen] = useState<string | null>(null);

  const stored = known(data?.activeFacility) ? data.activeFacility : 'all';
  const scope = chosen ?? fromUrl ?? stored;

  const update = useCallback(
    (slug: string) => {
      setChosen(slug);
      // Persisting is best-effort: the scope is a convenience, and a failed
      // write should not stop someone changing what they are looking at.
      save.mutate([{ activeFacility: slug === 'all' ? null : slug }]);

      const p = new URLSearchParams(window.location.search);
      if (slug === 'all') p.delete('facility');
      else p.set('facility', slug);
      const qs = p.toString();
      window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    },
    [save],
  );

  return [scope, update];
}

export function ScopePicker({
  value, onChange, className,
}: {
  value: string; onChange: (v: string) => void; className?: string;
}) {
  return (
    <select
      aria-label="Facility scope"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary-500',
        className,
      )}
    >
      <option value="all">All facilities</option>
      {TRACKED_FACILITIES.map((f) => (
        <option key={f.slug} value={f.slug}>{f.name}</option>
      ))}
    </select>
  );
}

/** "Live · updated 2 minutes ago" — the honesty line under every live screen. */
export function LiveStamp({ label = 'Live' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-health-good opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-health-good" />
      </span>
      {label}
    </span>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

export interface TabDef<T extends string> {
  key: T;
  label: string;
  /** Badge count — shown when non-zero, so quiet tabs stay quiet. */
  count?: number;
  tone?: 'red' | 'amber' | 'slate';
}

/** Tab state that survives a page refresh and travels in a shared link. */
export function useTabs<T extends string>(keys: readonly T[], fallback: T): [T, (t: T) => void] {
  const read = useCallback((): T => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return t && (keys as readonly string[]).includes(t) ? (t as T) : fallback;
  }, [keys, fallback]);

  // Same reasoning as `useFacilityScope`: `?tab=` is a client-only source, so it
  // is restored during hydration instead of through a setState in an effect.
  const restored = useSyncExternalStore(inertStore, read, () => fallback);
  const [chosen, setChosen] = useState<T | null>(null);
  const tab = chosen ?? restored;

  const update = useCallback((t: T) => {
    setChosen(t);
    const p = new URLSearchParams(window.location.search);
    p.set('tab', t);
    window.history.replaceState(null, '', `?${p.toString()}`);
  }, []);

  return [tab, update];
}

export function Tabs<T extends string>({
  tabs, value, onChange, className,
}: {
  tabs: TabDef<T>[]; value: T; onChange: (t: T) => void; className?: string;
}) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-slate-200', className)} role="tablist">
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
              on
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={cn(
                  'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums',
                  t.tone === 'red' ? 'bg-health-critical text-white'
                    : t.tone === 'amber' ? 'bg-amber-100 text-amber-700'
                      : on ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-500',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Drawer ───────────────────────────────────────────────────────────────────

/**
 * Right-hand slide-over used for every "tell me more about this row" moment.
 * Detail is a panel, not a page: you never lose the list you were working.
 */
export function Drawer({
  open, onClose, title, subtitle, eyebrow, footer, children, width = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-[1px] animate-[fadeInFast_0.12s_ease-out]"
      />
      <aside
        className={cn(
          'relative flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl animate-[fadeIn_0.16s_ease-out]',
          width,
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <div className="mb-1 flex flex-wrap items-center gap-1.5">{eyebrow}</div>}
            <h2 className="truncate font-heading text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

/** Label/value row used inside drawers — keeps every detail panel aligned. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-xs font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-slate-800">{children}</dd>
    </div>
  );
}

/** Vertical event rail — alert timelines, journeys, audit history. */
export function TimelineRail({
  items,
}: {
  items: { at: string; title: string; detail?: string; actor?: string; tone?: 'good' | 'warn' | 'bad' | 'info' }[];
}) {
  const dot = { good: 'bg-health-good', warn: 'bg-health-warning', bad: 'bg-health-critical', info: 'bg-primary-500' };
  return (
    <ol className="relative space-y-0 border-l border-slate-200 pl-5">
      {items.map((i, idx) => (
        <li key={idx} className="relative pb-4 last:pb-0">
          <span className={cn('absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white', dot[i.tone ?? 'info'])} />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-sm font-medium text-slate-800">{i.title}</span>
            <span className="text-[11px] tabular-nums text-slate-400">{i.at}</span>
          </div>
          {i.detail && <p className="mt-0.5 text-xs text-slate-500">{i.detail}</p>}
          {i.actor && <p className="mt-0.5 text-[11px] text-slate-400">by {i.actor}</p>}
        </li>
      ))}
    </ol>
  );
}
