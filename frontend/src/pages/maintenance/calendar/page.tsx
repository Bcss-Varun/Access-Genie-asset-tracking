import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allWorkOrders } from '@/lib/dataset';
import type { WorkOrder, WorkOrderPriority } from '@access-genie/shared';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

// ── constants (module scope → stable, no Date.now in render) ──────────────────
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Demo "today" so the current-day ring is deterministic. */
const DEMO_YEAR = 2026;
const DEMO_MONTH = 6; // July (0-indexed)
const DEMO_DAY = 23;

const PRIORITY_META: Record<
  WorkOrderPriority,
  { dot: string; chip: string; label: WorkOrderPriority }
> = {
  Critical: {
    dot: '#ef4444',
    chip: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
    label: 'Critical',
  },
  High: {
    dot: '#f59e0b',
    chip: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    label: 'High',
  },
  Medium: {
    dot: '#6366f1',
    chip: 'bg-primary-50 text-primary-700 border-primary-100 hover:bg-primary-100',
    label: 'Medium',
  },
  Low: {
    dot: '#64748b',
    chip: 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200',
    label: 'Low',
  },
};

/** Parse an ISO date into its UTC year/month/day (avoids TZ hydration drift). */
function ymd(iso: string): { y: number; m: number; d: number } {
  const dt = new Date(iso);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

export default function MaintenanceCalendarPage() {
  const [year, setYear] = useState(DEMO_YEAR);
  const [month, setMonth] = useState(DEMO_MONTH);

  const step = (dir: -1 | 1) => {
    const next = month + dir;
    if (next < 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else if (next > 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth(next);
    }
  };

  // ── bucket work orders onto their due-date cells ───────────────────────────
  const byDay = useMemo(() => {
    const map = new Map<number, WorkOrder[]>();
    for (const wo of allWorkOrders) {
      const { y, m, d } = ymd(wo.dueDate);
      if (y === year && m === month) {
        const list = map.get(d) ?? [];
        list.push(wo);
        map.set(d, list);
      }
    }
    return map;
  }, [year, month]);

  const totalInMonth = useMemo(
    () => Array.from(byDay.values()).reduce((n, l) => n + l.length, 0),
    [byDay],
  );

  // ── build the grid (leading blanks + days) ─────────────────────────────────
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Maintenance Calendar"
        subtitle="Work orders placed on their due date — color-coded by priority."
        breadcrumb={[{ label: 'Maintenance', href: '/maintenance' }, { label: 'Calendar' }]}
        actions={
          <Link to="/maintenance/new">
            <Button variant="primary">+ New Work Order</Button>
          </Link>
        }
      />

      {/* Month toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => step(-1)} aria-label="Previous month">
            ‹ Prev
          </Button>
          <h2 className="text-xl font-heading font-bold text-slate-900 min-w-[11rem] text-center">
            {MONTH_NAMES[month]} {year}
          </h2>
          <Button variant="outline" size="sm" onClick={() => step(1)} aria-label="Next month">
            Next ›
          </Button>
          {(year !== DEMO_YEAR || month !== DEMO_MONTH) && (
            <button
              onClick={() => {
                setYear(DEMO_YEAR);
                setMonth(DEMO_MONTH);
              }}
              className="text-xs font-medium text-primary-600 hover:underline"
            >
              Today
            </button>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {(Object.keys(PRIORITY_META) as WorkOrderPriority[]).map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PRIORITY_META[p].dot }} />
              {p}
            </span>
          ))}
          <Badge tone="slate">{totalInMonth} this month</Badge>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="glass-panel rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500"
            >
              {w}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 flex-1 min-h-0 auto-rows-fr">
          {cells.map((day, i) => {
            const isToday = day !== null && year === DEMO_YEAR && month === DEMO_MONTH && day === DEMO_DAY;
            const items = day !== null ? byDay.get(day) ?? [] : [];
            return (
              <div
                key={i}
                className={cn(
                  'border-b border-r border-slate-100 p-1.5 min-h-[6rem] flex flex-col gap-1 overflow-hidden',
                  day === null && 'bg-slate-50/50',
                  (i + 1) % 7 === 0 && 'border-r-0',
                )}
              >
                {day !== null && (
                  <>
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          'text-xs font-medium',
                          isToday
                            ? 'flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-white'
                            : 'text-slate-500',
                        )}
                      >
                        {day}
                      </span>
                      {items.length > 0 && (
                        <span className="text-[10px] font-semibold text-slate-400">{items.length}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 overflow-y-auto">
                      {items.map((wo) => {
                        const meta = PRIORITY_META[wo.priority];
                        return (
                          <Link
                            key={wo.id}
                            to={`/maintenance/${wo.id}`}
                            title={`${wo.id} · ${wo.title} · ${wo.priority}`}
                            className={cn(
                              'flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-medium leading-tight transition-colors',
                              meta.chip,
                            )}
                          >
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: meta.dot }}
                            />
                            <span className="truncate">{wo.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
