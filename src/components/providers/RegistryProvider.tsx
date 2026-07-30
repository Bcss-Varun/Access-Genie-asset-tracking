'use client';

// ─────────────────────────────────────────────────────────────────────────────
// RegistryProvider — the in-session asset registry.
//
// This is what makes "commit early, enrich forever" possible: an asset created
// at Stage B is a real object with an ID and a URL immediately, held here, and
// every Configure card mutates it in place. Closing the tab loses nothing
// (within the session) — the draft is waiting on its own Asset 360 page.
//
// Seeded from `mockAssets`; the demo never writes to the mock module itself.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { mockAssets, mockDocs, mockSensors, mockTaxonomy } from '@/lib/mock-data';
import { getClassTemplate } from '@/lib/asset-classes';
import { roleForKind } from '@/lib/onboarding';
import { DEMO_NOW } from '@/lib/utils';
import type { Asset } from '@/types/asset';
import type {
  AssetOnboarding, CommercialData, RegisteredAsset, TagBinding,
} from '@/types/onboarding';

// ── Seeding ──────────────────────────────────────────────────────────────────

const classIdForCategory = (category: Asset['category']): string =>
  mockTaxonomy.find((c) => c.name === category)?.id ?? '';

/** Department implied by the custodian — asked once, derived thereafter. */
function departmentFor(custodian: string): string {
  if (/network/i.test(custodian)) return 'Network Engineering';
  if (/storage/i.test(custodian)) return 'Infrastructure';
  if (/design/i.test(custodian)) return 'Design';
  if (/field|ops/i.test(custodian)) return 'IT Operations';
  if (/security/i.test(custodian)) return 'Security';
  return 'IT Operations';
}

/**
 * Rebuild an onboarding record for a pre-existing mock asset. Tracking is seeded
 * *honestly* from the sensor estate — assets nobody tagged stay untracked, which
 * is what feeds the registry's exception views.
 */
function seedOnboarding(asset: Asset): AssetOnboarding {
  const classId = classIdForCategory(asset.category);
  const tpl = getClassTemplate(classId);

  const bindings: TagBinding[] = mockSensors
    .filter((s) => s.assetId === asset.id && s.tagId)
    .map((s, i) => ({
      id: `TB-${asset.id}-${i + 1}`,
      tagId: s.tagId!,
      kind: s.kind,
      role: roleForKind(s.kind),
      // A device that is offline has stopped being heard — it reverts to Bound.
      state: s.status === 'Offline' ? 'Bound' : 'Verified',
      boundAt: asset.purchaseDate,
      verifiedAt: s.status === 'Offline' ? undefined : s.lastReading,
    }));

  const commercial: CommercialData = {
    ownership: 'Owned',
    purchaseDate: asset.purchaseDate,
    commissionDate: asset.purchaseDate,
    purchasePrice: asset.purchasePrice,
    vendor: asset.manufacturer ? `${asset.manufacturer} India Pvt Ltd` : 'Redington India Ltd',
    warrantyStart: asset.purchaseDate,
    warrantyEnd: asset.warrantyExpiry,
    depreciationMethod: asset.depreciationMethod ?? tpl.depreciationMethod,
    usefulLifeYears: tpl.usefulLifeYears,
  };

  return {
    state: 'Active',
    source: 'blank',
    classId,
    registeredAt: asset.purchaseDate,
    registeredBy: 'Data migration',
    activatedAt: asset.purchaseDate,
    attributes: {},
    department: departmentFor(asset.custodian),
    locationConfirmed: true,
    trackingIntent: bindings.length ? 'bound' : tpl.trackingExpected ? 'pending' : 'not-tracked',
    bindings,
    monitoringProfileId: tpl.monitoringProfileId,
    monitoringDecided: true,
    monitoringOverridden: false,
    maintenancePlan: tpl.pmPlan ? 'class-default' : 'run-to-failure',
    commercial,
    documents: mockDocs
      .filter((d) => d.assetId === asset.id)
      .map((d) => ({ id: d.id, name: d.name, type: d.type, sizeKb: d.sizeKb, addedAt: d.uploadedAt })),
  };
}

const seed = (): RegisteredAsset[] =>
  mockAssets.map((a) => ({ ...a, onboarding: seedOnboarding(a) }));

