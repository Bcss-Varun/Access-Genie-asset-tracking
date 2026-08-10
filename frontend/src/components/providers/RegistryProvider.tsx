// ─────────────────────────────────────────────────────────────────────────────
// RegistryProvider — the asset registry, backed by the API.
//
// This is what makes "commit early, enrich forever" possible: an asset created
// at Stage B is a real object with an ID and a URL immediately, and every
// Configure card mutates it in place. It is persisted, so closing the tab loses
// nothing — the draft is waiting on its own Asset 360 page tomorrow, not just
// until the next reload.
//
// Writes are optimistic. A registration flow is a sequence of small edits and a
// round trip between each one would make the whole thing feel like filing a
// form; instead the local copy updates immediately, the request goes out, and a
// failure rolls the change back and says so. The dataset query is invalidated
// after each write so every other screen sees the same asset.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Asset, AssetOnboarding, RegisteredAsset, TagBinding } from '@access-genie/shared';
import { allAssets, allDocs, allSensors } from '@/lib/dataset';
import { getClassTemplate } from '@/lib/asset-classes';
import { roleForKind } from '@/lib/onboarding';
import { nowMs } from '@/lib/utils';
import { assetsApi } from '@/api/assets';
import { useRefreshDataset } from '@/api/dataset';
import { useToast } from './ToastProvider';

// ── Seeding ──────────────────────────────────────────────────────────────────

/**
 * Asset classes were removed, so a category no longer implies a class. Kept as
 * a named constant rather than deleted because `inferOnboarding` still has to
 * put *something* in `classId` for assets that predate the registration flow.
 */
const classIdForCategory = (): string => '';

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
 * Reconstruct a registration record for an asset that predates the flow.
 *
 * Assets migrated in from a spreadsheet have no onboarding record of their own,
 * so one is inferred. Tracking is inferred *honestly* from the device estate —
 * an asset nobody tagged stays untracked, which is exactly what feeds the
 * registry's exception views.
 */
function inferOnboarding(asset: Asset): AssetOnboarding {
  const classId = classIdForCategory();
  const tpl = getClassTemplate(classId);

  const bindings: TagBinding[] = allSensors
    .filter((s) => s.assetId === asset.id && s.tagId)
    .map((s, i) => ({
      id: `TB-${asset.id}-${i + 1}`,
      tagId: s.tagId!,
      kind: s.kind,
      role: roleForKind(s.kind),
      // A device that has gone offline has stopped being heard, so the binding
      // reverts from Verified to merely Bound.
      state: s.status === 'Offline' ? 'Bound' : 'Verified',
      boundAt: asset.purchaseDate,
      verifiedAt: s.status === 'Offline' ? undefined : s.lastReading,
    }));

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
    commercial: {
      ownership: 'Owned',
      purchaseDate: asset.purchaseDate,
      commissionDate: asset.purchaseDate,
      purchasePrice: asset.purchasePrice,
      vendor: asset.manufacturer ? `${asset.manufacturer} India Pvt Ltd` : 'Redington India Ltd',
      warrantyStart: asset.purchaseDate,
      warrantyEnd: asset.warrantyExpiry,
      depreciationMethod: asset.depreciationMethod ?? tpl.depreciationMethod,
      usefulLifeYears: tpl.usefulLifeYears,
    },
    documents: allDocs
      .filter((d) => d.assetId === asset.id)
      .map((d) => ({ id: d.id, name: d.name, type: d.type, sizeKb: d.sizeKb, addedAt: d.uploadedAt })),
  };
}

/** The registry as the screens see it: every asset carrying its registration record. */
const fromDataset = (): RegisteredAsset[] =>
  allAssets.map((a) => ({
    ...a,
    onboarding: (a as RegisteredAsset).onboarding ?? inferOnboarding(a),
  }));

// ── Context ──────────────────────────────────────────────────────────────────

