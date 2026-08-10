import { allReservations } from '@/lib/dataset';
import type { Reservation, ReservationStatus } from '@access-genie/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { FormDialog, Field, FieldRow, Select, TextInput } from '@/components/ui/FormDialog';
import { AssetPicker } from '@/components/ui/AssetPicker';
import { useMutate } from '@/api/mutate';
import { operationsApi } from '@/api/operations';
import { useSession } from '@/components/providers/SessionProvider';
import { allAssets } from '@/lib/dataset';

// ─────────────────────────────────────────────────────────────────────────────
// Reservations — shared/pooled assets (loaner laptops, projectors, test gear)
// booked for a window, with a week-strip calendar and a list view. The server
// refuses double-booking and anything under maintenance or already committed
// to an active job — see operations.service.ts.
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

/** Spec vocabulary (Requested/Active/Completed) mapped onto the stored statuses. */
const STATUS_LABEL: Record<ReservationStatus, string> = {
  Pending: 'Requested',
  Confirmed: 'Confirmed',
  'In Use': 'Active',
  Returned: 'Completed',
  Cancelled: 'Cancelled',
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

/**
 * Book a shared asset for part of the week.
 *
 * The server refuses an overlapping booking, so this submits and renders the
 * refusal rather than pre-checking — one source of truth for "is it free",
 * and no window where the screen says yes and the server says no.
 */
function BookDialog({ onClose }: { onClose: () => void }) {
  const { run, isPending } = useMutate();
  const { session } = useSession();

  const [assetId, setAssetId] = useState('');
  const [startDay, setStartDay] = useState('0');
  const [endDay, setEndDay] = useState('0');
  const [purpose, setPurpose] = useState('');

  const from = Number(startDay);
  const to = Number(endDay);
  const asset = allAssets.find((a) => a.id === assetId);
  const blocked = asset?.status === 'Maintenance';

  const submit = async () => {
    if (!asset) return;

    const ok = await run(
      operationsApi.reserve({
        assetId,
        reservedBy: session.user.name,
        startDay: from,
        endDay: to,
        startLabel: WEEK[from] as string,
        endLabel: WEEK[to] as string,
        purpose: purpose.trim() || undefined,
      }),
      {
        success: 'Reserved',
        successDetail: `${asset.name} — ${WEEK[from]} to ${WEEK[to]}.`,
        describe: 'reserve that asset',
      },
    );
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="📅"
      title="Reserve an asset"
      description="Bookings run in whole days across the current week. An overlapping booking, or one against an asset under maintenance or already on an active job, is refused."
      submitLabel="Reserve"
      busy={isPending}
      disabled={!assetId || to < from || blocked}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <AssetPicker value={assetId} onChange={setAssetId} required label="Asset to reserve" />

      {blocked && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {asset?.name} is under maintenance and cannot be reserved right now.
        </p>
      )}

      <FieldRow>
        <Field label="From" required>
          <Select
            value={startDay}
            onChange={(e) => {
              setStartDay(e.target.value);
              if (Number(e.target.value) > to) setEndDay(e.target.value);
            }}
            options={WEEK.map((d, i) => ({ value: String(i), label: d }))}
          />
        </Field>
        <Field label="Until" required hint={to < from ? 'The end cannot be before the start.' : undefined}>
          <Select value={endDay} onChange={(e) => setEndDay(e.target.value)} options={WEEK.map((d, i) => ({ value: String(i), label: d }))} />
        </Field>
      </FieldRow>

      <Field label="Purpose" hint="What the booking is for.">
        <TextInput value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Client demo, Tuesday morning" />
      </Field>
    </FormDialog>
  );
}

export default function ReservationsPage() {
  const [booking, setBooking] = useState(false);
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
        title="Reservations"
        subtitle="Book shared assets — loaner laptops, projectors, test equipment — and resolve scheduling conflicts."
        breadcrumb={[{ label: 'Mobile Workforce', href: '/workforce' }, { label: 'Reservations' }]}
        actions={
          <Button onClick={() => setBooking(true)}>
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
                <th className="px-6 py-4">Purpose</th>
                <th className="px-6 py-4">Window</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reservations.map((r) => {
                const asset = allAssets.find((a) => a.id === r.assetId);
                return (
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
                    <td className="px-6 py-4 text-slate-500 text-xs">{r.purpose || '—'}</td>
                    <td className="px-6 py-4 text-slate-600 text-xs">
                      {r.startLabel} <span className="text-primary-500">→</span> {r.endLabel}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{asset?.location?.name ?? '—'}</td>
                    <td className="px-6 py-4">
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {booking && <BookDialog onClose={() => setBooking(false)} />}

    </div>
  );
}
