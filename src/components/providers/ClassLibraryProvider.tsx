'use client';

// ─────────────────────────────────────────────────────────────────────────────
// ClassLibraryProvider — React state over the module-level class library.
//
// Every mutation writes through to the module array as well, so the pure
// helpers in lib/ (evaluateGates, newOnboarding, getClassTemplate…) read the
// edited values immediately. Add a class in Administration and it is selectable
// in Add Asset on the next render — no reload, no second source of truth.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  getLibrary, setLibrary, nextClassId, NEW_CLASS_DEFAULTS, type AssetClassDef,
} from '@/lib/class-library';
import type { AttributeDef } from '@/types/asset';

interface ClassLibraryValue {
  classes: AssetClassDef[];
  getClass: (id: string) => AssetClassDef | undefined;
  createClass: (name: string, icon: string) => AssetClassDef;
  updateClass: (id: string, patch: Partial<AssetClassDef>) => void;
  deleteClass: (id: string) => void;
  addAttribute: (id: string, attr: AttributeDef) => void;
  updateAttribute: (id: string, key: string, patch: Partial<AttributeDef>) => void;
  removeAttribute: (id: string, key: string) => void;
  moveAttribute: (id: string, key: string, direction: -1 | 1) => void;
}

const ClassLibraryContext = createContext<ClassLibraryValue | null>(null);

export function ClassLibraryProvider({ children }: { children: React.ReactNode }) {
  const [classes, setClasses] = useState<AssetClassDef[]>(() => getLibrary());

  /** Single write path — React state and the module array never diverge. */
  const commit = useCallback((next: AssetClassDef[]) => {
    setLibrary(next);
    setClasses(next);
  }, []);

  const mutate = useCallback(
    (id: string, fn: (c: AssetClassDef) => AssetClassDef) =>
      commit(getLibrary().map((c) => (c.id === id ? fn(c) : c))),
    [commit],
  );

  const mutateAttrs = useCallback(
    (id: string, fn: (attrs: AttributeDef[]) => AttributeDef[]) =>
      mutate(id, (c) => ({ ...c, attributes: fn(c.attributes) })),
    [mutate],
  );

  const value = useMemo<ClassLibraryValue>(
    () => ({
      classes,
      getClass: (id) => classes.find((c) => c.id === id),

      createClass: (name, icon) => {
        const created: AssetClassDef = {
          ...NEW_CLASS_DEFAULTS,
          id: nextClassId(name),
          name: name.trim(),
          icon: icon || '📦',
          attributes: [],
        };
        commit([...getLibrary(), created]);
        return created;
      },

      updateClass: (id, patch) => mutate(id, (c) => ({ ...c, ...patch })),

      deleteClass: (id) => commit(getLibrary().filter((c) => c.id !== id)),

      addAttribute: (id, attr) => mutateAttrs(id, (attrs) => [...attrs, attr]),

      updateAttribute: (id, key, patch) =>
        mutateAttrs(id, (attrs) => attrs.map((a) => (a.key === key ? { ...a, ...patch } : a))),

      removeAttribute: (id, key) => mutateAttrs(id, (attrs) => attrs.filter((a) => a.key !== key)),

      moveAttribute: (id, key, direction) =>
        mutateAttrs(id, (attrs) => {
          const i = attrs.findIndex((a) => a.key === key);
          const j = i + direction;
          if (i < 0 || j < 0 || j >= attrs.length) return attrs;
          const next = [...attrs];
          [next[i], next[j]] = [next[j], next[i]];
          return next;
        }),
    }),
    [classes, commit, mutate, mutateAttrs],
  );

  return <ClassLibraryContext.Provider value={value}>{children}</ClassLibraryContext.Provider>;
}

export function useClassLibrary(): ClassLibraryValue {
  const ctx = useContext(ClassLibraryContext);
  if (!ctx) throw new Error('useClassLibrary must be used within <ClassLibraryProvider>');
  return ctx;
}
