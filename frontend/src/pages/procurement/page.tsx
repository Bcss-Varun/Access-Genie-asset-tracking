import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allPurchaseOrders } from '@/lib/dataset';
import type { PoStatus, PurchaseOrder } from '@access-genie/shared';
import { PageHeader, KpiCard, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { PurchaseOrderDialog } from '@/components/inventory/InventoryDialogs';
import { useMutate } from '@/api/mutate';
import { procurementApi } from '@/api/inventory';
import { nowMs, formatMoney, relTime } from '@/lib/utils';

const STATUSES: PoStatus[] = ['Draft', 'Approved', 'Sent', 'Received', 'Cancelled'];

const statusTone: Record<PoStatus, 'slate' | 'primary' | 'amber' | 'emerald' | 'red'> = {
  Draft: 'slate',
  Approved: 'primary',
  Sent: 'amber',
  Received: 'emerald',
  Cancelled: 'red',
};

const OPEN_STATUSES: PoStatus[] = ['Draft', 'Approved', 'Sent'];

function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date(nowMs());
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

export default function ProcurementPage() {
  const { run, isPending } = useMutate();
  const orders = useMemo(() => allPurchaseOrders, []);
  const [filter, setFilter] = useState<'All' | PoStatus>('All');
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; po: PurchaseOrder } | null>(null);

  /**
   * Receiving is the only thing that raises stock from a delivery, so it is
   * offered directly on the row rather than only inside the editor — it is what
   * somebody standing at the loading bay actually needs.
   */
  const receive = (po: PurchaseOrder) =>
    void run(procurementApi.receive(po.id), {
      success: 'Delivery received',
      successDetail: `${po.lines.length} line${po.lines.length === 1 ? '' : 's'} added to stock from ${po.supplierName}.`,
      describe: 'receive that delivery',
    });

  const openCount = orders.filter((o) => OPEN_STATUSES.includes(o.status)).length;
  const sentCount = orders.filter((o) => o.status === 'Sent').length;
  const receivedThisMonth = orders.filter((o) => o.status === 'Received' && isThisMonth(o.createdAt)).length;
  const committed = orders
    .filter((o) => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + o.total, 0);

  const filtered = filter === 'All' ? orders : orders.filter((o) => o.status === filter);

  const chipCls = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
      active
        ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
        : 'bg-transparent text-slate-500 border-slate-200 hover:border-primary-500/50 hover:text-slate-700'
    }`;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Procurement"
        subtitle="Purchase orders across all suppliers and warehouses."
        breadcrumb={[
          { label: 'Inventory', href: '/assets' },
          { label: 'Procurement' },
        ]}
        actions={<Button onClick={() => setDialog({ mode: 'new' })}>+ New PO</Button>}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Open POs" value={openCount} sub="Draft, Approved & Sent" tone="primary" accent />
        <KpiCard label="Sent" value={sentCount} sub="Awaiting delivery" tone="slate" />
        <KpiCard label="Received This Month" value={receivedThisMonth} sub="Fulfilled orders" tone="slate" />
        <KpiCard label="Committed Value" value={formatMoney(committed)} sub="Excludes cancelled" tone="slate" />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mr-1">Status</span>
        {(['All', ...STATUSES] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={chipCls(filter === s)}>
            {s}
          </button>
        ))}
        <span className="ml-auto text-sm text-slate-500 font-medium">
          {filtered.length} of {orders.length}
        </span>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">PO</th>
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4">Expected</th>
                <th className="px-6 py-4 text-right">Lines</th>
                <th className="px-6 py-4 text-right">Total</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((po: PurchaseOrder) => (
                <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <Link to={`/procurement/${po.id}`} className="font-mono text-xs font-semibold text-primary-600 hover:text-primary-700">
                      {po.id}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <Link to={`/suppliers/${po.supplierId}`} className="text-slate-700 hover:text-primary-600 font-medium">
                      {po.supplierName}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <Badge tone={statusTone[po.status]}>{po.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{relTime(po.createdAt)}</td>
                  <td className="px-6 py-4 text-slate-500">{relTime(po.expectedAt)}</td>
                  <td className="px-6 py-4 text-right text-slate-600 tabular-nums">{po.lines.length}</td>
                  <td className="px-6 py-4 text-right font-semibold text-slate-900 tabular-nums">{formatMoney(po.total)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {po.status !== 'Received' && po.status !== 'Cancelled' && (
                        <Button size="sm" variant="outline" disabled={isPending} onClick={() => receive(po)}>
                          Receive
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'edit', po })}>
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState
            variant={orders.length === 0 ? 'empty' : 'no-results'}
            icon="🧾"
            title={orders.length === 0 ? 'No purchase orders' : 'No purchase orders match'}
            description={
              orders.length === 0
                ? 'Raising an order here is what puts parts on the shelf: receiving it later is the only thing that adds stock from a delivery.'
                : `No POs with status “${filter}”.`
            }
            action={orders.length === 0 ? <Button onClick={() => setDialog({ mode: 'new' })}>+ New PO</Button> : undefined}
          />
        )}
      </div>

      {dialog?.mode === 'new' && <PurchaseOrderDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit' && <PurchaseOrderDialog existing={dialog.po} onClose={() => setDialog(null)} />}
    </div>
  );
}
