import { useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/ui/primitives';
import { LinkButton } from '@/components/ui/Button';
import { allNavItems } from '@/lib/nav-config';

/**
 * Honest placeholder for routes that are specced in the blueprint (docs/06) but
 * not yet built, so navigation never dead-ends on a blank screen or a 404 that
 * looks like a bug.
 */
export function ComingSoon() {
  const { pathname } = useLocation();
  const known = allNavItems.find((item) => item.to === pathname);

  const title =
    known?.label ??
    pathname
      .split('/')
      .filter(Boolean)
      .pop()
      ?.split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ') ??
    'Page';

  return (
    <div className="space-y-6">
      <PageHeader title={title} breadcrumb={known?.group ? [{ label: known.group }, { label: title }] : undefined} />

      <div className="glass-panel p-10 text-center">
        <div className="text-4xl mb-3">🚧</div>
        <h2 className="font-heading text-lg font-semibold text-slate-800">This screen is next in the build</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
          The API, data model and design system behind it are in place — the interface itself is still being ported from
          the blueprint.
        </p>
        <p className="text-[11px] text-slate-400 mt-4 font-mono">{pathname}</p>
        <p className="text-[11px] text-slate-400 mt-1">Specified in docs/06-page-catalog.md · docs/20-implementation-plan.md</p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <LinkButton to="/" variant="secondary" size="sm">
            Back to workspace
          </LinkButton>
          <LinkButton to="/assets" size="sm">
            Open the asset registry
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="glass-panel p-10 text-center">
      <div className="text-4xl mb-3">🧭</div>
      <h1 className="font-heading text-lg font-semibold text-slate-800">No such page</h1>
      <p className="text-sm text-slate-500 mt-2">The link may be stale, or the address mistyped.</p>
      <div className="mt-6">
        <LinkButton to="/" size="sm">
          Back to workspace
        </LinkButton>
      </div>
    </div>
  );
}
