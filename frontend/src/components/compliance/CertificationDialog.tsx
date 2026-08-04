import { useState } from 'react';
import type { Certification } from '@access-genie/shared';
import { FormDialog, Field, FieldRow, TextInput, dateInDays } from '@/components/ui/FormDialog';
import { AssetPicker } from '@/components/ui/AssetPicker';
import { useMutate } from '@/api/mutate';
import { certificationsApi } from '@/api/maintenance';

/**
 * Record or renew a certificate.
 *
 * Status is not a field here, on purpose. The server derives it from the dates
 * on every write — expired is expired, whatever anyone types — because a
 * register where somebody can mark an out-of-date certificate "Valid" is
 * exactly the failure a compliance register exists to prevent.
 *
 * Renewing opens this with the dates moved forward rather than creating a
 * second record: a certificate is a rolling obligation against one asset, and
 * two rows for the same obligation is how one of them quietly goes unwatched.
 */
export function CertificationDialog({
  existing,
  renew,
  onClose,
}: {
  existing?: Certification;
  /** Pre-fill the dates for a renewal rather than an edit. */
  renew?: boolean;
  onClose: () => void;
}) {
  const { run, isPending } = useMutate();

  const [assetId, setAssetId] = useState(existing?.assetId ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [authority, setAuthority] = useState(existing?.authority ?? '');
  const [issuedAt, setIssuedAt] = useState(
    renew ? new Date().toISOString().slice(0, 10) : (existing?.issuedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)),
  );
  const [expiresAt, setExpiresAt] = useState(renew ? dateInDays(365) : (existing?.expiresAt?.slice(0, 10) ?? dateInDays(365)));

  // The same rule the server applies, shown before you commit — so the form
  // never looks like it is about to save something it is not.
  const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  const derived = daysLeft < 0 ? 'Expired' : daysLeft <= 30 ? 'Expiring' : 'Valid';
  const derivedTone = derived === 'Valid' ? 'bg-emerald-50 text-emerald-800' : derived === 'Expiring' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800';

  const submit = async () => {
    const dates = { issuedAt: new Date(issuedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString() };

    const ok = await run(
      existing
        ? certificationsApi.update(existing.id, { name: name.trim(), authority: authority.trim(), ...dates })
        : certificationsApi.create({ assetId, name: name.trim(), authority: authority.trim(), ...dates }),
      {
        success: renew ? 'Certificate renewed' : existing ? 'Certificate updated' : 'Certificate recorded',
        successDetail: `${name.trim()} — ${derived.toLowerCase()}, ${daysLeft < 0 ? `${Math.abs(daysLeft)} days ago` : `${daysLeft} days left`}.`,
        describe: renew ? 'renew that certificate' : existing ? 'save that certificate' : 'record that certificate',
      },
    );
    if (ok) onClose();
  };

  const valid = name.trim().length >= 2 && authority.trim().length >= 2 && (existing ? true : assetId.length > 0);

  return (
    <FormDialog
      icon="📜"
      title={renew ? `Renew ${existing?.name}` : existing ? `Edit ${existing.name}` : 'Record a certificate'}
      description="Status is worked out from the dates on every save — it cannot be set by hand."
      submitLabel={renew ? 'Renew' : existing ? 'Save' : 'Record'}
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      {existing ? (
        <Field label="Asset">
          <TextInput value={`${existing.assetName} · ${existing.assetId}`} disabled />
        </Field>
      ) : (
        <AssetPicker value={assetId} onChange={setAssetId} required />
      )}

      <FieldRow>
        <Field label="Certificate" required>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Electrical safety certificate" />
        </Field>
        <Field label="Issuing authority" required>
          <TextInput value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="TÜV SÜD" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Issued" required>
          <TextInput type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
        </Field>
        <Field label="Expires" required>
          <TextInput type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
      </FieldRow>

      <div className={`rounded-lg px-3 py-2.5 text-sm ${derivedTone}`}>
        This will be stored as <strong>{derived}</strong> —{' '}
        {daysLeft < 0
          ? `it expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} ago.`
          : daysLeft <= 30
            ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left, inside the 30-day warning window.`
            : `${daysLeft} days left.`}
      </div>
    </FormDialog>
  );
}
