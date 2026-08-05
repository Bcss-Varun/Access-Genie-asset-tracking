// ─────────────────────────────────────────────────────────────────────────────
// Configure · Commercial — purchase, warranty, contracts, documents.
//
// Two rules govern this card:
//   1. Everything derivable is DERIVED — warranty remaining, warranty status,
//      asset age, depreciation, book value. None of them is ever an input
//      (docs/21 §21.2 P3). Note what is absent: Remaining Useful Life, which is
//      a model output, not date arithmetic (§21.1.4 ①).
//   2. Documents ride along and never block. The class supplies a suggested
//      checklist; only classes that genuinely need one gate on it.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRegistry } from '@/components/providers/RegistryProvider';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/primitives';
import { UploadDocumentDialog } from '@/components/assets/UploadDocumentDialog';
import { ConfigCard, Field, Note, Derived, Choice, inputCls } from './fields';
import { getClassTemplate } from '@/lib/asset-classes';
import { deriveCommercial, warrantyEndFromTerm } from '@/lib/onboarding';
import { formatMoney, cn } from '@/lib/utils';
import type { DocType } from '@access-genie/shared';
import type { CommercialData, GateResult, Ownership, RegisteredAsset } from '@access-genie/shared';

const VENDORS = [
  'Dell India Pvt Ltd', 'Redington India Ltd', 'Cisco Systems India', 'Schneider Electric India',
  'Ingram Micro India', 'HP India Sales Pvt Ltd', 'Lenovo India Pvt Ltd',
];

const DOC_TYPES: DocType[] = ['Invoice', 'Warranty', 'Manual', 'Certificate', 'Image', 'Report'];

