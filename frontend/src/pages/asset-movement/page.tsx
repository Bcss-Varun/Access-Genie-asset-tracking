import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, MetricCard, Badge, EmptyState } from '@/components/ui/primitives';
import { Tabs, useTabs } from '@/components/tracking/shell';
import { Button } from '@/components/ui/Button';
import { Field, FieldRow, Select, TextArea, TextInput } from '@/components/ui/FormDialog';
import { Drawer, DrawerRow, DrawerSection } from '@/components/ui/Drawer';
import { useToast } from '@/components/providers/ToastProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { useMutate } from '@/api/mutate';
import { useRefreshDataset } from '@/api/dataset';
import { operationsApi } from '@/api/operations';
import { custodyApi } from '@/api/catalog';
import { allAssets, allTransfers, allCustody, getWorkOrdersForAsset } from '@/lib/dataset';
import { flattenScope, allUsers } from '@/lib/rbac';
import { previousCustodyHolder } from '@/lib/field-ops';
import { relTime, formatDateTime, cn } from '@/lib/utils';
import { ASSET_CATEGORIES, ASSET_STATUSES } from '@access-genie/shared';
import type { Transfer, TransferStatus, CustodyRecord } from '@access-genie/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Asset Movement & Custody — the one place a physical asset's whereabouts and
// whoever is holding it change: transfers between locations (single or bulk),
// and custody hand-offs between people. Both write through the real transfer
// and custody endpoints, which already own updating the asset's location and
// custodian — nothing here maintains a second copy of "where is it now".
// Full per-asset history stays where it already lives — Compliance ▸ Chain of
// Custody (/custody/:assetId) — linked from here rather than rebuilt.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<TransferStatus, 'amber' | 'primary' | 'slate' | 'emerald' | 'red'> = {
  Pending: 'amber',
  Approved: 'primary',
  'Picked Up': 'primary',
  'In Transit': 'slate',
  Received: 'emerald',
  Completed: 'emerald',
  Rejected: 'red',
  Cancelled: 'slate',
};
const CUSTODY_ACTION_TONE: Record<CustodyRecord['action'], 'primary' | 'emerald' | 'slate' | 'amber'> = {
  'Checked Out': 'primary',
  'Checked In': 'emerald',
  Assigned: 'slate',
  Transferred: 'amber',
};
const CONDITIONS = ['Good', 'Fair', 'Needs attention', 'Damaged'];
const APPROVER_ROLES = new Set(['super_admin', 'org_admin', 'facility_manager', 'maintenance_manager']);

