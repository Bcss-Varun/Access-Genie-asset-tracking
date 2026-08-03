// Deterministic help-center content shared by the help index and article pages.

export interface HelpArticle {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  readMins: number;
}

export const helpCategories: { id: string; label: string; icon: string; description: string }[] = [
  { id: 'getting-started', label: 'Getting Started', icon: '🚀', description: 'Set up your workspace and invite your team.' },
  { id: 'assets', label: 'Assets & Tracking', icon: '📦', description: 'Register assets, tags and live location.' },
  { id: 'maintenance', label: 'Maintenance', icon: '🛠️', description: 'Work orders, PM schedules and inspections.' },
  { id: 'ai', label: 'AI & Insights', icon: '🤖', description: 'Forecasting, anomalies and explainability.' },
  { id: 'account', label: 'Account & Security', icon: '🔒', description: 'Profile, MFA, tokens and roles.' },
  { id: 'integrations', label: 'Integrations & API', icon: '🔌', description: 'Connect gateways, webhooks and the API.' },
];

export const helpArticles: HelpArticle[] = [
  { slug: 'getting-started-with-access-genie', title: 'Getting started with Access Genie', category: 'Getting Started', excerpt: 'A guided tour of the workspace, scope tree and role-adaptive navigation.', readMins: 4 },
  { slug: 'registering-your-first-asset', title: 'Registering your first asset', category: 'Assets & Tracking', excerpt: 'Create an asset record and capture its class-specific attributes.', readMins: 3 },
  { slug: 'understanding-the-scope-tree', title: 'Understanding the scope tree', category: 'Getting Started', excerpt: 'How Org ▸ Region ▸ Facility ▸ Zone scoping filters everything you see.', readMins: 5 },
  { slug: 'setting-up-rtls-tracking', title: 'Setting up RTLS tracking', category: 'Assets & Tracking', excerpt: 'Pair tags with gateways and interpret the live map.', readMins: 6 },
  { slug: 'creating-maintenance-work-orders', title: 'Creating maintenance work orders', category: 'Maintenance', excerpt: 'Schedule reactive and preventive maintenance in a few clicks.', readMins: 4 },
  { slug: 'reading-ai-anomaly-insights', title: 'Reading AI anomaly insights', category: 'AI & Insights', excerpt: 'Interpret anomaly scores and act on predictive findings.', readMins: 5 },
  { slug: 'managing-roles-and-permissions', title: 'Managing roles and permissions', category: 'Account & Security', excerpt: 'How roles map to modules and gate the pages a user can enter.', readMins: 4 },
  { slug: 'connecting-the-api', title: 'Connecting the API', category: 'Integrations & API', excerpt: 'Generate a personal access token and make your first request.', readMins: 3 },
];

export const articleBySlug = (slug: string): HelpArticle | undefined =>
  helpArticles.find((a) => a.slug === slug);

/** Turn any slug into a human title (fallback when it isn't a known article). */
export function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/** Deterministic body paragraphs derived from the article title. */
export function articleBody(title: string): string[] {
  return [
    `${title} is one of the most common tasks Access Genie customers ask about. This guide walks through the full workflow so you can complete it confidently and repeat it across your organization.`,
    'Before you begin, confirm that your active scope in the top bar points at the facility or zone you intend to work in. Access Genie filters every screen by the selected scope, so working from the wrong node is the single most frequent source of confusion.',
    'Follow the numbered steps in the interface panel. Each step is reversible until you commit, and the changes are held in your session only — nothing in this demo is persisted to a backend, so feel free to experiment.',
    'If you get stuck, the related articles below cover adjacent topics. You can also reach a human on the support page and open a ticket; our team typically responds within one business day.',
  ];
}
