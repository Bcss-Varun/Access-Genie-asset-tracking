'use client';

import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';

type FrameworkStatus = 'Certified' | 'In Progress' | 'Gap';

interface Framework {
  id: string;
  name: string;
  scope: string;
  status: FrameworkStatus;
  coverage: number;
  lastAssessment: string;
  evidence: number;
}

const daysAgo = (d: number) => new Date(Date.parse('2026-07-23T09:00:00.000Z') - d * 86_400_000).toISOString();

const FRAMEWORKS: Framework[] = [
  { id: 'soc2', name: 'SOC 2 Type II', scope: 'Trust Services Criteria — security, availability, confidentiality', status: 'Certified', coverage: 98, lastAssessment: daysAgo(52), evidence: 214 },
  { id: 'iso27001', name: 'ISO 27001', scope: 'Information Security Management System (ISMS)', status: 'Certified', coverage: 95, lastAssessment: daysAgo(120), evidence: 176 },
  { id: 'dpdp', name: 'DPDP Act 2023', scope: 'India digital personal data protection — consent, retention & breach duties', status: 'In Progress', coverage: 82, lastAssessment: daysAgo(30), evidence: 88 },
  { id: 'certin', name: 'CERT-In Directions', scope: 'Six-hour incident reporting, 180-day log retention & NTP sync (MeitY)', status: 'In Progress', coverage: 76, lastAssessment: daysAgo(18), evidence: 141 },
  { id: 'bis', name: 'BIS / MeitY CRS', scope: 'Compulsory Registration Scheme — IT hardware conformity & e-waste rules', status: 'Gap', coverage: 61, lastAssessment: daysAgo(9), evidence: 63 },
];

const statusTone = (s: FrameworkStatus): 'emerald' | 'amber' | 'red' =>
  s === 'Certified' ? 'emerald' : s === 'In Progress' ? 'amber' : 'red';

const barColor = (s: FrameworkStatus) =>
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
