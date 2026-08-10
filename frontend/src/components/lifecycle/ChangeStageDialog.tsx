import { useState } from 'react';
import { LIFECYCLE_APPROVAL_REQUIRED, LIFECYCLE_FLOW, type Asset, type LifecycleStage } from '@access-genie/shared';
import { FormDialog, Field, Select, TextArea, optionsFrom } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { lifecycleApi } from '@/api/lifecycle';

/**
 * The one way an asset's lifecycle stage changes by hand — §2 of the module
 * spec. There is no dropdown or drag target anywhere else that writes
 * `lifecycleStage`; every path, single or bulk, funnels through here and
 * through the server's flow graph.
 *
 * Single mode restricts the target to `LIFECYCLE_FLOW[current]`, the same
 * graph the server enforces, so a rejected submission never happens on a
 * well-behaved click. Bulk mode cannot do that — the selection may span
 * several current stages — so it offers every stage and leans on the
 * server's per-asset partial-success report instead.
 */

type Props =
  | { mode: 'single'; asset: Asset; onClose: () => void; onDone?: () => void }
  | { mode: 'bulk'; assetIds: string[]; initialStage?: LifecycleStage; onClose: () => void; onDone?: () => void };

export function ChangeStageDialog(props: Props) {
  const { run, isPending } = useMutate();
  const [toStage, setToStage] = useState<LifecycleStage>(() =>
    props.mode === 'single'
      ? (LIFECYCLE_FLOW[props.asset.lifecycleStage][0] ?? props.asset.lifecycleStage)
      : (props.initialStage ?? 'Available'),
  );
  const [reason, setReason] = useState('');
  const [comments, setComments] = useState('');

  const options =
    props.mode === 'single'
      ? optionsFrom(LIFECYCLE_FLOW[props.asset.lifecycleStage])
      : optionsFrom(Object.keys(LIFECYCLE_FLOW) as LifecycleStage[]);

  const needsApproval = LIFECYCLE_APPROVAL_REQUIRED.includes(toStage);
  const noLegalMove = props.mode === 'single' && options.length === 0;

  const submit = async () => {
    const input = { toStage, reason: reason.trim(), comments: comments.trim() || undefined };

    if (props.mode === 'single') {
      const result = await run(lifecycleApi.requestStageChange(props.asset.id, input), {
        success: needsApproval ? 'Stage change submitted for approval' : 'Stage updated',
        successDetail: needsApproval
          ? `${props.asset.name} will move to ${toStage} once approved.`
          : `${props.asset.name} → ${toStage}`,
        describe: 'change that asset’s stage',
      });
      if (result) props.onDone?.();
    } else {
      const result = await run(lifecycleApi.bulkStageChange({ ids: props.assetIds, ...input }), {
        success: 'Bulk stage change submitted',
        successDetail: needsApproval ? `Applied where automatic; the rest await approval.` : `Requested for ${props.assetIds.length} assets.`,
        describe: 'change those assets’ stage',
      });
      if (result) props.onDone?.();
    }
    props.onClose();
  };

  return (
    <FormDialog
      icon="🔀"
      title={props.mode === 'single' ? `Change stage — ${props.asset.id}` : `Change stage — ${props.assetIds.length} assets`}
      description={
        props.mode === 'single'
          ? `${props.asset.name} is currently ${props.asset.lifecycleStage}.`
          : 'The current stage varies across the selection — the server applies what each asset’s own flow allows and reports the rest.'
      }
      submitLabel={needsApproval ? 'Submit for approval' : 'Change stage'}
      busy={isPending}
      disabled={noLegalMove || reason.trim().length < 3}
      onSubmit={() => void submit()}
      onCancel={props.onClose}
    >
      {noLegalMove ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {props.mode === 'single' ? props.asset.lifecycleStage : 'This stage'} is a terminal stage — it cannot
          change.
        </p>
      ) : (
        <>
          <Field label="Next stage" required>
            <Select
              autoFocus
              value={toStage}
              onChange={(e) => setToStage(e.target.value as LifecycleStage)}
              options={options}
            />
          </Field>

          {needsApproval && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <strong>{toStage}</strong> requires approval. This opens a pending request instead of changing the
              stage immediately — see Role Permissions for who can decide it.
            </div>
          )}

          <Field label="Reason" required hint="Required — kept on the asset's lifecycle timeline.">
            <TextArea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Commissioning checklist complete"
            />
          </Field>

          <Field label="Comments" hint="Optional — extra detail for whoever reviews the history.">
            <TextArea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
