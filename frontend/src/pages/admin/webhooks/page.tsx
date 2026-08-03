import { allWebhooks } from '@/lib/dataset';
import type { Webhook } from '@access-genie/shared';
import { useState } from 'react';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime } from '@/lib/utils';

export default function WebhooksPage() {
  const { toast } = useToast();
  const [hooks, setHooks] = useState<Webhook[]>(() => allWebhooks);

  const active = hooks.filter((h) => h.enabled).length;
  const failing = hooks.filter((h) => !h.ok).length;

  const toggle = (h: Webhook) => {
    setHooks((prev) => prev.map((x) => (x.id === h.id ? { ...x, enabled: !x.enabled } : x)));
    toast({
      title: h.enabled ? 'Webhook disabled' : 'Webhook enabled',
      description: h.url,
      tone: h.enabled ? 'info' : 'success',
    });
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Webhooks"
        subtitle="Outbound event delivery — push asset & work-order events to your systems in real time."
        breadcrumb={[{ label: 'Administration' }, { label: 'Webhooks' }]}
        actions={
          <Button
            onClick={() =>
              toast({ title: 'Add Webhook', description: 'The endpoint registration form is on the roadmap.', tone: 'info' })
            }
          >
            + Add Webhook
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:max-w-md">
        <KpiCard label="Active Endpoints" value={active} sub="Delivering events" tone="emerald" accent />
        <KpiCard label="Failing" value={failing} sub="Delivery errors" tone="red" />
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Endpoint URL</th>
                <th className="px-5 py-2.5">Events</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5">Last Delivery</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {hooks.map((h) => (
                <tr key={h.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <code className="font-mono text-xs text-slate-700">{h.url}</code>
                    <div className="text-xs text-slate-400">{h.id}</div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {h.events.map((e) => (
                        <Badge key={e} tone="slate">{e}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={h.enabled ? 'emerald' : 'slate'}>{h.enabled ? 'Enabled' : 'Disabled'}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', h.ok ? 'text-slate-600' : 'text-red-600')}>
                      <span className={cn('h-2 w-2 rounded-full', h.ok ? 'bg-emerald-500' : 'bg-red-500')} />
                      {relTime(h.lastDelivery)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          toast({ title: 'Test event sent', description: `ping delivered to ${h.url}`, tone: 'success' })
                        }
                      >
                        Test
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(h)}>
                        {h.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
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
