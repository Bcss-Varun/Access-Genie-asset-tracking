import { Link } from 'react-router-dom';
import type { DashboardTriage } from '@access-genie/shared';
import { cn } from '@/lib/utils';

/**
 * The reason the dashboard exists: does anything need me, right now?
 *
 * The screen this replaced answered that question somewhere around the fifth
 * scroll — you passed eight KPI rows before learning three alerts were
 * critical. This sits above everything, and every chip is a link into the queue
 * that clears it, filtered, rather than a number to memorise and go looking for.
 *
 * Chips appear only when their count is above zero. That is the whole design:
 * an operator should be able to read this strip in half a second, and a row of
 * confident zeros takes longer to read than nothing at all. When every count is
 * zero the strip says so in one calm line.
 */
type Chip = {
  key: keyof DashboardTriage;
  label: (n: number) => string;
  href: string;
  tone: 'red' | 'amber' | 'slate';
  icon: string;
};

const CHIPS: Chip[] = [
  {
    key: 'criticalAlerts',
    label: (n) => `${n} critical alert${n === 1 ? '' : 's'}`,
    href: '/alerts?severity=Critical',
    tone: 'red',
    icon: '🚨',
  },
  {
    key: 'overdueWorkOrders',
    label: (n) => `${n} overdue work order${n === 1 ? '' : 's'}`,
    href: '/maintenance?due=overdue',
    tone: 'red',
    icon: '🔧',
  },
  {
    key: 'missingAssets',
    label: (n) => `${n} asset${n === 1 ? '' : 's'} missing`,
    href: '/assets?status=Missing',
    tone: 'red',
    icon: '📍',
  },
  {
    key: 'unassignedWork',
    label: (n) => `${n} unassigned`,
    href: '/maintenance?status=New',
    tone: 'amber',
    icon: '🧰',
  },
  {
    key: 'expiringCerts',
    label: (n) => `${n} certification${n === 1 ? '' : 's'} expiring`,
    href: '/certifications',
    tone: 'amber',
    icon: '🎖️',
  },
];

const TONES = {
  red: 'border-red-200 bg-red-50 text-health-critical hover:bg-red-100',
  amber: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
  slate: 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100',
} as const;

export function TriageStrip({ triage }: { triage: DashboardTriage }) {
  const active = CHIPS.filter((chip) => triage[chip.key] > 0);

  if (active.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
        <span aria-hidden>✓</span>
        <p className="text-sm font-medium text-emerald-800">Nothing needs you right now.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5">
      <span className="mr-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        <span aria-hidden>⚠</span> Needs you now
      </span>
      {active.map((chip) => (
        <Link
          key={chip.key}
          to={chip.href}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
            TONES[chip.tone],
          )}
        >
          <span aria-hidden>{chip.icon}</span>
          {chip.label(triage[chip.key])}
        </Link>
      ))}
    </div>
  );
}
