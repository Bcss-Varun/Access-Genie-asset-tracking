import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getInspection } from '@/lib/dataset';
import type { Inspection, InspectionStatus, InspectionResult } from '@access-genie/shared';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime } from '@/lib/utils';

const RESULTS: InspectionResult[] = ['Pass', 'Fail', 'N/A'];

const statusTone = (s: InspectionStatus): 'emerald' | 'red' | 'amber' | 'slate' =>
  s === 'Passed' ? 'emerald' : s === 'Failed' ? 'red' : s === 'In Progress' ? 'amber' : 'slate';

const segCls = (active: boolean, result: InspectionResult) => {
  const activeTone: Record<InspectionResult, string> = {
    Pass: 'bg-emerald-600 text-white border-emerald-600',
    Fail: 'bg-red-600 text-white border-red-600',
    'N/A': 'bg-slate-600 text-white border-slate-600',
    Pending: 'bg-slate-400 text-white border-slate-400',
  };
  return cn(
    'px-3 py-1.5 text-xs font-medium border transition-colors first:rounded-l-md last:rounded-r-md -ml-px first:ml-0',
    active ? activeTone[result] : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
  );
};

export default function InspectionDetailPage() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const found = getInspection(id);

  const [inspection, setInspection] = useState<Inspection | null>(() =>
    found ? { ...found, items: found.items.map((it) => ({ ...it })) } : null,
  );

  if (!inspection) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          icon="📋"
          title="Inspection not found"
          description={`No inspection with id “${id}” exists in this session.`}
          action={
            <Link to="/inspections">
              <Button variant="outline">← Back to Inspections</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const setResult = (idx: number, result: InspectionResult) =>
    setInspection((prev) =>
      prev ? { ...prev, items: prev.items.map((it, i) => (i === idx ? { ...it, result } : it)) } : prev,
    );

  const setNote = (idx: number, note: string) =>
    setInspection((prev) =>
      prev ? { ...prev, items: prev.items.map((it, i) => (i === idx ? { ...it, note } : it)) } : prev,
    );

  const passed = inspection.items.filter((it) => it.result === 'Pass').length;
  const failed = inspection.items.filter((it) => it.result === 'Fail').length;
  const na = inspection.items.filter((it) => it.result === 'N/A').length;
  const pending = inspection.items.filter((it) => it.result === 'Pending').length;

  const submit = () => {
    const overall: InspectionStatus = failed > 0 ? 'Failed' : pending > 0 ? 'In Progress' : 'Passed';
    setInspection((prev) => (prev ? { ...prev, status: overall } : prev));
    toast({
      title: `Inspection ${overall === 'Passed' ? 'passed' : overall === 'Failed' ? 'failed' : 'saved'}`,
      description: `${passed} pass · ${failed} fail · ${na} N/A · ${pending} pending.`,
      tone: overall === 'Failed' ? 'error' : overall === 'Passed' ? 'success' : 'info',
    });
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={inspection.title}
        breadcrumb={[
          { label: 'Maintenance', href: '/maintenance' },
          { label: 'Inspections', href: '/inspections' },
          { label: inspection.title },
        ]}
        actions={<Button onClick={submit}>Submit inspection</Button>}
      />

      {/* Header meta */}
      <div className="glass-panel rounded-xl p-5 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Status</span>
          <Badge tone={statusTone(inspection.status)}>{inspection.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Asset</span>
          <Link to={`/assets/${inspection.assetId}`} className="font-medium text-slate-800 hover:text-primary-600">
            {inspection.assetName}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Template</span>
          <span className="font-medium text-slate-800">{inspection.template}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Inspector</span>
          <span className="font-medium text-slate-800">{inspection.inspector}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Due</span>
          <span className="font-medium text-slate-800">{relTime(inspection.dueDate)}</span>
        </div>
      </div>

      {/* Live summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Passed" value={passed} tone="emerald" />
        <KpiCard label="Failed" value={failed} tone="red" />
        <KpiCard label="N/A" value={na} tone="slate" />
        <KpiCard label="Pending" value={pending} tone="amber" />
      </div>

      {/* Checklist */}
      <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-auto">
        <ul className="divide-y divide-slate-100">
          {inspection.items.map((item, idx) => (
            <li key={idx} className="p-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-800">{item.label}</div>
                <input
                  type="text"
                  value={item.note ?? ''}
                  onChange={(e) => setNote(idx, e.target.value)}
                  placeholder="Add a note (optional)…"
                  className="mt-2 w-full max-w-md rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div className="inline-flex shrink-0">
                {RESULTS.map((r) => (
                  <button key={r} onClick={() => setResult(idx, r)} className={segCls(item.result === r, r)}>
                    {r}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
