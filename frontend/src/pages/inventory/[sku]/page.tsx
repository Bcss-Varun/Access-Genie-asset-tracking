import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AbcClass } from '@access-genie/shared';
import { getPart, getWarehouse, getSupplier } from '@/lib/dataset';
import { PageHeader, Badge, EmptyState, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { AdjustStockDialog, PartDialog } from '@/components/inventory/InventoryDialogs';
import { useMutate } from '@/api/mutate';
import { procurementApi } from '@/api/inventory';
import { apiGet } from '@/api/client';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, formatMoney, relTime } from '@/lib/utils';

/**
 * A part, and how its quantity got to where it is.
 *
 * The stock chart and movement table on this page used to be generated from a
 * hash of the SKU — a sine wave and a list of invented PO and WO references,
 * stable across renders and completely fictional. They are now the ledger: one
 * row per actual change to `onHand`, written by the same code paths that move
 * the stock.
 */

interface StockMovement {
  id: string;
  sku: string;
  kind: 'Receipt' | 'Issue' | 'Adjustment';
  delta: number;
  after: number;
  reason: string;
  reference: string;
  actor: string;
  at: string;
}

const abcTone = (c: AbcClass): 'red' | 'amber' | 'slate' =>
  c === 'A' ? 'red' : c === 'B' ? 'amber' : 'slate';

function Sparkline({ values }: { values: number[] }) {
  const w = 260;
  const h = 64;
  const pad = 6;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (values.length - 1);
  const pt = (v: number, i: number): [number, number] => [
    pad + i * stepX,
    pad + (h - pad * 2) * (1 - (v - min) / span),
  ];
  const pts = values.map((v, i) => pt(v, i));
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16" preserveAspectRatio="none" role="img" aria-label="Stock level trend">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#spark-fill)" />
      <polyline points={line} fill="none" stroke="rgb(16 185 129)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="3" fill="rgb(16 185 129)" />
    </svg>
  );
}

