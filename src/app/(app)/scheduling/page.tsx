'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { mockWorkOrders } from '@/lib/mock-data';
import { useToast } from '@/components/providers/ToastProvider';
import { PageHeader, KpiCard, Avatar, Badge } from '@/components/ui/primitives';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { cn } from '@/lib/utils';
import type { WorkOrder, WorkOrderPriority } from '@/types/asset';

// ─────────────────────────────────────────────────────────────────────────────
// Static config (module scope → stable identity)
// ─────────────────────────────────────────────────────────────────────────────

const UNASSIGNED = 'Unassigned';
/** Daily technician capacity in hours (one 8-hour shift). */
const DAY_CAPACITY = 8;

const PRIORITY_DOT: Record<WorkOrderPriority, string> = {
  Critical: 'bg-health-critical',
  High: 'bg-amber-500',
  Medium: 'bg-primary-500',
  Low: 'bg-slate-400',
};

/** Initials for the roster avatars (handles single-word team names too). */
function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '—';
}

/** Load → traffic-light tone once summed hours are compared to capacity. */
function loadTone(pct: number): { bar: string; text: string; label: string } {
  if (pct > 100) return { bar: 'bg-health-critical', text: 'text-health-critical', label: 'Overloaded' };
  if (pct >= 75) return { bar: 'bg-amber-500', text: 'text-amber-600', label: 'Near capacity' };
  return { bar: 'bg-emerald-500', text: 'text-emerald-600', label: 'Healthy' };
}

const isOpen = (w: WorkOrder) => w.status !== 'Completed';

// ─────────────────────────────────────────────────────────────────────────────

