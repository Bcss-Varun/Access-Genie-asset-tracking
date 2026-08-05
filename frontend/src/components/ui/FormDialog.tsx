// ─────────────────────────────────────────────────────────────────────────────
// FormDialog — the shell every "create" and "edit" screen is built from.
//
// The product had thirty-odd buttons that opened nothing. Writing thirty forms
// by hand would have produced thirty slightly different dialogs: different
// escape handling, different busy states, a couple that submit twice on a
// double-click. So the shell is written once and the screens supply fields.
//
// Submission goes through the form element rather than the button's onClick, so
// Enter works in every field for free and the browser's own required-field
// handling is available where a screen wants it.
//
// Like ConfirmDialog, callers guard with `{open && …}`: mounted only while open,
// so every open starts clean and there is no reset effect to forget.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

const WIDTHS = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

export function FormDialog({
  title,
  description,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  busy = false,
  disabled = false,
  width = 'md',
  icon,
  footer,
  onSubmit,
  onCancel,
  children,
}: {
  title: string;
  description?: ReactNode;
  submitLabel?: string;
  cancelLabel?: string;
  /** Disables the controls and relabels the submit while the request is out. */
  busy?: boolean;
  /** Blocks submit for a form that is not yet valid. */
  disabled?: boolean;
  width?: keyof typeof WIDTHS;
  icon?: string;
  /** Extra controls on the left of the footer — "Delete", usually. */
  footer?: ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Guarding here rather than only on the button covers Enter-to-submit too.
    if (busy || disabled) return;
    onSubmit();
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !busy && onCancel()} />

      <form
        onSubmit={submit}
        className={`relative my-auto w-full ${WIDTHS[width]} rounded-2xl border border-slate-200 bg-white shadow-2xl`}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-4">
          {icon && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-heading text-base font-bold text-slate-900">{title}</h2>
            {description && <div className="mt-0.5 text-sm leading-relaxed text-slate-500">{description}</div>}
          </div>
        </div>

        <div className="max-h-[calc(100vh-16rem)] space-y-4 overflow-y-auto px-6 py-5">{children}</div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-6 py-3">
          <div>{footer}</div>
          <div className="flex items-center gap-2">
            {/* An empty label hides it: a read-only dialog needs one way out,
                not a Cancel that does the same thing as its Close. */}
            {cancelLabel !== '' && (
              <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
                {cancelLabel}
              </Button>
            )}
            <Button type="submit" disabled={busy || disabled}>
              {busy ? 'Saving…' : submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Fields ───────────────────────────────────────────────────────────────────
// Plain wrappers over the native controls. They exist to keep the label/hint
// markup and focus ring identical everywhere, not to abstract the inputs away:
// callers still pass `value`/`onChange` and read `e.target.value`.

const CONTROL =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:bg-slate-50 disabled:text-slate-400';

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${CONTROL} ${props.className ?? ''}`} />;
}

export function Select({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...props} className={`${CONTROL} ${props.className ?? ''}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Two fields side by side on anything wider than a phone. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

/** A labelled checkbox — laid out as a row rather than stacked like Field. */
export function CheckField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500/30"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}

/** Turn a string union from `shared` into `<Select>` options. */
export function optionsFrom(values: readonly string[]): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: v }));
}

/** Today plus n days, as the `yyyy-mm-dd` a date input wants. */
export function dateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
