/**
 * Port the Next.js prototype's screens into the Vite SPA.
 *
 * The prototype only uses three Next-specific things — next/link,
 * next/navigation and async route params — so the transform is mechanical.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from './next-to-router.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../..');
const SRC_APP = join(ROOT, 'src/app/(app)');
const OUT_PAGES = join(ROOT, 'client/src/pages');

// ── helpers ──────────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === 'page.tsx') out.push(full);
  }
  return out;
}

// ── route path from the Next directory layout ────────────────────────────────
function routeFor(file) {
  const rel = relative(SRC_APP, dirname(file));
  if (rel === '') return '/';
  return (
    '/' +
    rel
      .split('/')
      .map((seg) => (seg.startsWith('[...') ? '*' : seg.startsWith('[') ? `:${seg.slice(1, -1)}` : seg))
      .join('/')
  );
}

// ── run ──────────────────────────────────────────────────────────────────────
const files = walk(SRC_APP).sort();
const routes = [];

for (const file of files) {
  const route = routeFor(file);
  if (route.includes('*')) continue; // the SPA has its own catch-all

  const rel = relative(SRC_APP, file);
  const dest = join(OUT_PAGES, rel);
  mkdirSync(dirname(dest), { recursive: true });

  const code = transform(readFileSync(file, 'utf8'), { isPage: true });
  writeFileSync(dest, code, 'utf8');

  routes.push({ route, importPath: `@/pages/${rel.replace(/\.tsx$/, '')}` });
}

console.log(`ported ${routes.length} pages`);

/**
 * Paths owned by the API-backed screens declared in src/app/router.tsx.
 * They are excluded here so no path is registered twice — and so the live
 * version always wins, since a fixture-keyed page cannot show a record that
 * was created through the app.
 */
const API_BACKED = new Set([
  '/', '/assets', '/assets/new', '/assets/:id',
  '/maintenance', '/maintenance/new', '/maintenance/:id',
  '/alerts', '/alert-rules', '/tracking', '/sensors', '/geofences', '/gateways',
  '/ai-insights', '/admin/users', '/admin/roles', '/audit-log', '/custody',
  '/inventory', '/notifications',
]);

const ported = routes.filter((r) => !API_BACKED.has(r.route)).sort((a, b) => a.route.localeCompare(b.route));

const body = ported
  .map((r) => `  { path: '${r.route.replace(/^\//, '')}', lazy: async () => ({ Component: (await import('${r.importPath}')).default }) },`)
  .join('\n');

writeFileSync(
  join(ROOT, 'client/src/app/prototype-routes.tsx'),
  `import type { RouteObject } from 'react-router-dom';

/**
 * Screens ported from the Next.js prototype — GENERATED, do not hand-edit.
 * Regenerate with: node client/scripts/port-prototype.mjs
 *
 * Each route is code-split: React Router imports the module the first time the
 * route is visited, so ${ported.length} screens cost nothing until they are opened.
 *
 * These render the fixture dataset in src/lib/mock-data.ts. Routes backed by the
 * live API are declared in router.tsx and excluded from this list.
 */
export const prototypeRoutes: RouteObject[] = [
${body}
];
`,
  'utf8',
);

console.log(`wrote client/src/app/prototype-routes.tsx (${ported.length} lazy routes)`);
