import { Link, useParams } from 'react-router-dom';
import { getTaxonomyClass, mockAssets } from '@/lib/mock-data';
import type { AttributeDef } from '@/types/asset';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';

const typeTone = (t: AttributeDef['type']) =>
  t === 'number' ? 'primary'
    : t === 'select' ? 'amber'
      : t === 'date' ? 'emerald'
        : t === 'boolean' ? 'red'
          : 'slate';

const statusTone = (s: string) =>
  s === 'Active' ? 'emerald' : s === 'Maintenance' ? 'amber' : s === 'Missing' ? 'red' : 'slate';

export default function TaxonomyClassPage() {
  const { class: classId = '' } = useParams();
  const { toast } = useToast();

  const cls = getTaxonomyClass(classId);

  if (!cls) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <PageHeader
          title="Class not found"
          breadcrumb={[
            { label: 'Assets', href: '/assets' },
            { label: 'Taxonomy', href: '/taxonomy' },
          ]}
        />
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="🗂️"
            title="No such asset class"
            description={`No taxonomy class matches "${classId}". It may have been removed or the link is out of date.`}
            action={
              <Link
                to="/taxonomy"
                className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                ← Back to Taxonomy
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  // Match seeded assets by category name === class name.
  const members = mockAssets.filter((a) => a.category === cls.name);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={cls.name}
        subtitle={`${cls.assetCount.toLocaleString()} assets · ${cls.attributes.length} attributes in schema`}
        breadcrumb={[
          { label: 'Assets', href: '/assets' },
          { label: 'Taxonomy', href: '/taxonomy' },
          { label: cls.name },
        ]}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                toast({ title: 'Edit class', description: 'Schema editing is disabled in the demo.', tone: 'info' })
              }
            >
              Edit
            </Button>
            <Button
              onClick={() =>
                toast({ title: 'Add attribute', description: 'Attribute designer is disabled in the demo.', tone: 'info' })
              }
            >
              + Add attribute
            </Button>
          </>
        }
      />

      {/* Attribute schema table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="font-heading text-base font-bold text-slate-900">Attribute Schema</h3>
          <span className="text-xs text-slate-500">{cls.attributes.length} attributes</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Attribute</th>
                <th className="px-5 py-3">Key</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3">Options</th>
                <th className="px-5 py-3">Required</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {cls.attributes.map((attr) => (
                <tr key={attr.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-medium text-slate-900">{attr.label}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{attr.key}</td>
                  <td className="px-5 py-3">
                    <Badge tone={typeTone(attr.type)}>{attr.type}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{attr.unit ?? '—'}</td>
                  <td className="px-5 py-3">
                    {attr.options && attr.options.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {attr.options.map((o) => (
                          <span
                            key={o}
                            className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-600"
                          >
                            {o}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {attr.required ? (
                      <Badge tone="red">Required</Badge>
                    ) : (
                      <span className="text-xs text-slate-400">Optional</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() =>
                        toast({ title: `Edit "${attr.label}"`, description: 'Attribute editing is disabled in the demo.', tone: 'info' })
                      }
                      className="text-xs font-medium text-primary-600 hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Members in this class */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="font-heading text-base font-bold text-slate-900">Assets in this class</h3>
          <span className="text-xs text-slate-500">{members.length} seeded</span>
        </div>
        {members.length === 0 ? (
          <EmptyState
            icon="📦"
            title="No seeded assets"
            description="No demo assets are currently classified under this taxonomy class."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.map((a) => (
              <li key={a.id}>
                <Link
                  to={`/assets/${a.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{a.name}</div>
                    <div className="text-xs text-slate-500">
                      <span className="font-mono">{a.id}</span> · {a.manufacturer} {a.model}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                    <span className="text-slate-300">→</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
