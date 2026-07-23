'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { getPurchaseOrder } from '@/lib/mock-data';
import type { PoStatus } from '@/types/asset';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { formatMoney, relTime } from '@/lib/utils';

const statusTone: Record<PoStatus, 'slate' | 'primary' | 'amber' | 'emerald' | 'red'> = {
  Draft: 'slate',
  Approved: 'primary',
  Sent: 'amber',
  Received: 'emerald',
  Cancelled: 'red',
};

// Next status in the fulfilment pipeline + the button label that advances to it.
const NEXT: Partial<Record<PoStatus, { to: PoStatus; label: string }>> = {
  Draft: { to: 'Approved', label: 'Approve' },
  Approved: { to: 'Sent', label: 'Send' },
  Sent: { to: 'Received', label: 'Receive' },
};

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const po = getPurchaseOrder(id);
  const [status, setStatus] = useState<PoStatus>(po?.status ?? 'Draft');

  if (!po) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          icon="📦"
          title="Purchase order not found"
          description={`No purchase order with id “${id}” exists in this session.`}
          action={<Link href="/procurement"><Button variant="outline">← Back to Procurement</Button></Link>}
        />
      </div>
    );
  }

  const grandTotal = po.lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0);
  const next = NEXT[status];

  function advance() {
    if (!next) return;
    setStatus(next.to);
    toast({
      title: `${po!.id} → ${next.to}`,
      description: `Purchase order marked as ${next.to.toLowerCase()}.`,
      tone: 'success',
    });
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={po.id}
        subtitle={po.supplierName}
        breadcrumb={[
          { label: 'Inventory', href: '/assets' },
          { label: 'Procurement', href: '/procurement' },
          { label: po.id },
        ]}
        actions={
          next ? (
            <Button onClick={advance}>{next.label}</Button>
          ) : (
            <Badge tone={statusTone[status]}>{status === 'Received' ? 'Fulfilled' : status}</Badge>
          )
        }
      />

      {/* Header meta */}
      <div className="text-sm text-slate-500">
        Supplier{' '}
        <Link href={`/suppliers/${po.supplierId}`} className="text-primary-600 hover:text-primary-700 font-medium">
          {po.supplierName}
        </Link>
      </div>

      {/* Summary card */}
      <div className="glass-panel rounded-xl p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Created</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{relTime(po.createdAt)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Expected</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{relTime(po.expectedAt)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(grandTotal)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</div>
            <div className="mt-1"><Badge tone={statusTone[status]}>{status}</Badge></div>
          </div>
        </div>
      </div>

      {/* Lines table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">SKU</th>
                <th className="px-6 py-4">Item</th>
                <th className="px-6 py-4 text-right">Qty</th>
                <th className="px-6 py-4 text-right">Unit Cost</th>
                <th className="px-6 py-4 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {po.lines.map((l, i) => (
                <tr key={`${l.sku}-${i}`} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{l.sku}</td>
                  <td className="px-6 py-4 font-medium text-slate-900">{l.name}</td>
                  <td className="px-6 py-4 text-right text-slate-600 tabular-nums">{l.qty}</td>
                  <td className="px-6 py-4 text-right text-slate-600 tabular-nums">{formatMoney(l.unitCost)}</td>
                  <td className="px-6 py-4 text-right font-medium text-slate-900 tabular-nums">{formatMoney(l.qty * l.unitCost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50/60">
              <tr>
                <td colSpan={4} className="px-6 py-4 text-right text-sm font-semibold text-slate-500 uppercase tracking-wider">
                  Grand Total
                </td>
                <td className="px-6 py-4 text-right text-base font-bold font-heading text-slate-900 tabular-nums">
                  {formatMoney(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Receiving section */}
      {status === 'Received' && (
        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-base font-semibold text-slate-800">Receiving</h3>
            <Badge tone="emerald" className="ml-1">All items received</Badge>
          </div>
          <div className="space-y-2">
            {po.lines.map((l, i) => (
              <div key={`recv-${l.sku}-${i}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-emerald-500">✓</span>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{l.name}</div>
                    <div className="font-mono text-xs text-slate-400">{l.sku}</div>
                  </div>
                </div>
                <div className="text-sm text-slate-600 tabular-nums shrink-0">
                  {l.qty} / {l.qty} received
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Received into inventory · on-hand quantities updated for {po.lines.length} SKU{po.lines.length === 1 ? '' : 's'}.
          </p>
        </div>
      )}
    </div>
  );
}
