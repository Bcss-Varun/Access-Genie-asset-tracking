'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Configure · Track — bind the physical world to the record.
//
// Three things the original spec conflated are kept apart here: provisioning a
// device, binding it to the asset, and VERIFYING that it actually reads. That
// third one matters — "bound but never read" is the most common real-world
// tracking failure, and it must be visible rather than counted as success
// (docs/21 §21.3.4, M7).
//
// A binding is a row, not a field: an asset can carry a QR identity label, a BLE
// beacon for location and a probe for telemetry all at once (M6).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { useRegistry } from '@/components/providers/RegistryProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/primitives';
import { ConfigCard, Field, Note, inputCls } from './fields';
import { mockSensors, TAG_ID_PREFIX } from '@/lib/mock-data';
import { getClassTemplate } from '@/lib/asset-classes';
import { roleForKind, verifiesOnPrint, trackingTechLabel } from '@/lib/onboarding';
import { cn, relTime, DEMO_NOW } from '@/lib/utils';
import type { SensorKind } from '@/types/asset';
import type { GateResult, RegisteredAsset, TagBinding } from '@/types/onboarding';

const KINDS: { kind: SensorKind; blurb: string }[] = [
  { kind: 'QR Label', blurb: 'Printed and verified on first scan — no procurement' },
  { kind: 'RFID Tag', blurb: 'Encoded and printed; read by dock and room portals' },
  { kind: 'BLE Beacon', blurb: 'Battery beacon for room-level presence' },
  { kind: 'UWB Tag', blurb: 'Sub-metre precision against anchor clusters' },
  { kind: 'GPS Tracker', blurb: 'Outdoor and in-transit tracking over LTE' },
  { kind: 'LoRaWAN Sensor', blurb: 'Long-range low-power contact and door sensors' },
];

const ROLE_LABEL = { identity: 'Identity', location: 'Location', telemetry: 'Telemetry' } as const;

