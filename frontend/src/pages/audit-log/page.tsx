import { useState, useMemo } from 'react';
import { mockAuditLog } from '@/lib/mock-data';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { cn, relTime } from '@/lib/utils';

export default function AuditLogPage() {
  const categories = useMemo(
    () => Array.from(new Set(mockAuditLog.map((r) => r.category))).sort(),
    [],
  );
  const [category, setCategory] = useState<'All' | string>('All');
  const [query, setQuery] = useState('');

  const filtered = mockAuditLog
    .filter((r) => (category === 'All' ? true : r.category === category))
    .filter((r) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [r.actor, r.action, r.target, r.ip, r.category].some((f) => f.toLowerCase().includes(q));
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

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
        title="Immutable Log"
        subtitle="Read-only, append-only system of record for every privileged action."
        breadcrumb={[{ label: 'Compliance' }, { label: 'Immutable Log' }]}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setCategory('All')} className={chipCls(category === 'All')}>All</button>
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={chipCls(category === c)}>{c}</button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actor, action, target, IP…"
          className="ml-auto w-full sm:w-64 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Table */}
      <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">Actor</th>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4">Target</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Source IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-500">{relTime(r.timestamp)}</td>
                  <td className="px-6 py-4 font-medium text-slate-800">{r.actor}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700">
                      {r.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{r.target}</td>
                  <td className="px-6 py-4"><Badge tone="slate">{r.category}</Badge></td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{r.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState variant="no-results" title="No matching entries" description="Adjust your search or category filter." />
        )}
      </div>
    </div>
  );
}
