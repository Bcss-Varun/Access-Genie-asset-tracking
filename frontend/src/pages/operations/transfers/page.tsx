import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { FormDialog, Field, Select, TextArea } from '@/components/ui/FormDialog';
import { Drawer, DrawerRow, DrawerSection } from '@/components/ui/Drawer';
import { AssetPicker } from '@/components/ui/AssetPicker';
import { flattenScope } from '@/lib/rbac';
import { rosterNames } from '@/lib/technicians';
import { relTime, formatDateTime } from '@/lib/utils';
import type { Transfer, TransferStatus } from '@access-genie/shared';
import { allTransfers, getWorkOrdersForAsset } from '@/lib/dataset';
import { operationsApi } from '@/api/operations';
import { useMutate } from '@/api/mutate';

// ─────────────────────────────────────────────────────────────────────────────
// Asset Transfers — controlled asset movement with segregation-of-duties
// approval and a real pickup/in-transit/received lifecycle. Receiving a
// transfer moves the asset's location and custody automatically — nobody has
// to go update the asset record separately.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<TransferStatus, 'amber' | 'primary' | 'slate' | 'emerald'> = {
  Pending: 'amber',
  Approved: 'primary',
  'Picked Up': 'primary',
  'In Transit': 'slate',
  Received: 'emerald',
  Rejected: 'slate',
};

function NewTransferDialog({ onClose }: { onClose: () => void }) {
  const { run, isPending } = useMutate();

  const places = flattenScope().filter(({ node }) => node.level !== 'org' && node.level !== 'region');
  const [assetId, setAssetId] = useState('');
  const [to, setTo] = useState(places[0]?.node.name ?? '');
  const [reason, setReason] = useState('');
  const [newCustodian, setNewCustodian] = useState('');
  const [handler, setHandler] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');

  const openWorkOrders = assetId ? getWorkOrdersForAsset(assetId).filter((w) => w.status !== 'Completed') : [];

  const submit = async () => {
    const ok = await run(
      operationsApi.requestTransfer({
        assetId,
        to,
        reason: reason.trim(),
        newCustodian: newCustodian.trim() || undefined,
        handler: handler || undefined,
        workOrderId: workOrderId || undefined,
      }),
      {
        success: 'Transfer requested',
        successDetail: 'It needs approval from somebody other than you before it can move.',
        describe: 'request that transfer',
      },
    );
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="🚚"
      title="New transfer"
      description="Moves an asset permanently. Approval is required, and the server refuses an approval from whoever raised it."
      submitLabel="Request transfer"
      busy={isPending}
      disabled={!assetId || !to || reason.trim().length < 3}
      onSubmit={() => void submit()}
      onCancel={onClose}
      width="lg"
    >
      <AssetPicker value={assetId} onChange={setAssetId} required />

      <Field label="Destination" required>
        {places.length > 0 ? (
          <Select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            options={places.map(({ node, depth }) => ({
              value: node.name,
              label: `${'  '.repeat(Math.max(0, depth - 1))}${node.name}`,
            }))}
          />
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            There is nowhere to transfer to yet. Add a facility under Administration ▸ Facilities.
          </p>
        )}
      </Field>

      <Field label="New custodian" hint="Who the asset should land with at the destination. Optional.">
        <input
          value={newCustodian}
          onChange={(e) => setNewCustodian(e.target.value)}
          placeholder="e.g. Sneha Iyer"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
      </Field>

      <Field label="Handler" hint="The technician carrying out the pickup/delivery. Optional.">
        <Select value={handler} onChange={(e) => setHandler(e.target.value)} options={[{ value: '', label: 'Not yet assigned' }, ...rosterNames().map((n) => ({ value: n, label: n }))]} />
      </Field>

      {assetId && openWorkOrders.length > 0 && (
        <Field label="Related work order" hint="Optional.">
          <Select value={workOrderId} onChange={(e) => setWorkOrderId(e.target.value)} options={[{ value: '', label: 'None' }, ...openWorkOrders.map((w) => ({ value: w.id, label: `${w.id} — ${w.title}` }))]} />
        </Field>
      )}

      <Field label="Why" required hint="Read by whoever approves it — give them enough to decide.">
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reassigned to the Hyderabad team after the office move." />
      </Field>
    </FormDialog>
  );
}

