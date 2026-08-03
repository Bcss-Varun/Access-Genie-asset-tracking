import { Link } from 'react-router-dom';
import { mockTaxonomy, mockAssets } from '@/lib/mock-data';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';

export default function TaxonomyPage() {
  const { toast } = useToast();

  const countFor = (name: string) => mockAssets.filter((a) => a.category === name).length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Categories & Taxonomy"
        subtitle="Asset classes and their per-class dynamic attribute schemas."
        breadcrumb={[
          { label: 'Assets', href: '/assets' },
          { label: 'Taxonomy' },
        ]}
        actions={
          <Button
            onClick={() =>
              toast({ title: 'New class', description: 'Class designer is disabled in the demo.', tone: 'info' })
            }
          >
            + New Class
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {mockTaxonomy.map((cls) => {
          const seeded = countFor(cls.name);
          const requiredCount = cls.attributes.filter((a) => a.required).length;
          return (
            <Link
              key={cls.id}
              to={`/taxonomy/${cls.id}`}
              className="glass-panel group rounded-xl p-5 transition-colors hover:border-primary-300 hover:bg-primary-50/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                    {cls.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading text-base font-bold text-slate-900 truncate group-hover:text-primary-700">
                      {cls.name}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">{cls.id}</p>
                  </div>
                </div>
                <span className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-500">
                  →
                </span>
              </div>

              <div className="mt-5 flex items-center gap-4">
                <div>
                  <div className="text-2xl font-heading font-bold text-slate-900">
                    {cls.assetCount.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500">assets in class</div>
                </div>
                <div className="h-8 w-px bg-slate-200" />
                <div>
                  <div className="text-2xl font-heading font-bold text-slate-900">
                    {cls.attributes.length}
                  </div>
                  <div className="text-xs text-slate-500">attributes</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {requiredCount > 0 && (
                  <Badge tone="primary">{requiredCount} required</Badge>
                )}
                {seeded > 0 && (
                  <Badge tone="slate">{seeded} seeded in demo</Badge>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
