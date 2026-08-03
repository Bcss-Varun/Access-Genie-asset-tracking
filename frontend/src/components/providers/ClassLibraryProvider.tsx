// ─────────────────────────────────────────────────────────────────────────────
// ClassLibraryProvider — React state over the class library, backed by the API.
//
// Every mutation writes through to the module-level array as well as to the
// server, so the pure helpers in lib/ (evaluateGates, newOnboarding,
// getClassTemplate…) read the edited values on the very next render. Add a class
// in Administration and it is selectable in Add Asset immediately — no reload,
// no second source of truth.
//
// The optimistic write is the point: a class editor is a form with a dozen small
// controls, and a round trip per toggle would make it feel like a config file.
// A rejected write rolls back and says why.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { AssetCategory, AttributeDef } from '@access-genie/shared';
import {
  getLibrary, setLibrary, nextClassId, NEW_CLASS_DEFAULTS, type AssetClassDef,
} from '@/lib/class-library';
import { assetClassesApi } from '@/api/asset-classes';
import { useRefreshDataset } from '@/api/dataset';
import { useToast } from './ToastProvider';

interface ClassLibraryValue {
  classes: AssetClassDef[];
  getClass: (id: string) => AssetClassDef | undefined;
  /**
   * Create a class and resolve with the stored record — carrying the ID the
   * *server* minted, or null if it was refused.
   *
   * Async because the caller navigates to the new class's page: the client's
   * provisional ID (`CLS-COM` for "computer") is not the one the server stores
   * (`CLS-COMPUTER`), so navigating before the response landed you on "Class
   * not found" for a class that had just been created successfully.
   */
  createClass: (name: string, icon: string, category?: AssetCategory) => Promise<AssetClassDef | null>;
  updateClass: (id: string, patch: Partial<AssetClassDef>) => void;
  deleteClass: (id: string) => void;
  addAttribute: (id: string, attr: AttributeDef) => void;
  updateAttribute: (id: string, key: string, patch: Partial<AttributeDef>) => void;
  removeAttribute: (id: string, key: string) => void;
  moveAttribute: (id: string, key: string, direction: -1 | 1) => void;
}

const ClassLibraryContext = createContext<ClassLibraryValue | null>(null);

/** The fields the API accepts — `id` is assigned by the server, never sent back. */
function toBody(c: AssetClassDef): Record<string, unknown> {
  const { id: _id, custom: _custom, ...rest } = c;
  return { ...rest, monitoringProfileId: rest.monitoringProfileId ?? '', pmPlan: rest.pmPlan ?? '' };
}

export function ClassLibraryProvider({ children }: { children: React.ReactNode }) {
  const [classes, setClasses] = useState<AssetClassDef[]>(() => getLibrary());
  const refreshDataset = useRefreshDataset();
  const { toast } = useToast();

  /** Single write path — React state and the module array never diverge. */
  const commit = useCallback((next: AssetClassDef[]) => {
    setLibrary(next);
    setClasses(next);
  }, []);

  /** Apply locally, persist, and roll back if the server refuses. */
  const persist = useCallback(
    (id: string, next: AssetClassDef[], describe: string) => {
      const previous = getLibrary();
      commit(next);

      const updated = next.find((c) => c.id === id);
      if (!updated) return;

      assetClassesApi
        .update(id, toBody(updated))
        .then(() => refreshDataset())
        .catch((err: Error) => {
          commit(previous);
          toast({ title: `Could not ${describe}`, description: err.message, tone: 'error' });
        });
    },
    [commit, refreshDataset, toast],
  );

  const mutate = useCallback(
    (id: string, fn: (c: AssetClassDef) => AssetClassDef, describe: string) =>
      persist(id, getLibrary().map((c) => (c.id === id ? fn(c) : c)), describe),
    [persist],
  );

  const mutateAttrs = useCallback(
    (id: string, fn: (attrs: AttributeDef[]) => AttributeDef[], describe: string) =>
      mutate(id, (c) => ({ ...c, attributes: fn(c.attributes) }), describe),
    [mutate],
  );

  const value = useMemo<ClassLibraryValue>(
    () => ({
      classes,
      getClass: (id) => classes.find((c) => c.id === id),

      createClass: async (name, icon, category) => {
        const draft: AssetClassDef = {
          ...NEW_CLASS_DEFAULTS,
          id: nextClassId(name),
          name: name.trim(),
          icon: icon || '📦',
          // Every asset registered in the class inherits this as its reporting
          // category; it is never derived from the name.
          category: category ?? NEW_CLASS_DEFAULTS.category,
          attributes: [],
        };

        // Shown straight away, but the caller waits for the server's ID before
        // navigating — see the note on the interface.
        commit([...getLibrary(), draft]);

        try {
          const saved = await assetClassesApi.create(toBody(draft));
          const stored: AssetClassDef = { ...draft, id: saved.id };
          commit(getLibrary().map((c) => (c.id === draft.id ? stored : c)));
          await refreshDataset();
          return stored;
        } catch (err) {
          commit(getLibrary().filter((c) => c.id !== draft.id));
          toast({
            title: 'Could not create that class',
            description: err instanceof Error ? err.message : 'The request failed. Please try again.',
            tone: 'error',
          });
          return null;
        }
      },

      updateClass: (id, patch) => mutate(id, (c) => ({ ...c, ...patch }), 'save that class'),

      deleteClass: (id) => {
        const previous = getLibrary();
        commit(previous.filter((c) => c.id !== id));

        assetClassesApi
          .remove(id)
          .then(() => refreshDataset())
          .catch((err: Error) => {
            commit(previous);
            // The usual reason is that assets still belong to the class; the
            // API says how many, so show it rather than a generic failure.
            toast({ title: 'Could not delete that class', description: err.message, tone: 'error' });
          });
      },

      addAttribute: (id, attr) => mutateAttrs(id, (attrs) => [...attrs, attr], 'add that field'),

      updateAttribute: (id, key, patch) =>
        mutateAttrs(id, (attrs) => attrs.map((a) => (a.key === key ? { ...a, ...patch } : a)), 'save that field'),

      removeAttribute: (id, key) =>
        mutateAttrs(id, (attrs) => attrs.filter((a) => a.key !== key), 'remove that field'),

      moveAttribute: (id, key, direction) =>
        mutateAttrs(
          id,
          (attrs) => {
            const i = attrs.findIndex((a) => a.key === key);
            const j = i + direction;
            if (i < 0 || j < 0 || j >= attrs.length) return attrs;
            const next = [...attrs];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
          },
          'reorder those fields',
        ),
    }),
    [classes, commit, mutate, mutateAttrs, refreshDataset, toast],
  );

  return <ClassLibraryContext.Provider value={value}>{children}</ClassLibraryContext.Provider>;
}

export function useClassLibrary(): ClassLibraryValue {
  const ctx = useContext(ClassLibraryContext);
  if (!ctx) throw new Error('useClassLibrary must be used within <ClassLibraryProvider>');
  return ctx;
}
