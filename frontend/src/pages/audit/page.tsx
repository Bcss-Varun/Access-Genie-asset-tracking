import { Link } from 'react-router-dom';
import { allAuditLog, allCycleCounts, allCustody, allCertifications, allAssets } from '@/lib/dataset';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';

const HUBS: { href: string; title: string; desc: string }[] = [
  { href: '/cycle-counts', title: 'Cycle Counts', desc: 'Scheduled & reconciled physical inventory counts.' },
  { href: '/custody', title: 'Chain of Custody', desc: 'Who holds what, and every hand-off in between.' },
  { href: '/certifications', title: 'Certifications', desc: 'Cert & warranty expiry tracking by asset.' },
  { href: '/audit-log', title: 'Immutable Log', desc: 'Tamper-evident, hash-chained system of record.' },
];

export default function AuditCenterPage() {
  const { toast } = useToast();

  const coveredAssets = new Set(allCustody.map((c) => c.assetId)).size;
  const coverage = Math.round((coveredAssets / allAssets.length) * 100);
  const openFindings = allCertifications.filter((c) => c.status !== 'Valid').length
    + allCycleCounts.filter((c) => c.status === 'Variance').length;

  const recent = [...allAuditLog].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 6);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Audit Center"
        subtitle="Compliance command post — audits, findings, custody and evidence in one place."
        breadcrumb={[{ label: 'Compliance' }, { label: 'Audit Center' }]}
        actions={
          <Button onClick={() => toast({ title: 'Audit started', description: 'A new audit workspace has been created (demo).', tone: 'success' })}>
            Start Audit
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Audits YTD" value={allAuditLog.length} tone="primary" accent sub="Recorded audit events" />
        <KpiCard label="Open Findings" value={openFindings} tone="amber" sub="Awaiting remediation" />
        <KpiCard label="Cycle Counts" value={allCycleCounts.length} tone="slate" sub="Across all locations" />
        <KpiCard label="Custody Coverage" value={`${coverage}%`} tone="emerald" sub={`${coveredAssets} of ${allAssets.length} assets tracked`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Hub links */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
          {HUBS.map((h) => (
            <Link
              key={h.href}
              to={h.href}
              className="glass-panel rounded-xl p-5 hover:border-primary-300 hover:shadow-md transition-all group"
            >
              <div className="min-w-0">
                <h3 className="font-heading font-semibold text-slate-900 group-hover:text-primary-600 transition-colors">{h.title}</h3>
                <p className="text-sm text-slate-500 mt-1">{h.desc}</p>
                <span className="mt-2 inline-flex text-xs font-medium text-primary-600">Open →</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Recent activity */}
        <div className="glass-panel rounded-xl p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-800">Recent Activity</h3>
            <Link to="/audit-log" className="text-xs font-medium text-primary-600 hover:underline">Full log →</Link>
          </div>
          <ul className="space-y-3 overflow-auto flex-1">
            {recent.map((r) => (
              <li key={r.id} className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800 text-sm">{r.actor}</span>
                    <Badge tone="slate" className="font-mono">{r.action}</Badge>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {r.category} · {r.target} · {relTime(r.timestamp)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
