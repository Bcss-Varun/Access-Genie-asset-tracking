import { Suspense } from 'react';
import { PageHeader, Skeleton } from '@/components/ui/primitives';
import { RegisterFlow } from '@/components/onboarding/RegisterFlow';

export default function NewAssetPage() {
  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader
        title="Add Asset"
        subtitle="Pick a source, identify the unit, and it's registered. Everything after that can wait."
        breadcrumb={[{ label: 'Asset Registry', href: '/assets' }, { label: 'Add Asset' }]}
      />
      {/* RegisterFlow reads ?resume= to pick a draft back up, so it renders
          client-side below a boundary rather than blocking the prerender. */}
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <RegisterFlow />
      </Suspense>
    </div>
  );
}
