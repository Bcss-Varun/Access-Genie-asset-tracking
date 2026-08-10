// ─────────────────────────────────────────────────────────────────────────────
// Drawer — a read-only slide-over for "click a row, see the detail".
//
// FormDialog and ConfirmDialog own the two write flows (create/edit, confirm a
// destructive action); this is the third shape the app needed and did not
// have — inspecting a record without navigating away from the list it came
// from. Same overlay, same escape-to-close, same "mounted only while open"
// convention, so it reads as one family with the other two rather than a new
// pattern.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

const WIDTHS = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
} as const;

export function Drawer({
  title,
  subtitle,
  icon,
  width = 'md',
  footer,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: string;
  width?: keyof typeof WIDTHS;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[95] flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative h-full w-full ${WIDTHS[width]} flex flex-col bg-white shadow-2xl overflow-hidden`}>
        <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-4 shrink-0">
          {icon && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-base font-bold text-slate-900 truncate">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm leading-relaxed text-slate-500">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">{children}</div>

        {footer && <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

/** Definition-list row for a drawer body — label left, value right. */
export function DrawerRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800 text-right">{value ?? '—'}</span>
    </div>
  );
}

export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</h3>
      {children}
    </div>
  );
}

export { Button as DrawerButton };
