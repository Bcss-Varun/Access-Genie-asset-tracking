import { Link } from 'react-router-dom';
import type { CategoryBreakdown } from '@access-genie/shared';
import { formatMoney } from '@/lib/format';

/**
 * Asset count by category as a horizontal bar list.
 *
 * One measure across named categories, so it wears **one hue**: the category
 * name is already the identity channel, and five different colours would encode
 * nothing the label does not. Every bar is directly labelled, so the chart needs
 * no legend and no axis.
 */
export function CategoryChart({ breakdown }: { breakdown: CategoryBreakdown[] }) {
  if (breakdown.length === 0) {
    return <p className="text-sm text-slate-400 py-12 text-center">No assets registered yet.</p>;
  }

  const max = Math.max(...breakdown.map((c) => c.count));

  return (
    <ul className="mt-4 space-y-3">
      {breakdown.map((category) => (
        <li key={category.category}>
          <Link
            to={`/assets?category=${encodeURIComponent(category.category)}`}
            className="block group rounded-md -mx-1 px-1 py-0.5 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="text-[13px] font-medium text-slate-700 truncate group-hover:text-primary-700">
                {category.category}
              </span>
              <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                <span className="font-semibold text-slate-600">{category.count}</span> · {formatMoney(category.value)}
              </span>
            </div>

            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary-600 transition-all"
                style={{ width: `${Math.max(4, (category.count / max) * 100)}%` }}
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
