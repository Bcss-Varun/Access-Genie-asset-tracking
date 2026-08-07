// ─────────────────────────────────────────────────────────────────────────────
// Stage B — Identify. The only mandatory screen in the flow, and the commit
// point: six fields in, and the asset is real, has an ID and has a URL.
//
// The important machinery here is the identification check that runs as the
// serial is typed. Catching a duplicate at the keystroke costs one dialog;
// catching it in six months costs a merge of two event streams (docs/21 M1).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/primitives';
import { Field, Note, inputCls, labelCls } from './fields';
import { useClassLibrary } from '@/components/providers/ClassLibraryProvider';
import { getClassTemplate } from '@/lib/asset-classes';
import { checkDuplicate, suggestName } from '@/lib/onboarding';
import { cn } from '@/lib/utils';
import type { AttributeDef, Criticality } from '@access-genie/shared';
import type { RegisteredAsset, RegistrationSeed } from '@access-genie/shared';

const CRITICALITIES: Criticality[] = ['Low', 'Medium', 'High', 'Critical'];

export interface IdentifyValues {
  classId: string;
  name: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  criticality: Criticality;
  description: string;
  attributes: Record<string, string | boolean>;
  duplicateAck?: string;
}

function AttributeField({
  attr, value, onChange,
}: {
  attr: AttributeDef;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const id = `ob-attr-${attr.key}`;

  if (attr.type === 'boolean') {
    const on = value === true;
    return (
      <Field label={attr.label} htmlFor={id}>
        <button
          type="button" id={id} role="switch" aria-checked={on} onClick={() => onChange(!on)}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
            on ? 'bg-primary-600' : 'bg-slate-300',
          )}
        >
          <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', on ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      </Field>
    );
  }

  if (attr.type === 'select') {
    return (
      <Field label={attr.label} htmlFor={id}>
        <select id={id} className={inputCls} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(attr.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
    );
  }

  const type = attr.type === 'number' ? 'number' : attr.type === 'date' ? 'date' : 'text';
  return (
    <Field label={attr.unit ? `${attr.label} (${attr.unit})` : attr.label} htmlFor={id}>
      <input id={id} type={type} className={inputCls} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function IdentifyStep({
  seed, assets, onBack, onCommit, committing = false,
}: {
  seed: RegistrationSeed;
  assets: RegisteredAsset[];
  onBack: () => void;
  onCommit: (values: IdentifyValues) => void;
  /**
   * The commit is in flight. The ID is minted by the server, so this step waits
   * for the response rather than guessing — which means the button has to say
   * so, and has to stop a second submission creating a second asset.
   */
  committing?: boolean;
}) {
  const [v, setV] = useState<IdentifyValues>({
    classId: seed.classId,
    name: seed.name,
    manufacturer: seed.manufacturer,
    model: seed.model,
    serialNumber: seed.serialNumber,
    criticality: seed.criticality,
    description: '',
    attributes: {},
  });
  const [touched, setTouched] = useState(false);
  const [nameEdited, setNameEdited] = useState(Boolean(seed.name));
  const [ackFuzzy, setAckFuzzy] = useState(false);
  const [forceDistinct, setForceDistinct] = useState(false);
  const [forceReason, setForceReason] = useState('');
  const [noSerial, setNoSerial] = useState(false);

  const set = <K extends keyof IdentifyValues>(k: K, value: IdentifyValues[K]) => setV((f) => ({ ...f, [k]: value }));

  // Live library — a class added in Administration is selectable here at once.
  const { classes } = useClassLibrary();
  const cls = classes.find((c) => c.id === v.classId);
  const tpl = getClassTemplate(v.classId);

  // Picking a class re-bases criticality on the class default — inherited, not
  // entered — unless the user has already moved it themselves.
  const pickClass = (id: string) => {
    const next = getClassTemplate(id);
    setV((f) => ({ ...f, classId: id, criticality: next.defaultCriticality ?? f.criticality, attributes: {} }));
  };

  // Name is a suggestion until someone edits it. Never force a dock clerk to
  // invent a naming convention.
  const autoName = suggestName(v.manufacturer, v.model, v.serialNumber);
  const effectiveName = nameEdited ? v.name : autoName;

  const dup = useMemo(
    () => (noSerial ? { kind: 'clean' as const, matches: [], message: '' } : checkDuplicate(v.serialNumber, v.manufacturer, assets)),
    [v.serialNumber, v.manufacturer, assets, noSerial],
  );

  const errors = {
    classId: v.classId ? '' : 'Pick an asset class — it decides the rest of the form.',
    name: effectiveName.trim() ? '' : 'Give the asset a name, or fill in manufacturer and model to auto-name it.',
    serialNumber: noSerial || v.serialNumber.trim() ? '' : 'Serial number is required, or mark the asset as having none.',
    manufacturer: v.manufacturer.trim() ? '' : 'Manufacturer is required.',
  };
  const blockedByDuplicate = (dup.kind === 'exact' || dup.kind === 'retired') && !forceDistinct;
  const blockedByFuzzy = dup.kind === 'fuzzy' && !ackFuzzy;
  const hasErrors = Object.values(errors).some(Boolean);
  const canCommit = !hasErrors && !blockedByDuplicate && !blockedByFuzzy && (!forceDistinct || forceReason.trim().length > 3);

  const err = (k: keyof typeof errors) => (touched ? errors[k] : undefined);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canCommit || committing) return;
    onCommit({
      ...v,
      name: effectiveName.trim(),
      serialNumber: noSerial ? '' : v.serialNumber.trim(),
      duplicateAck: forceDistinct
        ? `Declared a distinct unit despite an exact serial match — ${forceReason.trim()}`
        : ackFuzzy && dup.kind === 'fuzzy'
          ? `Acknowledged close match to ${dup.matches.map((m) => m.id).join(', ')}`
          : undefined,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="glass-panel rounded-xl p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-base font-bold text-slate-900">Identify the asset</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Six fields, then it is a real asset with an ID and a page of its own. Everything else can follow later.
            </p>
          </div>
          <Badge tone="primary">Commit point</Badge>
        </div>

        {seed.provenance && (
          <div className="mb-5">
            <Note tone="primary" icon="🧾">{seed.provenance}</Note>
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <Field
            label="Asset class" required error={err('classId')} htmlFor="ob-class"
            hint={v.classId ? `${tpl.activationGates.length} activation gates · ${tpl.trackingExpected ? 'tracking expected' : 'tracking optional'} · ${tpl.depreciationMethod}` : 'Drives attributes, monitoring, depreciation, PM plan and required gates.'}
          >
            <select
              id="ob-class"
              className={cn(inputCls, err('classId') && 'border-health-critical')}
              value={v.classId}
              onChange={(e) => pickClass(e.target.value)}
            >
              <option value="">Select a class…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </Field>

          <Field
            label="Criticality" required htmlFor="ob-crit"
            hint="Defaults from the class. Drives SLA, alert routing and whether activation needs approval."
          >
            <select id="ob-crit" className={inputCls} value={v.criticality} onChange={(e) => set('criticality', e.target.value as Criticality)}>
              {CRITICALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="Manufacturer" required error={err('manufacturer')} htmlFor="ob-mfr">
            <input
              id="ob-mfr"
              className={cn(inputCls, err('manufacturer') && 'border-health-critical')}
              value={v.manufacturer}
              onChange={(e) => set('manufacturer', e.target.value)}
              placeholder="e.g. Dell"
            />
          </Field>

          <Field label="Model" htmlFor="ob-model">
            <input id="ob-model" className={inputCls} value={v.model} onChange={(e) => set('model', e.target.value)} placeholder="e.g. PowerEdge R760" />
          </Field>

          <Field
            label="Serial number" required={!noSerial} error={err('serialNumber')} htmlFor="ob-serial"
            hint={!noSerial ? 'Checked against the registry as you type.' : 'Recorded without one — the asset ID identifies it.'}
          >
            <input
              id="ob-serial"
              disabled={noSerial}
              className={cn(inputCls, 'font-mono', err('serialNumber') && 'border-health-critical', noSerial && 'bg-slate-100 text-slate-400')}
              value={noSerial ? '' : v.serialNumber}
              onChange={(e) => set('serialNumber', e.target.value)}
              placeholder="e.g. CN-0R740-77291-4B"
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" checked={noSerial} onChange={(e) => setNoSerial(e.target.checked)} className="rounded border-slate-300" />
              No serial number (fabricated, legacy or bulk-identical)
            </label>
          </Field>

          <Field
            label="Asset name" required error={err('name')} htmlFor="ob-name"
            hint={!nameEdited && autoName ? 'Auto-named from manufacturer, model and serial. Edit to override.' : undefined}
          >
            <input
              id="ob-name"
              className={cn(inputCls, err('name') && 'border-health-critical')}
              value={effectiveName}
              onChange={(e) => { setNameEdited(true); set('name', e.target.value); }}
              placeholder="Auto-generated from make and model"
            />
          </Field>
        </div>

        {/* ── Identification / duplicate control ──────────────────────────── */}
        {dup.kind !== 'clean' && (
          <div className="mt-5 space-y-3">
            <Note tone={dup.kind === 'fuzzy' ? 'amber' : 'red'} icon={dup.kind === 'retired' ? '♻️' : '⛔'}>
              <span className="font-semibold">
                {dup.kind === 'exact' ? 'Already registered' : dup.kind === 'retired' ? 'Matches a retired asset' : 'Possible duplicate'}
              </span>
              {' — '}{dup.message}
            </Note>

            <div className="space-y-2">
              {dup.matches.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{m.name}</div>
                    <div className="text-xs text-slate-500">
                      {m.id} · SN <span className="font-mono">{m.serialNumber}</span> · {m.custodian} · {m.status.replace('_', ' ')}
                    </div>
                  </div>
                  <Link to={`/assets/${m.id}`} className="shrink-0 text-xs font-medium text-primary-600 hover:underline">
                    Open existing →
                  </Link>
                </div>
              ))}
            </div>

            {dup.kind === 'fuzzy' && (
              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={ackFuzzy} onChange={(e) => setAckFuzzy(e.target.checked)} className="mt-0.5 rounded border-slate-300" />
                I have checked — this is a different physical unit. (Recorded on the registration event.)
              </label>
            )}

            {(dup.kind === 'exact' || dup.kind === 'retired') && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-start gap-2 text-xs font-medium text-slate-700">
                  <input type="checkbox" checked={forceDistinct} onChange={(e) => setForceDistinct(e.target.checked)} className="mt-0.5 rounded border-slate-300" />
                  Override — this is a genuinely different unit with the same serial
                </label>
                {forceDistinct && (
                  <input
                    className={cn(inputCls, 'mt-2')}
                    value={forceReason}
                    onChange={(e) => setForceReason(e.target.value)}
                    placeholder="Reason (required, written to the audit log)…"
                  />
                )}
                {dup.kind === 'retired' && !forceDistinct && (
                  <p className="mt-2 text-xs text-slate-500">
                    Prefer <span className="font-semibold">Reinstate</span> from the retired record — a second record would fork its
                    warranty, custody and depreciation history.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Class attributes ────────────────────────────────────────────── */}
        {cls && cls.attributes.length > 0 && (
          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="mb-4">
              <span className={labelCls}>{cls.icon} {cls.name} attributes</span>
              <p className="-mt-1 text-xs text-slate-400">
                Inherited from the class template. Optional now — the class decides which are needed to activate.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              {cls.attributes.map((attr) => (
                <AttributeField
                  key={attr.key}
                  attr={attr}
                  value={v.attributes[attr.key]}
                  onChange={(val) => setV((f) => ({ ...f, attributes: { ...f.attributes, [attr.key]: val } }))}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-slate-500">
          {blockedByDuplicate
            ? <span className="text-health-critical">Resolve the duplicate before committing.</span>
            : 'Nothing after this point is mandatory — you can leave and finish later.'}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onBack} disabled={committing}>← Change source</Button>
          <Button type="submit" disabled={(touched && !canCommit) || committing}>
            {committing ? 'Creating…' : 'Create asset →'}
          </Button>
        </div>
      </div>
    </form>
  );
}
