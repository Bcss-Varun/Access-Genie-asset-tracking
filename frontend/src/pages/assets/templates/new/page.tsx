import { PageHeader } from '@/components/ui/primitives';
import { TemplateEditor } from '@/components/registration/TemplateEditor';

export default function NewTemplatePage() {
  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader
        title="New template"
        subtitle="Pick the fields this kind of asset needs, and mark the ones you want to insist on."
        breadcrumb={[
          { label: 'Asset Registry', href: '/assets' },
          { label: 'Templates', href: '/assets/templates' },
          { label: 'New' },
        ]}
      />
      <TemplateEditor />
    </div>
  );
}