export default function SchedulingPage() {
  const { toast } = useToast();

  // Copy mock data into state so in-session reassignment works.
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(() =>
    mockWorkOrders.map((w) => ({ ...w })),
  );

  // Stable technician roster = distinct assignees from the ORIGINAL data (so a
  // column never disappears just because its last WO was reassigned away).
  const roster = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const w of mockWorkOrders) {
      if (w.assignedTo && w.assignedTo !== UNASSIGNED) set.add(w.assignedTo);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, []);

  // ── Reassignment (mock) ──────────────────────────────────────────────────────
  function assign(woId: string, tech: string) {
    setWorkOrders((prev) =>
      prev.map((w) => (w.id === woId ? { ...w, assignedTo: tech, status: w.status === 'New' ? 'Assigned' : w.status } : w)),
    );
    toast({ title: 'Work order assigned', description: `${woId} → ${tech}`, tone: 'success' });
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const openWos = workOrders.filter(isOpen);
  const unassigned = openWos.filter((w) => w.assignedTo === UNASSIGNED);

  const perTech = roster.map((tech) => {
    const wos = openWos.filter((w) => w.assignedTo === tech);
    const hours = wos.reduce((sum, w) => sum + w.estimatedHours, 0);
    const loadPct = Math.round((hours / DAY_CAPACITY) * 100);
    return { tech, wos, hours, loadPct };
  });

  const avgLoad =
    perTech.length === 0
      ? 0
      : Math.round(perTech.reduce((s, t) => s + t.loadPct, 0) / perTech.length);

  const kpis = [
    { label: 'Technicians', value: roster.length, sub: 'Active roster', tone: 'primary' as const, accent: true },
    { label: 'Open Work Orders', value: openWos.length, sub: `${workOrders.length} total`, tone: 'slate' as const, accent: false },
    {
      label: 'Unassigned',
      value: unassigned.length,
      sub: unassigned.length > 0 ? 'Awaiting dispatch' : 'All dispatched',
      tone: (unassigned.length > 0 ? 'amber' : 'emerald') as 'amber' | 'emerald',
      accent: false,
    },
    {
      label: 'Avg Load',
      value: `${avgLoad}%`,
      sub: 'Across roster',
      tone: loadTone(avgLoad).text.includes('critical')
        ? ('red' as const)
        : avgLoad >= 75
        ? ('amber' as const)
        : ('emerald' as const),
      accent: false,
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Technician Scheduling"
        subtitle="Dispatch board — balance open work orders across the technician roster."
        breadcrumb={[
          { label: 'Maintenance', href: '/maintenance' },
          { label: 'Technician Scheduling' },
        ]}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} sub={k.sub} tone={k.tone} accent={k.accent} />
        ))}
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 overflow-x-auto pb-1">
        <div className="flex gap-4 h-full items-stretch">
          {/* Unassigned column */}
          <section className="w-72 shrink-0 flex flex-col rounded-xl border border-dashed border-amber-300 bg-amber-50/40">
            <header className="flex items-center justify-between px-4 py-3 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">Unassigned</span>
              </div>
              <span className="text-xs font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                {unassigned.length}
              </span>
            </header>
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
              {unassigned.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-10">
                  Everything is dispatched — no queue.
                </div>
              ) : (
                unassigned.map((w) => (
                  <div key={w.id} className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full shrink-0', PRIORITY_DOT[w.priority])} />
                      <Link
                        href={`/maintenance/${w.id}`}
                        className="font-mono text-[11px] text-slate-500 hover:text-primary-600 transition-colors"
                      >
                        {w.id}
                      </Link>
                      <span className="ml-auto text-[11px] text-slate-400">{w.estimatedHours}h</span>
                    </div>
                    <h4 className="mt-1.5 text-sm font-medium text-slate-800 leading-snug line-clamp-2">
                      {w.title}
                    </h4>
                    <p className="mt-1 text-xs text-slate-500 truncate">{w.assetName}</p>
                    <div className="mt-2.5 flex items-center justify-between">
                      <Badge tone={w.priority === 'Critical' ? 'red' : w.priority === 'High' ? 'amber' : 'slate'}>
                        {w.priority}
                      </Badge>
                      <Dropdown
                        ariaLabel={`Assign ${w.id}`}
                        trigger={({ toggle }) => (
                          <button
                            onClick={toggle}
                            className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                          >
                            Assign →
                          </button>
                        )}
                      >
                        {({ close }) => (
                          <>
                            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                              Assign to
                            </div>
                            {roster.map((tech) => (
                              <MenuItem
                                key={tech}
                                onClick={() => {
                                  assign(w.id, tech);
                                  close();
                                }}
                              >
                                {tech}
                              </MenuItem>
                            ))}
                          </>
                        )}
                      </Dropdown>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Technician columns */}
          {perTech.map(({ tech, wos, hours, loadPct }) => {
            const tone = loadTone(loadPct);
            return (
              <section
                key={tech}
                className="w-72 shrink-0 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <header className="px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <Avatar initials={initials(tech)} className="w-9 h-9 text-xs shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{tech}</div>
                      <div className="text-[11px] text-slate-400">
                        {wos.length} open · {hours}h load
                      </div>
                    </div>
                  </div>
                  {/* Load bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className={cn('font-semibold', tone.text)}>{tone.label}</span>
                      <span className="font-semibold text-slate-600">
                        {hours}/{DAY_CAPACITY}h · {loadPct}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', tone.bar)}
                        style={{ width: `${Math.min(100, loadPct)}%` }}
                      />
                    </div>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                  {wos.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-10 border border-dashed border-slate-200 rounded-lg">
                      No open work orders
                    </div>
                  ) : (
                    wos.map((w) => (
                      <Link
                        key={w.id}
                        href={`/maintenance/${w.id}`}
                        className="block rounded-lg bg-slate-50 border border-slate-200 p-2.5 hover:border-primary-400 hover:bg-white transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full shrink-0', PRIORITY_DOT[w.priority])} />
                          <span className="font-mono text-[10px] text-slate-400">{w.id}</span>
                          <span className="ml-auto text-[10px] font-medium text-slate-400">{w.estimatedHours}h</span>
                        </div>
                        <div className="mt-1 text-xs font-medium text-slate-700 leading-snug line-clamp-2">
                          {w.title}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
