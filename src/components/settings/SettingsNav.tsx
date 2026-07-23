'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const links: { href: string; label: string; icon: string }[] = [
  { href: '/settings/profile', label: 'Profile', icon: '👤' },
  { href: '/settings/security', label: 'Security', icon: '🔒' },
  { href: '/settings/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/settings/appearance', label: 'Appearance', icon: '🎨' },
  { href: '/settings/api-tokens', label: 'API Tokens', icon: '🔑' },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="glass-panel rounded-xl p-1.5 flex flex-wrap gap-1">
      {links.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <span className="text-base leading-none">{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
