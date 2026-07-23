'use client';

import { createContext, useContext, useState, useCallback } from 'react';

interface MobileNavValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

const MobileNavContext = createContext<MobileNavValue | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  return <MobileNavContext.Provider value={{ open, setOpen, toggle }}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav(): MobileNavValue {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error('useMobileNav must be used within <MobileNavProvider>');
  return ctx;
}
