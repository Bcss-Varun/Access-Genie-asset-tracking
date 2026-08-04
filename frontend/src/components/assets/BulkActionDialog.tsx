import { useState } from 'react';
import type { AssetStatus, Criticality } from '@access-genie/shared';
import { ASSET_STATUSES, CRITICALITIES } from '@access-genie/shared';
import { FormDialog, Field, Select, TextInput } from '@/components/ui/FormDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { useMutate } from '@/api/mutate';
import { assetsApi } from '@/api/assets';
import { flattenScope } from '@/lib/rbac';
import { allUsers } from '@/lib/rbac';

/**
 * Apply one change to a selection.
 *
 * The bulk bar used to offer five actions that each raised a toast naming the
 * action and the count, and changed nothing. Three of them are real operations
 * on an asset record and are implemented here; the other two are elsewhere,
 * because they already exist as their own flows and duplicating them would give
 * the estate two ways to do the same thing that could disagree.
 *
 * The server applies these one at a time so each keeps its activity entry and
 * its effect on tracking — and reports which ones failed rather than rolling
 * the whole selection back.
 */

export type BulkAction = 'status' | 'custodian' | 'criticality' | 'location';

const TITLES: Record<BulkAction, string> = {
  status: 'Change status',
  custodian: 'Assign custodian',
  criticality: 'Set criticality',
  location: 'Move to location',
};

export function BulkActionDialog({
  action,
  ids,
  onClose,
}: {
  action: BulkAction;
  ids: string[];
  onClose: () => void;
}) {
  const { run, isPending } = useMutate();
  const { toast } = useToast();

  const places = flattenScope().filter(({ node }) => node.level !== 'org' && node.level !== 'region');

  const [status, setStatus] = useState<AssetStatus>('Active');
  const [custodian, setCustodian] = useState(allUsers[0]?.name ?? '');
  const [criticality, setCriticality] = useState<Criticality>('Medium');
  const [locationId, setLocationId] = useState(places[0]?.node.id ?? '');

  const submit = async () => {
    let patch: Record<string, unknown>;
    let summary: string;

    switch (action) {
      case 'status':
        patch = { status };
        summary = `status → ${status}`;
        break;
      case 'custodian':
        patch = { custodian: custodian.trim() };
        summary = `custodian → ${custodian.trim() || 'Unassigned'}`;
        break;
      case 'criticality':
        patch = { criticality };
        summary = `criticality → ${criticality}`;
        break;
      case 'location': {
        const node = places.find((p) => p.node.id === locationId)?.node;
        if (!node) return;
        patch = { location: { id: node.id, name: node.name } };
        summary = `moved to ${node.name}`;
        break;
      }
    }

    const result = await run(assetsApi.bulkUpdate(ids, patch), {
      describe: 'apply that change',
      // A location change moves assets, so the map has to follow.
      refreshTracking: action === 'location',
    });
    if (!result) return;

    toast({
      title: `${result.updated.length} of ${ids.length} updated`,
      description:
        result.failed.length > 0
          ? `${summary}. ${result.failed.length} could not be changed: ${result.failed[0]?.reason}`
          : summary,
      tone: result.failed.length > 0 ? 'info' : 'success',
    });
    onClose();
  };

  return (
    <FormDialog
      icon="✏️"
      title={`${TITLES[action]} — ${ids.length} asset${ids.length === 1 ? '' : 's'}`}
      description="Applied one at a time, so each keeps its own history entry."
      submitLabel={`Apply to ${ids.length}`}
      busy={isPending}
      disabled={action === 'location' && places.length === 0}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      {action === 'status' && (
        <Field label="New status" hint="Retiring an asset here also retires it from the tracking graph.">
          <Select
            autoFocus
            value={status}
            onChange={(e) => setStatus(e.target.value as AssetStatus)}
            options={ASSET_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))}
          />
        </Field>
      )}

      {action === 'custodian' && (
        <Field label="Custodian" hint="Leave blank to unassign.">
          {allUsers.length > 0 ? (
            <Select
              autoFocus
              value={custodian}
              onChange={(e) => setCustodian(e.target.value)}
              options={[{ value: '', label: 'Unassigned' }, ...allUsers.map((u) => ({ value: u.name, label: u.name }))]}
            />
          ) : (
            <TextInput autoFocus value={custodian} onChange={(e) => setCustodian(e.target.value)} />
          )}
        </Field>
      )}

      {action === 'criticality' && (
        <Field label="Criticality" hint="Feeds the risk score — a critical asset in poor health ranks above a low one.">
          <Select
            autoFocus
            value={criticality}
            onChange={(e) => setCriticality(e.target.value as Criticality)}
            options={CRITICALITIES.map((c) => ({ value: c, label: c }))}
          />
        </Field>
      )}

      {action === 'location' && (
        <Field label="Move to" hint="The recorded location. It does not fake a sighting — presence still comes from a reader or a scan.">
          {places.length > 0 ? (
            <Select
              autoFocus
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              options={places.map(({ node, depth }) => ({
                value: node.id,
                label: `${'  '.repeat(Math.max(0, depth - 1))}${node.name}`,
              }))}
            />
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              There are no facilities yet. Add one under Administration ▸ Facilities first.
            </p>
          )}
        </Field>
      )}
    </FormDialog>
  );
}
