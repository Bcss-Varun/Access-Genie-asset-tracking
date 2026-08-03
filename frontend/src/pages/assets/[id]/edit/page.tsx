import { Link, useParams } from 'react-router-dom';
import { getAssetById } from '@/lib/mock-data';
import { PageHeader, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { AssetForm } from '@/components/assets/AssetForm';

export default function EditAssetPage() {
  const { id = '' } = useParams();
  const asset = getAssetById(id);

  if (!asset) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <PageHeader
          title="Edit Asset"
          breadcrumb={[{ label: 'Asset Registry', href: '/assets' }, { label: id }]}
        />
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="🔍"
            variant="no-results"
            title="Asset not found"
            description={`No asset matches "${id}". It may have been retired or the link is out of date.`}
            action={
              <Link to="/assets">
                <Button variant="primary">← Back to Asset Registry</Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={`Edit ${asset.name}`}
        subtitle="Update this asset's details. Changes are held in-session for the demo."
        breadcrumb={[
          { label: 'Asset Registry', href: '/assets' },
          { label: asset.name, href: `/assets/${asset.id}` },
          { label: 'Edit' },
        ]}
      />
      <AssetForm mode="edit" asset={asset} />
    </div>
  );
}
