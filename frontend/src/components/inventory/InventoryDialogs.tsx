import { useState } from 'react';
import type { AbcClass, Part, PoStatus, PurchaseOrder, Supplier, Warehouse } from '@access-genie/shared';
import { FormDialog, Field, FieldRow, Select, TextInput, dateInDays } from '@/components/ui/FormDialog';
import { Button } from '@/components/ui/Button';
import { useMutate } from '@/api/mutate';
import { partsApi, procurementApi, suppliersApi, warehousesApi } from '@/api/inventory';
import { allParts, allSuppliers, allWarehouses } from '@/lib/dataset';
import { formatMoney } from '@/lib/utils';

/**
 * The inventory write forms.
 *
 * Four small dialogs in one file because they are read together — a part needs
 * a warehouse and a supplier, and a purchase order needs parts. Splitting them
 * would mean four files that only ever change at the same time.
 */

// ── Supplier ─────────────────────────────────────────────────────────────────
const SUPPLIER_CATEGORIES = ['Hardware', 'Components', 'Consumables', 'Services', 'Software', 'Logistics', 'Other'];

export function SupplierDialog({ existing, onClose }: { existing?: Supplier; onClose: () => void }) {
  const { run, isPending } = useMutate();

  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState(existing?.category ?? 'Hardware');
  const [contact, setContact] = useState(existing?.contact ?? '');
  const [leadTimeDays, setLeadTimeDays] = useState(String(existing?.leadTimeDays ?? 7));
  const [rating, setRating] = useState(String(existing?.rating ?? 3));
  const [onTimePct, setOnTimePct] = useState(String(existing?.onTimePct ?? 100));

  const submit = async () => {
    const body = {
      name: name.trim(),
      category,
      contact: contact.trim(),
      leadTimeDays: Number(leadTimeDays) || 0,
      rating: Number(rating) || 0,
      onTimePct: Number(onTimePct) || 0,
    };
    const ok = await run(existing ? suppliersApi.update(existing.id, body) : suppliersApi.create(body), {
      success: existing ? 'Supplier updated' : `${name.trim()} added`,
      successDetail: `${body.leadTimeDays}-day lead time`,
      describe: existing ? 'save that supplier' : 'add that supplier',
    });
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="🚚"
      title={existing ? `Edit ${existing.name}` : 'New supplier'}
      description="Lead time drives the reorder suggestions, so it is worth getting roughly right."
      submitLabel={existing ? 'Save' : 'Add supplier'}
      busy={isPending}
      disabled={name.trim().length < 2 || contact.trim().length < 3}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Supplier name" required>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Dell India" />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} options={SUPPLIER_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </Field>
      </FieldRow>

      <Field label="Contact" required hint="Whoever an order actually goes to — an email or a phone number.">
        <TextInput value={contact} onChange={(e) => setContact(e.target.value)} placeholder="orders@dell.co.in" />
      </Field>

      <FieldRow>
        <Field label="Lead time (days)" hint="How long from order to delivery.">
          <TextInput type="number" min={0} value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} />
        </Field>
        <Field label="On-time %" hint="What proportion of their deliveries arrive by the promised date.">
          <TextInput type="number" min={0} max={100} value={onTimePct} onChange={(e) => setOnTimePct(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label="Quality rating" hint="0–5. Your own assessment, not theirs.">
        <TextInput type="number" min={0} max={5} step={0.1} value={rating} onChange={(e) => setRating(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

// ── Warehouse ────────────────────────────────────────────────────────────────
export function WarehouseDialog({ existing, onClose }: { existing?: Warehouse; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const [name, setName] = useState(existing?.name ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');

  const submit = async () => {
    const body = { name: name.trim(), location: location.trim() };
    const ok = await run(existing ? warehousesApi.update(existing.id, body) : warehousesApi.create(body), {
      success: existing ? 'Warehouse updated' : `${name.trim()} added`,
      describe: existing ? 'save that warehouse' : 'add that warehouse',
    });
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="🏭"
      title={existing ? `Edit ${existing.name}` : 'New warehouse'}
      description="Where parts physically sit. Stock is counted per warehouse, not per organisation."
      submitLabel={existing ? 'Save' : 'Add warehouse'}
      busy={isPending}
      disabled={name.trim().length < 2 || location.trim().length < 2}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="Name" required>
        <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Hyderabad Central Store" />
      </Field>
      <Field label="Location" required>
        <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Building A, Ground floor" />
      </Field>
    </FormDialog>
  );
}

// ── Part ─────────────────────────────────────────────────────────────────────
const PART_CATEGORIES = ['Storage', 'Memory', 'Power', 'Networking', 'Cabling', 'Consumables', 'Filters', 'Other'];

export function PartDialog({ existing, onClose }: { existing?: Part; onClose: () => void }) {
  const { run, isPending } = useMutate();

  const [sku, setSku] = useState(existing?.sku ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState(existing?.category ?? 'Other');
  const [onHand, setOnHand] = useState(String(existing?.onHand ?? 0));
  const [reorderPoint, setReorderPoint] = useState(String(existing?.reorderPoint ?? 5));
  const [unitCost, setUnitCost] = useState(String(existing?.unitCost ?? 0));
  const [warehouseId, setWarehouseId] = useState(existing?.warehouseId ?? allWarehouses[0]?.id ?? '');
  const [bin, setBin] = useState(existing?.bin ?? '');
  const [abcClass, setAbcClass] = useState<AbcClass>(existing?.abcClass ?? 'C');
  const [supplierId, setSupplierId] = useState(existing?.supplierId ?? allSuppliers[0]?.id ?? '');
  const [leadTimeDays, setLeadTimeDays] = useState(String(existing?.leadTimeDays ?? 7));

  const submit = async () => {
    const shared = {
      name: name.trim(),
      category,
      reorderPoint: Number(reorderPoint) || 0,
      unitCost: Number(unitCost) || 0,
      warehouseId,
      bin: bin.trim(),
      abcClass,
      supplierId,
      leadTimeDays: Number(leadTimeDays) || 0,
    };

    const ok = await run(
      existing
        ? partsApi.update(existing.id, shared)
        : partsApi.create({ ...shared, sku: sku.trim(), onHand: Number(onHand) || 0 }),
      {
        success: existing ? 'Part updated' : `${name.trim()} added`,
        successDetail: existing ? 'Stock is changed through an adjustment, not here.' : `${onHand} on hand`,
        describe: existing ? 'save that part' : 'add that part',
      },
    );
    if (ok) onClose();
  };

  if (allWarehouses.length === 0) {
    return (
      <FormDialog
        icon="📦"
        title="Add a warehouse first"
        description="A part has to sit somewhere — stock is counted per warehouse."
        submitLabel="Close"
        onSubmit={onClose}
        onCancel={onClose}
      >
        <p className="text-sm text-slate-500">
          There are no warehouses yet. Create one under Inventory ▸ Warehouses, then come back.
        </p>
      </FormDialog>
    );
  }

  return (
    <FormDialog
      icon="📦"
      title={existing ? `Edit ${existing.name}` : 'New part'}
      description="Reorder point is the level at which this appears on the reorder list and gets drafted onto a purchase order."
      submitLabel={existing ? 'Save' : 'Add part'}
      width="lg"
      busy={isPending}
      disabled={name.trim().length < 2 || (!existing && sku.trim().length < 2)}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="SKU" required hint={existing ? 'A SKU identifies the part and cannot be changed.' : 'Your own part number.'}>
          <TextInput value={existing?.sku ?? sku} disabled={Boolean(existing)} onChange={(e) => setSku(e.target.value)} placeholder="SSD-1TB" />
        </Field>
        <Field label="Name" required>
          <TextInput autoFocus={!existing} value={name} onChange={(e) => setName(e.target.value)} placeholder="1TB NVMe SSD" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} options={PART_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="ABC class" hint="A — high value, count often. C — low value, count rarely.">
          <Select
            value={abcClass}
            onChange={(e) => setAbcClass(e.target.value as AbcClass)}
            options={[
              { value: 'A', label: 'A — high value' },
              { value: 'B', label: 'B — medium' },
              { value: 'C', label: 'C — low value' },
            ]}
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field
          label="On hand"
          hint={existing ? 'Changed through an adjustment, which records why.' : 'Opening stock.'}
        >
          <TextInput type="number" min={0} value={existing ? String(existing.onHand) : onHand} disabled={Boolean(existing)} onChange={(e) => setOnHand(e.target.value)} />
        </Field>
        <Field label="Reorder point" hint="At or below this, it appears on the reorder list.">
          <TextInput type="number" min={0} value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Unit cost">
          <TextInput type="number" min={0} step={0.01} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        </Field>
        <Field label="Lead time (days)">
          <TextInput type="number" min={0} value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Warehouse" required>
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} options={allWarehouses.map((w) => ({ value: w.id, label: w.name }))} />
        </Field>
        <Field label="Bin" hint="Where on the shelf.">
          <TextInput value={bin} onChange={(e) => setBin(e.target.value)} placeholder="A-14-3" />
        </Field>
      </FieldRow>

      <Field label="Supplier" hint="Who a reorder is drafted to. Without one this part is never auto-ordered.">
        <Select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          options={[{ value: '', label: 'None' }, ...allSuppliers.map((s) => ({ value: s.id, label: s.name }))]}
        />
      </Field>
    </FormDialog>
  );
}

// ── Stock adjustment ─────────────────────────────────────────────────────────
const REASONS = [
  'Counted correction',
  'Damaged / written off',
  'Consumed outside a work order',
  'Returned to stock',
  'Received outside a purchase order',
  'Transferred between warehouses',
];

export function AdjustStockDialog({ part, onClose }: { part: Part; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const [delta, setDelta] = useState('0');
  const [reason, setReason] = useState(REASONS[0] as string);
  const [note, setNote] = useState('');

  const change = Number(delta) || 0;
  const after = part.onHand + change;

  const submit = async () => {
    const ok = await run(partsApi.adjust(part.id, change, note.trim() ? `${reason} — ${note.trim()}` : reason), {
      success: 'Stock adjusted',
      successDetail: `${part.name}: ${part.onHand} → ${after}`,
      describe: 'adjust that stock',
    });
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="±"
      title={`Adjust ${part.name}`}
      description={`${part.onHand} on hand now. Every adjustment is recorded with its reason.`}
      submitLabel="Apply adjustment"
      busy={isPending}
      disabled={change === 0 || after < 0}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Change" required hint="Negative to remove stock, positive to add.">
          <TextInput autoFocus type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
        </Field>
        <Field label="After this adjustment">
          <TextInput value={after < 0 ? 'Cannot go below zero' : String(after)} disabled />
        </Field>
      </FieldRow>

      <Field label="Reason" required>
        <Select value={reason} onChange={(e) => setReason(e.target.value)} options={REASONS.map((r) => ({ value: r, label: r }))} />
      </Field>

      <Field label="Note" hint="Anything the reason alone will not explain in three months.">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Two units failed on arrival" />
      </Field>
    </FormDialog>
  );
}

// ── Purchase order ───────────────────────────────────────────────────────────
interface DraftLine {
  sku: string;
  name: string;
  qty: number;
  unitCost: number;
}

export function PurchaseOrderDialog({ existing, onClose }: { existing?: PurchaseOrder; onClose: () => void }) {
  const { run, isPending } = useMutate();

  const [supplierId, setSupplierId] = useState(existing?.supplierId ?? allSuppliers[0]?.id ?? '');
  const [expectedAt, setExpectedAt] = useState(existing?.expectedAt?.slice(0, 10) ?? dateInDays(14));
  const [status, setStatus] = useState<PoStatus>(existing?.status ?? 'Draft');
  const [lines, setLines] = useState<DraftLine[]>(existing?.lines ?? []);

  // Only this supplier's parts: ordering something they do not stock is a
  // mistake the form can prevent rather than report.
  const candidates = allParts.filter((p) => !supplierId || p.supplierId === supplierId);
  const total = lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0);

  const addLine = (partId: string) => {
    const part = allParts.find((p) => p.id === partId);
    if (!part || lines.some((l) => l.sku === part.sku)) return;
    setLines((prev) => [
      ...prev,
      { sku: part.sku, name: part.name, qty: Math.max(1, part.reorderPoint * 2 - part.onHand), unitCost: part.unitCost },
    ]);
  };

  const patchLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    const body = { expectedAt: new Date(expectedAt).toISOString(), status, lines };
    const ok = await run(
      existing ? procurementApi.update(existing.id, body) : procurementApi.create({ ...body, supplierId }),
      {
        success: existing ? 'Purchase order updated' : 'Purchase order raised',
        successDetail: `${lines.length} line${lines.length === 1 ? '' : 's'} · ${formatMoney(total)}`,
        describe: existing ? 'save that order' : 'raise that order',
      },
    );
    if (ok) onClose();
  };

  if (allSuppliers.length === 0) {
    return (
      <FormDialog
        icon="🧾"
        title="Add a supplier first"
        description="A purchase order has to be addressed to someone."
        submitLabel="Close"
        onSubmit={onClose}
        onCancel={onClose}
      >
        <p className="text-sm text-slate-500">There are no suppliers yet. Add one under Inventory ▸ Suppliers.</p>
      </FormDialog>
    );
  }

  return (
    <FormDialog
      icon="🧾"
      title={existing ? `Edit ${existing.id}` : 'New purchase order'}
      description="Receiving this order later raises stock for every line — that is the only thing that does."
      submitLabel={existing ? 'Save' : 'Raise order'}
      width="lg"
      busy={isPending}
      disabled={lines.length === 0 || !supplierId}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Supplier" required hint={existing ? 'A raised order cannot change supplier.' : undefined}>
          <Select
            value={supplierId}
            disabled={Boolean(existing)}
            onChange={(e) => {
              setSupplierId(e.target.value);
              setLines([]);
            }}
            options={allSuppliers.map((s) => ({ value: s.id, label: `${s.name} · ${s.leadTimeDays}d lead` }))}
          />
        </Field>
        <Field label="Expected" required>
          <TextInput type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label="Status" hint="Draft commits nothing. Receiving is done from the order itself.">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as PoStatus)}
          options={[
            { value: 'Draft', label: 'Draft' },
            { value: 'Approved', label: 'Approved' },
            { value: 'Sent', label: 'Sent to supplier' },
          ]}
        />
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lines — {lines.length}</span>
          <span className="text-xs font-semibold text-slate-700">{formatMoney(total)}</span>
        </div>

        {lines.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {lines.map((line, i) => (
              <div key={line.sku} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{line.name}</span>
                  <span className="block font-mono text-xs text-slate-400">{line.sku}</span>
                </span>
                <input
                  type="number"
                  min={1}
                  aria-label={`Quantity for ${line.name}`}
                  value={line.qty}
                  onChange={(e) => patchLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  aria-label={`Unit cost for ${line.name}`}
                  value={line.unitCost}
                  onChange={(e) => patchLine(i, { unitCost: Number(e.target.value) || 0 })}
                  className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  className="rounded px-1.5 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <Select
          value=""
          onChange={(e) => addLine(e.target.value)}
          options={[
            { value: '', label: candidates.length > 0 ? '+ Add a part…' : 'This supplier has no parts assigned' },
            ...candidates
              .filter((p) => !lines.some((l) => l.sku === p.sku))
              .map((p) => ({ value: p.id, label: `${p.name} (${p.sku}) · ${p.onHand} on hand` })),
          ]}
        />
      </div>

      {existing && existing.status !== 'Received' && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <span className="text-xs text-emerald-800">Received the delivery? This raises stock for every line.</span>
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={async () => {
              const ok = await run(procurementApi.receive(existing.id), {
                success: 'Delivery received',
                successDetail: `${existing.lines.length} line${existing.lines.length === 1 ? '' : 's'} added to stock.`,
                describe: 'receive that order',
              });
              if (ok) onClose();
            }}
          >
            Receive
          </Button>
        </div>
      )}
    </FormDialog>
  );
}
