'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Compliance Reports — filtered report library (compliance/audit) + standard packs.
// ─────────────────────────────────────────────────────────────────────────────

import { mockReports } from '@/lib/mock-data';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';

const complianceReports = mockReports.filter((r) => r.category.toLowerCase().includes('compliance'));

interface StandardPack {
  id: string;
  name: string;
  framework: string;
  description: string;
  format: string;
}
const standardPacks: StandardPack[] = [
  { id: 'STD-SOC2', name: 'SOC 2 Evidence Pack', framework: 'SOC 2 Type II', description: 'Access controls, asset inventory completeness and change-log evidence for the audit period.', format: 'PDF + Excel' },
  { id: 'STD-GDPR', name: 'GDPR Data Map', framework: 'GDPR', description: 'Data-bearing asset register, processing locations and retention posture.', format: 'PDF' },
  { id: 'STD-SOC2', name: 'SOC 2 Type II Evidence', framework: 'AICPA SOC 2', description: 'IT equipment inspection, firmware patching, and network device compliance.', format: 'PDF' },
];

export default function ComplianceReportsPage() {
  const { toast } = useToast();

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Compliance Reports"
        subtitle="Audit-ready evidence packs and compliance report library."
        breadcrumb={[{ label: 'Analytics', href: '/dashboards' }, { label: 'Compliance Reports' }]}
        actions={
          <Button onClick={() => toast({ title: 'Report builder', description: 'Custom compliance report builder is on the roadmap.', tone: 'info' })}>
            + New Report
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Compliance Reports" value={complianceReports.length} sub="In library" tone="primary" accent />
        <KpiCard label="Standard Packs" value={standardPacks.length} sub="Framework templates" tone="slate" />
        <KpiCard label="Frameworks" value={4} sub="SOC 2 · GDPR · JC · Internal" tone="slate" />
        <KpiCard label="Audit Readiness" value="98%" sub="Evidence coverage" tone="emerald" />
      </div>

      {/* Library reports */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Report Library</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {complianceReports.map((r) => (
            <div key={r.id} className="glass-panel rounded-xl p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{r.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{r.persona} · {r.id}</div>
                </div>
                <Badge tone="primary">{r.format}</Badge>
              </div>
              <p className="text-sm text-slate-500 mt-2 flex-1">{r.description}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {r.metrics.map((m) => <Badge key={m} tone="slate">{m}</Badge>)}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">Last run {relTime(r.lastRun)}</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => toast({ title: 'Download started', description: `${r.name} (${r.format})`, tone: 'success' })}>Download</Button>
                  <Button size="sm" onClick={() => toast({ title: 'Generating report', description: `${r.name} is being compiled.`, tone: 'info' })}>Generate</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Standard framework packs */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Standard Compliance Packs</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {standardPacks.map((p) => (
            <div key={p.id} className="glass-panel rounded-xl p-5 flex flex-col">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                <Badge tone="slate">{p.framework}</Badge>
              </div>
              <p className="text-sm text-slate-500 mt-3 flex-1">{p.description}</p>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">{p.format}</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => toast({ title: 'Download started', description: `${p.name}`, tone: 'success' })}>Download</Button>
                  <Button size="sm" onClick={() => toast({ title: 'Generating pack', description: `${p.name} evidence is being assembled.`, tone: 'info' })}>Generate</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
