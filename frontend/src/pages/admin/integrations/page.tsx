import { useState } from 'react';
import type { Integration, IntegrationStatus } from '@access-genie/shared';
import { allIntegrations } from '@/lib/dataset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormDialog, Field, FieldRow, Select, TextArea, TextInput } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { integrationsApi } from '@/api/configuration';
import { cn, relTime } from '@/lib/utils';

/**
 * Connected systems.
 *
 * "+ Add Integration" opened a toast about a marketplace, and Connect launched
 * nothing. There is no marketplace and no OAuth broker in this deployment, so
 * the page does the thing it can honestly do: record which systems this estate
 * exchanges data with and what state each connection is in.
 *
 * `Sync` sets `lastSync` — that is the field, and the timestamp is the claim.
 * It does not pretend to have transferred records it has no adapter for.
 */

const statusPill: Record<IntegrationStatus, { dot: string; text: string; label: string }> = {
  Connected: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Connected' },
  Error: { dot: 'bg-red-500', text: 'text-red-700', label: 'Error' },
  Disconnected: { dot: 'bg-slate-400', text: 'text-slate-500', label: 'Disconnected' },
};

/** The kinds of system an asset platform actually exchanges data with. */
const CATEGORIES = ['Identity', 'ITSM', 'Finance', 'Procurement', 'Monitoring', 'Messaging', 'Storage', 'Other'];

function IntegrationDialog({ existing, onClose }: { existing?: Integration; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState(existing?.category ?? 'ITSM');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [status, setStatus] = useState<IntegrationStatus>(existing?.status ?? 'Disconnected');

  const submit = async () => {
    const body = { name: name.trim(), category, description: description.trim(), status };
    const ok = await run(existing ? integrationsApi.update(existing.id, body) : integrationsApi.create(body), {
      success: existing ? 'Integration updated' : `${name.trim()} added`,
      successDetail: existing ? undefined : 'Mark it connected once the credentials are in place.',
      describe: existing ? 'save that integration' : 'add that integration',
    });
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="🔌"
      title={existing ? `Edit ${existing.name}` : 'Add an integration'}
      description="Records a system this estate exchanges data with, and the state of that connection."
      submitLabel={existing ? 'Save' : 'Add'}
      busy={isPending}
      disabled={name.trim().length < 1}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Name" required>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ServiceNow" />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </Field>
      </FieldRow>

      <Field label="What it does" hint="Shown on the card, so write it for whoever inherits this estate.">
        <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Raises an incident when an asset's health drops below 45." />
      </Field>

      <Field label="Connection state" hint="Adding a row is not the same as authorising it — leave it disconnected until the credentials are in place.">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as IntegrationStatus)}
          options={[
            { value: 'Disconnected', label: 'Disconnected — not yet authorised' },
            { value: 'Connected', label: 'Connected — exchanging data' },
            { value: 'Error', label: 'Error — needs attention' },
          ]}
        />
      </Field>
    </FormDialog>
  );
}

type Filter = 'All' | IntegrationStatus;
const filters: Filter[] = ['All', 'Connected', 'Error', 'Disconnected'];

export default function IntegrationsPage() {
  const { run, isPending } = useMutate();
  const [filter, setFilter] = useState<Filter>('All');
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; item: Integration } | null>(null);
  const [removing, setRemoving] = useState<Integration | null>(null);

  const connected = allIntegrations.filter((i) => i.status === 'Connected').length;
  const errors = allIntegrations.filter((i) => i.status === 'Error').length;
  const visible = allIntegrations.filter((i) => filter === 'All' || i.status === filter);

  const setStatus = (int: Integration, next: IntegrationStatus) =>
    void run(integrationsApi.setStatus(int.id, next), {
      success: next === 'Connected' ? `${int.name} connected` : `${int.name} disconnected`,
      describe: `update ${int.name}`,
    });

  // Sync stamps `lastSync`. That is the whole claim — nothing here transfers
  // records, and saying otherwise would be the lie this rewrite is removing.
  const sync = (int: Integration) =>
    void run(integrationsApi.update(int.id, {}), {
      success: `${int.name} sync recorded`,
      successDetail: 'Last-sync time updated.',
      describe: `sync ${int.name}`,
    });

  const remove = async () => {
    if (!removing) return;
    await run(integrationsApi.remove(removing.id), { success: `${removing.name} removed`, describe: 'remove that integration' });
    setRemoving(null);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Integrations & API"
        subtitle="Connected systems, adapters & data pipelines across your asset platform."
        breadcrumb={[{ label: 'Administration' }, { label: 'Integrations & API' }]}
        actions={<Button onClick={() => setDialog({ mode: 'new' })}>+ Add Integration</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:max-w-md">
        <KpiCard label="Connected" value={connected} sub="Healthy adapters" tone="emerald" accent />
        <KpiCard label="Errors" value={errors} sub="Needs attention" tone="red" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === f
                ? 'border-primary-200 bg-primary-50 text-primary-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="🔌"
            title={allIntegrations.length === 0 ? 'No integrations yet' : 'No integrations match'}
            description={
              allIntegrations.length === 0
                ? 'Record the systems this estate exchanges data with — your ITSM, your finance ledger, your identity provider — so everyone can see what is wired to what.'
                : 'No integrations match this filter.'
            }
            variant={allIntegrations.length === 0 ? 'empty' : 'no-results'}
            action={
              allIntegrations.length === 0 ? <Button onClick={() => setDialog({ mode: 'new' })}>+ Add Integration</Button> : undefined
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((int) => {
            const pill = statusPill[int.status];
            return (
              <div key={int.id} className="glass-panel flex flex-col rounded-xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-heading font-semibold text-slate-900">{int.name}</h3>
                    <Badge tone="slate" className="mt-1">{int.category}</Badge>
                  </div>
                  <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', pill.text)}>
                    <span className={cn('h-2 w-2 rounded-full', pill.dot)} />
                    {pill.label}
                  </span>
                </div>

                <p className="mt-3 flex-1 text-sm text-slate-500">{int.description || 'No description.'}</p>

                <div className="mt-3 text-xs text-slate-400">
                  Last sync: <span className="font-medium text-slate-600">{relTime(int.lastSync)}</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  {int.status === 'Connected' ? (
                    <>
                      <Button size="sm" variant="outline" disabled={isPending} onClick={() => sync(int)}>
                        Sync
                      </Button>
                      <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setStatus(int, 'Disconnected')}>
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" disabled={isPending} onClick={() => setStatus(int, 'Connected')}>
                      Connect
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'edit', item: int })}>
                    Configure
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(int)}>
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialog?.mode === 'new' && <IntegrationDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit' && <IntegrationDialog existing={dialog.item} onClose={() => setDialog(null)} />}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          description="The record goes; nothing that was already exchanged is affected."
          confirmLabel="Remove"
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
