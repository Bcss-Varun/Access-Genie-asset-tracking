import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';
import type { Transfer, TransferStatus } from '@access-genie/shared';
import { allTransfers } from '@/lib/dataset';
import { operationsApi } from '@/api/operations';
import { useMutate } from '@/api/mutate';

// ─────────────────────────────────────────────────────────────────────────────
// Transfers & movements — asset relocation requests with segregation of duties.
// The API refuses an approval from whoever raised the request, so that control
// is enforced rather than merely displayed.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<TransferStatus, 'amber' | 'primary' | 'slate' | 'emerald'> = {
  Pending: 'amber',
  Approved: 'primary',
  'In Transit': 'slate',
  Received: 'emerald',
  Rejected: 'slate',
};

export default function TransfersPage() {
  const { toast } = useToast();
  const { run } = useMutate();
  const [transfers, setTransfers] = useState<Transfer[]>(allTransfers);

  const kpis = useMemo(() => {
    const open = transfers.filter((t) => t.status !== 'Received').length;
    const pending = transfers.filter((t) => t.status === 'Pending').length;
    const inTransit = transfers.filter((t) => t.status === 'In Transit').length;
    const completed = transfers.filter((t) => t.status === 'Received').length;
    return { open, pending, inTransit, completed };
  }, [transfers]);

  function approve(t: Transfer) {
    const before = transfers;
    setTransfers((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: 'Approved' } : x)));
    void run(operationsApi.advanceTransfer(t.id, 'Approved'), {
      success: `${t.id} approved`,
      successDetail: `Move authorised.`,
      describe: 'approve that transfer',
      rollback: () => setTransfers(before),
      // A received transfer moves the asset, so the map has to follow.
      refreshTracking: false,
    });
  }

  function dispatch(t: Transfer) {
    const before = transfers;
    setTransfers((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: 'In Transit' } : x)));
    void run(operationsApi.advanceTransfer(t.id, 'In Transit'), {
      success: `${t.id} dispatched`,
      successDetail: `${t.assetName} is now in transit.`,
      describe: 'dispatch that transfer',
      rollback: () => setTransfers(before),
      // A received transfer moves the asset, so the map has to follow.
      refreshTracking: false,
    });
  }

  function receive(t: Transfer) {
    const before = transfers;
    setTransfers((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: 'Received' } : x)));
    void run(operationsApi.advanceTransfer(t.id, 'Received'), {
      success: `${t.id} received`,
      successDetail: `${t.assetName} confirmed at ${t.to}.`,
      describe: 'receive that transfer',
      rollback: () => setTransfers(before),
      // A received transfer moves the asset, so the map has to follow.
      refreshTracking: true,
    });
  }

  function newTransfer() {
    toast({ title: 'New transfer', description: 'Transfer request drafted — assign an approver to route it.', tone: 'info' });
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Transfers & Movements"
        subtitle="Asset relocation requests with segregation-of-duties approval routing."
        breadcrumb={[{ label: 'Operations', href: '/operations/transfers' }, { label: 'Transfers' }]}
        actions={<Button onClick={newTransfer}>+ New Transfer</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Open Transfers" value={kpis.open} sub="Not yet received" accent />
        <KpiCard label="Pending Approval" value={kpis.pending} sub="Awaiting sign-off" tone="amber" />
        <KpiCard label="In Transit" value={kpis.inTransit} sub="On the move" tone="primary" />
        <KpiCard label="Completed" value={kpis.completed} sub="Received & closed" tone="emerald" />
      </div>

      <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">Request</th>
                <th className="px-6 py-4">Asset</th>
                <th className="px-6 py-4">Route</th>
                <th className="px-6 py-4">Requester → Approver</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transfers.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-mono text-xs text-slate-500">{t.id}</div>
                    <div className="text-[11px] text-slate-400">{relTime(t.requestedAt)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Link to={`/assets/${t.assetId}`} className="font-medium text-slate-800 hover:text-primary-600 transition-colors">
                      {t.assetName}
                    </Link>
                    <div className="text-[11px] text-slate-400 max-w-xs whitespace-normal">{t.reason}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span>{t.from}</span>
                      <span className="text-primary-500">→</span>
                      <span className="font-medium text-slate-700">{t.to}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs text-slate-600">
                      {t.requester} <span className="text-slate-300">→</span> {t.approver}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {t.status === 'Pending' && (
                      <Button size="sm" onClick={() => approve(t)}>Approve</Button>
                    )}
                    {t.status === 'Approved' && (
                      <Button size="sm" variant="outline" onClick={() => dispatch(t)}>Dispatch</Button>
                    )}
                    {t.status === 'In Transit' && (
                      <Button size="sm" onClick={() => receive(t)}>Receive</Button>
                    )}
                    {t.status === 'Received' && <span className="text-xs text-slate-400">Closed ✓</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
