import { cn } from '@/lib/utils';

/**
 * One question at a time.
 *
 * Both the add-asset flow and the template editor are long forms made of short
 * sections, and both were originally one scrolling page. That page was honest
 * about how much there is to fill in, and that was the problem: the length was
 * the first thing you saw, and it read as work whether or not any of it was
 * required.
 *
 * A step per section removes the scroll and puts the count somewhere useful —
 * "3 of 8" tells you how far there is to go without showing you all of it. The
 * rail stays clickable so nobody is trapped in a sequence they can already see
 * the end of.
 */

export interface WizardStep {
  key: string;
  label: string;
  description?: string;
  /** Renders a muted "Optional" chip and lets Next pass unconditionally. */
  optional?: boolean;
  /** Green when satisfied, red when it has an error the user should see. */
  state?: 'done' | 'error' | 'todo';
  /** Small counter under the label, e.g. "2 of 7 filled". */
  hint?: string;
}

export function WizardRail({
  steps,
  current,
  onGo,
  footnote,
}: {
  steps: WizardStep[];
  current: number;
  onGo: (index: number) => void;
  footnote?: React.ReactNode;
}) {
  return (
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <ol className="space-y-0.5">
        {steps.map((s, i) => {
          const active = i === current;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onGo(i)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                  active ? 'bg-primary-50' : 'hover:bg-slate-100',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold',
                    s.state === 'error'
                      ? 'border-health-critical bg-red-50 text-health-critical'
                      : s.state === 'done'
                        ? 'border-health-good bg-emerald-50 text-health-good'
                        : active
                          ? 'border-primary-500 bg-white text-primary-600'
                          : 'border-slate-300 bg-white text-slate-400',
                  )}
                >
                  {s.state === 'error' ? '!' : s.state === 'done' ? '✓' : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-sm',
                      active ? 'font-semibold text-primary-800' : 'font-medium text-slate-700',
                    )}
                  >
                    {s.label}
                  </span>
                  {s.hint && <span className="block truncate text-[11px] text-slate-400">{s.hint}</span>}
                </span>
                {s.optional && (
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-300">Opt</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {footnote && (
        <div className="mt-4 hidden rounded-lg border border-slate-200 bg-slate-50/70 p-3 lg:block">{footnote}</div>
      )}
    </aside>
  );
}

/** The panel for the current step, with its own heading and nav. */
export function WizardPanel({
  step,
  index,
  total,
  children,
  onBack,
  onNext,
  actions,
  status,
  variant = 'panel',
}: {
  step: WizardStep;
  index: number;
  total: number;
  children: React.ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  /** Replaces Next on the final step — Register, Create template, and so on. */
  actions?: React.ReactNode;
  status?: React.ReactNode;
  /**
   * `panel` puts the step's content inside one card — right for a form, where
   * the fields are one thought. `open` gives the heading its own card and lets
   * the content supply its own, which is what the review step needs: seven
   * sections stacked inside a single card read as one undifferentiated list.
   */
  variant?: 'panel' | 'open';
}) {
  const heading = (
    <header className={variant === 'open' ? 'px-6 py-4' : 'border-b border-slate-100 px-6 py-4'}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Step {index + 1} of {total}
        {step.optional && ' · optional'}
      </p>
      <h2 className="mt-1 font-heading text-lg font-semibold text-slate-900">{step.label}</h2>
      {step.description && <p className="mt-1 text-sm text-slate-500">{step.description}</p>}
    </header>
  );

  return (
    <div className="min-w-0">
      {variant === 'open' ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white">{heading}</section>
          <div className="mt-4">{children}</div>
        </>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white">
          {heading}
          <div className="px-6 py-6">{children}</div>
        </section>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="min-w-0 flex-1 text-sm">{status}</div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            ← Back
          </button>
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            Next →
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}
