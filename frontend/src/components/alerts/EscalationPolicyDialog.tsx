import { useState } from 'react';
import type { EscalationPolicy, EscalationTier } from '@access-genie/shared';
import { FormDialog, Field, FieldRow, Select, TextInput } from '@/components/ui/FormDialog';
import { Button } from '@/components/ui/Button';
import { useMutate } from '@/api/mutate';
import { governanceApi } from '@/api/platform';
import { allTeams } from '@/lib/dataset';
import { allUsers } from '@/lib/rbac';

/**
 * Who gets woken up, and when.
 *
 * A policy is a ladder: notify someone, wait, notify someone more senior. The
 * only thing that makes it a policy rather than a list is the delay between
 * rungs, so `afterMin` is a first-class field on every tier and tier 1 is
 * pinned at zero — the first notification is the alert itself, and a policy
 * that waits before telling anyone is a policy nobody wants.
 */

const SEVERITIES = ['Critical', 'High', 'Warning', 'Info'];
const TONE_FOR: Record<string, string> = { Critical: 'red', High: 'amber', Warning: 'amber', Info: 'slate' };
const CHANNELS = ['Email', 'SMS', 'Push', 'Slack', 'Phone call', 'Webhook'];

export function EscalationPolicyDialog({ existing, onClose }: { existing?: EscalationPolicy; onClose: () => void }) {
  const { run, isPending } = useMutate();

  const recipients = [
    ...allTeams.map((t) => `${t.name} (team)`),
    ...allUsers.map((u) => u.name),
    'On-call primary',
    'On-call secondary',
  ];

  const [name, setName] = useState(existing?.name ?? '');
  const [scope, setScope] = useState(existing?.scope ?? '');
  const [severity, setSeverity] = useState(existing?.severity ?? 'Critical');
  const [tiers, setTiers] = useState<EscalationTier[]>(
    existing?.tiers?.length
      ? existing.tiers
      : [{ tier: 1, notify: recipients[0] ?? 'On-call primary', afterMin: 0, channels: ['Push', 'Email'] }],
  );

  const patchTier = (index: number, patch: Partial<EscalationTier>) =>
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const addTier = () =>
    setTiers((prev) => [
      ...prev,
      {
        tier: prev.length + 1,
        notify: recipients[Math.min(prev.length, recipients.length - 1)] ?? 'On-call secondary',
        // Each rung waits longer than the last — a ladder whose rungs are all
        // five minutes apart pages everybody at once.
        afterMin: (prev[prev.length - 1]?.afterMin ?? 0) + 15,
        channels: ['Push', 'Email'],
      },
    ]);

  // Tiers are renumbered on removal, so the ladder never shows a gap.
  const removeTier = (index: number) =>
    setTiers((prev) => prev.filter((_, i) => i !== index).map((t, i) => ({ ...t, tier: i + 1 })));

  const toggleChannel = (index: number, channel: string) =>
    patchTier(index, {
      channels: tiers[index]?.channels.includes(channel)
        ? tiers[index].channels.filter((c) => c !== channel)
        : [...(tiers[index]?.channels ?? []), channel],
    });

  const submit = async () => {
    const body = {
      name: name.trim(),
      scope: scope.trim(),
      severity,
      tone: TONE_FOR[severity] ?? 'slate',
      tiers: tiers.map((t, i) => ({ ...t, tier: i + 1, afterMin: i === 0 ? 0 : t.afterMin })),
    };

    const ok = await run(
      existing ? governanceApi.updateEscalationPolicy(existing.id, body) : governanceApi.createEscalationPolicy(body),
      {
        success: existing ? 'Policy saved' : `${name.trim()} created`,
        successDetail: `${tiers.length} tier${tiers.length === 1 ? '' : 's'} · ${severity}`,
        describe: existing ? 'save that policy' : 'create that policy',
      },
    );
    if (ok) onClose();
  };

  const valid = name.trim().length >= 2 && tiers.every((t) => t.notify && t.channels.length > 0);

  return (
    <FormDialog
      icon="📣"
      title={existing ? `Edit ${existing.name}` : 'New escalation policy'}
      description="Tiers run in order. Each waits its delay before notifying, unless the alert has already been acknowledged."
      submitLabel={existing ? 'Save' : 'Create policy'}
      width="lg"
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Policy name" required>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Critical asset offline" />
        </Field>
        <Field label="Severity it applies to">
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)} options={SEVERITIES.map((s) => ({ value: s, label: s }))} />
        </Field>
      </FieldRow>

      <Field label="Scope" hint="Which alerts this covers — a facility, a category, or the whole estate.">
        <TextInput value={scope} onChange={(e) => setScope(e.target.value)} placeholder="All facilities · Critical assets" />
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Escalation ladder — {tiers.length}</span>
          <button type="button" onClick={addTier} className="text-xs font-semibold text-primary-600 hover:text-primary-700">
            + Add tier
          </button>
        </div>

        <div className="space-y-2">
          {tiers.map((tier, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-end gap-2">
                <span className="mb-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Notify</label>
                  <Select
                    value={tier.notify}
                    onChange={(e) => patchTier(i, { notify: e.target.value })}
                    options={recipients.map((r) => ({ value: r, label: r }))}
                  />
                </div>

                <div className="w-32 shrink-0">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">After (min)</label>
                  <TextInput
                    type="number"
                    min={0}
                    value={i === 0 ? 0 : tier.afterMin}
                    disabled={i === 0}
                    title={i === 0 ? 'The first tier fires with the alert itself' : undefined}
                    onChange={(e) => patchTier(i, { afterMin: Number(e.target.value) || 0 })}
                  />
                </div>

                <button
                  type="button"
                  aria-label="Remove tier"
                  disabled={tiers.length === 1}
                  onClick={() => removeTier(i)}
                  className="mb-1 shrink-0 rounded px-1.5 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                >
                  ✕
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
                {CHANNELS.map((c) => {
                  const on = tier.channels.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleChannel(i, c)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        on ? 'border-primary-300 bg-primary-100 text-primary-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end border-t border-slate-100 pt-3">
        <Button type="button" variant="ghost" onClick={addTier}>
          + Add another tier
        </Button>
      </div>
    </FormDialog>
  );
}
