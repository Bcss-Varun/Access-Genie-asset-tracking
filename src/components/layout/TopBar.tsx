'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useScope } from '@/components/providers/ScopeProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { useCommand } from '@/components/providers/CommandProvider';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { useMobileNav } from '@/components/providers/MobileNavProvider';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { Avatar } from '@/components/ui/primitives';
import { flattenScope, mockUsers } from '@/lib/rbac';
import { mockInsights, mockAssets } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const levelLabel: Record<string, string> = {
  org: 'Organization', region: 'Region', facility: 'Facility', building: 'Building', floor: 'Floor', zone: 'Zone',
};

export function TopBar() {
  const { scope, scopeId, setScopeId } = useScope();
  const { session, setPersona } = useSession();
  const { setOpen } = useCommand();
  const { theme, toggle } = useTheme();
  const { toast } = useToast();
  const { toggle: toggleMobileNav } = useMobileNav();
  const router = useRouter();
  const [scanOpen, setScanOpen] = useState(false);
  const scopeList = flattenScope();
  const alertCount = mockInsights.filter((i) => i.severity === 'Critical').length;

  return (
    <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center gap-3 px-4 sticky top-0 z-40">
      {/* Mobile menu */}
      <button
        onClick={toggleMobileNav}
        className="md:hidden p-2 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100"
        aria-label="Open navigation"
      >
        ☰
      </button>

      {/* Scope switcher */}
      <Dropdown
        align="left"
        ariaLabel="Scope switcher"
        trigger={({ toggle: t, open }) => (
          <button
            onClick={t}
            className={cn(
              'flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 transition-colors',
              open && 'bg-slate-50',
            )}
          >
            <span className="text-slate-400">🌐</span>
            <span className="text-left leading-tight">
              <span className="block text-[10px] uppercase tracking-wide text-slate-400">{levelLabel[scope.level]}</span>
              <span className="block font-medium text-slate-800 max-w-[10rem] truncate">{scope.name}</span>
            </span>
            <span className="text-slate-300 text-xs">▾</span>
          </button>
        )}
        panelClassName="w-72 max-h-96 overflow-y-auto"
      >
        {({ close }) => (
          <>
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Scope</div>
            {scopeList.map(({ node, depth }) => (
              <button
                key={node.id}
                onClick={() => { setScopeId(node.id); close(); toast({ title: 'Scope changed', description: node.name, tone: 'info' }); }}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg py-1.5 pr-2 text-left text-sm hover:bg-slate-100 transition-colors',
                  scopeId === node.id ? 'text-primary-700 font-semibold' : 'text-slate-600',
                )}
                style={{ paddingLeft: `${0.75 + depth * 0.85}rem` }}
              >
                <span className="truncate">{node.name}</span>
                {typeof node.assetCount === 'number' && (
                  <span className="text-[10px] text-slate-400 shrink-0">{node.assetCount.toLocaleString()}</span>
                )}
              </button>
            ))}
          </>
        )}
      </Dropdown>

      {/* Center: Copilot search trigger */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 flex-1 max-w-md mx-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 hover:bg-slate-100 transition-colors"
      >
        <span>🔍</span>
        <span className="flex-1 text-left">Search or ask Copilot…</span>
        <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">⌘K</kbd>
      </button>

      <div className="flex items-center gap-1 ml-auto">
        {/* Scan QR / RFID */}
        <IconButton label="Scan QR / RFID" onClick={() => setScanOpen(true)}>📷</IconButton>

        {/* Alerts → Alert Center */}
        <button
          onClick={() => router.push('/alerts')}
          className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          aria-label={`Alerts — ${alertCount} critical`}
          title="Alert Center"
        >
          🔔
          {alertCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 flex items-center justify-center text-[9px] font-bold text-white bg-health-critical rounded-full">
              {alertCount}
            </span>
          )}
        </button>

        {/* Dark mode */}
        <IconButton label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} onClick={toggle}>
          {theme === 'light' ? '🌙' : '☀️'}
        </IconButton>

        {/* User / persona menu */}
        <Dropdown
          ariaLabel="Account menu"
          trigger={({ toggle: t }) => (
            <button onClick={t} className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100 transition-colors">
              <Avatar initials={session.user.initials} className="w-8 h-8 text-sm" />
              <span className="hidden lg:block text-left leading-tight">
                <span className="block text-sm font-medium text-slate-800 max-w-[9rem] truncate">{session.user.name}</span>
                <span className="block text-[11px] text-slate-400 max-w-[9rem] truncate">{session.role.name}</span>
              </span>
            </button>
          )}
          panelClassName="w-64"
        >
          {({ close }) => (
            <>
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <p className="text-sm font-semibold text-slate-800">{session.user.name}</p>
                <p className="text-xs text-slate-400">{session.user.email}</p>
              </div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Switch persona (demo)</div>
              {mockUsers.map((u) => (
                <MenuItem
                  key={u.id}
                  icon={session.user.id === u.id ? '✅' : '👤'}
                  onClick={() => { setPersona(u.roleId); close(); toast({ title: `Now viewing as ${u.name}`, description: u.title, tone: 'success' }); }}
                  className={session.user.id === u.id ? 'text-primary-700 font-medium' : ''}
                >
                  <span className="flex-1">{roles(u.roleId)}</span>
                </MenuItem>
              ))}
              <div className="my-1 border-t border-slate-100" />
              <MenuItem icon="⚙️" onClick={() => { close(); toast({ title: 'Settings', description: 'Settings hub is on the roadmap.', tone: 'info' }); }}>Settings</MenuItem>
              <MenuItem icon="↩️" onClick={() => { close(); router.push('/login'); }}>Sign out</MenuItem>
            </>
          )}
        </Dropdown>
      </div>

      {/* Scan dialog */}
      {scanOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Scan asset tag">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setScanOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">Scan asset tag</h3>
              <button onClick={() => setScanOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="p-5">
              <div className="relative mx-auto aspect-square w-56 rounded-xl bg-slate-900 overflow-hidden">
                <div className="absolute inset-6 rounded-lg border-2 border-white/70" />
                <div
                  className="absolute left-6 right-6 h-0.5 bg-primary-400 shadow-[0_0_8px_2px_rgba(129,140,248,0.7)]"
                  style={{ animation: 'scanline 2s ease-in-out infinite' }}
                />
                <span className="absolute bottom-3 inset-x-0 text-center text-[11px] text-white/70">Point at a QR / RFID tag</span>
              </div>
              <p className="mt-4 text-center text-xs text-slate-500">
                Live camera scanning is a mobile capability — use the demo below.
              </p>
              <button
                onClick={() => {
                  const a = mockAssets[0];
                  setScanOpen(false);
                  toast({ title: `Scanned ${a.id}`, description: a.name, tone: 'success' });
                  router.push(`/assets/${a.id}`);
                }}
                className="mt-4 w-full rounded-lg bg-primary-600 text-white py-2 text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                Simulate scan → open asset
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function roles(roleId: string): string {
  const u = mockUsers.find((x) => x.roleId === roleId);
  return u ? u.title.split(' — ')[0] : roleId;
}

function IconButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors">
      {children}
    </button>
  );
}
