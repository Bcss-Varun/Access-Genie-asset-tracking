'use client';

import { PageHeader, Badge } from '@/components/ui/primitives';

type Tag = 'New' | 'Improved' | 'Fixed';

const tagTone = (t: Tag): 'emerald' | 'primary' | 'amber' =>
  t === 'New' ? 'emerald' : t === 'Improved' ? 'primary' : 'amber';

interface Release {
  version: string;
  date: string;
  headline: string;
  changes: { tag: Tag; text: string }[];
}

const RELEASES: Release[] = [
  {
    version: 'v4.2',
    date: 'July 21, 2026',
    headline: 'Predictive maintenance, refreshed',
    changes: [
      { tag: 'New', text: 'AI-driven remaining-useful-life forecasts on the asset detail page.' },
      { tag: 'New', text: 'Personal access tokens with scoped permissions in Settings.' },
      { tag: 'Improved', text: 'Live map now renders 3× faster for facilities with 5,000+ tags.' },
      { tag: 'Fixed', text: 'Gateway firmware badges no longer flicker on status change.' },
    ],
  },
  {
    version: 'v4.1',
    date: 'June 30, 2026',
    headline: 'Notifications you actually control',
    changes: [
      { tag: 'New', text: 'Per-category email, push and in-app notification preferences.' },
      { tag: 'Improved', text: 'Digest emails are now bundled hourly, daily or weekly.' },
      { tag: 'Fixed', text: 'Duplicate PM reminder emails have been eliminated.' },
    ],
  },
  {
    version: 'v4.0',
    date: 'June 2, 2026',
    headline: 'The role-adaptive workspace',
    changes: [
      { tag: 'New', text: 'Role-adaptive sidebar that shows only the modules your role can enter.' },
      { tag: 'New', text: 'Scope tree switcher (Org ▸ Region ▸ Facility ▸ Zone) in the top bar.' },
      { tag: 'Improved', text: 'Redesigned executive dashboard with fresh KPI cards.' },
    ],
  },
  {
    version: 'v3.8',
    date: 'May 12, 2026',
    headline: 'Security hardening',
    changes: [
      { tag: 'New', text: 'Passkey support for passwordless sign-in.' },
      { tag: 'Improved', text: 'Active-session management with one-click revoke.' },
      { tag: 'Fixed', text: 'MFA recovery-code counter now updates immediately.' },
    ],
  },
];

export default function WhatsNewPage() {
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="What's New"
        subtitle="Release notes and product updates across Access Genie."
        breadcrumb={[{ label: 'Help', href: '/help' }, { label: "What's New" }]}
      />

      <div className="relative">
        {/* timeline spine */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200 sm:left-[calc(8rem+7px)]" aria-hidden />

        <div className="space-y-8">
          {RELEASES.map((r) => (
            <div key={r.version} className="relative flex flex-col sm:flex-row gap-4 sm:gap-6">
              {/* date rail */}
              <div className="sm:w-32 sm:text-right shrink-0 pl-6 sm:pl-0">
                <div className="text-sm font-bold font-heading text-slate-900">{r.version}</div>
                <div className="text-xs text-slate-400">{r.date}</div>
              </div>
              {/* node */}
              <div className="absolute left-0 top-1 sm:left-32 h-3.5 w-3.5 rounded-full border-2 border-white bg-primary-500 shadow" aria-hidden />
              {/* content */}
              <div className="glass-panel rounded-xl p-5 flex-1 ml-6 sm:ml-6">
                <h3 className="font-heading font-semibold text-slate-800 mb-3">{r.headline}</h3>
                <ul className="space-y-2.5">
                  {r.changes.map((c, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Badge tone={tagTone(c.tag)}>{c.tag}</Badge>
                      <span className="text-sm text-slate-600 leading-relaxed">{c.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
