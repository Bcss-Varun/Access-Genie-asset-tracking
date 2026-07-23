'use client';

import { PageHeader } from '@/components/ui/primitives';
import { AssetForm } from '@/components/assets/AssetForm';

export default function NewAssetPage() {
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Register Asset"
        subtitle="Create a new asset record and capture its class-specific attributes."
        breadcrumb={[{ label: 'Asset Registry', href: '/assets' }, { label: 'New Asset' }]}
      />
      <AssetForm mode="create" />
    </div>
  );
}
