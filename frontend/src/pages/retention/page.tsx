import { useState } from 'react';
import type { RetentionPolicy } from '@access-genie/shared';
import { allRetentionPolicies } from '@/lib/dataset';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormDialog, Field, FieldRow, CheckField, Select, TextInput } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { governanceApi } from '@/api/platform';
import { retentionApi } from '@/api/configuration';
import { cn } from '@/lib/utils';

/**
 * Retention and legal hold.
 *
 * Placing a legal hold flipped a boolean in React and said "(demo)" out loud.
 * A hold is a legal instruction that disposal must stop; a control that
 * announces one without recording it is the worst possible outcome for the one
 * thing this screen exists to do.
 */

const RETENTION_PERIODS = ['1 year', '3 years', '5 years', '7 years', '10 years', 'Indefinite'];
const DISPOSAL_METHODS = [
  'Secure erase (NIST 800-88)',
  'Cryptographic erasure',
  'Physical destruction',
  'Anonymise and retain',
  'Delete from all systems',
];

function PolicyDialog({ onClose }: { onClose: () => void }) {
  const { run, isPending } = useMutate();
  const [dataClass, setDataClass] = useState('');
  const [retention, setRetention] = useState(RETENTION_PERIODS[2] as string);
  const [disposal, setDisposal] = useState(DISPOSAL_METHODS[0] as string);
  const [legalHold, setLegalHold] = useState(false);

  const submit = async () => {
    const ok = await run(retentionApi.create({ dataClass: dataClass.trim(), retention, disposal, legalHold }), {
      success: 'Policy created',
      successDetail: `${dataClass.trim()} — kept ${retention.toLowerCase()}, then ${disposal.toLowerCase()}.`,
      describe: 'create that policy',
    });
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="🗄️"
      title="New retention policy"
      description="A class of data the organisation holds, how long it is kept, and what happens to it after."
      submitLabel="Create policy"
      busy={isPending}
      disabled={dataClass.trim().length < 2}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="Data class" required hint="What the policy governs — be specific enough that it is obvious what is covered.">
        <TextInput autoFocus value={dataClass} onChange={(e) => setDataClass(e.target.value)} placeholder="Asset custody records" />
      </Field>

      <FieldRow>
        <Field label="Retention period">
          <Select value={retention} onChange={(e) => setRetention(e.target.value)} options={RETENTION_PERIODS.map((r) => ({ value: r, label: r }))} />
        </Field>
        <Field label="Disposal method">
          <Select value={disposal} onChange={(e) => setDisposal(e.target.value)} options={DISPOSAL_METHODS.map((d) => ({ value: d, label: d }))} />
        </Field>
      </FieldRow>

      <CheckField
        label="Place under legal hold immediately"
        hint="Freezes disposal regardless of the retention period."
        checked={legalHold}
        onChange={setLegalHold}
      />
    </FormDialog>
  );
}

export default function RetentionPage() {
  const { run, isPending } = useMutate();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RetentionPolicy | null>(null);

  const policies = allRetentionPolicies;

  const toggleHold = (p: RetentionPolicy) =>
    void run(governanceApi.updateRetentionPolicy(p.id, { legalHold: !p.legalHold }), {
      success: p.legalHold ? 'Legal hold released' : 'Legal hold placed',
      successDetail: `${p.dataClass} — disposal is now ${p.legalHold ? 'permitted' : 'frozen'}.`,
      describe: `${p.legalHold ? 'release' : 'place'} that legal hold`,
    });

  const remove = async () => {
    if (!deleting) return;
    await run(retentionApi.remove(deleting.id), {
      success: 'Policy removed',
      successDetail: `${deleting.dataClass} is no longer governed by a retention rule.`,
      describe: 'remove that policy',
    });
    setDeleting(null);
  };

  const onHold = policies.filter((p) => p.legalHold).length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Data Retention & Legal Hold"
        subtitle="Retention schedules, disposal methods, and legal-hold controls by data class."
        breadcrumb={[{ label: 'Compliance' }, { label: 'Retention' }]}
        actions={<Button onClick={() => setCreating(true)}>+ New Policy</Button>}
      />

      <div className="text-sm text-slate-500">
        <span className="font-semibold text-slate-700">{onHold}</span> of {policies.length} data classes are under active legal hold.
      </div>

      <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">Data Class</th>
                <th className="px-6 py-4">Retention Period</th>
                <th className="px-6 py-4">Disposal Method</th>
                <th className="px-6 py-4">Legal Hold</th>
                <th className="px-6 py-4 text-right">Hold</th>
                <th className="px-6 py-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {policies.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-medium text-slate-900">{p.dataClass}</span>
                    <div className="text-[11px] font-mono text-slate-400">{p.id}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{p.retention}</td>
                  <td className="px-6 py-4 text-slate-600">{p.disposal}</td>
                  <td className="px-6 py-4">
                    {p.legalHold
                      ? <Badge tone="amber">On Hold</Badge>
                      : <Badge tone="slate">None</Badge>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      role="switch"
                      aria-checked={p.legalHold}
                      disabled={isPending}
                      onClick={() => toggleHold(p)}
                      className={cn(
                        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
                        p.legalHold ? 'bg-amber-500' : 'bg-slate-300',
                      )}
                      aria-label={`Toggle legal hold for ${p.dataClass}`}
                    >
                      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', p.legalHold ? 'translate-x-5' : 'translate-x-0.5')} />
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(p)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {policies.length === 0 && (
            <EmptyState
              icon="🗄️"
              title="No retention policies"
              description="Every class of data this organisation holds should have a stated retention period and disposal method. Without one, nothing is ever formally allowed to be deleted."
              action={<Button onClick={() => setCreating(true)}>+ New Policy</Button>}
            />
          )}
        </div>
      </div>

      {creating && <PolicyDialog onClose={() => setCreating(false)} />}
      {deleting && (
        <ConfirmDialog
          title={`Remove the ${deleting.dataClass} policy?`}
          description="That class of data will no longer have a stated retention period or disposal method."
          confirmLabel="Remove"
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
