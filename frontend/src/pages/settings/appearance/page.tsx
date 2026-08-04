import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { useTheme } from '@/components/providers/ThemeProvider';
import { cn } from '@/lib/utils';

/**
 * Appearance.
 *
 * The theme here is real and always was — it writes through to `/me/preferences`
 * and follows you to another machine. Nothing else on the page was: there is no
 * save button now because choosing a theme *is* the save.
 */
export default function AppearanceSettingsPage() {
  const { theme, toggle } = useTheme();

  const setTheme = (target: 'light' | 'dark') => {
    if (theme !== target) toggle();
  };

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

      {/*
        Density and accent controls used to live here. Neither did anything —
        density was never applied to a single table, and the accent swatches
        were labelled "a preview only". The organisation's colour is a real,
        stored setting, so this points at where it actually lives rather than
        offering a second copy that disagrees with it.
      */}
      <div className="glass-panel rounded-xl p-5">
        <h3 className="font-heading font-semibold text-slate-800">Colour</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          The accent colour is set for the whole organisation, not per person, so everyone sees the same product.
        </p>
        <Link to="/admin/branding" className="mt-3 inline-block">
          <Button variant="outline" size="sm">Open branding settings</Button>
        </Link>
      </div>

    </div>
  );
}
