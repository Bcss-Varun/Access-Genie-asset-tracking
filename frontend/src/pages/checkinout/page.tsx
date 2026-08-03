import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { allAssets, allCustody } from '@/lib/dataset';
import { relTime } from '@/lib/utils';
import { custodyApi } from '@/api/catalog';
import { useMutate } from '@/api/mutate';
import type { CustodyAction, CustodyRecord } from '@access-genie/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Check-in / Check-out — kiosk-style custody console + recent activity log.
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_TONE: Record<CustodyAction, 'primary' | 'emerald' | 'slate' | 'amber'> = {
  'Checked Out': 'primary',
  'Checked In': 'emerald',
  Assigned: 'slate',
  Transferred: 'amber',
};

export default function CheckInOutPage() {
  const { toast } = useToast();
  const { run, isPending } = useMutate();
  const [assetId, setAssetId] = useState<string>(allAssets[0]?.id ?? '');
  const [custodian, setCustodian] = useState('');
  const [action, setAction] = useState<'out' | 'in'>('out');

  // Seeded from the dataset and prepended to optimistically; `run` re-reads the
  // dataset after the write, so the list converges on what the server stored —
  // including the ID it minted, which the client has no business inventing.
  const [log, setLog] = useState<CustodyRecord[]>(() =>
    [...allCustody].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
  );

  // No `!` here: the registry is empty until someone registers an asset, and
  // the kiosk below renders an empty state rather than a form in that case.
  const asset = useMemo(() => allAssets.find((a) => a.id === assetId), [assetId]);

  async function confirm() {
    if (!asset) return;

    const holder = custodian.trim();
    if (!holder) {
      toast({ title: 'Custodian required', description: 'Enter who is taking custody before confirming.', tone: 'error' });
      return;
    }

    const custodyAction: CustodyAction = action === 'out' ? 'Checked Out' : 'Checked In';

    const record = await run(custodyApi.record({ assetId: asset.id, holder, action: custodyAction }), {
      success: action === 'out' ? 'Checked out' : 'Checked in',
      successDetail: `${asset.name} · ${holder}`,
      describe: `check that asset ${action === 'out' ? 'out' : 'in'}`,
    });

    if (!record) return;
    setLog((prev) => [record, ...prev]);
    setCustodian('');
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Check-in / Check-out"
        subtitle="Kiosk custody console — hand assets out and back with a full audit trail."
        breadcrumb={[{ label: 'Operations', href: '/operations/transfers' }, { label: 'Check-in / Check-out' }]}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Kiosk panel */}
        <div className="lg:col-span-2 glass-panel rounded-xl p-6 flex flex-col gap-5">
          <h2 className="text-lg font-heading font-semibold text-slate-900">Custody Kiosk</h2>

          {!asset ? (
            <EmptyState
              icon="📦"
              title="No assets to hand out yet"
              description="The kiosk hands registered assets to a custodian and takes them back. Register one and it becomes selectable here."
              action={<Link to="/assets/new"><Button variant="primary">Register an asset</Button></Link>}
            />
          ) : (
          <>
          {/* Action toggle */}
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100/60 p-0.5 text-sm font-medium">
            {(['out', 'in'] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAction(a)}
                className={`flex-1 px-4 py-2 rounded-md transition-colors ${
                  action === a ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {a === 'out' ? 'Check Out' : 'Check In'}
              </button>
            ))}
          </div>

          {/* Asset picker */}
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Asset</span>
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {allAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.id})
                </option>
              ))}
            </select>
          </label>

          {/* Asset summary */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-500">
            <div className="flex items-center justify-between">
              <span>Current custodian</span>
              <span className="font-medium text-slate-700">{asset.custodian}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span>Location</span>
              <span className="font-medium text-slate-700">{asset.location.name}</span>
            </div>
          </div>

          {/* Custodian field */}
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {action === 'out' ? 'Taking custody' : 'Returned by'}
            </span>
            <input
              value={custodian}
              onChange={(e) => setCustodian(e.target.value)}
              placeholder="e.g. Deepak Nair"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>

          <Button onClick={() => void confirm()} disabled={isPending} className="w-full">
            Confirm {action === 'out' ? 'Check-out' : 'Check-in'}
          </Button>
          </>
          )}
        </div>

        {/* Recent activity */}
        <div className="lg:col-span-3 glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-heading font-semibold text-slate-900">Recent Custody Activity</h2>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-3.5">Asset</th>
                  <th className="px-6 py-3.5">Action</th>
                  <th className="px-6 py-3.5">Holder</th>
                  <th className="px-6 py-3.5 text-right">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {log.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3.5">
                      <Link to={`/assets/${c.assetId}`} className="font-medium text-slate-800 hover:text-primary-600 transition-colors">
                        {c.assetName}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5">
                      <Badge tone={ACTION_TONE[c.action]}>{c.action}</Badge>
                    </td>
                    <td className="px-6 py-3.5 text-slate-600">{c.holder}</td>
                    <td className="px-6 py-3.5 text-right text-slate-400 text-xs">{relTime(c.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
