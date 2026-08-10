import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, EmptyState, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { templatesApi } from '@/api/registration';
import { categoryEmoji } from '@/lib/asset-categories';

/**
 * The templates people register against.
 *
 * Archived ones are shown rather than hidden: an asset keeps a reference to the
 * template that produced it, so "why does this record have a MAC address field"
 * has to stay answerable after someone retires the template.
 */
export default function TemplatesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['templates', 'all'],
    queryFn: () => templatesApi.list({ status: 'all' }),
  });

  const templates = data?.items ?? [];
  const active = templates.filter((t) => t.status === 'active');
  const archived = templates.filter((t) => t.status === 'archived');

  const archive = async (id: string, name: string) => {
    try {
      await templatesApi.archive(id);
      await qc.invalidateQueries({ queryKey: ['templates'] });
      toast({ title: `“${name}” archived`, description: 'Existing assets keep their reference to it.', tone: 'success' });
    } catch {
      toast({ title: 'Could not archive that template', tone: 'error' });
    }
  };

  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader
        title="Asset Templates"
        subtitle="Decide once which fields a kind of asset needs, and every registration of that kind gets shorter."
        breadcrumb={[{ label: 'Asset Registry', href: '/assets' }, { label: 'Templates' }]}
        actions={
          <Link to="/assets/templates/new">
            <Button>+ New template</Button>
          </Link>
        }
      />

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading templates…</div>
      ) : templates.length === 0 ? (
        <EmptyState
          variant="empty"
          title="No templates yet"
          description="A template narrows the add-asset form to the fields that kind of asset actually needs, and lets you insist on the ones that matter. Registering a laptop stops being a scroll through everything the system can store."
          action={
            <Link to="/assets/templates/new">
              <Button>Create your first template</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((t) => (
              <li key={t.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="text-2xl leading-none">{t.icon || categoryEmoji(t.category)}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-slate-900">{t.name}</h3>
                    {t.description && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{t.description}</p>}
                  </div>
                </div>

                <dl className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  <div><dt className="sr-only">Category</dt><dd>{t.category}</dd></div>
                  <span aria-hidden>·</span>
                  <div>
                    <dt className="sr-only">Fields</dt>
                    <dd>{t.fields.length} fields, {t.fields.filter((f) => f.required).length} required</dd>
                  </div>
                  {t.usageCount > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <div><dt className="sr-only">Usage</dt><dd>used {t.usageCount}×</dd></div>
                    </>
                  )}
                </dl>

                <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
                  <Link to={`/assets/new?source=template&templateId=${t.id}`} className="text-xs font-medium text-primary-600 hover:underline">
                    Use it →
                  </Link>
                  <Link to={`/assets/templates/${t.id}`} className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-800">
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => void archive(t.id, t.name)}
                    className="text-xs font-medium text-slate-400 hover:text-health-critical"
                  >
                    Archive
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {archived.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Archived</h2>
              <ul className="space-y-2">
                {archived.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-2.5">
                    <span aria-hidden className="opacity-50">{t.icon || categoryEmoji(t.category)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-500">{t.name}</span>
                    <Badge tone="slate">Archived</Badge>
                    <span className="text-[11px] text-slate-400">used {t.usageCount}×</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-400">
                Archived templates cannot be used for new assets, but the assets they created still point at them.
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
