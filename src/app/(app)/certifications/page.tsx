'use client';

import { useState } from 'react';
import Link from 'next/link';
import { mockCertifications } from '@/lib/mock-data';
import type { CertStatus } from '@/types/asset';
import { PageHeader, KpiCard, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime } from '@/lib/utils';

const STATUSES: CertStatus[] = ['Valid', 'Expiring', 'Expired'];

const statusTone = (s: CertStatus): 'emerald' | 'amber' | 'red' =>
  s === 'Valid' ? 'emerald' : s === 'Expiring' ? 'amber' : 'red';

export default function CertificationsPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<'All' | CertStatus>('All');

  const certs = mockCertifications;
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
                    <Link href={`/assets/${c.assetId}`} className="font-medium text-slate-900 hover:text-primary-600 transition-colors">
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toast({ title: 'Renewal started', description: `${c.name} for ${c.assetName} queued for renewal (demo).`, tone: 'info' })}
                    >
                      Renew
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState variant="no-results" title="No certifications match this filter" description="Try a different status." />
        )}
      </div>
    </div>
  );
}
