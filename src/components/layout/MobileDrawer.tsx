'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useMobileNav } from '@/components/providers/MobileNavProvider';
import { Sidebar } from './Sidebar';

/** Slide-over sidebar for small screens (< md). */
export function MobileDrawer() {
  const { open, setOpen } = useMobileNav();
  const pathname = usePathname();

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <div className="absolute inset-0 bg-slate-900/40 animate-[fadeInFast_0.15s_ease-out]" onClick={() => setOpen(false)} />
      <div className="absolute inset-y-0 left-0 w-64 shadow-2xl animate-[fadeIn_0.18s_ease-out]">
        <Sidebar />
      </div>
    </div>
  );
}
