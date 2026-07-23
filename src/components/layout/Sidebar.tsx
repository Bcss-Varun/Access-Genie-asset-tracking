'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/providers/SessionProvider';
import { navForSession } from '@/lib/nav-config';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'ag.collapsedNavGroups';

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar() {
  const pathname = usePathname();
  const { session } = useSession();
  const groups = navForSession(session);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setCollapsed(new Set(JSON.parse(saved)));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <aside className="w-64 h-full bg-white border-r border-slate-200 flex flex-col">
      {/* Brand — Access Genie logo */}
      <div className="p-3 border-b border-slate-200 shrink-0">
        <Link href="/" className="block" aria-label="Access Genie — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/access-genie-logo.png" alt="Access Genie" className="w-36 h-auto rounded-md" />
        </Link>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.id);
          return (
            <div key={group.id} className="pb-1">
              <button
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600"
                aria-expanded={!isCollapsed}
              >
                {group.label}
                <span className={cn('transition-transform text-slate-300', isCollapsed && '-rotate-90')}>▾</span>
              </button>
              {!isCollapsed && (
                <div className="mt-0.5 space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                          active
                            ? 'bg-primary-50 text-primary-700 font-semibold'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                        )}
                      >
                        <span
                          className={cn(
                            'h-5 w-5 flex items-center justify-center text-[13px] shrink-0',
                            item.comingSoon && !active && 'opacity-60',
                          )}
                        >
                          {item.icon}
                        </span>
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
