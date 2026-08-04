import { useState } from 'react';
import type { ReportSubscription, SubscriptionCadence } from '@access-genie/shared';
import { SUBSCRIPTION_CADENCES } from '@access-genie/shared';
import { allReports, allReportSubscriptions } from '@/lib/dataset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormDialog, Field, FieldRow, Select, TextArea, TextInput } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { subscriptionsApi } from '@/api/configuration';
import { cn, relTime } from '@/lib/utils';

/**
 * Standing report deliveries.
 *
 * This page used to derive its rows from a hard-coded map keyed by report id —
 * three fixed subscriptions with invented recipient lists that no button could
 * create, edit or remove. They are records now, so the schedule on screen is
 * the schedule that exists.
 *
 * Pausing does not re-base `nextRun`; changing the cadence does. Resuming a
 * paused subscription should carry on where it left off, not restart the
 * calendar from today.
 */

const FORMATS = ['PDF', 'CSV', 'JSON', 'Excel'];

function SubscriptionDialog({ existing, onClose }: { existing?: ReportSubscription; onClose: () => void }) {
  const { run, isPending } = useMutate();

  // A report can only be subscribed to once per person, so anything already
  // subscribed is dropped from the picker rather than offered and refused.
  const taken = new Set(allReportSubscriptions.map((s) => s.reportId));
  const available = allReports.filter((r) => existing?.reportId === r.id || !taken.has(r.id));

  const [reportId, setReportId] = useState(existing?.reportId ?? available[0]?.id ?? '');
  const [cadence, setCadence] = useState<SubscriptionCadence>(existing?.cadence ?? 'Weekly');
  const [format, setFormat] = useState(existing?.format ?? 'PDF');
  const [recipientsText, setRecipientsText] = useState((existing?.recipients ?? []).join('\n'));

  const recipients = recipientsText
    .split(/[\n,;]/)
    .map((r) => r.trim())
    .filter(Boolean);

  const invalid = recipients.filter((r) => !/^\S+@\S+\.\S+$/.test(r));

  const submit = async () => {
    const ok = await run(
      existing
        ? subscriptionsApi.update(existing.id, { cadence, format, recipients })
        : subscriptionsApi.create({ reportId, cadence, format, recipients }),
      {
        success: existing ? 'Subscription updated' : 'Subscription created',
        successDetail: `${cadence} · ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`,
        describe: existing ? 'save that subscription' : 'create that subscription',
      },
    );
    if (ok) onClose();
  };

  if (available.length === 0 && !existing) {
    return (
      <FormDialog
        icon="📬"
        title="Nothing left to subscribe to"
        description="Every report already has a subscription."
        submitLabel="Close"
        onSubmit={onClose}
        onCancel={onClose}
      >
        <p className="text-sm text-slate-500">
          {allReports.length === 0
            ? 'There are no reports yet — define one under Analytics ▸ Report Library first.'
            : 'Edit an existing subscription instead, or remove one to free up its report.'}
        </p>
      </FormDialog>
    );
  }

  return (
    <FormDialog
      icon="📬"
      title={existing ? `Edit ${existing.reportName} delivery` : 'New subscription'}
      description="The report is generated on this schedule and delivered to everyone listed."
      submitLabel={existing ? 'Save' : 'Subscribe'}
      busy={isPending}
      disabled={recipients.length === 0 || invalid.length > 0 || !reportId}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="Report" required hint={existing ? 'A subscription stays with its report.' : undefined}>
        {existing ? (
          <TextInput value={existing.reportName} disabled />
        ) : (
          <Select
            value={reportId}
            onChange={(e) => setReportId(e.target.value)}
            options={available.map((r) => ({ value: r.id, label: `${r.name} · ${r.category}` }))}
          />
        )}
      </Field>

      <FieldRow>
        <Field label="Cadence" hint={existing ? 'Changing this re-bases the schedule from today.' : undefined}>
          <Select
            value={cadence}
            onChange={(e) => setCadence(e.target.value as SubscriptionCadence)}
            options={SUBSCRIPTION_CADENCES.map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <Field label="Format">
          <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS.map((f) => ({ value: f, label: f }))} />
        </Field>
      </FieldRow>

      <Field label={`Recipients — ${recipients.length}`} required hint="One email per line, or comma separated.">
        <TextArea
          rows={4}
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          placeholder={'exec-team@company.com\nfinance@company.com'}
        />
      </Field>

      {invalid.length > 0 && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          Not a valid email address: {invalid.join(', ')}
        </p>
      )}
    </FormDialog>
  );
}

