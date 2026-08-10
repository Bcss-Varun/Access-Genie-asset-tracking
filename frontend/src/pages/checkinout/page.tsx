import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Field, FieldRow, Select, TextArea, TextInput } from '@/components/ui/FormDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { allAssets, allCustody, getWorkOrdersForAsset } from '@/lib/dataset';
import { previousCustodyHolder } from '@/lib/field-ops';
import { relTime } from '@/lib/utils';
import { flattenScope } from '@/lib/rbac';
import { custodyApi } from '@/api/catalog';
import { useMutate } from '@/api/mutate';
import type { CustodyAction, CustodyRecord } from '@access-genie/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Asset Check-in / Check-out — the core custody workflow. Check-out hands an
// asset to a new custodian with a destination, purpose and expected return;
// check-in takes it back with its return condition and any accessories or
// damage noted. Both write through the real custody endpoint, which reassigns
// the asset and appends its timeline entry in the same call — there is no
// second step that could leave the two disagreeing.
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_TONE: Record<CustodyAction, 'primary' | 'emerald' | 'slate' | 'amber'> = {
  'Checked Out': 'primary',
  'Checked In': 'emerald',
  Assigned: 'slate',
  Transferred: 'amber',
};

const CONDITIONS = ['Good', 'Fair', 'Needs attention', 'Damaged'];

