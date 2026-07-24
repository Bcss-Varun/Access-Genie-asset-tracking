import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth, useSession } from '@/features/auth/AuthProvider';
import { notificationsApi } from '@/features/notifications/notifications-api';
import { Avatar, Kbd } from '@/components/ui/primitives';
import { cn } from '@/lib/format';
import { useTheme } from '@/app/ThemeProvider';

export function TopBar({ onOpenNav, onOpenPalette }: { onOpenNav: () => void; onOpenPalette: () => void }) {
  const session = useSession();
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    staleTime: 60_000,
  });
  const unread = notifications?.filter((n) => !n.read).length ?? 0;

  // Close the user menu on an outside click or Escape — a menu that traps the
  // pointer is the fastest way to make an app feel broken.
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="h-14 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur flex items-center gap-3 px-4">
      <button
        type="button"
        onClick={onOpenNav}
        className="md:hidden -ml-1 p-2 rounded-lg text-slate-500 hover:bg-slate-100"
        aria-label="Open navigation"
      >
        ☰
      </button>

      {/* Search — opens the command palette rather than being a second input */}
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex items-center gap-2 flex-1 max-w-md rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-100 transition-colors"
      >
        <span aria-hidden>🔍</span>
        <span className="flex-1 text-left truncate">Search assets, work orders, pages…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <div className="flex-1" />

      <button
        type="button"
        onClick={toggleTheme}
        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      <Link
        to="/notifications"
        className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        🔔
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-bold text-white bg-health-critical rounded-full">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>

      {/* User menu */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100 transition-colors"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <Avatar initials={session.user.initials} />
          <span className="hidden sm:block text-left leading-tight">
            <span className="block text-[13px] font-semibold text-slate-800">{session.user.name}</span>
            <span className="block text-[11px] text-slate-400">{session.role.name}</span>
          </span>
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1.5 w-64 glass-panel p-1.5 z-50 animate-[fadeIn_0.12s_ease-out]"
          >
            <div className="px-2.5 py-2 border-b border-slate-100 mb-1">
              <p className="text-sm font-semibold text-slate-800 truncate">{session.user.name}</p>
              <p className="text-[11px] text-slate-400 truncate">{session.user.email}</p>
              <p className="text-[11px] text-slate-500 mt-1 truncate">{session.user.title}</p>
            </div>

            <MenuLink to="/settings/profile" onNavigate={() => setMenuOpen(false)}>
              Profile & preferences
            </MenuLink>
            <MenuLink to="/settings/security" onNavigate={() => setMenuOpen(false)}>
              Change password
            </MenuLink>

            <button
              type="button"
              onClick={handleLogout}
              role="menuitem"
              className="w-full text-left px-2.5 py-2 rounded-md text-sm text-health-critical hover:bg-red-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function MenuLink({ to, onNavigate, children }: { to: string; onNavigate: () => void; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      role="menuitem"
      className={cn('block px-2.5 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors')}
    >
      {children}
    </Link>
  );
}