interface RegistryValue {
  assets: RegisteredAsset[];
  getAsset: (id: string) => RegisteredAsset | undefined;
  /**
   * Stage B commit — the asset becomes real here.
   *
   * Resolves with the stored asset, carrying the ID the *server* minted, or
   * null if the write was refused. The caller must use the returned record
   * rather than the one it passed in: the ID it arrives with is the one on the
   * label, in the URL and behind the scan code.
   */
  register: (asset: RegisteredAsset) => Promise<RegisteredAsset | null>;
  patchAsset: (id: string, patch: Partial<Asset>) => void;
  patchOnboarding: (id: string, patch: Partial<AssetOnboarding>) => void;
  addBinding: (id: string, binding: TagBinding) => void;
  verifyBinding: (id: string, bindingId: string) => void;
  retireBinding: (id: string, bindingId: string) => void;
  setState: (id: string, state: AssetOnboarding['state']) => void;
  /** Void a mis-registration — soft, reversible, stream preserved. */
  voidAsset: (id: string) => void;
  /**
   * Delete a mis-registration outright.
   *
   * Distinct from `voidAsset`, and the difference is the point: voiding keeps
   * the record and its history, which is what you want for an asset that
   * existed and no longer should. This removes it, which is what you want for
   * one that should never have been created — a typo during registration, a
   * duplicate row in an import, a test record.
   *
   * Resolves `true` when the server accepted it. The API refuses an asset with
   * open work orders and requires the `admin` grant, so the caller has to be
   * able to tell the difference between "gone" and "refused".
   */
  deleteAsset: (id: string) => Promise<boolean>;
  /** Assets created in this session — used to badge the registry. */
  sessionIds: string[];
}

const RegistryContext = createContext<RegistryValue | null>(null);

