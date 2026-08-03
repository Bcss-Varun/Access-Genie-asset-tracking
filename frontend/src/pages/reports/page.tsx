import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mockReports } from '@/lib/mock-data';
import type { Report } from '@/types/asset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime, DEMO_NOW } from '@/lib/utils';

const isToday = (iso: string) =>
  new Date(Date.parse(iso)).toISOString().slice(0, 10) ===
  new Date(DEMO_NOW).toISOString().slice(0, 10);

export default function ReportLibraryPage() {
  const { toast } = useToast();
  const [active, setActive] = useState<string>('All');

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(mockReports.map((r) => r.category)))],
    [],
  );

  const kpis = useMemo(() => {
    const scheduled = mockReports.filter((r) => r.scheduled).length;
    const cats = new Set(mockReports.map((r) => r.category)).size;
    const runToday = mockReports.filter((r) => isToday(r.lastRun)).length;
    return { total: mockReports.length, scheduled, cats, runToday };
  }, []);

  const filtered = active === 'All' ? mockReports : mockReports.filter((r) => r.category === active);

  const run = (r: Report) =>
    toast({ title: 'Report queued', description: `“${r.name}” is running — you’ll be notified when it’s ready.`, tone: 'info' });
  const schedule = (r: Report) =>
    toast({ title: 'Schedule updated', description: `“${r.name}” will now run automatically.`, tone: 'success' });

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Report Library"
        subtitle="Prebuilt, persona-driven reports across your asset portfolio."
        breadcrumb={[{ label: 'Analytics', href: '/reports' }, { label: 'Report Library' }]}
        actions={
          <Link to="/reports/builder">
            <Button>＋ New Report</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Reports" value={kpis.total} accent />
        <KpiCard label="Scheduled" value={kpis.scheduled} sub="Auto-delivered" tone="slate" />
        <KpiCard label="Categories" value={kpis.cats} sub="Persona-aligned" tone="slate" />
        <KpiCard label="Run Today" value={kpis.runToday} sub="Fresh output" tone="slate" />
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setActive(c)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
              active === c
                ? 'border-primary-500 bg-primary-600 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {c}
            {c !== 'All' && (
              <span className="ml-1.5 opacity-70">
                {mockReports.filter((r) => r.category === c).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState variant="no-results" title="No reports in this category" description="Try another category filter." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <div key={r.id} className="glass-panel rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/reports/${r.id}`} className="font-heading font-semibold text-slate-900 hover:text-primary-600">
                    {r.name}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                    <span>{r.format}</span>
                    <span>·</span>
                    <span>Ran {relTime(r.lastRun)}</span>
                  </div>
                </div>
                <Badge tone="slate">{r.category}</Badge>
              </div>

              <p className="mt-3 text-sm text-slate-500 line-clamp-2">{r.description}</p>

              <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                <span className="truncate">{r.persona}</span>
                {r.scheduled && <Badge tone="emerald" className="ml-auto">Scheduled</Badge>}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.metrics.map((m) => (
                  <span key={m} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {m}
                  </span>
                ))}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                <Link to={`/reports/${r.id}`} className="mr-auto text-sm font-medium text-primary-600 hover:text-primary-700">
                  Open →
                </Link>
                <Button variant="outline" size="sm" onClick={() => run(r)}>Run</Button>
                <Button variant="ghost" size="sm" onClick={() => schedule(r)}>Schedule</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