function TransferDetailDrawer({ transfer, onClose }: { transfer: Transfer; onClose: () => void }) {
  return (
    <Drawer icon="🚚" title={transfer.id} subtitle={transfer.assetName} onClose={onClose}>
      <div>
        <Badge tone={STATUS_TONE[transfer.status]}>{transfer.status}</Badge>
      </div>

      <DrawerSection title="Movement">
        <DrawerRow label="Asset" value={<Link to={`/assets/${transfer.assetId}`} className="text-primary-600 hover:text-primary-700">{transfer.assetName}</Link>} />
        <DrawerRow label="Asset ID" value={<span className="font-mono text-xs">{transfer.assetId}</span>} />
        <DrawerRow label="From" value={transfer.from} />
        <DrawerRow label="To" value={transfer.to} />
      </DrawerSection>

      <DrawerSection title="Custody">
        <DrawerRow label="Current custodian" value={transfer.custodian || '—'} />
        <DrawerRow label="New custodian" value={transfer.newCustodian || '—'} />
        <DrawerRow label="Handler" value={transfer.handler || 'Not yet assigned'} />
      </DrawerSection>

      <DrawerSection title="Approval">
        <DrawerRow label="Requester" value={transfer.requester} />
        <DrawerRow label="Approver" value={transfer.approver || 'Awaiting approval'} />
        {transfer.workOrderId && (
          <DrawerRow label="Related work order" value={<Link to={`/maintenance/${transfer.workOrderId}`} className="text-primary-600 hover:text-primary-700 font-mono text-xs">{transfer.workOrderId}</Link>} />
        )}
      </DrawerSection>

      <DrawerSection title="Reason">
        <p className="text-sm text-slate-600">{transfer.reason || '—'}</p>
      </DrawerSection>

      <DrawerSection title="Audit History">
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between"><span className="text-slate-500">Requested</span><span className="text-slate-700">{formatDateTime(transfer.requestedAt)}</span></li>
          {transfer.approvedAt && <li className="flex items-center justify-between"><span className="text-slate-500">{transfer.status === 'Rejected' ? 'Rejected' : 'Approved'}</span><span className="text-slate-700">{formatDateTime(transfer.approvedAt)}</span></li>}
          {transfer.pickedUpAt && <li className="flex items-center justify-between"><span className="text-slate-500">Picked up</span><span className="text-slate-700">{formatDateTime(transfer.pickedUpAt)}</span></li>}
          {transfer.receivedAt && <li className="flex items-center justify-between"><span className="text-slate-500">Received</span><span className="text-slate-700">{formatDateTime(transfer.receivedAt)}</span></li>}
        </ul>
      </DrawerSection>
    </Drawer>
  );
}

export default function TransfersPage() {
  const { run } = useMutate();
  const [transfers, setTransfers] = useState<Transfer[]>(allTransfers);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Transfer | null>(null);

  const kpis = useMemo(() => {
    const open = transfers.filter((t) => t.status !== 'Received' && t.status !== 'Rejected').length;
    const pending = transfers.filter((t) => t.status === 'Pending').length;
    const inTransit = transfers.filter((t) => t.status === 'Picked Up' || t.status === 'In Transit').length;
    const completed = transfers.filter((t) => t.status === 'Received').length;
    return { open, pending, inTransit, completed };
  }, [transfers]);

  function advance(t: Transfer, status: TransferStatus, verb: string) {
    const before = transfers;
    setTransfers((prev) => prev.map((x) => (x.id === t.id ? { ...x, status } : x)));
    void run(operationsApi.advanceTransfer(t.id, status), {
      success: `${t.id} ${verb}`,
      successDetail: status === 'Received' ? `${t.assetName} confirmed at ${t.to}.` : undefined,
      describe: `${verb} that transfer`,
      rollback: () => setTransfers(before),
      // Only a received transfer moves the asset, so only that refreshes the map.
      refreshTracking: status === 'Received',
    });
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Asset Transfers"
        subtitle="Controlled asset movement — segregation-of-duties approval, pickup, transit and receipt."
        breadcrumb={[{ label: 'Mobile Workforce', href: '/workforce' }, { label: 'Asset Transfers' }]}
        actions={<Button onClick={() => setCreating(true)}>+ New Transfer</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Open Transfers" value={kpis.open} sub="Not yet received" accent />
        <KpiCard label="Pending Approval" value={kpis.pending} sub="Awaiting sign-off" tone="amber" />
        <KpiCard label="Picked Up / In Transit" value={kpis.inTransit} sub="On the move" tone="primary" />
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
                <tr key={t.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelected(t)}>
                  <td className="px-6 py-4">
                    <div className="font-mono text-xs text-slate-500">{t.id}</div>
                    <div className="text-[11px] text-slate-400">{relTime(t.requestedAt)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Link to={`/assets/${t.assetId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-800 hover:text-primary-600 transition-colors">
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
                      {t.requester} <span className="text-slate-300">→</span> {t.approver || '—'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    {t.status === 'Pending' && <Button size="sm" onClick={() => advance(t, 'Approved', 'approved')}>Approve</Button>}
                    {t.status === 'Approved' && <Button size="sm" variant="outline" onClick={() => advance(t, 'Picked Up', 'marked picked up')}>Mark Picked Up</Button>}
                    {t.status === 'Picked Up' && <Button size="sm" variant="outline" onClick={() => advance(t, 'In Transit', 'dispatched')}>Dispatch</Button>}
                    {t.status === 'In Transit' && <Button size="sm" onClick={() => advance(t, 'Received', 'received')}>Receive</Button>}
                    {t.status === 'Received' && <span className="text-xs text-slate-400">Closed ✓</span>}
                    {t.status === 'Rejected' && <span className="text-xs text-slate-400">Rejected</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {creating && <NewTransferDialog onClose={() => setCreating(false)} />}
      {selected && <TransferDetailDrawer transfer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
