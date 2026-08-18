import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CycleCount, CycleCountStatus } from '@access-genie/shared';
import { allCycleCounts } from '@/lib/dataset';
import { PageHeader, KpiCard, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Drawer, DrawerSection } from '@/components/ui/Drawer';
import { FormDialog, Field, FieldRow, Select, TextInput, dateInDays } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { cycleCountsApi } from '@/api/maintenance';
import { allUsers, switchableScopes } from '@/lib/rbac';
import { relTime } from '@/lib/utils';
import { cycleCountVariance } from '@/lib/field-ops';

/**
 * Rolling physical counts.
 *
 * The one rule that matters here is enforced on the server, not in this form:
 * once someone records what they counted, the *system* decides whether that is
 * Reconciled or a Variance. Letting the counter declare "Reconciled" over a
 * mismatch is precisely how a stock register comes to agree with itself and
 * disagree with the shelf.
 */

const statusTone = (s: CycleCountStatus): 'emerald' | 'amber' | 'red' | 'slate' =>
  s === 'Reconciled' ? 'emerald' : s === 'In Progress' ? 'amber' : s === 'Variance' ? 'red' : 'slate';

function ScheduleDialog({ onClose }: { onClose: () => void }) {
  const { run, isPending } = useMutate();

  // Counted places come from the location tree. They used to come from the
  // spare-parts warehouse list, which was the wrong register even before that
  // module was withdrawn: a cycle count counts *assets*, and an asset's place
  // is a node of the scope tree, not a shelf in a stores building.
  const places = switchableScopes().map(({ node }) => ({ value: node.name, label: node.name }));
  const [location, setLocation] = useState(places[0]?.value ?? '');
  const [expected, setExpected] = useState('0');
  const [date, setDate] = useState(dateInDays(7));
  const [assignedTo, setAssignedTo] = useState(allUsers[0]?.name ?? 'Unassigned');

  const submit = async () => {
    const ok = await run(
      cycleCountsApi.create({
        location: location.trim(),
        date: new Date(date).toISOString(),
        expected: Number(expected) || 0,
        countedBy: assignedTo,
      }),
      {
        success: 'Count scheduled',
        successDetail: `${location} — ${expected} expected on ${date}`,
        describe: 'schedule that count',
      },
    );
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="🔢"
      title="Schedule a cycle count"
      description="Expected is what the system believes is there. What is actually counted decides the outcome."
      submitLabel="Schedule"
      busy={isPending}
      disabled={location.trim().length < 2}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="Location" required hint="Where the count happens.">
        {places.length > 0 ? (
          <Select value={location} onChange={(e) => setLocation(e.target.value)} options={places} />
        ) : (
          <TextInput autoFocus value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Hyderabad Central Store" />
        )}
      </Field>

      <FieldRow>
        <Field label="Expected count" hint="What the records say should be there.">
          <TextInput type="number" min={0} value={expected} onChange={(e) => setExpected(e.target.value)} />
        </Field>
        <Field label="Date" required>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label="Assigned to">
        <Select
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          options={[{ value: 'Unassigned', label: 'Unassigned' }, ...allUsers.map((u) => ({ value: u.name, label: u.name }))]}
        />
      </Field>
    </FormDialog>
  );
}

function RecordCountDialog({ count, onClose }: { count: CycleCount; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const [counted, setCounted] = useState(String(count.counted));

  const value = Number(counted) || 0;
  const variance = value - count.expected;

  const submit = async () => {
    const ok = await run(cycleCountsApi.update(count.id, { counted: value, status: 'In Progress' }), {
      success: variance === 0 ? 'Count reconciled' : 'Variance recorded',
      successDetail:
        variance === 0
          ? `${value} of ${count.expected} — matches.`
          : `${value} counted against ${count.expected} expected (${variance > 0 ? '+' : ''}${variance}).`,
      describe: 'record that count',
    });
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="🔢"
      title={`Record the count at ${count.location}`}
      description="The outcome is worked out from the numbers — a count that matches reconciles, one that does not is a variance."
      submitLabel="Record"
      busy={isPending}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Expected">
          <TextInput value={String(count.expected)} disabled />
        </Field>
        <Field label="Counted" required>
          <TextInput autoFocus type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} />
        </Field>
      </FieldRow>

      <div
        className={`rounded-lg px-3 py-2.5 text-sm ${
          variance === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
        }`}
      >
        {variance === 0 ? (
          <>This will reconcile — the shelf and the register agree.</>
        ) : (
          <>
            This will be recorded as a <strong>variance</strong> of {variance > 0 ? '+' : ''}
            {variance}. {variance < 0 ? 'Fewer items than expected.' : 'More items than expected.'}
          </>
        )}
      </div>
    </FormDialog>
  );
}

