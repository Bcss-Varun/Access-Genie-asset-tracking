// ─────────────────────────────────────────────────────────────────────────────
// Compliance Reports — filtered report library (compliance/audit) + standard packs.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Report } from '@access-genie/shared';
import type { ReportPack } from '@access-genie/shared';
import { allReports, allReportPacks, allCertifications, allInspections, allAuditLog } from '@/lib/dataset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { useMutate } from '@/api/mutate';
import { downloadCsv, reportRunApi } from '@/api/configuration';
import { relTime } from '@/lib/utils';

export default function ComplianceReportsPage() {
  // Derived per render: the dataset is fetched, so a value computed once at
  // module scope would never see a refetch.
  const standardPacks = allReportPacks;
  const complianceReports = allReports.filter((r) => r.category.toLowerCase().includes('compliance'));

  const { toast } = useToast();
  const { run } = useMutate();
  const [running, setRunning] = useState<string | null>(null);

  /**
   * Assemble a pack.
   *
   * A pack is a named bundle of the compliance register rather than a report
   * definition, so it is built from the register itself — every certificate,
   * every inspection, and the audit trail behind them. Nothing is queued: the
   * records are already here, so the file is written now.
   */
  const generatePack = (pack: ReportPack) => {
    const rows = [
      ...allCertifications.map((c) => ({
        Section: 'Certification',
        Reference: c.id,
        Asset: c.assetName,
        'Asset ID': c.assetId,
        Item: c.name,
        Authority: c.authority,
        Status: c.status,
        Issued: c.issuedAt.slice(0, 10),
        Due: c.expiresAt.slice(0, 10),
      })),
      ...allInspections.map((i) => ({
        Section: 'Inspection',
        Reference: i.id,
        Asset: i.assetName,
        'Asset ID': i.assetId,
        Item: i.title,
        Authority: i.assignedTo || 'Unassigned',
        Status: i.status,
        Issued: '',
        Due: i.scheduledFor.slice(0, 10),
      })),
      ...allAuditLog.slice(0, 500).map((a) => ({
        Section: 'Audit trail',
        Reference: a.id,
        Asset: '',
        'Asset ID': a.target,
        Item: a.action,
        Authority: a.actor,
        Status: a.category,
        Issued: '',
        Due: a.timestamp.slice(0, 19),
      })),
    ];

    const n = downloadCsv(`${pack.framework.toLowerCase()}-evidence-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast({
      title: n > 0 ? `${pack.name} assembled` : 'No evidence to pack',
      description:
        n > 0
          ? `${n} records — ${allCertifications.length} certificates, ${allInspections.length} inspections and the audit trail.`
          : 'There are no compliance records in this tenant yet.',
      tone: n > 0 ? 'success' : 'info',
    });
  };

  /**
   * Generate the evidence and hand it over.
   *
   * Both buttons on a card did the same nothing before. There is only one
   * action here — produce the file — so there is now one button.
   */
  const generate = async (r: Report) => {
    setRunning(r.id);
    try {
      const result = await run(reportRunApi.run(r.id), { describe: `generate “${r.name}”` });
      if (!result) return;

      if (result.rowCount === 0) {
        toast({
          title: 'No evidence to pack',
          description: `“${r.name}” found nothing to report — there are no compliance records yet.`,
          tone: 'info',
        });
        return;
      }

      await reportRunApi.download(result.job.id);
      toast({
        title: `${r.name} downloaded`,
        description: `${result.rowCount} record${result.rowCount === 1 ? '' : 's'} · audit-ready ${result.job.format}`,
        tone: 'success',
      });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Compliance Reports"
        subtitle="Audit-ready evidence packs and compliance report library."
        breadcrumb={[{ label: 'Analytics', href: '/reports' }, { label: 'Compliance Reports' }]}
        actions={
          <Link to="/reports/builder">
            <Button>+ New Report</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Compliance Reports" value={complianceReports.length} sub="In library" tone="primary" accent />
        <KpiCard label="Standard Packs" value={standardPacks.length} sub="Framework templates" tone="slate" />
        <KpiCard label="Frameworks" value={5} sub="ISO 27001 · SOC 2 · DPDP · CERT-In · BIS" tone="slate" />
        <KpiCard label="Audit Readiness" value="98%" sub="Evidence coverage" tone="emerald" />
      </div>

      {/* Library reports */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Report Library</h2>

        {complianceReports.length === 0 && (
          <div className="glass-panel rounded-xl">
            <EmptyState
              icon="📋"
              title="No compliance reports defined"
              description="A compliance report is the evidence pack an auditor asks for. Define one and it can be generated from live certification and inspection records."
              action={
                <Link to="/reports/builder">
                  <Button>+ New Report</Button>
                </Link>
              }
            />
          </div>
        )}

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
                  <Link to={`/reports/${r.id}`} className="text-xs font-medium text-primary-600 hover:text-primary-700">
                    Open →
                  </Link>
                  <Button size="sm" disabled={running === r.id} onClick={() => void generate(r)}>
                    {running === r.id ? 'Generating…' : 'Generate & download'}
                  </Button>
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
                  {/*
                    A pack is a named bundle of the compliance register. There
                    is one action — assemble it and hand it over — so there is
                    one button, and it produces the same file the reports above
                    do, from the same certification and inspection records.
                  */}
                  <Button size="sm" disabled={running === p.id} onClick={() => void generatePack(p)}>
                    {running === p.id ? 'Assembling…' : 'Generate & download'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
