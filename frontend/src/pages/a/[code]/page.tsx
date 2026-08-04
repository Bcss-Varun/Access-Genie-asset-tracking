// ─────────────────────────────────────────────────────────────────────────────
// Scan-to-open — what a printed QR code actually opens.
//
// The label carries `/a/<shortId>` as an absolute URL, so any phone camera
// resolves it with nothing installed. This route turns that short code back
// into an asset and shows what the person holding the thing needs: what it is,
// where it is meant to be, who has it, and whether anything is wrong with it.
//
// It sits inside the authenticated tree deliberately. An asset register is not
// public, and the auth guard already round-trips through sign-in and back to
// the scanned URL, so a scan by someone signed out lands here after logging in
// rather than failing.
// ─────────────────────────────────────────────────────────────────────────────

import { Link, useParams } from 'react-router-dom';
import { getAssetById, getWorkOrdersForAsset } from '@/lib/dataset';
import { assetIdFromShortId } from '@/lib/onboarding';
import { PageHeader, Badge, EmptyState, HealthBar } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';

export default function ScanLandingPage() {
  const { code = '' } = useParams();
  const assetId = assetIdFromShortId(code);
  const asset = getAssetById(assetId);

  if (!asset) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <PageHeader title="Scanned code" breadcrumb={[{ label: 'Scan' }, { label: code }]} />
        <EmptyState
          icon="🔎"
          title="No asset behind that code"
          description={`“${code}” resolves to ${assetId}, which is not in the registry. The label may be from a deleted record, or belong to a different organisation.`}
          action={<Link to="/assets"><Button variant="outline">Open the registry</Button></Link>}
        />
      </div>
    );
  }

  const openWork = getWorkOrdersForAsset(asset.id).filter((w) => w.status !== 'Completed');

  const rows: [string, string][] = [
    ['Asset ID', asset.id],
    ['Serial', asset.serialNumber],
    ['Category', asset.category],
    ['Status', asset.status],
    ['Location', asset.location?.name ?? '—'],
    ['Custodian', asset.custodian || 'Unassigned'],
    ['Manufacturer', [asset.manufacturer, asset.model].filter(Boolean).join(' ') || '—'],
    ['Tag', asset.trackingId ?? 'No tag bound'],
  ];

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={asset.name}
        subtitle={`Scanned ${code.toUpperCase()} — ${asset.id}`}
        breadcrumb={[{ label: 'Asset Registry', href: '/assets' }, { label: asset.id }]}
        actions={
          <Link to={`/assets/${asset.id}`}>
            <Button>Open full record →</Button>
          </Link>
        }
      />

      <div className="glass-panel rounded-xl p-5 space-y-4 max-w-2xl">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={asset.status === 'Active' ? 'emerald' : asset.status === 'Missing' ? 'red' : 'slate'}>
            {asset.status}
          </Badge>
          {asset.criticality && <Badge tone="amber">{asset.criticality} criticality</Badge>}
          {openWork.length > 0 && <Badge tone="red">{openWork.length} open work order{openWork.length === 1 ? '' : 's'}</Badge>}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>Health</span>
            <span className="tabular-nums font-medium text-slate-700">{asset.healthScore ?? '—'}</span>
          </div>
          <HealthBar score={asset.healthScore ?? 0} />
        </div>

        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="min-w-0 truncate text-sm font-medium text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
