'use client';

// ─────────────────────────────────────────────────────────────────────────────
// RegisterFlow — the four-stage onboarding runway.
//
//   A · Source     one click, often zero typing
//   B · Identify   six fields → COMMIT (the asset becomes real here)
//   C · Configure  four independent cards, all skippable, all resumable
//   D · Activate   gates + a review only when approval is actually triggered
//
// The dotted path matters more than the solid one: after the commit in B, the
// user can leave at any point and the draft is waiting on its own Asset 360
// page with the identical checklist. Guided onboarding stays; the all-or-nothing
// transaction goes (docs/21 §21.3).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRegistry } from '@/components/providers/RegistryProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/primitives';
import { SourcePicker } from './SourcePicker';
import { IdentifyStep, type IdentifyValues } from './IdentifyStep';
import { SetupChecklist } from './SetupChecklist';
import { PlaceCard } from './PlaceCard';
import { TrackCard } from './TrackCard';
import { CommercialCard } from './CommercialCard';
import { ActivatePanel } from './ActivatePanel';
import { Note } from './fields';
import {
  evaluateGates, locationOptions, mintAssetId, newOnboarding, roleForKind,
  shortIdFor, UNASSIGNED_LOCATION,
} from '@/lib/onboarding';
import { getClassTemplate } from '@/lib/asset-classes';
import { useClassLibrary } from '@/components/providers/ClassLibraryProvider';
import { cn, DEMO_NOW } from '@/lib/utils';
import type { AssetCategory } from '@/types/asset';
import type { RegisteredAsset, RegistrationSeed, TagBinding } from '@/types/onboarding';

type Stage = 'source' | 'identify' | 'configure';

const STAGES: { key: Stage | 'activate'; label: string; hint: string }[] = [
  { key: 'source', label: 'Source', hint: 'Where it came from' },
  { key: 'identify', label: 'Identify', hint: '6 fields → commit' },
  { key: 'configure', label: 'Configure', hint: 'Place · Track · Protect · Commercial' },
  { key: 'activate', label: 'Activate', hint: 'Gates & approval' },
];