function VarianceDrawer({ count, onClose }: { count: CycleCount; onClose: () => void }) {
  const rows = cycleCountVariance(count);
  const missing = rows.filter((r) => r.status === 'Missing').length;
  const unexpected = rows.filter((r) => r.status === 'Unexpected').length;

  return (
    <Drawer icon="🔎" title={`Variance — ${count.location}`} subtitle={`${count.id} · ${rows.length} line items`} onClose={onClose} width="lg">
      <div className="flex items-center gap-2">
        <Badge tone={missing > 0 ? 'red' : 'emerald'}>{missing} missing</Badge>
        <Badge tone={unexpected > 0 ? 'amber' : 'emerald'}>{unexpected} unexpected</Badge>
      </div>

      <DrawerSection title="Line Items">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">No assets on file for this location yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2">Asset</th>
                  <th className="px-3 py-2">Expected</th>
                  <th className="px-3 py-2">Found</th>
                  <th className="px-3 py-2">Diff</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Last Location</th>
                  <th className="px-3 py-2">Last Custodian</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.assetId}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{r.assetName}</div>
                      <div className="font-mono text-slate-400">{r.assetId}</div>
                    </td>
                    <td className="px-3 py-2">{r.expected}</td>
                    <td className="px-3 py-2">{r.found}</td>
                    <td className="px-3 py-2">{r.found - r.expected === 0 ? '0' : r.found - r.expected > 0 ? `+${r.found - r.expected}` : r.found - r.expected}</td>
                    <td className="px-3 py-2">
                      <Badge tone={r.status === 'Found' ? 'emerald' : r.status === 'Missing' ? 'red' : 'amber'}>{r.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{r.lastKnownLocation}</td>
                    <td className="px-3 py-2 text-slate-500">{r.lastCustodian}</td>
                    <td className="px-3 py-2 text-right">
                      <Link to={`/assets/${r.assetId}`} className="text-primary-600 hover:text-primary-700 font-medium">Investigate →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DrawerSection>
    </Drawer>
  );
}

export default function CycleCountsPage() {
  const { run, isPending } = useMutate();
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'record'; count: CycleCount } | null>(null);
  const [deleting, setDeleting] = useState<CycleCount | null>(null);
  const [viewingVariance, setViewingVariance] = useState<CycleCount | null>(null);

  const counts = allCycleCounts;
  const has = (s: CycleCountStatus) => counts.filter((c) => c.status === s).length;

  const remove = async () => {
    if (!deleting) return;
    await run(cycleCountsApi.remove(deleting.id), { success: 'Count removed', describe: 'remove that count' });
    setDeleting(null);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Cycle Counts"
        subtitle="Physical inventory verification — expected vs. counted, with a full variance breakdown per location."
        breadcrumb={[{ label: 'Mobile Workforce', href: '/workforce' }, { label: 'Cycle Counts' }]}
        actions={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Cycle Count</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Scheduled" value={has('Scheduled')} tone="slate" sub="Not yet started" />
        <KpiCard label="In Progress" value={has('In Progress')} tone="amber" sub="Being counted" />
        <KpiCard label="Reconciled" value={has('Reconciled')} tone="emerald" sub="Closed & matched" />
        <KpiCard label="Variance" value={has('Variance')} tone="red" sub="Discrepancy found" />
      </div>

      {counts.length === 0 ? (
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="🔢"
            title="No cycle counts scheduled"
            description="A count is the only thing that tests whether the register matches the shelf. Without one, stock figures are believed rather than verified."
            action={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Cycle Count</Button>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {counts.map((c) => {
            const pct = c.expected > 0 ? Math.round((c.counted / c.expected) * 100) : 0;
            const variance = c.counted - c.expected;
            const barColor =
              c.status === 'Variance' ? 'bg-red-500' : c.status === 'Reconciled' ? 'bg-emerald-500' : 'bg-primary-500';
            return (
              <div key={c.id} className="glass-panel rounded-xl p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-heading font-semibold text-slate-900 truncate">{c.location}</h3>
                    <div className="text-[11px] font-mono text-slate-400">{c.id}</div>
                  </div>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-slate-500">Counted</span>
                    <span className="tabular-nums font-medium text-slate-800">
                      {c.counted.toLocaleString()} / {c.expected.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">{pct}% counted</span>
                    <span
                      className={
                        variance === 0
                          ? 'text-slate-400'
                          : variance < 0
                            ? 'text-red-600 font-medium'
                            : 'text-amber-600 font-medium'
                      }
                    >
                      {variance === 0 ? 'No variance' : `${variance > 0 ? '+' : ''}${variance} vs expected`}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span>{c.assignedTo}</span>
                  <span>{relTime(c.date)}</span>
                </div>

                <div className="mt-2 flex items-center justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => setViewingVariance(c)}>
                    View variance
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDialog({ mode: 'record', count: c })}>
                    Record count
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(c)}>
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialog?.mode === 'new' && <ScheduleDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'record' && <RecordCountDialog count={dialog.count} onClose={() => setDialog(null)} />}
      {viewingVariance && <VarianceDrawer count={viewingVariance} onClose={() => setViewingVariance(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Remove the count at ${deleting.location}?`}
          description="The record goes, including any variance it found."
          confirmLabel="Remove"
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