export default function SubscriptionsPage() {
  const { run, isPending } = useMutate();
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; sub: ReportSubscription } | null>(null);
  const [deleting, setDeleting] = useState<ReportSubscription | null>(null);

  const subs = allReportSubscriptions;
  const active = subs.filter((s) => s.enabled).length;
  const recipients = new Set(subs.flatMap((s) => s.recipients)).size;

  const toggle = (s: ReportSubscription) =>
    void run(subscriptionsApi.update(s.id, { enabled: !s.enabled }), {
      success: s.enabled ? 'Subscription paused' : 'Subscription resumed',
      successDetail: s.enabled
        ? `${s.reportName} will not be delivered until resumed.`
        : `${s.reportName} resumes on its existing schedule.`,
      describe: `${s.enabled ? 'pause' : 'resume'} that subscription`,
    });

  const remove = async () => {
    if (!deleting) return;
    await run(subscriptionsApi.remove(deleting.id), {
      success: 'Subscription removed',
      successDetail: deleting.reportName,
      describe: 'remove that subscription',
    });
    setDeleting(null);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Subscriptions"
        subtitle="Scheduled report deliveries — who receives what, and how often."
        breadcrumb={[{ label: 'Analytics', href: '/reports' }, { label: 'Subscriptions' }]}
        actions={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Subscription</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Subscriptions" value={subs.length} sub="Standing deliveries" tone="primary" accent />
        <KpiCard label="Active" value={active} sub={`${subs.length - active} paused`} tone="emerald" />
        <KpiCard label="Recipients" value={recipients} sub="Distinct addresses" tone="slate" />
      </div>

      {subs.length === 0 ? (
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="📬"
            title="No subscriptions"
            description="A subscription delivers a report on a schedule without anyone remembering to run it. Without one, every report is a manual job."
            action={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Subscription</Button>}
          />
        </div>
      ) : (
        <div className="glass-panel rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Report</th>
                  <th className="px-5 py-2.5">Cadence</th>
                  <th className="px-5 py-2.5">Recipients</th>
                  <th className="px-5 py-2.5">Next run</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-800">{s.reportName}</div>
                      <div className="text-xs text-slate-400">
                        {s.id} · {s.format}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone="slate">{s.cadence}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-slate-700">
                        {s.recipients.length} address{s.recipients.length === 1 ? '' : 'es'}
                      </div>
                      <div className="truncate text-xs text-slate-400" title={s.recipients.join(', ')}>
                        {s.recipients.slice(0, 2).join(', ')}
                        {s.recipients.length > 2 && ` +${s.recipients.length - 2}`}
                      </div>
                    </td>
                    <td className={cn('px-5 py-3', s.enabled ? 'text-slate-600' : 'text-slate-300')}>
                      {s.enabled ? relTime(s.nextRun) : 'paused'}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={s.enabled ? 'emerald' : 'slate'}>{s.enabled ? 'Active' : 'Paused'}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => toggle(s)}>
                          {s.enabled ? 'Pause' : 'Resume'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'edit', sub: s })}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(s)}>
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dialog?.mode === 'new' && <SubscriptionDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit' && <SubscriptionDialog existing={dialog.sub} onClose={() => setDialog(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Remove the ${deleting.reportName} subscription?`}
          description="Nobody on the list will receive it again. The report itself is untouched."
          confirmLabel="Remove"
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