function mintTagId(kind: SensorKind, taken: Set<string>): string {
  const prefix = TAG_ID_PREFIX[kind] ?? 'TAG-';
  for (let n = 9100; n < 9999; n++) {
    const candidate = `${prefix}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${prefix}${Date.parse('2026-07-23')}`;
}

export function TrackCard({
  asset, gates, step,
}: {
  asset: RegisteredAsset;
  gates: GateResult[];
  step: number;
}) {
  const { assets, addBinding, verifyBinding, retireBinding, patchOnboarding, patchAsset } = useRegistry();
  const { toast } = useToast();

  const tpl = getClassTemplate(asset.onboarding.classId);
  const gate = gates.find((g) => g.key === 'tracked')!;
  const ob = asset.onboarding;

  const [mode, setMode] = useState<'existing' | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [newKind, setNewKind] = useState<SensorKind>(tpl.preferredTags[0] ?? 'QR Label');
  const [override, setOverride] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);

  // Every tag id already spoken for, across the mock estate and the registry.
  const takenTags = useMemo(() => {
    const s = new Set<string>();
    for (const sensor of mockSensors) if (sensor.assetId && sensor.tagId) s.add(sensor.tagId);
    for (const a of assets) for (const b of a.onboarding.bindings) if (!b.retiredAt) s.add(b.tagId);
    return s;
  }, [assets]);

  const live = ob.bindings.filter((b) => !b.retiredAt);
  const retired = ob.bindings.filter((b) => b.retiredAt);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mockSensors
      .filter((s) => s.tagId && !takenTags.has(s.tagId))
      .filter((s) => !q || `${s.tagId} ${s.name} ${s.kind} ${s.zone ?? ''}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [search, takenTags]);

  // A tag id that IS taken — surfaced so a conflict reads as a conflict, not as
  // "no results".
  const conflict = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 4) return null;
    const hit = mockSensors.find((s) => s.tagId?.toLowerCase() === q && takenTags.has(s.tagId));
    if (!hit) return null;
    const holder = assets.find((a) => a.onboarding.bindings.some((b) => !b.retiredAt && b.tagId === hit.tagId));
    return { tagId: hit.tagId!, holder: holder?.name ?? hit.assetName ?? 'another asset', holderId: holder?.id };
  }, [search, takenTags, assets]);

  const bind = (tagId: string, kind: SensorKind) => {
    const role = roleForKind(kind);
    const binding: TagBinding = {
      id: `TB-${asset.id}-${ob.bindings.length + 1}`,
      tagId,
      kind,
      role,
      // QR verifies on the scan that prints it; radio devices wait to be heard.
      state: verifiesOnPrint(kind) ? 'Verified' : 'Bound',
      boundAt: new Date(DEMO_NOW).toISOString(),
      verifiedAt: verifiesOnPrint(kind) ? new Date(DEMO_NOW).toISOString() : undefined,
      replacedTagId: replacing ? ob.bindings.find((b) => b.id === replacing)?.tagId : undefined,
    };
    addBinding(asset.id, binding);
    patchAsset(asset.id, { trackingTech: trackingTechLabel(kind) });
    if (replacing) {
      retireBinding(asset.id, replacing);
      setReplacing(null);
    }
    setMode(null);
    setSearch('');
    toast({
      title: verifiesOnPrint(kind) ? 'Tag bound and verified' : 'Tag bound — awaiting first read',
      description: tagId,
      tone: 'success',
    });
  };

  const decide = (intent: 'pending' | 'not-tracked') => {
    patchOnboarding(asset.id, { trackingIntent: intent });
    setMode(null);
    toast({
      title: intent === 'not-tracked' ? 'Recorded: not tracked by policy' : 'Tag assignment queued as a task',
      tone: 'info',
    });
  };

  const kindAllowed = tpl.preferredTags.includes(newKind);

  return (
    <ConfigCard
      step={step}
      title="Track"
      description={
        tpl.trackingExpected
          ? 'This class expects a tracking device — but it is still never a hard block.'
          : 'This class does not expect tracking. Bind a tag only if this unit needs one.'
      }
      status={gate.state}
      required={gate.required}
      actions={
        <Badge tone={gate.state === 'met' ? 'emerald' : gate.state === 'pending' ? 'amber' : 'slate'}>
          {ob.trackingIntent === 'not-tracked' ? 'Not tracked'
            : live.some((b) => b.state === 'Verified') ? 'Verified'
              : live.length ? 'Bound — unverified'
                : ob.trackingIntent === 'pending' ? 'Tag pending'
                  : 'Undecided'}
        </Badge>
      }
    >
      {/* ── Existing bindings ─────────────────────────────────────────────── */}
      {live.length > 0 && (
        <ul className="mb-4 space-y-2">
          {live.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900">{b.tagId}</span>
                  <Badge tone="slate">{b.kind}</Badge>
                  <Badge tone="primary">{ROLE_LABEL[b.role]}</Badge>
                  {b.state === 'Verified'
                    ? <Badge tone="emerald">✅ Verified {b.verifiedAt ? relTime(b.verifiedAt) : ''}</Badge>
                    : <Badge tone="amber">⏳ Bound — no read yet</Badge>}
                </div>
                {b.replacedTagId && (
                  <p className="mt-1 text-[11px] text-slate-400">Replaced {b.replacedTagId} — history stitched across the swap.</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {b.state === 'Bound' && (
                  <Button size="sm" variant="outline" onClick={() => { verifyBinding(asset.id, b.id); toast({ title: 'First read received', description: b.tagId, tone: 'success' }); }}>
                    Simulate first read
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => { setReplacing(b.id); setMode('new'); }}>
                  Replace
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {retired.length > 0 && (
        <details className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5">
          <summary className="cursor-pointer text-xs font-semibold text-slate-600">
            {retired.length} retired binding{retired.length > 1 ? 's' : ''} — kept, never deleted
          </summary>
          <ul className="mt-2 space-y-1">
            {retired.map((b) => (
              <li key={b.id} className="text-xs text-slate-500">
                <span className="font-mono">{b.tagId}</span> · {b.kind} · retired {b.retiredAt ? relTime(b.retiredAt) : ''}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* ── Choose a path ─────────────────────────────────────────────────── */}
      {mode === null && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" onClick={() => setMode('existing')}>Assign existing tag</Button>
            <Button variant="outline" onClick={() => setMode('new')}>Register new tag</Button>
            <Button variant="ghost" onClick={() => decide('pending')}>Assign later</Button>
            <Button variant="ghost" onClick={() => decide('not-tracked')}>Not tracked</Button>
          </div>
          <Note icon="🏷">
            <span className="font-semibold">Skip is a first-class outcome</span> — but it is recorded as an intent, not
            an absence. <em>Not tracked by policy</em> closes the gate; <em>assign later</em> leaves it open and queues
            a task. Those are different states with different follow-ups.
          </Note>
        </div>
      )}

      {/* ── Assign existing ───────────────────────────────────────────────── */}
      {mode === 'existing' && (
        <div className="space-y-3">
          <Field label="Search the tag registry" htmlFor="tk-search" hint="Scan the tag or type its identifier. Spare stock appears first.">
            <input
              id="tk-search"
              className={cn(inputCls, 'font-mono')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="EPC / MAC / IMEI / QR payload…"
              autoComplete="off"
            />
          </Field>

          {conflict && (
            <Note tone="red" icon="⛔">
              <span className="font-semibold">{conflict.tagId} is already bound</span> to {conflict.holder}. Unbind it
              there first — that needs the <span className="font-mono text-[11px]">tag:unbind</span> permission and a
              reason, and the old binding is archived rather than deleted.
            </Note>
          )}

          <ul className="space-y-2">
            {available.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => bind(s.tagId!, s.kind)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-2.5 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-semibold text-slate-900">{s.tagId}</div>
                    <div className="text-xs text-slate-500">
                      {s.kind} · {s.name} · {s.facility ?? '—'}{s.zone ? ` ▸ ${s.zone}` : ''}
                      {s.batteryLevel !== undefined && ` · battery ${s.batteryLevel}%`}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-primary-600">Bind →</span>
                </button>
              </li>
            ))}
            {available.length === 0 && !conflict && (
              <li className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-400">
                No unbound tags match. Every other tag in the estate is already carrying an asset.
              </li>
            )}
          </ul>

          <Button variant="ghost" size="sm" onClick={() => { setMode(null); setSearch(''); }}>Cancel</Button>
        </div>
      )}

      {/* ── Register new ──────────────────────────────────────────────────── */}
      {mode === 'new' && (
        <div className="space-y-4">
          {replacing && (
            <Note tone="amber" icon="🔁">
              Replacing <span className="font-mono">{ob.bindings.find((b) => b.id === replacing)?.tagId}</span>. The old
              binding is retired, not deleted, and the movement trail stitches across the swap.
            </Note>
          )}

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Technology</span>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {KINDS.map(({ kind, blurb }) => {
                const on = newKind === kind;
                const preferred = tpl.preferredTags.includes(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => { setNewKind(kind); setOverride(false); }}
                    aria-pressed={on}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left transition-colors',
                      on ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500/25' : 'border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={cn('text-sm font-semibold', on ? 'text-primary-700' : 'text-slate-800')}>{kind}</span>
                      {preferred && <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-600">class</span>}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{blurb}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {!kindAllowed && (
            <Note tone="amber" icon="⚠️">
              The {asset.category} class prefers {tpl.preferredTags.join(' or ')}. You can still use{' '}
              {newKind} — the deviation is recorded on the binding.
              <label className="mt-2 flex items-center gap-2 font-medium">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="rounded border-slate-300" />
                Use {newKind} anyway
              </label>
            </Note>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tag identifier — minted</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-slate-900">{mintTagId(newKind, takenTags)}</div>
            <p className="mt-1 text-[11px] text-slate-500">
              {verifiesOnPrint(newKind)
                ? 'QR labels verify on the scan that prints them — this binding lands Verified.'
                : 'Radio devices have to be heard by a gateway first, so this binding lands as Bound and waits for its first read.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => bind(mintTagId(newKind, takenTags), newKind)}
              disabled={!kindAllowed && !override}
            >
              {verifiesOnPrint(newKind) ? 'Print & bind' : 'Provision & bind'}
            </Button>
            <Button variant="ghost" onClick={() => { setMode(null); setReplacing(null); }}>Cancel</Button>
          </div>
        </div>
      )}
    </ConfigCard>
  );
}