export default function PartDetailPage() {
  const { sku = '' } = useParams();
  const { toast } = useToast();
  const { run, isPending } = useMutate();
  const [dialog, setDialog] = useState<'adjust' | 'edit' | null>(null);
  const part = getPart(sku);

  // The ledger is fetched rather than carried in the dataset: it grows without
  // bound and only this page reads it.
  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ['part-movements', part?.sku],
    queryFn: () => apiGet<StockMovement[]>(`/inventory/parts/${part?.sku}/movements`),
    enabled: Boolean(part?.sku),
  });

  if (!part) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          icon="📦"
          title="Part not found"
          description={`No part with SKU or id “${sku}” exists in this session.`}
          action={<Link to="/inventory"><Button variant="outline">← Back to Inventory</Button></Link>}
        />
      </div>
    );
  }

  const warehouse = getWarehouse(part.warehouseId);
  const supplier = getSupplier(part.supplierId);
  const below = part.onHand <= part.reorderPoint;
  const extValue = part.onHand * part.unitCost;

  const rows = ledger ?? [];
  // The chart is the ledger read forwards. With fewer than two movements there
  // is no trend to draw, so nothing is drawn — a flat line through one point
  // would imply a history that does not exist.
  const levels = rows.length > 0 ? [...rows].reverse().map((m) => m.after) : [];

  /** Draft a purchase order for everything below its reorder point, this part included. */
  const reorder = async () => {
    if (!part.supplierId) {
      toast({
        title: 'No supplier on this part',
        description: 'Assign one before it can be drafted onto a purchase order.',
        tone: 'error',
      });
      return;
    }
    const result = await run(procurementApi.draftReorders(), { describe: 'draft that purchase order' });
    if (!result) return;
    toast({
      title: result.drafted > 0 ? `Drafted ${result.drafted} purchase order${result.drafted === 1 ? '' : 's'}` : 'Nothing new to draft',
      description:
        result.drafted > 0
          ? 'Grouped by supplier, in Procurement as drafts. Nothing is committed until you send them.'
          : result.skipped > 0
            ? 'This supplier already has an open draft — it was left alone.'
            : 'This part is above its reorder point.',
      tone: result.drafted > 0 ? 'success' : 'info',
    });
  };

  const scale = Math.max(1, part.reorderPoint * 2);
  const pct = Math.min(100, Math.round((part.onHand / scale) * 100));
  const markPct = Math.min(100, Math.round((part.reorderPoint / scale) * 100));

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: 'Unit Cost', value: <span className="tabular-nums">{formatMoney(part.unitCost)}</span> },
    { label: 'Extended Value', value: <span className="tabular-nums font-semibold">{formatMoney(extValue)}</span> },
    { label: 'Lead Time', value: `${part.leadTimeDays} days` },
    { label: 'Bin', value: <span className="font-mono">{part.bin}</span> },
    { label: 'Category', value: part.category },
    {
      label: 'Warehouse',
      value: (
        <Link to={`/warehouses/${part.warehouseId}`} className="text-primary-600 hover:text-primary-700 font-medium">
          {warehouse?.name ?? part.warehouseId}
        </Link>
      ),
    },
    {
      label: 'Supplier',
      value: (
        <Link to={`/suppliers/${part.supplierId}`} className="text-primary-600 hover:text-primary-700 font-medium">
          {supplier?.name ?? part.supplierId}
        </Link>
      ),
    },
  ];

  const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
  const tdc = 'px-4 py-3';

  const mvTone = (t: StockMovement['kind']): 'emerald' | 'red' | 'slate' =>
    t === 'Receipt' ? 'emerald' : t === 'Issue' ? 'red' : 'slate';

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={part.name}
        subtitle={`${part.sku} · ${part.category}`}
        breadcrumb={[{ label: 'Inventory', href: '/inventory' }, { label: part.name }]}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={abcTone(part.abcClass)} className="text-sm px-3 py-1">Class {part.abcClass}</Badge>
            {below && <Badge tone="red">Below reorder</Badge>}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stock card */}
        <div className="glass-panel rounded-xl p-5 space-y-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-[220px]">
              <div className="text-sm font-medium text-slate-500 mb-1">On-hand</div>
              <div className="flex items-baseline gap-2">
                <span className={cn('text-4xl font-bold font-heading tabular-nums', below ? 'text-health-critical' : 'text-slate-900')}>
                  {part.onHand}
                </span>
                <span className="text-sm text-slate-400">units · reorder at {part.reorderPoint}</span>
              </div>
              <div className="relative mt-3 w-full max-w-sm h-2.5 rounded-full bg-slate-200 overflow-hidden">
                <div className={cn('h-full rounded-full', below ? 'bg-red-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                <span
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-slate-600/70"
                  style={{ left: `${markPct}%` }}
                  title={`Reorder point ${part.reorderPoint}`}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/*
                "Issue to WO" is gone rather than kept as a stub: parts are
                consumed by *completing* a work order, which draws them off the
                shelf against the order's own parts list. A second, unlinked way
                to issue stock would let the two disagree.
              */}
              <Button variant="primary" disabled={isPending} onClick={() => void reorder()}>
                {isPending ? 'Drafting…' : 'Reorder now'}
              </Button>
              <Button variant="outline" onClick={() => setDialog('adjust')}>
                Adjust stock
              </Button>
              <Button variant="outline" onClick={() => setDialog('edit')}>
                Edit part
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
            {facts.map((f) => (
              <div key={f.label}>
                <div className="text-xs text-slate-400">{f.label}</div>
                <div className="mt-0.5 text-sm font-medium text-slate-700 truncate">{f.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stock level over the recorded movements */}
        <div className="glass-panel rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">Stock level</h2>
            <span className="text-xs text-slate-400">
              {levels.length > 1 ? `Last ${levels.length} movements` : 'Not enough history'}
            </span>
          </div>

          {/* Two points is the minimum that describes a direction. Below that
              nothing is drawn: a line through one value would imply a trend the
              ledger has no evidence for. */}
          {levels.length > 1 ? (
            <>
              <div className="mt-4 flex-1 flex flex-col justify-center">
                <Sparkline values={levels} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500 tabular-nums">
                <span>low {Math.min(...levels)}</span>
                <span>now <span className="font-semibold text-slate-700">{part.onHand}</span></span>
                <span>high {Math.max(...levels)}</span>
              </div>
            </>
          ) : (
            <div className="mt-4 flex flex-1 flex-col items-center justify-center text-center">
              <div className="font-heading text-3xl font-bold tabular-nums text-slate-900">{part.onHand}</div>
              <p className="mt-1 text-xs text-slate-400">
                on hand · a trend appears once this part has moved more than once
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Movement history */}
      <div className="glass-panel rounded-xl flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Stock movement</h2>
          <span className="text-xs text-slate-400">{rows.length} entries</span>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className={th}>When</th>
                <th className={th}>Type</th>
                <th className={th}>Qty Δ</th>
                <th className={th}>After</th>
                <th className={th}>Reason</th>
                <th className={th}>Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                  <td className={cn(tdc, 'text-slate-600')}>{relTime(m.at)}</td>
                  <td className={tdc}><Badge tone={mvTone(m.kind)}>{m.kind}</Badge></td>
                  <td className={cn(tdc, 'tabular-nums font-medium', m.delta > 0 ? 'text-emerald-600' : m.delta < 0 ? 'text-red-600' : 'text-slate-500')}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </td>
                  <td className={cn(tdc, 'tabular-nums text-slate-700')}>{m.after}</td>
                  <td className={cn(tdc, 'text-slate-600')}>
                    {m.reason}
                    {m.actor && <span className="text-slate-400"> · {m.actor}</span>}
                  </td>
                  <td className={cn(tdc, 'font-mono text-xs text-slate-500')}>{m.reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {ledgerLoading && (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          )}

          {!ledgerLoading && rows.length === 0 && (
            <EmptyState
              icon="📒"
              title="No movements recorded"
              description="Every receipt, issue and adjustment is written here as it happens. Nothing has moved this part since the ledger started."
            />
          )}
        </div>
      </div>

      {dialog === 'adjust' && <AdjustStockDialog part={part} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && <PartDialog existing={part} onClose={() => setDialog(null)} />}
    </div>
  );
}
