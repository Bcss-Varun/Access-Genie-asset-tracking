import { useState } from 'react';
import type { EscalationPolicy } from '@access-genie/shared';
import { allEscalationPolicies, allOnCallShifts } from '@/lib/dataset';
import { PageHeader, Badge, EmptyState, Avatar } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EscalationPolicyDialog } from '@/components/alerts/EscalationPolicyDialog';
import { useMutate } from '@/api/mutate';
import { governanceApi } from '@/api/platform';

const initials = (name: string) =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export default function EscalationsPage() {
  const { run, isPending } = useMutate();
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; policy: EscalationPolicy } | null>(null);
  const [deleting, setDeleting] = useState<EscalationPolicy | null>(null);

  // Read the hydrated bindings inside the component — module-scope copies never
  // see a re-hydration after a write.
  const POLICIES = allEscalationPolicies;
  const ROTATION = allOnCallShifts;

  const remove = async () => {
    if (!deleting) return;
    await run(governanceApi.removeEscalationPolicy(deleting.id), {
      success: `${deleting.name} deleted`,
      successDetail: 'Alerts at this severity will no longer escalate on a ladder.',
      describe: 'delete that policy',
    });
    setDeleting(null);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Escalation Policies"
        subtitle="Tiered routing rules and on-call rotation that decide who gets paged when."
        breadcrumb={[{ label: 'Alerts', href: '/alerts' }, { label: 'Escalation Policies' }]}
        actions={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Policy</Button>}
      />

      {POLICIES.length === 0 && (
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="📣"
            title="No escalation policies"
            description="Without one, a critical alert sits in the queue until somebody happens to look. A policy decides who is told, how, and how long to wait before telling somebody more senior."
            action={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Policy</Button>}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {POLICIES.map((p) => (
          <div key={p.id} className="glass-panel rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold font-heading text-slate-900">{p.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{p.scope}</div>
              </div>
              <Badge tone={p.tone as never}>{p.severity}</Badge>
            </div>

            <ol className="space-y-3">
              {p.tiers.map((t, i) => (
                <li key={t.tier} className="relative">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                      {t.tier}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800">{t.notify}</div>
                      <div className="text-xs text-slate-500">
                        {t.afterMin === 0 ? 'Immediately' : `After ${t.afterMin} min`} · {t.channels.join(', ')}
                      </div>
                    </div>
                  </div>
                  {i < p.tiers.length - 1 && <div className="ml-3.5 h-3 w-px bg-slate-200" />}
                </li>
              ))}
            </ol>

            <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono">{p.id}</span>
              <span className="flex items-center gap-2">
                <button className="font-medium text-primary-600 hover:underline" onClick={() => setDialog({ mode: 'edit', policy: p })}>
                  Edit
                </button>
                <button className="font-medium text-slate-400 hover:text-red-600 hover:underline" onClick={() => setDeleting(p)}>
                  Delete
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* On-call rotation */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">On-call rotation</h3>
          <p className="text-xs text-slate-500 mt-0.5">Current weekly schedule — primary and backup responders.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Shift</th>
                <th className="px-5 py-3">Primary</th>
                <th className="px-5 py-3">Secondary</th>
                <th className="px-5 py-3">Coverage window</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ROTATION.map((s) => (
                <tr key={s.day} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-medium text-slate-800">{s.day}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2">
                      <Avatar initials={initials(s.primary)} className="w-7 h-7 text-xs" />
                      <span className="text-slate-700">{s.primary}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2">
                      <Avatar initials={initials(s.secondary)} className="w-7 h-7 text-xs bg-slate-400" />
                      <span className="text-slate-600">{s.secondary}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-600 tabular-nums">{s.window}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialog?.mode === 'new' && <EscalationPolicyDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit' && <EscalationPolicyDialog existing={dialog.policy} onClose={() => setDialog(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          description="Alerts matching this severity will still be raised — they just will not escalate to anyone on a timer."
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
