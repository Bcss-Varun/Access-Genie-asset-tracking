// ─────────────────────────────────────────────────────────────────────────────
// RegistryProvider — the asset registry, backed by the API.
//
// This is what makes "commit early, enrich forever" possible: an asset created
// at Stage B is a real object with an ID and a URL immediately, and every
// Configure card mutates it in place. It is persisted, so closing the tab loses
// nothing — the draft is waiting on its own Asset 360 page tomorrow, not just
// until the next reload.
//
// Writes are serialized per asset and published after the API accepts them.
// A failure keeps the last saved value and reports the error. Dataset queries
// are invalidated after each write so other screens see the saved asset too.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Asset, AssetOnboarding, RegisteredAsset, TagBinding } from '@access-genie/shared';
import { allAssets, allDocs, allSensors } from '@/lib/dataset';
import { getClassTemplate } from '@/lib/asset-classes';
import { roleForKind, trackingTechLabel } from '@/lib/onboarding';
import { nowMs } from '@/lib/utils';
import { assetsApi } from '@/api/assets';
import { useDataset, useRefreshDataset } from '@/api/dataset';
import { useToast } from './ToastProvider';

// ── Seeding ──────────────────────────────────────────────────────────────────

/**
 * Asset classes were removed, so a category no longer implies a class. Kept as
 * a named constant rather than deleted because `inferOnboarding` still has to
 * put *something* in `classId` for assets that predate the registration flow.
 */
const classIdForCategory = (): string => '';

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
      purchasePrice: asset.purchasePrice,
      warrantyStart: asset.purchaseDate,
      warrantyEnd: asset.warrantyExpiry,
      depreciationMethod: asset.depreciationMethod,
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
  patchAsset: (id: string, patch: Partial<Asset>) => Promise<boolean>;
  patchOnboarding: (id: string, patch: Partial<AssetOnboarding>) => Promise<boolean>;
  addBinding: (id: string, binding: TagBinding) => Promise<boolean>;
  verifyBinding: (id: string, bindingId: string) => Promise<boolean>;
  retireBinding: (id: string, bindingId: string) => Promise<boolean>;
  setState: (id: string, state: AssetOnboarding['state']) => Promise<boolean>;
  /** Void a mis-registration — soft, reversible, stream preserved. */
  voidAsset: (id: string) => Promise<boolean>;
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
  const currentAssets = useRef(assets);
  const pendingWrites = useRef(new Map<string, Promise<boolean>>());
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const refreshDataset = useRefreshDataset();
  const { toast } = useToast();

  /**
   * Re-seed from `@/lib/dataset` whenever the dataset query resolves with new
   * data — not just once at mount.
   *
   * Registration (`RegistrationForm`), the plain asset form and bulk import all
   * create assets by calling the API directly and then invalidating the
   * dataset query, rather than through `register()` below. Without this, this
   * provider's `assets` never learns about them: it was seeded once from
   * `allAssets` at mount and, being ordinary `useState`, does not notice that
   * the module-level binding was reassigned later — so a just-created asset's
   * own detail page (which reads `getAsset` from here) says "not found" until
   * a hard reload remounts the provider.
   */
  const { dataUpdatedAt } = useDataset();
  const syncedAt = useRef(dataUpdatedAt);
  useEffect(() => {
    if (dataUpdatedAt !== syncedAt.current) {
      syncedAt.current = dataUpdatedAt;
      const next = fromDataset();
      currentAssets.current = next;
      setAssets(next);
    }
  }, [dataUpdatedAt]);

  // Serialize edits to one asset. Compute outside React state updaters, which
  // can run later or more than once. Only publish changes the API has saved.
  const commit = useCallback(
    (id: string, fn: (a: RegisteredAsset) => RegisteredAsset, describe: string): Promise<boolean> => {
      const previousWrite = pendingWrites.current.get(id) ?? Promise.resolve(true);
      const write = previousWrite.then(async () => {
        const previous = currentAssets.current.find((a) => a.id === id);
        if (!previous) return false;
        const updated = fn(previous);
        const body = Object.fromEntries(Object.entries(updated).filter(([key, value]) =>
          !['id', 'createdAt', 'updatedAt'].includes(key) && value !== previous[key as keyof RegisteredAsset],
        ));
        try {
          const saved = await assetsApi.update(id, body);
          const stored = { ...saved, onboarding: (saved as RegisteredAsset).onboarding ?? updated.onboarding } as RegisteredAsset;
          currentAssets.current = currentAssets.current.map((a) => a.id === id ? stored : a);
          setAssets(currentAssets.current);
          await refreshDataset();
          return true;
        } catch (err) {
          toast({ title: `Could not ${describe}`, description: err instanceof Error ? err.message : 'Please retry.', tone: 'error' });
          return false;
        }
      });
      pendingWrites.current.set(id, write);
      void write.finally(() => { if (pendingWrites.current.get(id) === write) pendingWrites.current.delete(id); });
      return write;
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
            trackingTech: a.trackingTech ?? trackingTechLabel(binding.kind),
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
              trackingId: live.find((b) => b.role === 'identity')?.tagId ?? live[0]?.tagId ?? '',
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
