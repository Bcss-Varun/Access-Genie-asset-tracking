// Help-centre content, served from the database and shared by the index and
// the article pages. `slug` is the article's id.

import { allHelpArticles, allHelpCategories } from '@/lib/dataset';
import type { HelpArticle } from '@access-genie/shared';

export const helpCategories = allHelpCategories;
export const helpArticles = allHelpArticles;
export const articleBySlug = (slug: string): HelpArticle | undefined =>
  helpArticles.find((a) => a.id === slug);

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
    'Follow the numbered steps in the interface panel. Each step is reversible until you commit; once you commit, the change is written to your organisation\'s record and visible to everyone else working in the same scope.',
    'If you get stuck, the related articles below cover adjacent topics. You can also reach a human on the support page and open a ticket; our team typically responds within one business day.',
  ];
}
