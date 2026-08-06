import { useState } from 'react';
import type { DashboardLayout, DashboardSummary, KpiId, ModuleKey, RoleId } from '@access-genie/shared';
import { preferencesApi, usePreferenceMutation } from '@/api/preferences';
import { useToast } from '@/components/providers/ToastProvider';
import { KPI_META, WIDGETS_BY_ID } from '@/lib/dashboard/registry';
import { availableKpis, availableWidgets, defaultLayoutFor, reorder } from '@/lib/dashboard/resolve';
import { cn } from '@/lib/utils';

/**
 * Rearranging the dashboard.
 *
 * Buttons rather than drag-and-drop: the project carries no DnD dependency, and
 * a hand-rolled pointer implementation would be a lot of fragile code to move a
 * card up one place — which is what people actually do. Move, remove, add,
 * reset, and the ordering is the reading order on the page.
 *
 * Edits are drafted locally and written in one patch on save, so closing the
 * panel without saving changes nothing. The layout lives on the user's
 * preferences document, which means it follows them to another machine — the
 * same reason the theme and saved views moved off `localStorage`.
 */
export function CustomizePanel({
  open,
  onClose,
  layout,
  roleId,
  modules,
  summary,
}: {
  open: boolean;
  onClose: () => void;
  layout: DashboardLayout;
  roleId: RoleId;
  modules: ModuleKey[];
  summary: DashboardSummary | undefined;
}) {
  const [draft, setDraft] = useState<DashboardLayout>(layout);
  const save = usePreferenceMutation(preferencesApi.update);
  const { toast } = useToast();

  if (!open) return null;

  const commit = (next: DashboardLayout | null) => {
    save.mutate([{ dashboard: next }], {
      onSuccess: () => {
        toast({
          title: next ? 'Dashboard saved' : 'Dashboard reset',
          description: next ? 'Your layout will follow you to any device.' : 'Back to the default for your role.',
          tone: 'success',
        });
        onClose();
      },
      onError: (err: Error) => toast({ title: 'Could not save the layout', description: err.message, tone: 'error' }),
    });
  };

  const move = (key: 'kpis' | 'main' | 'rail', from: number, to: number) =>
    setDraft((d) => ({ ...d, [key]: reorder(d[key], from, to) }));

  const remove = (key: 'kpis' | 'main' | 'rail', id: string) =>
    setDraft((d) => ({ ...d, [key]: d[key].filter((x) => x !== id) }));

  const add = (key: 'kpis' | 'main' | 'rail', id: string) =>
    setDraft((d) => ({ ...d, [key]: [...d[key], id] }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Customize dashboard">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />

      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-heading text-lg font-bold text-slate-900">Customize dashboard</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Yours alone — it follows your account, not this browser.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <Group
            title="Headline figures"
            hint="Up to six read comfortably on one row."
            addLabel="Add a figure"
            entries={draft.kpis
              .filter((id): id is KpiId => id in KPI_META)
              .map((id) => ({ id, label: KPI_META[id].label }))}
            onMove={(from, to) => move('kpis', from, to)}
            onRemove={(id) => remove('kpis', id)}
            options={availableKpis(draft, modules, summary)}
            onAdd={(id) => add('kpis', id)}
          />

          <Group
            title="Main column"
            hint="The wide column — charts, tables and queues."
            addLabel="Add a widget"
            entries={draft.main.map((id) => ({ id, label: WIDGETS_BY_ID.get(id)?.title ?? id }))}
            onMove={(from, to) => move('main', from, to)}
            onRemove={(id) => remove('main', id)}
            options={availableWidgets(draft, modules, 'main').map((w) => ({ id: w.id, label: w.title, description: w.description }))}
            onAdd={(id) => add('main', id)}
          />

          <Group
            title="Side rail"
            hint="Narrow cards — insights, your work, activity."
            addLabel="Add a card"
            entries={draft.rail.map((id) => ({ id, label: WIDGETS_BY_ID.get(id)?.title ?? id }))}
            onMove={(from, to) => move('rail', from, to)}
            onRemove={(id) => remove('rail', id)}
            options={availableWidgets(draft, modules, 'rail').map((w) => ({ id: w.id, label: w.title, description: w.description }))}
            onAdd={(id) => add('rail', id)}
          />
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={() => {
              setDraft(defaultLayoutFor(roleId));
              commit(null);
            }}
            className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            Reset to role default
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => commit(draft)}
              disabled={save.isPending}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {save.isPending ? 'Saving…' : 'Save layout'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Group({
  title,
  hint,
  addLabel,
  entries,
  onMove,
  onRemove,
  options,
  onAdd,
}: {
  title: string;
  hint: string;
  addLabel: string;
  entries: { id: string; label: string }[];
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  options: { id: string; label: string; description?: string }[];
  onAdd: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-400">{hint}</p>

      <ul className="mt-3 space-y-1.5">
        {entries.length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
            Nothing here — this part of the dashboard will be empty.
          </li>
        )}
        {entries.map((entry, i) => (
          <li key={entry.id} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{entry.label}</span>
            <IconButton label={`Move ${entry.label} up`} disabled={i === 0} onClick={() => onMove(i, i - 1)}>
              ↑
            </IconButton>
            <IconButton
              label={`Move ${entry.label} down`}
              disabled={i === entries.length - 1}
              onClick={() => onMove(i, i + 1)}
            >
              ↓
            </IconButton>
            <IconButton label={`Remove ${entry.label}`} onClick={() => onRemove(entry.id)}>
              ✕
            </IconButton>
          </li>
        ))}
      </ul>

      {options.length > 0 &&
        (adding ? (
          <ul className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
            {options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(option.id);
                    setAdding(false);
                  }}
                  className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white"
                >
                  <span className="block text-sm font-medium text-slate-700">{option.label}</span>
                  {option.description && <span className="block text-xs text-slate-400">{option.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 text-xs font-medium text-primary-600 hover:underline"
          >
            + {addLabel}
          </button>
        ))}
    </section>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'shrink-0 rounded px-1.5 py-0.5 text-xs transition-colors',
        disabled ? 'text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
      )}
    >
      {children}
    </button>
  );
}
