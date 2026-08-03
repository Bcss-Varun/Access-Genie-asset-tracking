import { Link, useParams } from 'react-router-dom';
import { getPart, getWarehouse, getSupplier } from '@/lib/dataset';
import type { AbcClass } from '@access-genie/shared';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, formatMoney } from '@/lib/utils';

const abcTone = (c: AbcClass): 'red' | 'amber' | 'slate' =>
  c === 'A' ? 'red' : c === 'B' ? 'amber' : 'slate';

// Deterministic seed from the SKU string → stable across renders (no hydration drift).
function seedFrom(s: string): number {
  return [...s].reduce((a, c) => a + c.charCodeAt(0), 0);
}

// ~8 deterministic historical stock levels leading up to current on-hand.
function stockHistory(sku: string, onHand: number, reorderPoint: number): number[] {
  const seed = seedFrom(sku);
  const amp = Math.max(2, Math.round(reorderPoint * 0.9));
  const pts = Array.from({ length: 7 }, (_, i) => {
    const wave = Math.sin((i + seed) / 1.7) * amp;
    const drift = (3 - i) * (amp * 0.15); // gentle downward drift toward the present
    return Math.max(0, Math.round(onHand + wave + drift));
  });
  return [...pts, onHand]; // last period is the true current level
}

type Movement = { period: string; type: 'Receipt' | 'Issue' | 'Adjustment'; qty: number; ref: string };

// Deterministic movement ledger derived from consecutive stock deltas.
function movements(sku: string, levels: number[]): Movement[] {
  const seed = seedFrom(sku);
  const rows: Movement[] = [];
  for (let i = 1; i < levels.length; i++) {
    const delta = levels[i] - levels[i - 1];
    const weeksAgo = levels.length - i;
    const period = weeksAgo === 1 ? 'This week' : `${weeksAgo}w ago`;
    if (delta > 0) {
      rows.push({ period, type: 'Receipt', qty: delta, ref: `PO-${1000 + ((seed + i) % 900)}` });
    } else if (delta < 0) {
      rows.push({ period, type: 'Issue', qty: delta, ref: `WO-${4000 + ((seed + i * 7) % 900)}` });
    } else {
      rows.push({ period, type: 'Adjustment', qty: 0, ref: `ADJ-${100 + ((seed + i) % 90)}` });
    }
  }
  return rows.reverse(); // most recent first
}

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
  const part = getPart(sku);

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
  const levels = stockHistory(part.sku, part.onHand, part.reorderPoint);
  const ledger = movements(part.sku, levels);

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

  const mvTone = (t: Movement['type']): 'emerald' | 'red' | 'slate' =>
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
              <Button
                variant="primary"
                onClick={() => toast({ title: 'Reorder placed', description: `Draft PO created for ${part.name} (lead time ${part.leadTimeDays}d).`, tone: 'success' })}
              >
                Reorder now
              </Button>
              <Button
                variant="outline"
                onClick={() => toast({ title: 'Adjust stock', description: `Opening stock adjustment for ${part.sku}.`, tone: 'info' })}
              >
                Adjust
              </Button>
              <Button
                variant="outline"
                onClick={() => toast({ title: 'Issued to WO', description: `${part.sku} staged for issue to a work order.`, tone: 'info' })}
              >
                Issue to WO
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

        {/* Sparkline card */}
        <div className="glass-panel rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">Stock level</h2>
            <span className="text-xs text-slate-400">Last 8 periods</span>
          </div>
          <div className="mt-4 flex-1 flex flex-col justify-center">
            <Sparkline values={levels} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 tabular-nums">
            <span>low {Math.min(...levels)}</span>
            <span>now <span className="font-semibold text-slate-700">{part.onHand}</span></span>
            <span>high {Math.max(...levels)}</span>
          </div>
        </div>
      </div>

      {/* Movement history */}
      <div className="glass-panel rounded-xl flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Stock movement</h2>
          <span className="text-xs text-slate-400">{ledger.length} entries</span>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className={th}>Period</th>
                <th className={th}>Type</th>
                <th className={th}>Qty Δ</th>
                <th className={th}>Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.map((m, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className={cn(tdc, 'text-slate-600')}>{m.period}</td>
                  <td className={tdc}><Badge tone={mvTone(m.type)}>{m.type}</Badge></td>
                  <td className={cn(tdc, 'tabular-nums font-medium', m.qty > 0 ? 'text-emerald-600' : m.qty < 0 ? 'text-red-600' : 'text-slate-500')}>
                    {m.qty > 0 ? `+${m.qty}` : m.qty}
                  </td>
                  <td className={cn(tdc, 'font-mono text-xs text-slate-500')}>{m.ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
