import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth, useSession } from '@/features/auth/AuthProvider';
import { useScope } from '@/components/providers/ScopeProvider';
import { notificationsApi } from '@/features/notifications/notifications-api';
import { Avatar, Kbd } from '@/components/ui/primitives';
import { cn } from '@/lib/format';
import { useTheme } from '@/app/ThemeProvider';
import { flattenScope } from '@/lib/rbac';

const SCOPE_LEVEL_LABEL: Record<string, string> = {
  org: 'Organization',
  region: 'Region',
  facility: 'Facility',
  building: 'Building',
  floor: 'Floor',
  zone: 'Zone',
};

export function TopBar({ onOpenNav, onOpenPalette }: { onOpenNav: () => void; onOpenPalette: () => void }) {
  const session = useSession();
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const { scope, scopeId, setScopeId } = useScope();

  const [menuOpen, setMenuOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanQuery, setScanQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    staleTime: 60_000,
  });
  const unread = notifications?.filter((n) => !n.read).length ?? 0;

  // Close popovers on an outside click or Escape — a menu that traps the
  // pointer is the fastest way to make an app feel broken.
  useEffect(() => {
    if (!menuOpen && !scopeOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
      if (!scopeRef.current?.contains(event.target as Node)) setScopeOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      setScopeOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, scopeOpen]);

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

      {/* Scope switcher — Org ▸ Region ▸ Facility ▸ Building ▸ Zone */}
      <div className="relative shrink-0" ref={scopeRef}>
        <button
          type="button"
          onClick={() => setScopeOpen((open) => !open)}
          aria-haspopup="listbox"
          aria-expanded={scopeOpen}
          className={cn(
            'flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 transition-colors',
            scopeOpen && 'bg-slate-50',
          )}
        >
          <span className="text-slate-400" aria-hidden>🌐</span>
          <span className="text-left leading-tight">
            <span className="block text-[10px] uppercase tracking-wide text-slate-400">
              {SCOPE_LEVEL_LABEL[scope.level] ?? scope.level}
            </span>
            <span className="block font-medium text-slate-800 max-w-[10rem] truncate">{scope.name}</span>
          </span>
          <span className={cn('text-slate-300 transition-transform', scopeOpen && 'rotate-180')} aria-hidden>▾</span>
        </button>

        {scopeOpen && (
          <div role="listbox" className="absolute left-0 top-full mt-1.5 w-72 glass-panel p-1.5 z-50 max-h-96 overflow-y-auto animate-[fadeIn_0.12s_ease-out]">
            {flattenScope().map(({ node, depth }) => (
              <button
                key={node.id}
                type="button"
                role="option"
                aria-selected={node.id === scopeId}
                onClick={() => {
                  setScopeId(node.id);
                  setScopeOpen(false);
                }}
                className={cn(
                  'w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                  node.id === scopeId ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-slate-600 hover:bg-slate-100',
                )}
                style={{ paddingLeft: `${depth * 12 + 10}px` }}
              >
                <span className="truncate">{node.name}</span>
                {typeof node.assetCount === 'number' && (
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                    {node.assetCount.toLocaleString('en-IN')}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search — opens the command palette rather than being a second input */}
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex items-center gap-2 flex-1 max-w-md mx-auto rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-100 transition-colors"
      >
        <span aria-hidden>🔍</span>
        <span className="flex-1 text-left truncate">Search or ask Copilot…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <button
        type="button"
        onClick={() => setScanOpen(true)}
        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        aria-label="Scan QR / RFID tag"
        title="Scan QR / RFID tag"
      >
        📷
      </button>

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

      {/* Scan dialog — camera capture is a mobile capability, so on the web the
          action resolves against the registry instead of pretending to scan. */}
      {scanOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Scan asset tag">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setScanOpen(false)} />

          <div className="relative w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">Scan asset tag</h3>
              <button onClick={() => setScanOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            <div className="p-5">
              <div className="relative mx-auto aspect-square w-56 rounded-xl bg-slate-900 overflow-hidden">
                <div className="absolute inset-6 rounded-lg border-2 border-white/70" />
                <div
                  className="absolute left-6 right-6 h-0.5 bg-primary-400 shadow-[0_0_8px_2px_rgba(129,140,248,0.7)]"
                  style={{ animation: 'scanline 2s ease-in-out infinite' }}
                />
                <span className="absolute bottom-3 inset-x-0 text-center text-[11px] text-white/70">
                  Point at a QR / RFID tag
                </span>
              </div>

              <p className="mt-4 text-center text-xs text-slate-500">
                Live camera scanning is a mobile capability — enter a tag ID or asset ID to look it up.
              </p>

              <form
                className="mt-4 flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const query = scanQuery.trim();
                  if (!query) return;
                  setScanOpen(false);
                  setScanQuery('');
                  // The registry search matches asset IDs, serials and tag IDs.
                  navigate(`/assets?q=${encodeURIComponent(query)}`);
                }}
              >
                <input
                  value={scanQuery}
                  onChange={(e) => setScanQuery(e.target.value)}
                  placeholder="RFID-E28011606001"
                  aria-label="Tag or asset ID"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700 transition-colors"
                >
                  Look up
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
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
