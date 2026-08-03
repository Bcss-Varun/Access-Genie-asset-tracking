// ─────────────────────────────────────────────────────────────────────────────
// ConfirmDialog — the gate in front of a destructive action.
//
// Deleting an asset is not undoable from the UI, so it does not happen on a
// single click. This is deliberately plainer than a toast-with-undo: an undo
// window works for things that can be put back, and a deleted asset cannot be —
// the API removes the document and retires it from the tracking graph.
//
// Mounted only while open (callers guard with `{open && …}`), so every open
// starts from a clean state and there is no reset effect to forget.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Disables both buttons and relabels the confirm while the request is out. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Escape closes, as it does for every other dialog. Initial focus goes to
  // Cancel (via `autoFocus` below), not Confirm: the safe option should be the
  // one a stray Enter press hits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* A misclick on the backdrop cancels — never confirms. */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !busy && onCancel()} />

      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-lg">
              ⚠️
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-base font-bold text-slate-900">{title}</h2>
              <div className="mt-1 text-sm leading-relaxed text-slate-500">{description}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3">
          <Button autoFocus variant="outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
