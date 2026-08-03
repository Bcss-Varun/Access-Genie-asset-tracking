import { allRetentionPolicies } from '@/lib/dataset';
import { useState } from 'react';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

interface RetentionPolicy {
  id: string;
  dataClass: string;
  retention: string;
  disposal: string;
  legalHold: boolean;
}

const INITIAL = allRetentionPolicies;
export default function RetentionPage() {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<RetentionPolicy[]>(INITIAL);

  const toggleHold = (id: string) => {
    setPolicies((prev) => prev.map((p) => (p.id === id ? { ...p, legalHold: !p.legalHold } : p)));
    const p = policies.find((x) => x.id === id);
    if (p) {
      toast({
        title: p.legalHold ? 'Legal hold released' : 'Legal hold placed',
        description: `${p.dataClass} — disposal is now ${p.legalHold ? 'permitted' : 'frozen'} (demo).`,
        tone: p.legalHold ? 'default' : 'info',
      });
    }
  };

  const onHold = policies.filter((p) => p.legalHold).length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Data Retention & Legal Hold"
        subtitle="Retention schedules, disposal methods, and legal-hold controls by data class."
        breadcrumb={[{ label: 'Compliance' }, { label: 'Retention' }]}
        actions={
          <Button onClick={() => toast({ title: 'New policy', description: 'Retention policy editor opened (demo).', tone: 'info' })}>
            + New Policy
          </Button>
        }
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
                <th className="px-6 py-4 text-right">Toggle</th>
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
                      onClick={() => toggleHold(p.id)}
                      className={cn(
                        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
                        p.legalHold ? 'bg-amber-500' : 'bg-slate-300',
                      )}
                      aria-label={`Toggle legal hold for ${p.dataClass}`}
                    >
                      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', p.legalHold ? 'translate-x-5' : 'translate-x-0.5')} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