// ── Context ──────────────────────────────────────────────────────────────────

interface RegistryValue {
  assets: RegisteredAsset[];
  getAsset: (id: string) => RegisteredAsset | undefined;
  /** Stage B commit — the asset becomes real here. */
  register: (asset: RegisteredAsset) => void;
  patchAsset: (id: string, patch: Partial<Asset>) => void;
  patchOnboarding: (id: string, patch: Partial<AssetOnboarding>) => void;
  addBinding: (id: string, binding: TagBinding) => void;
  verifyBinding: (id: string, bindingId: string) => void;
  retireBinding: (id: string, bindingId: string) => void;
  setState: (id: string, state: AssetOnboarding['state']) => void;
  /** Void a mis-registration — soft, reversible, stream preserved. */
  voidAsset: (id: string) => void;
  /** Assets created in this session (used to badge the registry). */
  sessionIds: string[];
}

const RegistryContext = createContext<RegistryValue | null>(null);

export function RegistryProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<RegisteredAsset[]>(seed);
  const [sessionIds, setSessionIds] = useState<string[]>([]);

  const mutate = useCallback(
    (id: string, fn: (a: RegisteredAsset) => RegisteredAsset) =>
      setAssets((list) => list.map((a) => (a.id === id ? fn(a) : a))),
    [],
  );

  const patchOnboarding = useCallback(
    (id: string, patch: Partial<AssetOnboarding>) =>
      mutate(id, (a) => ({ ...a, onboarding: { ...a.onboarding, ...patch } })),
    [mutate],
  );

  const value = useMemo<RegistryValue>(
    () => ({
      assets,
      sessionIds,
      getAsset: (id) => assets.find((a) => a.id === id),

      register: (asset) => {
        setAssets((list) => [asset, ...list]);
        setSessionIds((ids) => [asset.id, ...ids]);
      },

      patchAsset: (id, patch) => mutate(id, (a) => ({ ...a, ...patch })),
      patchOnboarding,

      addBinding: (id, binding) =>
        mutate(id, (a) => ({
          ...a,
          // The identity binding is what the registry and scan-to-open show.
          trackingId: binding.role === 'identity' || !a.trackingId ? binding.tagId : a.trackingId,
          onboarding: {
            ...a.onboarding,
            trackingIntent: 'bound',
            bindings: [...a.onboarding.bindings, binding],
          },
        })),

      verifyBinding: (id, bindingId) =>
        mutate(id, (a) => ({
          ...a,
          onboarding: {
            ...a.onboarding,
            bindings: a.onboarding.bindings.map((b) =>
              b.id === bindingId
                ? { ...b, state: 'Verified', verifiedAt: new Date(DEMO_NOW).toISOString() }
                : b,
            ),
          },
        })),

      retireBinding: (id, bindingId) =>
        mutate(id, (a) => {
          // Retired bindings are kept, never deleted — the trail has to survive
          // a tag swap (docs/21 S7).
          const bindings = a.onboarding.bindings.map((b) =>
            b.id === bindingId ? { ...b, retiredAt: new Date(DEMO_NOW).toISOString() } : b,
          );
          const live = bindings.filter((b) => !b.retiredAt);
          return {
            ...a,
            onboarding: {
              ...a.onboarding,
              bindings,
              trackingIntent: live.length ? 'bound' : 'pending',
            },
          };
        }),

      setState: (id, state) =>
        mutate(id, (a) => ({
          ...a,
          status: state === 'Active' ? 'Active' : a.status,
          lifecycleStage: state === 'Active' ? 'In Service' : 'Registration',
          onboarding: {
            ...a.onboarding,
            state,
            activatedAt: state === 'Active' ? new Date(DEMO_NOW).toISOString() : a.onboarding.activatedAt,
          },
        })),

      voidAsset: (id) => patchOnboarding(id, { voidedAt: new Date(DEMO_NOW).toISOString() }),
    }),
    [assets, sessionIds, mutate, patchOnboarding],
  );

  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
}

export function useRegistry(): RegistryValue {
  const ctx = useContext(RegistryContext);
  if (!ctx) throw new Error('useRegistry must be used within <RegistryProvider>');
  return ctx;
}
