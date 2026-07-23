'use client';

import { mockSuppliers } from '@/lib/mock-data';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

function Stars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn('text-sm leading-none', i <= rounded ? 'text-amber-400' : 'text-slate-300')}>
          ★
        </span>
      ))}
      <span className="ml-1 text-xs font-medium tabular-nums text-slate-500">{rating.toFixed(1)}</span>
    </span>
  );
}

const onTimeColor = (pct: number): string =>
  pct >= 95 ? 'bg-emerald-500' : pct >= 90 ? 'bg-amber-500' : 'bg-red-500';

export default function SuppliersPage() {
  const { toast } = useToast();

  const count = mockSuppliers.length;
  const avgLead = Math.round(mockSuppliers.reduce((s, x) => s + x.leadTimeDays, 0) / count);
  const avgOnTime = Math.round(mockSuppliers.reduce((s, x) => s + x.onTimePct, 0) / count);
  const avgRating = mockSuppliers.reduce((s, x) => s + x.rating, 0) / count;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Suppliers"
        subtitle="Vendor directory — lead times, on-time performance & quality ratings."
        breadcrumb={[
          { label: 'Inventory', href: '/warehouses' },
          { label: 'Suppliers' },
        ]}
        actions={
          <Button
            onClick={() =>
              toast({ title: 'New Supplier', description: 'Supplier onboarding wizard is on the roadmap.', tone: 'info' })
            }
          >
            + New Supplier
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Suppliers" value={count} sub="Active vendors" tone="primary" accent />
        <KpiCard label="Avg Lead Time" value={`${avgLead}d`} sub="Order to delivery" tone="slate" />
        <KpiCard label="Avg On-Time" value={`${avgOnTime}%`} sub="Delivery reliability" tone="slate" />
        <KpiCard label="Avg Rating" value={avgRating.toFixed(1)} sub="Quality score (of 5)" tone="slate" />
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Supplier</th>
                <th className="px-5 py-2.5">Category</th>
                <th className="px-5 py-2.5 text-right">Lead Time</th>
                <th className="px-5 py-2.5">On-Time</th>
                <th className="px-5 py-2.5">Rating</th>
                <th className="px-5 py-2.5">Contact</th>
              </tr>
            </thead>
            <tbody>
              {mockSuppliers.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-400">{s.id}</div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone="slate">{s.category}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{s.leadTimeDays}d</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div className={cn('h-full rounded-full', onTimeColor(s.onTimePct))} style={{ width: `${s.onTimePct}%` }} />
                      </div>
                      <span className="text-xs font-medium tabular-nums text-slate-600">{s.onTimePct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Stars rating={s.rating} />
                  </td>
                  <td className="px-5 py-3">
                    <a href={`mailto:${s.contact}`} className="text-xs font-mono text-primary-600 hover:underline">
                      {s.contact}
                    </a>
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
