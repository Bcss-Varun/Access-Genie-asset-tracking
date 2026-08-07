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
import { Link } from 'react-router-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRegistry } from '@/components/providers/RegistryProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/api/auth';
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
  shortIdFor, trackingTechLabel, UNASSIGNED_LOCATION,
} from '@/lib/onboarding';
import { getClassTemplate } from '@/lib/asset-classes';
import { useClassLibrary } from '@/components/providers/ClassLibraryProvider';
import { cn, nowMs } from '@/lib/utils';
import type { AssetCategory } from '@access-genie/shared';
import type { RegisteredAsset, RegistrationSeed, TagBinding } from '@access-genie/shared';

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
  const navigate = useNavigate();
  const { assets, getAsset, register, deleteAsset } = useRegistry();
  const { classes } = useClassLibrary();
  const { session } = useSession();
  const { toast } = useToast();
  // `DELETE /assets/:id` is narrower than the `assets` grant this flow runs
  // under, so the action is hidden rather than offered and then refused.
  const canDelete = useAuth().can('admin');

  // Resume a draft straight into Configure — the registry's "Setup incomplete"
  // rows link here, so finishing later is the same flow, not a different one.
  const resumeId = useSearchParams()[0].get('resume');

  const [stage, setStage] = useState<Stage>(resumeId ? 'configure' : 'source');
  const [seed, setSeed] = useState<RegistrationSeed | null>(null);
  const [assetId, setAssetId] = useState<string | null>(resumeId);
  const [batchLeft, setBatchLeft] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [committing, setCommitting] = useState(false);

  const asset = assetId ? getAsset(assetId) : undefined;

  // ── Stage B commit ─────────────────────────────────────────────────────────
  const commit = async (v: IdentifyValues) => {
    if (!seed || committing) return;
    // Provisional only — the record is built around it, but the server mints
    // the ID that is actually stored and `register` hands that one back.
    const id = mintAssetId(assets);
    const cls = classes.find((c) => c.id === v.classId);
    /*
     * The category comes from the class's own `category` field, not from its
     * name.
     *
     * This used to be `cls.name as AssetCategory` — a cast that asserted
     * something untrue. Class names are free text; `Asset.category` is a closed
     * enum of five reporting buckets. It held only because the seeded classes
     * were named exactly after them, so the first class anyone created with a
     * name of their own ("computer") made every registration in it fail
     * server-side validation with no way to fix it from the flow.
     */
    const category: AssetCategory = cls?.category ?? 'Compute';
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
        boundAt: new Date(nowMs()).toISOString(),
        verifiedAt: new Date(nowMs()).toISOString(),
      };
      onboarding.bindings = [binding];
      onboarding.trackingIntent = 'bound';
    }

    const next: RegisteredAsset = {
      id,
      name: v.name,
      category,
      /*
       * No serial means no serial.
       *
       * This used to fall back to `INT-${id}`, which was wrong twice over: it
       * fabricated an identifier that reads like a manufacturer serial, and it
       * built it from the *provisional* id, which `register` discards before
       * saving — so the value did not even match the asset that ended up
       * holding it. Worse, `mintAssetId` floors at 1000, so every serial-less
       * registration produced the identical string and the second one was
       * refused by the unique index.
       */
      serialNumber: v.serialNumber,
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
      trackingTech: seed.preboundTag ? trackingTechLabel(seed.preboundTag.kind) : undefined,
      lifecycleStage: 'Registration',
      // Stamped here so the draft is a complete record from the moment it
      // exists; the API restamps both when it is persisted.
      createdAt: new Date(nowMs()).toISOString(),
      updatedAt: new Date(nowMs()).toISOString(),
      onboarding,
    };

    // Advance only once the asset genuinely exists. Moving to Configure first
    // and rolling back on failure is what produced the "that draft is no longer
    // in this session" dead end: the stage had already changed, and the asset it
    // was configuring had just been removed again.
    setCommitting(true);
    const stored = await register(next);
    setCommitting(false);
    if (!stored) return; // `register` has already explained why.

    setAssetId(stored.id);
    setStage('configure');
    if (seed.quantity && seed.quantity > 1) setBatchLeft(seed.quantity - 1);

    toast({
      title: `${stored.id} created`,
      description: `Draft asset · scan code ${shortIdFor(stored.id)} · everything else is optional`,
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

  /** Back to a clean Stage A, dropping whatever the flow was holding. */
  const startOver = () => {
    setAssetId(null);
    setSeed(null);
    setStage('source');
    setBatchLeft(0);
  };

  /**
   * Discard the asset committed at Stage B.
   *
   * The flow commits early on purpose — the asset is real from Identify onward,
   * before anything optional is filled in — and the cost of that is that a
   * mis-typed serial or a wrong class is already a row in the registry. This is
   * the way back out of it, and it belongs here rather than only on Asset 360:
   * the moment you notice is while you are still standing in the flow.
   */
  const discard = async () => {
    if (!asset) return;
    setDeleting(true);
    const gone = await deleteAsset(asset.id);
    setDeleting(false);
    if (!gone) return;

    // Reset before anything else can render: while `assetId` still points at a
    // deleted asset the flow is in the "draft is gone" state, and the dataset
    // refetch inside `deleteAsset` is long enough for that to be visible.
    startOver();
    setConfirmDelete(false);
    toast({ title: `${asset.id} deleted`, description: 'The draft was removed from the registry.', tone: 'success' });
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
            <Link to={`/assets/${asset.id}`} className="text-xs font-medium text-primary-600 hover:underline">
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
          onCommit={(v) => void commit(v)}
          committing={committing}
        />
      )}

      {stage === 'configure' && asset && (
        <ConfigureStage
          asset={asset}
          onJump={jumpTo}
          batchLeft={batchLeft}
          onRegisterAnother={registerAnother}
          onDelete={canDelete ? () => setConfirmDelete(true) : undefined}
          onDone={() => navigate(`/assets/${asset.id}`)}
        />
      )}

      {/*
        Reachable whenever the asset behind the stage has gone: a `?resume=` for
        a draft that was since deleted, or one removed from another tab. It used
        to be a bare sentence telling you to start a new registration without
        giving you any way to do so — so it says the same thing and now offers
        the button.
      */}
      {stage === 'configure' && !asset && (
        <div className="space-y-3">
          <Note tone="red" icon="⚠️">
            That draft is no longer in this session — it may have been deleted, or registered from another tab.
          </Note>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={startOver}>Start a new registration</Button>
            <Link to="/assets" className="text-xs font-medium text-primary-600 hover:underline">
              Open the asset registry instead →
            </Link>
          </div>
        </div>
      )}

      {confirmDelete && asset && (
        <ConfirmDialog
          title={`Delete ${asset.id}?`}
          description={
            <>
              <span className="font-medium text-slate-700">{asset.name}</span> is removed from the registry along with
              its registration record and any tag bindings. This cannot be undone — if the asset is real and simply
              being taken out of service, retire it from Asset 360 instead.
            </>
          }
          confirmLabel="Delete asset"
          busy={deleting}
          onConfirm={() => void discard()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// ── Stage C + D ──────────────────────────────────────────────────────────────

function ConfigureStage({
  asset, onJump, batchLeft, onRegisterAnother, onDelete, onDone,
}: {
  asset: RegisteredAsset;
  onJump: (card: string) => void;
  batchLeft: number;
  onRegisterAnother: () => void;
  /** Omitted when the signed-in role cannot delete — the API requires `admin`. */
  onDelete?: () => void;
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
            {/* Pushed to the right and styled as a link rather than a button:
                it is the exit from a mistake, not a step in the flow. */}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-health-critical"
              >
                Registered this by mistake? Delete {asset.id}
              </button>
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