// ═════════════════════════════════════════════════════════════════════════════
// Bulk / single transfer wizard
// ═════════════════════════════════════════════════════════════════════════════
function TransferWizard({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { session } = useSession();
  const refreshDataset = useRefreshDataset();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 — source (narrows the pool in step 3; the actual `from` is always
  // read off each asset's own record when the transfer is created).
  const places = useMemo(() => flattenScope().filter(({ node }) => node.level !== 'org' && node.level !== 'region'), []);
  const [sourceFacility, setSourceFacility] = useState('All');

  // Step 2 — destination.
  const [destination, setDestination] = useState(places[0]?.node.name ?? '');

  // Step 3 — assets.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assetQuery, setAssetQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Step 4 — details.
  const [reason, setReason] = useState('');
  const [requestedBy] = useState(session.user.name);
  const [requiredDate, setRequiredDate] = useState('');
  const [notes, setNotes] = useState('');
  const [approver, setApprover] = useState('');

  const approverOptions = allUsers.filter((u) => APPROVER_ROLES.has(u.roleId) && u.name !== requestedBy);

  const candidates = allAssets
    .filter((a) => sourceFacility === 'All' || a.location.name === sourceFacility)
    .filter((a) => a.location.name !== destination)
    .filter((a) => categoryFilter === 'All' || a.category === categoryFilter)
    .filter((a) => statusFilter === 'All' || a.status === statusFilter)
    .filter((a) => {
      if (!assetQuery.trim()) return true;
      const q = assetQuery.trim().toLowerCase();
      return a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.custodian.toLowerCase().includes(q);
    });

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const selectAllFiltered = () => setSelected(new Set(candidates.map((a) => a.id)));
  const clearSelection = () => setSelected(new Set());

  const canNext =
    (step === 1) ||
    (step === 2 && destination.trim().length > 1) ||
    (step === 3 && selected.size > 0) ||
    (step === 4 && reason.trim().length > 2);

  async function submit() {
    setSubmitting(true);
    const ids = [...selected];
    const batchId = ids.length > 1 ? `BATCH-${Date.now().toString(36).toUpperCase()}` : undefined;
    const combinedNotes = [notes.trim(), approver && `Suggested approver: ${approver}.`].filter(Boolean).join(' ');

    let ok = 0;
    let failed = 0;
    for (const assetId of ids) {
      try {
        await operationsApi.requestTransfer({
          assetId,
          to: destination,
          reason: reason.trim(),
          requiredDate: requiredDate ? new Date(requiredDate).toISOString() : undefined,
          notes: combinedNotes || undefined,
          batchId,
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }

    await refreshDataset();
    setSubmitting(false);

    if (ok > 0) {
      toast({
        title: ids.length > 1 ? `Transfer batch requested — ${ok} asset${ok === 1 ? '' : 's'}` : 'Transfer requested',
        description: failed > 0 ? `${failed} asset(s) could not be requested — they may already have a transfer in progress.` : `${destination} · awaiting approval.`,
        tone: failed > 0 ? 'info' : 'success',
      });
      onClose();
    } else {
      toast({ title: 'Could not request the transfer', description: 'No assets could be queued — check they are not already in transit.', tone: 'error' });
    }
  }

  const STEP_LABELS = ['Source', 'Destination', 'Select Assets', 'Details', 'Review'];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !submitting && onClose()} />
      <div className="relative w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[90vh]">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-heading text-base font-bold text-slate-900">New Transfer</h2>
          <div className="mt-3 flex items-center gap-1.5">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5 flex-1">
                <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', step === i + 1 ? 'bg-primary-600 text-white' : step > i + 1 ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-400')}>
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <span className={cn('text-[11px] font-medium hidden sm:inline', step === i + 1 ? 'text-slate-800' : 'text-slate-400')}>{label}</span>
                {i < STEP_LABELS.length - 1 && <div className={cn('h-0.5 flex-1', step > i + 1 ? 'bg-primary-200' : 'bg-slate-100')} />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {step === 1 && (
            <>
              <p className="text-sm text-slate-500">Where are the assets coming from? This narrows the list in the next step — each asset's own recorded location is what is actually moved.</p>
              <Field label="Source facility">
                <Select value={sourceFacility} onChange={(e) => setSourceFacility(e.target.value)} options={[{ value: 'All', label: 'Any facility (search all assets)' }, ...places.map(({ node, depth }) => ({ value: node.name, label: `${'  '.repeat(Math.max(0, depth - 1))}${node.name}` }))]} />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-slate-500">Where should the selected assets end up?</p>
              <Field label="Destination" required>
                <Select value={destination} onChange={(e) => setDestination(e.target.value)} options={places.map(({ node, depth }) => ({ value: node.name, label: `${'  '.repeat(Math.max(0, depth - 1))}${node.name}` }))} />
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <TextInput value={assetQuery} onChange={(e) => setAssetQuery(e.target.value)} placeholder="Search ID, name or custodian…" className="!w-56" />
                <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="!w-auto" options={[{ value: 'All', label: 'All categories' }, ...ASSET_CATEGORIES.map((c) => ({ value: c, label: c }))]} />
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="!w-auto" options={[{ value: 'All', label: 'All statuses' }, ...ASSET_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))]} />
                <div className="ml-auto flex items-center gap-2 text-xs">
                  <button type="button" onClick={selectAllFiltered} className="font-medium text-primary-600 hover:text-primary-700">Select all filtered ({candidates.length})</button>
                  <button type="button" onClick={clearSelection} className="font-medium text-slate-400 hover:text-slate-600">Clear</button>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 max-h-72 overflow-y-auto divide-y divide-slate-100">
                {candidates.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-slate-400">No assets match — try a different source or filter.</p>
                ) : candidates.map((a) => (
                  <label key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} className="h-4 w-4 rounded border-slate-300 accent-primary-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800 truncate">{a.name}</span>
                      <span className="block text-xs text-slate-400 truncate">{a.id} · {a.category} · {a.location.name} · {a.custodian}</span>
                    </span>
                    <Badge tone="slate">{a.status.replace('_', ' ')}</Badge>
                  </label>
                ))}
              </div>
              <p className="text-sm font-medium text-slate-700">Selected Assets: <span className="text-primary-600">{selected.size}</span></p>
            </>
          )}

          {step === 4 && (
            <>
              <Field label="Reason" required hint="Read by whoever approves it.">
                <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Site consolidation — moving spare fleet to the regional hub." />
              </Field>
              <FieldRow>
                <Field label="Requested by"><TextInput value={requestedBy} disabled /></Field>
                <Field label="Required date" hint="Optional."><TextInput type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} /></Field>
              </FieldRow>
              <Field label="Approver" hint="Who this should be routed to — the server still refuses a self-approval regardless.">
                <Select value={approver} onChange={(e) => setApprover(e.target.value)} options={[{ value: '', label: 'Any approver' }, ...approverOptions.map((u) => ({ value: u.name, label: `${u.name} — ${u.title}` }))]} />
              </Field>
              <Field label="Notes" hint="Optional.">
                <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Source</span><span className="font-medium text-slate-800">{sourceFacility === 'All' ? 'Multiple facilities' : sourceFacility}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Destination</span><span className="font-medium text-slate-800">{destination}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Assets selected</span><span className="font-medium text-primary-600">{selected.size}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Reason</span><span className="font-medium text-slate-800 text-right max-w-xs">{reason}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Approver</span><span className="font-medium text-slate-800">{approver || 'Any approver'}</span></div>
                {requiredDate && <div className="flex justify-between"><span className="text-slate-500">Required by</span><span className="font-medium text-slate-800">{requiredDate}</span></div>}
              </div>
              <div className="rounded-lg border border-slate-200 max-h-52 overflow-y-auto divide-y divide-slate-100">
                {[...selected].map((id) => {
                  const a = allAssets.find((x) => x.id === id);
                  if (!a) return null;
                  return (
                    <div key={id} className="px-4 py-2 text-sm flex items-center justify-between">
                      <span className="text-slate-700 truncate">{a.name}</span>
                      <span className="font-mono text-[11px] text-slate-400">{id}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-6 py-3">
          <Button type="button" variant="outline" onClick={() => (step === 1 ? onClose() : setStep(step - 1))} disabled={submitting}>
            {step === 1 ? 'Cancel' : '← Back'}
          </Button>
          {step < 5 ? (
            <Button type="button" onClick={() => setStep(step + 1)} disabled={!canNext}>Next →</Button>
          ) : (
            <Button type="button" onClick={() => void submit()} disabled={submitting}>{submitting ? 'Submitting…' : `Submit Transfer${selected.size > 1 ? ` (${selected.size} assets)` : ''}`}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Bulk import stub — validated client-side against the real asset/location data
// ═════════════════════════════════════════════════════════════════════════════
interface ImportRow { assetId: string; to: string; reason: string; valid: boolean; error?: string }

function BulkImportDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const refreshDataset = useRefreshDataset();
  const [raw, setRaw] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const places = useMemo(() => new Set(flattenScope().map(({ node }) => node.name)), []);

  function parse() {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const body = lines[0]?.toLowerCase().startsWith('asset') ? lines.slice(1) : lines;
    const seen = new Set<string>();

    const parsed: ImportRow[] = body.map((line) => {
      const [assetId = '', to = '', reason = ''] = line.split(',').map((c) => c.trim());
      const asset = allAssets.find((a) => a.id === assetId);
      const duplicate = seen.has(assetId);
      seen.add(assetId);

      let error: string | undefined;
      if (!assetId) error = 'Missing asset ID';
      else if (!asset) error = 'Unknown asset ID';
      else if (!to) error = 'Missing destination';
      else if (!places.has(to)) error = 'Destination not found in the org hierarchy';
      else if (asset.location.name === to) error = 'Already at that destination';
      else if (duplicate) error = 'Duplicate row for this asset';
      else if (!reason) error = 'Missing reason';

      return { assetId, to, reason, valid: !error, error };
    });

    setRows(parsed);
  }

  async function createBatch() {
    if (!rows) return;
    const valid = rows.filter((r) => r.valid);
    if (valid.length === 0) return;

    setSubmitting(true);
    const batchId = `BATCH-${Date.now().toString(36).toUpperCase()}`;
    let ok = 0;
    for (const row of valid) {
      try {
        await operationsApi.requestTransfer({ assetId: row.assetId, to: row.to, reason: row.reason, batchId });
        ok += 1;
      } catch {
        // counted via the ok/total difference below
      }
    }
    await refreshDataset();
    setSubmitting(false);
    toast({ title: `Transfer batch created — ${ok} of ${valid.length} rows`, tone: ok === valid.length ? 'success' : 'info' });
    onClose();
  }

  const validCount = rows?.filter((r) => r.valid).length ?? 0;
  const invalidCount = rows ? rows.length - validCount : 0;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !submitting && onClose()} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-heading text-base font-bold text-slate-900">Bulk import — transfer file</h2>
          <p className="mt-1 text-sm text-slate-500">Paste CSV rows as <code className="text-xs bg-slate-100 rounded px-1 py-0.5">Asset ID, Destination, Reason</code> — one per line. Rows are validated against the live asset registry and org hierarchy before anything is created.</p>
        </div>
        <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {!rows ? (
            <TextArea rows={8} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={'AST-1002, Bengaluru HQ, Rebalance switching capacity\nAST-1009, Chennai Data Center, Return after RAID rebuild'} />
          ) : (
            <>
              <div className="flex items-center gap-3 text-xs">
                <Badge tone="emerald">{validCount} valid</Badge>
                {invalidCount > 0 && <Badge tone="red">{invalidCount} invalid</Badge>}
              </div>
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {rows.map((r, i) => (
                  <div key={i} className={cn('px-3 py-2 text-xs flex items-center justify-between gap-2', !r.valid && 'bg-red-50/60')}>
                    <span className="font-mono text-slate-500 shrink-0">{r.assetId || '—'}</span>
                    <span className="text-slate-600 truncate flex-1">→ {r.to || '—'}</span>
                    {r.valid ? <Badge tone="emerald">Valid</Badge> : <span className="text-health-critical font-medium shrink-0">{r.error}</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-6 py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          {!rows ? (
            <Button type="button" onClick={parse} disabled={!raw.trim()}>Validate rows</Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setRows(null)}>← Edit</Button>
              <Button type="button" onClick={() => void createBatch()} disabled={validCount === 0 || submitting}>{submitting ? 'Creating…' : `Create Transfer Batch (${validCount})`}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Transfer detail drawer
// ═════════════════════════════════════════════════════════════════════════════
function TransferDetailDrawer({ transfer, batch, onClose }: { transfer: Transfer; batch: Transfer[]; onClose: () => void }) {
  return (
    <Drawer icon="🚚" title={transfer.batchId ? `Batch ${transfer.batchId}` : transfer.id} subtitle={transfer.batchId ? `${batch.length} assets · ${transfer.to}` : transfer.assetName} onClose={onClose}>
      <div><Badge tone={STATUS_TONE[transfer.status]}>{transfer.status}</Badge></div>

      <DrawerSection title="Movement">
        <DrawerRow label="From" value={transfer.from} />
        <DrawerRow label="To" value={transfer.to} />
        {transfer.requiredDate && <DrawerRow label="Required by" value={formatDateTime(transfer.requiredDate)} />}
      </DrawerSection>

      <DrawerSection title="Approval">
        <DrawerRow label="Requester" value={transfer.requester} />
        <DrawerRow label="Approver" value={transfer.approver || 'Awaiting approval'} />
      </DrawerSection>

      {transfer.notes && (
        <DrawerSection title="Notes"><p className="text-sm text-slate-600">{transfer.notes}</p></DrawerSection>
      )}

      <DrawerSection title="Reason"><p className="text-sm text-slate-600">{transfer.reason || '—'}</p></DrawerSection>

      <DrawerSection title={`Assets (${batch.length})`}>
        <ul className="space-y-1.5">
          {batch.map((t) => (
            <li key={t.id}>
              <Link to={`/assets/${t.assetId}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-primary-300">
                <span className="text-slate-700 truncate">{t.assetName}</span>
                <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </DrawerSection>

      <DrawerSection title="Audit History">
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between"><span className="text-slate-500">Requested</span><span className="text-slate-700">{formatDateTime(transfer.requestedAt)}</span></li>
          {transfer.approvedAt && <li className="flex items-center justify-between"><span className="text-slate-500">{transfer.status === 'Rejected' ? 'Rejected' : 'Approved'}</span><span className="text-slate-700">{formatDateTime(transfer.approvedAt)}</span></li>}
          {transfer.pickedUpAt && <li className="flex items-center justify-between"><span className="text-slate-500">Picked up</span><span className="text-slate-700">{formatDateTime(transfer.pickedUpAt)}</span></li>}
          {transfer.receivedAt && <li className="flex items-center justify-between"><span className="text-slate-500">Received</span><span className="text-slate-700">{formatDateTime(transfer.receivedAt)}</span></li>}
          {transfer.completedAt && <li className="flex items-center justify-between"><span className="text-slate-500">Completed</span><span className="text-slate-700">{formatDateTime(transfer.completedAt)}</span></li>}
        </ul>
      </DrawerSection>
    </Drawer>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Transfers tab
// ═════════════════════════════════════════════════════════════════════════════
function TransfersTab() {
  const { run } = useMutate();
  const [transfers, setTransfers] = useState<Transfer[]>(allTransfers);
  const [creating, setCreating] = useState<'single' | 'import' | null>(null);
  const [selected, setSelected] = useState<Transfer | null>(null);

  // One row per batch (or per single transfer) — the model stays one document
  // per asset, this is only how the list groups them for display.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const grouped: { lead: Transfer; batch: Transfer[] }[] = [];
    for (const t of transfers) {
      const key = t.batchId ?? t.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const batch = t.batchId ? transfers.filter((x) => x.batchId === t.batchId) : [t];
      grouped.push({ lead: t, batch });
    }
    return grouped.sort((a, b) => Date.parse(b.lead.requestedAt) - Date.parse(a.lead.requestedAt));
  }, [transfers]);

  function advance(t: Transfer, status: TransferStatus, verb: string) {
    const before = transfers;
    setTransfers((prev) => prev.map((x) => (x.id === t.id ? { ...x, status } : x)));
    void run(operationsApi.advanceTransfer(t.id, status), {
      success: `${t.id} ${verb}`,
      describe: `${verb} that transfer`,
      rollback: () => setTransfers(before),
      refreshTracking: status === 'Received',
    });
  }

  const open = transfers.filter((t) => !['Received', 'Completed', 'Rejected', 'Cancelled'].includes(t.status)).length;
  const pending = transfers.filter((t) => t.status === 'Pending').length;
  const inTransit = transfers.filter((t) => t.status === 'Picked Up' || t.status === 'In Transit').length;
  const completed = transfers.filter((t) => t.status === 'Received' || t.status === 'Completed').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Open Movements" value={open} sub="Not yet received" tone="primary" />
        <MetricCard label="Pending Approval" value={pending} sub="Awaiting sign-off" tone="amber" />
        <MetricCard label="Dispatched / In Transit" value={inTransit} sub="On the move" tone="primary" />
        <MetricCard label="Received / Completed" value={completed} sub="This estate" tone="emerald" />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => setCreating('import')}>Bulk Import</Button>
        <Button onClick={() => setCreating('single')}>+ New Transfer</Button>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-4">Request</th>
              <th className="px-6 py-4">Asset(s)</th>
              <th className="px-6 py-4">Route</th>
              <th className="px-6 py-4">Requester → Approver</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ lead: t, batch }) => (
              <tr key={t.batchId ?? t.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelected(t)}>
                <td className="px-6 py-4">
                  <div className="font-mono text-xs text-slate-500">{t.batchId ?? t.id}</div>
                  <div className="text-[11px] text-slate-400">{relTime(t.requestedAt)}</div>
                </td>
                <td className="px-6 py-4">
                  {batch.length > 1 ? (
                    <span className="font-medium text-slate-800">{batch.length} assets</span>
                  ) : (
                    <Link to={`/assets/${t.assetId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-800 hover:text-primary-600 transition-colors">{t.assetName}</Link>
                  )}
                  <div className="text-[11px] text-slate-400 max-w-xs truncate">{t.reason}</div>
                </td>
                <td className="px-6 py-4 text-slate-600">
                  <div className="flex items-center gap-1.5 text-xs"><span>{t.from}</span><span className="text-primary-500">→</span><span className="font-medium text-slate-700">{t.to}</span></div>
                </td>
                <td className="px-6 py-4"><div className="text-xs text-slate-600">{t.requester} <span className="text-slate-300">→</span> {t.approver || '—'}</div></td>
                <td className="px-6 py-4"><Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge></td>
                <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  {t.status === 'Pending' && <div className="flex justify-end gap-1"><Button size="sm" onClick={() => advance(t, 'Approved', 'approved')}>Approve</Button><Button size="sm" variant="ghost" onClick={() => advance(t, 'Rejected', 'rejected')}>Reject</Button></div>}
                  {t.status === 'Approved' && <Button size="sm" variant="outline" onClick={() => advance(t, 'Picked Up', 'marked picked up')}>Mark Picked Up</Button>}
                  {t.status === 'Picked Up' && <Button size="sm" variant="outline" onClick={() => advance(t, 'In Transit', 'dispatched')}>Dispatch</Button>}
                  {t.status === 'In Transit' && <Button size="sm" onClick={() => advance(t, 'Received', 'received')}>Receive</Button>}
                  {t.status === 'Received' && <Button size="sm" variant="outline" onClick={() => advance(t, 'Completed', 'completed')}>Complete</Button>}
                  {(t.status === 'Completed' || t.status === 'Rejected' || t.status === 'Cancelled') && <span className="text-xs text-slate-400">Closed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState icon="🚚" title="No movements yet" description="Start a transfer to move assets between locations." />}
      </div>

      {creating === 'single' && <TransferWizard onClose={() => setCreating(null)} />}
      {creating === 'import' && <BulkImportDialog onClose={() => setCreating(null)} />}
      {selected && <TransferDetailDrawer transfer={selected} batch={selected.batchId ? transfers.filter((t) => t.batchId === selected.batchId) : [selected]} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Custody & check-out tab
// ═════════════════════════════════════════════════════════════════════════════
function CustodyTab() {
  const { toast } = useToast();
  const { session } = useSession();
  const { run, isPending } = useMutate();
  const [mode, setMode] = useState<'out' | 'in'>('out');

  const checkedOutAssets = allAssets.filter((a) => a.custodian && a.custodian !== 'Unassigned');
  const pool = mode === 'out' ? allAssets : checkedOutAssets;
  const [assetId, setAssetId] = useState<string>(pool[0]?.id ?? '');
  const asset = allAssets.find((a) => a.id === assetId);
  const openWorkOrders = asset ? getWorkOrdersForAsset(asset.id).filter((w) => w.status !== 'Completed' && w.status !== 'Cancelled') : [];

  const [newCustodian, setNewCustodian] = useState('');
  const [purpose, setPurpose] = useState('');
  const [condition, setCondition] = useState(CONDITIONS[0]!);
  const [returningTech, setReturningTech] = useState(session.user.name);
  const [returnCondition, setReturnCondition] = useState(CONDITIONS[0]!);
  const [issues, setIssues] = useState('');

  const [log, setLog] = useState<CustodyRecord[]>(() => [...allCustody].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)));

  function switchMode(next: 'out' | 'in') {
    setMode(next);
    const nextPool = next === 'out' ? allAssets : checkedOutAssets;
    setAssetId(nextPool[0]?.id ?? '');
  }

  async function confirmOut() {
    if (!asset) return;
    const holder = newCustodian.trim();
    if (!holder) return toast({ title: 'New custodian required', tone: 'error' });

    const note = [openWorkOrders[0] && `Related WO: ${openWorkOrders[0].id}.`, purpose.trim() && `Purpose: ${purpose.trim()}.`, `Condition: ${condition}.`].filter(Boolean).join(' ');
    const record = await run(custodyApi.record({ assetId: asset.id, holder, action: 'Checked Out', note }), { success: 'Checked out', successDetail: `${asset.name} → ${holder}`, describe: 'check that asset out' });
    if (!record) return;
    setLog((prev) => [record, ...prev]);
    setNewCustodian('');
    setPurpose('');
  }

  async function confirmIn() {
    if (!asset) return;
    const tech = returningTech.trim();
    if (!tech) return toast({ title: 'Returning technician required', tone: 'error' });

    const note = [openWorkOrders[0] && `Related WO: ${openWorkOrders[0].id}.`, `Return condition: ${returnCondition}.`, issues.trim() && `Issues: ${issues.trim()}.`].filter(Boolean).join(' ');
    const record = await run(custodyApi.record({ assetId: asset.id, holder: tech, action: 'Checked In', note }), { success: 'Checked in', successDetail: `${asset.name} returned by ${tech}`, describe: 'check that asset in' });
    if (!record) return;
    setLog((prev) => [record, ...prev]);
    setIssues('');
    setAssetId(checkedOutAssets.filter((a) => a.id !== asset.id)[0]?.id ?? '');
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2 glass-panel rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-heading font-semibold text-slate-900">Quick Movement</h2>
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100/60 p-0.5 text-sm font-medium">
          {(['out', 'in'] as const).map((m) => (
            <button key={m} onClick={() => switchMode(m)} className={cn('flex-1 px-4 py-2 rounded-md transition-colors', mode === m ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              {m === 'out' ? 'Check Out' : 'Check In'}
            </button>
          ))}
        </div>

        {pool.length === 0 ? (
          <EmptyState icon="📦" title={mode === 'out' ? 'Nothing to hand out' : 'Nothing checked out'} description={mode === 'out' ? 'Register an asset first.' : 'Everything is accounted for.'} />
        ) : (
          <>
            <Field label="Asset" required><Select value={assetId} onChange={(e) => setAssetId(e.target.value)} options={pool.map((a) => ({ value: a.id, label: `${a.name} (${a.id})` }))} /></Field>
            {asset && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-500 space-y-1">
                <div className="flex justify-between"><span>Current custodian</span><span className="font-medium text-slate-700">{asset.custodian || 'Unassigned'}</span></div>
                <div className="flex justify-between"><span>Current location</span><span className="font-medium text-slate-700">{asset.location.name}</span></div>
              </div>
            )}

            {mode === 'out' ? (
              <>
                <Field label="New custodian" required><TextInput value={newCustodian} onChange={(e) => setNewCustodian(e.target.value)} placeholder="e.g. Deepak Nair" /></Field>
                <FieldRow>
                  <Field label="Condition"><Select value={condition} onChange={(e) => setCondition(e.target.value)} options={CONDITIONS.map((c) => ({ value: c, label: c }))} /></Field>
                  <Field label="Purpose"><TextInput value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Field deployment" /></Field>
                </FieldRow>
                <Button onClick={() => void confirmOut()} disabled={isPending} className="w-full">Confirm Check-out</Button>
              </>
            ) : (
              <>
                <Field label="Returning technician" required><TextInput value={returningTech} onChange={(e) => setReturningTech(e.target.value)} /></Field>
                <FieldRow>
                  <Field label="Return condition"><Select value={returnCondition} onChange={(e) => setReturnCondition(e.target.value)} options={CONDITIONS.map((c) => ({ value: c, label: c }))} /></Field>
                  <Field label="Damage / issues"><TextInput value={issues} onChange={(e) => setIssues(e.target.value)} placeholder="None" /></Field>
                </FieldRow>
                <Button onClick={() => void confirmIn()} disabled={isPending} className="w-full">Confirm Check-in</Button>
              </>
            )}
          </>
        )}
      </div>

      <div className="lg:col-span-3 glass-panel rounded-xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200"><h2 className="text-base font-heading font-semibold text-slate-900">Recent Custody Activity</h2></div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-5 py-3.5">Asset</th>
                <th className="px-5 py-3.5">Action</th>
                <th className="px-5 py-3.5">Previous</th>
                <th className="px-5 py-3.5">New Custodian</th>
                <th className="px-5 py-3.5 text-right">When</th>
                <th className="px-5 py-3.5 text-right">History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {log.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5"><Link to={`/assets/${c.assetId}`} className="font-medium text-slate-800 hover:text-primary-600 transition-colors">{c.assetName}</Link></td>
                  <td className="px-5 py-3.5"><Badge tone={CUSTODY_ACTION_TONE[c.action]}>{c.action}</Badge></td>
                  <td className="px-5 py-3.5 text-slate-500 text-xs">{c.action === 'Checked Out' ? previousCustodyHolder(log, c.assetId, c.at) : '—'}</td>
                  <td className="px-5 py-3.5 text-slate-600">{c.holder}</td>
                  <td className="px-5 py-3.5 text-right text-slate-400 text-xs">{relTime(c.at)}</td>
                  <td className="px-5 py-3.5 text-right"><Link to={`/custody/${c.assetId}`} className="text-primary-600 hover:text-primary-700 text-xs font-medium">View →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
const MOVEMENT_TABS = ['transfers', 'custody'] as const;

export default function AssetMovementPage() {
  const [tab, setTab] = useTabs(MOVEMENT_TABS, 'transfers');
  const openTransfers = allTransfers.filter((t) => !['Completed', 'Rejected', 'Cancelled'].includes(t.status)).length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Asset Movement & Custody"
        subtitle="Every way a physical asset changes hands or location — transfers between facilities, and custody hand-offs between people."
        breadcrumb={[{ label: 'Mobile Workforce', href: '/workforce' }, { label: 'Asset Movement & Custody' }]}
        actions={<Link to="/custody" className="text-sm font-medium text-primary-600 hover:text-primary-700">Full custody log →</Link>}
      />

      <Tabs
        tabs={[
          { key: 'transfers', label: 'Transfers', count: openTransfers, tone: openTransfers > 0 ? 'amber' : undefined },
          { key: 'custody', label: 'Custody & Check-out' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'transfers' ? <TransfersTab /> : <CustodyTab />}
    </div>
  );
}
