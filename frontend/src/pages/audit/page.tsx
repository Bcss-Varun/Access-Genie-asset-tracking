import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { allAuditLog, allCycleCounts, allCustody, allCertifications, allAssets } from '@/lib/dataset';
import { TRACKED_FACILITIES } from '@/lib/tracking-data';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { FormDialog, Field, FieldRow, Select, TextInput } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { auditsApi } from '@/api/tracking-ops';
import { relTime } from '@/lib/utils';

const HUBS: { href: string; title: string; desc: string }[] = [
  { href: '/cycle-counts', title: 'Cycle Counts', desc: 'Scheduled & reconciled physical inventory counts.' },
  { href: '/custody', title: 'Chain of Custody', desc: 'Who holds what, and every hand-off in between.' },
  { href: '/certifications', title: 'Certifications', desc: 'Cert & warranty expiry tracking by asset.' },
  { href: '/audit-log', title: 'Immutable Log', desc: 'Tamper-evident, hash-chained system of record.' },
];

/**
 * Open a real audit session.
 *
 * "Start Audit" used to raise a toast saying a workspace had been created.
 * There is a real one — the counting session the Inventory Tracking screen
 * works through — so this creates that and takes you to it.
 */
function StartAuditDialog({ onClose }: { onClose: () => void }) {
  const { run, isPending } = useMutate();
  const navigate = useNavigate();

  const facilities = TRACKED_FACILITIES;
  const [name, setName] = useState('');
  const [scope, setScope] = useState('Whole facility');
  const [facility, setFacility] = useState(facilities[0]?.name ?? '');
  const [expected, setExpected] = useState(String(allAssets.length));
  const [dueInDays, setDueInDays] = useState('14');

  const submit = async () => {
    const created = await run(
      auditsApi.start({
        name: name.trim(),
        scope,
        facility,
        expected: Number(expected) || 0,
        dueInDays: Number(dueInDays) || 14,
      }),
      {
        success: 'Audit opened',
        successDetail: `${name.trim()} — counting starts on Inventory Tracking.`,
        describe: 'open that audit',
        refreshTracking: true,
      },
    );
    if (!created) return;
    onClose();
    navigate('/tracking/inventory');
  };

  return (
    <FormDialog
      icon="📋"
      title="Start an audit"
      description="Opens a counting session. Progress and variance are worked through on Inventory Tracking."
      submitLabel="Open audit"
      busy={isPending}
      disabled={name.trim().length < 3 || !facility}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="Audit name" required>
        <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 physical verification" />
      </Field>

      <FieldRow>
        <Field label="Facility" required>
          {facilities.length > 0 ? (
            <Select value={facility} onChange={(e) => setFacility(e.target.value)} options={facilities.map((f) => ({ value: f.name, label: f.name }))} />
          ) : (
            <TextInput value={facility} onChange={(e) => setFacility(e.target.value)} placeholder="Hyderabad Campus" />
          )}
        </Field>
        <Field label="Scope">
          <TextInput value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Whole facility" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Expected count" hint="How many assets should be found.">
          <TextInput type="number" min={0} value={expected} onChange={(e) => setExpected(e.target.value)} />
        </Field>
        <Field label="Due in (days)">
          <TextInput type="number" min={1} value={dueInDays} onChange={(e) => setDueInDays(e.target.value)} />
        </Field>
      </FieldRow>
    </FormDialog>
  );
}

export default function AuditCenterPage() {
  const [starting, setStarting] = useState(false);

  const coveredAssets = new Set(allCustody.map((c) => c.assetId)).size;
  // Guarded: an empty registry made this NaN%.
  const coverage = allAssets.length === 0 ? 0 : Math.round((coveredAssets / allAssets.length) * 100);
  const openFindings = allCertifications.filter((c) => c.status !== 'Valid').length
    + allCycleCounts.filter((c) => c.status === 'Variance').length;

  const recent = [...allAuditLog].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 6);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Audit Center"
        subtitle="Compliance command post — audits, findings, custody and evidence in one place."
        breadcrumb={[{ label: 'Compliance' }, { label: 'Audit Center' }]}
        actions={<Button onClick={() => setStarting(true)}>Start Audit</Button>}
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

      {starting && <StartAuditDialog onClose={() => setStarting(false)} />}
    </div>
  );
}
