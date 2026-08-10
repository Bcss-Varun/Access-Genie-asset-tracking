import { cn } from '@/lib/utils';
import type { FormField } from '@/api/registration';

/**
 * One field, rendered from its catalogue definition.
 *
 * Every input in the add-asset flow goes through here. The server decides what
 * a field *is* — its type, its limits, whether it is required — so there is no
 * per-field JSX anywhere in the flow, and a field added to the catalogue
 * appears in the form with no frontend change at all.
 */

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:bg-slate-50 disabled:text-slate-500';

export type OptionSource = (field: FormField) => { value: string; label: string }[] | undefined;

export function FieldInput({
  field,
  value,
  error,
  onChange,
  optionsFor,
  autoFocus,
}: {
  field: FormField;
  value: string | number | boolean | null | undefined;
  error?: string;
  onChange: (value: string | number | boolean | null) => void;
  /** Fills dropdowns whose options come from data rather than the catalogue. */
  optionsFor?: OptionSource;
  autoFocus?: boolean;
}) {
  const id = `f-${field.key}`;
  const invalid = !!error;
  const describedBy = error ? `${id}-err` : field.help ? `${id}-help` : undefined;

  // A boolean is a switch, and a switch carries its own label — rendering it
  // through the shared label/description frame would read as a stray checkbox.
  if (field.type === 'boolean') {
    const on = value === true;
    return (
      <div className="sm:col-span-2">
        <label
          htmlFor={id}
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 transition-colors hover:bg-slate-50"
        >
          <input
            id={id}
            type="checkbox"
            checked={on}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-800">{field.label}</span>
            {field.help && <span className="mt-0.5 block text-xs text-slate-500">{field.help}</span>}
          </span>
        </label>
        {error && (
          <p id={`${id}-err`} className="mt-1 text-xs font-medium text-health-critical">
            {error}
          </p>
        )}
      </div>
    );
  }

  const options = field.type === 'select'
    ? optionsFor?.(field) ?? field.options?.map((o) => ({ value: o, label: o }))
    : undefined;

  return (
    <div className={cn(field.type === 'textarea' && 'sm:col-span-2')}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {field.label}
        {field.required && <span className="ml-0.5 text-health-critical">*</span>}
        {field.unit && <span className="ml-1 font-normal text-slate-400">({field.unit})</span>}
      </label>

      {field.type === 'select' ? (
        <select
          id={id}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || null)}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(inputCls, invalid && 'border-health-critical focus:ring-red-500/20')}
        >
          <option value="">Select…</option>
          {(options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          id={id}
          rows={3}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(inputCls, 'resize-y', invalid && 'border-health-critical focus:ring-red-500/20')}
        />
      ) : (
        <input
          id={id}
          autoFocus={autoFocus}
          type={field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'money' ? 'number' : 'text'}
          inputMode={field.type === 'number' || field.type === 'money' ? 'decimal' : undefined}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (field.type === 'number' || field.type === 'money') onChange(raw === '' ? null : Number(raw));
            else onChange(raw);
          }}
          maxLength={field.type === 'text' ? field.maxLength : undefined}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(
            inputCls,
            // Serials, tags and MAC addresses are read character by character
            // when someone is checking one against a sticker.
            field.identity && 'font-mono',
            invalid && 'border-health-critical focus:ring-red-500/20',
          )}
        />
      )}

      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs font-medium text-health-critical">
          {error}
        </p>
      ) : field.help ? (
        <p id={`${id}-help`} className="mt-1 text-xs text-slate-400">
          {field.help}
        </p>
      ) : null}
    </div>
  );
}
