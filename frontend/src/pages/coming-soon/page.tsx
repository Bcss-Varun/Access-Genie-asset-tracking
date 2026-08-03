import { useLocation } from 'react-router-dom';
import { ComingSoon } from '@/components/ui/ComingSoon';
import { allNavItems } from '@/lib/nav-config';

function titleCase(s: string): string {
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Catch-all for routes that are specced in the blueprint but not yet built.
 *
 * It resolves the path against the navigation so the page can name itself and
 * show where it sits, rather than dead-ending on a bare 404 — the nav lists
 * more destinations than the build has reached, and this is what keeps every
 * one of them honest about that.
 */
export default function ComingSoonPage() {
  const path = useLocation().pathname;

  const item =
    allNavItems.find((i) => i.to === path) ?? allNavItems.find((i) => path.startsWith(`${i.to}/`));

  const segments = path.split('/').filter(Boolean);
  const breadcrumb = item ? [{ label: item.group }, { label: item.label }] : undefined;

  let title = item?.label;
  if (!title) {
    const last = segments[segments.length - 1] ?? 'Page';
    title = segments[0] === 'dashboards' ? `${titleCase(last)} Dashboard` : titleCase(last);
  }

  return (
    <ComingSoon
      title={title}
      subtitle={`Route: ${path}`}
      blueprint="docs/06-page-catalog.md · docs/20-implementation-plan.md"
      breadcrumb={breadcrumb}
    />
  );
}
