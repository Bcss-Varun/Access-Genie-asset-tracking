import { useState } from 'react';
import type { Webhook } from '@access-genie/shared';
import { allWebhooks } from '@/lib/dataset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormDialog, Field, TextInput, CheckField } from '@/components/ui/FormDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { useMutate } from '@/api/mutate';
import { webhooksApi } from '@/api/platform';
import { webhookTestApi } from '@/api/configuration';
import { cn, relTime } from '@/lib/utils';

/**
 * Outbound event delivery.
 *
 * Every control on this page used to be local: enabling a webhook flipped a
 * boolean in React, and "Test" raised a success toast without a request leaving
 * the browser — which is the one thing a test button must not do, since
 * reachability is the only question it exists to answer.
 */

/** The events worth subscribing to. Kept here because the emitter defines them. */
const EVENTS = [
  'asset.created',
  'asset.updated',
  'asset.moved',
  'work_order.created',
  'work_order.completed',
  'alert.raised',
  'alert.resolved',
  'geofence.breach',
  'stock.low',
];

function WebhookDialog({ existing, onClose }: { existing?: Webhook; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const [url, setUrl] = useState(existing?.url ?? 'https://');
  const [events, setEvents] = useState<string[]>(existing?.events ?? ['asset.created']);
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);

  const toggleEvent = (event: string) =>
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));

  const submit = async () => {
    const ok = await run(
      existing ? webhooksApi.update(existing.id, { url, events, enabled }) : webhooksApi.create({ url, events, enabled }),
      {
        success: existing ? 'Endpoint updated' : 'Endpoint registered',
        successDetail: `${events.length} event${events.length === 1 ? '' : 's'} → ${url}`,
        describe: existing ? 'save that endpoint' : 'register that endpoint',
      },
    );
    if (ok) onClose();
  };

  // An endpoint with no events subscribed would be registered and never fire.
  const valid = /^https?:\/\/.+\..+/.test(url) && events.length > 0;

  return (
    <FormDialog
      icon="🔗"
      title={existing ? 'Edit endpoint' : 'Add a webhook'}
      description="Events are delivered as a JSON POST as soon as they happen."
      submitLabel={existing ? 'Save' : 'Register'}
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="Endpoint URL" required hint="Must be reachable from the server running this platform.">
        <TextInput autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.example.com/genie" />
      </Field>

      <Field label={`Events — ${events.length} selected`} required>
        <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
          {EVENTS.map((event) => (
            <label key={event} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={events.includes(event)}
                onChange={() => toggleEvent(event)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500/30"
              />
              <code className="font-mono text-xs">{event}</code>
            </label>
          ))}
        </div>
      </Field>

      <CheckField label="Enabled" hint="Disabled endpoints keep their configuration but receive nothing." checked={enabled} onChange={setEnabled} />
    </FormDialog>
  );
}

export default function WebhooksPage() {
  const { toast } = useToast();
  const { run, isPending } = useMutate();

  const hooks = allWebhooks;
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; hook: Webhook } | null>(null);
  const [deleting, setDeleting] = useState<Webhook | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const active = hooks.filter((h) => h.enabled).length;
  const failing = hooks.filter((h) => !h.ok).length;

  const toggle = (h: Webhook) =>
    void run(webhooksApi.update(h.id, { enabled: !h.enabled }), {
      success: h.enabled ? 'Webhook disabled' : 'Webhook enabled',
      successDetail: h.url,
      describe: `${h.enabled ? 'disable' : 'enable'} that endpoint`,
    });

  /**
   * Deliberately not routed through `useMutate`: a failed delivery is a result,
   * not a failed request, and reporting it as "Could not test" would hide the
   * status code that says *why* the endpoint is unhealthy.
   */
  const test = async (h: Webhook) => {
    setTesting(h.id);
    try {
      const result = await webhookTestApi.test(h.id);
      toast({
        title: result.ok ? 'Ping delivered' : 'Delivery failed',
        description: `${result.detail} · ${result.ms} ms`,
        tone: result.ok ? 'success' : 'error',
      });
    } catch {
      toast({ title: 'Could not run the test', description: 'The request did not complete.', tone: 'error' });
    } finally {
      setTesting(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    await run(webhooksApi.remove(deleting.id), { success: 'Endpoint removed', successDetail: deleting.url, describe: 'remove that endpoint' });
    setDeleting(null);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Webhooks"
        subtitle="Outbound event delivery — push asset & work-order events to your systems in real time."
        breadcrumb={[{ label: 'Administration' }, { label: 'Webhooks' }]}
        actions={<Button onClick={() => setDialog({ mode: 'new' })}>+ Add Webhook</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:max-w-md">
        <KpiCard label="Active Endpoints" value={active} sub="Delivering events" tone="emerald" accent />
        <KpiCard label="Failing" value={failing} sub="Delivery errors" tone="red" />
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        {hooks.length === 0 ? (
          <EmptyState
            icon="🔗"
            title="No endpoints registered"
            description="Register a URL and the platform will POST events to it as they happen — an asset moving, a work order closing, a geofence breaching."
            action={<Button onClick={() => setDialog({ mode: 'new' })}>+ Add Webhook</Button>}
          />
        ) : (
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
                        {h.lastDelivery ? relTime(h.lastDelivery) : 'never'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" disabled={testing === h.id} onClick={() => void test(h)}>
                          {testing === h.id ? 'Pinging…' : 'Test'}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => toggle(h)}>
                          {h.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'edit', hook: h })}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(h)}>
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog?.mode === 'new' && <WebhookDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit' && <WebhookDialog existing={dialog.hook} onClose={() => setDialog(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Remove this endpoint?"
          description={<>Events will stop being delivered to <code className="font-mono text-xs">{deleting.url}</code>.</>}
          confirmLabel="Remove"
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
