import { useState } from 'react';
import type { Asset, CustodyAction } from '@access-genie/shared';
import { FormDialog, Field, Select, TextArea, TextInput } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { custodyApi } from '@/api/catalog';
import { operationsApi } from '@/api/operations';
import { allUsers, flattenScope } from '@/lib/rbac';

/**
 * The three actions the asset profile's "More" menu offered.
 *
 * Each used to raise a toast — "Transfer request drafted", "Asset checked out",
 * "Retirement workflow started" — and change nothing at all. Each is a real
 * operation with an endpoint that already existed and a screen elsewhere that
 * already used it; the menu simply never called any of them.
 *
 * They are dialogs rather than links to those screens because the asset is
 * already chosen here. Sending someone to the transfers page to re-find the
 * asset they were just looking at is the kind of step that makes people stop
 * using the feature.
 */

// ── Custody ──────────────────────────────────────────────────────────────────
export function CustodyDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { run, isPending } = useMutate();

  // An asset nobody holds can only be taken out; one in someone's hands can be
  // returned. Offering both regardless is how the custody chain gets entries
  // that contradict each other.
  const held = Boolean(asset.custodian) && asset.custodian !== 'Unassigned';
  const [action, setAction] = useState<CustodyAction>(held ? 'Checked In' : 'Checked Out');
  const [holder, setHolder] = useState(held ? asset.custodian : (allUsers[0]?.name ?? ''));
  const [note, setNote] = useState('');

  const submit = async () => {
    const ok = await run(
      custodyApi.record({ assetId: asset.id, holder: holder.trim(), action, note: note.trim() || undefined }),
      {
        success: action === 'Checked In' ? 'Checked in' : `${action} — ${holder.trim()}`,
        successDetail:
          action === 'Checked In'
            ? `${asset.name} is back in the pool.`
            : `${asset.name} is now with ${holder.trim()}.`,
        describe: 'record that custody change',
      },
    );
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="🤝"
      title="Custody"
      description={
        held
          ? `${asset.name} is currently with ${asset.custodian}.`
          : `${asset.name} is unassigned — nobody is holding it.`
      }
      submitLabel="Record"
      busy={isPending}
      disabled={action !== 'Checked In' && holder.trim().length < 2}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="Action">
        <Select
          autoFocus
          value={action}
          onChange={(e) => setAction(e.target.value as CustodyAction)}
          options={[
            { value: 'Checked Out', label: 'Check out — hand it to someone' },
            { value: 'Checked In', label: 'Check in — return it to the pool' },
            { value: 'Assigned', label: 'Assign — long-term custodian' },
            { value: 'Transferred', label: 'Transfer — hand between people' },
          ]}
        />
      </Field>

      {action !== 'Checked In' && (
        <Field label="Holder" hint="Who signs for it.">
          {allUsers.length > 0 ? (
            <Select
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              options={allUsers.map((u) => ({ value: u.name, label: `${u.name} — ${u.title}` }))}
            />
          ) : (
            <TextInput value={holder} onChange={(e) => setHolder(e.target.value)} />
          )}
        </Field>
      )}

      <Field label="Note" hint="Optional — kept on the timeline entry, not the custody row.">
        <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Site visit, returns Friday" />
      </Field>
    </FormDialog>
  );
}

// ── Transfer ─────────────────────────────────────────────────────────────────
export function TransferDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const places = flattenScope().filter(({ node }) => node.level !== 'org' && node.level !== 'region');

  const [to, setTo] = useState(places.find((p) => p.node.id !== asset.location.id)?.node.name ?? '');
  const [reason, setReason] = useState('');

  const submit = async () => {
    const ok = await run(operationsApi.requestTransfer({ assetId: asset.id, to, reason: reason.trim() }), {
      success: 'Transfer requested',
      successDetail: `${asset.name} → ${to}. It needs approval before the move is recorded.`,
      describe: 'request that transfer',
    });
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="🚚"
      title="Request a transfer"
      description={`${asset.name} is at ${asset.location.name}. A transfer is a request — approval and dispatch happen on the Transfers board.`}
      submitLabel="Request transfer"
      busy={isPending}
      disabled={!to || reason.trim().length < 3 || places.length === 0}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      {places.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          There is nowhere to transfer to yet — add a facility under Administration ▸ Facilities first.
        </p>
      ) : (
        <>
          <Field label="Destination">
            <Select
              autoFocus
              value={to}
              onChange={(e) => setTo(e.target.value)}
              options={places
                .filter(({ node }) => node.id !== asset.location.id)
                .map(({ node, depth }) => ({
                  value: node.name,
                  label: `${'  '.repeat(Math.max(0, depth - 1))}${node.name}`,
                }))}
            />
          </Field>

          <Field label="Reason" hint="Required — the approver sees this and nothing else.">
            <TextArea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Redeploying to the new line; surplus at current site."
            />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

// Retiring used to be a bare status write here — see git history. It is now
// `ChangeStageDialog` targeting `Retired`, which is a real, approval-gated,
// audited transition instead of a status field and a good intention.