export function RegistryProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<RegisteredAsset[]>(fromDataset);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const refreshDataset = useRefreshDataset();
  const { toast } = useToast();

  /**
   * Apply an edit locally, then persist it.
   *
   * On failure the previous value is restored, so the screen never keeps
   * showing an edit the server rejected.
   */
  const commit = useCallback(
    (id: string, fn: (a: RegisteredAsset) => RegisteredAsset, describe: string) => {
      let previous: RegisteredAsset | undefined;
      let updated: RegisteredAsset | undefined;

      setAssets((list) =>
        list.map((a) => {
          if (a.id !== id) return a;
          previous = a;
          updated = fn(a);
          return updated;
        }),
      );

      if (!updated) return;
      const { id: _id, createdAt: _c, updatedAt: _u, ...body } = updated;

      assetsApi
        .update(id, body as Record<string, unknown>)
        .then(() => refreshDataset())
        .catch((err: Error) => {
          setAssets((list) => list.map((a) => (a.id === id && previous ? previous : a)));
          toast({ title: `Could not ${describe}`, description: err.message, tone: 'error' });
        });
    },
    [refreshDataset, toast],
  );

  const patchOnboarding = useCallback(
    (id: string, patch: Partial<AssetOnboarding>) =>
      commit(id, (a) => ({ ...a, onboarding: { ...a.onboarding, ...patch } }), 'save that change'),
    [commit],
  );

  const value = useMemo<RegistryValue>(
    () => ({
      assets,
      sessionIds,
      getAsset: (id) => assets.find((a) => a.id === id),

      register: async (asset) => {
        /*
         * The ID is minted by the server, not here.
         *
         * The caller arrives with a locally-minted `AST-…` — good enough to
         * build the record around, but not to persist. It is derived from this
         * provider's copy of the registry, which is seeded once at mount and
         * drifts from the database the moment anything is created elsewhere: a
         * bulk import, another tab, another user. Two clients can then mint the
         * same number, and the second one is refused with "already exists".
         *
         * `nextId` on the server is an atomic counter and cannot collide, so
         * the id is omitted from the body and taken from the response.
         *
         * This one write is therefore not optimistic, unlike every edit that
         * follows it. That is deliberate: the ID is shown immediately, printed
         * on a label and encoded into the scan code, so showing a provisional
         * one that changes a moment later is worse than waiting for the real
         * one — and a registration that silently failed used to strand the
         * flow on a stage whose asset no longer existed.
         */
        const { id: _id, createdAt: _c, updatedAt: _u, ...body } = asset;

        try {
          const created = await assetsApi.create(body as Record<string, unknown>);
          // The server echoes the whole record; `onboarding` is kept from the
          // local copy as a fallback for an API that trims it from the response.
          const stored: RegisteredAsset = {
            ...(created as RegisteredAsset),
            onboarding: (created as RegisteredAsset).onboarding ?? asset.onboarding,
          };

          setAssets((list) => [stored, ...list]);
          setSessionIds((ids) => [stored.id, ...ids]);
          await refreshDataset();
          return stored;
        } catch (err) {
          toast({
            title: 'Could not register that asset',
            description: err instanceof Error ? err.message : 'The request failed. Please try again.',
            tone: 'error',
          });
          return null;
        }
      },

      patchAsset: (id, patch) => commit(id, (a) => ({ ...a, ...patch }), 'save that change'),
      patchOnboarding,

      addBinding: (id, binding) =>
        commit(
          id,
          (a) => ({
            ...a,
            // The identity binding is what the registry and scan-to-open show.
            trackingId: binding.role === 'identity' || !a.trackingId ? binding.tagId : a.trackingId,
            onboarding: {
              ...a.onboarding,
              trackingIntent: 'bound',
              bindings: [...a.onboarding.bindings, binding],
            },
          }),
          'bind that tag',
        ),

      verifyBinding: (id, bindingId) =>
        commit(
          id,
          (a) => ({
            ...a,
            onboarding: {
              ...a.onboarding,
              bindings: a.onboarding.bindings.map((b) =>
                b.id === bindingId ? { ...b, state: 'Verified', verifiedAt: new Date(nowMs()).toISOString() } : b,
              ),
            },
          }),
          'verify that tag',
        ),

      retireBinding: (id, bindingId) =>
        commit(
          id,
          (a) => {
            // Retired bindings are kept, never deleted — the trail has to
            // survive a tag swap (docs/21 S7).
            const bindings = a.onboarding.bindings.map((b) =>
              b.id === bindingId ? { ...b, retiredAt: new Date(nowMs()).toISOString() } : b,
            );
            const live = bindings.filter((b) => !b.retiredAt);
            return {
              ...a,
              onboarding: { ...a.onboarding, bindings, trackingIntent: live.length ? 'bound' : 'pending' },
            };
          },
          'retire that tag',
        ),

      setState: (id, state) =>
        commit(
          id,
          (a) => ({
            ...a,
            status: state === 'Active' ? 'Active' : a.status,
            // `lifecycleStage` is not set here — it is governed by the
            // lifecycle workflow (`services/lifecycle.service.ts`), not by
            // onboarding activation, and is silently ignored by the update
            // API if sent. Activation still moves `status`; the asset's
            // stage was already set to `Commissioning` on registration and
            // advances from there through Change Stage / automations.
            onboarding: {
              ...a.onboarding,
              state,
              activatedAt: state === 'Active' ? new Date(nowMs()).toISOString() : a.onboarding.activatedAt,
            },
          }),
          'activate that asset',
        ),

      voidAsset: (id) => patchOnboarding(id, { voidedAt: new Date(nowMs()).toISOString() }),

      deleteAsset: async (id) => {
        // Pessimistic, unlike every other write here. The rest of this provider
        // is optimistic because an edit that fails can be rolled back into a row
        // that is still on screen; a row removed optimistically and then
        // restored reads as a glitch, and the two refusals the API can give —
        // open work orders, missing `admin` grant — are both common enough to
        // be worth waiting the round trip to rule out.
        try {
          await assetsApi.remove(id);
        } catch (err) {
          toast({
            title: 'Could not delete that asset',
            description: err instanceof Error ? err.message : 'The request failed. Please try again.',
            tone: 'error',
          });
          return false;
        }

        setAssets((list) => list.filter((a) => a.id !== id));
        setSessionIds((ids) => ids.filter((i) => i !== id));
        await refreshDataset();
        return true;
      },
    }),
    [assets, sessionIds, commit, patchOnboarding, refreshDataset, toast],
  );

  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
}

export function useRegistry(): RegistryValue {
  const ctx = useContext(RegistryContext);
  if (!ctx) throw new Error('useRegistry must be used within <RegistryProvider>');
  return ctx;
}