export default function CheckInOutPage() {
  const { toast } = useToast();
  const { session } = useSession();
  const { run, isPending } = useMutate();
  const [mode, setMode] = useState<'out' | 'in'>('out');

  // Recomputed every render (not memoized): `allAssets` is a module binding
  // that changes when the dataset refreshes after a write, and this has to
  // see that on the very next render rather than an emptied cache.
  const checkedOutAssets = allAssets.filter((a) => a.custodian && a.custodian !== 'Unassigned');
  const pool = mode === 'out' ? allAssets : checkedOutAssets;

  const [assetId, setAssetId] = useState<string>(pool[0]?.id ?? '');
  const asset = useMemo(() => allAssets.find((a) => a.id === assetId), [assetId]);
  const openWorkOrders = useMemo(() => (asset ? getWorkOrdersForAsset(asset.id).filter((w) => w.status !== 'Completed') : []), [asset]);
  const places = useMemo(() => flattenScope().filter(({ node }) => node.level !== 'org' && node.level !== 'region'), []);

  // Check-out fields
  const [newCustodian, setNewCustodian] = useState('');
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('');
  const [condition, setCondition] = useState(CONDITIONS[0]!);
  const [expectedReturn, setExpectedReturn] = useState('');
  const [authorizedBy, setAuthorizedBy] = useState(session.user.name);
  const [outWorkOrderId, setOutWorkOrderId] = useState('');

  // Check-in fields
  const [returningTech, setReturningTech] = useState(session.user.name);
  const [returnLocation, setReturnLocation] = useState('');
  const [returnCondition, setReturnCondition] = useState(CONDITIONS[0]!);
  const [accessories, setAccessories] = useState('');
  const [issues, setIssues] = useState('');
  const [notes, setNotes] = useState('');
  const [inWorkOrderId, setInWorkOrderId] = useState('');

  // Seeded from the dataset and prepended to optimistically on each write —
  // module bindings like `allCustody` do not themselves trigger a re-render,
  // so the log is its own local copy, the same way the transfers screen keeps one.
  const [log, setLog] = useState<CustodyRecord[]>(() => [...allCustody].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)));

  function switchMode(next: 'out' | 'in') {
    setMode(next);
    const nextPool = next === 'out' ? allAssets : checkedOutAssets;
    setAssetId(nextPool[0]?.id ?? '');
  }

  async function confirmCheckOut() {
    if (!asset) return;
    const holder = newCustodian.trim();
    if (!holder) {
      toast({ title: 'New custodian required', description: 'Who is taking custody of this asset?', tone: 'error' });
      return;
    }

    const notePieces = [
      destination.trim() && `Destination: ${destination.trim()}.`,
      outWorkOrderId && `Related WO: ${outWorkOrderId}.`,
      purpose.trim() && `Purpose: ${purpose.trim()}.`,
      `Condition at handover: ${condition}.`,
      expectedReturn && `Expected return: ${expectedReturn}.`,
      authorizedBy.trim() && `Authorized by ${authorizedBy.trim()}.`,
    ].filter(Boolean).join(' ');

    const record = await run(custodyApi.record({ assetId: asset.id, holder, action: 'Checked Out', note: notePieces }), {
      success: 'Checked out',
      successDetail: `${asset.name} → ${holder}`,
      describe: 'check that asset out',
    });
    if (!record) return;
    setLog((prev) => [record, ...prev]);
    setNewCustodian('');
    setPurpose('');
    setExpectedReturn('');
    setOutWorkOrderId('');
  }

  async function confirmCheckIn() {
    if (!asset) return;
    const tech = returningTech.trim();
    if (!tech) {
      toast({ title: 'Returning technician required', tone: 'error' });
      return;
    }

    const notePieces = [
      returnLocation.trim() && `Return location: ${returnLocation.trim()}.`,
      inWorkOrderId && `Related WO: ${inWorkOrderId}.`,
      `Return condition: ${returnCondition}.`,
      accessories.trim() && `Accessories: ${accessories.trim()}.`,
      issues.trim() && `Damage/issues: ${issues.trim()}.`,
      notes.trim() && `Notes: ${notes.trim()}.`,
    ].filter(Boolean).join(' ');

    const record = await run(custodyApi.record({ assetId: asset.id, holder: tech, action: 'Checked In', note: notePieces }), {
      success: 'Checked in',
      successDetail: `${asset.name} returned by ${tech}`,
      describe: 'check that asset in',
    });
    if (!record) return;
    setLog((prev) => [record, ...prev]);
    setAccessories('');
    setIssues('');
    setNotes('');
    setInWorkOrderId('');
    const nextPool = checkedOutAssets.filter((a) => a.id !== asset.id);
    setAssetId(nextPool[0]?.id ?? '');
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Asset Check-in / Check-out"
        subtitle="Custody console — hand assets out and take them back with a full audit trail."
        breadcrumb={[{ label: 'Mobile Workforce', href: '/workforce' }, { label: 'Asset Check-in / Check-out' }]}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Custody console */}
        <div className="lg:col-span-2 glass-panel rounded-xl p-6 flex flex-col gap-5">
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100/60 p-0.5 text-sm font-medium">
            {(['out', 'in'] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 px-4 py-2 rounded-md transition-colors ${
                  mode === m ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {m === 'out' ? 'Check Out' : 'Check In'}
              </button>
            ))}
          </div>

          {pool.length === 0 ? (
            <EmptyState
              icon="📦"
              title={mode === 'out' ? 'No assets to hand out yet' : 'Nothing is checked out'}
              description={
                mode === 'out'
                  ? 'Register an asset and it becomes selectable here.'
                  : 'Every asset is currently accounted for — nothing is awaiting return.'
              }
              action={mode === 'out' ? <Link to="/assets/new"><Button variant="primary">Register an asset</Button></Link> : undefined}
            />
          ) : (
            <>
              <Field label="Asset" required>
                <Select
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  options={pool.map((a) => ({ value: a.id, label: `${a.name} (${a.id})` }))}
                />
              </Field>

              {asset && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-500 space-y-1">
                  <div className="flex items-center justify-between"><span>Asset ID</span><span className="font-mono font-medium text-slate-700">{asset.id}</span></div>
                  <div className="flex items-center justify-between"><span>Current custodian</span><span className="font-medium text-slate-700">{asset.custodian || 'Unassigned'}</span></div>
                  <div className="flex items-center justify-between"><span>Current location</span><span className="font-medium text-slate-700">{asset.location.name}</span></div>
                </div>
              )}

              {mode === 'out' ? (
                <>
                  <Field label="New custodian" required>
                    <TextInput value={newCustodian} onChange={(e) => setNewCustodian(e.target.value)} placeholder="e.g. Deepak Nair" />
                  </Field>
                  <Field label="Destination" hint="Where the asset is headed — defaults to its current location.">
                    <Select
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      options={[{ value: '', label: asset?.location.name ?? 'Same as current' }, ...places.map(({ node, depth }) => ({ value: node.name, label: `${'  '.repeat(Math.max(0, depth - 1))}${node.name}` }))]}
                    />
                  </Field>
                  <FieldRow>
                    <Field label="Related work order" hint="Optional.">
                      <Select
                        value={outWorkOrderId}
                        onChange={(e) => setOutWorkOrderId(e.target.value)}
                        options={[{ value: '', label: 'None' }, ...openWorkOrders.map((w) => ({ value: w.id, label: `${w.id} — ${w.title}` }))]}
                      />
                    </Field>
                    <Field label="Asset condition">
                      <Select value={condition} onChange={(e) => setCondition(e.target.value)} options={CONDITIONS.map((c) => ({ value: c, label: c }))} />
                    </Field>
                  </FieldRow>
                  <FieldRow>
                    <Field label="Expected return" hint="Optional.">
                      <TextInput type="date" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} />
                    </Field>
                    <Field label="Authorized by">
                      <TextInput value={authorizedBy} onChange={(e) => setAuthorizedBy(e.target.value)} />
                    </Field>
                  </FieldRow>
                  <Field label="Purpose" hint="Why the asset is going out.">
                    <TextArea value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Field deployment for the Bengaluru rollout." />
                  </Field>
                  <Button onClick={() => void confirmCheckOut()} disabled={isPending} className="w-full">Confirm Check-out</Button>
                </>
              ) : (
                <>
                  <Field label="Returning technician" required>
                    <TextInput value={returningTech} onChange={(e) => setReturningTech(e.target.value)} />
                  </Field>
                  <Field label="Return location" hint="Defaults to the asset's current recorded location.">
                    <Select
                      value={returnLocation}
                      onChange={(e) => setReturnLocation(e.target.value)}
                      options={[{ value: '', label: asset?.location.name ?? 'Current location' }, ...places.map(({ node, depth }) => ({ value: node.name, label: `${'  '.repeat(Math.max(0, depth - 1))}${node.name}` }))]}
                    />
                  </Field>
                  <FieldRow>
                    <Field label="Related work order" hint="Optional.">
                      <Select
                        value={inWorkOrderId}
                        onChange={(e) => setInWorkOrderId(e.target.value)}
                        options={[{ value: '', label: 'None' }, ...openWorkOrders.map((w) => ({ value: w.id, label: `${w.id} — ${w.title}` }))]}
                      />
                    </Field>
                    <Field label="Return condition">
                      <Select value={returnCondition} onChange={(e) => setReturnCondition(e.target.value)} options={CONDITIONS.map((c) => ({ value: c, label: c }))} />
                    </Field>
                  </FieldRow>
                  <Field label="Accessories returned" hint="Charger, case, cables — whatever came with it.">
                    <TextInput value={accessories} onChange={(e) => setAccessories(e.target.value)} placeholder="Charger, carry case" />
                  </Field>
                  <Field label="Damage / issues" hint="Leave blank if none.">
                    <TextArea value={issues} onChange={(e) => setIssues(e.target.value)} placeholder="Minor scuff on the lid, otherwise fine." />
                  </Field>
                  <Field label="Notes">
                    <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </Field>
                  <Button onClick={() => void confirmCheckIn()} disabled={isPending} className="w-full">Confirm Check-in</Button>
                </>
              )}
            </>
          )}
        </div>

        {/* Recent activity */}
        <div className="lg:col-span-3 glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-heading font-semibold text-slate-900">Recent Custody Activity</h2>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-5 py-3.5">Asset</th>
                  <th className="px-5 py-3.5">Action</th>
                  <th className="px-5 py-3.5">Previous</th>
                  <th className="px-5 py-3.5">New Custodian</th>
                  <th className="px-5 py-3.5">Location</th>
                  <th className="px-5 py-3.5">Work Order</th>
                  <th className="px-5 py-3.5 text-right">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {log.map((c: CustodyRecord) => {
                  const prev = previousCustodyHolder(log, c.assetId, c.at);
                  const relatedWo = getWorkOrdersForAsset(c.assetId).find((w) => w.status !== 'Completed');
                  const currentLoc = allAssets.find((a) => a.id === c.assetId)?.location.name ?? '—';
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link to={`/assets/${c.assetId}`} className="font-medium text-slate-800 hover:text-primary-600 transition-colors">{c.assetName}</Link>
                      </td>
                      <td className="px-5 py-3.5"><Badge tone={ACTION_TONE[c.action]}>{c.action}</Badge></td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs">{c.action === 'Checked Out' ? prev : '—'}</td>
                      <td className="px-5 py-3.5 text-slate-600">{c.holder}</td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs">{currentLoc}</td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs font-mono">{relatedWo?.id ?? '—'}</td>
                      <td className="px-5 py-3.5 text-right text-slate-400 text-xs">{relTime(c.at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
