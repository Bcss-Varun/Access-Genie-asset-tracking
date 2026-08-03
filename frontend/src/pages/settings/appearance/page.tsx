import { useState } from 'react';
import { PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

type Density = 'comfortable' | 'compact';

const ACCENTS: { id: string; label: string; hex: string }[] = [
  { id: 'sky', label: 'Sky', hex: '#4f46e5' },
  { id: 'indigo', label: 'Indigo', hex: '#4f46e5' },
  { id: 'emerald', label: 'Emerald', hex: '#059669' },
  { id: 'violet', label: 'Violet', hex: '#7c3aed' },
  { id: 'rose', label: 'Rose', hex: '#e11d48' },
  { id: 'amber', label: 'Amber', hex: '#d97706' },
];

export default function AppearanceSettingsPage() {
  const { theme, toggle } = useTheme();
  const { toast } = useToast();
  const [density, setDensity] = useState<Density>('comfortable');
  const [accent, setAccent] = useState('sky');

  const setTheme = (target: 'light' | 'dark') => {
    if (theme !== target) toggle();
  };

  const activeAccent = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0];

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Appearance"
        subtitle="Tune the look and feel of your workspace."
        breadcrumb={[{ label: 'Settings', href: '/settings/profile' }, { label: 'Appearance' }]}
      />

      <SettingsNav />

      {/* Theme */}
      <div className="glass-panel rounded-xl p-5 space-y-4">
        <div>
          <h3 className="font-heading font-semibold text-slate-800">Theme</h3>
          <p className="text-sm text-slate-500 mt-0.5">Choose a light or dark interface. Access Genie ships light by default.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          {(['light', 'dark'] as const).map((t) => {
            const active = theme === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={cn(
                  'rounded-xl border-2 p-3 text-left transition-colors',
                  active ? 'border-primary-500 ring-2 ring-primary-100' : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <div className={cn('h-20 rounded-lg mb-3 flex items-end p-2 gap-1', t === 'light' ? 'bg-slate-100' : 'bg-slate-800')}>
                  <span className={cn('h-2 w-8 rounded-full', t === 'light' ? 'bg-slate-300' : 'bg-slate-600')} />
                  <span className="h-2 w-5 rounded-full bg-primary-500" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800 capitalize">{t}</span>
                  {active && <span className="text-primary-600 text-sm font-semibold">✓ Active</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Density */}
      <div className="glass-panel rounded-xl p-5 space-y-4">
        <div>
          <h3 className="font-heading font-semibold text-slate-800">Density</h3>
          <p className="text-sm text-slate-500 mt-0.5">Control the vertical spacing of tables and lists.</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
          {(['comfortable', 'compact'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDensity(d)}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors',
                density === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Accent */}
      <div className="glass-panel rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-heading font-semibold text-slate-800">Accent color</h3>
            <p className="text-sm text-slate-500 mt-0.5">A preview only — the shipped demo uses the Sky palette.</p>
          </div>
          <Button variant="primary" onClick={() => toast({ title: 'Appearance saved', description: `Theme: ${theme}, density: ${density}, accent: ${activeAccent.label}.`, tone: 'success' })}>
            Save
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-label={a.label}
              onClick={() => setAccent(a.id)}
              className={cn('h-9 w-9 rounded-full transition-transform hover:scale-105', accent === a.id && 'ring-2 ring-offset-2 ring-slate-400')}
              style={{ backgroundColor: a.hex }}
            >
              {accent === a.id && <span className="text-white text-sm">✓</span>}
            </button>
          ))}
        </div>
        {/* Live preview */}
        <div className="rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <span className="inline-flex items-center justify-center h-10 w-10 rounded-full text-white font-bold" style={{ backgroundColor: activeAccent.hex }}>AG</span>
          <div className="flex-1">
            <div className="h-2.5 w-40 rounded-full mb-2" style={{ backgroundColor: activeAccent.hex }} />
            <div className="h-2 w-24 rounded-full bg-slate-200" />
          </div>
          <span className="rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: activeAccent.hex }}>Primary</span>
        </div>
      </div>
    </div>
  );
}
