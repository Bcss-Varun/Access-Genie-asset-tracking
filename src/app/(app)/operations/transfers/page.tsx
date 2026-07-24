'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Transfers & movements — asset relocation requests with Segregation-of-Duties
// (requester ≠ approver). Deterministic seed, in-session mock CRUD.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = Date.parse('2026-07-23T09:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

type TransferStatus = 'Pending' | 'Approved' | 'In Transit' | 'Received';

interface Transfer {
  id: string;
  assetId: string;
  assetName: string;
  from: string;
  to: string;
  requester: string;
  approver: string;
  status: TransferStatus;
  requestedAt: string;
  reason: string;
}

const SEED: Transfer[] = [
  {
    id: 'TR-4001', assetId: 'AST-1002', assetName: 'Cisco Catalyst 9500 Switch',
    from: 'Primary Data Center · Server Room Alpha', to: 'Primary Data Center · Server Room Beta',
    requester: 'James Park', approver: 'Sarah Jenkins',
    status: 'Pending', requestedAt: hoursAgo(2),
    reason: 'Rebalance switching capacity to the growing Beta row.',
  },
  {
    id: 'TR-4002', assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS',
    from: 'Primary Data Center · Server Room Beta', to: 'Primary Data Center · Server Room Alpha',
    requester: 'Storage Team', approver: 'Miguel Ortiz',
    status: 'Approved', requestedAt: hoursAgo(6),
    reason: 'Return to Alpha rack after RAID array rebuild.',
  },
  {
    id: 'TR-4003', assetId: 'AST-1005', assetName: 'APC Smart-UPS 3000',
    from: 'Central Warehouse · IT Storeroom', to: 'Primary Data Center · Utility Room',
    requester: 'Facilities Team', approver: 'Sarah Jenkins',
    status: 'In Transit', requestedAt: hoursAgo(9),
    reason: 'Deploy spare UPS to Power Row A.',
  },
  {
    id: 'TR-4004', assetId: 'AST-1014', assetName: 'Fluke Networks DSX-8000',
    from: 'HQ Building · IT Tool Room', to: 'Central Warehouse · Building A',
    requester: 'Network Team', approver: 'Sarah Jenkins',
    status: 'Pending', requestedAt: hoursAgo(3),
    reason: 'Cable-certification sweep of the new pick-zone drops.',
  },
  {
    id: 'TR-4005', assetId: 'AST-1011', assetName: 'Zebra TC52 Mobile Computer',
    from: 'Central Warehouse · Picking Zone', to: 'HQ Building · IT Storeroom',
    requester: 'Warehouse Team', approver: 'Miguel Ortiz',
    status: 'Received', requestedAt: hoursAgo(28),
    reason: 'Return rugged scanner for battery service.',
  },
  {
    id: 'TR-4006', assetId: 'AST-1012', assetName: 'Zebra RFID Gateway G-4',
    from: 'Central Warehouse · Loading Dock 4', to: 'Central Warehouse · Picking Zone',
    requester: 'IoT Platform', approver: 'Sarah Jenkins',
    status: 'In Transit', requestedAt: hoursAgo(5),
    reason: 'Improve RFID read coverage over the pick aisle.',
  },
];

const STATUS_TONE: Record<TransferStatus, 'amber' | 'primary' | 'slate' | 'emerald'> = {
  Pending: 'amber',
  Approved: 'primary',
  'In Transit': 'slate',
  Received: 'emerald',
};

export default function TransfersPage() {
  const { toast } = useToast();
  const [transfers, setTransfers] = useState<Transfer[]>(() => SEED.map((t) => ({ ...t })));

  const kpis = useMemo(() => {
    const open = transfers.filter((t) => t.status !== 'Received').length;
    const pending = transfers.filter((t) => t.status === 'Pending').length;
    const inTransit = transfers.filter((t) => t.status === 'In Transit').length;
    const completed = transfers.filter((t) => t.status === 'Received').length;
    return { open, pending, inTransit, completed };
  }, [transfers]);

  function approve(t: Transfer) {
    setTransfers((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: 'Approved' } : x)));
    toast({ title: `${t.id} approved`, description: `${t.approver} authorized the move.`, tone: 'success' });
  }

  function dispatch(t: Transfer) {
    setTransfers((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: 'In Transit' } : x)));
    toast({ title: `${t.id} dispatched`, description: `${t.assetName} is now in transit.`, tone: 'info' });
  }

  function receive(t: Transfer) {
    setTransfers((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: 'Received' } : x)));
    toast({ title: `${t.id} received`, description: `${t.assetName} confirmed at ${t.to}.`, tone: 'success' });
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
                    <Link href={`/assets/${t.assetId}`} className="font-medium text-slate-800 hover:text-primary-600 transition-colors">
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
