import { allComplianceFrameworks } from '@/lib/dataset';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';

const FRAMEWORKS = allComplianceFrameworks;
const statusTone = (s: string): 'emerald' | 'amber' | 'red' =>
  s === 'Certified' ? 'emerald' : s === 'In Progress' ? 'amber' : 'red';

const barColor = (s: string) =>
  s === 'Certified' ? 'bg-emerald-500' : s === 'In Progress' ? 'bg-amber-500' : 'bg-red-500';

export default function RegulatoryPage() {
  const { toast } = useToast();

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Regulatory Frameworks"
        subtitle="Compliance posture across the Indian and international frameworks that govern your operations."
        breadcrumb={[{ label: 'Compliance' }, { label: 'Regulatory' }]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {FRAMEWORKS.map((f) => (
          <div key={f.id} className="glass-panel rounded-xl p-5 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-heading font-bold text-slate-900">{f.name}</h3>
              <Badge tone={statusTone(f.status)}>{f.status}</Badge>
            </div>
            <p className="text-sm text-slate-500 mt-1 flex-1">{f.scope}</p>

            <div className="mt-4">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-slate-500">Controls covered</span>
                <span className="tabular-nums font-semibold text-slate-800">{f.coverage}%</span>
              </div>
              <div className="mt-1.5 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div className={`h-full rounded-full ${barColor(f.status)}`} style={{ width: `${f.coverage}%` }} />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Last assessed {relTime(f.lastAssessment)}</span>
              <span>{f.evidence} evidence items</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="mt-4 w-full"
              onClick={() => toast({ title: `${f.name} evidence`, description: `Opening ${f.evidence} evidence items (demo).`, tone: 'info' })}
            >
              View evidence
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
