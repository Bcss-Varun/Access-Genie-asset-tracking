import type { InspectionTemplate } from '@access-genie/shared';
import { EmptyState, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { QUESTION_EMOJI, TYPE_EMOJI } from './tokens';

/**
 * Inspection Templates — the reusable library.
 *
 * Cards rather than a table: a template is read for *what it checks*, and the
 * checkpoint mix is the thing worth seeing at a glance. A row of columns would
 * put the count in a cell and hide the composition.
 */
export function TemplatesList({
  templates,
  loading,
  onEdit,
  onSchedule,
  onCreate,
  onRetire,
  filtersActive,
}: {
  templates: InspectionTemplate[];
  loading: boolean;
  onEdit: (template: InspectionTemplate) => void;
  onSchedule: (template: InspectionTemplate) => void;
  onCreate: () => void;
  onRetire: (template: InspectionTemplate) => void;
  filtersActive: boolean;
}) {
  if (loading && templates.length === 0) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-52 w-full" />
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="glass-panel">
        <EmptyState
          variant={filtersActive ? 'no-results' : 'empty'}
          icon="📋"
          title={filtersActive ? 'No templates match' : 'No inspection templates yet'}
          description={
            filtersActive
              ? 'Clear the search to see the rest of the library.'
              : 'A template is the reusable body of checks — build one, then schedule it against the assets it applies to.'
          }
          action={
            filtersActive ? undefined : (
              <button
                type="button"
                onClick={onCreate}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
              >
                Create a template
              </button>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {templates.map((template) => {
        // The mix of question types, in the order they were declared — this is
        // what tells you at a glance whether a template tests or just records.
        const mix = template.checkpoints.reduce<Record<string, number>>((acc, checkpoint) => {
          acc[checkpoint.type] = (acc[checkpoint.type] ?? 0) + 1;
          return acc;
        }, {});

        const scopeParts = [
          template.scope.assetIds.length > 0 ? `${template.scope.assetIds.length} asset${template.scope.assetIds.length === 1 ? '' : 's'}` : null,
          template.scope.assetCategories.length > 0 ? template.scope.assetCategories.join(', ') : null,
          template.scope.facilityIds.length > 0
            ? `${template.scope.facilityIds.length} facilit${template.scope.facilityIds.length === 1 ? 'y' : 'ies'}`
            : null,
        ].filter(Boolean);

        return (
          <article
            key={template.id}
            className={cn('glass-panel flex flex-col p-5 transition-shadow hover:shadow-md', !template.active && 'opacity-70')}
          >
            <header className="flex items-start gap-3">
              <span className="text-2xl leading-none" aria-hidden>
                {template.icon}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-heading text-sm font-semibold text-slate-900">{template.name}</h3>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {TYPE_EMOJI[template.type]} {template.type} · {template.category} · v{template.version}
                  {!template.active && ' · retired'}
                </p>
              </div>
            </header>

            {template.description && <p className="mt-3 line-clamp-2 text-xs text-slate-500">{template.description}</p>}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(mix).map(([type, count]) => (
                <span
                  key={type}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                >
                  {QUESTION_EMOJI[type as keyof typeof QUESTION_EMOJI]} {count} {type}
                </span>
              ))}
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
              {[
                ['Checks', template.checkpoints.length],
                ['Used', template.usageCount ?? 0],
                ['Est.', `${template.estimatedMinutes}m`],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className="font-heading text-base font-bold tabular-nums text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 truncate text-[11px] text-slate-400">
              Applies to: {scopeParts.length > 0 ? scopeParts.join(' · ') : 'any asset'}
            </p>

            <footer className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => onSchedule(template)}
                disabled={!template.active}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-40"
              >
                Schedule
              </button>
              <button
                type="button"
                onClick={() => onEdit(template)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onRetire(template)}
                className="ml-auto text-xs font-medium text-slate-400 hover:text-health-critical"
              >
                {/* A template with history behind it is retired, not deleted —
                    the label says which will happen before it happens. */}
                {(template.usageCount ?? 0) > 0 ? 'Retire' : 'Delete'}
              </button>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
