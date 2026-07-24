import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/features/auth/AuthProvider';
import { alertsApi } from '@/features/alerts/alerts-api';
import { navForModules, type NavSection } from '@/lib/nav-config';
import { cn } from '@/lib/format';

function isActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** A section owns the route if its hub or any of its sub-pages matches. */
function ownsRoute(pathname: string, section: NavSection): boolean {
  return isActive(pathname, section.to) || section.items.some((item) => isActive(pathname, item.to));
}

export function Sidebar() {
  const { pathname } = useLocation();
  const session = useSession();
  const sections = navForModules(session.modules);

  // Live open-alert count on the Security & Compliance row.
  const { data: alertStats } = useQuery({
    queryKey: ['alerts', 'stats'],
    queryFn: alertsApi.stats,
    enabled: session.modules.includes('alerts') || session.modules.includes('compliance'),
    staleTime: 60_000,
  });

  // `null` = follow the route (the active section unfolds). A manual toggle
  // pins one section open ('' pins them all shut); navigating hands control back.
  const [pinned, setPinned] = useState<string | null>(null);
  useEffect(() => setPinned(null), [pathname]);

  const activeId = sections.find((section) => ownsRoute(pathname, section))?.id ?? null;
  const openId = pinned ?? activeId;

  return (
    <aside className="w-64 h-full bg-white border-r border-slate-200 flex flex-col">
      {/* Brand */}
      <div className="p-3 border-b border-slate-200 shrink-0">
        <Link to="/" className="block" aria-label="Access Genie — home">
          <img src="/access-genie-logo.png" alt="Access Genie" className="w-36 h-auto rounded-md" />
        </Link>
      </div>

      {/* Main sections — six capability pillars first, supporting ones after */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5" aria-label="Main">
        {sections.map((section) => {
          const owns = section.id === activeId;
          const open = section.id === openId;
          const badge = section.id === 'compliance' ? alertStats?.open : undefined;

          return (
            <div key={section.id}>
              <div className={cn('group flex items-center rounded-lg transition-colors', owns ? 'bg-primary-50' : 'hover:bg-slate-100')}>
                <Link
                  to={section.to}
                  title={section.fullLabel ?? section.label}
                  aria-current={isActive(pathname, section.to) ? 'page' : undefined}
                  className={cn(
                    'flex flex-1 min-w-0 items-center gap-2 rounded-lg pl-2.5 pr-1 py-2 text-sm',
                    owns ? 'text-primary-700 font-semibold' : 'text-slate-600 group-hover:text-slate-900',
                  )}
                >
                  <span className="h-5 w-5 flex items-center justify-center text-[13px] shrink-0">{section.icon}</span>
                  <span className="truncate flex-1">{section.label}</span>
                  {typeof badge === 'number' && badge > 0 && (
                    <span className="text-[9px] font-bold text-white bg-health-critical rounded-full px-1 py-0.5 leading-none shrink-0 tabular-nums">
                      {badge}
                    </span>
                  )}
                </Link>

                {section.items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPinned(open ? '' : section.id)}
                    aria-expanded={open}
                    aria-label={`${open ? 'Hide' : 'Show'} ${section.label} pages`}
                    className={cn(
                      'shrink-0 px-1 py-2 text-[11px] text-slate-300 hover:text-slate-600 transition-transform',
                      !open && '-rotate-90',
                    )}
                  >
                    ▾
                  </button>
                )}
              </div>

              {/* Sub-pages — only for the section you are in (or pinned open) */}
              {open && section.items.length > 0 && (
                <div className="ml-5 mt-0.5 mb-1 pl-3 border-l border-slate-200 space-y-0.5">
                  {section.items.map((item) => {
                    const active = isActive(pathname, item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
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
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-200 shrink-0 px-4 py-3 space-y-3">
        <p className="text-[11px] text-slate-400">
          Viewing as <span className="font-semibold text-slate-600">{session.role.name}</span>
        </p>
        <div className="pt-3 border-t border-slate-100">
          <p className="text-[9px] uppercase tracking-wider text-slate-300 font-semibold mb-1.5">Powered by</p>
          <img src="/bcss-logo.png" alt="Blue Cloud Softech Solutions Ltd." className="w-full h-auto max-w-[172px]" />
        </div>
      </div>
    </aside>
  );
}
