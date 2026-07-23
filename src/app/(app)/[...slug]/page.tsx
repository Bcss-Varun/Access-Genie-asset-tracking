import { ComingSoon } from '@/components/ui/ComingSoon';
import { allNavItems } from '@/lib/nav-config';

function titleCase(s: string): string {
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Catch-all for routes that are specced in the blueprint but not yet built in
 *  the demo. Renders an honest "coming soon" state so nav never dead-ends. */
export default async function ComingSoonCatchAll({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = '/' + (slug ?? []).join('/');

  const item = allNavItems.find((i) => i.href === path) ?? allNavItems.find((i) => path.startsWith(i.href + '/'));

  let title = item?.label;
  const breadcrumb = item ? [{ label: item.group }, { label: item.label }] : undefined;

  if (!title) {
    const last = slug?.[slug.length - 1] ?? 'Page';
    title = slug?.[0] === 'dashboards' ? `${titleCase(last)} Dashboard` : titleCase(last);
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