export function CommercialCard({
  asset, gates, step,
}: {
  asset: RegisteredAsset;
  gates: GateResult[];
  step: number;
}) {
  const { patchOnboarding, patchAsset } = useRegistry();

  const ob = asset.onboarding;
  const tpl = getClassTemplate(ob.classId);
  const c = ob.commercial;
  const d = deriveCommercial(c);

  const [term, setTerm] = useState('');
  /** Which document type the open upload dialog is collecting, if any. */
  const [uploading, setUploading] = useState<DocType | null>(null);

  const financial = gates.find((g) => g.key === 'financial')!;
  const documented = gates.find((g) => g.key === 'documented')!;
  const required = financial.required || documented.required;
  const status =
    financial.state === 'met' && (documented.state === 'met' || !documented.required) ? 'met' : 'open';

  const setC = (patch: Partial<CommercialData>) =>
    patchOnboarding(asset.id, { commercial: { ...c, ...patch } });

  const setPrice = (raw: string) => {
    const n = Number(raw);
    setC({ purchasePrice: Number.isFinite(n) && n > 0 ? n : undefined });
    if (Number.isFinite(n) && n > 0) patchAsset(asset.id, { purchasePrice: n });
  };

  const applyTerm = () => {
    const months = Number(term);
    if (!c.warrantyStart || !Number.isFinite(months) || months <= 0) return;
    const end = warrantyEndFromTerm(c.warrantyStart, months);
    setC({ warrantyEnd: end });
    patchAsset(asset.id, { warrantyExpiry: end });
  };

  /**
   * Record a real upload against the registration.
   *
   * These buttons used to call `addDoc(type)`, which invented a filename — "Tax
   * Invoice — Dell PowerEdge (GST).pdf" — and a size derived from how many
   * documents were already listed, then declared the document attached. The
   * activation gate then passed on the strength of a file that did not exist.
   * A class could be activated as "Documented" with nothing behind it.
   *
   * The upload itself is real and goes to the asset's document collection; this
   * mirrors it onto the onboarding record, which is what the gate reads.
   */
  const onUploaded = (doc: { id: string; name: string; type: DocType; sizeKb: number; uploadedAt: string }) => {
    patchOnboarding(asset.id, {
      documents: [
        ...ob.documents,
        { id: doc.id, name: doc.name, type: doc.type, sizeKb: doc.sizeKb, addedAt: doc.uploadedAt },
      ],
    });
  };

  const have = new Set(ob.documents.map((doc) => doc.type));
  const warrantyTone =
    d.warrantyStatus === 'Expired' ? 'text-health-critical'
      : d.warrantyStatus === 'Expiring' ? 'text-amber-600'
        : d.warrantyStatus === 'Active' ? 'text-emerald-600'
          : 'text-slate-400';

  return (
    <ConfigCard
      step={step}
      title="Commercial"
      description="Purchase, warranty and contracts — plus whatever paperwork exists."
      status={status}
      required={required}
      actions={ob.source === 'po' && <Badge tone="emerald">Pre-filled from {c.poRef}</Badge>}
    >
      <div className="space-y-5">
        {/* ── Ownership decides which fields even apply ────────────────────── */}
        <Field label="Ownership" hint="Leased and third-party assets are not capitalised — no depreciation schedule.">
          <Choice<Ownership>
            name="Ownership"
            value={c.ownership}
            onChange={(v) => setC({ ownership: v })}
            options={[
              { value: 'Owned', label: 'Owned', blurb: 'Capitalised and depreciated' },
              { value: 'Leased', label: 'Leased', blurb: 'Has a lessor and a return date' },
              { value: 'Third-party', label: 'Customer-owned', blurb: 'On site, not on the books' },
            ]}
          />
        </Field>

        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-3">
          <Field label="Purchase date" htmlFor="cm-pdate">
            <input
              id="cm-pdate" type="date" className={inputCls}
              value={c.purchaseDate ?? ''}
              onChange={(e) => { setC({ purchaseDate: e.target.value }); patchAsset(asset.id, { purchaseDate: e.target.value }); }}
            />
          </Field>

          <Field label="Commission date" htmlFor="cm-cdate" hint="Age runs from here where known.">
            <input
              id="cm-cdate" type="date" className={inputCls}
              value={c.commissionDate ?? ''}
              onChange={(e) => setC({ commissionDate: e.target.value })}
            />
          </Field>

          <Field label={c.ownership === 'Leased' ? 'Lease cost (₹)' : 'Purchase cost (₹)'} htmlFor="cm-price">
            <input
              id="cm-price" type="number" min="0" className={inputCls}
              value={c.purchasePrice ?? ''}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
            />
          </Field>

          <Field label={c.ownership === 'Leased' ? 'Lessor' : 'Vendor'} htmlFor="cm-vendor">
            <input
              id="cm-vendor" className={inputCls} list="cm-vendor-list"
              value={(c.ownership === 'Leased' ? c.lessor : c.vendor) ?? ''}
              onChange={(e) => setC(c.ownership === 'Leased' ? { lessor: e.target.value, vendor: e.target.value } : { vendor: e.target.value })}
              placeholder="e.g. Redington India Ltd"
            />
            <datalist id="cm-vendor-list">
              {VENDORS.map((v) => <option key={v} value={v} />)}
            </datalist>
          </Field>

          <Field label="PO / GRN reference" htmlFor="cm-po">
            <input id="cm-po" className={cn(inputCls, 'font-mono text-xs')} value={c.poRef ?? ''} onChange={(e) => setC({ poRef: e.target.value })} placeholder="PO-…" />
          </Field>

          {c.ownership === 'Leased' && (
            <Field label="Return date" htmlFor="cm-return" hint="Drives the return-task chain.">
              <input id="cm-return" type="date" className={inputCls} value={c.returnDate ?? ''} onChange={(e) => setC({ returnDate: e.target.value })} />
            </Field>
          )}
        </div>

        {/* ── Warranty ─────────────────────────────────────────────────────── */}
        <div className="border-t border-slate-200 pt-5">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-3">
            <Field label="Warranty start" htmlFor="cm-wstart">
              <input id="cm-wstart" type="date" className={inputCls} value={c.warrantyStart ?? ''} onChange={(e) => setC({ warrantyStart: e.target.value })} />
            </Field>

            <Field label="Warranty end" htmlFor="cm-wend">
              <input
                id="cm-wend" type="date" className={inputCls}
                value={c.warrantyEnd ?? ''}
                onChange={(e) => { setC({ warrantyEnd: e.target.value }); patchAsset(asset.id, { warrantyExpiry: e.target.value }); }}
              />
            </Field>

            <Field label="…or term in months" htmlFor="cm-term" hint="Some vendors quote a term, not an end date.">
              <div className="flex gap-2">
                <input id="cm-term" type="number" min="0" className={inputCls} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="36" />
                <Button type="button" variant="outline" onClick={applyTerm} disabled={!c.warrantyStart || !term}>Apply</Button>
              </div>
            </Field>

            <Field label="AMC / service contract end" htmlFor="cm-amc" className="sm:col-span-2">
              <input id="cm-amc" type="date" className={inputCls} value={c.amcEnd ?? ''} onChange={(e) => setC({ amcEnd: e.target.value })} />
            </Field>
          </div>

          {/* Derived block — read-only by construction */}
          <div className="mt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Derived — computed on read, never stored
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Derived
                label="Warranty status"
                tone={warrantyTone}
                value={d.warrantyStatus === 'Unknown' ? 'Unknown' : d.warrantyStatus}
              />
              <Derived
                label="Warranty remaining"
                value={d.warrantyRemainingDays === null ? '—' : d.warrantyRemainingDays < 0 ? `${Math.abs(d.warrantyRemainingDays)} d overdue` : `${d.warrantyRemainingDays} days`}
              />
              <Derived label="Asset age" value={d.ageDays === null ? '—' : `${(d.ageDays / 365).toFixed(1)} yrs`} />
              <Derived
                label="Book value"
                value={d.bookValue === null ? (c.ownership === 'Owned' ? '—' : 'Not capitalised') : formatMoney(d.bookValue)}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Remaining Useful Life is deliberately not here — it needs runtime hours and telemetry, so it lives on the
              Intelligence tab with a confidence band, not on a registration form.
            </p>
          </div>

          {d.warrantyStatus === 'Expired' && (
            <div className="mt-4">
              {/* Three buttons stood here — "Request AMC quote", "Add extended
                  warranty", "Flag for replacement" — each raising a success
                  toast and doing nothing. There is no vendor channel to request
                  a quote through, no renewal queue, and no replacement plan to
                  add to. What the platform can genuinely do with an expired
                  warranty is record the new cover once it is bought, which is
                  an AMC end date on this very card. */}
              <Note tone="red" icon="⏰">
                <span className="font-semibold">Warranty expired {Math.abs(d.warrantyRemainingDays ?? 0)} days ago.</span>{' '}
                Detected automatically — no one has to notice. Record replacement cover in the AMC field above once it
                is in place.
              </Note>
            </div>
          )}

          {d.warrantyStatus === 'Unknown' && (
            <div className="mt-4">
              <Note icon="❔">
                <span className="font-semibold">Warranty unknown</span> is a valid state, and it is not the same as
                &ldquo;no warranty&rdquo;. Conflating the two hides real coverage — so this shows up in the
                data-quality report rather than being silently treated as zero.
              </Note>
            </div>
          )}
        </div>

        {/* ── Documents ────────────────────────────────────────────────────── */}
        <div className="border-t border-slate-200 pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documents</span>
              <p className="text-xs text-slate-400">
                Suggested for {asset.category}: {tpl.documentChecklist.join(', ')}
                {documented.required ? ' — required to activate this class.' : ' — never blocking for this class.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {DOC_TYPES.map((t) => {
              const suggested = tpl.documentChecklist.includes(t);
              const done = have.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setUploading(t)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    done ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : suggested ? 'border-primary-200 bg-primary-50/60 text-primary-700 hover:bg-primary-50'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {done ? '✓ ' : '+ '}{t}
                  {suggested && !done && <span className="ml-1 text-[9px] uppercase tracking-wide opacity-70">suggested</span>}
                </button>
              );
            })}
          </div>

          {ob.documents.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {ob.documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="min-w-0 truncate text-xs text-slate-700">📎 {doc.name}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{doc.type} · {doc.sizeKb} KB</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {uploading && (
        <UploadDocumentDialog
          assetId={asset.id}
          defaultType={uploading}
          onUploaded={onUploaded}
          onClose={() => setUploading(null)}
        />
      )}
    </ConfigCard>
  );
}
