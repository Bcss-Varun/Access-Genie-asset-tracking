import { Link, useParams } from 'react-router-dom';
import { getCustodyForAsset, getAssetById } from '@/lib/dataset';
import type { CustodyAction } from '@access-genie/shared';
import { PageHeader, EmptyState, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { relTime } from '@/lib/utils';

const actionTone = (a: CustodyAction): 'primary' | 'amber' | 'emerald' | 'slate' =>
  a === 'Checked Out' ? 'amber' : a === 'Checked In' ? 'emerald' : a === 'Assigned' ? 'primary' : 'slate';

export default function CustodyChainPage() {
  const { assetId = '' } = useParams();
  const events = getCustodyForAsset(assetId);
  const asset = getAssetById(assetId);
  const assetName = asset?.name ?? events[0]?.assetName ?? assetId;

  if (events.length === 0) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <PageHeader
          title="Chain of Custody"
          breadcrumb={[{ label: 'Compliance' }, { label: 'Custody', href: '/custody' }, { label: assetName }]}
        />
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="🔗"
            title="No custody records"
            description={`We have no chain-of-custody events on file for ${assetName}.`}
            action={<Link to="/custody"><Button variant="outline">← Back to Chain of Custody</Button></Link>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={assetName}
        subtitle={`Chain of custody · ${events.length} event${events.length === 1 ? '' : 's'}`}
        breadcrumb={[{ label: 'Compliance' }, { label: 'Custody', href: '/custody' }, { label: assetName }]}
        actions={asset && (
          <Link to={`/assets/${assetId}`}><Button variant="outline">View asset profile →</Button></Link>
        )}
      />

      {/* Asset header */}
      <div className="glass-panel rounded-xl p-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-mono text-slate-400">{assetId}</div>
          <h2 className="font-heading font-bold text-lg text-slate-900 truncate">{assetName}</h2>
          {asset && (
            <p className="text-sm text-slate-500 mt-0.5">
              {asset.category} · {asset.location.name} · Custodian {asset.custodian}
            </p>
          )}
        </div>
        <Badge tone={actionTone(events[0].action)}>Latest: {events[0].action}</Badge>
      </div>

      {/* Vertical timeline */}
      <div className="glass-panel rounded-xl p-6 flex-1 min-h-0 overflow-auto">
        <ol className="relative border-l-2 border-slate-200 ml-3 space-y-6">
          {events.map((e, i) => (
            <li key={e.id} className="ml-6">
              <span className={`absolute -left-[9px] mt-1.5 h-4 w-4 rounded-full border-2 border-white ${i === 0 ? 'bg-primary-500' : 'bg-slate-300'}`} />
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={actionTone(e.action)}>{e.action}</Badge>
                <span className="font-medium text-slate-900">{e.holder}</span>
                <span className="text-xs text-slate-400">· {relTime(e.at)}</span>
              </div>
              <p className="text-sm text-slate-500 mt-1">Recorded by {e.by}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
