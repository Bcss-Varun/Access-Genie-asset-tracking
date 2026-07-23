'use client';

import { useState } from 'react';
import { mockWorkflows } from '@/lib/mock-data';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';
import type { ApprovalWorkflow } from '@/types/asset';

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
        on ? 'bg-primary-600' : 'bg-slate-300',
      )}
    >
      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

function WorkflowCard({ wf }: { wf: ApprovalWorkflow }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(wf.status === 'Active');

  return (
    <div className="glass-panel rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-semibold text-slate-900">{wf.name}</h3>
            <Badge tone={enabled ? 'emerald' : 'slate'}>{enabled ? 'Active' : 'Draft'}</Badge>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Trigger:{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">{wf.trigger}</code>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium text-slate-500">{enabled ? 'Enabled' : 'Disabled'}</span>
          <Toggle
            on={enabled}
            label={`Toggle ${wf.name}`}
            onChange={() => {
              setEnabled((v) => !v);
              toast({
                title: enabled ? 'Workflow disabled' : 'Workflow enabled',
                description: `${wf.name} is now ${enabled ? 'inactive' : 'active'}.`,
                tone: enabled ? 'info' : 'success',
              });
            }}
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="flex items-stretch gap-2">
          {wf.steps.map((step, i) => (
            <div key={i} className="flex items-stretch gap-2">
              <div className="min-w-[9.5rem] rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-50 text-[11px] font-bold text-primary-700">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-slate-800">{step.name}</span>
                </div>
                <div className="mt-1.5 pl-7 text-[11px] text-slate-500">
                  Approver: <span className="font-medium text-slate-700">{step.approver}</span>
                </div>
              </div>
              {i < wf.steps.length - 1 && (
                <div className="flex items-center text-slate-300" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const { toast } = useToast();
  const active = mockWorkflows.filter((w) => w.status === 'Active').length;
  const draft = mockWorkflows.filter((w) => w.status === 'Draft').length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Approval Workflows"
        subtitle="Multi-step approval chains for transfers, disposals, purchasing & privileged access."
        breadcrumb={[{ label: 'Administration' }, { label: 'Approval Workflows' }]}
        actions={
          <Button
            onClick={() =>
              toast({ title: 'New Workflow', description: 'The visual workflow builder is on the roadmap.', tone: 'info' })
            }
          >
            + New Workflow
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:max-w-md">
        <KpiCard label="Active" value={active} sub="Live approval chains" tone="emerald" accent />
        <KpiCard label="Draft" value={draft} sub="Pending publish" tone="slate" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {mockWorkflows.map((wf) => (
          <WorkflowCard key={wf.id} wf={wf} />
        ))}
      </div>
    </div>
  );
}
