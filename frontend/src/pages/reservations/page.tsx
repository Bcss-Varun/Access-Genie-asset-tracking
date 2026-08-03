import { allReservations } from '@/lib/dataset';
import type { Reservation, ReservationStatus } from '@access-genie/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';

// ─────────────────────────────────────────────────────────────────────────────
// Reservations & booking — shared-asset scheduling with a week-strip visual.
// Day indices are 0=Mon … 6=Sun for the current demo week (deterministic).
// ─────────────────────────────────────────────────────────────────────────────


const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_TONE: Record<ReservationStatus, 'emerald' | 'amber' | 'primary' | 'slate'> = {
  Confirmed: 'emerald',
  Pending: 'amber',
  'In Use': 'primary',
  Returned: 'slate',
  Cancelled: 'slate',
};

// Two reservations conflict when they share the same asset and their day windows overlap.
function overlaps(a: Reservation, b: Reservation) {
  return a.assetId === b.assetId && a.startDay <= b.endDay && b.startDay <= a.endDay;
}

const BAR_TONE: Record<ReservationStatus, string> = {
  Confirmed: 'bg-emerald-500',
  Pending: 'bg-amber-500',
  'In Use': 'bg-primary-600',
  Returned: 'bg-slate-400',
  Cancelled: 'bg-slate-300',
};

export default function ReservationsPage() {
  const { toast } = useToast();
  const [reservations] = useState<Reservation[]>(allReservations);

  const conflictIds = new Set<string>();
  for (let i = 0; i < reservations.length; i++) {
    for (let j = i + 1; j < reservations.length; j++) {
      if (overlaps(reservations[i], reservations[j])) {
        conflictIds.add(reservations[i].id);
        conflictIds.add(reservations[j].id);
      }
    }
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Reservations & Booking"
        subtitle="Reserve shared assets across the week and resolve scheduling conflicts."
        breadcrumb={[{ label: 'Operations', href: '/operations/transfers' }, { label: 'Reservations' }]}
        actions={
          <Button onClick={() => toast({ title: 'New reservation', description: 'Pick a shared asset and a time window to book it.', tone: 'info' })}>
            + New Reservation
          </Button>
        }
      />

      {/* Week strip */}
      <div className="glass-panel rounded-xl p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">This Week</div>
        <div className="grid grid-cols-7 gap-2">
          {WEEK.map((d) => (
            <div key={d} className="text-center text-[11px] font-medium text-slate-500 pb-1">{d}</div>
          ))}
        </div>
        <div className="space-y-1.5 mt-1">
          {reservations.map((r) => (
            <div key={r.id} className="grid grid-cols-7 gap-2 items-center">
              {WEEK.map((_, day) => {
                const active = day >= r.startDay && day <= r.endDay;
                const isConflict = conflictIds.has(r.id);
                return (
                  <div key={day} className="h-6">
                    {active && (
                      <div
                        className={`h-full rounded ${BAR_TONE[r.status]} ${isConflict ? 'ring-2 ring-amber-400 ring-offset-1' : ''} flex items-center px-1.5`}
                        title={`${r.assetName} · ${r.reservedBy}`}
                      >
                        {day === r.startDay && (
                          <span className="text-[9px] font-semibold text-white truncate">{r.assetName.split(' ')[0]}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Reservation list */}
      <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">Reservation</th>
                <th className="px-6 py-4">Asset</th>
                <th className="px-6 py-4">Reserved By</th>
                <th className="px-6 py-4">Window</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reservations.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-mono text-xs text-slate-500">{r.id}</div>
                    {conflictIds.has(r.id) && (
                      <span className="text-[10px] font-medium text-amber-600">⚠️ Conflict</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <Link to={`/assets/${r.assetId}`} className="font-medium text-slate-800 hover:text-primary-600 transition-colors">
                      {r.assetName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{r.reservedBy}</td>
                  <td className="px-6 py-4 text-slate-600 text-xs">
                    {r.startLabel} <span className="text-primary-500">→</span> {r.endLabel}
                  </td>
                  <td className="px-6 py-4">
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
