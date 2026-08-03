import { useState } from 'react';
import { PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

const swatches = [
  { name: 'Genie Blue', value: '#2563eb' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Rose', value: '#e11d48' },
  { name: 'Amber', value: '#d97706' },
  { name: 'Slate', value: '#334155' },
];

export default function BrandingPage() {
  const { toast } = useToast();
  const [orgName, setOrgName] = useState('Bharat Infra Assets Pvt Ltd');
  const [color, setColor] = useState(swatches[0].value);
  const [subdomain, setSubdomain] = useState('bharatinfra');

  const initials = orgName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Branding & White-Label"
        subtitle="Customize the tenant's identity — colors, logo & vanity domain."
        breadcrumb={[{ label: 'Administration' }, { label: 'Branding' }]}
        actions={
          <Button
            onClick={() => toast({ title: 'Branding saved', description: `${orgName} theme applied across the tenant.`, tone: 'success' })}
          >
            Save Changes
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className="glass-panel space-y-5 rounded-xl p-6">
          <div>
            <label htmlFor="orgName" className="mb-1.5 block text-sm font-medium text-slate-700">
              Organization Name
            </label>
            <input
              id="orgName"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Primary Color</span>
            <div className="flex flex-wrap gap-2.5">
              {swatches.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-label={s.name}
                  aria-pressed={color === s.value}
                  onClick={() => setColor(s.value)}
                  className={cn(
                    'h-9 w-9 rounded-full ring-2 ring-offset-2 transition-transform hover:scale-105',
                    color === s.value ? 'ring-slate-800' : 'ring-transparent',
                  )}
                  style={{ backgroundColor: s.value }}
                />
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Logo</span>
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold text-white" style={{ backgroundColor: color }}>
                {initials || 'AG'}
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-600">PNG or SVG, up to 2 MB.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1.5"
                  onClick={() => toast({ title: 'Upload logo', description: 'File picker is a demo stub.', tone: 'info' })}
                >
                  Upload Logo
                </Button>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="subdomain" className="mb-1.5 block text-sm font-medium text-slate-700">
              Vanity Subdomain
            </label>
            <div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
              <input
                id="subdomain"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
                className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 text-sm text-slate-900 focus:outline-none"
              />
              <span className="px-3 py-2 text-sm text-slate-400">.accessgenie.in</span>
            </div>
          </div>
        </div>

        {/* Live Preview */}
        <div className="glass-panel rounded-xl p-6">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Live Preview</div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center gap-3 px-5 py-4 text-white" style={{ backgroundColor: color }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-base font-bold">
                {initials || 'AG'}
              </div>
              <div className="min-w-0">
                <div className="truncate font-heading text-lg font-bold">{orgName || 'Your Organization'}</div>
                <div className="truncate text-xs text-white/80">{subdomain || 'tenant'}.accessgenie.in</div>
              </div>
            </div>
            <div className="space-y-4 bg-white p-5">
              <div className="h-2 w-2/3 rounded-full bg-slate-200" />
              <div className="h-2 w-1/2 rounded-full bg-slate-100" />
              <div className="flex gap-2 pt-1">
                <span className="rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: color }}>
                  Primary Action
                </span>
                <span
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium"
                  style={{ borderColor: color, color }}
                >
                  Secondary
                </span>
              </div>
              <div className="flex items-center gap-2 pt-1 text-xs">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-slate-500">Accent, links & active states use your primary color.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
