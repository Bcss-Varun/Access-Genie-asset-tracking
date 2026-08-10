import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { templatesApi } from '@/api/registration';
import { TemplateEditor } from '@/components/registration/TemplateEditor';

export default function EditTemplatePage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['template', id],
    queryFn: () => templatesApi.get(id),
  });

  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader
        title={data ? `Edit “${data.name}”` : 'Edit template'}
        subtitle="Changes apply to the next asset registered from this template. Assets already created keep what they captured."
        breadcrumb={[
          { label: 'Asset Registry', href: '/assets' },
          { label: 'Templates', href: '/assets/templates' },
          { label: data?.name ?? id },
        ]}
      />

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading template…</div>
      ) : isError || !data ? (
        <div className="rounded-xl border border-health-critical/30 bg-red-50 p-6 text-sm text-slate-700">
          <p className="font-semibold text-health-critical">That template could not be found.</p>
          <Link to="/assets/templates">
            <Button variant="outline" className="mt-4">Back to templates</Button>
          </Link>
        </div>
      ) : (
        // Keyed by id so switching templates remounts the editor with fresh
        // state rather than leaving the previous one's selections behind.
        <TemplateEditor key={data.id} existing={data} />
      )}
    </div>
  );
}
