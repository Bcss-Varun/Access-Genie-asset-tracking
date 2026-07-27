'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Administration ▸ Asset Classes ▸ [class] — the class editor.
//
// Everything here is phrased as a consequence rather than a setting: not
// "activationGates: ['located']" but "must be placed somewhere real before it
// can go live". A class is edited rarely and by few people, so the cost of
// spelling it out is low and the cost of getting it wrong is thousands of
// assets behaving unexpectedly.
// ─────────────────────────────────────────────────────────────────────────────

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useClassLibrary } from '@/components/providers/ClassLibraryProvider';
import { useRegistry } from '@/components/providers/RegistryProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { MONITORING_PROFILES, getMonitoringProfile, GATE_ORDER } from '@/lib/asset-classes';
import {
  GATE_EXPLAINER, ATTRIBUTE_TYPES, ALL_DOC_TYPES, ALL_TAG_KINDS, DEPRECIATION_METHODS, attributeKey,
} from '@/lib/class-library';
import { formatMoney, cn } from '@/lib/utils';
import type { AttributeDef, Criticality, DocType, SensorKind } from '@/types/asset';
import type { GateKey } from '@/types/onboarding';

const input =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 transition-colors';
const label = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5';

function Section({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="glass-panel rounded-xl p-6">
      <div className="mb-5">
        <h2 className="font-heading text-base font-bold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

/** Multi-select rendered as toggle chips — clearer than a ctrl-click listbox. */
function Chips<T extends string>({
  options, selected, onToggle,
}: {
  options: readonly T[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            aria-pressed={on}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              on ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
          >
            {on ? '✓ ' : '+ '}{o}
          </button>
        );
      })}
    </div>
  );
}

