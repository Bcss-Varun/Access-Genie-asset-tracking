'use client';

import { useState } from 'react';
import Link from 'next/link';
import { mockCustody } from '@/lib/mock-data';
import type { CustodyAction } from '@/types/asset';
import { PageHeader, KpiCard, Badge, EmptyState } from '@/components/ui/primitives';
import { cn, relTime } from '@/lib/utils';

const ACTIONS: CustodyAction[] = ['Assigned', 'Checked Out', 'Checked In', 'Transferred'];

const actionTone = (a: CustodyAction): 'primary' | 'amber' | 'emerald' | 'slate' =>
  a === 'Checked Out' ? 'amber' : a === 'Checked In' ? 'emerald' : a === 'Assigned' ? 'primary' : 'slate';

const isException = (holder: string, by: string) =>
  holder === 'Unknown' || by.toLowerCase().includes('geofence');

export default function CustodyPage() {
  const [filter, setFilter] = useState<'All' | CustodyAction>('All');

  const records = [...mockCustody].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const filtered = filter === 'All' ? records : records.filter((r) => r.action === filter);

  const checkedOut = records.filter((r) => r.action === 'Checked Out').length;
  const exceptions = records.filter((r) => isException(r.holder, r.by)).length;

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
        title="Chain of Custody"
        subtitle="Every custody event — assignments, check-outs, transfers — across the fleet."
        breadcrumb={[{ label: 'Compliance' }, { label: 'Chain of Custody' }]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Custody Records" value={records.length} tone="primary" accent sub="Logged events" />
        <KpiCard label="Checked Out" value={checkedOut} tone="amber" sub="Currently in the field" />
        <KpiCard label="Exceptions" value={exceptions} tone="red" sub="Unresolved custody breaks" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilter('All')} className={chipCls(filter === 'All')}>All</button>
        {ACTIONS.map((a) => (
          <button key={a} onClick={() => setFilter(a)} className={chipCls(filter === a)}>{a}</button>
        ))}
        <span className="ml-auto text-sm text-slate-500 font-medium">{filtered.length} of {records.length}</span>
      </div>

      <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">Asset</th>
                <th className="px-6 py-4">Holder</th>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4">By</th>
                <th className="px-6 py-4">When</th>
                <th className="px-6 py-4 text-right">Chain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => {
                const exception = isException(r.holder, r.by);
                return (
                  <tr key={r.id} className={cn('transition-colors', exception ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-slate-50')}>
                    <td className="px-6 py-4">
                      <Link href={`/assets/${r.assetId}`} className="font-medium text-slate-900 hover:text-primary-600 transition-colors">
                        {r.assetName}
                      </Link>
                      <div className="text-[11px] font-mono text-slate-400">{r.assetId}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn('font-medium', exception ? 'text-red-700' : 'text-slate-700')}>{r.holder}</span>
                      {exception && <span className="ml-2 inline-flex"><Badge tone="red">Exception</Badge></span>}
                    </td>
                    <td className="px-6 py-4"><Badge tone={actionTone(r.action)}>{r.action}</Badge></td>
                    <td className="px-6 py-4 text-slate-500">{r.by}</td>
                    <td className="px-6 py-4 text-slate-500">{relTime(r.at)}</td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/custody/${r.assetId}`} className="text-primary-600 hover:text-primary-700 text-xs font-medium">
                        View chain →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState variant="no-results" title="No custody events match this filter" description="Try a different action." />
        )}
      </div>
    </div>
  );
}
