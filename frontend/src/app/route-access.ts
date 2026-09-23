import type { ModuleKey } from '@access-genie/shared';

// Detail routes inherit their section's policy. Shared workflows accept any
// listed module, matching the API; personal pages and approvals are session-only.
const SECTION_MODULES: Record<string, readonly ModuleKey[]> = {
  assets: ['assets'], taxonomy: ['assets'], groups: ['assets'], kits: ['assets'],
  lifecycle: ['assets'], financials: ['assets'], depreciation: ['assets'], a: ['assets'],
  custody: ['assets', 'compliance'],
  tracking: ['tracking'], ai: ['ai'], 'ai-insights': ['ai'],
  maintenance: ['maintenance'], 'work-orders': ['maintenance'], predictive: ['maintenance'],
  pm: ['maintenance'], inspections: ['maintenance'],
  workforce: ['operations', 'maintenance'], 'workforce-reports': ['operations', 'maintenance'],
  scheduling: ['operations', 'maintenance'], 'my-work': ['maintenance', 'assets'],
  'asset-movement': ['operations', 'assets'], 'cycle-counts': ['compliance', 'maintenance'],
  audit: ['compliance', 'admin'], 'audit-log': ['compliance', 'admin'],
  'compliance-reports': ['compliance', 'admin'], certifications: ['compliance', 'maintenance'],
  analytics: ['analytics'], reports: ['analytics'],
  alerts: ['alerts'], 'alert-rules': ['alerts', 'compliance'],
  admin: ['admin'], copilot: ['workspace'],
};

export function requiredModules(pathname: string): readonly ModuleKey[] {
  // React Router matches paths case-insensitively and decodes URL segments.
  let path = pathname;
  try { path = decodeURIComponent(path); } catch { /* keep a malformed URL literal */ }
  path = path.toLowerCase();
  if (path === '/') return ['workspace'];
  if (path === '/admin/api-keys' || path.startsWith('/admin/api-keys/')) return ['admin', 'system'];
  return SECTION_MODULES[path.split('/')[1]] ?? [];
}

export function canAccessRoute(pathname: string, modules: readonly ModuleKey[]): boolean {
  const required = requiredModules(pathname);
  return required.length === 0 || required.some((module) => modules.includes(module));
}