function AttributeRow({
  attr, index, total, onPatch, onRemove, onMove,
}: {
  attr: AttributeDef;
  index: number;
  total: number;
  onPatch: (patch: Partial<AttributeDef>) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[10rem] flex-1">
          <label className={label} htmlFor={`attr-label-${attr.key}`}>Field name</label>
          <input
            id={`attr-label-${attr.key}`}
            className={input}
            value={attr.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            placeholder="e.g. Processor"
          />
        </div>

        <div className="w-40">
          <label className={label} htmlFor={`attr-type-${attr.key}`}>Type</label>
          <select
            id={`attr-type-${attr.key}`}
            className={input}
            value={attr.type}
            onChange={(e) => onPatch({ type: e.target.value as AttributeDef['type'] })}
          >
            {ATTRIBUTE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {attr.type === 'number' && (
          <div className="w-28">
            <label className={label} htmlFor={`attr-unit-${attr.key}`}>Unit</label>
            <input
              id={`attr-unit-${attr.key}`}
              className={input}
              value={attr.unit ?? ''}
              onChange={(e) => onPatch({ unit: e.target.value || undefined })}
              placeholder="GB"
            />
          </div>
        )}

        <label className="flex items-center gap-2 pb-2.5 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={Boolean(attr.required)}
            onChange={(e) => onPatch({ required: e.target.checked })}
            className="rounded border-slate-300"
          />
          Required
        </label>

        <div className="flex items-center gap-1 pb-1.5">
          <button
            type="button" onClick={() => onMove(-1)} disabled={index === 0}
            aria-label="Move up"
            className="rounded px-1.5 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
          >↑</button>
          <button
            type="button" onClick={() => onMove(1)} disabled={index === total - 1}
            aria-label="Move down"
            className="rounded px-1.5 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
          >↓</button>
          <button
            type="button" onClick={onRemove}
            aria-label={`Remove ${attr.label}`}
            className="rounded px-1.5 py-1 text-slate-400 hover:bg-red-50 hover:text-health-critical"
          >✕</button>
        </div>
      </div>

      {attr.type === 'select' && (
        <div className="mt-3">
          <label className={label} htmlFor={`attr-opts-${attr.key}`}>Choices (comma separated)</label>
          <input
            id={`attr-opts-${attr.key}`}
            className={input}
            value={(attr.options ?? []).join(', ')}
            onChange={(e) => onPatch({ options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            placeholder="RFID, BLE, UWB"
          />
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        Stored as <span className="font-mono">{attr.key}</span> ·{' '}
        {ATTRIBUTE_TYPES.find((t) => t.value === attr.type)?.hint}
      </p>
    </li>
  );
}

export default function ClassEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getClass, updateClass, deleteClass, addAttribute, updateAttribute, removeAttribute, moveAttribute } = useClassLibrary();
  const { assets } = useRegistry();
  const { toast } = useToast();
  const router = useRouter();

  const [newField, setNewField] = useState('');
  const cls = getClass(id);

  if (!cls) {
    return (
      <div className="flex h-full flex-col space-y-6">
        <PageHeader title="Class not found" breadcrumb={[{ label: 'Administration' }, { label: 'Asset Classes', href: '/admin/classes' }]} />
        <EmptyState
          icon="🔍"
          title="No such asset class"
          description={`Nothing in the library matches ${id}.`}
          action={<Link href="/admin/classes"><Button variant="outline">Back to classes</Button></Link>}
        />
      </div>
    );
  }

  const inUse = assets.filter((a) => a.onboarding.classId === cls.id && !a.onboarding.voidedAt).length;
  const profile = getMonitoringProfile(cls.monitoringProfileId);
  const set = <K extends keyof typeof cls>(k: K, v: (typeof cls)[K]) => updateClass(cls.id, { [k]: v });

  const toggleGate = (g: GateKey) => {
    // Identity is what creates the asset — it cannot be switched off.
    if (g === 'identified') return;
    const next = cls.activationGates.includes(g)
      ? cls.activationGates.filter((x) => x !== g)
      : [...cls.activationGates, g];
    set('activationGates', next);
  };

  const addField = () => {
    const name = newField.trim();
    if (!name) return;
    addAttribute(cls.id, {
      key: attributeKey(name, cls.attributes.map((a) => a.key)),
      label: name,
      type: 'text',
    });
    setNewField('');
  };

  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader
        title={`${cls.icon} ${cls.name}`}
        subtitle={cls.description || 'No description yet — add one below so people know what belongs here.'}
        breadcrumb={[
          { label: 'Administration' },
          { label: 'Asset Classes', href: '/admin/classes' },
          { label: cls.name },
        ]}
        actions={
          <>
            <Badge tone="slate">{cls.id}</Badge>
            <Link href="/admin/classes"><Button variant="outline">Done</Button></Link>
          </>
        }
      />

      {/* What this class means for an asset — the consequence, up front */}
      <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-5 py-3 text-sm text-slate-600">
        An asset in this class captures <span className="font-semibold text-slate-800">{cls.attributes.length} extra field{cls.attributes.length === 1 ? '' : 's'}</span>,
        must pass <span className="font-semibold text-slate-800">{cls.activationGates.length} check{cls.activationGates.length === 1 ? '' : 's'}</span> before going live,
        is {cls.trackingExpected ? <span className="font-semibold text-slate-800">expected to carry a tag</span> : 'not expected to be tagged'},
        and depreciates <span className="font-semibold text-slate-800">{cls.depreciationMethod.toLowerCase()}</span>.
        {inUse > 0 && <> Changes affect <span className="font-semibold text-slate-800">{inUse} existing asset{inUse === 1 ? '' : 's'}</span>.</>}
      </div>

      {/* ── Basics ──────────────────────────────────────────────────────────── */}
      <Section title="Basics" blurb="What this class is called, and what belongs in it.">
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="cls-name">Name</label>
            <input id="cls-name" className={input} value={cls.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="cls-icon">Icon</label>
            <input id="cls-icon" className={cn(input, 'text-xl')} value={cls.icon} onChange={(e) => set('icon', e.target.value)} maxLength={4} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="cls-desc">Description</label>
            <input
              id="cls-desc" className={input} value={cls.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="e.g. Laptops, tablets and phones issued to people"
            />
          </div>
          <div>
            <label className={label} htmlFor="cls-crit">Default criticality</label>
            <select id="cls-crit" className={input} value={cls.defaultCriticality} onChange={(e) => set('defaultCriticality', e.target.value as Criticality)}>
              {(['Low', 'Medium', 'High', 'Critical'] as const).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-400">Pre-selected when registering. Drives alert routing and whether a sign-off is needed.</p>
          </div>
        </div>
      </Section>

      {/* ── Attributes ──────────────────────────────────────────────────────── */}
      <Section
        title="Fields captured"
        blurb="Extra information asked for at registration, on top of name, serial and manufacturer."
      >
        {cls.attributes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No extra fields. Assets in this class capture only the six standard identity fields.
          </p>
        ) : (
          <ul className="space-y-2">
            {cls.attributes.map((attr, i) => (
              <AttributeRow
                key={attr.key}
                attr={attr}
                index={i}
                total={cls.attributes.length}
                onPatch={(patch) => updateAttribute(cls.id, attr.key, patch)}
                onRemove={() => removeAttribute(cls.id, attr.key)}
                onMove={(d) => moveAttribute(cls.id, attr.key, d)}
              />
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <label className={label} htmlFor="new-field">Add a field</label>
            <input
              id="new-field"
              className={input}
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addField(); } }}
              placeholder="e.g. Battery capacity"
            />
          </div>
          <Button variant="outline" onClick={addField} disabled={!newField.trim()}>+ Add field</Button>
        </div>
      </Section>

      {/* ── Activation policy ───────────────────────────────────────────────── */}
      <Section
        title="Before it can go live"
        blurb="Tick what must be true before an asset in this class leaves Draft. Everything unticked is still allowed — just not required."
      >
        <ul className="space-y-1.5">
          {GATE_ORDER.map((g) => {
            const on = cls.activationGates.includes(g);
            const locked = g === 'identified';
            const info = GATE_EXPLAINER[g];
            return (
              <li key={g}>
                <label
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-2.5 transition-colors',
                    on ? 'border-primary-200 bg-primary-50/50' : 'border-slate-200 hover:bg-slate-50',
                    locked && 'cursor-not-allowed opacity-70',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={locked}
                    onChange={() => toggleGate(g)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{info.label}</span>
                      {locked && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">always on</span>}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">{info.means}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* ── Tracking ────────────────────────────────────────────────────────── */}
      <Section title="Tracking" blurb="Whether assets in this class are expected to carry a tag, and which kinds suit them.">
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 px-4 py-2.5">
          <input
            type="checkbox"
            checked={cls.trackingExpected}
            onChange={(e) => set('trackingExpected', e.target.checked)}
            className="mt-0.5 rounded border-slate-300"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">Expect a tracking tag</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Changes the tone of the Track step during registration. It is never a hard block either way — tick
              &ldquo;Tracking tag&rdquo; above if it must actually be enforced.
            </span>
          </span>
        </label>

        <div className="mt-4">
          <span className={label}>Suited tag types</span>
          <Chips<SensorKind>
            options={ALL_TAG_KINDS}
            selected={cls.preferredTags}
            onToggle={(t) => set('preferredTags', cls.preferredTags.includes(t) ? cls.preferredTags.filter((x) => x !== t) : [...cls.preferredTags, t])}
          />
          <p className="mt-2 text-xs text-slate-400">Anything else can still be bound — it just warns and records the deviation.</p>
        </div>
      </Section>

      {/* ── Monitoring & maintenance ────────────────────────────────────────── */}
      <Section title="Monitoring & maintenance" blurb="Inherited by every asset in this class at registration — nobody is asked to confirm it.">
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="cls-monitor">Monitoring profile</label>
            <select
              id="cls-monitor" className={input}
              value={cls.monitoringProfileId ?? ''}
              onChange={(e) => set('monitoringProfileId', e.target.value || null)}
            >
              <option value="">None — by policy</option>
              {MONITORING_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {profile && <p className="mt-1 text-xs text-slate-400">{profile.summary}</p>}
          </div>

          <div>
            <label className={label} htmlFor="cls-pm">Preventive maintenance plan</label>
            <input
              id="cls-pm" className={input}
              value={cls.pmPlan ?? ''}
              onChange={(e) => set('pmPlan', e.target.value || null)}
              placeholder="Leave blank for run-to-failure"
            />
            <p className="mt-1 text-xs text-slate-400">
              {cls.pmPlan ? 'Applied automatically at registration.' : 'Blank means assets are registered as run-to-failure.'}
            </p>
          </div>
        </div>

        {profile && (
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {profile.rules.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs">
                <span className="font-medium text-slate-700">{r.label}</span>
                <span className="text-slate-500">{r.threshold} → {r.recipients}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Money ───────────────────────────────────────────────────────────── */}
      <Section title="Money" blurb="How assets in this class are depreciated, and when a registration needs a sign-off.">
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="cls-dep">Depreciation method</label>
            <select id="cls-dep" className={input} value={cls.depreciationMethod} onChange={(e) => set('depreciationMethod', e.target.value)}>
              {DEPRECIATION_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="cls-life">Useful life (years)</label>
            <input
              id="cls-life" type="number" min={1} max={40} className={input}
              value={cls.usefulLifeYears}
              onChange={(e) => set('usefulLifeYears', Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div>
            <label className={label} htmlFor="cls-appr">Approval needed above (₹)</label>
            <input
              id="cls-appr" type="number" min={0} step={50000} className={input}
              value={cls.approvalThreshold}
              onChange={(e) => set('approvalThreshold', Math.max(0, Number(e.target.value) || 0))}
            />
            <p className="mt-1 text-xs text-slate-400">Currently {formatMoney(cls.approvalThreshold)}.</p>
          </div>
        </div>
      </Section>

      {/* ── Documents ───────────────────────────────────────────────────────── */}
      <Section
        title="Expected documents"
        blurb="Suggested at registration. Only enforced if you ticked “Documents” in the go-live checks above."
      >
        <Chips<DocType>
          options={ALL_DOC_TYPES}
          selected={cls.documentChecklist}
          onToggle={(d) => set('documentChecklist', cls.documentChecklist.includes(d) ? cls.documentChecklist.filter((x) => x !== d) : [...cls.documentChecklist, d])}
        />
      </Section>

      {/* ── Delete ──────────────────────────────────────────────────────────── */}
      <Section title="Delete this class" blurb="Only possible while no asset is using it — existing assets would lose their policy.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {inUse === 0
              ? 'No assets use this class, so it can be removed safely.'
              : `${inUse} asset${inUse === 1 ? '' : 's'} currently use this class.`}
          </p>
          <Button
            variant="danger"
            disabled={inUse > 0}
            onClick={() => {
              deleteClass(cls.id);
              toast({ title: `${cls.name} deleted`, tone: 'info' });
              router.push('/admin/classes');
            }}
          >
            Delete class
          </Button>
        </div>
      </Section>
    </div>
  );
}
