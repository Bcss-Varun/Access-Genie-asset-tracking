'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/providers/SessionProvider';
import { navForSession } from '@/lib/nav-config';
import { cn } from '@/lib/utils';
import type { NavGroup } from '@/types/platform';

function matches(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

/**
 * Only the MOST SPECIFIC destination lights up.
 *
 * Prefix matching alone lit two rows at once: on `/assets/new`, both
 * `/assets` (Asset Registry) and `/assets/new` (Add Asset) matched. Resolving
 * the longest match — globally, not per section — means the child wins where a
 * child exists, the parent still wins for its own detail pages
 * (`/assets/AST-1001` → Registry), and a route claimed by another section
 * (`/assets/labels` → Tracking) no longer highlights two sections at once.
 */
function bestMatch(pathname: string, sections: NavGroup[]): string | null {
  const hrefs: string[] = [];
  for (const s of sections) {
    hrefs.push(s.href);
    for (const i of s.items) hrefs.push(i.href);
  }
  let best: string | null = null;
  for (const href of hrefs) {
    if (matches(pathname, href) && (best === null || href.length > best.length)) best = href;
  }
  return best;
}

/** A section owns the route when it, or one of its sub-pages, is the best match. */
function ownsRoute(section: NavGroup, best: string | null): boolean {
  return best !== null && (section.href === best || section.items.some((i) => i.href === best));
}

export function Sidebar() {
  const pathname = usePathname();
  const { session } = useSession();
  const sections = navForSession(session);

  // `null` = follow the route (the active section unfolds). A manual toggle pins
  // one section open ('' pins everything shut); navigating hands control back.
  const [pinned, setPinned] = useState<string | null>(null);
  useEffect(() => setPinned(null), [pathname]);

  const best = bestMatch(pathname, sections);
  const activeId = sections.find((s) => ownsRoute(s, best))?.id ?? null;
  const openId = pinned ?? activeId;

  return (
    <aside className="w-64 h-full bg-white border-r border-slate-200 flex flex-col">
      {/* Brand — Access Genie logo */}
      <div className="p-3 border-b border-slate-200 shrink-0">
        <Link href="/" className="block" aria-label="Access Genie — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/access-genie-logo.png" alt="Access Genie" className="w-36 h-auto rounded-md" />
        </Link>
      </div>

      {/* Main sections — six capability pillars first, supporting sections after */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5" aria-label="Main">
        {sections.map((section) => {
          const owns = section.id === activeId;
          const open = section.id === openId;
          const hasChildren = section.items.length > 0;
          return (
            <div key={section.id}>
              <div
                className={cn(
                  'group flex items-center rounded-lg transition-colors',
                  owns ? 'bg-primary-50' : 'hover:bg-slate-100',
                )}
              >
                <Link
                  href={section.href}
                  title={section.fullLabel ?? section.label}
                  aria-current={section.href === best ? 'page' : undefined}
                  className={cn(
                    'flex flex-1 min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm',
                    owns ? 'text-primary-700 font-semibold' : 'text-slate-600 group-hover:text-slate-900',
                  )}
                >
                  <span className="h-5 w-5 flex items-center justify-center text-[13px] shrink-0">{section.icon}</span>
                  <span className="truncate flex-1">{section.label}</span>
                  {typeof section.badge === 'number' && section.badge > 0 && (
                    <span className="text-[10px] font-semibold text-white bg-health-critical rounded-full px-1.5 py-0.5 leading-none">
                      {section.badge}
                    </span>
                  )}
                </Link>
                {hasChildren && (
                  <button
                    type="button"
                    onClick={() => setPinned(open ? '' : section.id)}
                    aria-expanded={open}
                    aria-label={`${open ? 'Hide' : 'Show'} ${section.label} pages`}
                    className={cn(
                      'shrink-0 px-2 py-2 text-slate-300 hover:text-slate-600 transition-transform',
                      !open && '-rotate-90',
                    )}
                  >
                    ▾
                  </button>
                )}
              </div>

              {/* Sub-pages — only for the section you're in (or one you pinned open) */}
              {open && hasChildren && (
                <div className="ml-5 mt-0.5 mb-1 pl-3 border-l border-slate-200 space-y-0.5">
                  {section.items.map((item) => {
                    const active = item.href === best;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                          active
                            ? 'text-primary-700 font-semibold bg-primary-50/70'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                        )}
                      >
                        <span className="truncate flex-1">{item.label}</span>
                        {item.comingSoon && (
                          <span className="text-[9px] uppercase tracking-wide text-slate-300 font-semibold">soon</span>
                        )}
                        {typeof item.badge === 'number' && item.badge > 0 && (
                          <span className="text-[10px] font-semibold text-white bg-health-critical rounded-full px-1.5 py-0.5 leading-none">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer — role hint + Blue Cloud Softech logo */}
      <div className="border-t border-slate-200 shrink-0 px-4 py-3 space-y-3">
        <p className="text-[11px] text-slate-400">
          Viewing as <span className="font-semibold text-slate-600">{session.role.name}</span>
        </p>
        <div className="pt-3 border-t border-slate-100">
          <p className="text-[9px] uppercase tracking-wider text-slate-300 font-semibold mb-1.5">Powered by</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bcss-logo.png" alt="Blue Cloud Softech Solutions Ltd." className="w-full h-auto max-w-[172px]" />
        </div>
      </div>
    </aside>
  );
}
