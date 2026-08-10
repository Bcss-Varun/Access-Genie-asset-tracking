import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/primitives';
import { templatesApi } from '@/api/registration';
import { categoryEmoji } from '@/lib/asset-categories';
import { cn } from '@/lib/utils';

/**
 * Pick the template to register against.
 *
 * Ordered by how much each one is used, because the template someone reaches
 * for most is almost always the one they want next, and a list sorted
 * alphabetically buries it under whatever happens to start with "A".
 */
export function TemplateChooser({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['templates', 'active'],
    queryFn: () => templatesApi.list({ status: 'active' }),
  });

  const templates = (data?.items ?? []).filter((t) =>
    q.trim() ? `${t.name} ${t.description} ${t.category}`.toLowerCase().includes(q.trim().toLowerCase()) : true,
  );

  if (isLoading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading templates…</div>;
  }
  if (isError) {
    return (
      <div className="rounded-xl border border-health-critical/30 bg-red-50 p-6 text-sm text-slate-700">
        Templates could not be loaded.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-semibold text-slate-900">Which template?</h2>
          <p className="mt-1 text-sm text-slate-500">
            Each one asks only the fields that kind of asset actually needs.
          </p>
        </div>
        <Link to="/assets/templates">
          <Button variant="outline" size="sm">Manage templates</Button>
        </Link>
      </div>

      {(data?.items?.length ?? 0) > 0 && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search templates…"
          aria-label="Search templates"
          className="mt-4 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
        />
      )}

      {templates.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            variant="no-results"
            title={data?.items?.length ? 'No template matches that' : 'No templates yet'}
            description={
              data?.items?.length
                ? 'Try a different search.'
                : 'A template decides which fields a kind of asset is asked for, and which of them are mandatory. Create one and every registration of that kind gets shorter.'
            }
            action={
              <Link to="/assets/templates/new">
                <Button>Create a template</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {templates.map((t) => {
            const required = t.fields.filter((f) => f.required).length;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onPick(t.id)}
                  className={cn(
                    'flex w-full flex-col rounded-xl border border-slate-200 p-4 text-left transition-colors',
                    'hover:border-primary-300 hover:bg-primary-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                  )}
                >
                  <span className="flex items-start gap-3">
                    <span aria-hidden className="text-2xl leading-none">
                      {t.icon || categoryEmoji(t.category)}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">{t.name}</span>
                      {t.description && (
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{t.description}</span>
                      )}
                    </span>
                  </span>
                  <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    <span>{t.category}</span>
                    <span>·</span>
                    <span>
                      {t.fields.length} field{t.fields.length === 1 ? '' : 's'}, {required} required
                    </span>
                    {t.usageCount > 0 && (
                      <>
                        <span>·</span>
                        <span>used {t.usageCount}×</span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
