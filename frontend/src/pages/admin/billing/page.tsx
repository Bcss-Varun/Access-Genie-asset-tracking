import { allInvoices } from '@/lib/dataset';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, formatMoney } from '@/lib/utils';

// Amounts are INR, exclusive of 18% GST (shown separately on the invoice).
const invoices = allInvoices;
const MONTHLY_INR = 1800000;
const GST_RATE = 0.18;

const AUM_USED = 12840;
const AUM_LIMIT = 15000;
const SEATS_USED = 84;
const SEATS_LIMIT = 100;

const usageBreakdown = [
  { label: 'Assets under management', used: AUM_USED, limit: AUM_LIMIT, unit: '' },
  { label: 'Active user seats', used: SEATS_USED, limit: SEATS_LIMIT, unit: '' },
  { label: 'API calls (this month)', used: 3_240_000, limit: 5_000_000, unit: '' },
  { label: 'Telemetry storage', used: 620, limit: 1000, unit: ' GB' },
];

const barColor = (pct: number) => (pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-primary-500');

export default function BillingPage() {
  const { toast } = useToast();
  const aumPct = Math.round((AUM_USED / AUM_LIMIT) * 100);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Billing & Subscription"
        subtitle="Plan, usage & invoices for your Access Genie tenant. All amounts in INR."
        breadcrumb={[{ label: 'Administration' }, { label: 'Billing' }]}
        actions={
          <Button variant="outline" onClick={() => toast({ title: 'Manage plan', description: 'Contact your account executive to change plans.', tone: 'info' })}>
            Manage Plan
          </Button>
        }
      />

      {/* Current plan */}
      <div className="glass-panel rounded-xl p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-xl font-bold text-slate-900">Enterprise</h2>
              <Badge tone="primary">Current Plan</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">Billed annually · Renews 01 Jan 2027 · GSTIN 36AABCA1234F1Z5</p>
          </div>
          <div className="text-right">
            <div className="font-heading text-3xl font-bold text-slate-900">{formatMoney(MONTHLY_INR)}</div>
            <div className="text-xs text-slate-400">per month + {Math.round(GST_RATE * 100)}% GST</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Seats" value={`${SEATS_USED} / ${SEATS_LIMIT}`} sub="Active users" tone="primary" accent />
        <KpiCard label="AUM" value={`${aumPct}%`} sub="Of plan limit" tone={aumPct >= 90 ? 'red' : 'amber'} />
        <KpiCard label="Next Invoice" value={formatMoney(MONTHLY_INR * (1 + GST_RATE))} sub="Incl. GST · due 01 Jul" tone="slate" />
        <KpiCard label="Contract" value="Annual" sub="Renews Jan 2027 · INR" tone="emerald" />
      </div>

      {/* Usage breakdown */}
      <div className="glass-panel rounded-xl p-6">
        <h3 className="mb-4 font-heading font-semibold text-slate-900">Usage Breakdown</h3>
        <div className="space-y-4">
          {usageBreakdown.map((u) => {
            const pct = Math.round((u.used / u.limit) * 100);
            return (
              <div key={u.label}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-slate-700">{u.label}</span>
                  <span className="tabular-nums text-slate-500">
                    {u.used.toLocaleString()}{u.unit} / {u.limit.toLocaleString()}{u.unit}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className={cn('h-full rounded-full', barColor(pct))} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoices */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3">
          <h3 className="font-heading font-semibold text-slate-900">Invoices</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Invoice</th>
                <th className="px-5 py-2.5">Date</th>
                <th className="px-5 py-2.5 text-right">Amount (excl. GST)</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-slate-700">{inv.id}</td>
                  <td className="px-5 py-3 text-slate-600">{inv.date}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-900">{formatMoney(inv.amount)}</td>
                  <td className="px-5 py-3">
                    <Badge tone={inv.status === 'Paid' ? 'emerald' : 'amber'}>{inv.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toast({ title: 'Download', description: `Preparing ${inv.id}.pdf`, tone: 'info' })}
                    >
                      Download
                    </Button>
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
