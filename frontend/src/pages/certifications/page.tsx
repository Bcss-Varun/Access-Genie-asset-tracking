import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Certification, CertStatus } from '@access-genie/shared';
import { allCertifications } from '@/lib/dataset';
import { PageHeader, KpiCard, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CertificationDialog } from '@/components/compliance/CertificationDialog';
import { useMutate } from '@/api/mutate';
import { certificationsApi } from '@/api/maintenance';
import { cn, relTime } from '@/lib/utils';

const STATUSES: CertStatus[] = ['Valid', 'Expiring', 'Expired'];

const statusTone = (s: CertStatus): 'emerald' | 'amber' | 'red' =>
  s === 'Valid' ? 'emerald' : s === 'Expiring' ? 'amber' : 'red';

type Dialog = { mode: 'new' } | { mode: 'edit'; cert: Certification } | { mode: 'renew'; cert: Certification };

export default function CertificationsPage() {
  const { run, isPending } = useMutate();
  const [filter, setFilter] = useState<'All' | CertStatus>('All');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [deleting, setDeleting] = useState<Certification | null>(null);

  const remove = async () => {
    if (!deleting) return;
    await run(certificationsApi.remove(deleting.id), {
      success: 'Certificate removed',
      successDetail: `${deleting.name} for ${deleting.assetName}`,
      describe: 'remove that certificate',
    });
    setDeleting(null);
  };

  const certs = allCertifications;
  const filtered = filter === 'All' ? certs : certs.filter((c) => c.status === filter);
  const has = (s: CertStatus) => certs.filter((c) => c.status === s).length;

  const chipCls = (active: boolean) =>
    cn(
      'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
      active
        ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
        : 'bg-transparent text-slate-500 border-slate-200 hover:border-primary-500/50 hover:text-slate-700',
    );

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Certifications & Warranty"
        subtitle="Track certification and warranty expiry across every asset."
        breadcrumb={[{ label: 'Compliance' }, { label: 'Certifications' }]}
        actions={<Button onClick={() => setDialog({ mode: 'new' })}>+ Record Certificate</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Valid" value={has('Valid')} tone="emerald" sub="In good standing" />
        <KpiCard label="Expiring" value={has('Expiring')} tone="amber" sub="Renew soon" />
        <KpiCard label="Expired" value={has('Expired')} tone="red" sub="Action required" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilter('All')} className={chipCls(filter === 'All')}>All</button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={chipCls(filter === s)}>{s}</button>
        ))}
        <span className="ml-auto text-sm text-slate-500 font-medium">{filtered.length} of {certs.length}</span>
      </div>

      <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">Asset</th>
                <th className="px-6 py-4">Certification</th>
                <th className="px-6 py-4">Authority</th>
                <th className="px-6 py-4">Issued</th>
                <th className="px-6 py-4">Expires</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <Link to={`/assets/${c.assetId}`} className="font-medium text-slate-900 hover:text-primary-600 transition-colors">
                      {c.assetName}
                    </Link>
                    <div className="text-[11px] font-mono text-slate-400">{c.assetId}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-700">{c.name}</td>
                  <td className="px-6 py-4 text-slate-600">{c.authority}</td>
                  <td className="px-6 py-4 text-slate-500">{relTime(c.issuedAt)}</td>
                  <td className="px-6 py-4 text-slate-500">{relTime(c.expiresAt)}</td>
                  <td className="px-6 py-4"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setDialog({ mode: 'renew', cert: c })}>
                        Renew
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'edit', cert: c })}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(c)}>
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState
            variant={certs.length === 0 ? 'empty' : 'no-results'}
            icon="📜"
            title={certs.length === 0 ? 'No certificates recorded' : 'No certifications match this filter'}
            description={
              certs.length === 0
                ? 'A certificate nobody recorded is a certificate nobody is watching expire. Recording one puts it into the expiry checks.'
                : 'Try a different status.'
            }
            action={certs.length === 0 ? <Button onClick={() => setDialog({ mode: 'new' })}>+ Record Certificate</Button> : undefined}
          />
        )}
      </div>

      {dialog?.mode === 'new' && <CertificationDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit' && <CertificationDialog existing={dialog.cert} onClose={() => setDialog(null)} />}
      {dialog?.mode === 'renew' && <CertificationDialog existing={dialog.cert} renew onClose={() => setDialog(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Remove ${deleting.name}?`}
          description={`It will no longer be tracked for expiry against ${deleting.assetName}.`}
          confirmLabel="Remove"
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