function StageRail({ stage, committed }: { stage: Stage; committed: boolean }) {
  const activeIdx = stage === 'source' ? 0 : stage === 'identify' ? 1 : 2;
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {STAGES.map((s, i) => {
        const done = i < activeIdx || (i === 3 && false);
        const active = i === activeIdx;
        return (
          <li key={s.key} className="flex items-center gap-1.5">
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-1.5',
                active ? 'border-primary-500 bg-primary-50'
                  : done ? 'border-emerald-200 bg-emerald-50'
                    : 'border-slate-200 bg-white',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                  active ? 'bg-primary-600 text-white'
                    : done ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 text-slate-500',
                )}
              >
                {done ? '✓' : String.fromCharCode(65 + i)}
              </span>
              <span className="min-w-0">
                <span className={cn('block text-xs font-semibold', active ? 'text-primary-700' : done ? 'text-emerald-700' : 'text-slate-500')}>
                  {s.label}
                </span>
                <span className="block text-[10px] text-slate-400">{s.hint}</span>
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <span className={cn('text-xs', i === 1 && committed ? 'text-emerald-500' : 'text-slate-300')}>
                {i === 1 ? '⇒' : '→'}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function RegisterFlow() {
  const router = useRouter();
  const { assets, getAsset, register } = useRegistry();
  const { classes } = useClassLibrary();
  const { session } = useSession();
  const { toast } = useToast();

  // Resume a draft straight into Configure — the registry's "Setup incomplete"
  // rows link here, so finishing later is the same flow, not a different one.
  const resumeId = useSearchParams().get('resume');

  const [stage, setStage] = useState<Stage>(resumeId ? 'configure' : 'source');
  const [seed, setSeed] = useState<RegistrationSeed | null>(null);
  const [assetId, setAssetId] = useState<string | null>(resumeId);
  const [batchLeft, setBatchLeft] = useState(0);

  const asset = assetId ? getAsset(assetId) : undefined;

  // ── Stage B commit ─────────────────────────────────────────────────────────
  const commit = (v: IdentifyValues) => {
    if (!seed) return;
    const id = mintAssetId(assets);
    const cls = classes.find((c) => c.id === v.classId);
    const category = (cls?.name ?? 'Compute') as AssetCategory;
    const tpl = getClassTemplate(v.classId);

    const loc = seed.locationId ? locationOptions().find((o) => o.id === seed.locationId) : undefined;

    const onboarding = newOnboarding(v.classId, seed.source, session.user.name);
    onboarding.attributes = v.attributes;
    onboarding.department = seed.department;
    onboarding.duplicateAck = v.duplicateAck;
    onboarding.locationConfirmed = Boolean(loc);
    onboarding.commercial = {
      ...onboarding.commercial,
      vendor: seed.vendor,
      poRef: seed.poRef,
      purchasePrice: seed.purchasePrice,
      purchaseDate: seed.purchaseDate,
      warrantyStart: seed.warrantyStart,
      warrantyEnd: seed.warrantyEnd,
    };

    // Adopting a ghost tag: the binding predates the asset, so it arrives bound
    // and already verified — the tag has been reading for days.
    if (seed.preboundTag) {
      const binding: TagBinding = {
        id: `TB-${id}-1`,
        tagId: seed.preboundTag.tagId,
        kind: seed.preboundTag.kind,
        role: roleForKind(seed.preboundTag.kind),
        state: 'Verified',
        boundAt: new Date(DEMO_NOW).toISOString(),
        verifiedAt: new Date(DEMO_NOW).toISOString(),
      };
      onboarding.bindings = [binding];
      onboarding.trackingIntent = 'bound';
    }

    const next: RegisteredAsset = {
      id,
      name: v.name,
      category,
      serialNumber: v.serialNumber || `INT-${id}`,
      status: 'Staging',
      healthScore: 100,
      healthStatus: 'Good',
      location: loc
        ? { id: loc.id, name: loc.facility, building: loc.building, zone: loc.zone }
        : { id: 'LOC-UNASSIGNED', name: UNASSIGNED_LOCATION },
      custodian: seed.custodian ?? '',
      purchaseDate: seed.purchaseDate ?? '',
      purchasePrice: seed.purchasePrice ?? 0,
      tags: [],
      manufacturer: v.manufacturer,
      model: v.model,
      criticality: v.criticality,
      riskScore: 0,
      utilization: 0,
      warrantyExpiry: seed.warrantyEnd,
      depreciationMethod: tpl.depreciationMethod,
      trackingId: seed.preboundTag?.tagId,
      trackingTech: seed.preboundTag ? seed.preboundTag.kind : undefined,
      lifecycleStage: 'Registration',
      onboarding,
    };

    register(next);
    setAssetId(id);
    setStage('configure');
    if (seed.quantity && seed.quantity > 1) setBatchLeft(seed.quantity - 1);

    toast({
      title: `${id} created`,
      description: `Draft asset · scan code ${shortIdFor(id)} · everything else is optional`,
      tone: 'success',
    });
  };

  const jumpTo = (card: string) => {
    document.getElementById(`ob-card-${card}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const registerAnother = () => {
    setAssetId(null);
    setStage('identify');
    setBatchLeft((n) => Math.max(0, n - 1));
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StageRail stage={stage} committed={Boolean(assetId)} />
        {asset && (
          <div className="flex items-center gap-2">
            <Badge tone={asset.onboarding.state === 'Active' ? 'emerald' : asset.onboarding.state === 'Pending Approval' ? 'amber' : 'slate'}>
              {asset.onboarding.state}
            </Badge>
            <Link href={`/assets/${asset.id}`} className="text-xs font-medium text-primary-600 hover:underline">
              {asset.id} — open Asset 360 →
            </Link>
          </div>
        )}
      </div>

      {stage === 'source' && (
        <SourcePicker
          assets={assets}
          onPick={(s) => { setSeed(s); setStage('identify'); }}
        />
      )}

      {stage === 'identify' && seed && (
        <IdentifyStep
          seed={seed}
          assets={assets}
          onBack={() => setStage('source')}
          onCommit={commit}
        />
      )}

      {stage === 'configure' && asset && (
        <ConfigureStage
          asset={asset}
          onJump={jumpTo}
          batchLeft={batchLeft}
          onRegisterAnother={registerAnother}
          onDone={() => router.push(`/assets/${asset.id}`)}
        />
      )}

      {stage === 'configure' && !asset && (
        <Note tone="red" icon="⚠️">That draft is no longer in this session. Start a new registration.</Note>
      )}
    </div>
  );
}

// ── Stage C + D ──────────────────────────────────────────────────────────────

function ConfigureStage({
  asset, onJump, batchLeft, onRegisterAnother, onDone,
}: {
  asset: RegisteredAsset;
  onJump: (card: string) => void;
  batchLeft: number;
  onRegisterAnother: () => void;
  onDone: () => void;
}) {
  const gates = evaluateGates(asset);

  return (
    <div className="space-y-6">
      <Note tone="emerald" icon="✅">
        <span className="font-semibold">{asset.id} is registered.</span> You can stop here — anything left is optional
        and will be waiting for you in the registry.
      </Note>

      <SetupChecklist
        asset={asset}
        onJump={onJump}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            {batchLeft > 0 && (
              <Button variant="outline" onClick={onRegisterAnother}>
                Register next unit ({batchLeft} left on this PO line)
              </Button>
            )}
          </div>
        }
      />

      {/* Monitoring and the maintenance plan are inherited from the class at
          commit, so there is no card for them — see newOnboarding(). */}
      <div id="ob-card-place"><PlaceCard asset={asset} gates={gates} step={1} /></div>
      <div id="ob-card-track"><TrackCard asset={asset} gates={gates} step={2} /></div>
      <div id="ob-card-commercial"><CommercialCard asset={asset} gates={gates} step={3} /></div>

      <ActivatePanel asset={asset} onDone={onDone} />
    </div>
  );
}
